import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js';
import { signInWithGoogle, signOutUser } from './auth.js';
import { initRouter } from './router.js';
import { initNav, updateBadges } from './nav.js';

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBgzZBIFPgBVCW5cpSYPpM1QYphFwloC3o",
    authDomain: "todoistobe-c5014.firebaseapp.com",
    projectId: "todoistobe-c5014",
    storageBucket: "todoistobe-c5014.firebasestorage.app",
    messagingSenderId: "556251801382",
    appId: "1:556251801382:web:c554f27fe3c08ea33d83e7",
    measurementId: "G-9HGESVPZM2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export { app, auth, db };

// ===== Global App State =====

export const appState = {
    user: null,
    activeMode: 'todo',        // 'todo' | 'uni' | 'wishlist'
    allTodos: [],
    allLists: [],
    allCourses: [],
    allExams: [],
    allAssignments: [],
    allWishlistItems: [],
    allHabits: [],
    habitLogs: [],
    allFlashcards: [],
    allSemesters: [],
    settings: { theme: 'dark', notifications: false }
};

const stateListeners = new Set();

export function onStateChange(fn) {
    stateListeners.add(fn);
    return () => stateListeners.delete(fn);
}

function notifyStateChange() {
    stateListeners.forEach(fn => fn(appState));
}

// ===== Mode System =====

const MODE_DEFAULTS = {
    todo: 'today',
    uni: 'uni',
    wishlist: 'wishlist'
};

export async function setMode(mode) {
    if (!['todo', 'uni', 'wishlist'].includes(mode)) return;
    appState.activeMode = mode;
    localStorage.setItem('todotobe-mode', mode);

    // Persist to Firestore settings
    try {
        const { updateUserSettings } = await import('./db.js');
        const newSettings = { ...appState.settings, activeMode: mode };
        appState.settings = newSettings;
        await updateUserSettings(newSettings);
    } catch (e) {
        console.error('Failed to persist mode:', e);
    }

    // Update mode tabs UI
    updateModeTabs(mode);
    notifyStateChange();

    // Navigate to default route for this mode
    const { navigate } = await import('./router.js');
    navigate(MODE_DEFAULTS[mode]);
}

function updateModeTabs(mode) {
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });
}

function initModeTabs() {
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            setMode(tab.dataset.mode);
        });
    });
}

// ===== Access Gate =====

const ACCESS_UNLOCKED_KEY = 'todotobe-access-unlocked';
const ACCESS_FAILS_KEY    = 'todotobe-access-fails';
const ACCESS_LOCKOUT_KEY  = 'todotobe-access-lockout';
// Backoff in seconds after 5+ failures: 30s, 60s, 5min, 15min, 1hr
const BACKOFF_DELAYS = [30, 60, 300, 900, 3600];

async function sha256(message) {
    const buf = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initAccessGate() {
    // Already unlocked this browser session — skip gate
    if (sessionStorage.getItem(ACCESS_UNLOCKED_KEY) === 'true') return;

    // Fetch the SHA-256 hash from Firestore config/appAccess (unauthenticated read)
    let storedHash = null;
    try {
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js');
        const snap = await getDoc(doc(db, 'config', 'appAccess'));
        if (snap.exists()) storedHash = snap.data().hash || null;
    } catch (e) {
        console.warn('Access gate: could not load config, bypassing gate', e);
    }

    // No password configured — skip gate silently
    if (!storedHash) {
        sessionStorage.setItem(ACCESS_UNLOCKED_KEY, 'true');
        return;
    }

    // Show the gate
    const gate      = document.getElementById('access-gate');
    const input     = document.getElementById('access-code-input');
    const submitBtn = document.getElementById('access-submit-btn');
    const errorEl   = document.getElementById('access-error');
    const lockoutEl = document.getElementById('access-lockout');
    gate.classList.remove('hidden');

    let lockoutTimer = null;

    function getLockoutMs() {
        return Math.max(0, parseInt(localStorage.getItem(ACCESS_LOCKOUT_KEY) || '0') - Date.now());
    }

    function updateLockoutUI() {
        const ms = getLockoutMs();
        if (ms > 0) {
            lockoutEl.textContent = `Zu viele Fehlversuche – bitte ${Math.ceil(ms / 1000)} s warten.`;
            lockoutEl.classList.remove('hidden');
            submitBtn.disabled = true;
            input.disabled = true;
            return true;
        }
        lockoutEl.classList.add('hidden');
        submitBtn.disabled = false;
        input.disabled = false;
        return false;
    }

    if (updateLockoutUI()) {
        lockoutTimer = setInterval(() => { if (!updateLockoutUI()) { clearInterval(lockoutTimer); lockoutTimer = null; } }, 1000);
    }

    async function handleSubmit() {
        if (getLockoutMs() > 0) return;
        const value = input.value.trim();
        if (!value) return;

        const hash = await sha256(value);

        if (hash === storedHash) {
            localStorage.removeItem(ACCESS_FAILS_KEY);
            localStorage.removeItem(ACCESS_LOCKOUT_KEY);
            sessionStorage.setItem(ACCESS_UNLOCKED_KEY, 'true');
            if (lockoutTimer) { clearInterval(lockoutTimer); lockoutTimer = null; }
            gate.classList.add('hidden');
            authScreen.classList.remove('hidden');
            setTimeout(() => input.focus && input.blur(), 0);
        } else {
            const fails = (parseInt(localStorage.getItem(ACCESS_FAILS_KEY) || '0')) + 1;
            localStorage.setItem(ACCESS_FAILS_KEY, String(fails));

            if (fails >= 5) {
                const idx = Math.min(fails - 5, BACKOFF_DELAYS.length - 1);
                localStorage.setItem(ACCESS_LOCKOUT_KEY, String(Date.now() + BACKOFF_DELAYS[idx] * 1000));
                updateLockoutUI();
                lockoutTimer = setInterval(() => { if (!updateLockoutUI()) { clearInterval(lockoutTimer); lockoutTimer = null; } }, 1000);
            }

            const left = Math.max(0, 5 - fails);
            errorEl.textContent = left > 0
                ? `Falscher Zugangscode (${left} Versuche bis zur Sperre)`
                : 'Falscher Zugangscode';
            errorEl.classList.remove('hidden');
            input.value = '';
            input.focus();
        }
    }

    submitBtn.addEventListener('click', handleSubmit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
}

// ===== Auth UI =====

const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const googleSignInBtn = document.getElementById('google-sign-in');

googleSignInBtn.addEventListener('click', async () => {
    googleSignInBtn.disabled = true;
    googleSignInBtn.textContent = 'Anmeldung\u2026';
    try {
        await signInWithGoogle(auth);
    } catch (err) {
        console.error('Sign-in error:', err);
        googleSignInBtn.disabled = false;
        googleSignInBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20" class="shrink-0">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Mit Google anmelden`;
    }
});

// ===== FAB =====

const fabActions = new Map();

export function registerFabAction(route, fn) {
    fabActions.set(route, fn);
}

document.getElementById('fab').addEventListener('click', () => {
    const currentRoute = window.location.hash.slice(1).split('/')[0] || 'today';
    const action = fabActions.get(currentRoute);
    if (action) {
        action();
    } else {
        openQuickAdd();
    }
});

// ===== Offline Banner =====

const offlineBanner = document.getElementById('offline-banner');
let syncHideTimer = null;

function showOfflineBanner() {
    if (syncHideTimer) { clearTimeout(syncHideTimer); syncHideTimer = null; }
    offlineBanner.classList.remove('hidden', 'synced');
    offlineBanner.classList.add('offline');
    offlineBanner.textContent = 'Offline \u2014 \u00c4nderungen werden gespeichert';
}

export function showSyncedBanner() {
    offlineBanner.classList.remove('offline', 'hidden');
    offlineBanner.classList.add('synced');
    offlineBanner.textContent = 'Synchronisiert \u2713';
    syncHideTimer = setTimeout(() => {
        offlineBanner.classList.add('hidden');
        offlineBanner.classList.remove('synced');
        syncHideTimer = null;
    }, 2000);
}

window.addEventListener('offline', showOfflineBanner);
window.addEventListener('online', showSyncedBanner);

if (!navigator.onLine) showOfflineBanner();

// ===== Quick Add Modal =====

let quickAddSetup = false;

function setupQuickAddModal() {
    if (quickAddSetup) return;
    quickAddSetup = true;

    const modal = document.getElementById('quick-add-modal');
    const backdrop = modal.querySelector('.modal-backdrop');
    const saveBtn = document.getElementById('quick-add-save');
    const titleInput = document.getElementById('quick-add-title');

    backdrop.addEventListener('click', closeQuickAdd);

    // Priority buttons
    modal.querySelectorAll('#quick-add-priority [data-priority]').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('#quick-add-priority [data-priority]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    saveBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        if (!title) return;

        const { createTodo } = await import('./db.js');
        const listSelect = document.getElementById('quick-add-list');
        const listId = listSelect.value || getDefaultListId();
        const priorityBtn = modal.querySelector('#quick-add-priority .active');
        const priority = priorityBtn ? parseInt(priorityBtn.dataset.priority) : 4;
        const dueDate = document.getElementById('quick-add-date').value || null;

        if (listId) {
            await createTodo(title, listId, { priority, dueDate });
        }
        closeQuickAdd();
    });

    titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
        if (e.key === 'Escape') closeQuickAdd();
    });
}

function getDefaultListId() {
    const inbox = appState.allLists.find(l => l.isDefault);
    return inbox ? inbox.id : null;
}

export function openQuickAdd(prefillDate = null) {
    const modal = document.getElementById('quick-add-modal');
    const titleInput = document.getElementById('quick-add-title');
    const listSelect = document.getElementById('quick-add-list');
    const dateInput = document.getElementById('quick-add-date');

    // Populate list picker
    listSelect.innerHTML = '';
    appState.allLists.forEach(list => {
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = list.name;
        listSelect.appendChild(option);
    });

    // Default to inbox
    const inboxId = getDefaultListId();
    if (inboxId) listSelect.value = inboxId;

    // Reset fields
    titleInput.value = '';
    // Pre-fill date if provided (e.g. from calendar page)
    if (prefillDate) {
        const d = prefillDate instanceof Date ? prefillDate : new Date(prefillDate);
        dateInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    } else {
        dateInput.value = '';
    }
    modal.querySelectorAll('#quick-add-priority [data-priority]').forEach(b => b.classList.remove('active'));
    const defaultPriority = modal.querySelector('#quick-add-priority [data-priority="4"]');
    if (defaultPriority) defaultPriority.classList.add('active');

    modal.classList.remove('hidden');
    setTimeout(() => titleInput.focus(), 100);
}

export function closeQuickAdd() {
    document.getElementById('quick-add-modal').classList.add('hidden');
}

// ===== Data Subscriptions =====

let todosUnsub = null;
let listsUnsub = null;
let coursesUnsub = null;
let examsUnsub = null;
let assignmentsUnsub = null;
let wishlistUnsub = null;
let habitsUnsub = null;
let habitLogsUnsub = null;
let flashcardsUnsub = null;
let semestersUnsub = null;

async function subscribeToData() {
    const {
        subscribeTodos, subscribeLists,
        subscribeCourses, subscribeExams, subscribeAssignments,
        subscribeWishlistItems, subscribeHabits, subscribeHabitLogs,
        subscribeFlashcards, subscribeSemesters
    } = await import('./db.js');
    const { isToday, isOverdue } = await import('./utils.js');

    listsUnsub = subscribeLists((lists) => {
        appState.allLists = lists;
        notifyStateChange();
    });

    todosUnsub = subscribeTodos((todos) => {
        appState.allTodos = todos;
        updateBadges({
            today: todos.filter(t => !t.completed && t.dueDate && (isToday(t.dueDate) || isOverdue(t.dueDate))).length
        });
        notifyStateChange();
    });

    coursesUnsub = subscribeCourses((courses) => {
        appState.allCourses = courses;
        notifyStateChange();
    });

    examsUnsub = subscribeExams((exams) => {
        appState.allExams = exams;
        notifyStateChange();
    });

    assignmentsUnsub = subscribeAssignments((assignments) => {
        appState.allAssignments = assignments;
        notifyStateChange();
    });

    wishlistUnsub = subscribeWishlistItems((items) => {
        appState.allWishlistItems = items;
        notifyStateChange();
    });

    habitsUnsub = subscribeHabits((habits) => {
        appState.allHabits = habits;
        notifyStateChange();
    });

    habitLogsUnsub = subscribeHabitLogs((logs) => {
        appState.habitLogs = logs;
        notifyStateChange();
    });

    flashcardsUnsub = subscribeFlashcards((cards) => {
        appState.allFlashcards = cards;
        notifyStateChange();
    });

    semestersUnsub = subscribeSemesters((semesters) => {
        appState.allSemesters = semesters;
        notifyStateChange();
    });
}

function unsubscribeData() {
    if (todosUnsub) { todosUnsub(); todosUnsub = null; }
    if (listsUnsub) { listsUnsub(); listsUnsub = null; }
    if (coursesUnsub) { coursesUnsub(); coursesUnsub = null; }
    if (examsUnsub) { examsUnsub(); examsUnsub = null; }
    if (assignmentsUnsub) { assignmentsUnsub(); assignmentsUnsub = null; }
    if (wishlistUnsub) { wishlistUnsub(); wishlistUnsub = null; }
    if (habitsUnsub) { habitsUnsub(); habitsUnsub = null; }
    if (habitLogsUnsub) { habitLogsUnsub(); habitLogsUnsub = null; }
    if (flashcardsUnsub) { flashcardsUnsub(); flashcardsUnsub = null; }
    if (semestersUnsub) { semestersUnsub(); semestersUnsub = null; }
}

// ===== Page Initialization =====

async function initPages() {
    const { initPageToday } = await import('./pages/page-today.js');
    const { initPageTaskDetail } = await import('./pages/page-task-detail.js');
    const { initPageProjects } = await import('./pages/page-projects.js');
    const { initPageProjectDetail } = await import('./pages/page-project-detail.js');
    const { initPageCalendar } = await import('./pages/page-calendar.js');
    const { initPageStats } = await import('./pages/page-stats.js');
    const { initPageSettings, applyTheme } = await import('./pages/page-settings.js');
    const { initPageHabits } = await import('./pages/page-habits.js');
    const { initPageUni } = await import('./pages/page-uni.js');
    const { initPageUniTimetable } = await import('./pages/page-uni-timetable.js');
    const { initPageUniAssignments } = await import('./pages/page-uni-assignments.js');
    const { initPageUniGrades } = await import('./pages/page-uni-grades.js');
    const { initPageWishlist } = await import('./pages/page-wishlist.js');
    const { initPageWishlistCategories } = await import('./pages/page-wishlist-categories.js');
    const { initPageWishlistMatrix } = await import('./pages/page-wishlist-matrix.js');
    const { initPageUniSettings } = await import('./pages/page-uni-settings.js');
    const { initPageWeeklyReview } = await import('./pages/page-weekly-review.js');
    const { initPageFlashcardDecks } = await import('./pages/page-flashcard-decks.js');
    const { initPageFlashcardStudy } = await import('./pages/page-flashcard-study.js');

    initPageToday();
    initPageTaskDetail();
    initPageProjects();
    initPageProjectDetail();
    initPageCalendar();
    initPageStats();
    initPageSettings();
    initPageHabits();
    initPageUni();
    initPageUniTimetable();
    initPageUniAssignments();
    initPageUniGrades();
    initPageWishlist();
    initPageWishlistCategories();
    initPageWishlistMatrix();
    initPageUniSettings();
    initPageWeeklyReview();
    initPageFlashcardDecks();
    initPageFlashcardStudy();

    // Load and apply saved theme + mode
    const { getUserSettings } = await import('./db.js');
    const settings = await getUserSettings();
    appState.settings = settings;
    applyTheme(settings.theme);

    // Restore active mode from settings/localStorage
    const savedMode = settings.activeMode || localStorage.getItem('todotobe-mode') || 'todo';
    appState.activeMode = savedMode;
    updateModeTabs(savedMode);
}

// ===== Auth State Listener =====

let appInitialized = false;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // If the access gate hasn't been cleared this session, sign out immediately
        if (sessionStorage.getItem(ACCESS_UNLOCKED_KEY) !== 'true') {
            await signOutUser(auth);
            return;
        }

        appState.user = user;

        // Hide auth, show app
        authScreen.classList.add('hidden');
        appShell.classList.remove('hidden');

        // Init user data in Firestore
        const { initUser } = await import('./db.js');
        await initUser(user);

        // Subscribe to real-time data
        await subscribeToData();

        // Init navigation, router, and pages (only once)
        if (!appInitialized) {
            initModeTabs();
            initNav();
            initRouter();
            setupQuickAddModal();
            await initPages();
            appInitialized = true;
        }
    } else {
        appState.user = null;
        unsubscribeData();

        appShell.classList.add('hidden');
        // Only show auth screen if the access gate has been passed this session
        if (sessionStorage.getItem(ACCESS_UNLOCKED_KEY) === 'true') {
            authScreen.classList.remove('hidden');
        }
    }
});

// Start access gate check on load
initAccessGate();
