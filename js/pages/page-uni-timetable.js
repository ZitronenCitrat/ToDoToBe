import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { addCourse, updateCourse, deleteCourse } from '../db.js';
import { isTodayLectureDay, escapeHtml } from '../utils.js';

let initialized = false;
let currentView = 'week'; // 'week' | 'day'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
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
            <button class="tab-btn" id="timetable-tab-day">Heute</button>
        </div>
        <div class="px-5 flex-1" id="timetable-content"></div>
    `;

    container.querySelector('#timetable-add-btn').addEventListener('click', openAddCourseModal);
    registerFabAction('timetable', openAddCourseModal);

    container.querySelector('#timetable-tab-week').addEventListener('click', () => {
        currentView = 'week';
        container.querySelector('#timetable-tab-week').classList.add('active');
        container.querySelector('#timetable-tab-day').classList.remove('active');
        render();
    });

    container.querySelector('#timetable-tab-day').addEventListener('click', () => {
        currentView = 'day';
        container.querySelector('#timetable-tab-day').classList.add('active');
        container.querySelector('#timetable-tab-week').classList.remove('active');
        render();
    });

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'timetable') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'timetable'; }

function timeToMinutes(time) {
    const [h, m] = (time || '08:00').split(':').map(Number);
    return h * 60 + m;
}

function render() {
    const content = document.querySelector('#timetable-content');
    if (!content) return;

    if (currentView === 'week') {
        renderWeekView(content);
    } else {
        renderDayView(content);
    }
}

function renderWeekView(content) {
    const courses = appState.allCourses;

    if (courses.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">calendar_view_week</span>
            <div class="empty-state-text">Noch keine Kurse</div>
        </div>`;
        return;
    }

    const startHour = 8;
    const endHour = 20;
    const totalMinutes = (endHour - startHour) * 60;

    let html = `<div class="timetable-grid" style="overflow-x:auto">
        <div class="timetable-inner" style="min-width:600px;display:grid;grid-template-columns:50px repeat(5, 1fr);gap:0;position:relative">`;

    // Header row
    html += '<div class="timetable-time-header"></div>';
    WEEKDAYS.forEach(d => {
        html += `<div class="timetable-day-header">${d}</div>`;
    });

    // Time column + grid lines
    for (let h = startHour; h < endHour; h++) {
        const top = ((h - startHour) * 60 / totalMinutes) * 100;
        html += `<div class="timetable-time-label" style="grid-column:1;position:relative;height:60px">
            <span style="font-size:11px;color:var(--text-tertiary)">${String(h).padStart(2,'0')}:00</span>
        </div>`;
        for (let col = 0; col < 5; col++) {
            html += `<div class="timetable-cell" style="grid-column:${col+2};height:60px;border-bottom:1px solid var(--surface-border)"></div>`;
        }
    }

    html += '</div></div>';

    // Overlay course blocks
    html += '<div class="timetable-blocks" style="position:relative;margin-top:-' + ((endHour - startHour) * 60 + 30) + 'px;min-width:600px;height:' + ((endHour - startHour) * 60) + 'px;margin-left:50px">';

    courses.forEach(course => {
        const weekdays = course.weekdays || [];
        const startMin = timeToMinutes(course.startTime) - startHour * 60;
        const endMin = timeToMinutes(course.endTime) - startHour * 60;
        const topPct = (startMin / totalMinutes) * 100;
        const heightPct = ((endMin - startMin) / totalMinutes) * 100;

        weekdays.forEach(day => {
            if (day > 4) return; // Only Mon-Fri
            const leftPct = (day / 5) * 100;
            html += `<div class="timetable-block" style="
                position:absolute;
                top:${topPct}%;
                left:${leftPct}%;
                width:${100/5}%;
                height:${heightPct}%;
                background:${course.color || '#3742fa'}22;
                border-left:3px solid ${course.color || '#3742fa'};
                border-radius:8px;
                padding:4px 6px;
                overflow:hidden;
                cursor:pointer;
                font-size:11px;
            " data-course-id="${course.id}">
                <div style="font-weight:600;color:${course.color || '#3742fa'}">${escapeHtml(course.name)}</div>
                <div style="color:var(--text-tertiary)">${escapeHtml(course.room || '')}</div>
            </div>`;
        });
    });

    html += '</div>';
    content.innerHTML = html;

    // Wire course click to delete/edit
    content.querySelectorAll('[data-course-id]').forEach(el => {
        el.addEventListener('click', () => {
            if (confirm(`Kurs "${appState.allCourses.find(c => c.id === el.dataset.courseId)?.name}" löschen?`)) {
                deleteCourse(el.dataset.courseId);
            }
        });
    });
}

function renderDayView(content) {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const activeSemester = (appState.allSemesters || []).find(s => s.isActive);
    const isLectureDay = isTodayLectureDay(activeSemester);
    const todayCourses = isLectureDay
        ? appState.allCourses
              .filter(c => (c.weekdays || []).includes(dayOfWeek))
              .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
        : [];

    let html = `<div style="font-size:16px;font-weight:600;margin-bottom:12px">${WEEKDAYS_FULL[dayOfWeek]}</div>`;

    if (todayCourses.length === 0) {
        const msg = !isLectureDay ? 'Vorlesungsfrei oder Ferien' : 'Keine Kurse heute';
        html += `<div class="glass-sm p-4" style="text-align:center;color:var(--text-tertiary)">${msg}</div>`;
    } else {
        todayCourses.forEach(c => {
            html += `<div class="glass-sm p-4 mb-3" style="border-left:4px solid ${c.color || '#3742fa'}">
                <div style="font-size:15px;font-weight:600">${escapeHtml(c.name)}</div>
                <div class="flex items-center gap-4 mt-1" style="font-size:13px;color:var(--text-secondary)">
                    <span>${c.startTime}–${c.endTime}</span>
                    <span>${escapeHtml(c.room || '')}</span>
                    <span>${escapeHtml(c.instructor || '')}</span>
                </div>
            </div>`;
        });
    }

    content.innerHTML = html;
}

function openAddCourseModal() {
    const existing = document.getElementById('course-add-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'course-add-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neuer Kurs</h2>
            <input type="text" id="course-name" class="glass-input w-full mb-3" placeholder="Kursname">
            <input type="text" id="course-instructor" class="glass-input w-full mb-3" placeholder="Dozent">
            <input type="text" id="course-room" class="glass-input w-full mb-3" placeholder="Raum">
            <div class="flex gap-2 mb-3">
                <input type="time" id="course-start" class="glass-input flex-1" value="08:00">
                <input type="time" id="course-end" class="glass-input flex-1" value="09:30">
            </div>
            <div class="mb-3">
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Wochentage</div>
                <div class="flex gap-1" id="course-weekdays">
                    ${WEEKDAYS.map((d, i) => `<button class="weekday-btn" data-day="${i}">${d}</button>`).join('')}
                </div>
            </div>
            <select id="course-semester" class="glass-select w-full mb-3">
                <option value="">Kein Semester</option>
                ${(appState.allSemesters || []).map(s => `<option value="${s.id}" ${s.isActive ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
            <input type="number" id="course-credit-hours" class="glass-input w-full mb-3" placeholder="Leistungspunkte (LP)" step="1" min="0">
            <div class="mb-4">
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Farbe</div>
                <div class="flex gap-2" id="course-colors">
                    ${COLORS.map((c, i) => `<button class="color-btn ${i === 0 ? 'active' : ''}" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};border:2px solid transparent"></button>`).join('')}
                </div>
            </div>
            <button id="course-save" class="btn-accent w-full">Hinzufügen</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelectorAll('.weekday-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    modal.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.color-btn').forEach(b => { b.style.borderColor = 'transparent'; b.classList.remove('active'); });
            btn.style.borderColor = 'white';
            btn.classList.add('active');
        });
    });
    // Set initial border
    const firstColor = modal.querySelector('.color-btn.active');
    if (firstColor) firstColor.style.borderColor = 'white';

    modal.querySelector('#course-save').addEventListener('click', async () => {
        const name = modal.querySelector('#course-name').value.trim();
        if (!name) return;

        const weekdays = [];
        modal.querySelectorAll('#course-weekdays .weekday-btn.active').forEach(b => weekdays.push(parseInt(b.dataset.day)));

        const activeColor = modal.querySelector('#course-colors .color-btn.active');

        await addCourse({
            name,
            instructor: modal.querySelector('#course-instructor').value.trim(),
            room: modal.querySelector('#course-room').value.trim(),
            startTime: modal.querySelector('#course-start').value,
            endTime: modal.querySelector('#course-end').value,
            weekdays,
            color: activeColor ? activeColor.dataset.color : '#3742fa',
            creditHours: parseInt(modal.querySelector('#course-credit-hours').value) || 0,
            semesterId: modal.querySelector('#course-semester').value || null
        });
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#course-name').focus(), 100);
}
