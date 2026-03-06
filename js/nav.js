import { appState, onStateChange, setMode } from './app.js';

/**
 * The 5 main mode tabs shown in the floating bottom pill.
 * Active state is driven by appState.activeMode.
 */
const MODE_TABS = [
    { mode: 'home',     icon: 'home',          label: 'Heute'    },
    { mode: 'calendar', icon: 'calendar_month', label: 'Kalender' },
    { mode: 'todo',     icon: 'checklist',      label: 'Aufgaben', badgeId: 'badge-today' },
    { mode: 'uni',      icon: 'school',         label: 'Uni'      },
    { mode: 'wishlist', icon: 'shopping_bag',   label: 'Wünsche'  },
];

let currentBadges = {};

export function initNav() {
    renderNav();
    onStateChange(() => renderNav());
}

function renderNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    nav.innerHTML = '';

    MODE_TABS.forEach(item => {
        const btn = document.createElement('button');
        const isActive = appState.activeMode === item.mode;
        btn.className = 'nav-tab' + (isActive ? ' active' : '');
        btn.dataset.mode = item.mode;

        btn.innerHTML = `
            <span class="material-symbols-outlined">${item.icon}</span>
            <span class="nav-tab-label">${item.label}</span>
            ${item.badgeId ? `<span class="nav-tab-badge" id="${item.badgeId}"></span>` : ''}
        `;

        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            setMode(item.mode);
        });
        nav.appendChild(btn);
    });

    // Re-apply badges after render
    if (currentBadges.today) {
        const badge = document.getElementById('badge-today');
        if (badge) badge.textContent = currentBadges.today > 0 ? currentBadges.today : '';
    }
}

export function updateBadges({ today = 0 } = {}) {
    currentBadges.today = today;
    const badge = document.getElementById('badge-today');
    if (badge) {
        badge.textContent = today > 0 ? today : '';
    }
    if ('setAppBadge' in navigator) {
        if (today > 0) {
            navigator.setAppBadge(today).catch(() => {});
        } else {
            navigator.clearAppBadge().catch(() => {});
        }
    }
}
