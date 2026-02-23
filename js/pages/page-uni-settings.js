import { appState, onStateChange } from '../app.js';
import { onRouteChange, back } from '../router.js';
import { addSemester, updateSemester, deleteSemester, setActiveSemester } from '../db.js';
import { toDate, toInputDate, escapeHtml, escapeAttr } from '../utils.js';

let initialized = false;

export function initPageUniSettings() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-uni-settings');
    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="uni-settings-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 class="page-header-title" style="flex:1;margin-left:8px">Uni-Einstellungen</h1>
        </div>
        <div class="px-5 flex-1">
            <div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Semester</div>
            <div id="uni-settings-semesters"></div>
            <button id="uni-settings-add-btn" class="btn-accent w-full mt-4">Neues Semester</button>
        </div>
    `;

    container.querySelector('#uni-settings-back-btn').addEventListener('click', back);
    container.querySelector('#uni-settings-add-btn').addEventListener('click', () => openAddSemesterModal());

    onStateChange(() => { if (isActive()) render(); });
    onRouteChange((route) => { if (route === 'uni-settings') render(); });
}

function isActive() {
    return window.location.hash.slice(1).split('/')[0] === 'uni-settings';
}

function render() {
    const list = document.getElementById('uni-settings-semesters');
    if (!list) return;

    const semesters = appState.allSemesters || [];
    if (semesters.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">calendar_today</span>
            <div class="empty-state-text">Noch kein Semester angelegt</div>
        </div>`;
        return;
    }

    list.innerHTML = semesters.map(sem => {
        const start = toDate(sem.lectureStart);
        const end = toDate(sem.lectureEnd);
        const dateRange = start && end
            ? `${start.toLocaleDateString('de-DE')} \u2013 ${end.toLocaleDateString('de-DE')}`
            : 'Kein Zeitraum';
        const holidayCount = (sem.holidays || []).length;
        return `
        <div class="glass-sm p-4 mb-3">
            <div class="flex items-center justify-between mb-1">
                <div style="font-size:15px;font-weight:600">${escapeHtml(sem.name)}
                    ${sem.isActive ? '<span style="font-size:11px;background:var(--accent);color:#050505;padding:2px 8px;border-radius:10px;margin-left:8px;font-weight:600">Aktiv</span>' : ''}
                </div>
                <div class="flex gap-2">
                    ${!sem.isActive ? `<button class="icon-btn activate-btn" data-id="${sem.id}" title="Aktivieren">
                        <span class="material-symbols-outlined" style="font-size:18px">check_circle</span>
                    </button>` : ''}
                    <button class="icon-btn edit-btn" data-id="${sem.id}">
                        <span class="material-symbols-outlined" style="font-size:18px">edit</span>
                    </button>
                    <button class="icon-btn delete-btn" data-id="${sem.id}">
                        <span class="material-symbols-outlined" style="font-size:18px;color:var(--priority-1)">delete</span>
                    </button>
                </div>
            </div>
            <div style="font-size:13px;color:var(--text-secondary)">${dateRange}</div>
            ${holidayCount > 0 ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${holidayCount} Ferienperiode(n)</div>` : ''}
        </div>`;
    }).join('');

    list.querySelectorAll('.activate-btn').forEach(btn => {
        btn.addEventListener('click', () => setActiveSemester(btn.dataset.id, appState.allSemesters));
    });
    list.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sem = appState.allSemesters.find(s => s.id === btn.dataset.id);
            if (sem) openAddSemesterModal(sem);
        });
    });
    list.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const sem = appState.allSemesters.find(s => s.id === btn.dataset.id);
            if (sem && confirm(`Semester "${sem.name}" wirklich l\u00f6schen?`)) {
                await deleteSemester(btn.dataset.id);
            }
        });
    });
}

function openAddSemesterModal(existing = null) {
    const old = document.getElementById('semester-modal');
    if (old) old.remove();

    let holidays = existing ? JSON.parse(JSON.stringify(
        (existing.holidays || []).map(h => ({
            name: h.name || '',
            start: toInputDate(h.start) || '',
            end: toInputDate(h.end) || ''
        }))
    )) : [];

    const modal = document.createElement('div');
    modal.id = 'semester-modal';
    modal.className = 'modal-overlay';

    function renderHolidayRows() {
        if (holidays.length === 0) return '';
        return holidays.map((h, i) => `
            <div class="flex gap-2 mb-2 items-center">
                <input type="text" class="glass-input flex-1" placeholder="Name (z.B. Weihnachtsferien)"
                    value="${escapeAttr(h.name || '')}" data-field="name" data-idx="${i}" style="min-width:0">
                <input type="date" class="glass-input" style="width:130px"
                    value="${h.start || ''}" data-field="start" data-idx="${i}">
                <input type="date" class="glass-input" style="width:130px"
                    value="${h.end || ''}" data-field="end" data-idx="${i}">
                <button class="icon-btn remove-holiday-btn" data-idx="${i}" style="flex-shrink:0">
                    <span class="material-symbols-outlined" style="font-size:18px;color:var(--priority-1)">remove</span>
                </button>
            </div>`).join('');
    }

    function buildModalHTML() {
        return `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-4">${existing ? 'Semester bearbeiten' : 'Neues Semester'}</h2>
            <input type="text" id="sem-name" class="glass-input w-full mb-3"
                placeholder="Semestername (z.B. WS 25/26)"
                value="${existing ? existing.name : ''}">
            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:6px">Vorlesungszeit</div>
            <div class="flex gap-2 mb-3">
                <input type="date" id="sem-lecture-start" class="glass-input flex-1"
                    value="${existing ? toInputDate(existing.lectureStart) : ''}">
                <input type="date" id="sem-lecture-end" class="glass-input flex-1"
                    value="${existing ? toInputDate(existing.lectureEnd) : ''}">
            </div>
            <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:6px">Vorlesungsfreie Zeit</div>
            <div class="flex gap-2 mb-3">
                <input type="date" id="sem-free-start" class="glass-input flex-1"
                    value="${existing ? toInputDate(existing.lectureFreeStart) : ''}">
                <input type="date" id="sem-free-end" class="glass-input flex-1"
                    value="${existing ? toInputDate(existing.lectureFreeEnd) : ''}">
            </div>
            <div class="flex items-center justify-between mb-2">
                <div style="font-size:13px;color:var(--text-tertiary)">Ferien</div>
                <button id="sem-add-holiday" class="btn-ghost" style="padding:6px 12px;font-size:13px">+ Hinzuf\u00fcgen</button>
            </div>
            <div id="sem-holidays">${renderHolidayRows()}</div>
            <label class="flex items-center gap-3 mb-4 mt-2" style="cursor:pointer">
                <input type="checkbox" id="sem-active" ${existing?.isActive ? 'checked' : ''}>
                <span style="font-size:14px">Als aktives Semester setzen</span>
            </label>
            <button id="sem-save" class="btn-accent w-full">${existing ? 'Speichern' : 'Hinzuf\u00fcgen'}</button>
        </div>`;
    }

    modal.innerHTML = buildModalHTML();
    document.body.appendChild(modal);

    function rewireHolidayEvents() {
        modal.querySelectorAll('.remove-holiday-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                holidays.splice(parseInt(btn.dataset.idx), 1);
                modal.querySelector('#sem-holidays').innerHTML = renderHolidayRows();
                rewireHolidayEvents();
            });
        });
        modal.querySelectorAll('[data-field]').forEach(inp => {
            inp.addEventListener('input', () => {
                const idx = parseInt(inp.dataset.idx);
                if (holidays[idx]) holidays[idx][inp.dataset.field] = inp.value;
            });
        });
    }
    rewireHolidayEvents();

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());

    modal.querySelector('#sem-add-holiday').addEventListener('click', () => {
        holidays.push({ name: '', start: '', end: '' });
        modal.querySelector('#sem-holidays').innerHTML = renderHolidayRows();
        rewireHolidayEvents();
    });

    modal.querySelector('#sem-save').addEventListener('click', async () => {
        const name = modal.querySelector('#sem-name').value.trim();
        if (!name) return;

        const { Timestamp } = await import('https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js');

        function ts(dateStr) {
            if (!dateStr) return null;
            return Timestamp.fromDate(new Date(dateStr));
        }

        const setActive = modal.querySelector('#sem-active').checked;

        const data = {
            name,
            lectureStart: ts(modal.querySelector('#sem-lecture-start').value),
            lectureEnd: ts(modal.querySelector('#sem-lecture-end').value),
            lectureFreeStart: ts(modal.querySelector('#sem-free-start').value),
            lectureFreeEnd: ts(modal.querySelector('#sem-free-end').value),
            holidays: holidays
                .filter(h => h.start && h.end)
                .map(h => ({ name: h.name || '', start: ts(h.start), end: ts(h.end) })),
            isActive: setActive
        };

        if (existing) {
            await updateSemester(existing.id, data);
            if (setActive) await setActiveSemester(existing.id, appState.allSemesters);
        } else {
            const docRef = await addSemester(data);
            if (setActive) await setActiveSemester(docRef.id, appState.allSemesters);
        }
        modal.remove();
    });

    setTimeout(() => modal.querySelector('#sem-name').focus(), 100);
}
