import { appState, onStateChange } from '../app.js';
import { onRouteChange } from '../router.js';
import { escapeHtml } from '../utils.js';

let initialized = false;

const CATEGORY_ICONS = {
    'Film': 'movie', 'Spiel': 'sports_esports', 'Hardware': 'memory',
    'Buch': 'menu_book', 'Kleidung': 'checkroom', 'Sonstiges': 'category'
};

export function initPageWishlistMatrix() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-wishlist-matrix');
    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title">Übersicht</span>
        </div>
        <div class="px-5 flex-1" id="matrix-content"></div>
    `;

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'wishlist-matrix') render(); });
}

function isActive() {
    return window.location.hash.slice(1).split('/')[0] === 'wishlist-matrix';
}

function renderStars(nutzen) {
    const n = nutzen || 0;
    return Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < n ? '#a855f7' : 'var(--text-tertiary)'}">★</span>`
    ).join('');
}

function render() {
    const content = document.querySelector('#matrix-content');
    if (!content) return;

    const allItems = appState.allWishlistItems;

    if (allItems.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">bar_chart</span>
            <div class="empty-state-text">Noch keine Wünsche</div>
        </div>`;
        return;
    }

    const active = allItems.filter(i => !i.purchased);
    const purchased = allItems.filter(i => i.purchased);

    // --- Summary cards ---
    const purchaseRate = allItems.length > 0 ? Math.round((purchased.length / allItems.length) * 100) : 0;
    const avgNutzen = active.length > 0
        ? (active.reduce((s, i) => s + (i.nutzen || 0), 0) / active.length).toFixed(1)
        : '–';

    let html = `<div class="flex gap-3 mb-4">
        <div class="glass-sm p-3 flex-1 text-center">
            <div style="font-size:24px;font-weight:700;color:var(--accent)">${active.length}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Offen</div>
        </div>
        <div class="glass-sm p-3 flex-1 text-center">
            <div style="font-size:24px;font-weight:700;color:#a855f7">${purchased.length}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Gekauft</div>
        </div>
        <div class="glass-sm p-3 flex-1 text-center">
            <div style="font-size:24px;font-weight:700;color:var(--text-secondary)">${avgNutzen}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Ø Nutzen</div>
        </div>
    </div>`;

    // --- Category bar chart ---
    const groups = {};
    active.forEach(item => {
        const cat = item.category || 'Sonstiges';
        if (!groups[cat]) groups[cat] = { count: 0, nutzenSum: 0, nutzenCount: 0 };
        groups[cat].count++;
        if (item.nutzen) { groups[cat].nutzenSum += item.nutzen; groups[cat].nutzenCount++; }
    });

    const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => b.count - a.count);
    const maxCount = sortedGroups.length > 0 ? sortedGroups[0][1].count : 1;

    if (sortedGroups.length > 0) {
        html += `<div class="glass-sm p-4 mb-4">
            <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-secondary)">Kategorien</div>`;

        sortedGroups.forEach(([cat, data]) => {
            const icon = CATEGORY_ICONS[cat] || 'category';
            const barWidth = Math.round((data.count / maxCount) * 100);
            const avgN = data.nutzenCount > 0 ? (data.nutzenSum / data.nutzenCount).toFixed(1) : '–';
            // Bar color: accent with opacity based on nutzen avg (higher nutzen = more vivid)
            const opacity = data.nutzenCount > 0 ? 0.3 + (data.nutzenSum / data.nutzenCount / 5) * 0.7 : 0.4;

            html += `<div class="mb-3">
                <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined" style="font-size:14px;color:var(--accent)">${icon}</span>
                        <span style="font-size:13px;font-weight:500">${escapeHtml(cat)}</span>
                    </div>
                    <div class="flex items-center gap-3" style="font-size:12px;color:var(--text-tertiary)">
                        <span style="color:#a855f7;font-size:11px">${avgN} ★</span>
                        <span>${data.count} ${data.count === 1 ? 'Wunsch' : 'Wünsche'}</span>
                    </div>
                </div>
                <div style="height:8px;border-radius:4px;background:var(--surface-hover);overflow:hidden">
                    <div style="height:100%;width:${barWidth}%;border-radius:4px;background:rgba(var(--accent-rgb),${opacity});transition:width 0.3s ease"></div>
                </div>
            </div>`;
        });

        html += '</div>';
    }

    // --- Top Wünsche by nutzen ---
    const topWishes = [...active]
        .filter(i => i.nutzen && i.nutzen >= 4)
        .sort((a, b) => (b.nutzen || 0) - (a.nutzen || 0))
        .slice(0, 5);

    if (topWishes.length > 0) {
        html += `<div class="glass-sm p-4 mb-4">
            <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-secondary)">Top Wünsche</div>`;

        topWishes.forEach((item, idx) => {
            const icon = CATEGORY_ICONS[item.category] || 'category';
            html += `<div class="flex items-center gap-3 mb-2">
                <div style="width:22px;height:22px;border-radius:50%;background:rgba(var(--accent-rgb),0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <span style="font-size:11px;font-weight:700;color:var(--accent)">${idx + 1}</span>
                </div>
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary);flex-shrink:0">${icon}</span>
                <div style="flex:1;min-width:0">
                    <div style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.title)}</div>
                </div>
                <div style="font-size:13px;letter-spacing:1px;flex-shrink:0">${renderStars(item.nutzen)}</div>
            </div>`;
        });

        html += '</div>';
    }

    // --- Purchase progress ring ---
    if (allItems.length > 0) {
        const radius = 36;
        const circumference = 2 * Math.PI * radius;
        const progress = circumference - (purchaseRate / 100) * circumference;

        html += `<div class="glass-sm p-4 mb-4 flex items-center gap-4">
            <svg width="90" height="90" style="flex-shrink:0">
                <circle cx="45" cy="45" r="${radius}" fill="none" stroke="var(--surface-hover)" stroke-width="8"/>
                <circle cx="45" cy="45" r="${radius}" fill="none" stroke="#a855f7" stroke-width="8"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${progress}"
                    stroke-linecap="round"
                    transform="rotate(-90 45 45)"/>
                <text x="45" y="50" text-anchor="middle" style="fill:var(--text-primary);font-size:16px;font-weight:700">${purchaseRate}%</text>
            </svg>
            <div>
                <div style="font-size:15px;font-weight:600">Fortschritt</div>
                <div style="font-size:13px;color:var(--text-tertiary);margin-top:4px">${purchased.length} von ${allItems.length} Wünschen erfüllt</div>
            </div>
        </div>`;
    }

    content.innerHTML = html;
}
