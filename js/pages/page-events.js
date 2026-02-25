import { appState, onStateChange } from '../app.js';
import { onRouteChange, back } from '../router.js';
import { escapeHtml, escapeAttr, toDate, toInputDate, startOfDay } from '../utils.js';
import { addEvent, updateEvent, deleteEvent } from '../db.js';

let initialized = false;

export function initPageEvents() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-events');
    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="events-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 class="page-header-title" style="flex:1;margin-left:8px">Termine</h1>
            <button class="icon-btn" id="events-add-btn">
                <span class="material-symbols-outlined">add</span>
            </button>
        </div>
        <div class="px-5 flex-1" id="events-content"></div>
    `;

    container.querySelector('#events-back-btn').addEventListener('click', back);
    container.querySelector('#events-add-btn').addEventListener('click', () => openEventModal());

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'events') render(); });
}

function isActive() {
    return window.location.hash.slice(1).split('/')[0] === 'events';
}

function render() {
    const content = document.getElementById('events-content');
    if (!content) return;

    const events = [...appState.allEvents];

    if (events.length === 0) {
        content.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">event_busy</span>
            <div class="empty-state-text">Keine Termine vorhanden</div>
        </div>`;
        return;
    }

    // Sort: upcoming first, then past
    const today = startOfDay(new Date());

    function getEventDate(ev) {
        if (!ev.date) return null;
        if (typeof ev.date === 'string') return new Date(ev.date + 'T00:00:00');
        return toDate(ev.date);
    }

    events.sort((a, b) => {
        const da = getEventDate(a);
        const db = getEventDate(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
    });

    // Group into upcoming / past
    const upcoming = events.filter(ev => {
        const d = getEventDate(ev);
        return !d || startOfDay(d) >= today;
    });
    const past = events.filter(ev => {
        const d = getEventDate(ev);
        return d && startOfDay(d) < today;
    });

    let html = '';

    if (upcoming.length > 0) {
        html += `<div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Bevorstehend</div>`;
        upcoming.forEach(ev => { html += renderEventCard(ev); });
    }

    if (past.length > 0) {
        html += `<div class="toggle-completed-btn" id="events-toggle-past" style="cursor:pointer;margin-top:12px">
            <span class="toggle-arrow" id="events-past-arrow">&#9654;</span>
            Vergangen (${past.length})
        </div>
        <div id="events-past-list" class="hidden">`;
        past.forEach(ev => { html += renderEventCard(ev, true); });
        html += '</div>';
    }

    content.innerHTML = html;

    // Wire edit buttons
    content.querySelectorAll('[data-edit-event]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ev = appState.allEvents.find(ev => ev.id === btn.dataset.editEvent);
            if (ev) openEventModal(ev);
        });
    });

    // Wire delete buttons
    content.querySelectorAll('[data-delete-event]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Termin löschen?')) return;
            await deleteEvent(btn.dataset.deleteEvent);
        });
    });

    // Past toggle
    const toggleBtn = content.querySelector('#events-toggle-past');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const list = content.querySelector('#events-past-list');
            const arrow = content.querySelector('#events-past-arrow');
            if (list) list.classList.toggle('hidden');
            if (arrow) arrow.classList.toggle('open');
        });
    }
}

function renderEventCard(ev, isPast = false) {
    const d = (() => {
        if (!ev.date) return null;
        if (typeof ev.date === 'string') return new Date(ev.date + 'T00:00:00');
        return toDate(ev.date);
    })();
    const dateStr = d ? d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';

    const recurrenceIcon = {
        'weekly': 'refresh',
        'monthly': 'event_repeat',
    }[ev.recurrence] || '';

    const categoryColors = {
        'Uni': '#3b82f6', 'Wünsche': '#a855f7', 'Todos': 'var(--accent)',
        'Persönlich': '#22c55e', 'Arbeit': '#f97316', 'Sonstiges': 'var(--text-tertiary)'
    };
    const color = categoryColors[ev.category] || '#22c55e';

    const timeStr = ev.time
        ? (ev.endTime ? `${ev.time} – ${ev.endTime}` : ev.time)
        : '';

    return `<div class="glass-sm p-4 mb-2 flex items-start gap-3${isPast ? ' opacity-60' : ''}" style="border-left:3px solid ${color}">
        <span class="material-symbols-outlined" style="font-size:20px;color:${color};flex-shrink:0;margin-top:2px">event</span>
        <div class="flex-1 min-w-0">
            <div style="font-size:15px;font-weight:500">${escapeHtml(ev.title)}</div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">
                ${dateStr ? escapeHtml(dateStr) : ''}
                ${timeStr ? ' · ' + escapeHtml(timeStr) : ''}
                ${ev.category ? ' · ' + escapeHtml(ev.category) : ''}
                ${recurrenceIcon ? ` · <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">${recurrenceIcon}</span>` : ''}
            </div>
        </div>
        <div class="flex gap-1 flex-shrink-0">
            <button class="icon-btn" data-edit-event="${escapeAttr(ev.id)}" style="width:28px;height:28px">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-secondary)">edit</span>
            </button>
            <button class="icon-btn" data-delete-event="${escapeAttr(ev.id)}" style="width:28px;height:28px">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary)">delete</span>
            </button>
        </div>
    </div>`;
}

// ----- Add / Edit Modal -----

const EVENT_CATEGORIES = ['Uni', 'Wünsche', 'Todos', 'Persönlich', 'Arbeit', 'Sonstiges'];

function openEventModal(existing = null) {
    const old = document.getElementById('event-detail-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'event-detail-modal';
    modal.className = 'modal-overlay';

    const dateStr = existing
        ? (typeof existing.date === 'string' ? existing.date : toInputDate(toDate(existing.date)) || '')
        : toInputDate(new Date());

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">${existing ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>

            <input type="text" id="evd-title" class="glass-input w-full mb-3"
                placeholder="Titel" value="${existing ? escapeAttr(existing.title || '') : ''}">

            <div class="flex gap-2 mb-3">
                <div style="flex:1.3">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Datum</div>
                    <input type="date" id="evd-date" class="glass-input w-full" value="${dateStr}">
                </div>
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Von</div>
                    <input type="time" id="evd-time" class="glass-input w-full" value="${existing?.time || ''}">
                </div>
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Bis</div>
                    <input type="time" id="evd-end-time" class="glass-input w-full" value="${existing?.endTime || ''}">
                </div>
            </div>

            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Kategorie</div>
            <select id="evd-category" class="glass-select w-full mb-3">
                <option value="">Keine Kategorie</option>
                ${EVENT_CATEGORIES.map(c =>
                    `<option value="${escapeAttr(c)}" ${existing?.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
                ).join('')}
            </select>

            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Wiederholung</div>
            <select id="evd-recurrence" class="glass-select w-full mb-4">
                <option value="">Einmalig</option>
                <option value="weekly" ${existing?.recurrence === 'weekly' ? 'selected' : ''}>Wöchentlich</option>
                <option value="monthly" ${existing?.recurrence === 'monthly' ? 'selected' : ''}>Monatlich</option>
            </select>

            <div class="flex gap-2">
                <button id="evd-save" class="btn-accent flex-1">${existing ? 'Speichern' : 'Hinzufügen'}</button>
                ${existing ? '<button id="evd-delete" class="btn-ghost flex-1" style="color:#ef4444">Löschen</button>' : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#evd-save').addEventListener('click', async () => {
        const title = modal.querySelector('#evd-title').value.trim();
        if (!title) return;
        const data = {
            title,
            date: modal.querySelector('#evd-date').value || null,
            time: modal.querySelector('#evd-time').value || null,
            endTime: modal.querySelector('#evd-end-time').value || null,
            category: modal.querySelector('#evd-category').value || null,
            recurrence: modal.querySelector('#evd-recurrence').value || null,
        };
        if (existing) {
            await updateEvent(existing.id, data);
        } else {
            await addEvent(data);
        }
        modal.remove();
    });

    if (existing) {
        modal.querySelector('#evd-delete')?.addEventListener('click', async () => {
            if (!confirm('Termin löschen?')) return;
            await deleteEvent(existing.id);
            modal.remove();
        });
    }

    setTimeout(() => modal.querySelector('#evd-title').focus(), 100);
}
