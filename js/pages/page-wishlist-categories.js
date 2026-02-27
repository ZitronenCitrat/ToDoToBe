import { appState, onStateChange } from '../app.js';
import { onRouteChange } from '../router.js';
import { formatPrice, escapeHtml } from '../utils.js';

let initialized = false;

const CATEGORY_ICONS = {
    'Film': 'movie', 'Spiel': 'sports_esports', 'Hardware': 'memory',
    'Buch': 'menu_book', 'Kleidung': 'checkroom', 'Sonstiges': 'category'
};

export function initPageWishlistCategories() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-wishlist-categories');

    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title">Kategorien</span>
        </div>
        <div class="px-5 flex-1" id="wishlist-cat-content"></div>
    `;

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'wishlist-categories') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'wishlist-categories'; }

function render() {
    const content = document.querySelector('#wishlist-cat-content');
    if (!content) return;

    const items = appState.allWishlistItems;

    if (items.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">category</span>
            <div class="empty-state-text">Noch keine Einträge</div>
        </div>`;
        return;
    }

    // Group by category
    const groups = {};
    items.forEach(item => {
        const cat = item.category || 'Sonstiges';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    });

    let html = '';

    Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).forEach(([cat, catItems]) => {
        const icon = CATEGORY_ICONS[cat] || 'category';
        const unpurchased = catItems.filter(i => !i.purchased);
        const purchasedCount = catItems.filter(i => i.purchased).length;

        html += `<div class="glass-sm mb-3">
            <div class="p-4">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined" style="color:var(--accent)">${icon}</span>
                        <span style="font-size:16px;font-weight:600">${escapeHtml(cat)}</span>
                    </div>
                    <span style="font-size:13px;color:var(--text-tertiary)">${catItems.length} Einträge</span>
                </div>
                <div class="flex items-center gap-4" style="font-size:13px;color:var(--text-secondary)">
                    <span>${unpurchased.length} offen</span>
                    <span>${purchasedCount} gekauft</span>
                </div>
            </div>
            <div style="border-top:1px solid var(--surface-border)">`;

        catItems.filter(i => !i.purchased).forEach(item => {
            html += `<div class="flex items-center justify-between px-4 py-2" style="border-bottom:1px solid var(--surface-border)">
                <div style="font-size:14px;font-weight:500">${escapeHtml(item.title)}</div>
                ${item.price != null ? `<span style="font-size:13px;color:var(--accent)">${formatPrice(item.price)}</span>` : ''}
            </div>`;
        });

        if (purchasedCount > 0) {
            html += `<div class="px-4 py-2" style="font-size:12px;color:var(--text-tertiary)">${purchasedCount} gekaufte Einträge</div>`;
        }

        html += '</div></div>';
    });

    content.innerHTML = html;
}
