import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange } from '../router.js';
import { formatPrice, escapeHtml } from '../utils.js';
import { addWishlistItem, toggleWishlistItem, deleteWishlistItem } from '../db.js';

let initialized = false;
let currentCategory = 'all';
let currentSort = 'priority';

const CATEGORIES = ['Film', 'Spiel', 'Hardware', 'Buch', 'Kleidung', 'Sonstiges'];
const CATEGORY_ICONS = {
    'Film': 'movie', 'Spiel': 'sports_esports', 'Hardware': 'memory',
    'Buch': 'menu_book', 'Kleidung': 'checkroom', 'Sonstiges': 'category'
};

export function initPageWishlist() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-wishlist');

    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title">Wunschliste</span>
            <div class="page-header-actions">
                <button class="icon-btn" id="wishlist-sort-btn">
                    <span class="material-symbols-outlined">sort</span>
                </button>
                <button class="icon-btn" id="wishlist-add-btn">
                    <span class="material-symbols-outlined">add</span>
                </button>
            </div>
        </div>
        <div class="px-5 mb-3 flex gap-2 flex-wrap" id="wishlist-filters"></div>
        <div class="px-5 flex-1" id="wishlist-content"></div>
    `;

    container.querySelector('#wishlist-add-btn').addEventListener('click', openAddWishlistModal);
    container.querySelector('#wishlist-sort-btn').addEventListener('click', cycleSort);
    registerFabAction('wishlist', openAddWishlistModal);

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'wishlist') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'wishlist'; }

function cycleSort() {
    const sorts = ['priority', 'alpha', 'price'];
    const idx = sorts.indexOf(currentSort);
    currentSort = sorts[(idx + 1) % sorts.length];
    render();
}

function render() {
    renderFilters();
    renderItems();
}

function renderFilters() {
    const filtersEl = document.querySelector('#wishlist-filters');
    if (!filtersEl) return;

    const filters = [{ key: 'all', label: 'Alle' }, ...CATEGORIES.map(c => ({ key: c, label: c }))];

    filtersEl.innerHTML = filters.map(f =>
        `<button class="tab-btn ${currentCategory === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>`
    ).join('');

    filtersEl.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentCategory = btn.dataset.filter;
            render();
        });
    });
}

function renderItems() {
    const content = document.querySelector('#wishlist-content');
    if (!content) return;

    let items = [...appState.allWishlistItems];

    // Filter
    if (currentCategory !== 'all') {
        items = items.filter(i => i.category === currentCategory);
    }

    const active = items.filter(i => !i.purchased);
    const purchased = items.filter(i => i.purchased);

    // Sort active items
    if (currentSort === 'priority') {
        active.sort((a, b) => (a.priority || 4) - (b.priority || 4));
    } else if (currentSort === 'alpha') {
        active.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (currentSort === 'price') {
        active.sort((a, b) => (b.price || 0) - (a.price || 0));
    }

    if (items.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">shopping_bag</span>
            <div class="empty-state-text">Noch keine Wünsche</div>
        </div>`;
        return;
    }

    const sortLabel = currentSort === 'priority' ? 'Priorität' : currentSort === 'alpha' ? 'A–Z' : 'Preis';

    let html = `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Sortierung: ${sortLabel}</div>`;

    active.forEach(item => {
        html += renderWishlistCard(item);
    });

    // Purchased section
    if (purchased.length > 0) {
        html += `<div class="toggle-completed-btn" id="wishlist-toggle-purchased" style="cursor:pointer;margin-top:12px">
            <span class="toggle-arrow" id="wishlist-purchased-arrow">&#9654;</span>
            Gekauft (${purchased.length})
        </div>
        <div id="wishlist-purchased-list" class="hidden">`;
        purchased.forEach(item => {
            html += renderWishlistCard(item, true);
        });
        html += '</div>';
    }

    content.innerHTML = html;

    // Wire events
    content.querySelectorAll('[data-toggle-purchase]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = appState.allWishlistItems.find(i => i.id === el.dataset.togglePurchase);
            if (item) toggleWishlistItem(item.id, !item.purchased);
        });
    });

    content.querySelectorAll('[data-delete-wish]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Eintrag löschen?')) deleteWishlistItem(el.dataset.deleteWish);
        });
    });

    // Purchased toggle
    const toggleBtn = content.querySelector('#wishlist-toggle-purchased');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const list = content.querySelector('#wishlist-purchased-list');
            const arrow = content.querySelector('#wishlist-purchased-arrow');
            if (list) list.classList.toggle('hidden');
            if (arrow) arrow.classList.toggle('open');
        });
    }
}

function renderWishlistCard(item, isPurchased = false) {
    const icon = CATEGORY_ICONS[item.category] || 'category';
    const priorityClass = !isPurchased && item.priority && item.priority < 4 ? `priority-${item.priority}` : '';
    const hasSavings = item.originalPrice != null && item.price != null && item.originalPrice > item.price;
    const savings = hasSavings ? item.originalPrice - item.price : 0;
    const savingsPct = hasSavings ? Math.round((savings / item.originalPrice) * 100) : 0;
    const savingsBadge = hasSavings
        ? `<span class="savings-badge">\u2212${formatPrice(savings)} (${savingsPct}%)</span>`
        : '';

    return `<div class="wishlist-card glass-sm p-3 mb-2 flex items-center gap-3 ${priorityClass}" data-id="${item.id}">
        <div class="todo-checkbox ${isPurchased ? 'checked' : ''}" data-toggle-purchase="${item.id}" style="cursor:pointer;flex-shrink:0"></div>
        <div class="flex-1 min-w-0">
            <div style="font-size:14px;font-weight:500;${isPurchased ? 'text-decoration:line-through;color:var(--text-tertiary)' : ''}">${escapeHtml(item.title)}</div>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--surface-hover);color:var(--text-secondary)">
                    <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">${icon}</span>
                    ${escapeHtml(item.category || 'Sonstiges')}
                </span>
                ${item.price != null ? `<span style="font-size:12px;color:var(--accent);font-weight:600">${formatPrice(item.price)}</span>` : ''}
                ${savingsBadge}
            </div>
        </div>
        <button class="icon-btn" data-delete-wish="${item.id}" style="width:28px;height:28px;border:none;background:none">
            <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary)">close</span>
        </button>
    </div>`;
}

function openAddWishlistModal() {
    const existing = document.getElementById('wishlist-add-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'wishlist-add-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neuer Wunsch</h2>
            <input type="text" id="wish-title" class="glass-input w-full mb-3" placeholder="Titel">
            <select id="wish-category" class="glass-select w-full mb-3">
                ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <div class="flex gap-2 mb-3">
                <input type="number" id="wish-price" class="glass-input flex-1" placeholder="Aktueller Preis (€)" step="0.01" min="0">
                <input type="number" id="wish-original-price" class="glass-input flex-1" placeholder="Originalpreis (€)" step="0.01" min="0">
            </div>
            <select id="wish-nutzen" class="glass-select w-full mb-3">
                <option value="2">Nutzen: Niedrig</option>
                <option value="1">Nutzen: Hoch</option>
            </select>
            <div class="flex gap-2 mb-3 flex-wrap" id="wish-priority">
                <button data-priority="1" class="priority-chip p1">Dringend</button>
                <button data-priority="2" class="priority-chip p2">Hoch</button>
                <button data-priority="3" class="priority-chip p3">Mittel</button>
                <button data-priority="4" class="priority-chip p4 active">Keine</button>
            </div>
            <textarea id="wish-notes" class="glass-textarea mb-3" placeholder="Notizen…" rows="2"></textarea>
            <input type="url" id="wish-url" class="glass-input w-full mb-4" placeholder="URL (optional)">
            <button id="wish-save" class="btn-accent w-full">Hinzufügen</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelectorAll('#wish-priority [data-priority]').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('#wish-priority [data-priority]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    modal.querySelector('#wish-save').addEventListener('click', async () => {
        const title = modal.querySelector('#wish-title').value.trim();
        if (!title) return;
        const priceVal = modal.querySelector('#wish-price').value;
        const originalPriceVal = modal.querySelector('#wish-original-price').value;
        const priorityBtn = modal.querySelector('#wish-priority .active');
        await addWishlistItem({
            title,
            category: modal.querySelector('#wish-category').value,
            price: priceVal ? parseFloat(priceVal) : null,
            originalPrice: originalPriceVal ? parseFloat(originalPriceVal) : null,
            nutzen: parseInt(modal.querySelector('#wish-nutzen').value) || 2,
            priority: priorityBtn ? parseInt(priorityBtn.dataset.priority) : 4,
            notes: modal.querySelector('#wish-notes').value,
            url: modal.querySelector('#wish-url').value.trim()
        });
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#wish-title').focus(), 100);
}
