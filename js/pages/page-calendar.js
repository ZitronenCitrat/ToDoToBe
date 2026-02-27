import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { createTodoElement } from '../todo-item.js';
import {
    getWeekdayShort, formatMonthYear, getDaysInMonth,
    getFirstDayOfWeek, isSameDay, toDate, startOfDay, escapeHtml, escapeAttr,
    getActiveSemester, isTodayLectureDay, toInputDate, isTodoActiveOnDate
} from '../utils.js';
import { addEvent, updateEvent, deleteEvent } from '../db.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = startOfDay(new Date());
let calFilter = 'all'; // 'all' | 'todos' | 'uni' | 'wishes' | 'personal'
let initialized = false;

export function initPageCalendar() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-calendar');

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-header-title">Kalender</h1>
            <div class="page-header-actions">
                <button class="icon-btn" id="cal-today-btn" title="Heute">
                    <span class="material-symbols-outlined">today</span>
                </button>
            </div>
        </div>
        <div class="px-5">
            <div class="glass p-4 mb-4">
                <div class="flex items-center justify-between mb-4">
                    <button class="icon-btn" id="cal-prev" style="width:36px;height:36px">
                        <span class="material-symbols-outlined">chevron_left</span>
                    </button>
                    <span id="cal-month-label" style="font-size:16px;font-weight:600"></span>
                    <button class="icon-btn" id="cal-next" style="width:36px;height:36px">
                        <span class="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
                <div class="grid grid-cols-7 gap-1 mb-2" id="cal-weekdays"></div>
                <div class="grid grid-cols-7 gap-1" id="cal-grid"></div>
            </div>
            <div class="mb-3">
                <div class="flex gap-2 mb-3" id="cal-filter-tabs" style="flex-wrap:wrap">
                    <button class="tab-btn active" data-filter="all">Alles</button>
                    <button class="tab-btn" data-filter="todos">Todos</button>
                    <button class="tab-btn" data-filter="uni">Uni</button>
                    <button class="tab-btn" data-filter="wishes">Wünsche</button>
                    <button class="tab-btn" data-filter="personal">Persönlich</button>
                </div>
                <h2 id="cal-day-label" style="font-size:16px;font-weight:600;margin-bottom:12px"></h2>
                <div id="cal-day-items"></div>
            </div>
        </div>
    `;

    // Weekday headers
    const weekdaysEl = container.querySelector('#cal-weekdays');
    getWeekdayShort().forEach(day => {
        const cell = document.createElement('div');
        cell.style.cssText = 'text-align:center;font-size:12px;color:var(--text-tertiary);font-weight:500;padding:4px 0';
        cell.textContent = day;
        weekdaysEl.appendChild(cell);
    });

    // Nav buttons
    container.querySelector('#cal-prev').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        renderCalendar();
    });
    container.querySelector('#cal-next').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        renderCalendar();
    });
    container.querySelector('#cal-today-btn').addEventListener('click', () => {
        currentYear = new Date().getFullYear();
        currentMonth = new Date().getMonth();
        selectedDate = startOfDay(new Date());
        renderCalendar();
    });
    // Filter tabs
    container.querySelector('#cal-filter-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (!btn) return;
        calFilter = btn.dataset.filter;
        container.querySelectorAll('#cal-filter-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderDayItems();
    });

    onStateChange(() => {
        if (window.location.hash.slice(1).split('/')[0] === 'calendar') renderCalendar();
    });

    onRouteChange((route) => {
        if (route === 'calendar') {
            currentYear = new Date().getFullYear();
            currentMonth = new Date().getMonth();
            selectedDate = startOfDay(new Date());
            renderCalendar();
        }
    });

    // Register FAB: add event for the selected date (pre-fills "Persönlich" when that filter is active)
    registerFabAction('calendar', () => {
        const defaultCategory = calFilter === 'personal' ? 'Persönlich' : null;
        openAddEventModal(selectedDate, null, defaultCategory);
    });

    renderCalendar();
}

// ----- helpers -----

function getCourseSlotsForDate(date) {
    const semester = getActiveSemester(appState.allSemesters);
    if (!isTodayLectureDay(semester, date)) return [];

    // Convert JS weekday (0=Sun) to Mon-based index (Mon=0 ... Sun=6)
    const jsDay = date.getDay();
    const weekdayIdx = jsDay === 0 ? 6 : jsDay - 1;

    const slots = [];
    appState.allCourses.forEach(course => {
        (course.timeSlots || []).forEach(slot => {
            if (slot.weekday === weekdayIdx) {
                slots.push({ course, slot, type: 'course' });
            }
        });
        (course.additionalEvents || []).forEach(extra => {
            (extra.timeSlots || []).forEach(slot => {
                if (slot.weekday === weekdayIdx) {
                    slots.push({ course, slot, extra, type: 'extra' });
                }
            });
        });
    });

    // Sort by start time
    slots.sort((a, b) => (a.slot.startTime || '').localeCompare(b.slot.startTime || ''));
    return slots;
}

function buildItemsByDay() {
    const todosByDay = {};
    const examsByDay = {};
    const assignmentsByDay = {};
    const wishesByDay = {};
    const eventsByDay = {};

    appState.allTodos.forEach(t => {
        if (!t.dueDate) return;
        const d = toDate(t.dueDate);
        if (!d) return;
        const key = startOfDay(d).toISOString();
        (todosByDay[key] = todosByDay[key] || []).push(t);
    });

    // Recurring todos with showInCalendar: inject into TODAY's bucket only (never future/past)
    const todayKey = startOfDay(new Date()).toISOString();
    appState.allTodos.forEach(t => {
        if (!t.recurrence || !t.showInCalendar) return;
        if (!isTodoActiveOnDate(t, new Date())) return;
        // Avoid duplicate if dueDate already placed it on today
        const bucket = todosByDay[todayKey] = todosByDay[todayKey] || [];
        if (!bucket.find(x => x.id === t.id)) bucket.push(t);
    });

    appState.allExams.forEach(e => {
        if (!e.date) return;
        const d = toDate(e.date);
        if (!d) return;
        const key = startOfDay(d).toISOString();
        (examsByDay[key] = examsByDay[key] || []).push(e);
    });

    appState.allAssignments.forEach(a => {
        if (!a.dueDate) return;
        const d = toDate(a.dueDate);
        if (!d) return;
        const key = startOfDay(d).toISOString();
        (assignmentsByDay[key] = assignmentsByDay[key] || []).push(a);
    });

    appState.allWishlistItems.forEach(w => {
        if (!w.date) return;
        let d;
        if (typeof w.date === 'string') {
            d = new Date(w.date + 'T00:00:00');
        } else {
            d = toDate(w.date);
        }
        if (!d || isNaN(d)) return;
        const key = startOfDay(d).toISOString();
        (wishesByDay[key] = wishesByDay[key] || []).push(w);
    });

    appState.allEvents.forEach(ev => {
        if (!ev.date) return;
        let d;
        if (typeof ev.date === 'string') {
            d = new Date(ev.date + 'T00:00:00');
        } else {
            d = toDate(ev.date);
        }
        if (!d || isNaN(d)) return;
        const key = startOfDay(d).toISOString();
        (eventsByDay[key] = eventsByDay[key] || []).push(ev);
    });

    return { todosByDay, examsByDay, assignmentsByDay, wishesByDay, eventsByDay };
}

function renderCalendar() {
    const container = document.getElementById('page-calendar');
    if (!container) return;

    container.querySelector('#cal-month-label').textContent = formatMonthYear(new Date(currentYear, currentMonth, 1));

    const grid = container.querySelector('#cal-grid');
    grid.innerHTML = '';

    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfWeek(currentYear, currentMonth);
    const today = startOfDay(new Date());
    const { todosByDay, examsByDay, assignmentsByDay, wishesByDay, eventsByDay } = buildItemsByDay();

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement('div');
        cell.style.cssText = 'aspect-ratio:1;border-radius:12px';
        grid.appendChild(cell);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const cellDate = new Date(currentYear, currentMonth, day);
        const cellStart = startOfDay(cellDate);
        const key = cellStart.toISOString();

        const todos = todosByDay[key] || [];
        const exams = examsByDay[key] || [];
        const assignments = assignmentsByDay[key] || [];
        const wishes = wishesByDay[key] || [];
        const events = eventsByDay[key] || [];
        const courseSlots = getCourseSlotsForDate(cellDate);

        const isSelected = isSameDay(cellStart, selectedDate);
        const isCurrentDay = isSameDay(cellStart, today);
        const hasActiveTodos = todos.some(t => !t.completed);
        const hasExams = exams.length > 0;
        const hasAssignments = assignments.some(a => !a.completed);
        const hasLecture = courseSlots.length > 0;
        const hasWishes = wishes.length > 0;
        const hasEvents = events.length > 0;

        const cell = document.createElement('button');
        cell.style.cssText = `
            aspect-ratio:1;border-radius:12px;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:2px;border:none;
            font-size:14px;font-weight:${isCurrentDay ? '700' : '400'};cursor:pointer;
            position:relative;transition:all 0.15s;
            background:${isSelected ? 'var(--accent)' : 'transparent'};
            color:${isSelected ? '#080603' : isCurrentDay ? 'var(--accent)' : 'var(--text)'};
            ${isSelected ? 'box-shadow:0 0 16px var(--accent-glow);' : ''}
        `;
        cell.textContent = day;

        // Color dots for categories
        if (!isSelected) {
            const dotConfigs = [
                { show: hasActiveTodos, color: 'var(--accent)' },
                { show: hasExams, color: '#ef4444' },
                { show: hasAssignments, color: '#f97316' },
                { show: hasLecture, color: '#3b82f6' },
                { show: hasWishes, color: '#a855f7' },
                { show: hasEvents, color: '#22c55e' },
            ].filter(c => c.show);

            if (dotConfigs.length > 0) {
                const dots = document.createElement('div');
                dots.style.cssText = 'display:flex;gap:2px;position:absolute;bottom:3px';
                dotConfigs.forEach(({ color }) => {
                    const d = document.createElement('div');
                    d.style.cssText = `width:4px;height:4px;border-radius:50%;background:${color}`;
                    dots.appendChild(d);
                });
                cell.appendChild(dots);
            }
        }

        cell.addEventListener('click', () => {
            selectedDate = cellStart;
            renderCalendar();
        });

        grid.appendChild(cell);
    }

    // Day label
    const dayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    container.querySelector('#cal-day-label').textContent = dayFormatter.format(selectedDate);

    renderDayItems();
}

function renderDayItems() {
    const container = document.getElementById('page-calendar');
    if (!container) return;
    const dayItems = container.querySelector('#cal-day-items');
    if (!dayItems) return;

    const { todosByDay, examsByDay, assignmentsByDay, wishesByDay, eventsByDay } = buildItemsByDay();
    const key = startOfDay(selectedDate).toISOString();

    const todos = todosByDay[key] || [];
    const exams = examsByDay[key] || [];
    const assignments = assignmentsByDay[key] || [];
    const wishes = wishesByDay[key] || [];
    const events = eventsByDay[key] || [];
    const courseSlots = (['all', 'uni'].includes(calFilter)) ? getCourseSlotsForDate(selectedDate) : [];

    dayItems.innerHTML = '';
    let hasContent = false;

    function sectionLabel(text, color) {
        const label = document.createElement('div');
        label.style.cssText = `font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;margin-top:8px`;
        label.textContent = text;
        dayItems.appendChild(label);
    }

    // --- Todos ---
    if (calFilter !== 'uni' && calFilter !== 'wishes' && todos.length > 0) {
        hasContent = true;
        if (calFilter === 'all') sectionLabel('Todos', 'var(--accent)');
        todos.forEach(todo => {
            const listInfo = appState.allLists.find(l => l.id === todo.listId);
            const el = createTodoElement(todo, {
                showListTag: true,
                listName: listInfo?.name || '',
                listColor: listInfo?.color || ''
            });
            el.addEventListener('click', () => navigate('task', { id: todo.id }));
            dayItems.appendChild(el);
        });
    }

    // --- Uni: timetable slots + exams + assignments ---
    const showUni = calFilter === 'all' || calFilter === 'uni';
    const openAssignments = assignments.filter(a => !a.completed);

    if (showUni && (courseSlots.length > 0 || exams.length > 0 || openAssignments.length > 0)) {
        hasContent = true;
        if (calFilter === 'all') sectionLabel('Uni', '#3b82f6');

        // Timetable blocks (course slots for this day)
        courseSlots.forEach(({ course, slot, extra, type }) => {
            const dateStr = toInputDate(selectedDate);
            const isSkipped = (course.skippedDates || []).includes(dateStr);
            const color = course.color || '#3742fa';
            const timeStr = (slot.startTime && slot.endTime) ? `${slot.startTime}–${slot.endTime}` : '';
            const name = type === 'extra'
                ? `${escapeHtml(extra.name || 'Übung')} (${escapeHtml(course.name)})`
                : escapeHtml(course.name);
            const typeLabel = type === 'extra' ? escapeHtml(extra.type || 'Übung') : 'Vorlesung';
            const icon = type === 'extra' ? 'group_work' : 'school';

            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = `border-left:3px solid ${color};${isSkipped ? 'opacity:0.3;' : ''}`;
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:${color};flex-shrink:0">${icon}</span>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500">${name}</div>
                    <div style="font-size:11px;color:var(--text-tertiary)">${typeLabel}${timeStr ? ' · ' + timeStr : ''}${course.room ? ' · ' + escapeHtml(course.room) : ''}${isSkipped ? ' · <span style="color:#ef4444">ausgefallen</span>' : ''}</div>
                </div>
            `;
            dayItems.appendChild(card);
        });

        // Exams
        exams.forEach(exam => {
            const course = appState.allCourses.find(c => c.id === exam.courseId);
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = 'border-left:3px solid #ef4444';
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:#ef4444;flex-shrink:0">quiz</span>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(exam.title)}</div>
                    <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(course?.name || '')} · Klausur${exam.room ? ' · ' + escapeHtml(exam.room) : ''}${exam.time ? ' · ' + exam.time : ''}</div>
                </div>
                ${exam.grade != null ? `<span style="font-size:13px;font-weight:600;color:${exam.grade <= 4 ? 'var(--accent)' : '#ef4444'}">${exam.grade.toFixed(1)}</span>` : ''}
            `;
            dayItems.appendChild(card);
        });

        // Open assignments
        openAssignments.forEach(a => {
            const course = appState.allCourses.find(c => c.id === a.courseId);
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = 'border-left:3px solid #f97316';
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:#f97316;flex-shrink:0">assignment</span>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(a.title)}</div>
                    <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(course?.name || '')} · Aufgabe</div>
                </div>
            `;
            dayItems.appendChild(card);
        });
    }

    // --- Termine / Events ---
    const visibleEvents = calFilter === 'personal'
        ? events.filter(ev => ev.category === 'Persönlich')
        : events;
    if ((calFilter === 'all' || calFilter === 'personal') && visibleEvents.length > 0) {
        hasContent = true;
        if (calFilter === 'all') sectionLabel('Termine', '#22c55e');
        visibleEvents.forEach(ev => {
            const timeRange = ev.time
                ? (ev.endTime ? `${ev.time}–${ev.endTime}` : ev.time)
                : '';
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = 'border-left:3px solid #22c55e';
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:#22c55e;flex-shrink:0">event</span>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(ev.title)}</div>
                    <div style="font-size:11px;color:var(--text-tertiary)">${timeRange ? escapeHtml(timeRange) : ''}${timeRange && ev.category ? ' · ' : ''}${ev.category ? escapeHtml(ev.category) : ''}</div>
                </div>
                <button class="icon-btn event-edit-btn" data-id="${escapeAttr(ev.id)}" style="width:28px;height:28px;flex-shrink:0">
                    <span class="material-symbols-outlined" style="font-size:15px">edit</span>
                </button>
            `;
            dayItems.appendChild(card);
        });
    }

    // --- Wünsche ---
    if ((calFilter === 'all' || calFilter === 'wishes') && wishes.length > 0) {
        hasContent = true;
        if (calFilter === 'all') sectionLabel('Wünsche', '#a855f7');
        wishes.forEach(w => {
            const nutzen = w.nutzen || 0;
            const stars = '★'.repeat(nutzen) + '☆'.repeat(Math.max(0, 5 - nutzen));
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = 'border-left:3px solid #a855f7';
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:#a855f7;flex-shrink:0">star</span>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(w.name || w.title || '')}</div>
                    <div style="font-size:11px;color:#a855f7;letter-spacing:2px">${stars}</div>
                </div>
                ${w.price != null ? `<span style="font-size:12px;color:var(--text-tertiary);flex-shrink:0">${w.price.toFixed(2)} €</span>` : ''}
            `;
            dayItems.appendChild(card);
        });
    }

    // Wire event edit buttons
    dayItems.querySelectorAll('.event-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ev = appState.allEvents.find(ev => ev.id === btn.dataset.id);
            if (ev) openAddEventModal(selectedDate, ev);
        });
    });

    if (!hasContent) {
        dayItems.innerHTML = `
            <div style="text-align:center;padding:24px;color:var(--text-tertiary);font-size:14px">
                Nichts an diesem Tag
            </div>`;
    }
}

// ----- Add / Edit Event Modal -----

const EVENT_CATEGORIES = ['Uni', 'Wünsche', 'Todos', 'Persönlich', 'Arbeit', 'Sonstiges'];

function openAddEventModal(defaultDate, existing = null, defaultCategory = null) {
    const old = document.getElementById('event-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'event-modal';
    modal.className = 'modal-overlay';

    const dateStr = existing
        ? (typeof existing.date === 'string' ? existing.date : toInputDate(toDate(existing.date)) || '')
        : toInputDate(defaultDate);

    // Determine which category option should be pre-selected
    const selectedCat = existing?.category ?? defaultCategory ?? '';

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">${existing ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
            <input type="text" id="event-title" class="glass-input w-full mb-3"
                placeholder="Titel" value="${existing ? escapeAttr(existing.title || '') : ''}">
            <div class="flex gap-2 mb-3">
                <div style="flex:1.3">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Datum</div>
                    <input type="date" id="event-date" class="glass-input w-full" value="${dateStr || ''}">
                </div>
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Von</div>
                    <input type="time" id="event-time" class="glass-input w-full" value="${existing?.time || ''}">
                </div>
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Bis</div>
                    <input type="time" id="event-end-time" class="glass-input w-full" value="${existing?.endTime || ''}">
                </div>
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Kategorie</div>
            <select id="event-category" class="glass-select w-full mb-3">
                <option value="" ${selectedCat === '' ? 'selected' : ''}>Keine Kategorie</option>
                ${EVENT_CATEGORIES.map(c => `<option value="${escapeAttr(c)}" ${selectedCat === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Wiederholung</div>
            <select id="event-recurrence" class="glass-select w-full mb-4">
                <option value="">Einmalig</option>
                <option value="weekly" ${existing?.recurrence === 'weekly' ? 'selected' : ''}>Wöchentlich</option>
                <option value="monthly" ${existing?.recurrence === 'monthly' ? 'selected' : ''}>Monatlich</option>
            </select>
            <div class="flex gap-2">
                <button id="event-save" class="btn-accent flex-1">${existing ? 'Speichern' : 'Hinzufügen'}</button>
                ${existing ? '<button id="event-delete" class="btn-ghost flex-1" style="color:#ef4444">Löschen</button>' : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#event-save').addEventListener('click', async () => {
        const title = modal.querySelector('#event-title').value.trim();
        if (!title) return;
        const data = {
            title,
            date: modal.querySelector('#event-date').value || null,
            time: modal.querySelector('#event-time').value || null,
            endTime: modal.querySelector('#event-end-time').value || null,
            category: modal.querySelector('#event-category').value || null,
            recurrence: modal.querySelector('#event-recurrence').value || null,
        };
        // Close immediately for instant feedback
        modal.remove();
        if (existing) {
            await updateEvent(existing.id, data);
        } else {
            await addEvent(data);
        }
        // Force re-render to reflect changes (Firestore onSnapshot may not have fired yet)
        renderCalendar();
    });

    if (existing) {
        modal.querySelector('#event-delete')?.addEventListener('click', async () => {
            if (!confirm('Termin löschen?')) return;
            modal.remove();
            await deleteEvent(existing.id);
            renderCalendar();
        });
    }

    setTimeout(() => modal.querySelector('#event-title').focus(), 100);
}
