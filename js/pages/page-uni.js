import { appState, onStateChange } from '../app.js';
import { onRouteChange, navigate } from '../router.js';
import { toDate, formatDate, startOfDay, urgencyClass, isTodayLectureDay, escapeHtml } from '../utils.js';

const TOTAL_LP = 180;

let initialized = false;

export function initPageUni() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-uni');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="uni-settings-btn">
                <span class="material-symbols-outlined">settings</span>
            </button>
            <div class="page-header-actions">
                <button class="avatar-btn" id="uni-avatar-btn">
                    <img src="" alt="" id="uni-avatar-img">
                </button>
            </div>
        </div>
        <div class="px-5 pb-3">
            <h1 class="text-2xl font-bold">Uni-Planer</h1>
            <p class="text-sm mt-1" style="color:var(--text-tertiary)" id="uni-semester-label"></p>
        </div>
        <div class="px-5 flex-1" id="uni-content"></div>
    `;

    container.querySelector('#uni-settings-btn').addEventListener('click', () => navigate('uni-settings'));
    container.querySelector('#uni-avatar-btn').addEventListener('click', () => navigate('uni-settings'));

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'uni') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'uni'; }

function calcEarnedLP() {
    // A Klausur is bestanden when grade != null && grade <= 4.0
    let earned = 0;
    appState.allExams.forEach(e => {
        if (e.grade != null && e.grade <= 4.0) {
            earned += (e.creditPoints || 0);
        }
    });
    return Math.min(earned, TOTAL_LP);
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

    // Semester label
    const activeSemester = (appState.allSemesters || []).find(s => s.isActive);
    const semLabel = document.querySelector('#uni-semester-label');
    if (semLabel) semLabel.textContent = activeSemester ? activeSemester.name : '';

    // LP calculation
    const earnedLP = calcEarnedLP();
    const lpProgress = earnedLP / TOTAL_LP;
    const lpRadius = 44;
    const lpCircumference = 2 * Math.PI * lpRadius;
    const lpOffset = lpCircumference * (1 - lpProgress);

    // Today's courses (filtered by semester lecture day)
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const isLectureDay = isTodayLectureDay(activeSemester);
    const todayCourses = isLectureDay
        ? courses.filter(c => (c.weekdays || []).includes(dayOfWeek))
              .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
        : [];

    // Upcoming exams (next 3)
    const now = new Date();
    const upcomingExams = exams
        .filter(e => { const d = toDate(e.date); return d && d >= now && !e.completed; })
        .sort((a, b) => {
            const da = toDate(a.date) || new Date(9999, 0);
            const db = toDate(b.date) || new Date(9999, 0);
            return da - db;
        })
        .slice(0, 3);

    // Upcoming assignments (next 5)
    const upcomingAssignments = assignments
        .filter(a => { const d = toDate(a.dueDate); return d && d >= now && !a.completed; })
        .sort((a, b) => {
            const da = toDate(a.dueDate) || new Date(9999, 0);
            const db = toDate(b.dueDate) || new Date(9999, 0);
            return da - db;
        })
        .slice(0, 5);

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

    // Quick stats
    const totalAssignments = assignments.length;
    const completedAssignments = assignments.filter(a => a.completed).length;
    const completionRate = totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0;

    const gradedExams = exams.filter(e => e.grade != null);
    const avgGrade = gradedExams.length > 0
        ? (gradedExams.reduce((s, e) => s + e.grade, 0) / gradedExams.length).toFixed(1)
        : '–';

    let html = '';

    // LP Progress Card
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
        </div>
    </div>`;

    // Exam countdown (between LP ring and today's courses)
    html += countdownHtml;

    // Today's courses
    html += `<div class="glass-sm p-4 mb-4">
        <div class="flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined" style="color:var(--accent)">schedule</span>
            <span style="font-size:14px;font-weight:600">Heutige Kurse</span>
        </div>`;
    if (todayCourses.length === 0) {
        const offReason = !isLectureDay ? 'Vorlesungsfrei / Ferien' : 'Keine Kurse heute';
        html += `<div style="font-size:13px;color:var(--text-tertiary)">${offReason}</div>`;
    } else {
        todayCourses.forEach(c => {
            html += `<div class="flex items-center gap-3 py-2" style="border-bottom:1px solid var(--surface-border)">
                <div style="width:4px;height:32px;border-radius:2px;background:${c.color || '#3742fa'}"></div>
                <div class="flex-1">
                    <div style="font-size:14px;font-weight:500">${escapeHtml(c.name)}</div>
                    <div style="font-size:12px;color:var(--text-tertiary)">${c.startTime}–${c.endTime} · ${escapeHtml(c.room || '')}</div>
                </div>
                ${c.creditHours ? `<span style="font-size:11px;color:var(--text-tertiary)">${c.creditHours} LP</span>` : ''}
            </div>`;
        });
    }
    html += '</div>';

    // Quick stats
    html += `<div class="grid grid-cols-2 gap-3 mb-4">
        <div class="glass-sm p-4 text-center">
            <div style="font-size:24px;font-weight:700">${completionRate}%</div>
            <div style="font-size:12px;color:var(--text-tertiary)">Abgabequote</div>
        </div>
        <div class="glass-sm p-4 text-center">
            <div style="font-size:24px;font-weight:700">${avgGrade}</div>
            <div style="font-size:12px;color:var(--text-tertiary)">Notenschnitt</div>
        </div>
    </div>`;

    // Upcoming exams
    if (upcomingExams.length > 0) {
        html += `<div class="glass-sm p-4 mb-4">
            <div class="flex items-center gap-2 mb-3">
                <span class="material-symbols-outlined" style="color:#ef4444">quiz</span>
                <span style="font-size:14px;font-weight:600">Nächste Klausuren</span>
            </div>`;
        upcomingExams.forEach(e => {
            const course = courses.find(c => c.id === e.courseId);
            const uc = urgencyClass(e.date);
            html += `<div class="flex items-center justify-between py-2 ${uc}" style="border-bottom:1px solid var(--surface-border);border-radius:6px;padding-left:6px">
                <div>
                    <div style="font-size:14px;font-weight:500">${escapeHtml(e.title)}</div>
                    <div style="font-size:12px;color:var(--text-tertiary)">${escapeHtml(course?.name || '')}${e.creditPoints ? ' · ' + e.creditPoints + ' LP' : ''}</div>
                </div>
                <div style="font-size:12px;color:var(--text-secondary)">${formatDate(e.date)}</div>
            </div>`;
        });
        html += '</div>';
    }

    // Upcoming assignments
    if (upcomingAssignments.length > 0) {
        html += `<div class="glass-sm p-4 mb-4">
            <div class="flex items-center gap-2 mb-3">
                <span class="material-symbols-outlined" style="color:#f97316">assignment</span>
                <span style="font-size:14px;font-weight:600">Nächste Aufgaben</span>
            </div>`;
        upcomingAssignments.forEach(a => {
            const course = courses.find(c => c.id === a.courseId);
            const uc = urgencyClass(a.dueDate);
            html += `<div class="flex items-center justify-between py-2 ${uc}" style="border-bottom:1px solid var(--surface-border);border-radius:6px;padding-left:6px">
                <div>
                    <div style="font-size:14px;font-weight:500">${escapeHtml(a.title)}</div>
                    <div style="font-size:12px;color:var(--text-tertiary)">${escapeHtml(course?.name || '')}</div>
                </div>
                <div style="font-size:12px;color:var(--text-secondary)">${formatDate(a.dueDate)}</div>
            </div>`;
        });
        html += '</div>';
    }

    if (courses.length === 0 && exams.length === 0 && assignments.length === 0) {
        html = `
        <div class="glass p-5 mb-4 flex items-center gap-5">
            <svg width="108" height="108" class="progress-ring" style="flex-shrink:0">
                <circle class="progress-ring-bg" cx="54" cy="54" r="${lpRadius}" stroke-width="9"/>
                <circle class="progress-ring-fill" cx="54" cy="54" r="${lpRadius}" stroke-width="9"
                    stroke-dasharray="${lpCircumference.toFixed(2)}" stroke-dashoffset="${lpCircumference.toFixed(2)}"/>
            </svg>
            <div>
                <div style="font-size:12px;color:var(--text-tertiary);font-weight:500;margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px">Leistungspunkte</div>
                <div style="font-size:36px;font-weight:700;letter-spacing:-1px">0<span style="font-size:20px;font-weight:400;color:var(--text-tertiary)">/${TOTAL_LP}</span></div>
                <div style="font-size:13px;color:var(--text-secondary)">0% des Studiums</div>
            </div>
        </div>
        <div class="empty-state">
            <span class="material-symbols-outlined">school</span>
            <div class="empty-state-text">Lege Kurse an, um zu starten</div>
        </div>`;
    }

    content.innerHTML = html;
}
