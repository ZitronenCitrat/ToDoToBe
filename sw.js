const CACHE_NAME = 'todotobe-v11';

const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './js/app.js',
    './js/auth.js',
    './js/db.js',
    './js/router.js',
    './js/nav.js',
    './js/utils.js',
    './js/todo-item.js',
    './js/drag-drop.js',
    './js/mindmap.js',
    './js/pages/page-today.js',
    './js/pages/page-task-detail.js',
    './js/pages/page-projects.js',
    './js/pages/page-project-detail.js',
    './js/pages/page-calendar.js',
    './js/pages/page-stats.js',
    './js/pages/page-settings.js',
    './js/pages/page-habits.js',
    './js/pages/page-weekly-review.js',
    './js/pages/page-flashcard-decks.js',
    './js/pages/page-flashcard-study.js',
    './js/pages/page-uni.js',
    './js/pages/page-uni-timetable.js',
    './js/pages/page-uni-assignments.js',
    './js/pages/page-uni-grades.js',
    './js/pages/page-uni-settings.js',
    './js/pages/page-wishlist.js',
    './js/pages/page-wishlist-categories.js',
    './js/pages/page-wishlist-matrix.js',
];

// Install: precache the app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

// Fetch: Cache-first for app shell, pass-through for Firebase
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.search.includes('apiKey=') || url.search.includes('authType=')) {
        return; // Direkt ans Netzwerk geben, SW hält sich raus
    }

    if (url.search.length > 0) {
        return; 
    }

    // Never cache Firebase / Google Auth requests
    if (url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('accounts.google.com') ||
        url.hostname.includes('firebaseapp.com') ||
        url.pathname.includes('/__/auth/')) {
        return;
    }

    // Cache-first for same-origin requests (app shell)
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return cached || fetch(event.request).then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Stale-while-revalidate for CDN resources (Firebase SDK, SortableJS, Tailwind, Fonts)
    if (url.hostname.includes('gstatic.com') ||
        url.hostname.includes('jsdelivr.net') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('cdn.tailwindcss.com')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                const fetchPromise = fetch(event.request).then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                });
                return cached || fetchPromise;
            })
        );
    }
});
