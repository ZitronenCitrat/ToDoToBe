import { navigate } from './router.js';
import { appState, onStateChange } from './app.js';

const NAV_CONFIGS = {
    home: [
        { spacer: true },
    ],
    calendar: [
        { spacer: true },
    ],
    todo: [
        { route: 'today',    icon: 'today',          label: 'Heute',     badgeId: 'badge-today' },
        { spacer: true },
        { route: 'projects', icon: 'folder_open',     label: 'Projekte'  },
        { route: 'stats',    icon: 'bar_chart',       label: 'Statistik' },
    ],
    uni: [
        { route: 'uni',         icon: 'school',       label: 'Übersicht' },
        { route: 'timetable',   icon: 'schedule',     label: 'Stundenplan' },
        { spacer: true },
        { route: 'assignments', icon: 'assignment',    label: 'Aufgaben'  },
        { route: 'grades',      icon: 'grade',         label: 'Noten'     },
        { route: 'flashcards',  icon: 'style',         label: 'Karten'    },
    ],
    wishlist: [
        { route: 'wishlist',             icon: 'shopping_cart', label: 'Liste'      },
        { spacer: true },
        { route: 'wishlist-categories',  icon: 'category',      label: 'Kategorien' },
        { route: 'wishlist-matrix',      icon: 'grid_view',     label: 'Matrix'     },
    ],
};

let currentBadges = {};

export function initNav() {
    renderNav();
    onStateChange(() => renderNav());
}

function renderNav() {
    const nav = document.getElementById('bottom-nav');
    const mode = appState.activeMode || 'todo';
    const config = NAV_CONFIGS[mode] || NAV_CONFIGS.todo;

    nav.innerHTML = '';
    config.forEach(item => {
        if (item.spacer) {
            const spacer = document.createElement('div');
            spacer.className = 'nav-tab-spacer';
            nav.appendChild(spacer);
            return;
        }

        const btn = document.createElement('button');
        btn.className = 'nav-tab';
        btn.dataset.route = item.route;

        btn.innerHTML = `
            <span class="material-symbols-outlined">${item.icon}</span>
            <span class="nav-tab-label">${item.label}</span>
            ${item.badgeId ? `<span class="nav-tab-badge" id="${item.badgeId}"></span>` : ''}
        `;

        btn.addEventListener('click', () => navigate(item.route));

        // Check if this tab is active based on current hash
        const currentHash = window.location.hash.slice(1).split('/')[0] || 'today';
        if (currentHash === item.route) {
            btn.classList.add('active');
        }

        nav.appendChild(btn);
    });

    // Re-apply badges
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
