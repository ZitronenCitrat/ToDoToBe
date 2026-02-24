import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange } from '../router.js';
import { formatPrice, escapeHtml, escapeAttr, toInputDate, toDate } from '../utils.js';
import { addWishlistItem, updateWishlistItem, toggleWishlistItem, deleteWishlistItem } from '../db.js';

let initialized = false;
let currentCategory = 'all';
let currentSort = 'nutzen';

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

    container.querySelector('#wishlist-add-btn').addEventListener('click', () => openWishlistModal());
    container.querySelector('#wishlist-sort-btn').addEventListener('click', cycleSort);
    registerFabAction('wishlist', () => openWishlistModal());

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'wishlist') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'wishlist'; }

function cycleSort() {
    const sorts = ['nutzen', 'alpha', 'price'];
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
        `<button class="tab-btn ${currentCategory === f.key ? 'active' : ''}" data-filter="${escapeAttr(f.key)}">${escapeHtml(f.label)}</button>`
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

    // Filter by category
    if (currentCategory !== 'all') {
        items = items.filter(i => i.category === currentCategory);
    }

    const active = items.filter(i => !i.purchased);
    const purchased = items.filter(i => i.purchased);

    // Sort active items
    if (currentSort === 'nutzen') {
        active.sort((a, b) => (b.nutzen || 0) - (a.nutzen || 0));
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

    const sortLabel = currentSort === 'nutzen' ? 'Nutzen' : currentSort === 'alpha' ? 'A–Z' : 'Preis';

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

    // Wire purchase toggle
    content.querySelectorAll('[data-toggle-purchase]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = appState.allWishlistItems.find(i => i.id === el.dataset.togglePurchase);
            if (item) toggleWishlistItem(item.id, !item.purchased);
        });
    });

    // Wire edit
    content.querySelectorAll('[data-edit-wish]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = appState.allWishlistItems.find(i => i.id === el.dataset.editWish);
            if (item) openWishlistModal(item);
        });
    });

    // Wire delete
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

function renderStars(nutzen) {
    const n = nutzen || 0;
    return Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < n ? '#a855f7' : 'var(--text-tertiary)'}">★</span>`
    ).join('');
}

function renderWishlistCard(item, isPurchased = false) {
    const icon = CATEGORY_ICONS[item.category] || 'category';
    const titleStyle = isPurchased ? 'text-decoration:line-through;color:var(--text-tertiary)' : '';

    // Date display
    let dateStr = '';
    if (item.date) {
        let d;
        if (typeof item.date === 'string') {
            d = new Date(item.date + 'T00:00:00');
        } else {
            d = toDate(item.date);
        }
        if (d && !isNaN(d)) {
            dateStr = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
        }
    }

    return `<div class="wishlist-card glass-sm p-3 mb-2 flex items-center gap-3" data-id="${escapeAttr(item.id)}">
        <div class="todo-checkbox ${isPurchased ? 'checked' : ''}" data-toggle-purchase="${escapeAttr(item.id)}" style="cursor:pointer;flex-shrink:0"></div>
        <div class="flex-1 min-w-0">
            <div style="font-size:14px;font-weight:500;${titleStyle}">${escapeHtml(item.title)}</div>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--surface-hover);color:var(--text-secondary)">
                    <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">${icon}</span>
                    ${escapeHtml(item.category || 'Sonstiges')}
                </span>
                ${item.price != null ? `<span style="font-size:12px;color:var(--accent);font-weight:600">${formatPrice(item.price)}</span>` : ''}
                <span style="font-size:13px;letter-spacing:1px">${renderStars(item.nutzen)}</span>
                ${dateStr ? `<span style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(dateStr)}</span>` : ''}
            </div>
        </div>
        <div class="flex gap-1">
            <button class="icon-btn" data-edit-wish="${escapeAttr(item.id)}" style="width:28px;height:28px">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-secondary)">edit</span>
            </button>
            <button class="icon-btn" data-delete-wish="${escapeAttr(item.id)}" style="width:28px;height:28px">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary)">close</span>
            </button>
        </div>
    </div>`;
}

function openWishlistModal(existing = null) {
    const old = document.getElementById('wishlist-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'wishlist-modal';
    modal.className = 'modal-overlay';

    const currentNutzen = existing?.nutzen ?? 3;

    // Build star rating HTML (will be wired after append)
    function starsHtml(selected) {
        return Array.from({ length: 5 }, (_, i) =>
            `<button class="wish-star-btn" data-star="${i + 1}" type="button" style="
                background:none;border:none;cursor:pointer;font-size:28px;padding:2px 4px;
                color:${i < selected ? '#a855f7' : 'var(--text-tertiary)'};
                transition:color 0.15s;
            ">★</button>`
        ).join('');
    }

    // Date pre-fill
    let existingDate = '';
    if (existing?.date) {
        if (typeof existing.date === 'string') {
            existingDate = existing.date;
        } else {
            existingDate = toInputDate(existing.date) || '';
        }
    }

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">${existing ? 'Wunsch bearbeiten' : 'Neuer Wunsch'}</h2>

            <input type="text" id="wish-title" class="glass-input w-full mb-3"
                placeholder="Titel" value="${existing ? escapeAttr(existing.title || '') : ''}">

            <select id="wish-category" class="glass-select w-full mb-3">
                ${CATEGORIES.map(c => `<option value="${escapeAttr(c)}" ${existing?.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>

            <div class="flex gap-2 mb-3">
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Preis (€)</div>
                    <input type="number" id="wish-price" class="glass-input w-full"
                        placeholder="0.00" step="0.01" min="0"
                        value="${existing?.price != null ? existing.price : ''}">
                </div>
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Datum</div>
                    <input type="date" id="wish-date" class="glass-input w-full"
                        value="${existingDate}">
                </div>
            </div>

            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Nutzen (1–5 Sterne)</div>
            <div id="wish-stars" class="flex justify-center gap-1 mb-4">
                ${starsHtml(currentNutzen)}
            </div>
            <input type="hidden" id="wish-nutzen" value="${currentNutzen}">

            <textarea id="wish-notes" class="glass-textarea mb-3"
                placeholder="Notizen…" rows="2">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
            <input type="url" id="wish-url" class="glass-input w-full mb-4"
                placeholder="URL (optional)" value="${existing ? escapeAttr(existing.url || '') : ''}">

            <button id="wish-save" class="btn-accent w-full">${existing ? 'Speichern' : 'Hinzufügen'}</button>
        </div>
    `;
    document.body.appendChild(modal);

    // Wire star rating
    const starsContainer = modal.querySelector('#wish-stars');
    const nutzenInput = modal.querySelector('#wish-nutzen');

    function updateStars(selected) {
        nutzenInput.value = selected;
        starsContainer.querySelectorAll('.wish-star-btn').forEach((btn, i) => {
            btn.style.color = i < selected ? '#a855f7' : 'var(--text-tertiary)';
        });
    }

    starsContainer.querySelectorAll('.wish-star-btn').forEach(btn => {
        btn.addEventListener('click', () => updateStars(parseInt(btn.dataset.star)));
        btn.addEventListener('mouseenter', () => {
            starsContainer.querySelectorAll('.wish-star-btn').forEach((b, i) => {
                b.style.color = i < parseInt(btn.dataset.star) ? '#a855f7' : 'var(--text-tertiary)';
            });
        });
        btn.addEventListener('mouseleave', () => updateStars(parseInt(nutzenInput.value)));
    });

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#wish-save').addEventListener('click', async () => {
        const title = modal.querySelector('#wish-title').value.trim();
        if (!title) return;
        const priceVal = modal.querySelector('#wish-price').value;
        const dateVal = modal.querySelector('#wish-date').value;

        const data = {
            title,
            category: modal.querySelector('#wish-category').value,
            price: priceVal ? parseFloat(priceVal) : null,
            date: dateVal || null,
            nutzen: parseInt(nutzenInput.value) || 3,
            notes: modal.querySelector('#wish-notes').value,
            url: modal.querySelector('#wish-url').value.trim()
        };

        if (existing) {
            await updateWishlistItem(existing.id, data);
        } else {
            await addWishlistItem(data);
        }
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#wish-title').focus(), 100);
}
