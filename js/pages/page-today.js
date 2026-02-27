import { appState, onStateChange } from '../app.js';
import { createTodoElement } from '../todo-item.js';
import { onRouteChange, navigate } from '../router.js';
import { isToday, isOverdue, formatTodayHeader, todayDateStr, isTodoActiveOnDate } from '../utils.js';
import { updateTodo } from '../db.js';

let stateUnsub = null;
let routeUnsub = null;
let initialized = false;

export function initPageToday() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-today');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="today-settings-btn">
                <span class="material-symbols-outlined">settings</span>
            </button>
            <div class="page-header-actions">
                <button class="icon-btn" id="today-review-btn" title="Wöchentlicher Review">
                    <span class="material-symbols-outlined">event_note</span>
                </button>
                <button class="avatar-btn" id="today-avatar-btn">
                    <img src="" alt="" id="today-avatar-img">
                </button>
            </div>
        </div>
        <div class="px-5 pb-3">
            <h1 class="text-2xl font-bold">Heute</h1>
            <p class="text-sm mt-1" style="color:var(--text-tertiary)" id="today-date-label"></p>
        </div>
        <div class="px-5 mb-4" id="today-goal-card"></div>
        <div class="px-5" id="today-routine-section"></div>
        <div class="px-5" id="today-habits-preview"></div>
        <div class="px-5 flex-1" id="today-todo-container">
            <div id="today-todo-list"></div>
            <div id="today-completed-section" class="completed-section hidden">
                <button id="today-toggle-completed" class="toggle-completed-btn">
                    <span class="toggle-arrow">&#9654;</span>
                    Erledigt <span id="today-completed-count"></span>
                </button>
                <div id="today-completed-list" class="hidden"></div>
            </div>
        </div>
    `;

    container.querySelector('#today-settings-btn').addEventListener('click', () => navigate('settings'));
    container.querySelector('#today-review-btn').addEventListener('click', () => navigate('weekly-review'));
    container.querySelector('#today-avatar-btn').addEventListener('click', () => navigate('settings'));

    container.querySelector('#today-toggle-completed').addEventListener('click', () => {
        const list = container.querySelector('#today-completed-list');
        const arrow = container.querySelector('.toggle-arrow');
        list.classList.toggle('hidden');
        arrow.classList.toggle('open');
    });

    stateUnsub = onStateChange(() => renderToday());
    routeUnsub = onRouteChange((route) => {
        if (route === 'today') renderToday();
    });

    renderToday();
}

function isRecurringToday(todo) {
    return isTodoActiveOnDate(todo, new Date());
}

function needsReset(todo) {
    if (!todo.recurrence) return false;
    if (!todo.completed) return false;
    const today = todayDateStr();
    return todo.lastResetDate !== today;
}

function renderToday() {
    const container = document.getElementById('page-today');
    if (!container) return;

    const dateLabel = container.querySelector('#today-date-label');
    dateLabel.textContent = formatTodayHeader();

    if (appState.user) {
        const img = container.querySelector('#today-avatar-img');
        img.src = appState.user.photoURL || '';
        img.alt = appState.user.displayName || '';
    }

    // Recurring todos (daily focus)
    const recurringTodos = appState.allTodos.filter(t => isRecurringToday(t));
    const routineSection = container.querySelector('#today-routine-section');

    // Auto-reset recurring todos that were completed on a previous day
    recurringTodos.forEach(todo => {
        if (needsReset(todo)) {
            updateTodo(todo.id, { completed: false, completedAt: null, lastResetDate: todayDateStr() });
        }
    });

    if (recurringTodos.length > 0) {
        const activeRoutines = recurringTodos.filter(t => !t.completed || !needsReset(t));
        routineSection.innerHTML = `
            <div class="mb-3">
                <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined" style="color:var(--accent);font-size:20px">repeat</span>
                    <span style="font-size:14px;font-weight:600;color:var(--text-secondary)">Tagesroutine</span>
                </div>
                <div id="today-routine-list"></div>
            </div>
        `;
        const routineList = routineSection.querySelector('#today-routine-list');
        activeRoutines.forEach(todo => {
            const el = createTodoElement(todo, { showAccordion: false });
            el.addEventListener('click', () => navigate('task', { id: todo.id }));
            routineList.appendChild(el);
        });
    } else {
        routineSection.innerHTML = '';
    }

    // Habits preview
    const habitsPreview = container.querySelector('#today-habits-preview');
    const activeHabits = appState.allHabits.filter(h => !h.archived);
    const today = todayDateStr();

    if (activeHabits.length > 0) {
        const completedHabits = activeHabits.filter(h =>
            appState.habitLogs.some(l => l.habitId === h.id && l.date === today && l.completed)
        );
        habitsPreview.innerHTML = `
            <div class="glass-sm p-3 mb-4" style="cursor:pointer" id="today-habits-link">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined" style="color:var(--accent);font-size:20px">self_improvement</span>
                        <span style="font-size:14px;font-weight:600">Gewohnheiten</span>
                    </div>
                    <span style="font-size:13px;color:var(--text-tertiary)">${completedHabits.length}/${activeHabits.length}</span>
                </div>
            </div>
        `;
        habitsPreview.querySelector('#today-habits-link').addEventListener('click', () => navigate('habits'));
    } else {
        habitsPreview.innerHTML = '';
    }

    // Filter today's todos (non-recurring)
    const todayTodos = appState.allTodos.filter(t =>
        !t.completed && !t.recurrence && t.dueDate && (isToday(t.dueDate) || isOverdue(t.dueDate))
    );
    const completedToday = appState.allTodos.filter(t =>
        t.completed && !t.recurrence && t.dueDate && (isToday(t.dueDate) || isOverdue(t.dueDate))
    );

    const inboxList = appState.allLists.find(l => l.isDefault);
    const inboxId = inboxList ? inboxList.id : null;
    const inboxActive = inboxId
        ? appState.allTodos.filter(t => t.listId === inboxId && !t.completed && !t.dueDate && !t.recurrence)
        : [];
    const inboxCompleted = inboxId
        ? appState.allTodos.filter(t => t.listId === inboxId && t.completed && !t.dueDate && !t.recurrence)
        : [];

    const activeTodos = [...todayTodos, ...inboxActive].sort((a, b) => a.priority - b.priority);
    const allCompleted = [...completedToday, ...inboxCompleted];
    const totalToday = activeTodos.length + allCompleted.length;
    const doneToday = allCompleted.length;

    renderGoalCard(container, doneToday, totalToday);

    const todoList = container.querySelector('#today-todo-list');
    todoList.innerHTML = '';

    if (activeTodos.length === 0 && allCompleted.length === 0 && recurringTodos.length === 0) {
        todoList.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">task_alt</span>
                <div class="empty-state-text">Keine Aufgaben für heute</div>
            </div>`;
    } else {
        activeTodos.forEach(todo => {
            const listInfo = appState.allLists.find(l => l.id === todo.listId);
            const el = createTodoElement(todo, {
                showListTag: true,
                listName: listInfo?.name || '',
                listColor: listInfo?.color || ''
            });
            el.addEventListener('click', () => navigate('task', { id: todo.id }));
            todoList.appendChild(el);
        });
    }

    const completedSection = container.querySelector('#today-completed-section');
    const completedList = container.querySelector('#today-completed-list');
    const completedCount = container.querySelector('#today-completed-count');

    if (allCompleted.length > 0) {
        completedSection.classList.remove('hidden');
        completedCount.textContent = `(${allCompleted.length})`;
        completedList.innerHTML = '';
        allCompleted.forEach(todo => {
            const el = createTodoElement(todo);
            el.addEventListener('click', () => navigate('task', { id: todo.id }));
            completedList.appendChild(el);
        });
    } else {
        completedSection.classList.add('hidden');
    }
}

function renderGoalCard(container, done, total) {
    const goalCard = container.querySelector('#today-goal-card');
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const progress = total > 0 ? done / total : 0;
    const offset = circumference * (1 - progress);

    goalCard.innerHTML = `
        <div class="glass" style="padding:20px;display:flex;align-items:center;gap:20px">
            <svg width="100" height="100" class="progress-ring" style="flex-shrink:0">
                <circle class="progress-ring-bg" cx="50" cy="50" r="${radius}" stroke-width="8"/>
                <circle class="progress-ring-fill" cx="50" cy="50" r="${radius}" stroke-width="8"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
            </svg>
            <div>
                <div style="color:var(--text-tertiary);font-size:13px;font-weight:500;margin-bottom:4px">Tagesziel</div>
                <div style="font-size:32px;font-weight:700;letter-spacing:-1px">${done}<span style="color:var(--text-tertiary);font-size:20px;font-weight:400">/${total}</span></div>
                <div style="color:var(--text-secondary);font-size:13px">${total > 0 ? Math.round(progress * 100) : 0}% erledigt</div>
            </div>
        </div>
    `;
}
