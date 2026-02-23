import { appState, onStateChange, auth } from '../app.js';
import { onRouteChange, back } from '../router.js';
import { signOutUser } from '../auth.js';
import { updateUserSettings } from '../db.js';

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
        const { showSyncedBanner } = await import('./app.js');
        showSyncedBanner();
        setTimeout(() => { btn.textContent = 'Sync'; btn.disabled = false; }, 2000);
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
}

export function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}
