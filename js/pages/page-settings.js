import { appState, onStateChange, auth } from '../app.js';
import { onRouteChange, back } from '../router.js';
import { signOutUser, isPasswordLinked, linkEmailPassword, changePassword, getAuthErrorMessage } from '../auth.js';
import { updateUserSettings } from '../db.js';
import { isGcalConfigured, isGcalConnected, connectGcal, disconnectGcal, initGcal } from '../gcal.js';

let initialized = false;

export function initPageSettings() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('page-settings');

    container.innerHTML = `
        <div class="page-header">
            <button class="icon-btn" id="settings-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 class="page-header-title" style="flex:1;margin-left:8px">Einstellungen</h1>
        </div>
        <div class="px-5 flex-1">
            <div class="glass p-5 mb-4 flex items-center gap-4" id="settings-profile">
                <div class="avatar-btn" style="width:56px;height:56px;pointer-events:none">
                    <img src="" alt="" id="settings-avatar">
                </div>
                <div>
                    <div id="settings-name" style="font-size:17px;font-weight:600"></div>
                    <div id="settings-email" style="font-size:13px;color:var(--text-tertiary)"></div>
                </div>
            </div>

            <div class="glass-sm mb-4">
                <div class="flex items-center justify-between p-4" style="border-bottom:1px solid var(--surface-border)">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined" style="color:var(--text-tertiary)">dark_mode</span>
                        <span style="font-size:15px">Dark Mode</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="settings-theme-toggle">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="flex items-center justify-between p-4" style="border-bottom:1px solid var(--surface-border)">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined" style="color:var(--text-tertiary)">notifications</span>
                        <span style="font-size:15px">Benachrichtigungen</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="settings-notif-toggle">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined" style="color:var(--text-tertiary)">sync</span>
                        <span style="font-size:15px">Manuell synchronisieren</span>
                    </div>
                    <button id="settings-sync-btn" class="btn-ghost" style="padding:8px 16px;font-size:13px">Sync</button>
                </div>
            </div>

            <div class="glass-sm mb-4">
                <div style="padding:12px 16px 8px;font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:0.08em;text-transform:uppercase">Sicherheit</div>
                <div class="flex items-center justify-between p-4" style="border-bottom:1px solid var(--surface-border)">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined" style="color:var(--text-tertiary)">account_circle</span>
                        <div>
                            <div style="font-size:15px">Google</div>
                            <div style="font-size:12px;color:var(--accent)">Verknüpft ✓</div>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined" style="color:var(--text-tertiary)">lock</span>
                        <div>
                            <div style="font-size:15px">Passwort</div>
                            <div id="settings-password-status" style="font-size:12px;color:var(--text-tertiary)">Nicht gesetzt</div>
                        </div>
                    </div>
                    <button id="settings-password-btn" class="btn-ghost" style="padding:8px 16px;font-size:13px">Setzen</button>
                </div>
            </div>

            <div class="glass-sm mb-4" id="settings-gcal-section">
                <div style="padding:12px 16px 8px;font-size:11px;font-weight:600;color:var(--text-tertiary);letter-spacing:0.08em;text-transform:uppercase">Google Kalender</div>
                <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined" style="color:var(--text-tertiary)">calendar_month</span>
                        <div>
                            <div style="font-size:15px">Synchronisation</div>
                            <div id="settings-gcal-status" style="font-size:12px;color:var(--text-tertiary)">Nicht verbunden</div>
                        </div>
                    </div>
                    <button id="settings-gcal-btn" class="btn-ghost" style="padding:8px 16px;font-size:13px">Verbinden</button>
                </div>
                <div id="settings-gcal-hint" class="hidden px-4 pb-4" style="font-size:12px;color:var(--text-tertiary);line-height:1.5">
                    Füge deine Client-ID in js/gcal.js ein, um die Google-Kalender-Synchronisation zu aktivieren.
                </div>
            </div>

            <button id="settings-signout" class="btn-ghost w-full mb-3 flex items-center justify-center gap-2">
                <span class="material-symbols-outlined" style="font-size:20px">logout</span>
                Abmelden
            </button>

            <button id="settings-delete-account" class="btn-danger w-full flex items-center justify-center gap-2">
                <span class="material-symbols-outlined" style="font-size:20px">person_remove</span>
                Konto löschen
            </button>
        </div>
    `;

    // Back
    container.querySelector('#settings-back-btn').addEventListener('click', back);

    // Theme toggle
    const themeToggle = container.querySelector('#settings-theme-toggle');
    themeToggle.addEventListener('change', async () => {
        const theme = themeToggle.checked ? 'dark' : 'light';
        appState.settings.theme = theme;
        applyTheme(theme);
        await updateUserSettings({ ...appState.settings, theme });
    });

    // Notifications toggle
    container.querySelector('#settings-notif-toggle').addEventListener('change', async (e) => {
        appState.settings.notifications = e.target.checked;
        await updateUserSettings(appState.settings);
    });

    // Manual sync
    container.querySelector('#settings-sync-btn').addEventListener('click', async () => {
        const btn = container.querySelector('#settings-sync-btn');
        if (!navigator.onLine) {
            btn.textContent = 'Offline';
            setTimeout(() => { btn.textContent = 'Sync'; }, 2000);
            return;
        }
        btn.textContent = 'Syncing\u2026';
        btn.disabled = true;
        const { showSyncedBanner } = await import('../app.js');
        showSyncedBanner();
        setTimeout(() => { btn.textContent = 'Sync'; btn.disabled = false; }, 2000);
    });

    // Password button (Sicherheit section)
    container.querySelector('#settings-password-btn').addEventListener('click', () => {
        if (appState.user) openPasswordModal(appState.user);
    });

    // Google Calendar — pass userId so token can be stored/loaded from Firestore
    initGcal(appState.user?.uid, (connected) => {
        renderGcalStatus(container, connected);
    });

    container.querySelector('#settings-gcal-btn').addEventListener('click', () => {
        if (!isGcalConfigured()) return; // hint already shown
        if (isGcalConnected()) {
            if (confirm('Google Kalender trennen?')) {
                disconnectGcal();
                renderGcalStatus(container, false);
            }
        } else {
            connectGcal();
        }
    });

    // Sign out
    container.querySelector('#settings-signout').addEventListener('click', () => {
        signOutUser(auth);
    });

    // Delete account (placeholder)
    container.querySelector('#settings-delete-account').addEventListener('click', () => {
        if (confirm('Dein Konto und alle Daten werden unwiderruflich gelöscht. Fortfahren?')) {
            alert('Diese Funktion wird in Kürze verfügbar sein.');
        }
    });

    onRouteChange((route) => {
        if (route === 'settings') renderSettings();
    });

    onStateChange(() => {
        const hash = window.location.hash.slice(1) || 'today';
        if (hash === 'settings') renderSettings();
    });

    renderSettings();
}

function renderSettings() {
    const container = document.getElementById('page-settings');
    if (!container || !appState.user) return;

    container.querySelector('#settings-avatar').src = appState.user.photoURL || '';
    container.querySelector('#settings-name').textContent = appState.user.displayName || '';
    container.querySelector('#settings-email').textContent = appState.user.email || '';

    container.querySelector('#settings-theme-toggle').checked = appState.settings.theme !== 'light';
    container.querySelector('#settings-notif-toggle').checked = appState.settings.notifications || false;

    // Security section — refresh provider status
    const pwLinked = isPasswordLinked(appState.user);
    const pwStatus = container.querySelector('#settings-password-status');
    const pwBtn    = container.querySelector('#settings-password-btn');
    if (pwStatus) {
        pwStatus.textContent = pwLinked ? 'Aktiv \u2713' : 'Nicht gesetzt';
        pwStatus.style.color = pwLinked ? 'var(--accent)' : 'var(--text-tertiary)';
    }
    if (pwBtn) pwBtn.textContent = pwLinked ? '\u00c4ndern' : 'Setzen';

    // Google Calendar status
    renderGcalStatus(container, isGcalConnected());
}

function openPasswordModal(user) {
    const isLinked  = isPasswordLinked(user);
    const title     = isLinked ? 'Passwort \u00e4ndern' : 'Passwort setzen';
    const safeEmail = (user.email || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <h2 class="text-lg font-semibold mb-1">${title}</h2>
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
                E-Mail: <strong style="color:var(--text-primary)">${safeEmail}</strong>
            </p>
            <input type="password" id="pwd-modal-input" class="glass-input w-full"
                placeholder="Neues Passwort (min. 8 Zeichen)" autocomplete="new-password" style="margin-bottom:10px">
            <input type="password" id="pwd-modal-confirm" class="glass-input w-full"
                placeholder="Passwort best\u00e4tigen" autocomplete="new-password" style="margin-bottom:8px">
            <p id="pwd-modal-error" class="hidden" style="font-size:13px;color:#ef4444;margin-bottom:8px"></p>
            <button id="pwd-modal-save" class="btn-accent w-full" style="margin-bottom:10px">${title}</button>
            <button id="pwd-modal-cancel" class="btn-ghost w-full">Abbrechen</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const pwInput      = overlay.querySelector('#pwd-modal-input');
    const confirmInput = overlay.querySelector('#pwd-modal-confirm');
    const errorEl      = overlay.querySelector('#pwd-modal-error');
    const saveBtn      = overlay.querySelector('#pwd-modal-save');
    const cancelBtn    = overlay.querySelector('#pwd-modal-cancel');
    const backdrop     = overlay.querySelector('.modal-backdrop');

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

    backdrop.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    saveBtn.addEventListener('click', async () => {
        const pw      = pwInput.value;
        const confirm = confirmInput.value;
        errorEl.classList.add('hidden');

        if (pw.length < 8) {
            errorEl.textContent = 'Passwort muss mindestens 8 Zeichen haben.';
            errorEl.classList.remove('hidden');
            return;
        }
        if (pw !== confirm) {
            errorEl.textContent = 'Passw\u00f6rter stimmen nicht \u00fcberein.';
            errorEl.classList.remove('hidden');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Wird gespeichert\u2026';

        try {
            if (isLinked) {
                await changePassword(user, pw);
            } else {
                await linkEmailPassword(user, pw);
            }
            close();
            renderSettings();
        } catch (err) {
            console.error('Password modal error:', err);
            errorEl.textContent = getAuthErrorMessage(err.code);
            errorEl.classList.remove('hidden');
            saveBtn.disabled = false;
            saveBtn.textContent = title;
        }
    });

    confirmInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
    setTimeout(() => pwInput.focus(), 150);
}

function renderGcalStatus(container, connected) {
    const statusEl = container.querySelector('#settings-gcal-status');
    const btn      = container.querySelector('#settings-gcal-btn');
    const hint     = container.querySelector('#settings-gcal-hint');
    if (!statusEl || !btn) return;

    if (!isGcalConfigured()) {
        statusEl.textContent = 'Nicht konfiguriert';
        statusEl.style.color = 'var(--text-tertiary)';
        btn.textContent = 'Setup';
        btn.disabled = true;
        if (hint) hint.classList.remove('hidden');
        return;
    }

    if (hint) hint.classList.add('hidden');
    btn.disabled = false;

    if (connected) {
        statusEl.textContent = 'Verbunden \u2713';
        statusEl.style.color = 'var(--accent)';
        btn.textContent = 'Trennen';
    } else {
        statusEl.textContent = 'Nicht verbunden';
        statusEl.style.color = 'var(--text-tertiary)';
        btn.textContent = 'Verbinden';
    }
}

export function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}
