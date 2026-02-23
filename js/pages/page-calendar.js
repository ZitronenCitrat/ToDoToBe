import { appState, onStateChange, registerFabAction, openQuickAdd } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { createTodoElement } from '../todo-item.js';
import {
    getWeekdayShort, formatMonthYear, getDaysInMonth,
    getFirstDayOfWeek, isSameDay, toDate, startOfDay, escapeHtml
} from '../utils.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = startOfDay(new Date());
let calFilter = 'all'; // 'all' | 'todos' | 'uni'
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
                <div class="flex gap-2 mb-3" id="cal-filter-tabs">
                    <button class="tab-btn active" data-filter="all">Alles</button>
                    <button class="tab-btn" data-filter="todos">Todos</button>
                    <button class="tab-btn" data-filter="uni">Uni</button>
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

    // Register FAB: add todo for the selected date
    registerFabAction('calendar', () => {
        openQuickAdd(selectedDate);
    });

    renderCalendar();
}

function buildItemsByDay() {
    const todosByDay = {};
    const examsByDay = {};
    const assignmentsByDay = {};

    appState.allTodos.forEach(t => {
        if (!t.dueDate) return;
        const d = toDate(t.dueDate);
        if (!d) return;
        const key = startOfDay(d).toISOString();
        if (!todosByDay[key]) todosByDay[key] = [];
        todosByDay[key].push(t);
    });

    appState.allExams.forEach(e => {
        if (!e.date) return;
        const d = toDate(e.date);
        if (!d) return;
        const key = startOfDay(d).toISOString();
        if (!examsByDay[key]) examsByDay[key] = [];
        examsByDay[key].push(e);
    });

    appState.allAssignments.forEach(a => {
        if (!a.dueDate) return;
        const d = toDate(a.dueDate);
        if (!d) return;
        const key = startOfDay(d).toISOString();
        if (!assignmentsByDay[key]) assignmentsByDay[key] = [];
        assignmentsByDay[key].push(a);
    });

    return { todosByDay, examsByDay, assignmentsByDay };
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
    const { todosByDay, examsByDay, assignmentsByDay } = buildItemsByDay();

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

        const isSelected = isSameDay(cellStart, selectedDate);
        const isCurrentDay = isSameDay(cellStart, today);
        const hasActiveTodos = todos.some(t => !t.completed);
        const hasExams = exams.length > 0;
        const hasAssignments = assignments.some(a => !a.completed);

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
        if (!isSelected && (hasActiveTodos || hasExams || hasAssignments)) {
            const dots = document.createElement('div');
            dots.style.cssText = 'display:flex;gap:2px;position:absolute;bottom:3px';
            if (hasActiveTodos) {
                const d = document.createElement('div');
                d.style.cssText = 'width:4px;height:4px;border-radius:50%;background:var(--accent)';
                dots.appendChild(d);
            }
            if (hasExams) {
                const d = document.createElement('div');
                d.style.cssText = 'width:4px;height:4px;border-radius:50%;background:#ef4444';
                dots.appendChild(d);
            }
            if (hasAssignments) {
                const d = document.createElement('div');
                d.style.cssText = 'width:4px;height:4px;border-radius:50%;background:#f97316';
                dots.appendChild(d);
            }
            cell.appendChild(dots);
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

    const { todosByDay, examsByDay, assignmentsByDay } = buildItemsByDay();
    const key = startOfDay(selectedDate).toISOString();

    const todos = todosByDay[key] || [];
    const exams = examsByDay[key] || [];
    const assignments = assignmentsByDay[key] || [];

    dayItems.innerHTML = '';

    let hasContent = false;

    // Todos section
    if (calFilter !== 'uni' && todos.length > 0) {
        hasContent = true;
        if (calFilter === 'all') {
            const label = document.createElement('div');
            label.style.cssText = 'font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px';
            label.textContent = 'Todos';
            dayItems.appendChild(label);
        }
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

    // Uni section: exams + assignments
    if (calFilter !== 'todos' && (exams.length > 0 || assignments.filter(a => !a.completed).length > 0)) {
        hasContent = true;
        const openAssignments = assignments.filter(a => !a.completed);

        if (calFilter === 'all') {
            const label = document.createElement('div');
            label.style.cssText = 'font-size:11px;font-weight:600;color:#ef4444;text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px';
            label.textContent = 'Uni';
            dayItems.appendChild(label);
        }

        exams.forEach(exam => {
            const course = appState.allCourses.find(c => c.id === exam.courseId);
            const card = document.createElement('div');
            card.className = 'glass-sm p-3 mb-2 flex items-center gap-3';
            card.style.cssText = 'border-left:3px solid #ef4444';
            card.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:20px;color:#ef4444;flex-shrink:0">quiz</span>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(exam.title)}</div>
                    <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(course?.name || '')} · Klausur${exam.room ? ' · ' + escapeHtml(exam.room) : ''}</div>
                </div>
                ${exam.grade != null ? `<span style="font-size:13px;font-weight:600;color:${exam.grade <= 4 ? 'var(--accent)' : '#ef4444'}">${exam.grade.toFixed(1)}</span>` : ''}
            `;
            dayItems.appendChild(card);
        });

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

    if (!hasContent) {
        dayItems.innerHTML = `
            <div style="text-align:center;padding:24px;color:var(--text-tertiary);font-size:14px">
                Nichts an diesem Tag
            </div>`;
    }
}
