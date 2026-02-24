import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { addCourse, updateCourse, deleteCourse, skipCourseDate, unskipCourseDate, migrateCourseToTimeSlots } from '../db.js';
import { toInputDate, isTodayLectureDay, getActiveSemester, escapeHtml, escapeAttr } from '../utils.js';

let initialized = false;
let currentView = 'week';   // 'week' | 'day'
let selectedDayIdx = null;  // 0=Mon..4=Fri, null=auto (today)

const WEEKDAYS      = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const WEEKDAYS_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const COLORS = ['#3742fa', '#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#a55eea', '#ff6348', '#00ffd5'];

export function initPageUniTimetable() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-uni-timetable');

    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title">Stundenplan</span>
            <div class="page-header-actions">
                <button class="icon-btn" id="timetable-add-btn">
                    <span class="material-symbols-outlined">add</span>
                </button>
            </div>
        </div>
        <div class="px-5 mb-3 flex gap-2">
            <button class="tab-btn active" id="timetable-tab-week">Woche</button>
            <button class="tab-btn" id="timetable-tab-day">Tag</button>
        </div>
        <div id="timetable-day-nav" class="timetable-day-nav hidden"></div>
        <div class="px-5 flex-1 overflow-y-auto" id="timetable-content"></div>
    `;

    container.querySelector('#timetable-add-btn').addEventListener('click', openAddCourseModal);
    registerFabAction('timetable', openAddCourseModal);

    container.querySelector('#timetable-tab-week').addEventListener('click', () => {
        currentView = 'week';
        container.querySelector('#timetable-tab-week').classList.add('active');
        container.querySelector('#timetable-tab-day').classList.remove('active');
        container.querySelector('#timetable-day-nav').classList.add('hidden');
        render();
    });

    container.querySelector('#timetable-tab-day').addEventListener('click', () => {
        currentView = 'day';
        container.querySelector('#timetable-tab-day').classList.add('active');
        container.querySelector('#timetable-tab-week').classList.remove('active');
        container.querySelector('#timetable-day-nav').classList.remove('hidden');
        renderDayNav(container);
        render();
    });

    onStateChange(() => {
        if (!isActive()) return;
        // Auto-migrate courses on first load
        appState.allCourses.forEach(c => {
            if (!c.timeSlots || c.timeSlots.length === 0) {
                migrateCourseToTimeSlots(c.id, c);
            }
        });
        render();
    });
    onRouteChange((route) => {
        if (route === 'timetable') {
            selectedDayIdx = null;
            render();
        }
    });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'timetable'; }

function getTodayDayIdx() {
    const day = new Date().getDay();
    return day === 0 ? 4 : Math.min(day - 1, 4); // Sun→Fri, clamp to 0-4
}

function getEffectiveDayIdx() {
    return selectedDayIdx ?? getTodayDayIdx();
}

/** Returns a YYYY-MM-DD string for a given weekday index (Mon=0) of the current week */
function getDateStrForWeekday(weekdayIdx) {
    const today = new Date();
    const day = today.getDay(); // 0=Sun
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const target = new Date(monday);
    target.setDate(monday.getDate() + weekdayIdx);
    return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
}

function renderDayNav(container) {
    const nav = container.querySelector('#timetable-day-nav');
    const effectiveDay = getEffectiveDayIdx();
    nav.innerHTML = WEEKDAYS.map((d, i) => `
        <button class="timetable-day-btn ${i === effectiveDay ? 'active' : ''}" data-day="${i}">${d}</button>
    `).join('');

    nav.querySelectorAll('.timetable-day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedDayIdx = parseInt(btn.dataset.day);
            renderDayNav(container);
            render();
        });
    });

    // Touch swipe support
    let touchStartX = 0;
    nav.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    nav.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) < 40) return;
        const cur = getEffectiveDayIdx();
        if (dx < 0 && cur < 4) { selectedDayIdx = cur + 1; }
        else if (dx > 0 && cur > 0) { selectedDayIdx = cur - 1; }
        renderDayNav(container);
        render();
    }, { passive: true });
}

/** Get all slots (from courses + additional events) for a given weekday */
function getSlotsForDay(dayIdx) {
    const activeSemester = getActiveSemester(appState.allSemesters || []);
    if (!isTodayLectureDay(activeSemester)) return [];

    const items = [];

    appState.allCourses.forEach(course => {
        const slots = course.timeSlots && course.timeSlots.length > 0
            ? course.timeSlots
            : (course.weekdays || []).map(wd => ({ weekday: wd, startTime: course.startTime, endTime: course.endTime }));

        slots.filter(s => s.weekday === dayIdx).forEach(s => {
            items.push({ ...s, name: course.name, color: course.color, room: course.room, courseId: course.id, isExtra: false });
        });

        // Additional events (exercises)
        (course.additionalEvents || []).forEach(ev => {
            (ev.timeSlots || []).filter(s => s.weekday === dayIdx).forEach(s => {
                items.push({ ...s, name: ev.name, color: course.color + '99', room: ev.room, courseId: course.id, isExtra: true, extraType: ev.type });
            });
        });
    });

    return items.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}

function render() {
    const content = document.querySelector('#timetable-content');
    if (!content) return;

    if (currentView === 'week') {
        renderWeekView(content);
    } else {
        renderDayViewContent(content);
    }
}

function renderWeekView(content) {
    const courses = appState.allCourses;
    const activeSemester = getActiveSemester(appState.allSemesters || []);
    const isLecture = isTodayLectureDay(activeSemester);

    if (courses.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">calendar_view_week</span>
            <div class="empty-state-text">Noch keine Kurse</div>
        </div>`;
        return;
    }

    if (!isLecture) {
        content.innerHTML = `<div class="glass-sm p-4 text-center" style="color:var(--text-tertiary)">Vorlesungsfrei / Ferien</div>`;
        return;
    }

    const startHour = 8;
    const endHour = 20;
    const totalMinutes = (endHour - startHour) * 60;

    const timeToMin = (t) => {
        const [h, m] = (t || '08:00').split(':').map(Number);
        return h * 60 + m;
    };

    let html = `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <div style="min-width:520px;display:grid;grid-template-columns:44px repeat(5,1fr);position:relative">`;

    // Header
    html += '<div></div>';
    WEEKDAYS.forEach(d => {
        html += `<div style="text-align:center;font-size:12px;color:var(--text-tertiary);font-weight:500;padding:4px 0;border-bottom:1px solid var(--surface-border)">${d}</div>`;
    });

    // Grid rows
    for (let h = startHour; h < endHour; h++) {
        html += `<div style="height:60px;display:flex;align-items:flex-start;padding-top:2px">
            <span style="font-size:10px;color:var(--text-tertiary)">${String(h).padStart(2,'0')}:00</span>
        </div>`;
        for (let col = 0; col < 5; col++) {
            html += `<div style="height:60px;border-left:1px solid var(--surface-border);border-bottom:1px solid rgba(255,255,255,0.03)"></div>`;
        }
    }
    html += '</div>'; // grid

    // Overlay block layer
    html += `<div style="position:relative;height:${(endHour - startHour) * 60}px;min-width:520px;margin-left:44px;margin-top:-${(endHour - startHour) * 60}px">`;

    const renderBlocks = (items, col) => {
        items.forEach(item => {
            const top = ((timeToMin(item.startTime) - startHour * 60) / totalMinutes) * 100;
            const height = ((timeToMin(item.endTime) - timeToMin(item.startTime)) / totalMinutes) * 100;
            const left = (col / 5) * 100;
            const dateStr = getDateStrForWeekday(col);
            const skipped = (appState.allCourses.find(c => c.id === item.courseId)?.skippedDates || []).includes(dateStr + (item.isExtra ? `_extra` : ''));

            html += `<div class="timetable-block ${skipped ? 'skipped' : ''}" style="
                position:absolute;top:${top}%;left:${left}%;width:${100/5}%;height:${height}%;
                background:${item.color || '#3742fa'}22;border-left:3px solid ${item.color || '#3742fa'};
                border-radius:6px;padding:3px 5px;overflow:hidden;cursor:pointer;font-size:11px;box-sizing:border-box
            " data-course-id="${escapeAttr(item.courseId)}" data-date="${escapeAttr(dateStr)}" data-is-extra="${item.isExtra ? '1' : '0'}">
                <div style="font-weight:600;color:${item.color || '#3742fa'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.name)}</div>
                ${item.room ? `<div style="color:var(--text-tertiary);font-size:10px">${escapeHtml(item.room)}</div>` : ''}
                ${item.isExtra ? `<div style="color:var(--text-tertiary);font-size:10px">${escapeHtml(item.extraType || 'Übung')}</div>` : ''}
            </div>`;
        });
    };

    for (let col = 0; col < 5; col++) {
        renderBlocks(getSlotsForDay(col), col);
    }

    html += '</div></div>';
    content.innerHTML = html;

    // Wire long-press to skip
    content.querySelectorAll('.timetable-block').forEach(el => {
        wireLongPress(el, () => {
            const courseId = el.dataset.courseId;
            const dateStr = el.dataset.date;
            const course = appState.allCourses.find(c => c.id === courseId);
            if (!course) return;
            const skippedKey = dateStr;
            const alreadySkipped = (course.skippedDates || []).includes(skippedKey);
            if (alreadySkipped) {
                unskipCourseDate(courseId, skippedKey);
            } else {
                skipCourseDate(courseId, skippedKey);
            }
        });
    });
}

function renderDayViewContent(content) {
    const dayIdx = getEffectiveDayIdx();
    const slots = getSlotsForDay(dayIdx);
    const activeSemester = getActiveSemester(appState.allSemesters || []);

    let html = `<div style="font-size:16px;font-weight:600;margin-bottom:12px">${WEEKDAYS_FULL[dayIdx]}</div>`;

    if (!isTodayLectureDay(activeSemester)) {
        html += `<div class="glass-sm p-4 text-center" style="color:var(--text-tertiary)">Vorlesungsfrei / Ferien</div>`;
        content.innerHTML = html;
        return;
    }

    if (slots.length === 0) {
        html += `<div class="glass-sm p-4 text-center" style="color:var(--text-tertiary)">Keine Veranstaltungen heute</div>`;
        content.innerHTML = html;
        return;
    }

    const dateStr = getDateStrForWeekday(dayIdx);

    slots.forEach(item => {
        const course = appState.allCourses.find(c => c.id === item.courseId);
        const skipped = (course?.skippedDates || []).includes(dateStr);
        html += `<div class="glass-sm p-4 mb-3 timetable-day-card ${skipped ? 'skipped' : ''}" style="border-left:4px solid ${item.color || '#3742fa'}"
            data-course-id="${escapeAttr(item.courseId)}" data-date="${escapeAttr(dateStr)}">
            <div style="font-size:15px;font-weight:600;${skipped ? 'text-decoration:line-through;color:var(--text-tertiary)' : ''}">${escapeHtml(item.name)}</div>
            ${item.isExtra ? `<div style="font-size:11px;color:var(--accent);margin-top:2px">${escapeHtml(item.extraType || 'Übung')}</div>` : ''}
            <div class="flex items-center gap-4 mt-1" style="font-size:13px;color:var(--text-secondary)">
                <span>${item.startTime}–${item.endTime}</span>
                ${item.room ? `<span>${escapeHtml(item.room)}</span>` : ''}
            </div>
            ${skipped ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Übersprungen (diese Woche)</div>` : ''}
        </div>`;
    });

    content.innerHTML = html;

    // Wire long-press on day cards to skip
    content.querySelectorAll('.timetable-day-card').forEach(el => {
        wireLongPress(el, () => {
            const courseId = el.dataset.courseId;
            const dateStr = el.dataset.date;
            const course = appState.allCourses.find(c => c.id === courseId);
            if (!course) return;
            const alreadySkipped = (course.skippedDates || []).includes(dateStr);
            if (alreadySkipped) {
                unskipCourseDate(courseId, dateStr);
            } else {
                skipCourseDate(courseId, dateStr);
            }
        });
    });
}

/** Wire 3-second long-press */
function wireLongPress(el, onLongPress) {
    let timer = null;

    const start = () => {
        el.classList.add('long-press-active');
        timer = setTimeout(() => {
            el.classList.remove('long-press-active');
            onLongPress();
        }, 700); // 700ms for better UX
    };

    const cancel = () => {
        clearTimeout(timer);
        el.classList.remove('long-press-active');
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', cancel, { passive: true });
    el.addEventListener('touchcancel', cancel, { passive: true });
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', cancel);
    el.addEventListener('mouseleave', cancel);
}

// ===== Add Course Modal =====
function openAddCourseModal() {
    const existing = document.getElementById('course-add-modal');
    if (existing) existing.remove();

    let localSlots = [{ weekday: 0, startTime: '08:00', endTime: '09:30' }];

    const modal = document.createElement('div');
    modal.id = 'course-add-modal';
    modal.className = 'modal-overlay';

    function renderSlotRows() {
        return localSlots.map((s, i) => `
            <div class="flex gap-2 mb-2 items-center">
                <select class="glass-select" style="width:70px" data-field="weekday" data-idx="${i}">
                    ${WEEKDAYS.map((d, wi) => `<option value="${wi}" ${s.weekday === wi ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <input type="time" class="glass-input flex-1" value="${s.startTime}" data-field="startTime" data-idx="${i}">
                <input type="time" class="glass-input flex-1" value="${s.endTime}" data-field="endTime" data-idx="${i}">
                <button class="icon-btn remove-slot-btn" data-idx="${i}">
                    <span class="material-symbols-outlined" style="font-size:16px;color:var(--priority-1)">remove</span>
                </button>
            </div>`).join('');
    }

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neuer Kurs</h2>
            <input type="text" id="course-name" class="glass-input w-full mb-3" placeholder="Kursname">
            <input type="text" id="course-instructor" class="glass-input w-full mb-3" placeholder="Dozent">
            <input type="text" id="course-room" class="glass-input w-full mb-3" placeholder="Raum">
            <input type="number" id="course-credit-hours" class="glass-input w-full mb-3" placeholder="Leistungspunkte (LP)" step="1" min="0">
            <select id="course-semester" class="glass-select w-full mb-3">
                <option value="">Kein Semester</option>
                ${(appState.allSemesters || []).map(s => {
                    const active = getActiveSemester(appState.allSemesters);
                    return `<option value="${s.id}" ${s.id === active?.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`;
                }).join('')}
            </select>
            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Zeitslots</div>
            <div id="course-slots">${renderSlotRows()}</div>
            <button id="course-add-slot" class="btn-ghost w-full mb-3" style="font-size:13px">+ Zeitslot hinzufügen</button>
            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Farbe</div>
            <div class="flex gap-2 mb-4" id="course-colors">
                ${COLORS.map((c, i) => `<button class="color-btn ${i === 0 ? 'active' : ''}" data-color="${c}"
                    style="width:28px;height:28px;border-radius:50%;background:${c};border:2px solid ${i === 0 ? 'white' : 'transparent'}"></button>`).join('')}
            </div>
            <button id="course-save" class="btn-accent w-full">Hinzufügen</button>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    function rewireSlots() {
        modal.querySelector('#course-slots').innerHTML = renderSlotRows();
        modal.querySelectorAll('[data-field]').forEach(inp => {
            inp.addEventListener('change', () => {
                const idx = parseInt(inp.dataset.idx);
                const field = inp.dataset.field;
                if (field === 'weekday') {
                    localSlots[idx].weekday = parseInt(inp.value);
                } else {
                    localSlots[idx][field] = inp.value;
                }
            });
        });
        modal.querySelectorAll('.remove-slot-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                localSlots.splice(parseInt(btn.dataset.idx), 1);
                if (localSlots.length === 0) localSlots.push({ weekday: 0, startTime: '08:00', endTime: '09:30' });
                rewireSlots();
            });
        });
    }
    rewireSlots();

    modal.querySelector('#course-add-slot').addEventListener('click', () => {
        localSlots.push({ weekday: 0, startTime: '08:00', endTime: '09:30' });
        rewireSlots();
    });

    modal.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.color-btn').forEach(b => { b.style.borderColor = 'transparent'; b.classList.remove('active'); });
            btn.style.borderColor = 'white';
            btn.classList.add('active');
        });
    });

    modal.querySelector('#course-save').addEventListener('click', async () => {
        const name = modal.querySelector('#course-name').value.trim();
        if (!name) return;

        const activeColor = modal.querySelector('#course-colors .color-btn.active');

        await addCourse({
            name,
            instructor: modal.querySelector('#course-instructor').value.trim(),
            room: modal.querySelector('#course-room').value.trim(),
            creditHours: parseInt(modal.querySelector('#course-credit-hours').value) || 0,
            semesterId: modal.querySelector('#course-semester').value || null,
            color: activeColor ? activeColor.dataset.color : '#3742fa',
            timeSlots: localSlots,
            weekdays: localSlots.map(s => s.weekday),
            startTime: localSlots[0]?.startTime || '08:00',
            endTime: localSlots[0]?.endTime || '09:30'
        });
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#course-name').focus(), 100);
}
