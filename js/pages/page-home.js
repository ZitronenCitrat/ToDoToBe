import { appState, onStateChange, registerFabAction, openQuickAdd } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import {
    isToday, isOverdue, toDate, startOfDay, formatTodayHeader, todayDateStr,
    isTodayLectureDay, getActiveSemester, isSameDay, escapeHtml, escapeAttr
} from '../utils.js';
import { createTodoElement } from '../todo-item.js';

let initialized = false;

export function initPageHome() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-home');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="home-settings-btn">
                <span class="material-symbols-outlined">settings</span>
            </button>
            <div class="page-header-actions">
                <button class="avatar-btn" id="home-avatar-btn">
                    <img src="" alt="" id="home-avatar-img">
                </button>
            </div>
        </div>
        <div class="px-5 pb-3">
            <h1 id="home-greeting" class="text-2xl font-bold">Guten Morgen</h1>
            <p class="text-sm mt-1" style="color:var(--text-tertiary)" id="home-date-label"></p>
        </div>
        <div class="px-5" id="home-content"></div>
    `;

    container.querySelector('#home-settings-btn').addEventListener('click', () => navigate('settings'));
    container.querySelector('#home-avatar-btn').addEventListener('click', () => navigate('settings'));

    registerFabAction('home', openQuickAdd);

    onStateChange(() => { if (isActive()) renderHome(); });
    onRouteChange((route) => { if (route === 'home') renderHome(); });

    renderHome();
}

function isActive() {
    return window.location.hash.slice(1).split('/')[0] === 'home';
}

function renderHome() {
    const container = document.getElementById('page-home');
    if (!container) return;

    // Date label
    const dateLabel = container.querySelector('#home-date-label');
    if (dateLabel) dateLabel.textContent = formatTodayHeader();

    // Greeting
    const greeting = container.querySelector('#home-greeting');
    if (greeting) {
        const hour = new Date().getHours();
        let greetText = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
        if (appState.user?.displayName) {
            greetText += `, ${appState.user.displayName.split(' ')[0]}`;
        }
        greeting.textContent = greetText;
    }

    // Avatar
    if (appState.user) {
        const img = container.querySelector('#home-avatar-img');
        if (img) {
            img.src = appState.user.photoURL || '';
            img.alt = appState.user.displayName || '';
        }
    }

    const content = container.querySelector('#home-content');
    if (!content) return;

    // Build static HTML sections
    let html = '';
    html += buildGoalRingHtml();
    html += buildTagesplanHtml();
    html += buildTodaysTodosHtml();
    html += buildOutlookHtml();
    html += buildWishesHtml();

    content.innerHTML = html;

    // Wire dynamic todo elements (need DOM elements, not HTML strings)
    const todoList = content.querySelector('#home-todo-list');
    if (todoList) {
        getActiveTodayTodos().forEach(todo => {
            const listInfo = appState.allLists.find(l => l.id === todo.listId);
            const el = createTodoElement(todo, {
                showListTag: true,
                listName: listInfo?.name || '',
                listColor: listInfo?.color || ''
            });
            el.addEventListener('click', () => navigate('task', { id: todo.id }));
            todoList.appendChild(el);
        });
    }

    // Wire outlook toggle
    const outlookToggle = content.querySelector('#home-outlook-toggle');
    if (outlookToggle) {
        outlookToggle.addEventListener('click', () => {
            const body = content.querySelector('#home-outlook-body');
            const arrow = content.querySelector('#home-outlook-arrow');
            if (body) body.classList.toggle('hidden');
            const isOpen = body && !body.classList.contains('hidden');
            if (arrow) arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
        });
    }

    // Wire "Alle" button in wishes section
    const wishesAllBtn = content.querySelector('#home-wishes-all-btn');
    if (wishesAllBtn) {
        wishesAllBtn.addEventListener('click', () => navigate('wishlist'));
    }
}

// ===== Goal Ring =====

function buildGoalRingHtml() {
    const { done, total } = getTodayProgress();
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const progress = total > 0 ? done / total : 0;
    const offset = circumference * (1 - progress);
    const percent = total > 0 ? Math.round(progress * 100) : 0;

    return `
    <div class="glass mb-4" style="padding:16px 20px;display:flex;align-items:center;gap:20px">
        <svg width="88" height="88" class="progress-ring" style="flex-shrink:0">
            <circle class="progress-ring-bg" cx="44" cy="44" r="${radius}" stroke-width="7"/>
            <circle class="progress-ring-fill" cx="44" cy="44" r="${radius}" stroke-width="7"
                stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
        </svg>
        <div>
            <div style="color:var(--text-tertiary);font-size:12px;font-weight:500;margin-bottom:2px">Tagesziel</div>
            <div style="font-size:28px;font-weight:700;letter-spacing:-1px">${done}<span style="color:var(--text-tertiary);font-size:18px;font-weight:400">/${total}</span></div>
            <div style="color:var(--text-secondary);font-size:12px">${percent}% erledigt</div>
        </div>
    </div>`;
}

function getTodayProgress() {
    const todayActive = appState.allTodos.filter(t =>
        !t.completed && !t.recurrence && t.dueDate && (isToday(t.dueDate) || isOverdue(t.dueDate))
    );
    const todayDone = appState.allTodos.filter(t =>
        t.completed && !t.recurrence && t.dueDate && (isToday(t.dueDate) || isOverdue(t.dueDate))
    );
    const inboxList = appState.allLists.find(l => l.isDefault);
    const inboxId = inboxList?.id || null;
    const inboxActive = inboxId
        ? appState.allTodos.filter(t => t.listId === inboxId && !t.completed && !t.dueDate && !t.recurrence)
        : [];
    const inboxDone = inboxId
        ? appState.allTodos.filter(t => t.listId === inboxId && t.completed && !t.dueDate && !t.recurrence)
        : [];
    return {
        done: todayDone.length + inboxDone.length,
        total: todayActive.length + todayDone.length + inboxActive.length + inboxDone.length
    };
}

// ===== Tagesplan =====

function buildTagesplanHtml() {
    const items = getTodayPlanItems();
    if (items.length === 0) return '';

    const rows = items.map(item => {
        const subtitleParts = [];
        if (item.timeRange) subtitleParts.push(item.timeRange);
        if (item.subtitle) subtitleParts.push(item.subtitle);
        const subtitleHtml = subtitleParts.length
            ? `<div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(subtitleParts.join(' · '))}</div>`
            : '';

        return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--surface-border)">
            <div style="width:4px;height:36px;border-radius:2px;background:${escapeAttr(item.color)};flex-shrink:0"></div>
            <div style="min-width:52px;font-size:12px;color:var(--text-tertiary);flex-shrink:0">${escapeHtml(item.time || '–')}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.title)}</div>
                ${subtitleHtml}
            </div>
        </div>`;
    }).join('');

    return `
    <div class="glass-sm mb-4">
        <div style="padding:12px 16px 8px;font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:0.08em;text-transform:uppercase">Tagesplan</div>
        ${rows}
    </div>`;
}

function getTodayPlanItems() {
    const today = new Date();
    const todayStr = todayDateStr();
    const weekdayIdx = (today.getDay() + 6) % 7; // 0=Mon, 1=Tue, ..., 6=Sun
    const activeSemester = getActiveSemester(appState.allSemesters);
    const isLectureDay = isTodayLectureDay(activeSemester, today);

    const items = [];

    // Course slots for today (only during lecture period)
    if (isLectureDay) {
        for (const course of appState.allCourses) {
            const slots = course.timeSlots || [];
            for (const slot of slots) {
                if (slot.weekday !== weekdayIdx) continue;
                if ((course.skippedDates || []).includes(todayStr)) continue;
                const timeParts = [];
                if (slot.startTime) timeParts.push(slot.startTime);
                const timeRange = slot.startTime && slot.endTime
                    ? `${slot.startTime}–${slot.endTime}`
                    : (slot.startTime || '');
                items.push({
                    type: 'course',
                    time: slot.startTime || '',
                    timeRange,
                    title: course.name || 'Kurs',
                    subtitle: course.room || '',
                    color: course.color || '#3742fa',
                });
            }
        }
    }

    // Exams today
    for (const exam of appState.allExams) {
        if (!exam.date || !isSameDay(exam.date, today)) continue;
        const course = appState.allCourses.find(c => c.id === exam.courseId);
        items.push({
            type: 'exam',
            time: exam.time || '',
            timeRange: exam.time || '',
            title: `Klausur: ${exam.title || 'Klausur'}`,
            subtitle: [course?.name, exam.room].filter(Boolean).join(' · '),
            color: '#ef4444',
        });
    }

    // Calendar events today
    for (const ev of appState.allEvents) {
        if (!ev.date || !isSameDay(ev.date, today)) continue;
        items.push({
            type: 'event',
            time: ev.time || '',
            timeRange: ev.time || '',
            title: ev.title || 'Termin',
            subtitle: ev.category || '',
            color: 'var(--accent)',
        });
    }

    // Sort by time ascending; items without time go at the end
    items.sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    return items;
}

// ===== Today's Todos =====

function buildTodaysTodosHtml() {
    const todos = getActiveTodayTodos();

    if (todos.length === 0) {
        return `
        <div class="glass-sm mb-4 p-5" style="text-align:center">
            <span class="material-symbols-outlined" style="font-size:32px;color:var(--accent);display:block;margin-bottom:8px">task_alt</span>
            <div style="font-size:14px;color:var(--text-secondary)">Keine offenen Aufgaben für heute</div>
        </div>`;
    }

    return `
    <div class="glass-sm mb-4">
        <div style="padding:12px 16px 8px;font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:0.08em;text-transform:uppercase">Aufgaben heute</div>
        <div id="home-todo-list"></div>
    </div>`;
}

function getActiveTodayTodos() {
    const todayTodos = appState.allTodos.filter(t =>
        !t.completed && !t.recurrence && t.dueDate && (isToday(t.dueDate) || isOverdue(t.dueDate))
    );
    const inboxList = appState.allLists.find(l => l.isDefault);
    const inboxId = inboxList?.id || null;
    const inboxActive = inboxId
        ? appState.allTodos.filter(t => t.listId === inboxId && !t.completed && !t.dueDate && !t.recurrence)
        : [];
    return [...todayTodos, ...inboxActive].sort((a, b) => a.priority - b.priority);
}

// ===== Outlook: Next 2 Days =====

function buildOutlookHtml() {
    const today = startOfDay(new Date());

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const tomorrowItems = getDayItems(tomorrow);
    const dayAfterItems = getDayItems(dayAfter);

    if (tomorrowItems.length === 0 && dayAfterItems.length === 0) return '';

    const tomorrowHtml = buildDaySectionHtml(tomorrow, tomorrowItems);
    const dayAfterHtml = buildDaySectionHtml(dayAfter, dayAfterItems);

    return `
    <div class="glass-sm mb-4">
        <button id="home-outlook-toggle" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:none;border:none;cursor:pointer;text-align:left">
            <span style="font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:0.08em;text-transform:uppercase">Ausblick</span>
            <span class="material-symbols-outlined" id="home-outlook-arrow" style="font-size:18px;color:var(--text-tertiary);transition:transform 0.2s">expand_more</span>
        </button>
        <div id="home-outlook-body" class="hidden">
            ${tomorrowHtml}${dayAfterHtml}
        </div>
    </div>`;
}

function getDayItems(date) {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const weekdayIdx = (date.getDay() + 6) % 7;
    const activeSemester = getActiveSemester(appState.allSemesters);
    const isLectureDay = isTodayLectureDay(activeSemester, date);

    const items = [];

    // Todos due on this day
    appState.allTodos
        .filter(t => !t.completed && !t.recurrence && t.dueDate && isSameDay(t.dueDate, date))
        .forEach(t => items.push({
            icon: 'check_circle', color: 'var(--accent)',
            title: t.title, time: '', subtitle: ''
        }));

    // Assignments due
    appState.allAssignments
        .filter(a => !a.completed && a.dueDate && isSameDay(a.dueDate, date))
        .forEach(a => {
            const course = appState.allCourses.find(c => c.id === a.courseId);
            items.push({
                icon: 'assignment', color: '#f97316',
                title: a.title, time: '', subtitle: course?.name || ''
            });
        });

    // Exams
    appState.allExams
        .filter(e => e.date && isSameDay(e.date, date))
        .forEach(e => {
            const course = appState.allCourses.find(c => c.id === e.courseId);
            items.push({
                icon: 'quiz', color: '#ef4444',
                title: `Klausur: ${e.title || 'Klausur'}`,
                time: e.time || '', subtitle: course?.name || ''
            });
        });

    // Calendar events
    appState.allEvents
        .filter(ev => ev.date && isSameDay(ev.date, date))
        .forEach(ev => items.push({
            icon: 'event', color: 'var(--accent)',
            title: ev.title || 'Termin', time: ev.time || '', subtitle: ev.category || ''
        }));

    // Course slots (only during lecture period)
    if (isLectureDay) {
        for (const course of appState.allCourses) {
            for (const slot of (course.timeSlots || [])) {
                if (slot.weekday !== weekdayIdx) continue;
                if ((course.skippedDates || []).includes(dateStr)) continue;
                items.push({
                    icon: 'school', color: course.color || '#3742fa',
                    title: course.name || 'Kurs', time: slot.startTime || '', subtitle: course.room || ''
                });
            }
        }
    }

    // Sort by time (items without time go last)
    items.sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    return items;
}

const DAY_NAMES_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function buildDaySectionHtml(date, items) {
    if (items.length === 0) return '';

    const dayName = DAY_NAMES_SHORT[date.getDay()];
    const dateLabel = `${dayName}, ${date.getDate()}. ${MONTH_NAMES_SHORT[date.getMonth()]}`;

    const rows = items.map(item => `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 16px">
            <span class="material-symbols-outlined" style="font-size:16px;color:${escapeAttr(item.color)};flex-shrink:0">${item.icon}</span>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.title)}</div>
                ${item.subtitle ? `<div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(item.subtitle)}</div>` : ''}
            </div>
            ${item.time ? `<div style="font-size:11px;color:var(--text-tertiary);flex-shrink:0">${escapeHtml(item.time)}</div>` : ''}
        </div>`).join('');

    return `
    <div style="border-top:1px solid var(--surface-border);padding-bottom:6px">
        <div style="padding:8px 16px 4px;font-size:12px;font-weight:600;color:var(--text-secondary)">${dateLabel}</div>
        ${rows}
    </div>`;
}

// ===== Upcoming Wishes =====

function buildWishesHtml() {
    const wishes = getUpcomingWishes();
    if (wishes.length === 0) return '';

    const rows = wishes.map(w => {
        const dateObj = w.date ? toDate(w.date) : null;
        const dateLabel = dateObj
            ? `${dateObj.getDate()}. ${MONTH_NAMES_SHORT[dateObj.getMonth()]}`
            : '';
        const nutzen = w.nutzen || 0;
        const stars = '★'.repeat(nutzen) + '☆'.repeat(Math.max(0, 5 - nutzen));
        const priceLabel = w.price != null
            ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(w.price)
            : '';

        return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--surface-border)">
            <span class="material-symbols-outlined" style="font-size:20px;color:var(--accent);flex-shrink:0">star</span>
            <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(w.title)}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(stars)}${priceLabel ? ' · ' + priceLabel : ''}</div>
            </div>
            ${dateLabel ? `<div style="font-size:11px;color:var(--accent);flex-shrink:0;font-weight:500">${dateLabel}</div>` : ''}
        </div>`;
    }).join('');

    return `
    <div class="glass-sm mb-4">
        <div style="padding:12px 16px 8px;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:0.08em;text-transform:uppercase">Wünsche</span>
            <button id="home-wishes-all-btn" class="btn-ghost" style="font-size:12px;padding:4px 10px">Alle</button>
        </div>
        ${rows}
    </div>`;
}

function getUpcomingWishes() {
    const today = startOfDay(new Date());
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    const in14 = new Date(today);
    in14.setDate(in14.getDate() + 14);

    const unpurchased = appState.allWishlistItems.filter(w => !w.purchased);

    // Wishes with a date 7–14 days from now
    const byDate = unpurchased
        .filter(w => {
            if (!w.date) return false;
            const d = startOfDay(toDate(w.date));
            return d >= in7 && d <= in14;
        })
        .sort((a, b) => toDate(a.date) - toDate(b.date));

    if (byDate.length >= 3) return byDate.slice(0, 5);

    // Fill remaining slots with top-rated by nutzen
    const byDateIds = new Set(byDate.map(w => w.id));
    const byNutzen = unpurchased
        .filter(w => !byDateIds.has(w.id))
        .sort((a, b) => (b.nutzen || 0) - (a.nutzen || 0));

    return [...byDate, ...byNutzen].slice(0, 5);
}
