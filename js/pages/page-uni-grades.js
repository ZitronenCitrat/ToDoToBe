import { appState, onStateChange, registerFabAction } from '../app.js';
import { onRouteChange } from '../router.js';
import { calculateCourseAverage, escapeHtml, escapeAttr } from '../utils.js';
import { addExam, updateExam, deleteExam, updateAssignment, deleteAssignment } from '../db.js';

let initialized = false;

export function initPageUniGrades() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-uni-grades');

    container.innerHTML = `
        <div class="page-header">
            <span class="page-header-title">Noten</span>
            <div class="page-header-actions">
                <button class="icon-btn" id="grades-add-btn">
                    <span class="material-symbols-outlined">add</span>
                </button>
            </div>
        </div>
        <div class="px-5 flex-1" id="grades-content"></div>
    `;

    container.querySelector('#grades-add-btn').addEventListener('click', () => openAddExamModal());

    registerFabAction('grades', openAddExamModal);

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'grades') render(); });
}

function isActive() { return window.location.hash.slice(1).split('/')[0] === 'grades'; }

function gradeColor(grade) {
    if (grade == null) return 'var(--text-tertiary)';
    return grade <= 4.0 ? 'var(--accent)' : '#ef4444';
}

function gradeLabel(grade) {
    if (grade == null) return '–';
    return grade <= 4.0 ? '✓ Bestanden' : '✗ Nicht bestanden';
}

function render() {
    const content = document.querySelector('#grades-content');
    if (!content) return;

    const courses = appState.allCourses;
    const exams = appState.allExams;
    const assignments = appState.allAssignments;

    // Overall average
    const allGraded = [
        ...exams.filter(e => e.grade != null),
        ...assignments.filter(a => a.grade != null)
    ];
    const overallAvg = allGraded.length > 0
        ? (allGraded.reduce((s, g) => s + (g.grade * (g.weight || 1)), 0) / allGraded.reduce((s, g) => s + (g.weight || 1), 0)).toFixed(2)
        : null;

    // Total LP earned
    const earnedLP = exams.filter(e => e.grade != null && e.grade <= 4.0)
        .reduce((s, e) => s + (e.creditPoints || 0), 0);

    let html = '';

    // Overall stats card
    html += `<div class="glass p-5 mb-4">
        <div class="grid grid-cols-2 gap-4 text-center">
            <div>
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:4px">Gesamtdurchschnitt</div>
                <div style="font-size:36px;font-weight:700;color:var(--accent)">${overallAvg || '–'}</div>
                <div style="font-size:12px;color:var(--text-tertiary)">${allGraded.length} bewertet</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:4px">Erworben</div>
                <div style="font-size:36px;font-weight:700;color:var(--accent)">${earnedLP}</div>
                <div style="font-size:12px;color:var(--text-tertiary)">Leistungspunkte</div>
            </div>
        </div>
    </div>`;

    if (courses.length === 0) {
        html += `<div class="empty-state">
            <span class="material-symbols-outlined">grade</span>
            <div class="empty-state-text">Lege zuerst Kurse an</div>
        </div>`;
        content.innerHTML = html;
        return;
    }

    // Per-course breakdown
    courses.forEach(course => {
        const courseExams = exams.filter(e => e.courseId === course.id);
        const courseAssignments = assignments.filter(a => a.courseId === course.id);
        const avg = calculateCourseAverage(courseExams, courseAssignments);

        // LP for this course
        const courseLPEarned = courseExams
            .filter(e => e.grade != null && e.grade <= 4.0)
            .reduce((s, e) => s + (e.creditPoints || 0), 0);

        html += `<div class="glass-sm mb-3 course-grade-card" data-course="${course.id}">
            <div class="p-4 flex items-center justify-between" style="cursor:pointer" data-expand="${course.id}">
                <div class="flex items-center gap-3">
                    <div style="width:4px;height:36px;border-radius:2px;background:${course.color || '#3742fa'}"></div>
                    <div>
                        <div style="font-size:15px;font-weight:600">${escapeHtml(course.name)}</div>
                        <div style="font-size:12px;color:var(--text-tertiary)">${courseExams.length + courseAssignments.length} Einträge${course.creditHours ? ' · ' + course.creditHours + ' LP' : ''}</div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <div style="font-size:20px;font-weight:700;color:${avg != null ? gradeColor(avg) : 'var(--text-tertiary)'}">${avg != null ? avg.toFixed(2) : '–'}</div>
                    ${courseLPEarned > 0 ? `<div style="font-size:11px;color:var(--accent);font-weight:600">+${courseLPEarned} LP</div>` : ''}
                </div>
            </div>
            <div class="course-grades-detail hidden" id="grades-detail-${course.id}">`;

        const items = [
            ...courseExams.map(e => ({ ...e, type: 'exam' })),
            ...courseAssignments.map(a => ({ ...a, type: 'assignment' }))
        ];

        if (items.length === 0) {
            html += `<div class="px-4 pb-3" style="font-size:13px;color:var(--text-tertiary)">Keine Einträge</div>`;
        } else {
            items.forEach(item => {
                const typeLabel = item.type === 'exam' ? 'Klausur' : 'Aufgabe';
                const lpInfo = item.type === 'exam' && item.creditPoints ? ` · ${item.creditPoints} LP` : '';
                html += `<div class="flex items-center justify-between px-4 py-3" style="border-top:1px solid var(--surface-border)">
                    <div class="flex-1 min-w-0">
                        <div style="font-size:13px;font-weight:500">${escapeHtml(item.title)}</div>
                        <div style="font-size:11px;color:var(--text-tertiary)">${typeLabel} · Gewicht: ${item.weight || 1}${lpInfo}</div>
                        ${item.grade != null ? `<div style="font-size:11px;color:${gradeColor(item.grade)}">${gradeLabel(item.grade)}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        <span style="font-size:16px;font-weight:700;color:${gradeColor(item.grade)}">${item.grade != null ? item.grade.toFixed(1) : '–'}</span>
                        <button class="icon-btn" data-grade-id="${item.id}" data-grade-type="${item.type}" style="width:30px;height:30px">
                            <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent)">edit</span>
                        </button>
                        <button class="icon-btn" data-delete-id="${item.id}" data-delete-type="${item.type}" style="width:30px;height:30px">
                            <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary)">delete</span>
                        </button>
                    </div>
                </div>`;
            });
        }

        // Add exam button inside course card
        html += `<div class="px-4 pb-3" style="border-top:1px solid var(--surface-border)">
            <button class="icon-btn add-exam-for-course" data-course-id="${course.id}" data-course-name="${escapeAttr(course.name)}" data-credit-hours="${course.creditHours || 0}" style="width:100%;border-radius:8px;gap:6px;color:var(--accent)">
                <span class="material-symbols-outlined" style="font-size:16px">add</span>
                <span style="font-size:12px;font-weight:500">Klausur hinzufügen</span>
            </button>
        </div>`;

        html += `</div></div>`;
    });

    content.innerHTML = html;

    // Wire expand toggles
    content.querySelectorAll('[data-expand]').forEach(el => {
        el.addEventListener('click', () => {
            const detail = content.querySelector(`#grades-detail-${el.dataset.expand}`);
            if (detail) detail.classList.toggle('hidden');
        });
    });

    // Wire grade edit buttons — proper modal instead of prompt()
    content.querySelectorAll('[data-grade-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openGradeModal(el.dataset.gradeId, el.dataset.gradeType);
        });
    });

    // Wire delete buttons
    content.querySelectorAll('[data-delete-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Eintrag löschen?')) return;
            if (el.dataset.deleteType === 'exam') {
                deleteExam(el.dataset.deleteId);
            } else {
                deleteAssignment(el.dataset.deleteId);
            }
        });
    });

    // Wire "add exam for course" buttons
    content.querySelectorAll('.add-exam-for-course').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddExamModal(el.dataset.courseId, parseInt(el.dataset.creditHours) || 0);
        });
    });
}

function openGradeModal(itemId, itemType) {
    const existing = document.getElementById('grade-edit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'grade-edit-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Note eintragen</h2>
            <input type="number" id="grade-input" class="glass-input w-full mb-4"
                placeholder="Note (z.B. 1.7)" step="0.1" min="1.0" max="5.0">
            <div class="flex gap-2">
                <button id="grade-save" class="btn-accent flex-1">Speichern</button>
                <button id="grade-remove" class="btn-ghost flex-1">Note entfernen</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('#grade-input');
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#grade-save').addEventListener('click', () => {
        const val = input.value.replace(',', '.');
        const num = parseFloat(val);
        if (isNaN(num) || num < 1 || num > 5) return;
        if (itemType === 'exam') {
            updateExam(itemId, { grade: num });
        } else {
            updateAssignment(itemId, { grade: num });
        }
        modal.remove();
    });

    modal.querySelector('#grade-remove').addEventListener('click', () => {
        if (itemType === 'exam') {
            updateExam(itemId, { grade: null });
        } else {
            updateAssignment(itemId, { grade: null });
        }
        modal.remove();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') modal.querySelector('#grade-save').click();
        if (e.key === 'Escape') modal.remove();
    });

    setTimeout(() => input.focus(), 100);
}

function openAddExamModal(preselectedCourseId = '', prefilledCreditPoints = 0) {
    const existing = document.getElementById('exam-add-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'exam-add-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">Neue Klausur</h2>
            <input type="text" id="exam-title" class="glass-input w-full mb-3" placeholder="Titel">
            <select id="exam-course" class="glass-select w-full mb-3">
                <option value="">Kurs wählen…</option>
                ${appState.allCourses.map(c => `<option value="${c.id}" data-credit="${c.creditHours || 0}" ${c.id === preselectedCourseId ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
            <input type="date" id="exam-date" class="glass-input w-full mb-3">
            <div class="flex gap-2 mb-3">
                <input type="time" id="exam-time" class="glass-input flex-1" placeholder="Uhrzeit">
                <input type="text" id="exam-room" class="glass-input flex-1" placeholder="Raum">
            </div>
            <div class="flex gap-2 mb-4">
                <div class="flex-1">
                    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px">Leistungspunkte</div>
                    <input type="number" id="exam-credit-points" class="glass-input w-full" placeholder="LP" value="${prefilledCreditPoints}" step="1" min="0">
                </div>
                <div class="flex-1">
                    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px">Gewicht</div>
                    <input type="number" id="exam-weight" class="glass-input w-full" placeholder="1" value="1" step="0.1" min="0">
                </div>
                <div class="flex-1">
                    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px">Note (opt.)</div>
                    <input type="number" id="exam-grade" class="glass-input w-full" placeholder="–" step="0.1" min="1" max="5">
                </div>
            </div>
            <button id="exam-save" class="btn-accent w-full">Hinzufügen</button>
        </div>
    `;
    document.body.appendChild(modal);

    const courseSelect = modal.querySelector('#exam-course');
    const creditInput = modal.querySelector('#exam-credit-points');

    // Auto-fill LP when course changes
    courseSelect.addEventListener('change', () => {
        const selected = courseSelect.options[courseSelect.selectedIndex];
        const credit = parseInt(selected.dataset.credit) || 0;
        if (credit > 0) creditInput.value = credit;
    });

    // Trigger on initial selection if preselected
    if (preselectedCourseId) {
        const selected = courseSelect.options[courseSelect.selectedIndex];
        const credit = parseInt(selected?.dataset.credit) || 0;
        if (credit > 0 && prefilledCreditPoints === 0) creditInput.value = credit;
    }

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#exam-save').addEventListener('click', async () => {
        const title = modal.querySelector('#exam-title').value.trim();
        if (!title) return;
        const gradeVal = modal.querySelector('#exam-grade').value;
        await addExam({
            title,
            courseId: modal.querySelector('#exam-course').value,
            date: modal.querySelector('#exam-date').value || null,
            time: modal.querySelector('#exam-time').value,
            room: modal.querySelector('#exam-room').value.trim(),
            weight: parseFloat(modal.querySelector('#exam-weight').value) || 1,
            creditPoints: parseInt(modal.querySelector('#exam-credit-points').value) || 0,
            grade: gradeVal ? parseFloat(gradeVal) : null
        });
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#exam-title').focus(), 100);
}
