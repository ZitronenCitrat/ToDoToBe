import { appState, onStateChange } from '../app.js';
import { onRouteChange } from '../router.js';
import { formatPrice, escapeHtml, escapeAttr } from '../utils.js';
import {
    addWishlistCategory, updateWishlistCategory, deleteWishlistCategory,
    updateWishlistItem
} from '../db.js';

let initialized = false;

export function initPageWishlistCategories() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-wishlist-categories');

    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title page-title">Kategorien</span>
            <div class="page-header-actions">
                <button class="icon-btn" id="wishlist-cat-manage-btn">
                    <span class="material-symbols-outlined">tune</span>
                </button>
            </div>
        </div>
        <div class="px-5 flex-1" id="wishlist-cat-content"></div>
    `;

    container.querySelector('#wishlist-cat-manage-btn').addEventListener('click', openManageModal);

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'wishlist-categories') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'wishlist-categories'; }

function getCatIcon(catName) {
    const cat = appState.wishlistCategories.find(c => c.name === catName);
    return cat?.icon || 'category';
}

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
        const icon = getCatIcon(cat);
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

// ===== Manage Categories Modal =====

function openManageModal() {
    const old = document.getElementById('wl-cat-manage-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'wl-cat-manage-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);

    renderManageModal(modal);
}

function renderManageModal(modal) {
    const cats = appState.wishlistCategories;

    const listHtml = cats.map(cat => `
        <div class="wl-cat-row flex items-center gap-3 py-2" style="border-bottom:1px solid var(--surface-border)" data-cat-id="${escapeAttr(cat.id)}">
            <span class="material-symbols-outlined" style="color:var(--accent);font-size:20px">${escapeHtml(cat.icon || 'category')}</span>
            <span style="flex:1;font-size:15px">${escapeHtml(cat.name)}</span>
            ${!cat.locked ? `
                <button class="icon-btn wl-cat-edit-btn" data-cat-id="${escapeAttr(cat.id)}">
                    <span class="material-symbols-outlined" style="font-size:18px">edit</span>
                </button>
                <button class="icon-btn wl-cat-delete-btn" data-cat-id="${escapeAttr(cat.id)}" data-cat-name="${escapeAttr(cat.name)}">
                    <span class="material-symbols-outlined" style="font-size:18px;color:var(--priority-1)">delete</span>
                </button>
            ` : ''}
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Kategorien verwalten</h2>
            <div id="wl-cat-list" class="mb-4">${listHtml}</div>
            <div class="flex gap-2 items-center">
                <input type="text" id="new-cat-name" placeholder="Name" class="glass-input" style="flex:1">
                <input type="text" id="new-cat-icon" placeholder="Icon-Name" class="glass-input" style="width:120px">
                <button class="btn-accent" id="new-cat-add-btn">
                    <span class="material-symbols-outlined">add</span>
                </button>
            </div>
        </div>
    `;

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    // Add new category
    modal.querySelector('#new-cat-add-btn').addEventListener('click', async () => {
        const name = modal.querySelector('#new-cat-name').value.trim();
        const icon = modal.querySelector('#new-cat-icon').value.trim() || 'category';
        if (!name) return;
        await addWishlistCategory(name, icon);
        modal.querySelector('#new-cat-name').value = '';
        modal.querySelector('#new-cat-icon').value = '';
        renderManageModal(modal);
    });

    // Edit buttons
    modal.querySelectorAll('.wl-cat-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const catId = btn.dataset.catId;
            const cat = appState.wishlistCategories.find(c => c.id === catId);
            if (!cat) return;
            const row = modal.querySelector(`.wl-cat-row[data-cat-id="${CSS.escape(catId)}"]`);
            row.innerHTML = `
                <input type="text" class="glass-input" style="flex:1" value="${escapeAttr(cat.name)}">
                <input type="text" class="glass-input" style="width:100px" value="${escapeAttr(cat.icon || '')}">
                <button class="btn-accent wl-cat-save-btn" style="padding:6px 10px">
                    <span class="material-symbols-outlined" style="font-size:16px">check</span>
                </button>
            `;
            row.style.display = 'flex';
            row.querySelector('.wl-cat-save-btn').addEventListener('click', async () => {
                const inputs = row.querySelectorAll('input');
                const newName = inputs[0].value.trim();
                const newIcon = inputs[1].value.trim() || 'category';
                if (!newName) return;
                await updateWishlistCategory(catId, newName, newIcon);
                renderManageModal(modal);
            });
        });
    });

    // Delete buttons
    modal.querySelectorAll('.wl-cat-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const catId = btn.dataset.catId;
            const catName = btn.dataset.catName;
            const affected = appState.allWishlistItems.filter(i => i.category === catName);
            if (affected.length > 0) {
                if (!confirm(`${affected.length} Einträge in dieser Kategorie werden zu 'Sonstiges'. Fortfahren?`)) return;
                for (const item of affected) {
                    await updateWishlistItem(item.id, { category: 'Sonstiges' });
                }
            }
            await deleteWishlistCategory(catId);
            renderManageModal(modal);
        });
    });
}
