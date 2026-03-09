import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { createTodoElement } from '../todo-item.js';
import {
    getWeekdayShort, formatMonthYear, getDaysInMonth,
    getFirstDayOfWeek, isSameDay, toDate, startOfDay, escapeHtml, escapeAttr,
    getActiveSemester, isTodayLectureDay, toInputDate, isTodoActiveOnDate, safeCssColor
} from '../utils.js';
import { addEvent, updateEvent, deleteEvent, addCalendarCategory, deleteCalendarCategory, updateUserSettings } from '../db.js';

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
            <h1 class="page-header-title page-title">Kalender</h1>
            <div class="page-header-actions">
                <button class="icon-btn" id="cal-categories-btn" title="Kategorien verwalten">
                    <span class="material-symbols-outlined">category</span>
                </button>
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
    container.querySelector('#cal-categories-btn').addEventListener('click', () => openManageCategoriesModal());
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

const DEFAULT_TYPE_COLORS = {
    todos: '#00ffd5',
    exams: '#ef4444',
    assignments: '#f97316',
    courses: '#3b82f6',
    wishes: '#a55eea',
    events: '#22c55e',
};

function getTypeColor(type) {
    return (appState.settings?.calendarTypeColors?.[type]) || DEFAULT_TYPE_COLORS[type] || '#888';
}

function getCourseSlotsForDate(date) {
    // Convert JS weekday (0=Sun) to Mon-based index (Mon=0 ... Sun=6)
    const jsDay = date.getDay();
    const weekdayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const semesters = appState.allSemesters || [];

    const slots = [];
    appState.allCourses.forEach(course => {
        // Use the course's own semester, not the globally active one
        const semester = (course.semesterId && semesters.find(s => s.id === course.semesterId))
            || getActiveSemester(semesters);
        if (!isTodayLectureDay(semester, date)) return;

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

    appState.allEvents.filter(ev => !ev.courseId && !ev.examId).forEach(ev => {
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
                { show: hasActiveTodos, color: getTypeColor('todos') },
                { show: hasExams, color: getTypeColor('exams') },
                { show: hasAssignments, color: getTypeColor('assignments') },
                { show: hasLecture, color: getTypeColor('courses') },
                { show: hasWishes, color: getTypeColor('wishes') },
                { show: hasEvents, color: getTypeColor('events') },
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
        if (calFilter === 'all') sectionLabel('Todos', getTypeColor('todos'));
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
        if (calFilter === 'all') sectionLabel('Uni', getTypeColor('courses'));

        // Timetable blocks (course slots for this day)
        courseSlots.forEach(({ course, slot, extra, type }) => {
            const dateStr = toInputDate(selectedDate);
            const isSkipped = (course.skippedDates || []).includes(dateStr);
            const color = safeCssColor(course.color);
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
            const examColor = getTypeColor('exams');
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = `border-left:3px solid ${examColor}`;
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:${examColor};flex-shrink:0">quiz</span>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(exam.title)}</div>
                    <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(course?.name || '')} · Klausur${exam.room ? ' · ' + escapeHtml(exam.room) : ''}${exam.time ? ' · ' + exam.time : ''}</div>
                </div>
                ${exam.grade != null ? `<span style="font-size:13px;font-weight:600;color:${exam.grade <= 4 ? 'var(--accent)' : examColor}">${exam.grade.toFixed(1)}</span>` : ''}
            `;
            dayItems.appendChild(card);
        });

        // Open assignments
        openAssignments.forEach(a => {
            const course = appState.allCourses.find(c => c.id === a.courseId);
            const assignColor = getTypeColor('assignments');
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = `border-left:3px solid ${assignColor}`;
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:${assignColor};flex-shrink:0">assignment</span>
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
        const evColor = getTypeColor('events');
        if (calFilter === 'all') sectionLabel('Termine', evColor);
        visibleEvents.forEach(ev => {
            const timeRange = ev.time
                ? (ev.endTime ? `${ev.time}–${ev.endTime}` : ev.time)
                : '';
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = `border-left:3px solid ${evColor}`;
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:${evColor};flex-shrink:0">event</span>
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
        const wishColor = getTypeColor('wishes');
        if (calFilter === 'all') sectionLabel('Wünsche', wishColor);
        wishes.forEach(w => {
            const nutzen = w.nutzen || 0;
            const stars = '★'.repeat(nutzen) + '☆'.repeat(Math.max(0, 5 - nutzen));
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = `border-left:3px solid ${wishColor}`;
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:${wishColor};flex-shrink:0">star</span>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(w.name || w.title || '')}</div>
                    <div style="font-size:11px;color:${wishColor};letter-spacing:2px">${stars}</div>
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
                ${appState.calendarCategories.map(c => `<option value="${escapeAttr(c.name)}" ${selectedCat === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
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

// ----- Category Management Modal -----

const TYPE_COLOR_LABELS = [
    { key: 'todos',       label: 'Todos' },
    { key: 'exams',       label: 'Klausuren' },
    { key: 'assignments', label: 'Aufgaben' },
    { key: 'courses',     label: 'Uni (Kurse)' },
    { key: 'wishes',      label: 'Wünsche' },
    { key: 'events',      label: 'Termine' },
];

function openManageCategoriesModal() {
    const old = document.getElementById('cat-manage-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'cat-manage-modal';
    modal.className = 'modal-overlay';

    const currentTypeColors = { ...DEFAULT_TYPE_COLORS, ...(appState.settings?.calendarTypeColors || {}) };

    const typeColorRows = TYPE_COLOR_LABELS.map(({ key, label }) => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
            <div class="type-color-dot" data-key="${key}" style="width:14px;height:14px;border-radius:50%;background:${currentTypeColors[key]};flex-shrink:0"></div>
            <span style="flex:1;font-size:14px">${escapeHtml(label)}</span>
            <input type="color" class="type-color-picker" data-key="${key}" value="${currentTypeColors[key]}"
                title="Farbe für ${escapeHtml(label)}"
                style="width:36px;height:36px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);cursor:pointer;background:rgba(255,255,255,0.08);padding:2px;flex-shrink:0">
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Kalender-Farben</h2>

            <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Kalender-Typen</div>
            <div id="type-color-list">${typeColorRows}</div>

            <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08)">
                <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Termin-Kategorien</div>
                <div id="cat-manage-list"></div>
                <div style="margin-top:12px">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Neue Kategorie</div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <input type="text" id="cat-new-name" class="glass-input" style="flex:1" placeholder="Name">
                        <input type="color" id="cat-new-color" value="#6b7280" title="Farbe wählen"
                            style="width:40px;height:40px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);cursor:pointer;background:rgba(255,255,255,0.08);padding:2px;flex-shrink:0">
                        <button id="cat-new-add" class="btn-accent" style="padding:0 16px;height:40px;flex-shrink:0">+</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Wire type color pickers
    const pendingColors = { ...currentTypeColors };
    let saveTimeout = null;

    modal.querySelectorAll('.type-color-picker').forEach(picker => {
        picker.addEventListener('input', () => {
            const key = picker.dataset.key;
            pendingColors[key] = picker.value;
            // Update the dot preview
            modal.querySelector(`.type-color-dot[data-key="${key}"]`).style.background = picker.value;
            // Debounce save
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                const newSettings = { ...appState.settings, calendarTypeColors: { ...pendingColors } };
                appState.settings = newSettings;
                await updateUserSettings(newSettings);
                renderCalendar();
            }, 600);
        });
    });

    function renderCatList() {
        const list = modal.querySelector('#cat-manage-list');
        if (!list) return;
        list.innerHTML = '';
        if (appState.calendarCategories.length === 0) {
            list.innerHTML = `<div style="font-size:13px;color:var(--text-tertiary);padding:8px 0">Keine Kategorien</div>`;
            return;
        }
        appState.calendarCategories.forEach(cat => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)';
            row.innerHTML = `
                <div style="width:14px;height:14px;border-radius:50%;background:${cat.color};flex-shrink:0"></div>
                <span style="flex:1;font-size:14px">${escapeHtml(cat.name)}</span>
                <button data-id="${escapeAttr(cat.id)}" class="cat-delete-btn icon-btn" style="width:28px;height:28px">
                    <span class="material-symbols-outlined" style="font-size:16px;color:#ef4444">delete</span>
                </button>
            `;
            list.appendChild(row);
        });
        list.querySelectorAll('.cat-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteCalendarCategory(btn.dataset.id));
        });
    }

    renderCatList();
    const unsub = onStateChange(() => renderCatList());

    modal.querySelector('.modal-backdrop').addEventListener('click', () => { unsub(); clearTimeout(saveTimeout); modal.remove(); });

    modal.querySelector('#cat-new-add').addEventListener('click', async () => {
        const nameInput = modal.querySelector('#cat-new-name');
        const name = nameInput.value.trim();
        if (!name) return;
        const color = modal.querySelector('#cat-new-color').value;
        await addCalendarCategory({ name, color, sortOrder: appState.calendarCategories.length });
        nameInput.value = '';
    });

    modal.querySelector('#cat-new-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') modal.querySelector('#cat-new-add').click();
    });
}
