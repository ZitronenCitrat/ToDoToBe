import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { createList } from '../db.js';
import { escapeHtml } from '../utils.js';

let initialized = false;

export function initPageProjects() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-projects');

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-header-title">Meine Projekte</h1>
            <div class="page-header-actions">
                <button class="avatar-btn" id="projects-avatar-btn">
                    <img src="" alt="" id="projects-avatar-img">
                </button>
            </div>
        </div>
        <div class="px-5 flex-1">
            <div id="projects-overview" class="glass p-4 mb-5"></div>
            <div id="projects-grid" class="grid grid-cols-2 gap-3"></div>
        </div>
    `;

    container.querySelector('#projects-avatar-btn').addEventListener('click', () => {
        navigate('settings');
    });

    registerFabAction('projects', openNewListModal);

    onStateChange(() => renderProjects());
    onRouteChange((route) => {
        if (route === 'projects') renderProjects();
    });

    renderProjects();
}

function renderProjects() {
    const container = document.getElementById('page-projects');
    if (!container) return;

    // Avatar
    if (appState.user) {
        const img = container.querySelector('#projects-avatar-img');
        img.src = appState.user.photoURL || '';
        img.alt = appState.user.displayName || '';
    }

    const allActive = appState.allTodos.filter(t => !t.completed);
    const allCompleted = appState.allTodos.filter(t => t.completed);
    const total = appState.allTodos.length;

    // Overview card
    const overview = container.querySelector('#projects-overview');
    overview.innerHTML = `
        <div class="flex justify-between items-center">
            <div>
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:2px">Offene Aufgaben</div>
                <div style="font-size:28px;font-weight:700">${allActive.length}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:2px">Erledigt</div>
                <div style="font-size:28px;font-weight:700;color:var(--accent)">${allCompleted.length}</div>
            </div>
        </div>
        ${total > 0 ? `
        <div style="margin-top:12px;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${Math.round(allCompleted.length / total * 100)}%;background:var(--accent);border-radius:2px;transition:width 0.3s"></div>
        </div>` : ''}
    `;

    // Projects grid
    const grid = container.querySelector('#projects-grid');
    grid.innerHTML = '';

    appState.allLists.forEach(list => {
        const listTodos = appState.allTodos.filter(t => t.listId === list.id);
        const listCompleted = listTodos.filter(t => t.completed).length;
        const listTotal = listTodos.length;
        const progress = listTotal > 0 ? Math.round(listCompleted / listTotal * 100) : 0;

        const card = document.createElement('button');
        card.className = 'glass-sm p-4 text-left w-full';
        card.style.cssText = 'cursor:pointer;transition:border-color 0.15s';
        card.innerHTML = `
            <div class="flex items-center gap-2 mb-3">
                <div style="width:32px;height:32px;border-radius:10px;background:${list.color}20;display:flex;align-items:center;justify-content:center">
                    <span class="material-symbols-outlined" style="font-size:18px;color:${list.color}">${list.isDefault ? 'inbox' : 'folder'}</span>
                </div>
            </div>
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">${escapeHtml(list.name)}</div>
            <div style="font-size:12px;color:var(--text-tertiary)">${listTotal} Aufgaben</div>
            ${listTotal > 0 ? `
            <div style="margin-top:8px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
                <div style="height:100%;width:${progress}%;background:${list.color};border-radius:2px"></div>
            </div>` : ''}
        `;
        card.addEventListener('click', () => navigate('project', { id: list.id }));
        grid.appendChild(card);
    });

    // "New List" card
    const addCard = document.createElement('button');
    addCard.className = 'glass-sm p-4 text-left w-full';
    addCard.style.cssText = 'cursor:pointer;border-style:dashed';
    addCard.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-2 py-3" style="color:var(--text-tertiary)">
            <span class="material-symbols-outlined" style="font-size:28px">add</span>
            <span style="font-size:13px;font-weight:500">Neue Liste</span>
        </div>
    `;
    addCard.addEventListener('click', openNewListModal);
    grid.appendChild(addCard);
}

function openNewListModal() {
    const existing = document.getElementById('new-list-modal');
    if (existing) existing.remove();

    const COLORS = ['#007aff', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4'];
    let selectedColor = COLORS[0];

    const modal = document.createElement('div');
    modal.id = 'new-list-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neue Liste</h2>
            <input type="text" id="new-list-name" class="glass-input w-full mb-3" placeholder="Name der Liste">
            <div class="mb-4">
                <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">Farbe</div>
                <div class="flex gap-2 flex-wrap" id="new-list-colors">
                    ${COLORS.map((c, i) => `<button class="color-btn${i === 0 ? ' active' : ''}" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};border:2px solid ${i === 0 ? 'white' : 'transparent'}"></button>`).join('')}
                </div>
            </div>
            <button id="new-list-save" class="btn-accent w-full">Erstellen</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.color-btn').forEach(b => b.style.borderColor = 'transparent');
            btn.style.borderColor = 'white';
            selectedColor = btn.dataset.color;
        });
    });

    modal.querySelector('#new-list-save').addEventListener('click', async () => {
        const name = modal.querySelector('#new-list-name').value.trim();
        if (!name) return;
        await createList(name, selectedColor);
        modal.remove();
    });

    const input = modal.querySelector('#new-list-name');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') modal.querySelector('#new-list-save').click();
        if (e.key === 'Escape') modal.remove();
    });
    setTimeout(() => input.focus(), 100);
}

