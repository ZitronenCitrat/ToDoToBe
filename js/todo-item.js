import { toggleTodo, toggleSubtask, addSubtask } from './db.js';
import { formatDate, dueDateClass, toDate, urgencyClass } from './utils.js';

export function createTodoElement(todo, { showListTag = false, listName = '', listColor = '', showAccordion = true } = {}) {
    const el = document.createElement('div');
    el.className = `todo-item${todo.completed ? ' completed' : ''}`;
    el.dataset.id = todo.id;

    // Priority class for left color bar
    if (!todo.completed && todo.priority && todo.priority < 4) {
        el.classList.add(`priority-${todo.priority}`);
    }

    // Urgency glow based on due date
    if (!todo.completed && todo.dueDate) {
        const uc = urgencyClass(todo.dueDate);
        if (uc) el.classList.add(uc);
    }

    // Checkbox
    const checkbox = document.createElement('div');
    checkbox.className = `todo-checkbox${todo.completed ? ' checked' : ''}`;
    if (!todo.completed && todo.priority < 4) {
        checkbox.classList.add(`priority-${todo.priority}`);
    }
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTodo(todo.id, !todo.completed);
    });

    // Body
    const body = document.createElement('div');
    body.className = 'todo-body';

    const title = document.createElement('div');
    title.className = 'todo-title';
    title.textContent = todo.title;
    body.appendChild(title);

    // Meta info (due date, list tag, subtask count, recurrence)
    const dueDate = toDate(todo.dueDate);
    const subtasks = todo.subtasks || [];
    const hasSubtasks = subtasks.length > 0;
    const hasMeta = (dueDate && !todo.completed) || (showListTag && listName) || hasSubtasks || todo.recurrence;

    if (hasMeta) {
        const meta = document.createElement('div');
        meta.className = 'todo-meta';

        if (dueDate && !todo.completed) {
            const due = document.createElement('span');
            due.className = `todo-due ${dueDateClass(todo.dueDate)}`;
            due.innerHTML = `<span class="material-symbols-outlined">schedule</span>${formatDate(todo.dueDate)}`;
            meta.appendChild(due);
        }

        if (todo.recurrence) {
            const rec = document.createElement('span');
            rec.className = 'todo-due';
            rec.style.color = 'var(--accent)';
            const label = todo.recurrence === 'daily' ? 'Täglich' : 'Wöchentlich';
            rec.innerHTML = `<span class="material-symbols-outlined">repeat</span>${label}`;
            meta.appendChild(rec);
        }

        if (hasSubtasks) {
            const completedCount = subtasks.filter(s => s.completed).length;
            const subtaskInfo = document.createElement('span');
            subtaskInfo.className = 'todo-due subtask-toggle-btn';
            if (completedCount === subtasks.length && subtasks.length > 0) {
                subtaskInfo.style.color = 'var(--accent)';
            }
            subtaskInfo.innerHTML = `<span class="material-symbols-outlined">checklist</span>${completedCount}/${subtasks.length}`;
            subtaskInfo.style.cursor = 'pointer';
            subtaskInfo.addEventListener('click', (e) => {
                e.stopPropagation();
                el.classList.toggle('expanded');
            });
            meta.appendChild(subtaskInfo);
        }

        if (showListTag && listName) {
            const tag = document.createElement('span');
            tag.className = 'todo-list-tag';
            if (listColor) tag.style.borderLeftColor = listColor;
            tag.textContent = listName;
            meta.appendChild(tag);
        }

        body.appendChild(meta);
    }

    // Accordion subtask section
    if (showAccordion && hasSubtasks && !todo.completed) {
        const accordion = document.createElement('div');
        accordion.className = 'subtask-accordion';

        subtasks.forEach(sub => {
            const row = document.createElement('div');
            row.className = 'subtask-row';

            const subCheckbox = document.createElement('div');
            subCheckbox.className = `todo-checkbox${sub.completed ? ' checked' : ''}`;
            subCheckbox.style.cssText = 'width:16px;height:16px;flex-shrink:0;cursor:pointer';
            subCheckbox.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSubtask(todo.id, sub.id, subtasks);
            });

            const subLabel = document.createElement('span');
            subLabel.className = 'subtask-label';
            if (sub.completed) subLabel.classList.add('done');
            subLabel.textContent = sub.title;

            row.appendChild(subCheckbox);
            row.appendChild(subLabel);
            accordion.appendChild(row);
        });

        // Inline add
        const addRow = document.createElement('div');
        addRow.className = 'subtask-add-row';
        const addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.className = 'subtask-add-input';
        addInput.placeholder = 'Neuer Punkt…';
        addInput.addEventListener('click', (e) => e.stopPropagation());
        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                const val = addInput.value.trim();
                if (val) {
                    addSubtask(todo.id, val);
                    addInput.value = '';
                }
            }
        });
        addRow.appendChild(addInput);
        accordion.appendChild(addRow);

        body.appendChild(accordion);
    }

    // Drag handle
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">drag_indicator</span>';

    el.appendChild(checkbox);
    el.appendChild(body);
    if (!todo.completed) {
        el.appendChild(handle);
    }

    return el;
}
