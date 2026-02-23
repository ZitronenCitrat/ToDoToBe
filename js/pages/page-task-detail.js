import { appState, onStateChange } from '../app.js';
import { onRouteChange, getCurrentRoute, back, navigate } from '../router.js';
import { toInputDate } from '../utils.js';
import {
    updateTodo, deleteTodo, addSubtask, toggleSubtask,
    updateSubtaskTitle, removeSubtask
} from '../db.js';

let currentTodoId = null;
let initialized = false;

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function initPageTaskDetail() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-task-detail');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="task-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <div class="page-header-actions">
                <button class="icon-btn" id="task-delete-btn" style="color:var(--priority-1)">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        </div>
        <div class="px-5 flex-1" id="task-detail-body">
            <input type="text" id="task-title-input" class="glass-input mb-4" placeholder="Aufgabenname"
                style="font-size:20px;font-weight:600;padding:16px">

            <div class="glass-sm p-4 mb-4">
                <div class="flex items-center gap-3 mb-4">
                    <span class="material-symbols-outlined" style="color:var(--text-tertiary)">event</span>
                    <div class="flex-1">
                        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:4px">Fälligkeitsdatum</div>
                        <input type="date" id="task-due-date" class="glass-input">
                    </div>
                </div>

                <div class="flex items-center gap-3 mb-4">
                    <span class="material-symbols-outlined" style="color:var(--text-tertiary)">flag</span>
                    <div class="flex-1">
                        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:4px">Priorität</div>
                        <div class="flex gap-2" id="task-priority">
                            <button data-priority="1" class="priority-chip p1">Dringend</button>
                            <button data-priority="2" class="priority-chip p2">Hoch</button>
                            <button data-priority="3" class="priority-chip p3">Mittel</button>
                            <button data-priority="4" class="priority-chip p4">Keine</button>
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-3 mb-4">
                    <span class="material-symbols-outlined" style="color:var(--text-tertiary)">repeat</span>
                    <div class="flex-1">
                        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:4px">Wiederholung</div>
                        <select id="task-recurrence" class="glass-select w-full">
                            <option value="">Keine</option>
                            <option value="daily">Täglich</option>
                            <option value="weekly">Wöchentlich</option>
                        </select>
                        <div id="task-weekday-picker" class="flex gap-1 mt-2 hidden">
                            ${WEEKDAY_LABELS.map((d, i) => `<button class="weekday-btn" data-day="${i}">${d}</button>`).join('')}
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined" style="color:var(--text-tertiary)">folder</span>
                    <div class="flex-1">
                        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:4px">Liste</div>
                        <select id="task-list-select" class="glass-select w-full"></select>
                    </div>
                </div>
            </div>

            <div class="glass-sm p-4 mb-4" id="task-subtasks-section">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined" style="color:var(--text-tertiary)">checklist</span>
                        <span style="font-size:14px;font-weight:600">Checkliste</span>
                    </div>
                    <span id="task-subtask-progress" style="font-size:13px;color:var(--text-tertiary)"></span>
                </div>
                <div id="task-subtask-list"></div>
                <div class="flex items-center gap-2 mt-2">
                    <input type="text" id="task-subtask-input" class="glass-input flex-1" placeholder="Neuer Punkt…" style="font-size:14px;padding:10px 12px">
                    <button id="task-subtask-add" class="icon-btn" style="width:36px;height:36px">
                        <span class="material-symbols-outlined" style="font-size:20px">add</span>
                    </button>
                </div>
            </div>

            <div class="mb-4">
                <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined" style="color:var(--text-tertiary)">notes</span>
                    <span style="font-size:14px;font-weight:600">Notizen</span>
                </div>
                <textarea id="task-notes" class="glass-textarea" placeholder="Notizen hinzufügen…" rows="4"></textarea>
            </div>

            <button id="task-save-btn" class="btn-accent w-full mb-4">Speichern</button>
        </div>
    `;

    // Wire up events
    container.querySelector('#task-back-btn').addEventListener('click', back);

    container.querySelector('#task-delete-btn').addEventListener('click', async () => {
        if (!currentTodoId) return;
        if (confirm('Aufgabe wirklich löschen?')) {
            await deleteTodo(currentTodoId);
            back();
        }
    });

    // Priority buttons
    container.querySelectorAll('#task-priority [data-priority]').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('#task-priority [data-priority]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Recurrence select
    const recurrenceSelect = container.querySelector('#task-recurrence');
    const weekdayPicker = container.querySelector('#task-weekday-picker');

    recurrenceSelect.addEventListener('change', () => {
        weekdayPicker.classList.toggle('hidden', recurrenceSelect.value !== 'weekly');
    });

    // Weekday toggle buttons
    container.querySelectorAll('.weekday-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
        });
    });

    // Add subtask
    const subtaskInput = container.querySelector('#task-subtask-input');
    const subtaskAddBtn = container.querySelector('#task-subtask-add');

    subtaskAddBtn.addEventListener('click', () => addNewSubtask());
    subtaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addNewSubtask();
    });

    // Save button
    container.querySelector('#task-save-btn').addEventListener('click', saveTask);

    // Listen for route changes
    onRouteChange((route, params) => {
        if (route === 'task' && params.id) {
            currentTodoId = params.id;
            loadTodo();
        }
    });

    // Also load if already on the route
    const { route, params } = getCurrentRoute();
    if (route === 'task' && params.id) {
        currentTodoId = params.id;
        loadTodo();
    }
}

function loadTodo() {
    const todo = appState.allTodos.find(t => t.id === currentTodoId);
    if (!todo) return;

    const container = document.getElementById('page-task-detail');

    // Title
    container.querySelector('#task-title-input').value = todo.title || '';

    // Due date
    container.querySelector('#task-due-date').value = toInputDate(todo.dueDate);

    // Priority
    container.querySelectorAll('#task-priority [data-priority]').forEach(b => b.classList.remove('active'));
    const activeP = container.querySelector(`#task-priority [data-priority="${todo.priority || 4}"]`);
    if (activeP) activeP.classList.add('active');

    // Recurrence
    const recurrenceSelect = container.querySelector('#task-recurrence');
    recurrenceSelect.value = todo.recurrence || '';

    const weekdayPicker = container.querySelector('#task-weekday-picker');
    weekdayPicker.classList.toggle('hidden', recurrenceSelect.value !== 'weekly');

    // Weekday buttons
    container.querySelectorAll('.weekday-btn').forEach(btn => {
        const day = parseInt(btn.dataset.day);
        const weekdays = todo.recurrenceWeekdays || [];
        btn.classList.toggle('active', weekdays.includes(day));
    });

    // List select
    const listSelect = container.querySelector('#task-list-select');
    listSelect.innerHTML = '';
    appState.allLists.forEach(list => {
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = list.name;
        listSelect.appendChild(option);
    });
    listSelect.value = todo.listId || '';

    // Subtasks
    renderSubtasks(todo);

    // Notes
    container.querySelector('#task-notes').value = todo.notes || '';
}

function renderSubtasks(todo) {
    const container = document.getElementById('page-task-detail');
    const subtaskList = container.querySelector('#task-subtask-list');
    const progressEl = container.querySelector('#task-subtask-progress');
    const subtasks = todo.subtasks || [];

    const completedCount = subtasks.filter(s => s.completed).length;
    progressEl.textContent = subtasks.length > 0 ? `${completedCount}/${subtasks.length}` : '';

    subtaskList.innerHTML = '';
    subtasks.forEach(sub => {
        const item = document.createElement('div');
        item.className = 'flex items-center gap-3 py-2';
        item.style.borderBottom = '1px solid var(--surface-border)';

        const checkbox = document.createElement('div');
        checkbox.className = `todo-checkbox${sub.completed ? ' checked' : ''}`;
        checkbox.style.cssText = 'width:18px;height:18px;flex-shrink:0;cursor:pointer';
        checkbox.addEventListener('click', () => {
            toggleSubtask(todo.id, sub.id, subtasks);
        });

        const label = document.createElement('span');
        label.style.cssText = `flex:1;font-size:14px;${sub.completed ? 'text-decoration:line-through;color:var(--text-tertiary)' : ''}`;
        label.textContent = sub.title;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'icon-btn';
        removeBtn.style.cssText = 'width:28px;height:28px;border:none;background:none';
        removeBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary)">close</span>';
        removeBtn.addEventListener('click', () => {
            removeSubtask(todo.id, sub.id, subtasks);
        });

        item.appendChild(checkbox);
        item.appendChild(label);
        item.appendChild(removeBtn);
        subtaskList.appendChild(item);
    });
}

async function addNewSubtask() {
    const input = document.querySelector('#task-subtask-input');
    const title = input.value.trim();
    if (!title || !currentTodoId) return;

    await addSubtask(currentTodoId, title);
    input.value = '';

    setTimeout(() => {
        const todo = appState.allTodos.find(t => t.id === currentTodoId);
        if (todo) renderSubtasks(todo);
    }, 500);
}

async function saveTask() {
    if (!currentTodoId) return;

    const container = document.getElementById('page-task-detail');
    const title = container.querySelector('#task-title-input').value.trim();
    if (!title) return;

    const priorityBtn = container.querySelector('#task-priority .active');
    const priority = priorityBtn ? parseInt(priorityBtn.dataset.priority) : 4;
    const dueDate = container.querySelector('#task-due-date').value || null;
    const notes = container.querySelector('#task-notes').value;
    const listId = container.querySelector('#task-list-select').value;

    // Recurrence
    const recurrence = container.querySelector('#task-recurrence').value || null;
    const recurrenceWeekdays = [];
    if (recurrence === 'weekly') {
        container.querySelectorAll('.weekday-btn.active').forEach(btn => {
            recurrenceWeekdays.push(parseInt(btn.dataset.day));
        });
    }

    await updateTodo(currentTodoId, { title, priority, dueDate, notes, listId, recurrence, recurrenceWeekdays });
    back();
}

// Re-render when state changes
onStateChange(() => {
    const { route } = getCurrentRoute();
    if (route === 'task' && currentTodoId) {
        const todo = appState.allTodos.find(t => t.id === currentTodoId);
        if (todo) renderSubtasks(todo);
    }
});
