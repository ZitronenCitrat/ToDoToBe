// ======================================================
// CONFIGURE YOUR GOOGLE CLIENT ID HERE:
const GCAL_CLIENT_ID = '556251801382-0ngula7hhutjtg5gl41opccltfs4i8ig.apps.googleusercontent.com';
// ======================================================

const GCAL_SCOPE     = 'https://www.googleapis.com/auth/calendar';
const GCAL_API_BASE  = 'https://www.googleapis.com/calendar/v3';
const GCAL_KEY_TOKEN = 'gcal-token';
const GCAL_KEY_IDS   = 'gcal-ids';
const GCAL_KEY_CONN  = 'gcal-connected';

let tokenClient  = null;
let accessToken  = null;
let tokenExpiry  = 0;
let onConnectCb  = null;  // callback(connected: boolean)

// ===== Init =====

export function initGcal(onStatusChange) {
    if (onStatusChange) onConnectCb = onStatusChange;

    // Restore token from localStorage if still valid
    try {
        const stored = localStorage.getItem(GCAL_KEY_TOKEN);
        if (stored) {
            const { token, expiry } = JSON.parse(stored);
            if (Date.now() < expiry - 60_000) {   // 1-min buffer
                accessToken = token;
                tokenExpiry = expiry;
            } else {
                localStorage.removeItem(GCAL_KEY_TOKEN);
            }
        }
    } catch (e) { /* ignore parse errors */ }
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

function _handleTokenResponse(response) {
    if (response.error) {
        console.error('[gcal] Auth error:', response.error);
        onConnectCb?.(false);
        return;
    }
    accessToken = response.access_token;
    tokenExpiry = Date.now() + (response.expires_in * 1000);
    localStorage.setItem(GCAL_KEY_TOKEN, JSON.stringify({ token: accessToken, expiry: tokenExpiry }));
    localStorage.setItem(GCAL_KEY_CONN, 'true');
    onConnectCb?.(true);

    // Sync all existing data on first connect
    import('./app.js').then(({ appState }) => syncAllToGcal(appState)).catch(() => {});
}

// ===== Public API =====

export function isGcalConnected() {
    if (accessToken && Date.now() < tokenExpiry - 60_000) return true;
    // Check localStorage
    if (localStorage.getItem(GCAL_KEY_CONN) !== 'true') return false;
    // Token may have expired — caller should re-request
    return false;
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

export function disconnectGcal() {
    if (accessToken) {
        try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
    }
    accessToken = null;
    tokenExpiry = 0;
    localStorage.removeItem(GCAL_KEY_TOKEN);
    localStorage.removeItem(GCAL_KEY_CONN);
    // Keep GCAL_KEY_IDS so we don't re-create events if user reconnects
    onConnectCb?.(false);
}

/** Refresh an expired token silently (no prompt). */
export function refreshTokenSilent() {
    if (isGcalConnected()) return;
    if (localStorage.getItem(GCAL_KEY_CONN) !== 'true') return;
    const client = getTokenClient();
    if (!client) return;
    client.requestAccessToken({ prompt: '' });
}

// ===== gcal-id mapping (localStorage) =====

function getGcalId(entityKey) {
    try {
        const map = JSON.parse(localStorage.getItem(GCAL_KEY_IDS) || '{}');
        return map[entityKey] || null;
    } catch { return null; }
}

function setGcalId(entityKey, gcalId) {
    try {
        const map = JSON.parse(localStorage.getItem(GCAL_KEY_IDS) || '{}');
        map[entityKey] = gcalId;
        localStorage.setItem(GCAL_KEY_IDS, JSON.stringify(map));
    } catch { /* ignore */ }
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
            localStorage.removeItem(GCAL_KEY_TOKEN);
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
    const [h, m] = timeStr.split(':').map(Number);
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
        const dtEnd = addMinutesToDateStr(dateStr, ev.time, 60); // +1 hour
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
    if (dueDate.toDate) {
        const d = dueDate.toDate();
        return d.toISOString().slice(0, 10);
    }
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
            setGcalId(key, result.id);
        }
    }
}

/**
 * Sync all current app state to Google Calendar.
 * Called once after connecting (to push existing data).
 */
export async function syncAllToGcal(appState) {
    if (!isGcalConnected() || !appState) return;

    // Batch all sync operations
    const tasks = [];

    // Todos with due dates (not completed)
    appState.allTodos
        .filter(t => t.dueDate && !t.completed)
        .forEach(t => tasks.push(syncEntityToGcal('todo', t)));

    // Events (Termine)
    appState.allEvents
        .filter(ev => ev.date)
        .forEach(ev => tasks.push(syncEntityToGcal('event', ev)));

    // Exams with dates
    appState.allExams
        .filter(e => e.date)
        .forEach(e => {
            const course = appState.allCourses.find(c => c.id === e.courseId);
            tasks.push(syncEntityToGcal('exam', e, { courseName: course?.name || '' }));
        });

    // Assignments with due dates (not completed)
    appState.allAssignments
        .filter(a => a.dueDate && !a.completed)
        .forEach(a => {
            const course = appState.allCourses.find(c => c.id === a.courseId);
            tasks.push(syncEntityToGcal('assignment', a, { courseName: course?.name || '' }));
        });

    // Wishes with dates (not purchased)
    appState.allWishlistItems
        .filter(w => w.date && !w.purchased)
        .forEach(w => tasks.push(syncEntityToGcal('wish', w)));

    // Execute in small batches to avoid rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
        await Promise.allSettled(tasks.slice(i, i + BATCH_SIZE));
        if (i + BATCH_SIZE < tasks.length) {
            await new Promise(r => setTimeout(r, 200)); // 200ms pause between batches
        }
    }
}
