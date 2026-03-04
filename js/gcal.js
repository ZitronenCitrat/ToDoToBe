// ======================================================
// CONFIGURE YOUR GOOGLE CLIENT ID HERE:
const GCAL_CLIENT_ID = '556251801382-0ngula7hhutjtg5gl41opccltfs4i8ig.apps.googleusercontent.com';
// ======================================================

const GCAL_SCOPE    = 'https://www.googleapis.com/auth/calendar';
const GCAL_API_BASE = 'https://www.googleapis.com/calendar/v3';

let tokenClient  = null;
let accessToken  = null;
let tokenExpiry  = 0;
let onConnectCb  = null;   // callback(connected: boolean)
let currentUserId = null;  // set by initGcal(userId, ...)
let gcalIdsCache  = {};    // in-memory cache of entityKey → gcalEventId
let gcalTokenLoaded = false;
let wasConnected = false;  // true if Firestore shows the user previously connected
let refreshResolve = null; // pending refreshTokenSilent() resolve
let refreshReject  = null; // pending refreshTokenSilent() reject
let focusListenerAdded = false;

// ===== Init =====

/**
 * Initialize GCal for a given user.
 * First call loads the token from Firestore; subsequent calls just update the callback.
 * Now async — awaits Firestore token restoration.
 */
export async function initGcal(userId, onStatusChange) {
    if (onStatusChange !== undefined) onConnectCb = onStatusChange;
    if (userId) currentUserId = userId;

    if (!currentUserId) return;

    if (!gcalTokenLoaded) {
        gcalTokenLoaded = true;
        // Restore token + gcalIds from Firestore user doc
        try {
            const { db } = await import('./app.js');
            const { getDoc, doc: fsDoc } =
                await import('https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js');
            const snap = await getDoc(fsDoc(db, 'users', currentUserId));
            if (snap.exists()) {
                const data = snap.data();
                if (data.gcalToken) {
                    const { token, expiry } = data.gcalToken;
                    if (Date.now() < expiry - 60_000) {
                        accessToken = token;
                        tokenExpiry = expiry;
                    }
                }
                gcalIdsCache = data.gcalIds || {};
                wasConnected = !!data.gcalConnected;
            }
        } catch (e) {
            console.warn('[gcal] Could not restore token from Firestore:', e);
        }
        // FIX 4: Token from Firestore is expired — try silent refresh
        if (wasConnected && !isGcalConnected()) {
            try {
                await refreshTokenSilent();
            } catch (e) {
                showGcalReconnectBanner();
            }
        }

        // Notify whoever registered a callback by the time the load finishes
        onConnectCb?.(isGcalConnected());

        // FIX 2: Re-validate token each time the app regains focus
        if (!focusListenerAdded) {
            focusListenerAdded = true;
            window.addEventListener('focus', () => {
                if (wasConnected && !isGcalConnected()) {
                    refreshTokenSilent().catch(() => {
                        onConnectCb?.(false);
                        showGcalReconnectBanner();
                    });
                }
            });
        }
    } else if (onStatusChange !== undefined) {
        // Token already loaded — notify the newly registered callback immediately
        onConnectCb?.(isGcalConnected());
    }
}

function getTokenClient() {
    if (tokenClient) return tokenClient;
    if (typeof google === 'undefined' || !google?.accounts?.oauth2) return null;
    if (!GCAL_CLIENT_ID) {
        console.warn('[gcal] GCAL_CLIENT_ID is not configured in js/gcal.js');
        return null;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GCAL_CLIENT_ID,
        scope: GCAL_SCOPE,
        callback: _handleTokenResponse,
    });
    return tokenClient;
}

async function _handleTokenResponse(response) {
    if (response.error) {
        console.error('[gcal] Auth error:', response.error);
        onConnectCb?.(false);
        refreshReject?.(new Error(response.error));
        refreshResolve = null; refreshReject = null;
        return;
    }
    accessToken = response.access_token;
    tokenExpiry = Date.now() + (response.expires_in * 1000);
    wasConnected = true;

    // Persist token + connected flag to Firestore user doc
    if (currentUserId) {
        try {
            const { db } = await import('./app.js');
            const { updateDoc, doc: fsDoc } =
                await import('https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js');
            await updateDoc(fsDoc(db, 'users', currentUserId), {
                gcalToken: { token: accessToken, expiry: tokenExpiry },
                gcalConnected: true,
            });
        } catch (e) {
            console.warn('[gcal] Could not save token to Firestore:', e);
        }
    }

    onConnectCb?.(true);
    refreshResolve?.();
    refreshResolve = null; refreshReject = null;

    // FIX 1: Schedule a silent refresh 5 minutes before expiry
    const timeUntilExpiry = tokenExpiry - Date.now() - 300_000;
    if (timeUntilExpiry > 0) {
        setTimeout(() => refreshTokenSilent(), timeUntilExpiry);
    }

    // FIX 3: Always sync on token grant — verifyAndSyncEntity prevents duplicates
    import('./app.js').then(({ appState }) => syncAllToGcal(appState)).catch(() => {});
}

// ===== Public API =====

export function isGcalConnected() {
    return Boolean(accessToken) && Date.now() < tokenExpiry - 60_000;
}

export function isGcalConfigured() {
    return Boolean(GCAL_CLIENT_ID);
}

export function connectGcal() {
    const client = getTokenClient();
    if (!client) {
        alert('Google Identity Services nicht geladen oder Client-ID fehlt. Prüfe js/gcal.js und deine Internetverbindung.');
        return;
    }
    client.requestAccessToken({ prompt: 'consent' });
}

export function showGcalReconnectBanner() {
    document.getElementById('gcal-reconnect-banner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'gcal-reconnect-banner';
    banner.style.cssText = `
        position:fixed;bottom:80px;left:16px;right:16px;
        background:rgba(245,158,11,0.15);
        border:1px solid rgba(245,158,11,0.4);
        border-radius:14px;padding:12px 16px;
        display:flex;align-items:center;justify-content:space-between;
        z-index:9999;backdrop-filter:blur(12px);
    `;

    const label = document.createElement('span');
    label.style.cssText = 'font-size:14px;color:var(--text-primary)';
    label.textContent = 'Google Kalender getrennt';

    const btn = document.createElement('button');
    btn.style.cssText = 'font-size:13px;color:var(--accent);font-weight:600;background:none;border:none;cursor:pointer';
    btn.textContent = 'Neu verbinden';
    btn.addEventListener('click', () => {
        banner.remove();
        connectGcal();
    });

    banner.appendChild(label);
    banner.appendChild(btn);
    document.body.appendChild(banner);
}

export async function disconnectGcal() {
    if (accessToken) {
        try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
    }
    accessToken = null;
    tokenExpiry = 0;
    wasConnected = false;

    // Clear token from Firestore (keep gcalIds so we can PATCH instead of re-create on reconnect)
    if (currentUserId) {
        try {
            const { db } = await import('./app.js');
            const { updateDoc, doc: fsDoc, deleteField } =
                await import('https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js');
            await updateDoc(fsDoc(db, 'users', currentUserId), {
                gcalToken: deleteField(),
                gcalConnected: false,
            });
        } catch (e) {
            console.warn('[gcal] Could not clear token from Firestore:', e);
        }
    }

    onConnectCb?.(false);
}

/** Refresh an expired token silently (no prompt). Returns a Promise. */
export function refreshTokenSilent() {
    return new Promise((resolve, reject) => {
        if (isGcalConnected()) { resolve(); return; }
        if (!wasConnected) { reject(new Error('Not previously connected')); return; }
        const client = getTokenClient();
        if (!client) { reject(new Error('No token client available')); return; }
        refreshResolve = resolve;
        refreshReject  = reject;
        client.requestAccessToken({ prompt: '' });
    });
}

// ===== gcal-id mapping (in-memory + Firestore) =====

function getGcalId(entityKey) {
    return gcalIdsCache[entityKey] || null;
}

async function setGcalId(entityKey, gcalId) {
    gcalIdsCache[entityKey] = gcalId;
    if (!currentUserId) return;
    try {
        const { db } = await import('./app.js');
        const { updateDoc, doc: fsDoc } =
            await import('https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js');
        // Dot notation updates a single key inside the gcalIds map
        await updateDoc(fsDoc(db, 'users', currentUserId), {
            [`gcalIds.${entityKey}`]: gcalId,
        });
    } catch (e) {
        console.warn('[gcal] Could not save gcalId to Firestore:', e);
    }
}

// ===== REST helpers =====

async function calendarRequest(method, path, body = null) {
    if (!accessToken) return null;
    if (Date.now() >= tokenExpiry - 60_000) {
        // Token expired — try silent refresh and bail for now
        refreshTokenSilent();
        return null;
    }
    try {
        const opts = {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${GCAL_API_BASE}${path}`, opts);
        if (res.status === 401) {
            // Token revoked externally
            accessToken = null;
            onConnectCb?.(false);
            return null;
        }
        if (!res.ok) return null;
        return method === 'DELETE' ? null : await res.json();
    } catch { return null; }
}

// ===== Entity → Calendar event converters =====

function todoToGcalEvent(todo) {
    const dateStr = todoDateStr(todo.dueDate);
    if (!dateStr) return null;
    return {
        summary: todo.title || 'Todo',
        description: todo.notes || '',
        colorId: '11',    // Tomato
        start: { date: dateStr },
        end:   { date: dateStr },
    };
}

function addMinutesToDateStr(dateStr, timeStr, minutesToAdd) {
    const base = new Date(`${dateStr}T${timeStr}:00`);
    base.setMinutes(base.getMinutes() + minutesToAdd);
    const pad = (n) => String(n).padStart(2, '0');
    return `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}:00`;
}

function eventToGcalEvent(ev) {
    const dateStr = entityDateStr(ev.date);
    if (!dateStr) return null;
    if (ev.time) {
        const dtStart = `${dateStr}T${ev.time}:00`;
        // Use actual endTime if set, otherwise default to +1 hour
        const dtEnd = ev.endTime
            ? `${dateStr}T${ev.endTime}:00`
            : addMinutesToDateStr(dateStr, ev.time, 60);
        return {
            summary: ev.title || 'Termin',
            description: ev.category || '',
            colorId: '10',    // Sage
            start: { dateTime: dtStart, timeZone: 'Europe/Berlin' },
            end:   { dateTime: dtEnd,   timeZone: 'Europe/Berlin' },
        };
    }
    return {
        summary: ev.title || 'Termin',
        description: ev.category || '',
        colorId: '10',
        start: { date: dateStr },
        end:   { date: dateStr },
    };
}

function examToGcalEvent(exam, courseName) {
    const dateStr = entityDateStr(exam.date);
    if (!dateStr) return null;
    const desc = [courseName, exam.room].filter(Boolean).join(' · ');
    if (exam.time) {
        const dtStart = `${dateStr}T${exam.time}:00`;
        const dtEnd = addMinutesToDateStr(dateStr, exam.time, 120); // +2 hours
        return {
            summary: `Klausur: ${exam.title || 'Klausur'}`,
            description: desc,
            colorId: '4',    // Flamingo (red)
            start: { dateTime: dtStart, timeZone: 'Europe/Berlin' },
            end:   { dateTime: dtEnd,   timeZone: 'Europe/Berlin' },
        };
    }
    return {
        summary: `Klausur: ${exam.title || 'Klausur'}`,
        description: desc,
        colorId: '4',
        start: { date: dateStr },
        end:   { date: dateStr },
    };
}

function assignmentToGcalEvent(assignment, courseName) {
    const dateStr = entityDateStr(assignment.dueDate);
    if (!dateStr) return null;
    return {
        summary: `Abgabe: ${assignment.title || 'Aufgabe'}`,
        description: courseName || '',
        colorId: '6',    // Tangerine (orange)
        start: { date: dateStr },
        end:   { date: dateStr },
    };
}

function wishToGcalEvent(wish) {
    const dateStr = entityDateStr(wish.date);
    if (!dateStr) return null;
    return {
        summary: `🌟 ${wish.title || 'Wunsch'}`,
        description: wish.category ? `Kategorie: ${wish.category}${wish.price != null ? ' · ' + wish.price.toFixed(2) + ' €' : ''}` : '',
        colorId: '3',    // Grape (purple)
        start: { date: dateStr },
        end:   { date: dateStr },
    };
}

// ===== Date string helpers =====

function todoDateStr(dueDate) {
    if (!dueDate) return null;
    if (typeof dueDate === 'string') return dueDate.slice(0, 10);
    if (dueDate.toDate) return dueDate.toDate().toISOString().slice(0, 10);
    if (dueDate instanceof Date) return dueDate.toISOString().slice(0, 10);
    return null;
}

function entityDateStr(date) {
    if (!date) return null;
    if (typeof date === 'string') return date.slice(0, 10);
    if (date.toDate) return date.toDate().toISOString().slice(0, 10);
    if (date instanceof Date) return date.toISOString().slice(0, 10);
    return null;
}

// ===== Core sync function =====

/**
 * Sync a single entity to Google Calendar.
 * type: 'todo' | 'event' | 'exam' | 'assignment' | 'wish'
 * entity: the data object { id, ...fields }
 * meta: optional extra info (e.g. { courseName })
 */
export async function syncEntityToGcal(type, entity, meta = {}) {
    if (!isGcalConnected()) return;
    if (!entity?.id) return;

    const key = `${type}-${entity.id}`;
    const existingGcalId = getGcalId(key);

    let gcalEvent = null;
    switch (type) {
        case 'todo':       gcalEvent = todoToGcalEvent(entity); break;
        case 'event':      gcalEvent = eventToGcalEvent(entity); break;
        case 'exam':       gcalEvent = examToGcalEvent(entity, meta.courseName || ''); break;
        case 'assignment': gcalEvent = assignmentToGcalEvent(entity, meta.courseName || ''); break;
        case 'wish':       gcalEvent = wishToGcalEvent(entity); break;
    }

    if (!gcalEvent) return;  // No date = nothing to sync

    if (existingGcalId) {
        // Update existing event
        await calendarRequest('PATCH', `/calendars/primary/events/${existingGcalId}`, gcalEvent);
    } else {
        // Create new event
        const result = await calendarRequest('POST', '/calendars/primary/events', gcalEvent);
        if (result?.id) {
            await setGcalId(key, result.id);
        }
    }
}

/**
 * Used by syncAllToGcal: skip if already synced (FIX 1), verify GCal event still exists (FIX 2).
 * Leaves syncEntityToGcal's PATCH behavior intact for individual updates from db.js.
 */
async function verifyAndSyncEntity(type, entity, meta = {}) {
    if (!entity?.id) return;
    const key = `${type}-${entity.id}`;
    const existingGcalId = gcalIdsCache[key];

    if (existingGcalId) {
        // FIX 2: Verify the event still exists in Google Calendar
        try {
            const res = await fetch(
                `${GCAL_API_BASE}/calendars/primary/events/${existingGcalId}`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            if (res.ok) return; // FIX 1: Already synced and event exists — skip
            // Event was deleted from Google Calendar — remove stale cache entry and recreate
            delete gcalIdsCache[key];
        } catch (e) {
            return; // Network error — skip to be safe
        }
    }

    await syncEntityToGcal(type, entity, meta);
}

/**
 * Sync all current app state to Google Calendar.
 * FIX 3: Always safe to call — FIX 1/2 prevent duplicate creation.
 * FIX 4: Saves updated gcalIdsCache to Firestore after completion.
 */
export async function syncAllToGcal(appState) {
    if (!isGcalConnected() || !appState) return;

    // Batch all sync operations
    const tasks = [];

    // Todos with due dates (not completed)
    appState.allTodos
        .filter(t => t.dueDate && !t.completed)
        .forEach(t => tasks.push(verifyAndSyncEntity('todo', t)));

    // Events (Termine)
    appState.allEvents
        .filter(ev => ev.date)
        .forEach(ev => tasks.push(verifyAndSyncEntity('event', ev)));

    // Exams with dates
    appState.allExams
        .filter(e => e.date)
        .forEach(e => {
            const course = appState.allCourses.find(c => c.id === e.courseId);
            tasks.push(verifyAndSyncEntity('exam', e, { courseName: course?.name || '' }));
        });

    // Assignments with due dates (not completed)
    appState.allAssignments
        .filter(a => a.dueDate && !a.completed)
        .forEach(a => {
            const course = appState.allCourses.find(c => c.id === a.courseId);
            tasks.push(verifyAndSyncEntity('assignment', a, { courseName: course?.name || '' }));
        });

    // Wishes with dates (not purchased)
    appState.allWishlistItems
        .filter(w => w.date && !w.purchased)
        .forEach(w => tasks.push(verifyAndSyncEntity('wish', w)));

    // Execute in small batches to avoid rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
        await Promise.allSettled(tasks.slice(i, i + BATCH_SIZE));
        if (i + BATCH_SIZE < tasks.length) {
            await new Promise(r => setTimeout(r, 200)); // 200ms pause between batches
        }
    }

    // FIX 4: Persist updated gcalIdsCache (new entries + cleared stale entries) to Firestore
    if (currentUserId) {
        try {
            const { db } = await import('./app.js');
            const { updateDoc, doc: fsDoc } =
                await import('https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js');
            await updateDoc(fsDoc(db, 'users', currentUserId), { gcalIds: gcalIdsCache });
        } catch (e) {
            console.warn('[gcal] Could not save gcalIds to Firestore:', e);
        }
    }
}
