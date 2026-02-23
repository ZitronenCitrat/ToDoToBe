import { appState, onStateChange } from '../app.js';
import { onRouteChange } from '../router.js';
import { toDate, startOfDay, escapeHtml } from '../utils.js';

let activeFilter = '7d';
let initialized = false;

export function initPageStats() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-stats');

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-header-title">Statistiken</h1>
        </div>
        <div class="px-5 flex-1">
            <div class="flex gap-2 mb-5" id="stats-filters">
                <button class="tab-btn active" data-filter="7d">7 Tage</button>
                <button class="tab-btn" data-filter="30d">Monat</button>
                <button class="tab-btn" data-filter="all">Gesamt</button>
            </div>
            <div id="stats-streak" class="glass p-4 mb-4"></div>
            <div id="stats-chart" class="glass p-4 mb-4"></div>
            <div id="stats-breakdown" class="glass p-4 mb-4"></div>
        </div>
    `;

    // Filter buttons
    container.querySelectorAll('#stats-filters .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('#stats-filters .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderStats();
        });
    });

    onStateChange(() => {
        const hash = window.location.hash.slice(1) || 'today';
        if (hash === 'stats') renderStats();
    });

    onRouteChange((route) => {
        if (route === 'stats') renderStats();
    });

    renderStats();
}

function getFilterRange() {
    const now = startOfDay(new Date());
    if (activeFilter === '7d') {
        const start = new Date(now);
        start.setDate(start.getDate() - 6);
        return { start, end: now, days: 7 };
    } else if (activeFilter === '30d') {
        const start = new Date(now);
        start.setDate(start.getDate() - 29);
        return { start, end: now, days: 30 };
    }
    return { start: null, end: now, days: null };
}

function renderStats() {
    const container = document.getElementById('page-stats');
    if (!container) return;

    const { start, days } = getFilterRange();

    // Get completed todos in range
    const completedInRange = appState.allTodos.filter(t => {
        if (!t.completed || !t.completedAt) return false;
        if (!start) return true;
        const d = toDate(t.completedAt);
        return d && d >= start;
    });

    // Streak calculation
    const streak = calculateStreak();

    // Streak card
    container.querySelector('#stats-streak').innerHTML = `
        <div class="flex items-center gap-4">
            <div style="width:48px;height:48px;border-radius:14px;background:rgba(255,165,0,0.15);display:flex;align-items:center;justify-content:center">
                <span class="material-symbols-outlined" style="font-size:28px;color:#ffa502">local_fire_department</span>
            </div>
            <div>
                <div style="font-size:28px;font-weight:700">${streak} ${streak === 1 ? 'Tag' : 'Tage'}</div>
                <div style="font-size:13px;color:var(--text-tertiary)">Aktuelle Serie</div>
            </div>
        </div>
    `;

    // Weekly chart (last 7 days)
    renderChart(container.querySelector('#stats-chart'));

    // Breakdown by list
    renderBreakdown(container.querySelector('#stats-breakdown'), completedInRange);
}

function calculateStreak() {
    const today = startOfDay(new Date());
    let streak = 0;
    let checkDate = new Date(today);

    // Build a set of days with completed todos
    const completedDays = new Set();
    appState.allTodos.forEach(t => {
        if (t.completed && t.completedAt) {
            const d = toDate(t.completedAt);
            if (d) completedDays.add(startOfDay(d).toISOString());
        }
    });

    while (true) {
        if (completedDays.has(checkDate.toISOString())) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }

    return streak;
}

function renderChart(chartEl) {
    const today = startOfDay(new Date());
    const dayLabels = [];
    const dayCounts = [];
    let maxCount = 1;

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dayStart = startOfDay(d);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(d);
        dayLabels.push(weekday.replace('.', ''));

        const count = appState.allTodos.filter(t => {
            if (!t.completed || !t.completedAt) return false;
            const cd = toDate(t.completedAt);
            return cd && cd >= dayStart && cd < dayEnd;
        }).length;

        dayCounts.push(count);
        if (count > maxCount) maxCount = count;
    }

    chartEl.innerHTML = `
        <div style="font-size:14px;font-weight:600;margin-bottom:16px">Produktivität</div>
        <div class="flex items-end justify-between gap-2" style="height:120px">
            ${dayCounts.map((count, i) => {
                const height = Math.max(4, (count / maxCount) * 100);
                const isToday = i === 6;
                return `
                    <div class="flex flex-col items-center gap-2 flex-1">
                        <div style="font-size:11px;color:var(--text-tertiary)">${count}</div>
                        <div style="width:100%;max-width:32px;height:${height}px;border-radius:6px;
                            background:${isToday ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};
                            ${isToday ? 'box-shadow:0 0 12px var(--accent-glow)' : ''};
                            transition:height 0.3s"></div>
                        <div style="font-size:11px;color:var(--text-tertiary);font-weight:500">${dayLabels[i]}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderBreakdown(breakdownEl, completedInRange) {
    const listStats = appState.allLists.map(list => {
        const total = appState.allTodos.filter(t => t.listId === list.id).length;
        const completed = completedInRange.filter(t => t.listId === list.id).length;
        const active = appState.allTodos.filter(t => t.listId === list.id && !t.completed).length;
        return { ...list, total, completed, active };
    }).filter(l => l.total > 0);

    breakdownEl.innerHTML = `
        <div style="font-size:14px;font-weight:600;margin-bottom:12px">Pro Liste</div>
        ${listStats.length === 0 ? '<div style="font-size:13px;color:var(--text-tertiary)">Keine Daten</div>' :
        listStats.map(l => {
            const progress = l.total > 0 ? Math.round((l.total - l.active) / l.total * 100) : 0;
            return `
                <div class="mb-3">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-2">
                            <div style="width:8px;height:8px;border-radius:50%;background:${l.color}"></div>
                            <span style="font-size:14px">${escapeHtml(l.name)}</span>
                        </div>
                        <span style="font-size:13px;color:var(--text-tertiary)">${progress}%</span>
                    </div>
                    <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
                        <div style="height:100%;width:${progress}%;background:${l.color};border-radius:2px;transition:width 0.3s"></div>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

