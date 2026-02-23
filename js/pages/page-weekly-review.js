import { appState, onStateChange } from '../app.js';
import { onRouteChange, back } from '../router.js';
import { toDate, startOfDay, todayDateStr, escapeHtml, escapeAttr } from '../utils.js';
import { updateTodo, saveWeeklyReview, getWeeklyReview } from '../db.js';

let initialized = false;
let currentWeekReview = null;

function getWeekKey(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(
        ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
    return `${d.getFullYear()}-${String(weekNum).padStart(2, '0')}`;
}

function getLastWeekRange() {
    const today = startOfDay(new Date());
    const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - dayOfWeek);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);
    lastSunday.setHours(23, 59, 59, 999);
    return { from: lastMonday, to: lastSunday };
}

export function initPageWeeklyReview() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-weekly-review');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="review-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <span class="page-header-title">Wöchentlicher Review</span>
            <div class="page-header-actions">
                <span style="font-size:12px;color:var(--text-tertiary)" id="review-week-label"></span>
            </div>
        </div>
        <div class="px-5 flex-1" id="review-content"></div>
    `;

    container.querySelector('#review-back-btn').addEventListener('click', () => back());

    onRouteChange(async (route) => {
        if (route === 'weekly-review') {
            await loadAndRender();
        }
    });

    onStateChange(() => {
        if (window.location.hash.slice(1) === 'weekly-review') renderReview();
    });
}

async function loadAndRender() {
    const weekKey = getWeekKey();
    currentWeekReview = await getWeeklyReview(weekKey);
    renderReview();
}

function renderReview() {
    const container = document.getElementById('page-weekly-review');
    if (!container) return;

    const weekKey = getWeekKey();
    container.querySelector('#review-week-label').textContent = `KW ${weekKey.split('-')[1]}`;

    const content = container.querySelector('#review-content');
    const { from, to } = getLastWeekRange();

    // Last week completed todos
    const completedLastWeek = appState.allTodos.filter(t => {
        if (!t.completed || !t.completedAt) return false;
        const d = toDate(t.completedAt);
        return d && d >= from && d <= to;
    });

    // Current streak
    const streak = calculateStreak();

    // Habit completion rate last 7 days
    const activeHabits = appState.allHabits.filter(h => !h.archived);
    const today = startOfDay(new Date());
    let habitTotal = 0, habitDone = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        activeHabits.forEach(h => {
            habitTotal++;
            if (appState.habitLogs.some(l => l.habitId === h.id && l.date === dateStr && l.completed)) {
                habitDone++;
            }
        });
    }
    const habitRate = habitTotal > 0 ? Math.round(habitDone / habitTotal * 100) : 0;

    // Overdue todos
    const overdueTodos = appState.allTodos.filter(t => {
        if (t.completed || t.recurrence) return false;
        if (!t.dueDate) return false;
        const d = toDate(t.dueDate);
        return d && d < today;
    });

    // Undated todos (non-recurring, no date, not completed)
    const undatedTodos = appState.allTodos.filter(t =>
        !t.completed && !t.recurrence && !t.dueDate
    );

    const priorities = currentWeekReview?.priorities || ['', '', ''];

    content.innerHTML = `
        <!-- Rückblick -->
        <div class="glass p-4 mb-4">
            <div class="flex items-center gap-2 mb-3">
                <span class="material-symbols-outlined" style="color:var(--accent);font-size:20px">analytics</span>
                <span style="font-size:15px;font-weight:600">Rückblick letzte Woche</span>
            </div>
            <div class="flex gap-3">
                <div class="flex-1 glass-sm p-3 text-center">
                    <div style="font-size:26px;font-weight:700;color:var(--accent)">${completedLastWeek.length}</div>
                    <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">Erledigt</div>
                </div>
                <div class="flex-1 glass-sm p-3 text-center">
                    <div style="font-size:26px;font-weight:700;color:#ffa502">${streak}</div>
                    <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">Streak</div>
                </div>
                <div class="flex-1 glass-sm p-3 text-center">
                    <div style="font-size:26px;font-weight:700;color:#3742fa">${habitRate}%</div>
                    <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">Habits</div>
                </div>
            </div>
        </div>

        <!-- Offene Aufgaben -->
        <div class="glass p-4 mb-4">
            <div class="flex items-center gap-2 mb-3">
                <span class="material-symbols-outlined" style="color:#ff4757;font-size:20px">warning</span>
                <span style="font-size:15px;font-weight:600">Offene Aufgaben</span>
                <span style="font-size:13px;color:var(--text-tertiary)">(${overdueTodos.length + undatedTodos.length})</span>
            </div>
            <div id="review-open-tasks">
                ${overdueTodos.length === 0 && undatedTodos.length === 0 ? `
                    <div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:12px 0">Alles im Griff!</div>
                ` : ''}
                ${overdueTodos.map(t => renderOpenTask(t)).join('')}
                ${undatedTodos.length > 0 ? `
                    <div style="font-size:12px;color:var(--text-tertiary);margin:${overdueTodos.length > 0 ? '10px' : '0'} 0 4px;font-weight:500">Ohne Datum</div>
                    ${undatedTodos.map(t => renderOpenTask(t)).join('')}
                ` : ''}
            </div>
        </div>

        <!-- 3 Prioritäten -->
        <div class="glass p-4 mb-6">
            <div class="flex items-center gap-2 mb-3">
                <span class="material-symbols-outlined" style="color:var(--accent);font-size:20px">flag</span>
                <span style="font-size:15px;font-weight:600">Top 3 nächste Woche</span>
            </div>
            <div class="flex flex-col gap-3">
                ${[0,1,2].map(i => `
                    <div class="flex items-center gap-3">
                        <span style="font-size:16px;font-weight:700;color:var(--accent);min-width:20px">${i+1}</span>
                        <input
                            type="text"
                            class="glass-input flex-1"
                            placeholder="Priorität ${i+1}…"
                            id="review-priority-${i}"
                            value="${escapeAttr(priorities[i] || '')}"
                        >
                    </div>
                `).join('')}
            </div>
            <button class="btn-accent w-full mt-4" id="review-save-btn">Speichern</button>
            <div id="review-save-status" style="font-size:12px;color:var(--accent);text-align:center;margin-top:8px;min-height:18px;transition:opacity 0.3s"></div>
        </div>
    `;

    // Save button
    content.querySelector('#review-save-btn').addEventListener('click', async () => {
        const p0 = content.querySelector('#review-priority-0').value.trim();
        const p1 = content.querySelector('#review-priority-1').value.trim();
        const p2 = content.querySelector('#review-priority-2').value.trim();
        await saveWeeklyReview(weekKey, { priorities: [p0, p1, p2] });
        currentWeekReview = { priorities: [p0, p1, p2] };
        const status = content.querySelector('#review-save-status');
        status.textContent = 'Gespeichert!';
        setTimeout(() => { status.textContent = ''; }, 2000);
    });

    // Reschedule buttons
    content.querySelectorAll('[data-reschedule]').forEach(btn => {
        btn.addEventListener('click', () => {
            const todoId = btn.dataset.reschedule;
            const row = btn.closest('[data-task-row]');
            const input = row?.querySelector('input[type="date"]');
            if (input?.value) {
                updateTodo(todoId, { dueDate: input.value });
            }
        });
    });

    // Complete task buttons
    content.querySelectorAll('[data-complete-todo]').forEach(btn => {
        btn.addEventListener('click', () => {
            const todoId = btn.dataset.completeTodo;
            updateTodo(todoId, { completed: true, completedAt: new Date().toISOString() });
        });
    });
}

function renderOpenTask(todo) {
    const listInfo = appState.allLists.find(l => l.id === todo.listId);
    const today = todayDateStr();
    return `
        <div class="glass-sm p-3 mb-2 flex items-center gap-2" data-task-row="true">
            <button class="icon-btn" data-complete-todo="${todo.id}" style="color:var(--text-tertiary);flex-shrink:0">
                <span class="material-symbols-outlined" style="font-size:20px">radio_button_unchecked</span>
            </button>
            <div class="flex-1 min-w-0">
                <div style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(todo.title)}</div>
                ${listInfo ? `<div style="font-size:12px;color:var(--text-tertiary)">${escapeHtml(listInfo.name)}</div>` : ''}
            </div>
            <input type="date" value="${today}" style="font-size:11px;background:rgba(255,255,255,0.06);border:1px solid var(--surface-border);border-radius:6px;color:var(--text);padding:3px 6px;width:116px;flex-shrink:0">
            <button class="icon-btn" data-reschedule="${todo.id}" style="color:var(--accent);flex-shrink:0" title="Datum setzen">
                <span class="material-symbols-outlined" style="font-size:18px">event</span>
            </button>
        </div>
    `;
}

function calculateStreak() {
    const today = startOfDay(new Date());
    const completedDays = new Set();
    appState.allTodos.forEach(t => {
        if (t.completed && t.completedAt) {
            const d = toDate(t.completedAt);
            if (d) completedDays.add(startOfDay(d).toISOString());
        }
    });
    let streak = 0;
    let checkDate = new Date(today);
    while (completedDays.has(checkDate.toISOString())) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
}

