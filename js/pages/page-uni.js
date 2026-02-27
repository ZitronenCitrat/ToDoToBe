import { appState, onStateChange } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import {
    toDate, formatDate, startOfDay, urgencyClass,
    isTodayLectureDay, getActiveSemester, escapeHtml, escapeAttr
} from '../utils.js';
import {
    updateCourse, deleteCourse, updateExam, deleteExam,
    addExam, updateAssignment, deleteAssignment, addAssignment
} from '../db.js';

const TOTAL_LP = 180;

let initialized = false;

export function initPageUni() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-uni');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="uni-settings-btn" style="display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:20px;font-size:12px;font-weight:600;color:var(--text-secondary)">
                <span class="material-symbols-outlined" style="font-size:18px">edit_calendar</span>
                <span>Semester</span>
            </button>
            <div class="page-header-actions">
                <button class="avatar-btn" id="uni-avatar-btn">
                    <img src="" alt="" id="uni-avatar-img">
                </button>
            </div>
        </div>
        <div class="px-5 pb-1">
            <h1 class="text-2xl font-bold">Uni-Planer</h1>
            <p class="text-sm mt-1" style="color:var(--text-tertiary)" id="uni-semester-label"></p>
        </div>
        <div class="page-context-btns">
            <button class="context-btn" id="uni-timetable-btn">
                <span class="material-symbols-outlined">schedule</span>Stundenplan
            </button>
            <button class="context-btn" id="uni-assignments-btn">
                <span class="material-symbols-outlined">assignment</span>Aufgaben
            </button>
            <button class="context-btn" id="uni-grades-btn">
                <span class="material-symbols-outlined">grade</span>Noten
            </button>
            <button class="context-btn" id="uni-flashcards-btn">
                <span class="material-symbols-outlined">style</span>Karten
            </button>
        </div>
        <div class="px-5 flex-1 overflow-y-auto" id="uni-content"></div>
    `;

    container.querySelector('#uni-settings-btn').addEventListener('click', () => navigate('uni-settings'));
    container.querySelector('#uni-avatar-btn').addEventListener('click', () => navigate('uni-settings'));
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

/** A course is "completed" if it has at least one passed exam (grade ≤ 4.0) */
function isCourseCompleted(course) {
    return appState.allExams.some(e => e.courseId === course.id && e.grade != null && e.grade <= 4.0);
}

function render() {
    const content = document.querySelector('#uni-content');
    if (!content) return;

    if (appState.user) {
        const img = document.querySelector('#uni-avatar-img');
        if (img) { img.src = appState.user.photoURL || ''; img.alt = appState.user.displayName || ''; }
    }

    const courses = appState.allCourses;
    const exams = appState.allExams;
    const assignments = appState.allAssignments;

    // Active semester (auto-detect or manual)
    const activeSemester = getActiveSemester(appState.allSemesters || []);
    const semLabel = document.querySelector('#uni-semester-label');
    if (semLabel) semLabel.textContent = activeSemester ? activeSemester.name : '';

    // LP calculation
    const earnedLP = calcEarnedLP();
    const lpProgress = earnedLP / TOTAL_LP;
    const lpRadius = 44;
    const lpCircumference = 2 * Math.PI * lpRadius;
    const lpOffset = lpCircumference * (1 - lpProgress);

    // Overall LP-weighted GPA
    const overallGPA = calcOverallGPA();

    // Today's courses (filtered by semester lecture day)
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const isLectureDay = isTodayLectureDay(activeSemester);
    const todayCourses = isLectureDay
        ? courses.filter(c => {
            // Support both timeSlots and legacy weekdays
            const slots = c.timeSlots || [];
            if (slots.length > 0) return slots.some(s => s.weekday === dayOfWeek);
            return (c.weekdays || []).includes(dayOfWeek);
          })
          .sort((a, b) => {
            const aTime = (a.timeSlots || [])[0]?.startTime || a.startTime || '';
            const bTime = (b.timeSlots || [])[0]?.startTime || b.startTime || '';
            return aTime.localeCompare(bTime);
          })
        : [];

    // Upcoming exams (next 3)
    const now = new Date();
    const upcomingExams = exams
        .filter(e => { const d = toDate(e.date); return d && d >= now && !e.completed; })
        .sort((a, b) => (toDate(a.date) || new Date(9999,0)) - (toDate(b.date) || new Date(9999,0)))
        .slice(0, 3);

    // Exam countdown
    const nextExam = upcomingExams[0] || null;
    let countdownHtml = '';
    if (nextExam) {
        const todayStart = startOfDay(new Date());
        const examDate = startOfDay(toDate(nextExam.date));
        const diffDays = Math.round((examDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        const examCourse = courses.find(c => c.id === nextExam.courseId);
        const examLabel = escapeHtml(nextExam.title || examCourse?.name || 'Klausur');
        let countdownText, countdownIcon, urgencyStyle;
        if (diffDays === 0) {
            countdownText = `Heute: ${examLabel}!`;
            countdownIcon = 'crisis_alert';
            urgencyStyle = 'color:#ef4444';
        } else if (diffDays === 1) {
            countdownText = `Morgen: ${examLabel}!`;
            countdownIcon = 'warning';
            urgencyStyle = 'color:#f97316';
        } else {
            countdownText = `Noch ${diffDays} Tage bis ${examLabel}`;
            countdownIcon = diffDays <= 7 ? 'timer' : 'event';
            urgencyStyle = diffDays <= 7 ? 'color:#f97316' : 'color:var(--accent)';
        }
        countdownHtml = `<div class="glass-sm p-4 mb-4 flex items-center gap-3">
            <span class="material-symbols-outlined" style="font-size:28px;flex-shrink:0;${urgencyStyle}">${countdownIcon}</span>
            <div>
                <div style="font-size:14px;font-weight:600;${urgencyStyle}">${countdownText}</div>
                ${examCourse ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${escapeHtml(examCourse.name)}${nextExam.creditPoints ? ' · ' + nextExam.creditPoints + ' LP' : ''}</div>` : ''}
            </div>
        </div>`;
    }

    let html = '';

    // === LP Progress + Stats Card ===
    html += `<div class="glass p-5 mb-4 flex items-center gap-5">
        <svg width="108" height="108" class="progress-ring" style="flex-shrink:0">
            <circle class="progress-ring-bg" cx="54" cy="54" r="${lpRadius}" stroke-width="9"/>
            <circle class="progress-ring-fill" cx="54" cy="54" r="${lpRadius}" stroke-width="9"
                stroke-dasharray="${lpCircumference.toFixed(2)}" stroke-dashoffset="${lpOffset.toFixed(2)}"/>
        </svg>
        <div>
            <div style="font-size:12px;color:var(--text-tertiary);font-weight:500;margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px">Leistungspunkte</div>
            <div style="font-size:36px;font-weight:700;letter-spacing:-1px">${earnedLP}<span style="font-size:20px;font-weight:400;color:var(--text-tertiary)">/${TOTAL_LP}</span></div>
            <div style="font-size:13px;color:var(--text-secondary)">${Math.round(lpProgress * 100)}% des Studiums</div>
            ${overallGPA != null ? `<div style="font-size:13px;color:var(--accent);margin-top:4px;font-weight:600">Ø ${overallGPA.toFixed(2)} (LP-gewichtet)</div>` : ''}
        </div>
    </div>`;

    html += countdownHtml;

    // === Today's Courses ===
    html += `<div class="glass-sm p-4 mb-4">
        <div class="flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined" style="color:var(--accent)">schedule</span>
            <span style="font-size:14px;font-weight:600">Heutige Vorlesungen</span>
        </div>`;
    if (todayCourses.length === 0) {
        html += `<div style="font-size:13px;color:var(--text-tertiary)">${!isLectureDay ? 'Vorlesungsfrei / Ferien' : 'Keine Vorlesungen heute'}</div>`;
    } else {
        todayCourses.forEach(c => {
            // Get today's time slot
            const slots = c.timeSlots || [];
            const todaySlots = slots.filter(s => s.weekday === dayOfWeek);
            const timeStr = todaySlots.length > 0
                ? todaySlots.map(s => `${s.startTime}–${s.endTime}`).join(', ')
                : `${c.startTime}–${c.endTime}`;

            html += `<div class="flex items-center gap-3 py-2" style="border-bottom:1px solid var(--surface-border)">
                <div style="width:4px;height:32px;border-radius:2px;background:${c.color || '#3742fa'}"></div>
                <div class="flex-1">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(c.name)}</div>
                    <div style="font-size:12px;color:var(--text-tertiary)">${timeStr} · ${escapeHtml(c.room || '')}</div>
                </div>
                ${c.creditHours ? `<span style="font-size:11px;color:var(--text-tertiary)">${c.creditHours} LP</span>` : ''}
            </div>`;
        });
    }
    html += '</div>';

    // === Active / Completed Course List ===
    if (courses.length === 0) {
        html += `<div class="empty-state">
            <span class="material-symbols-outlined">school</span>
            <div class="empty-state-text">Lege Kurse an, um zu starten</div>
        </div>`;
        content.innerHTML = html;
        return;
    }

    const activeCourses = courses.filter(c => !isCourseCompleted(c));
    const completedCourses = courses.filter(c => isCourseCompleted(c));

    if (activeCourses.length > 0) {
        html += `<div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">
            🔵 Aktive Kurse (${activeCourses.length})
        </div>`;
        activeCourses.forEach(c => { html += renderCourseCard(c); });
    }

    if (completedCourses.length > 0) {
        html += `<div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 10px">
            🟢 Abgeschlossene Kurse (${completedCourses.length})
        </div>`;
        completedCourses.forEach(c => { html += renderCourseCard(c, true); });
    }

    content.innerHTML = html;
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
                        <button class="icon-btn delete-extra-btn" data-course-id="${escapeAttr(course.id)}" data-idx="${idx}" style="width:28px;height:28px">
                            <span class="material-symbols-outlined" style="font-size:14px;color:var(--priority-1)">delete</span>
                        </button>
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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const course = appState.allCourses.find(c => c.id === btn.dataset.id);
            if (course && confirm(`Kurs "${course.name}" und alle zugehörigen Daten löschen?`)) {
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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Klausur löschen?')) deleteExam(btn.dataset.id);
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
            events.splice(parseInt(btn.dataset.idx), 1);
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
        await addExam({
            courseId,
            title,
            date: modal.querySelector('#ea-date').value || null,
            time: modal.querySelector('#ea-time').value,
            room: modal.querySelector('#ea-room').value.trim(),
            creditPoints: parseInt(modal.querySelector('#ea-credit').value) || 0,
            weight: parseFloat(modal.querySelector('#ea-weight').value) || 1,
            grade: null
        });
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
        const additionalEvents = [...(course.additionalEvents || []), {
            name,
            type: modal.querySelector('#ex-type').value,
            room: modal.querySelector('#ex-room').value.trim(),
            timeSlots: localSlots
        }];
        await updateCourse(courseId, { additionalEvents });
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#ex-name').focus(), 100);
}
