const dateFormatter = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long'
});

const shortDateFormatter = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric', month: 'short'
});

const groupDateFormatter = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});

export function toDate(timestamp) {
    if (!timestamp) return null;
    if (timestamp.toDate) return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    return new Date(timestamp);
}

export function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function isToday(timestamp) {
    const date = toDate(timestamp);
    if (!date) return false;
    const today = startOfDay(new Date());
    return startOfDay(date).getTime() === today.getTime();
}

export function isOverdue(timestamp) {
    const date = toDate(timestamp);
    if (!date) return false;
    const today = startOfDay(new Date());
    return startOfDay(date).getTime() < today.getTime();
}

export function isFuture(timestamp) {
    const date = toDate(timestamp);
    if (!date) return false;
    const today = startOfDay(new Date());
    return startOfDay(date).getTime() > today.getTime();
}

export function formatDate(timestamp) {
    const date = toDate(timestamp);
    if (!date) return '';

    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const target = startOfDay(date);

    if (target.getTime() === today.getTime()) return 'Heute';
    if (target.getTime() === tomorrow.getTime()) return 'Morgen';
    if (target < today) return shortDateFormatter.format(date);
    return dateFormatter.format(date);
}

export function formatGroupDate(timestamp) {
    const date = toDate(timestamp);
    if (!date) return '';

    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const target = startOfDay(date);

    if (target.getTime() === today.getTime()) return 'Heute';
    if (target.getTime() === tomorrow.getTime()) return 'Morgen';
    return groupDateFormatter.format(date);
}

export function toInputDate(timestamp) {
    const date = toDate(timestamp);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function dueDateClass(timestamp) {
    if (isToday(timestamp)) return 'today';
    if (isOverdue(timestamp)) return 'overdue';
    return '';
}

export function urgencyClass(timestamp) {
    const date = toDate(timestamp);
    if (!date) return '';
    const today = startOfDay(new Date());
    const target = startOfDay(date);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'urgency-urgent';
    if (diffDays <= 7) return 'urgency-soon';
    return '';
}

/**
 * Returns true if the given date is within the lecture period of a semester.
 * Lecture period = lectureStart..lectureEnd, minus any holiday periods.
 * The semester is "active" if today is between semesterStart and semesterEnd
 * (or the manual isActive override is set).
 */
export function isTodayLectureDay(semester, date = new Date()) {
    if (!semester) return true;
    const d = startOfDay(date);

    const lectStart = toDate(semester.lectureStart);
    const lectEnd = toDate(semester.lectureEnd);
    if (!lectStart || !lectEnd) return true;

    // Must be within lecture period
    if (d < startOfDay(lectStart) || d > startOfDay(lectEnd)) return false;

    // Check individual holiday periods (Ferien) — these override even within lecture period
    for (const h of (semester.holidays || [])) {
        const hs = toDate(h.start);
        const he = toDate(h.end);
        if (hs && he && d >= startOfDay(hs) && d <= startOfDay(he)) return false;
    }
    return true;
}

/**
 * Returns true if a semester is currently active.
 * Auto-detection: today is between semesterStart and semesterEnd.
 * Falls back to manual isActive flag if no outer dates are set.
 */
export function isSemesterActive(semester) {
    if (!semester) return false;
    const semStart = toDate(semester.semesterStart);
    const semEnd = toDate(semester.semesterEnd);
    if (semStart && semEnd) {
        const today = startOfDay(new Date());
        return today >= startOfDay(semStart) && today <= startOfDay(semEnd);
    }
    // Fall back to manual isActive flag
    return !!semester.isActive;
}

/**
 * Returns the currently active semester from an array, using auto-detection.
 */
export function getActiveSemester(semesters = []) {
    // Prefer auto-detected by date
    const byDate = semesters.find(s => {
        const start = toDate(s.semesterStart);
        const end = toDate(s.semesterEnd);
        if (!start || !end) return false;
        const today = startOfDay(new Date());
        return today >= startOfDay(start) && today <= startOfDay(end);
    });
    if (byDate) return byDate;
    // Fall back to manual isActive
    return semesters.find(s => s.isActive) || null;
}

// ===== Calendar Helpers =====

const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const MONTH_NAMES = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

export function getWeekdayShort() {
    return WEEKDAY_SHORT;
}

export function getMonthName(monthIndex) {
    return MONTH_NAMES[monthIndex] || '';
}

export function formatMonthYear(date) {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfWeek(year, month) {
    // Returns 0=Mon, 1=Tue, ..., 6=Sun
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
}

export function isSameDay(date1, date2) {
    if (!date1 || !date2) return false;
    const d1 = toDate(date1);
    const d2 = toDate(date2);
    if (!d1 || !d2) return false;
    return startOfDay(d1).getTime() === startOfDay(d2).getTime();
}

export function formatTodayHeader() {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(now);
    const day = now.getDate();
    const month = MONTH_NAMES[now.getMonth()];
    return `${weekday}, ${day}. ${month}`;
}

export function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Returns true if a recurring todo is active on the given date.
 * Handles recurrence types: 'weekly' (uses recurrenceWeekdays[]),
 * 'monthly' (uses recurrenceMonthDay, month-end clamped), 'daily' (backward compat).
 * App weekday convention: 0=Mon … 6=Sun (matches weekday-picker data-day values).
 */
export function isTodoActiveOnDate(todo, date) {
    if (!todo.recurrence) return false;
    const d = date instanceof Date ? date : new Date(date);

    // App convention: 0=Mon...6=Sun; JS getDay(): 0=Sun...6=Sat
    const appDayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;

    if (todo.recurrence === 'daily') return true; // backward compat
    if (todo.recurrence === 'weekly') {
        const weekdays = todo.recurrenceWeekdays || [];
        return weekdays.includes(appDayOfWeek);
    }
    if (todo.recurrence === 'monthly') {
        const target = todo.recurrenceMonthDay;
        if (!target) return false;
        // Clamp to last day of month (e.g. day 31 in a 30-day month → day 30)
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return d.getDate() === Math.min(target, lastDay);
    }
    return false;
}

export function calculateCourseAverage(exams, assignments) {
    const graded = [
        ...exams.filter(e => e.grade != null).map(e => ({ grade: e.grade, weight: e.weight || 1 })),
        ...assignments.filter(a => a.grade != null).map(a => ({ grade: a.grade, weight: a.weight || 1 })),
    ];
    if (graded.length === 0) return null;
    const totalWeight = graded.reduce((sum, g) => sum + g.weight, 0);
    const weightedSum = graded.reduce((sum, g) => sum + g.grade * g.weight, 0);
    return totalWeight > 0 ? weightedSum / totalWeight : null;
}

export function formatPrice(price) {
    if (price == null) return '';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);
}

// ===== HTML Escaping =====

export function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

export function escapeAttr(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
