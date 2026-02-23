import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { addFlashcard, deleteFlashcard } from '../db.js';
import { escapeHtml } from '../utils.js';

let initialized = false;

export function initPageFlashcardDecks() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-flashcard-decks');

    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title">Lernkarten</span>
        </div>
        <div class="px-5 flex-1" id="flashcard-decks-content"></div>
    `;

    registerFabAction('flashcards', () => {
        const courses = appState.allCourses;
        if (courses.length === 1) {
            showAddCardModal(courses[0].id);
        } else if (courses.length > 1) {
            showAddCardModal(null); // let user pick course in the modal
        }
    });

    onStateChange(() => {
        if (isActive()) renderDecks();
    });

    onRouteChange((route) => {
        if (route === 'flashcards') renderDecks();
    });

    renderDecks();
}

function isActive() {
    return window.location.hash.slice(1).split('/')[0] === 'flashcards';
}

function renderDecks() {
    const content = document.getElementById('flashcard-decks-content');
    if (!content) return;

    const courses = appState.allCourses;
    const cards = appState.allFlashcards || [];
    const now = new Date();

    if (courses.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">style</span>
                <div class="empty-state-text">Erstelle zuerst Kurse im Uni-Bereich</div>
            </div>
        `;
        return;
    }

    content.innerHTML = courses.map(course => {
        const courseCards = cards.filter(c => c.courseId === course.id);
        const dueCards = courseCards.filter(c => {
            const due = c.dueDate?.toDate ? c.dueDate.toDate() : (c.dueDate ? new Date(c.dueDate) : null);
            return due && due <= now;
        });
        const totalCards = courseCards.length;

        return `
            <div class="glass p-4 mb-3">
                <div class="flex items-center gap-3 mb-3">
                    <div style="width:12px;height:12px;border-radius:50%;background:${course.color};flex-shrink:0"></div>
                    <span style="font-size:16px;font-weight:600;flex:1">${escapeHtml(course.name)}</span>
                    <button class="icon-btn" data-add-card="${course.id}" title="Karte hinzufügen">
                        <span class="material-symbols-outlined">add</span>
                    </button>
                </div>
                <div class="flex items-center justify-between">
                    <div class="flex gap-4">
                        <div>
                            <span style="font-size:20px;font-weight:700">${totalCards}</span>
                            <span style="font-size:12px;color:var(--text-tertiary)"> Karten</span>
                        </div>
                        <div>
                            <span style="font-size:20px;font-weight:700;color:${dueCards.length > 0 ? 'var(--accent)' : 'var(--text-tertiary)'}">${dueCards.length}</span>
                            <span style="font-size:12px;color:var(--text-tertiary)"> fällig</span>
                        </div>
                    </div>
                    ${totalCards > 0
                        ? `<button class="btn-accent" data-study-deck="${course.id}" style="padding:8px 16px;font-size:13px">Lernen</button>`
                        : `<span style="font-size:12px;color:var(--text-tertiary)">Noch keine Karten</span>`
                    }
                </div>
                ${totalCards > 0 ? `
                    <button class="btn-ghost w-full mt-3" data-manage-deck="${course.id}" style="font-size:12px;padding:6px">
                        Karten verwalten
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');

    // Add card buttons
    content.querySelectorAll('[data-add-card]').forEach(btn => {
        btn.addEventListener('click', () => showAddCardModal(btn.dataset.addCard));
    });

    // Study deck buttons
    content.querySelectorAll('[data-study-deck]').forEach(btn => {
        btn.addEventListener('click', () => navigate('flashcard-deck', { id: btn.dataset.studyDeck }));
    });

    // Manage deck buttons
    content.querySelectorAll('[data-manage-deck]').forEach(btn => {
        btn.addEventListener('click', () => showManageDeckModal(btn.dataset.manageDeck));
    });
}

function showAddCardModal(courseId) {
    document.getElementById('flashcard-add-modal')?.remove();

    const needsCourseSelect = courseId === null;
    const courseSelectHtml = needsCourseSelect
        ? `<select id="fc-course" class="glass-select w-full mb-3">
            <option value="">Kurs wählen…</option>
            ${appState.allCourses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
           </select>`
        : '';

    const modal = document.createElement('div');
    modal.id = 'flashcard-add-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neue Karte</h2>
            ${courseSelectHtml}
            <label style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;display:block">Vorderseite (Frage)</label>
            <textarea id="fc-front" class="glass-textarea w-full mb-3" placeholder="Was möchtest du abfragen?" rows="3"></textarea>
            <label style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;display:block">Rückseite (Antwort)</label>
            <textarea id="fc-back" class="glass-textarea w-full mb-4" placeholder="Die Antwort…" rows="3"></textarea>
            <button id="fc-save" class="btn-accent w-full mb-2">Karte hinzufügen</button>
            <button id="fc-cancel" class="btn-ghost w-full">Abbrechen</button>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#fc-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('#fc-save').addEventListener('click', async () => {
        const front = modal.querySelector('#fc-front').value.trim();
        const back = modal.querySelector('#fc-back').value.trim();
        if (!front || !back) return;
        const finalCourseId = needsCourseSelect
            ? (modal.querySelector('#fc-course')?.value || '')
            : courseId;
        await addFlashcard({ courseId: finalCourseId, front, back });
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#fc-front').focus(), 100);
}

function showManageDeckModal(courseId) {
    document.getElementById('flashcard-manage-modal')?.remove();

    const cards = (appState.allFlashcards || []).filter(c => c.courseId === courseId);
    const course = appState.allCourses.find(c => c.id === courseId);

    const modal = document.createElement('div');
    modal.id = 'flashcard-manage-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet" style="max-height:80vh;overflow-y:auto">
            <div class="modal-handle"></div>
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold">${escapeHtml(course?.name || 'Karten')}</h2>
                <button id="fc-manage-close" class="icon-btn">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div id="fc-manage-list">
                ${cards.length === 0
                    ? '<div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:20px 0">Noch keine Karten</div>'
                    : cards.map(card => `
                        <div class="glass-sm p-3 mb-2 flex items-start gap-2">
                            <div class="flex-1 min-w-0">
                                <div style="font-size:13px;font-weight:600;margin-bottom:2px">${escapeHtml(card.front)}</div>
                                <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(card.back)}</div>
                                <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Intervall: ${card.interval || 1}d · EF: ${(card.easeFactor || 2.5).toFixed(2)}</div>
                            </div>
                            <button class="icon-btn" data-delete-card="${card.id}" style="color:#ff4757;flex-shrink:0">
                                <span class="material-symbols-outlined" style="font-size:20px">delete</span>
                            </button>
                        </div>
                    `).join('')
                }
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#fc-manage-close').addEventListener('click', () => modal.remove());

    modal.querySelectorAll('[data-delete-card]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Karte löschen?')) return;
            await deleteFlashcard(btn.dataset.deleteCard);
            // Re-render list in modal
            const updatedCards = (appState.allFlashcards || []).filter(c => c.courseId === courseId && c.id !== btn.dataset.deleteCard);
            const list = modal.querySelector('#fc-manage-list');
            if (updatedCards.length === 0) {
                list.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:20px 0">Noch keine Karten</div>';
            } else {
                btn.closest('.glass-sm').remove();
            }
        });
    });
}

