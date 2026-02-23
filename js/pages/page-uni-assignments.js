import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { toDate, formatDate, isToday, isOverdue, startOfDay, urgencyClass, escapeHtml } from '../utils.js';
import { addAssignment, updateAssignment, deleteAssignment } from '../db.js';

let initialized = false;
let currentFilter = 'all'; // 'all' | 'open' | 'done' | courseId

export function initPageUniAssignments() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-uni-assignments');

    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title">Aufgaben</span>
            <div class="page-header-actions">
                <button class="icon-btn" id="assignments-add-btn">
                    <span class="material-symbols-outlined">add</span>
                </button>
            </div>
        </div>
        <div class="px-5 mb-3 flex gap-2 flex-wrap" id="assignments-filters"></div>
        <div class="px-5 flex-1" id="assignments-content"></div>
    `;

    container.querySelector('#assignments-add-btn').addEventListener('click', openAddAssignmentModal);
    registerFabAction('assignments', openAddAssignmentModal);

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'assignments') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'assignments'; }

function render() {
    renderFilters();
    renderAssignments();
}

function renderFilters() {
    const filtersEl = document.querySelector('#assignments-filters');
    if (!filtersEl) return;

    const filters = [
        { key: 'all', label: 'Alle' },
        { key: 'open', label: 'Offen' },
        { key: 'done', label: 'Erledigt' },
    ];
    appState.allCourses.forEach(c => {
        filters.push({ key: c.id, label: escapeHtml(c.name) });
    });

    filtersEl.innerHTML = filters.map(f =>
        `<button class="tab-btn ${currentFilter === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>`
    ).join('');

    filtersEl.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            render();
        });
    });
}

function renderAssignments() {
    const content = document.querySelector('#assignments-content');
    if (!content) return;

    let assignments = [...appState.allAssignments];

    // Apply filter
    if (currentFilter === 'open') {
        assignments = assignments.filter(a => !a.completed);
    } else if (currentFilter === 'done') {
        assignments = assignments.filter(a => a.completed);
    } else if (currentFilter !== 'all') {
        assignments = assignments.filter(a => a.courseId === currentFilter);
    }

    if (assignments.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">assignment</span>
            <div class="empty-state-text">Keine Aufgaben</div>
        </div>`;
        return;
    }

    // Group by due category
    const today = startOfDay(new Date());
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const groups = { overdue: [], today: [], thisWeek: [], later: [], noDue: [] };
    assignments.forEach(a => {
        if (a.completed) {
            groups.later.push(a); // Show completed in "later"
            return;
        }
        const d = toDate(a.dueDate);
        if (!d) { groups.noDue.push(a); return; }
        const ds = startOfDay(d);
        if (ds < today) groups.overdue.push(a);
        else if (ds.getTime() === today.getTime()) groups.today.push(a);
        else if (ds < weekEnd) groups.thisWeek.push(a);
        else groups.later.push(a);
    });

    const sections = [
        { key: 'overdue', label: 'Überfällig', items: groups.overdue },
        { key: 'today', label: 'Heute', items: groups.today },
        { key: 'thisWeek', label: 'Diese Woche', items: groups.thisWeek },
        { key: 'later', label: 'Später', items: groups.later },
        { key: 'noDue', label: 'Ohne Datum', items: groups.noDue },
    ].filter(s => s.items.length > 0);

    let html = '';
    sections.forEach(section => {
        html += `<div class="date-group-header">${section.label}</div>`;
        section.items.forEach(a => {
            const course = appState.allCourses.find(c => c.id === a.courseId);
            const uc = !a.completed ? urgencyClass(a.dueDate) : '';
            html += `<div class="assignment-card glass-sm p-3 mb-2 flex items-center gap-3 ${uc}" data-id="${a.id}">
                <div class="todo-checkbox ${a.completed ? 'checked' : ''}" data-toggle="${a.id}" style="cursor:pointer;flex-shrink:0"></div>
                <div class="flex-1 min-w-0">
                    <div style="font-size:14px;font-weight:500;${a.completed ? 'text-decoration:line-through;color:var(--text-tertiary)' : ''}">${escapeHtml(a.title)}</div>
                    <div class="flex items-center gap-2 mt-1">
                        ${course ? `<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:${course.color}22;color:${course.color}">${escapeHtml(course.name)}</span>` : ''}
                        ${a.dueDate ? `<span style="font-size:11px;color:var(--text-tertiary)">${formatDate(a.dueDate)}</span>` : ''}
                    </div>
                </div>
                <button class="icon-btn" data-delete="${a.id}" style="width:28px;height:28px;border:none;background:none">
                    <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary)">close</span>
                </button>
            </div>`;
        });
    });

    content.innerHTML = html;

    // Wire events
    content.querySelectorAll('[data-toggle]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const a = appState.allAssignments.find(x => x.id === el.dataset.toggle);
            if (a) {
                updateAssignment(a.id, {
                    completed: !a.completed,
                    completedAt: !a.completed ? new Date().toISOString() : null
                });
            }
        });
    });

    content.querySelectorAll('[data-delete]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Aufgabe löschen?')) deleteAssignment(el.dataset.delete);
        });
    });
}

function openAddAssignmentModal() {
    const existing = document.getElementById('assignment-add-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'assignment-add-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neue Aufgabe</h2>
            <input type="text" id="assign-title" class="glass-input w-full mb-3" placeholder="Titel">
            <select id="assign-course" class="glass-select w-full mb-3">
                <option value="">Kurs wählen…</option>
                ${appState.allCourses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
            <input type="date" id="assign-due" class="glass-input w-full mb-3">
            <div class="flex gap-2 mb-4 flex-wrap" id="assign-priority">
                <button data-priority="1" class="priority-chip p1">Dringend</button>
                <button data-priority="2" class="priority-chip p2">Hoch</button>
                <button data-priority="3" class="priority-chip p3">Mittel</button>
                <button data-priority="4" class="priority-chip p4 active">Keine</button>
            </div>
            <textarea id="assign-notes" class="glass-textarea mb-4" placeholder="Notizen…" rows="2"></textarea>
            <button id="assign-save" class="btn-accent w-full">Hinzufügen</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelectorAll('#assign-priority [data-priority]').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('#assign-priority [data-priority]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    modal.querySelector('#assign-save').addEventListener('click', async () => {
        const title = modal.querySelector('#assign-title').value.trim();
        if (!title) return;
        const priorityBtn = modal.querySelector('#assign-priority .active');
        await addAssignment({
            title,
            courseId: modal.querySelector('#assign-course').value,
            dueDate: modal.querySelector('#assign-due').value || null,
            priority: priorityBtn ? parseInt(priorityBtn.dataset.priority) : 4,
            notes: modal.querySelector('#assign-notes').value
        });
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#assign-title').focus(), 100);
}
