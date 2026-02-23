import { appState, onStateChange } from '../app.js';
import { onRouteChange, back, navigate } from '../router.js';
import { todayDateStr, escapeHtml, escapeAttr } from '../utils.js';
import { addHabit, deleteHabit, toggleHabitLog } from '../db.js';

let initialized = false;

const HABIT_ICONS = [
    'fitness_center', 'self_improvement', 'water_drop', 'menu_book',
    'bedtime', 'directions_run', 'nutrition', 'code', 'brush',
    'music_note', 'language', 'spa'
];

export function initPageHabits() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-habits');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="habits-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <span class="page-header-title">Gewohnheiten</span>
            <div class="page-header-actions">
                <button class="icon-btn" id="habits-add-btn">
                    <span class="material-symbols-outlined">add</span>
                </button>
            </div>
        </div>
        <div class="px-5 flex-1" id="habits-content"></div>
    `;

    container.querySelector('#habits-back-btn').addEventListener('click', () => navigate('today'));
    container.querySelector('#habits-add-btn').addEventListener('click', openAddHabitModal);

    onStateChange(() => {
        if (isActive()) renderHabits();
    });
    onRouteChange((route) => {
        if (route === 'habits') renderHabits();
    });
}

function isActive() {
    return window.location.hash.slice(1).split('/')[0] === 'habits';
}

function renderHabits() {
    const content = document.querySelector('#habits-content');
    if (!content) return;

    const habits = appState.allHabits.filter(h => !h.archived);
    const today = todayDateStr();

    if (habits.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">self_improvement</span>
                <div class="empty-state-text">Noch keine Gewohnheiten</div>
            </div>`;
        return;
    }

    let html = '<div class="grid grid-cols-2 gap-3 mb-6">';
    habits.forEach(habit => {
        const isCompleted = appState.habitLogs.some(
            l => l.habitId === habit.id && l.date === today && l.completed
        );
        html += `
            <div class="habit-card ${isCompleted ? 'done' : ''}" data-habit-id="${habit.id}">
                <div class="habit-card-circle ${isCompleted ? 'completed' : ''}" data-toggle="${habit.id}">
                    <span class="material-symbols-outlined">${escapeHtml(habit.icon || 'fitness_center')}</span>
                </div>
                <div class="habit-card-title">${escapeHtml(habit.title)}</div>
                <div class="habit-card-streak">
                    <span class="material-symbols-outlined" style="font-size:14px">local_fire_department</span>
                    ${habit.currentStreak || 0} Tage
                </div>
                <button class="habit-delete-btn" data-delete="${habit.id}">
                    <span class="material-symbols-outlined" style="font-size:16px">close</span>
                </button>
            </div>`;
    });
    html += '</div>';

    // Weekly heatmap
    html += '<div class="glass-sm p-4 mb-4">';
    html += '<div style="font-size:14px;font-weight:600;margin-bottom:12px">Wochenübersicht</div>';
    html += renderWeekHeatmap(habits);
    html += '</div>';

    content.innerHTML = html;

    // Wire toggle events
    content.querySelectorAll('[data-toggle]').forEach(el => {
        el.addEventListener('click', () => {
            toggleHabitLog(el.dataset.toggle, today);
        });
    });

    // Wire delete events
    content.querySelectorAll('[data-delete]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Gewohnheit löschen?')) {
                deleteHabit(el.dataset.delete);
            }
        });
    });
}

function renderWeekHeatmap(habits) {
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const today = new Date();
    // Get Monday of current week
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek);

    let html = '<div class="heatmap-grid">';
    // Header
    html += '<div class="heatmap-label"></div>';
    days.forEach(d => { html += `<div class="heatmap-day-label">${d}</div>`; });

    habits.forEach(habit => {
        html += `<div class="heatmap-label" title="${escapeAttr(habit.title)}"><span class="material-symbols-outlined" style="font-size:16px">${escapeHtml(habit.icon || 'fitness_center')}</span></div>`;
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
            const completed = appState.habitLogs.some(
                l => l.habitId === habit.id && l.date === dateStr && l.completed
            );
            html += `<div class="heatmap-dot ${completed ? 'filled' : ''}" style="${completed ? `background:${habit.color || 'var(--accent)'}` : ''}"></div>`;
        }
    });
    html += '</div>';
    return html;
}

function openAddHabitModal() {
    // Simple modal using the existing modal pattern
    const existing = document.getElementById('habit-add-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'habit-add-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neue Gewohnheit</h2>
            <input type="text" id="habit-add-title" class="glass-input w-full mb-3" placeholder="Titel">
            <div class="mb-3">
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Icon</div>
                <div class="flex gap-2 flex-wrap" id="habit-icon-picker">
                    ${HABIT_ICONS.map((icon, i) => `<button class="icon-btn habit-icon-option ${i === 0 ? 'active' : ''}" data-icon="${icon}" style="width:36px;height:36px"><span class="material-symbols-outlined" style="font-size:20px">${icon}</span></button>`).join('')}
                </div>
            </div>
            <div class="mb-4">
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Frequenz</div>
                <select id="habit-add-frequency" class="glass-select w-full">
                    <option value="daily">Täglich</option>
                    <option value="weekly">Wöchentlich</option>
                </select>
            </div>
            <button id="habit-add-save" class="btn-accent w-full">Hinzufügen</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    // Icon picker
    modal.querySelectorAll('.habit-icon-option').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.habit-icon-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    modal.querySelector('#habit-add-save').addEventListener('click', async () => {
        const title = modal.querySelector('#habit-add-title').value.trim();
        if (!title) return;
        const activeIcon = modal.querySelector('.habit-icon-option.active');
        const icon = activeIcon ? activeIcon.dataset.icon : 'fitness_center';
        const frequency = modal.querySelector('#habit-add-frequency').value;
        await addHabit({ title, icon, frequency });
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#habit-add-title').focus(), 100);
}
