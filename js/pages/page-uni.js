import { appState, onStateChange } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import {
    toDate, formatDate, startOfDay, urgencyClass,
    isTodayLectureDay, getActiveSemester, escapeHtml, escapeAttr
} from '../utils.js';
import {
    updateCourse, deleteCourse, updateExam, deleteExam,
    addExam, updateAssignment, deleteAssignment, addAssignment,
    addEvent, deleteEvent
} from '../db.js';

const TOTAL_LP = 180;

let initialized = false;
let selectedWeekday = null; // null = today

function getTodayDayIdx() {
    const d = new Date();
    return d.getDay() === 0 ? 6 : d.getDay() - 1;
}

function getSelectedDay() {
    return selectedWeekday !== null ? selectedWeekday : getTodayDayIdx();
}

export function initPageUni() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-uni');

    container.innerHTML = `
        <!-- Scoped ambient glow — only visible when this page is shown -->
        <div style="position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 50% 60%, rgba(180,100,5,0.18) 0%, rgba(120,60,0,0.10) 40%, transparent 70%)"></div>

        <div class="page-header" style="position:relative;z-index:1">
            <button class="icon-btn" id="uni-settings-btn">
                <span class="material-symbols-outlined">settings</span>
            </button>
        </div>

        <div class="px-5 pb-1" style="position:relative;z-index:1">
            <h1 style="font-size:32px;font-weight:800;color:var(--text-primary);letter-spacing:-0.5px;margin-top:8px;margin-bottom:12px">University Planner</h1>
            <div style="display:flex;justify-content:flex-end;gap:4px;margin-bottom:20px">
                <button class="icon-btn" id="uni-timetable-btn" title="Stundenplan">
                    <span class="material-symbols-outlined">schedule</span>
                </button>
                <button class="icon-btn" id="uni-assignments-btn" title="Aufgaben">
                    <span class="material-symbols-outlined">assignment</span>
                </button>
                <button class="icon-btn" id="uni-grades-btn" title="Noten">
                    <span class="material-symbols-outlined">grade</span>
                </button>
                <button class="icon-btn" id="uni-flashcards-btn" title="Lernkarten">
                    <span class="material-symbols-outlined">style</span>
                </button>
            </div>
        </div>

        <div class="px-5 flex-1 overflow-y-auto" id="uni-content" style="position:relative;z-index:1"></div>
    `;

    container.querySelector('#uni-settings-btn').addEventListener('click', () => navigate('uni-settings'));
    container.querySelector('#uni-timetable-btn').addEventListener('click', () => navigate('timetable'));
    container.querySelector('#uni-assignments-btn').addEventListener('click', () => navigate('assignments'));
    container.querySelector('#uni-grades-btn').addEventListener('click', () => navigate('grades'));
    container.querySelector('#uni-flashcards-btn').addEventListener('click', () => navigate('flashcards'));

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'uni') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'uni'; }

function calcEarnedLP() {
    let earned = 0;
    appState.allExams.forEach(e => {
        if (e.grade != null && e.grade <= 4.0) earned += (e.creditPoints || 0);
    });
    return Math.min(earned, TOTAL_LP);
}

/** Credit-weighted overall average across all courses with a grade */
function calcOverallGPA() {
    const courses = appState.allCourses;
    const exams = appState.allExams;
    const assignments = appState.allAssignments;

    let totalLP = 0;
    let weightedSum = 0;

    courses.forEach(course => {
        const courseExams = exams.filter(e => e.courseId === course.id && e.grade != null);
        const courseAssignments = assignments.filter(a => a.courseId === course.id && a.grade != null);
        if (courseExams.length === 0 && courseAssignments.length === 0) return;

        // Per-course weighted average by exam weight
        const graded = [
            ...courseExams.map(e => ({ grade: e.grade, weight: e.weight || 1 })),
            ...courseAssignments.map(a => ({ grade: a.grade, weight: a.weight || 1 }))
        ];
        const courseWeight = graded.reduce((s, g) => s + g.weight, 0);
        const courseAvg = graded.reduce((s, g) => s + g.grade * g.weight, 0) / courseWeight;

        const lp = course.creditHours || 1; // treat 0 LP as 1 for weighting
        weightedSum += courseAvg * lp;
        totalLP += lp;
    });

    return totalLP > 0 ? weightedSum / totalLP : null;
}

// ===== Calendar Event Sync Helpers =====

export async function generateCourseCalendarEvents(course) {
    const semesters = appState.allSemesters || [];
    const semester = (course.semesterId && semesters.find(s => s.id === course.semesterId))
        || getActiveSemester(semesters);
    if (!semester) return;

    const lectureStart = semester.lectureStart.toDate
        ? semester.lectureStart.toDate()
        : new Date(semester.lectureStart);
    const lectureEnd = semester.lectureEnd.toDate
        ? semester.lectureEnd.toDate()
        : new Date(semester.lectureEnd);
    const holidays = semester.holidays || [];

    function isHolidayDate(date) {
        return holidays.some(h => {
            const hStart = h.start.toDate ? h.start.toDate() : new Date(h.start);
            const hEnd = h.end.toDate ? h.end.toDate() : new Date(h.end);
            return date >= hStart && date <= hEnd;
        });
    }

    // weekday: 0=Monday, 6=Sunday → JS getDay() 0=Sunday
    function getFirstOccurrence(startDate, weekday) {
        const d = new Date(startDate);
        const jsWeekday = weekday === 6 ? 0 : weekday + 1;
        while (d.getDay() !== jsWeekday) d.setDate(d.getDate() + 1);
        return d;
    }

    for (const slot of (course.timeSlots || [])) {
        let current = getFirstOccurrence(lectureStart, slot.weekday);
        while (current <= lectureEnd) {
            if (!isHolidayDate(current)) {
                const dateStr = [
                    current.getFullYear(),
                    String(current.getMonth() + 1).padStart(2, '0'),
                    String(current.getDate()).padStart(2, '0')
                ].join('-');
                const alreadyExists = appState.allEvents.some(ev => {
                    if (ev.courseId !== course.id || ev.time !== slot.startTime) return false;
                    if (ev.extraEventName) return false; // Skip Übung events
                    if (!ev.date) return false;
                    const evStr = ev.date.toDate
                        ? ev.date.toDate().toISOString().split('T')[0]
                        : String(ev.date).split('T')[0];
                    return evStr === dateStr;
                });
                if (!alreadyExists) {
                    await addEvent({
                        title: course.name,
                        date: dateStr,
                        time: slot.startTime,
                        endTime: slot.endTime,
                        category: 'Uni',
                        recurrence: null,
                        courseId: course.id
                    });
                }
            }
            current = new Date(current);
            current.setDate(current.getDate() + 7);
        }
    }

    // Generate calendar events for additional events (Übungen, Tutorien, etc.)
    for (const extraEvent of (course.additionalEvents || [])) {
        for (const slot of (extraEvent.timeSlots || [])) {
            let current = getFirstOccurrence(lectureStart, slot.weekday);
            while (current <= lectureEnd) {
                if (!isHolidayDate(current)) {
                    const dateStr = [
                        current.getFullYear(),
                        String(current.getMonth() + 1).padStart(2, '0'),
                        String(current.getDate()).padStart(2, '0')
                    ].join('-');
                    const alreadyExists = appState.allEvents.some(ev => {
                        if (ev.courseId !== course.id || ev.time !== slot.startTime) return false;
                        if ((ev.extraEventName || null) !== extraEvent.name) return false;
                        if (!ev.date) return false;
                        const evStr = ev.date.toDate
                            ? ev.date.toDate().toISOString().split('T')[0]
                            : String(ev.date).split('T')[0];
                        return evStr === dateStr;
                    });
                    if (!alreadyExists) {
                        await addEvent({
                            title: extraEvent.name,
                            date: dateStr,
                            time: slot.startTime,
                            endTime: slot.endTime,
                            category: 'Uni',
                            recurrence: null,
                            courseId: course.id,
                            extraEventName: extraEvent.name
                        });
                    }
                }
                current = new Date(current);
                current.setDate(current.getDate() + 7);
            }
        }
    }
}

async function deleteCalendarEventsForCourse(courseId) {
    const toDelete = (appState.allEvents || []).filter(ev => ev.courseId === courseId);
    for (const ev of toDelete) {
        await deleteEvent(ev.id);
    }
}

async function deleteCalendarEventsForExtra(courseId, extraEventName) {
    const toDelete = (appState.allEvents || []).filter(ev =>
        ev.courseId === courseId && ev.extraEventName === extraEventName
    );
    for (const ev of toDelete) {
        await deleteEvent(ev.id);
    }
}

/** A course is "completed" if it has at least one passed exam (grade ≤ 4.0) */
function isCourseCompleted(course) {
    return appState.allExams.some(e => e.courseId === course.id && e.grade != null && e.grade <= 4.0);
}

function render() {
    const content = document.querySelector('#uni-content');
    if (!content) return;

    const courses = appState.allCourses;
    const exams = appState.allExams;
    const activeSemester = getActiveSemester(appState.allSemesters || []);

    const todayIdx = getTodayDayIdx();
    const selDay = getSelectedDay();
    const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    // === Week Date Strip ===
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - todayIdx);

    let weekHtml = `<div class="uni-week-strip" id="uni-week-strip">`;
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const isSel = i === selDay;
        const isWeekend = i >= 5;
        weekHtml += `<button class="uni-day-btn${isSel ? ' selected' : ''}${isWeekend ? ' weekend' : ''}" data-day="${i}">
            <span class="day-name">${DAY_LABELS[i]}</span>
            <span class="day-num">${d.getDate()}</span>
        </button>`;
    }
    weekHtml += '</div>';

    // Actual Date object for the selected day in the strip
    const selectedDate = startOfDay(new Date(weekStart));
    selectedDate.setDate(weekStart.getDate() + selDay);
    const selectedDateStr = [
        selectedDate.getFullYear(),
        String(selectedDate.getMonth() + 1).padStart(2, '0'),
        String(selectedDate.getDate()).padStart(2, '0')
    ].join('-');

    // === Courses for selected day ===
    const isLectureDay = isTodayLectureDay(activeSemester, selectedDate);
    const dayCourses = courses
        .filter(c => {
            const slots = c.timeSlots || [];
            if (slots.length > 0) return slots.some(s => s.weekday === selDay);
            return (c.weekdays || []).includes(selDay);
        })
        .sort((a, b) => {
            const aTime = (a.timeSlots || []).find(s => s.weekday === selDay)?.startTime || a.startTime || '';
            const bTime = (b.timeSlots || []).find(s => s.weekday === selDay)?.startTime || b.startTime || '';
            return aTime.localeCompare(bTime);
        });

    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    const isToday = selDay === todayIdx;

    let coursesHtml = '';
    if (!isLectureDay) {
        coursesHtml = `<div style="text-align:center;padding:28px 0 32px">
            <span class="material-symbols-outlined" style="font-size:36px;color:var(--text-tertiary);display:block;margin-bottom:8px">event_busy</span>
            <div style="font-size:14px;color:var(--text-tertiary)">Vorlesungsfrei</div>
        </div>`;
    } else if (dayCourses.length === 0) {
        const isWeekend = selDay >= 5;
        coursesHtml = `<div style="text-align:center;padding:28px 0 32px">
            <span class="material-symbols-outlined" style="font-size:36px;color:var(--text-tertiary);display:block;margin-bottom:8px">${isWeekend ? 'weekend' : 'school'}</span>
            <div style="font-size:14px;color:var(--text-tertiary)">${isWeekend ? 'Wochenende 🎉' : 'Keine Vorlesungen'}</div>
        </div>`;
    } else {
        coursesHtml = `<div class="uni-course-grid">`;
        dayCourses.forEach(c => {
            const slots = (c.timeSlots || []).filter(s => s.weekday === selDay);
            const slot = slots[0] || {};
            const timeStr = slots.length > 0
                ? slots.map(s => `${s.startTime || ''}–${s.endTime || ''}`).join(', ')
                : `${c.startTime || ''}–${c.endTime || ''}`;
            const color = c.color || 'var(--accent)';

            let isActiveCourse = false;
            if (isToday && slot.startTime && slot.endTime) {
                const [sh, sm] = slot.startTime.split(':').map(Number);
                const [eh, em] = slot.endTime.split(':').map(Number);
                isActiveCourse = nowMinutes >= sh * 60 + sm && nowMinutes <= eh * 60 + em;
            }

            coursesHtml += `<div class="glass-sm uni-course-card${isActiveCourse ? ' is-active' : ''}" data-course-id="${escapeAttr(c.id)}">
                <div class="accent-bar" style="background:${escapeAttr(color)}"></div>
                <div style="font-size:15px;font-weight:700;color:var(--text-primary);line-height:1.2;margin-bottom:6px">${escapeHtml(c.name)}</div>
                ${c.room ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:2px">${escapeHtml(c.room)}</div>` : ''}
                <div style="font-size:13px;color:var(--text-secondary)">${escapeHtml(timeStr)}</div>
            </div>`;
        });
        coursesHtml += '</div>';
    }

    // === Exams for selected day ===
    const examsForDay = exams.filter(exam => {
        if (!exam.date) return false;
        const examDate = toDate(exam.date);
        if (!examDate) return false;
        const examDateStr = [
            examDate.getFullYear(),
            String(examDate.getMonth() + 1).padStart(2, '0'),
            String(examDate.getDate()).padStart(2, '0')
        ].join('-');
        return examDateStr === selectedDateStr;
    });

    if (examsForDay.length > 0) {
        examsForDay.forEach(exam => {
            const course = courses.find(c => c.id === exam.courseId);
            coursesHtml += `<div class="glass-sm" style="border-radius:14px;padding:14px 16px;margin-top:8px;display:flex;align-items:center;gap:12px">
                <span class="material-symbols-outlined" style="font-size:22px;color:#ef4444;flex-shrink:0">assignment</span>
                <div style="flex:1;min-width:0">
                    <div style="font-size:14px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(exam.title || course?.name || 'Klausur')}</div>
                    ${course ? `<div style="font-size:12px;color:var(--text-tertiary)">${escapeHtml(course.name)}</div>` : ''}
                </div>
                ${exam.creditPoints ? `<div style="font-size:12px;font-weight:600;color:#ef4444;flex-shrink:0">${exam.creditPoints} LP</div>` : ''}
            </div>`;
        });
    }

    // === Compact LP + GPA Card ===
    const earnedLP = calcEarnedLP();
    const lpProgress = earnedLP / TOTAL_LP;
    const overallGPA = calcOverallGPA();

    const statsCardHtml = `<div class="glass-sm mb-4" style="display:flex;align-items:stretch">
        <div style="flex:1;padding:16px 20px">
            <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">LP</div>
            <div style="font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:8px">${earnedLP}<span style="font-size:13px;font-weight:400;color:var(--text-tertiary);margin-left:2px">/180</span></div>
            <div style="height:3px;border-radius:2px;background:var(--surface-border);overflow:hidden">
                <div style="height:100%;border-radius:2px;background:var(--accent);width:${Math.round(lpProgress * 100)}%;transition:width 0.6s ease"></div>
            </div>
        </div>
        <div style="flex:1;padding:16px 20px;border-left:1px solid rgba(255,255,255,0.08)">
            <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Ø Note</div>
            ${overallGPA != null
                ? `<div style="font-size:20px;font-weight:700;color:${overallGPA <= 2.0 ? '#4ade80' : overallGPA <= 3.0 ? 'var(--accent)' : '#f87171'}">${overallGPA.toFixed(2)}</div>`
                : `<div style="font-size:20px;font-weight:700;color:var(--text-tertiary)">–</div>`
            }
        </div>
    </div>`;

    // === Next Exams ===
    const todayStart = startOfDay(new Date());
    const upcomingExams = exams
        .filter(e => { const d = toDate(e.date); return d && d >= todayStart && !e.completed; })
        .sort((a, b) => (toDate(a.date) || new Date(9999, 0)) - (toDate(b.date) || new Date(9999, 0)))
        .slice(0, 3);

    let examsHtml = `<div style="font-size:22px;font-weight:800;color:var(--text-primary);margin:24px 0 14px 0">Next Exams</div>`;
    examsHtml += statsCardHtml;

    if (upcomingExams.length === 0) {
        examsHtml += `<div style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:14px">Keine anstehenden Klausuren</div>`;
    } else {
        upcomingExams.forEach(e => {
            const examDate = startOfDay(toDate(e.date));
            const daysUntil = Math.ceil((examDate.getTime() - todayStart.getTime()) / 86400000);
            const course = courses.find(c => c.id === e.courseId);

            const progress = daysUntil <= 30 ? 1 - (daysUntil / 30) : 0.05;
            const dashLen = (progress * 213.6).toFixed(1);

            let ringStroke, ringFilterStyle, centerSvg;
            if (daysUntil <= 7) {
                ringStroke = '#ff6b00';
                ringFilterStyle = 'filter:drop-shadow(0 0 8px rgba(255,107,0,0.7))';
                centerSvg = `<g transform="rotate(90 40 40)">
                    <text x="40" y="34" text-anchor="middle" dominant-baseline="middle"
                        style="font-size:22px;font-weight:800;fill:#ff6b00">${daysUntil}</text>
                    <text x="40" y="52" text-anchor="middle" dominant-baseline="middle"
                        style="font-size:11px;fill:white;opacity:0.7">days</text>
                </g>`;
            } else if (daysUntil <= 14) {
                ringStroke = 'var(--accent)';
                ringFilterStyle = 'filter:drop-shadow(0 0 6px rgba(245,158,11,0.5))';
                centerSvg = `<g transform="rotate(90 40 40)">
                    <text x="40" y="34" text-anchor="middle" dominant-baseline="middle"
                        style="font-size:22px;font-weight:800;fill:var(--accent)">${daysUntil}</text>
                    <text x="40" y="52" text-anchor="middle" dominant-baseline="middle"
                        style="font-size:11px;fill:white;opacity:0.7">days</text>
                </g>`;
            } else {
                ringStroke = 'rgba(255,255,255,0.2)';
                ringFilterStyle = '';
                const dateStr = `${examDate.getDate()}. ${MONTHS_SHORT[examDate.getMonth()]}`;
                centerSvg = `<g transform="rotate(90 40 40)">
                    <text x="40" y="40" text-anchor="middle" dominant-baseline="middle"
                        style="font-size:12px;font-weight:600;fill:var(--text-secondary)">${escapeHtml(dateStr)}</text>
                </g>`;
            }

            const relStr = daysUntil === 0 ? 'Heute' : daysUntil === 1 ? 'Morgen' : `in ${daysUntil} Tagen`;
            const dateRelStr = `${examDate.getDate()}. ${MONTHS_SHORT[examDate.getMonth()]}, ${relStr}`;

            examsHtml += `<div class="glass-sm" style="border-radius:18px;padding:18px;margin-bottom:12px;display:flex;align-items:center;gap:16px">
                <div class="uni-exam-ring-wrap" style="${ringFilterStyle}">
                    <svg width="80" height="80" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
                        <circle cx="40" cy="40" r="34" fill="none" stroke="${ringStroke}" stroke-width="6"
                            stroke-dasharray="${dashLen} 213.6" stroke-dashoffset="0"
                            stroke-linecap="round"/>
                        ${centerSvg}
                    </svg>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.title || course?.name || 'Klausur')}</div>
                    <div style="font-size:14px;color:var(--accent);font-weight:500;margin-bottom:4px">${escapeHtml(dateRelStr)}</div>
                    ${e.room ? `<div style="font-size:13px;color:var(--text-secondary)">${escapeHtml(e.room)}</div>` : ''}
                </div>
            </div>`;
        });
    }

    // === Full Course List (expandable) ===
    const activeCourses = courses.filter(c => !isCourseCompleted(c));
    const completedCourses = courses.filter(c => isCourseCompleted(c));
    let allCoursesHtml = '';
    if (courses.length === 0) {
        allCoursesHtml = `<div class="empty-state" style="animation:fadeInUp 0.45s cubic-bezier(0.22,1,0.36,1) both 0.1s">
            <span class="material-symbols-outlined" style="font-size:48px;color:var(--accent)">school</span>
            <div class="empty-state-text">Lege Kurse an, um zu starten</div>
        </div>`;
    } else {
        allCoursesHtml = `<div style="font-size:22px;font-weight:800;color:var(--text-primary);margin:24px 0 14px 0">Alle Kurse</div>`;
        activeCourses.forEach(c => { allCoursesHtml += renderCourseCard(c); });
        if (completedCourses.length > 0) {
            allCoursesHtml += `<div class="uni-section-subheader">✓ Abgeschlossen (${completedCourses.length})</div>`;
            completedCourses.forEach(c => { allCoursesHtml += renderCourseCard(c, true); });
        }
    }

    content.innerHTML = weekHtml + coursesHtml + examsHtml + allCoursesHtml;

    // Wire week strip buttons
    content.querySelectorAll('.uni-day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedWeekday = parseInt(btn.dataset.day);
            render();
        });
    });

    wireExpandCards(content);
}

function renderCourseCard(course, isCompleted = false) {
    const courseExams = appState.allExams.filter(e => e.courseId === course.id);
    const courseAssignments = appState.allAssignments.filter(a => a.courseId === course.id);
    const slots = course.timeSlots || [];
    const additionalEvents = course.additionalEvents || [];

    const passedLP = courseExams
        .filter(e => e.grade != null && e.grade <= 4.0)
        .reduce((s, e) => s + (e.creditPoints || 0), 0);

    const statusDot = isCompleted
        ? `<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;flex-shrink:0"></span>`
        : `<span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;display:inline-block;flex-shrink:0"></span>`;

    return `<div class="glass-sm mb-3 course-expand-card" data-course-id="${escapeAttr(course.id)}">
        <div class="p-4 flex items-center justify-between expand-trigger" style="cursor:pointer">
            <div class="flex items-center gap-3">
                ${statusDot}
                <div style="width:3px;height:32px;border-radius:2px;background:${course.color || '#3742fa'}"></div>
                <div>
                    <div style="font-size:15px;font-weight:600">${escapeHtml(course.name)}</div>
                    <div style="font-size:12px;color:var(--text-tertiary)">${course.creditHours || 0} LP · ${courseExams.length} Klausur(en)${passedLP > 0 ? ' · +' + passedLP + ' LP erworben' : ''}</div>
                </div>
            </div>
            <span class="material-symbols-outlined expand-icon" style="font-size:20px;color:var(--text-tertiary);transition:transform 0.2s">expand_more</span>
        </div>
        <div class="course-expand-body" id="course-body-${escapeAttr(course.id)}">
            <div style="padding:0 16px 16px">
                <!-- Course actions -->
                <div class="flex gap-2 mb-3">
                    <button class="btn-ghost flex-1 edit-course-btn" data-id="${escapeAttr(course.id)}" style="font-size:12px;padding:6px">
                        <span class="material-symbols-outlined" style="font-size:14px">edit</span> Kurs bearbeiten
                    </button>
                    <button class="btn-danger flex-1 delete-course-btn" data-id="${escapeAttr(course.id)}" style="font-size:12px;padding:6px">
                        <span class="material-symbols-outlined" style="font-size:14px">delete</span> Löschen
                    </button>
                </div>

                <!-- Time slots -->
                ${slots.length > 0 ? `<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">schedule</span>
                    ${slots.map(s => {
                        const DAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
                        return `${DAYS[s.weekday] || s.weekday}: ${s.startTime}–${s.endTime}`;
                    }).join(' · ')}
                </div>` : ''}
                ${course.room ? `<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">room</span>
                    ${escapeHtml(course.room)}
                </div>` : ''}

                <!-- Exams -->
                ${courseExams.length > 0 ? `<div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Klausuren</div>
                ${courseExams.map(e => `
                    <div class="flex items-center justify-between py-2" style="border-top:1px solid var(--surface-border)">
                        <div class="flex-1">
                            <div style="font-size:13px;font-weight:500">${escapeHtml(e.title)}</div>
                            <div style="font-size:11px;color:var(--text-tertiary)">${formatDate(e.date) || 'Kein Datum'} · ${e.creditPoints || 0} LP${e.grade != null ? ' · Note: ' + e.grade.toFixed(1) : ''}</div>
                        </div>
                        <div class="flex gap-1">
                            <button class="icon-btn edit-exam-btn" data-id="${escapeAttr(e.id)}" style="width:28px;height:28px">
                                <span class="material-symbols-outlined" style="font-size:14px;color:var(--accent)">edit</span>
                            </button>
                            <button class="icon-btn delete-exam-btn" data-id="${escapeAttr(e.id)}" style="width:28px;height:28px">
                                <span class="material-symbols-outlined" style="font-size:14px;color:var(--priority-1)">delete</span>
                            </button>
                        </div>
                    </div>`).join('')}` : ''}

                <!-- Additional Events (Exercises) -->
                ${additionalEvents.length > 0 ? `<div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 6px">Übungen / Zusatz</div>
                ${additionalEvents.map((ev, idx) => {
                    const DAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
                    const slotStr = (ev.timeSlots || []).map(s => `${DAYS[s.weekday]}: ${s.startTime}–${s.endTime}`).join(', ');
                    return `<div class="flex items-center justify-between py-2" style="border-top:1px solid var(--surface-border)">
                        <div class="flex-1">
                            <div style="font-size:13px;font-weight:500">${escapeHtml(ev.name)}</div>
                            <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(ev.type || 'Übung')} · ${slotStr || ''} ${ev.room ? '· ' + escapeHtml(ev.room) : ''}</div>
                        </div>
                        <div class="flex gap-1">
                            <button class="icon-btn edit-extra-btn" data-course-id="${escapeAttr(course.id)}" data-idx="${idx}" style="width:28px;height:28px">
                                <span class="material-symbols-outlined" style="font-size:14px;color:var(--accent)">edit</span>
                            </button>
                            <button class="icon-btn delete-extra-btn" data-course-id="${escapeAttr(course.id)}" data-idx="${idx}" style="width:28px;height:28px">
                                <span class="material-symbols-outlined" style="font-size:14px;color:var(--priority-1)">delete</span>
                            </button>
                        </div>
                    </div>`;
                }).join('')}` : ''}

                <!-- Add buttons -->
                <div class="flex gap-2 mt-3">
                    <button class="btn-ghost flex-1 add-exam-btn" data-course-id="${escapeAttr(course.id)}" data-credit="${course.creditHours || 0}" style="font-size:12px;padding:6px">
                        + Klausur
                    </button>
                    <button class="btn-ghost flex-1 add-extra-btn" data-course-id="${escapeAttr(course.id)}" style="font-size:12px;padding:6px">
                        + Übung / Zusatz
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}

function wireExpandCards(content) {
    // Expand/collapse
    content.querySelectorAll('.expand-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
            const card = trigger.closest('.course-expand-card');
            const body = card.querySelector('.course-expand-body');
            const icon = card.querySelector('.expand-icon');
            const isOpen = card.classList.toggle('open');
            if (body) body.style.maxHeight = isOpen ? body.scrollHeight + 'px' : '0';
            if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : '';
        });
    });

    // Edit course
    content.querySelectorAll('.edit-course-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const course = appState.allCourses.find(c => c.id === btn.dataset.id);
            if (course) openEditCourseModal(course);
        });
    });

    // Delete course
    content.querySelectorAll('.delete-course-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const course = appState.allCourses.find(c => c.id === btn.dataset.id);
            if (course && confirm(`Kurs "${course.name}" und alle zugehörigen Daten löschen?`)) {
                await deleteCalendarEventsForCourse(btn.dataset.id);
                deleteCourse(btn.dataset.id);
            }
        });
    });

    // Edit exam
    content.querySelectorAll('.edit-exam-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditExamModal(btn.dataset.id);
        });
    });

    // Delete exam
    content.querySelectorAll('.delete-exam-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Klausur löschen?')) {
                const examId = btn.dataset.id;
                const examEvent = (appState.allEvents || []).find(ev => ev.examId === examId);
                if (examEvent) await deleteEvent(examEvent.id);
                deleteExam(examId);
            }
        });
    });

    // Edit additional event (Übung/Tutorium)
    content.querySelectorAll('.edit-extra-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditExtraModal(btn.dataset.courseId, parseInt(btn.dataset.idx));
        });
    });

    // Delete additional event
    content.querySelectorAll('.delete-extra-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Übung/Zusatz löschen?')) return;
            const course = appState.allCourses.find(c => c.id === btn.dataset.courseId);
            if (!course) return;
            const events = [...(course.additionalEvents || [])];
            const deleted = events.splice(parseInt(btn.dataset.idx), 1)[0];
            if (deleted?.name) {
                await deleteCalendarEventsForExtra(btn.dataset.courseId, deleted.name);
            }
            await updateCourse(btn.dataset.courseId, { additionalEvents: events });
        });
    });

    // Add exam
    content.querySelectorAll('.add-exam-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddExamModal(btn.dataset.courseId, parseInt(btn.dataset.credit) || 0);
        });
    });

    // Add extra event (Übung/Tutorium)
    content.querySelectorAll('.add-extra-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddExtraModal(btn.dataset.courseId);
        });
    });
}

// ===== Edit Course Modal =====
const COLORS = ['#3742fa', '#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#a55eea', '#ff6348', '#00ffd5'];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

function openEditCourseModal(course) {
    const old = document.getElementById('course-edit-modal');
    if (old) old.remove();

    const slots = course.timeSlots && course.timeSlots.length > 0
        ? JSON.parse(JSON.stringify(course.timeSlots))
        : (course.weekdays || []).map(wd => ({ weekday: wd, startTime: course.startTime || '08:00', endTime: course.endTime || '09:30' }));

    let localSlots = [...slots];

    const modal = document.createElement('div');
    modal.id = 'course-edit-modal';
    modal.className = 'modal-overlay';

    function renderSlotRows() {
        return localSlots.map((s, i) => `
            <div class="flex gap-2 mb-2 items-center" data-slot-idx="${i}">
                <select class="glass-select" style="width:70px" data-field="weekday" data-idx="${i}">
                    ${WEEKDAYS.map((d, wi) => `<option value="${wi}" ${s.weekday === wi ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <input type="time" class="glass-input flex-1" value="${s.startTime}" data-field="startTime" data-idx="${i}">
                <input type="time" class="glass-input flex-1" value="${s.endTime}" data-field="endTime" data-idx="${i}">
                <button class="icon-btn remove-slot-btn" data-idx="${i}">
                    <span class="material-symbols-outlined" style="font-size:16px;color:var(--priority-1)">remove</span>
                </button>
            </div>`).join('');
    }

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Kurs bearbeiten</h2>
            <input type="text" id="ce-name" class="glass-input w-full mb-3" value="${escapeAttr(course.name)}" placeholder="Kursname">
            <input type="text" id="ce-instructor" class="glass-input w-full mb-3" value="${escapeAttr(course.instructor || '')}" placeholder="Dozent">
            <input type="text" id="ce-room" class="glass-input w-full mb-3" value="${escapeAttr(course.room || '')}" placeholder="Raum">
            <input type="number" id="ce-credit" class="glass-input w-full mb-3" value="${course.creditHours || 0}" placeholder="Leistungspunkte (LP)" step="1" min="0">
            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Zeitslots</div>
            <div id="ce-slots">${renderSlotRows()}</div>
            <button id="ce-add-slot" class="btn-ghost w-full mb-3" style="font-size:13px">+ Zeitslot hinzufügen</button>
            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Farbe</div>
            <div class="flex gap-2 mb-4" id="ce-colors">
                ${COLORS.map(c => `<button class="color-btn ${c === course.color ? 'active' : ''}" data-color="${c}"
                    style="width:28px;height:28px;border-radius:50%;background:${c};border:2px solid ${c === course.color ? 'white' : 'transparent'}"></button>`).join('')}
            </div>
            <button id="ce-save" class="btn-accent w-full">Speichern</button>
        </div>`;
    document.body.appendChild(modal);

    function rewireSlots() {
        modal.querySelector('#ce-slots').innerHTML = renderSlotRows();
        modal.querySelectorAll('[data-field]').forEach(inp => {
            inp.addEventListener('change', () => {
                const idx = parseInt(inp.dataset.idx);
                const field = inp.dataset.field;
                if (field === 'weekday') {
                    localSlots[idx].weekday = parseInt(inp.value);
                } else {
                    localSlots[idx][field] = inp.value;
                }
            });
        });
        modal.querySelectorAll('.remove-slot-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                localSlots.splice(parseInt(btn.dataset.idx), 1);
                rewireSlots();
            });
        });
    }
    rewireSlots();

    modal.querySelector('#ce-add-slot').addEventListener('click', () => {
        localSlots.push({ weekday: 0, startTime: '08:00', endTime: '09:30' });
        rewireSlots();
    });

    modal.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.color-btn').forEach(b => { b.style.borderColor = 'transparent'; b.classList.remove('active'); });
            btn.style.borderColor = 'white';
            btn.classList.add('active');
        });
    });

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#ce-save').addEventListener('click', async () => {
        const name = modal.querySelector('#ce-name').value.trim();
        if (!name) return;
        const activeColor = modal.querySelector('#ce-colors .color-btn.active');
        await updateCourse(course.id, {
            name,
            instructor: modal.querySelector('#ce-instructor').value.trim(),
            room: modal.querySelector('#ce-room').value.trim(),
            creditHours: parseInt(modal.querySelector('#ce-credit').value) || 0,
            timeSlots: localSlots,
            weekdays: localSlots.map(s => s.weekday),
            startTime: localSlots[0]?.startTime || '08:00',
            endTime: localSlots[0]?.endTime || '09:30',
            color: activeColor ? activeColor.dataset.color : course.color
        });
        await deleteCalendarEventsForCourse(course.id);
        await generateCourseCalendarEvents({ id: course.id, name, timeSlots: localSlots, semesterId: course.semesterId });
        modal.remove();
    });
}

// ===== Edit Exam Modal =====
function openEditExamModal(examId) {
    const exam = appState.allExams.find(e => e.id === examId);
    if (!exam) return;
    const old = document.getElementById('exam-edit-modal');
    if (old) old.remove();

    const { toInputDate } = { toInputDate: (ts) => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }};

    const modal = document.createElement('div');
    modal.id = 'exam-edit-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Klausur bearbeiten</h2>
            <input type="text" id="ee-title" class="glass-input w-full mb-3" value="${escapeAttr(exam.title)}" placeholder="Titel">
            <input type="date" id="ee-date" class="glass-input w-full mb-3" value="${toInputDate(exam.date)}">
            <div class="flex gap-2 mb-3">
                <input type="time" id="ee-time" class="glass-input flex-1" value="${exam.time || ''}">
                <input type="text" id="ee-room" class="glass-input flex-1" value="${escapeAttr(exam.room || '')}" placeholder="Raum">
            </div>
            <div class="flex gap-2 mb-3">
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">LP</div>
                    <input type="number" id="ee-credit" class="glass-input w-full" value="${exam.creditPoints || 0}" step="1" min="0">
                </div>
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Gewicht</div>
                    <input type="number" id="ee-weight" class="glass-input w-full" value="${exam.weight || 1}" step="0.1" min="0">
                </div>
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Note</div>
                    <input type="number" id="ee-grade" class="glass-input w-full" value="${exam.grade != null ? exam.grade : ''}" step="0.1" min="1" max="5" placeholder="–">
                </div>
            </div>
            <button id="ee-save" class="btn-accent w-full">Speichern</button>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#ee-save').addEventListener('click', async () => {
        const title = modal.querySelector('#ee-title').value.trim();
        if (!title) return;
        const gradeVal = modal.querySelector('#ee-grade').value;
        await updateExam(examId, {
            title,
            date: modal.querySelector('#ee-date').value || null,
            time: modal.querySelector('#ee-time').value,
            room: modal.querySelector('#ee-room').value.trim(),
            creditPoints: parseInt(modal.querySelector('#ee-credit').value) || 0,
            weight: parseFloat(modal.querySelector('#ee-weight').value) || 1,
            grade: gradeVal ? parseFloat(gradeVal) : null
        });
        modal.remove();
    });
}

// ===== Add Exam Modal =====
function openAddExamModal(courseId, creditHours = 0) {
    const old = document.getElementById('exam-add-modal2');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'exam-add-modal2';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neue Klausur</h2>
            <input type="text" id="ea-title" class="glass-input w-full mb-3" placeholder="Titel">
            <input type="date" id="ea-date" class="glass-input w-full mb-3">
            <div class="flex gap-2 mb-3">
                <input type="time" id="ea-time" class="glass-input flex-1">
                <input type="text" id="ea-room" class="glass-input flex-1" placeholder="Raum">
            </div>
            <div class="flex gap-2 mb-4">
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">LP</div>
                    <input type="number" id="ea-credit" class="glass-input w-full" value="${creditHours}" step="1" min="0">
                </div>
                <div class="flex-1">
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Gewicht</div>
                    <input type="number" id="ea-weight" class="glass-input w-full" value="1" step="0.1" min="0">
                </div>
            </div>
            <button id="ea-save" class="btn-accent w-full">Hinzufügen</button>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#ea-save').addEventListener('click', async () => {
        const title = modal.querySelector('#ea-title').value.trim();
        if (!title) return;
        const examDate = modal.querySelector('#ea-date').value || null;
        const examTime = modal.querySelector('#ea-time').value;
        const ref = await addExam({
            courseId,
            title,
            date: examDate,
            time: examTime,
            room: modal.querySelector('#ea-room').value.trim(),
            creditPoints: parseInt(modal.querySelector('#ea-credit').value) || 0,
            weight: parseFloat(modal.querySelector('#ea-weight').value) || 1,
            grade: null
        });
        if (examDate) {
            const course = appState.allCourses.find(c => c.id === courseId);
            await addEvent({
                title: title || (course ? course.name + ' Prüfung' : 'Klausur'),
                date: examDate,
                time: examTime || null,
                endTime: null,
                category: 'Uni',
                recurrence: null,
                examId: ref.id
            });
        }
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#ea-title').focus(), 100);
}

// ===== Add Extra Event (Exercise/Tutorial) Modal =====
function openAddExtraModal(courseId) {
    const old = document.getElementById('extra-add-modal');
    if (old) old.remove();

    let localSlots = [{ weekday: 0, startTime: '08:00', endTime: '09:30' }];

    const modal = document.createElement('div');
    modal.id = 'extra-add-modal';
    modal.className = 'modal-overlay';

    function renderExtraSlots() {
        return localSlots.map((s, i) => `
            <div class="flex gap-2 mb-2 items-center">
                <select class="glass-select" style="width:70px" data-field="weekday" data-idx="${i}">
                    ${WEEKDAYS.map((d, wi) => `<option value="${wi}" ${s.weekday === wi ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <input type="time" class="glass-input flex-1" value="${s.startTime}" data-field="startTime" data-idx="${i}">
                <input type="time" class="glass-input flex-1" value="${s.endTime}" data-field="endTime" data-idx="${i}">
                <button class="icon-btn remove-extra-slot" data-idx="${i}">
                    <span class="material-symbols-outlined" style="font-size:16px;color:var(--priority-1)">remove</span>
                </button>
            </div>`).join('');
    }

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Übung / Zusatz hinzufügen</h2>
            <input type="text" id="ex-name" class="glass-input w-full mb-3" placeholder="Name (z.B. Übung Mathe)">
            <select id="ex-type" class="glass-select w-full mb-3">
                <option value="Übung">Übung</option>
                <option value="Tutorium">Tutorium</option>
                <option value="Sonstiges">Sonstiges</option>
            </select>
            <input type="text" id="ex-room" class="glass-input w-full mb-3" placeholder="Raum (optional)">
            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Zeitslots</div>
            <div id="ex-slots">${renderExtraSlots()}</div>
            <button id="ex-add-slot" class="btn-ghost w-full mb-4" style="font-size:13px">+ Zeitslot</button>
            <button id="ex-save" class="btn-accent w-full">Hinzufügen</button>
        </div>`;
    document.body.appendChild(modal);

    function rewireExtraSlots() {
        modal.querySelector('#ex-slots').innerHTML = renderExtraSlots();
        modal.querySelectorAll('[data-field]').forEach(inp => {
            inp.addEventListener('change', () => {
                const idx = parseInt(inp.dataset.idx);
                const field = inp.dataset.field;
                if (field === 'weekday') {
                    localSlots[idx].weekday = parseInt(inp.value);
                } else {
                    localSlots[idx][field] = inp.value;
                }
            });
        });
        modal.querySelectorAll('.remove-extra-slot').forEach(btn => {
            btn.addEventListener('click', () => {
                localSlots.splice(parseInt(btn.dataset.idx), 1);
                rewireExtraSlots();
            });
        });
    }
    rewireExtraSlots();

    modal.querySelector('#ex-add-slot').addEventListener('click', () => {
        localSlots.push({ weekday: 0, startTime: '08:00', endTime: '09:30' });
        rewireExtraSlots();
    });

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#ex-save').addEventListener('click', async () => {
        const name = modal.querySelector('#ex-name').value.trim();
        if (!name) return;
        const course = appState.allCourses.find(c => c.id === courseId);
        if (!course) return;

        // Prevent duplicate names (extraEventName is used as an identifier for GCal events)
        const existingExtras = course.additionalEvents || [];
        if (existingExtras.some(ev => ev.name === name)) {
            alert('Eine Übung mit diesem Namen existiert bereits.');
            return;
        }

        const saveBtn = modal.querySelector('#ex-save');
        saveBtn.disabled = true;

        const newExtra = {
            name,
            type: modal.querySelector('#ex-type').value,
            room: modal.querySelector('#ex-room').value.trim(),
            timeSlots: localSlots
        };
        const additionalEvents = [...existingExtras, newExtra];
        await updateCourse(courseId, { additionalEvents });
        // Generate calendar events for the new Übung
        const updatedCourse = { ...course, additionalEvents };
        await generateCourseCalendarEvents(updatedCourse);
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#ex-name').focus(), 100);
}

// ===== Edit Extra Event (Exercise/Tutorial) Modal =====
function openEditExtraModal(courseId, idx) {
    const course = appState.allCourses.find(c => c.id === courseId);
    if (!course) return;
    const existing = (course.additionalEvents || [])[idx];
    if (!existing) return;

    const old = document.getElementById('extra-edit-modal');
    if (old) old.remove();

    let localSlots = JSON.parse(JSON.stringify(existing.timeSlots || [{ weekday: 0, startTime: '08:00', endTime: '09:30' }]));

    const modal = document.createElement('div');
    modal.id = 'extra-edit-modal';
    modal.className = 'modal-overlay';

    function renderEditSlots() {
        return localSlots.map((s, i) => `
            <div class="flex gap-2 mb-2 items-center">
                <select class="glass-select" style="width:70px" data-field="weekday" data-idx="${i}">
                    ${WEEKDAYS.map((d, wi) => `<option value="${wi}" ${s.weekday === wi ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <input type="time" class="glass-input flex-1" value="${s.startTime}" data-field="startTime" data-idx="${i}">
                <input type="time" class="glass-input flex-1" value="${s.endTime}" data-field="endTime" data-idx="${i}">
                <button class="icon-btn remove-edit-slot" data-idx="${i}">
                    <span class="material-symbols-outlined" style="font-size:16px;color:var(--priority-1)">remove</span>
                </button>
            </div>`).join('');
    }

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Übung / Zusatz bearbeiten</h2>
            <input type="text" id="exe-name" class="glass-input w-full mb-3" value="${escapeAttr(existing.name)}" placeholder="Name">
            <select id="exe-type" class="glass-select w-full mb-3">
                <option value="Übung" ${existing.type === 'Übung' ? 'selected' : ''}>Übung</option>
                <option value="Tutorium" ${existing.type === 'Tutorium' ? 'selected' : ''}>Tutorium</option>
                <option value="Sonstiges" ${existing.type === 'Sonstiges' ? 'selected' : ''}>Sonstiges</option>
            </select>
            <input type="text" id="exe-room" class="glass-input w-full mb-3" value="${escapeAttr(existing.room || '')}" placeholder="Raum (optional)">
            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px">Zeitslots</div>
            <div id="exe-slots">${renderEditSlots()}</div>
            <button id="exe-add-slot" class="btn-ghost w-full mb-4" style="font-size:13px">+ Zeitslot</button>
            <button id="exe-save" class="btn-accent w-full">Speichern</button>
        </div>`;
    document.body.appendChild(modal);

    function rewireEditSlots() {
        modal.querySelector('#exe-slots').innerHTML = renderEditSlots();
        modal.querySelectorAll('[data-field]').forEach(inp => {
            inp.addEventListener('change', () => {
                const i = parseInt(inp.dataset.idx);
                const field = inp.dataset.field;
                if (field === 'weekday') localSlots[i].weekday = parseInt(inp.value);
                else localSlots[i][field] = inp.value;
            });
        });
        modal.querySelectorAll('.remove-edit-slot').forEach(btn => {
            btn.addEventListener('click', () => {
                localSlots.splice(parseInt(btn.dataset.idx), 1);
                rewireEditSlots();
            });
        });
    }
    rewireEditSlots();

    modal.querySelector('#exe-add-slot').addEventListener('click', () => {
        localSlots.push({ weekday: 0, startTime: '08:00', endTime: '09:30' });
        rewireEditSlots();
    });

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#exe-save').addEventListener('click', async () => {
        const name = modal.querySelector('#exe-name').value.trim();
        if (!name) return;
        modal.querySelector('#exe-save').disabled = true;

        const updatedExtra = {
            name,
            type: modal.querySelector('#exe-type').value,
            room: modal.querySelector('#exe-room').value.trim(),
            timeSlots: localSlots
        };

        const extras = [...(course.additionalEvents || [])];
        const oldName = existing.name;
        // Always delete old calendar events and regenerate (handles name change + schedule change)
        await deleteCalendarEventsForExtra(courseId, oldName);
        if (name !== oldName) {
            await deleteCalendarEventsForExtra(courseId, name); // clean up any pre-existing with new name
        }
        extras[idx] = updatedExtra;
        await updateCourse(courseId, { additionalEvents: extras });
        const updatedCourse = { ...course, additionalEvents: extras };
        await generateCourseCalendarEvents(updatedCourse);
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#exe-name').focus(), 100);
}
