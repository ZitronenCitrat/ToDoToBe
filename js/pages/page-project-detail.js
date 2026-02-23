import { appState, onStateChange } from '../app.js';
import { onRouteChange, getCurrentRoute, back, navigate } from '../router.js';
import { createTodoElement } from '../todo-item.js';
import { updateList, deleteList } from '../db.js';

let currentListId = null;
let activeTab = 'tasks';
let initialized = false;

export function initPageProjectDetail() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-project-detail');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="project-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <div class="page-header-actions">
                <button class="icon-btn" id="project-edit-btn">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="icon-btn" id="project-delete-btn" style="color:var(--priority-1)">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        </div>
        <div class="px-5">
            <h1 id="project-name" class="text-2xl font-bold mb-4"></h1>
            <div id="project-progress-card" class="glass p-5 mb-5 flex items-center gap-5"></div>
            <div class="flex gap-1 mb-4" id="project-tabs">
                <button class="tab-btn active" data-tab="tasks">Aufgaben</button>
                <button class="tab-btn" data-tab="overview">Übersicht</button>
                <button class="tab-btn" data-tab="brainstorm">Brainstorm</button>
            </div>
        </div>
        <div class="px-5 flex-1" id="project-tab-content"></div>
    `;

    // Back
    container.querySelector('#project-back-btn').addEventListener('click', back);

    // Edit name
    container.querySelector('#project-edit-btn').addEventListener('click', async () => {
        if (!currentListId) return;
        const list = appState.allLists.find(l => l.id === currentListId);
        if (!list || list.isDefault) return;
        const name = prompt('Listenname:', list.name);
        if (name && name.trim()) {
            await updateList(currentListId, { name: name.trim() });
        }
    });

    // Delete
    container.querySelector('#project-delete-btn').addEventListener('click', async () => {
        if (!currentListId) return;
        const list = appState.allLists.find(l => l.id === currentListId);
        if (!list || list.isDefault) return;
        if (confirm(`"${list.name}" und alle Aufgaben löschen?`)) {
            await deleteList(currentListId);
            back();
        }
    });

    // Tabs
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.dataset.tab;
            renderTabContent();
        });
    });

    onRouteChange((route, params) => {
        if (route === 'project' && params.id) {
            currentListId = params.id;
            activeTab = 'tasks';
            container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            container.querySelector('.tab-btn[data-tab="tasks"]').classList.add('active');
            renderProject();
        }
    });

    onStateChange(() => {
        const { route } = getCurrentRoute();
        if (route === 'project') renderProject();
    });

    const { route, params } = getCurrentRoute();
    if (route === 'project' && params.id) {
        currentListId = params.id;
        renderProject();
    }
}

function renderProject() {
    if (!currentListId) return;
    const container = document.getElementById('page-project-detail');
    const list = appState.allLists.find(l => l.id === currentListId);
    if (!list) return;

    // Name
    container.querySelector('#project-name').textContent = list.name;

    // Hide delete for default inbox
    const deleteBtn = container.querySelector('#project-delete-btn');
    const editBtn = container.querySelector('#project-edit-btn');
    if (list.isDefault) {
        deleteBtn.classList.add('hidden');
        editBtn.classList.add('hidden');
    } else {
        deleteBtn.classList.remove('hidden');
        editBtn.classList.remove('hidden');
    }

    // Progress
    const todos = appState.allTodos.filter(t => t.listId === currentListId);
    const completed = todos.filter(t => t.completed).length;
    const total = todos.length;
    const progress = total > 0 ? completed / total : 0;
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - progress);

    container.querySelector('#project-progress-card').innerHTML = `
        <svg width="110" height="110" class="progress-ring" style="flex-shrink:0">
            <circle class="progress-ring-bg" cx="55" cy="55" r="${radius}" stroke-width="8"/>
            <circle class="progress-ring-fill" cx="55" cy="55" r="${radius}" stroke-width="8"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                style="stroke:${list.color || 'var(--accent)'}"/>
        </svg>
        <div>
            <div style="font-size:36px;font-weight:700">${Math.round(progress * 100)}%</div>
            <div style="font-size:14px;color:var(--text-secondary)">${completed} von ${total} erledigt</div>
        </div>
    `;

    renderTabContent();
}

function renderTabContent() {
    const content = document.getElementById('project-tab-content');
    if (!content || !currentListId) return;

    if (activeTab === 'tasks') {
        renderTasksTab(content);
    } else if (activeTab === 'overview') {
        renderOverviewTab(content);
    } else if (activeTab === 'brainstorm') {
        renderBrainstormTab(content);
    }
}

function renderTasksTab(content) {
    const activeTodos = appState.allTodos.filter(t => t.listId === currentListId && !t.completed);
    const completedTodos = appState.allTodos.filter(t => t.listId === currentListId && t.completed);

    content.innerHTML = '';

    if (activeTodos.length === 0 && completedTodos.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">playlist_add</span>
                <div class="empty-state-text">Keine Aufgaben</div>
            </div>`;
        return;
    }

    const activeContainer = document.createElement('div');
    activeTodos.forEach(todo => {
        const el = createTodoElement(todo);
        el.addEventListener('click', () => navigate('task', { id: todo.id }));
        activeContainer.appendChild(el);
    });
    content.appendChild(activeContainer);

    if (completedTodos.length > 0) {
        const section = document.createElement('div');
        section.className = 'completed-section';
        section.style.padding = '0';
        section.innerHTML = `
            <button class="toggle-completed-btn">
                <span class="toggle-arrow">&#9654;</span>
                Erledigt <span>(${completedTodos.length})</span>
            </button>
            <div class="hidden"></div>
        `;

        const toggleBtn = section.querySelector('.toggle-completed-btn');
        const completedList = section.querySelector('.hidden');

        toggleBtn.addEventListener('click', () => {
            completedList.classList.toggle('hidden');
            toggleBtn.querySelector('.toggle-arrow').classList.toggle('open');
        });

        completedTodos.forEach(todo => {
            const el = createTodoElement(todo);
            el.addEventListener('click', () => navigate('task', { id: todo.id }));
            completedList.appendChild(el);
        });

        content.appendChild(section);
    }
}

function renderOverviewTab(content) {
    const todos = appState.allTodos.filter(t => t.listId === currentListId);
    const byPriority = [1, 2, 3, 4].map(p => ({
        priority: p,
        count: todos.filter(t => (t.priority || 4) === p && !t.completed).length
    }));

    const labels = { 1: 'Dringend', 2: 'Hoch', 3: 'Mittel', 4: 'Keine' };
    const colors = { 1: 'var(--priority-1)', 2: 'var(--priority-2)', 3: 'var(--priority-3)', 4: 'var(--text-tertiary)' };

    content.innerHTML = `
        <div class="glass-sm p-4">
            <div style="font-size:14px;font-weight:600;margin-bottom:12px">Nach Priorität</div>
            ${byPriority.map(p => `
                <div class="flex items-center justify-between py-2" style="border-bottom:1px solid var(--surface-border)">
                    <div class="flex items-center gap-2">
                        <div style="width:8px;height:8px;border-radius:50%;background:${colors[p.priority]}"></div>
                        <span style="font-size:14px">${labels[p.priority]}</span>
                    </div>
                    <span style="font-size:14px;font-weight:600">${p.count}</span>
                </div>
            `).join('')}
        </div>
    `;
}

async function renderBrainstormTab(content) {
    const { renderMindmap } = await import('./mindmap.js');
    content.innerHTML = '';
    renderMindmap(content, currentListId);
}
