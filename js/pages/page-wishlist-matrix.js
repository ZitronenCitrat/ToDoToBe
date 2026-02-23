import { appState, onStateChange } from '../app.js';
import { onRouteChange } from '../router.js';
import { formatPrice, escapeHtml } from '../utils.js';

let initialized = false;

export function initPageWishlistMatrix() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-wishlist-matrix');
    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title">Prioritäts-Matrix</span>
        </div>
        <div class="px-5 pb-2" style="font-size:13px;color:var(--text-tertiary)">
            Nutzen × Kosten — Median als Schwellenwert
        </div>
        <div class="px-5 flex-1" id="matrix-content"></div>
    `;

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'wishlist-matrix') render(); });
}

function isActive() {
    return window.location.hash.slice(1).split('/')[0] === 'wishlist-matrix';
}

function computeMedianPrice(items) {
    const prices = items
        .filter(i => !i.purchased && i.price != null)
        .map(i => i.price)
        .sort((a, b) => a - b);
    if (prices.length === 0) return 0;
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 !== 0
        ? prices[mid]
        : (prices[mid - 1] + prices[mid]) / 2;
}

function render() {
    const content = document.querySelector('#matrix-content');
    if (!content) return;

    const activeItems = appState.allWishlistItems.filter(i => !i.purchased);

    if (activeItems.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">grid_view</span>
            <div class="empty-state-text">Keine Einträge für die Matrix</div>
        </div>`;
        return;
    }

    const median = computeMedianPrice(activeItems);

    const quadrants = {
        prioritaet: { label: 'Priorität',    sub: 'Hoch Nutzen · Günstig',   icon: 'star',     color: 'var(--accent)',      items: [] },
        sparen:     { label: 'Sparen',        sub: 'Hoch Nutzen · Teuer',     icon: 'savings',  color: '#3b82f6',            items: [] },
        niceToHave: { label: 'Nice to Have',  sub: 'Niedr. Nutzen · Günstig', icon: 'thumb_up', color: 'var(--text-tertiary)', items: [] },
        weglassen:  { label: 'Weglassen',     sub: 'Niedr. Nutzen · Teuer',   icon: 'block',    color: 'var(--priority-1)',  items: [] },
    };
    const noPrice = [];

    activeItems.forEach(item => {
        const isHighNutzen = (item.nutzen ?? 2) === 1;
        if (item.price == null) { noPrice.push(item); return; }
        const isLowCost = item.price <= median;
        if (isHighNutzen && isLowCost)       quadrants.prioritaet.items.push(item);
        else if (isHighNutzen)               quadrants.sparen.items.push(item);
        else if (isLowCost)                  quadrants.niceToHave.items.push(item);
        else                                 quadrants.weglassen.items.push(item);
    });

    let html = '<div class="matrix-grid">';
    for (const q of Object.values(quadrants)) {
        html += `<div class="matrix-quadrant glass-sm p-3">
            <div class="matrix-quadrant-header">
                <span class="material-symbols-outlined" style="color:${q.color};font-size:18px;flex-shrink:0">${q.icon}</span>
                <div>
                    <div style="font-size:13px;font-weight:700;color:${q.color}">${q.label}</div>
                    <div style="font-size:10px;color:var(--text-tertiary)">${q.sub}</div>
                </div>
            </div>`;
        if (q.items.length === 0) {
            html += `<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:12px 0">–</div>`;
        } else {
            q.items.forEach(item => {
                html += `<div class="matrix-item">
                    <span class="matrix-item-title">${escapeHtml(item.title)}</span>
                    ${item.price != null ? `<span class="matrix-item-price">${formatPrice(item.price)}</span>` : ''}
                </div>`;
            });
        }
        html += '</div>';
    }
    html += '</div>';

    if (median > 0) {
        html += `<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:8px 0 8px">
            Median-Preis: ${formatPrice(median)}
        </div>`;
    }

    if (noPrice.length > 0) {
        html += `<div class="glass-sm p-3 mb-4">
            <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);margin-bottom:8px">Ohne Preis</div>`;
        noPrice.forEach(item => {
            html += `<div class="matrix-item"><span class="matrix-item-title">${escapeHtml(item.title)}</span></div>`;
        });
        html += '</div>';
    }

    content.innerHTML = html;
}
