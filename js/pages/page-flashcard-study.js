import { appState, onStateChange } from '../app.js';
import { onRouteChange, back } from '../router.js';
import { updateFlashcard } from '../db.js';
import { escapeHtml } from '../utils.js';

let initialized = false;
let studyQueue = [];
let currentCardIndex = 0;
let isFlipped = false;
let sessionDone = 0;
let sessionTotal = 0;
let activeCourseId = null;

export function initPageFlashcardStudy() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-flashcard-study');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="study-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <span class="page-header-title" id="study-course-name">Lernkarten</span>
            <div class="page-header-actions">
                <span id="study-progress-label" style="font-size:13px;color:var(--text-tertiary)"></span>
            </div>
        </div>
        <div class="px-5 flex-1 flex flex-col" id="study-content"></div>
    `;

    container.querySelector('#study-back-btn').addEventListener('click', () => back());

    onRouteChange((route, params) => {
        if (route === 'flashcard-deck') {
            activeCourseId = params?.id || null;
            setupSession(activeCourseId);
        }
    });
}

function setupSession(courseId) {
    if (!courseId) return;

    const cards = (appState.allFlashcards || []).filter(c => c.courseId === courseId);
    const now = new Date();

    const isDue = (c) => {
        const d = c.dueDate?.toDate ? c.dueDate.toDate() : (c.dueDate ? new Date(c.dueDate) : null);
        return d && d <= now;
    };

    const dueCards = cards.filter(isDue);
    const notDueCards = cards.filter(c => !isDue(c));

    // Shuffle due cards for variety
    studyQueue = [...shuffle(dueCards), ...notDueCards];
    currentCardIndex = 0;
    isFlipped = false;
    sessionDone = 0;
    sessionTotal = dueCards.length;

    const course = appState.allCourses.find(c => c.id === courseId);
    const nameEl = document.getElementById('study-course-name');
    if (nameEl && course) nameEl.textContent = course.name;

    renderStudyCard();
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function renderStudyCard() {
    const content = document.getElementById('study-content');
    if (!content) return;

    updateProgressLabel();

    if (studyQueue.length === 0) {
        content.innerHTML = `
            <div class="empty-state" style="flex:1">
                <span class="material-symbols-outlined" style="font-size:56px;color:var(--accent)">style</span>
                <div class="empty-state-text">Keine Karten vorhanden</div>
                <div style="font-size:13px;color:var(--text-tertiary)">Füge Karten im Deck-Bereich hinzu.</div>
            </div>
        `;
        return;
    }

    if (currentCardIndex >= studyQueue.length) {
        content.innerHTML = `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:20px;padding:40px 0">
                <div style="width:80px;height:80px;border-radius:24px;background:rgba(0,255,213,0.1);display:flex;align-items:center;justify-content:center">
                    <span class="material-symbols-outlined" style="font-size:48px;color:var(--accent)">celebration</span>
                </div>
                <div>
                    <div style="font-size:24px;font-weight:700;margin-bottom:8px">Session abgeschlossen!</div>
                    <div style="font-size:14px;color:var(--text-tertiary)">${sessionDone} von ${sessionTotal} ${sessionTotal === 1 ? 'Karte' : 'Karten'} gelernt</div>
                </div>
                <button class="btn-accent" id="study-restart-btn">Nochmal</button>
                <button class="btn-ghost" id="study-back2-btn">Zurück zu Decks</button>
            </div>
        `;
        content.querySelector('#study-restart-btn').addEventListener('click', () => {
            setupSession(activeCourseId);
        });
        content.querySelector('#study-back2-btn').addEventListener('click', () => back());
        return;
    }

    const card = studyQueue[currentCardIndex];
    isFlipped = false;

    const progressPct = sessionTotal > 0 ? Math.min(100, (sessionDone / sessionTotal) * 100) : 0;

    content.innerHTML = `
        <div style="flex:1;display:flex;flex-direction:column;gap:16px;padding-bottom:20px">

            <!-- Progress bar -->
            <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
                <div style="height:100%;width:${progressPct}%;background:var(--accent);border-radius:2px;transition:width 0.4s"></div>
            </div>

            <!-- Card -->
            <div id="fc-card" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;border-radius:20px;background:rgba(20,20,25,0.6);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(20px);min-height:200px;cursor:pointer;transition:transform 0.15s,border-color 0.2s" onclick="this.closest('#study-content').querySelector('#fc-flip-btn')?.click()">
                <div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:var(--text-tertiary);text-transform:uppercase" id="fc-side-label">Frage</div>
                <div style="font-size:18px;font-weight:500;text-align:center;line-height:1.6;white-space:pre-wrap;word-break:break-word" id="fc-text">${escapeHtml(card.front)}</div>
                <div style="font-size:12px;color:var(--text-tertiary);margin-top:8px" id="fc-hint">Tippen zum Aufdecken</div>
            </div>

            <!-- Rating buttons (hidden until flipped) -->
            <div id="fc-actions" class="hidden">
                <div style="font-size:12px;color:var(--text-tertiary);text-align:center;margin-bottom:8px">Wie gut kannst du das?</div>
                <div class="flex gap-2">
                    <button class="fc-rate-btn" data-quality="0" style="flex:1;background:rgba(255,71,87,0.15);border:1px solid rgba(255,71,87,0.3);color:#ff4757;border-radius:12px;padding:12px 4px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s">
                        Nochmal
                    </button>
                    <button class="fc-rate-btn" data-quality="2" style="flex:1;background:rgba(255,165,2,0.12);border:1px solid rgba(255,165,2,0.3);color:#ffa502;border-radius:12px;padding:12px 4px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s">
                        Schwer
                    </button>
                    <button class="fc-rate-btn" data-quality="3" style="flex:1;background:rgba(55,66,250,0.15);border:1px solid rgba(55,66,250,0.3);color:#8b96ff;border-radius:12px;padding:12px 4px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s">
                        Gut
                    </button>
                    <button class="fc-rate-btn" data-quality="5" style="flex:1;background:rgba(0,255,213,0.1);border:1px solid rgba(0,255,213,0.3);color:var(--accent);border-radius:12px;padding:12px 4px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s">
                        Leicht
                    </button>
                </div>
            </div>

            <!-- Flip button -->
            <button id="fc-flip-btn" class="btn-accent" style="width:100%">Aufdecken</button>
        </div>
    `;

    const flipBtn = content.querySelector('#fc-flip-btn');
    const actions = content.querySelector('#fc-actions');
    const fcText = content.querySelector('#fc-text');
    const fcSideLabel = content.querySelector('#fc-side-label');
    const fcHint = content.querySelector('#fc-hint');

    flipBtn.addEventListener('click', () => {
        if (!isFlipped) {
            isFlipped = true;
            fcText.textContent = card.back;
            fcSideLabel.textContent = 'Antwort';
            fcHint.style.display = 'none';
            flipBtn.classList.add('hidden');
            actions.classList.remove('hidden');
        }
    });

    content.querySelectorAll('.fc-rate-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const quality = parseInt(btn.dataset.quality);
            await rateCard(card, quality);
            if (quality >= 3) sessionDone++;
            currentCardIndex++;
            isFlipped = false;
            renderStudyCard();
        });
    });
}

function updateProgressLabel() {
    const label = document.getElementById('study-progress-label');
    if (!label) return;
    label.textContent = sessionTotal > 0 ? `${sessionDone}/${sessionTotal}` : '';
}

// SM-2 Algorithm
async function rateCard(card, quality) {
    let repetitions = card.repetitions ?? 0;
    let interval = card.interval ?? 1;
    let easeFactor = card.easeFactor ?? 2.5;

    if (quality >= 3) {
        if (repetitions === 0) interval = 1;
        else if (repetitions === 1) interval = 6;
        else interval = Math.round(interval * easeFactor);
        repetitions++;
    } else {
        repetitions = 0;
        interval = 1;
    }

    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    await updateFlashcard(card.id, {
        repetitions,
        interval,
        easeFactor,
        dueDate: nextDate
    });
}

