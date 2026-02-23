const routes = {
    'today':                { page: 'today',                showNav: true  },
    'calendar':             { page: 'calendar',             showNav: true  },
    'projects':             { page: 'projects',             showNav: true  },
    'project':              { page: 'project-detail',       showNav: false },
    'task':                 { page: 'task-detail',          showNav: false },
    'stats':                { page: 'stats',                showNav: true  },
    'settings':             { page: 'settings',             showNav: false },
    'habits':               { page: 'habits',               showNav: false },
    'uni':                  { page: 'uni',                  showNav: true  },
    'timetable':            { page: 'uni-timetable',        showNav: true  },
    'assignments':          { page: 'uni-assignments',      showNav: true  },
    'grades':               { page: 'uni-grades',           showNav: true  },
    'uni-settings':         { page: 'uni-settings',         showNav: true  },
    'wishlist':             { page: 'wishlist',             showNav: true  },
    'wishlist-categories':  { page: 'wishlist-categories',  showNav: true  },
    'wishlist-matrix':      { page: 'wishlist-matrix',      showNav: true  },
    'weekly-review':        { page: 'weekly-review',        showNav: false },
    'flashcards':           { page: 'flashcard-decks',      showNav: true  },
    'flashcard-deck':       { page: 'flashcard-study',      showNav: false },
};

let currentRoute = null;
let currentParams = {};
let onRouteChangeCallbacks = [];

export function initRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

export function navigate(route, params = {}) {
    let hash = `#${route}`;
    if (params.id) hash += `/${params.id}`;
    window.location.hash = hash;
}

export function back() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        navigate('today');
    }
}

export function onRouteChange(fn) {
    onRouteChangeCallbacks.push(fn);
    return () => {
        onRouteChangeCallbacks = onRouteChangeCallbacks.filter(cb => cb !== fn);
    };
}

export function getCurrentRoute() {
    return { route: currentRoute, params: currentParams };
}

function handleRoute() {
    const hash = window.location.hash.slice(1) || 'today';
    const parts = hash.split('/');
    const routeKey = parts[0];
    const params = {};

    if (parts.length > 1) {
        params.id = parts.slice(1).join('/');
    }

    const routeDef = routes[routeKey];
    if (!routeDef) {
        navigate('today');
        return;
    }

    currentRoute = routeKey;
    currentParams = params;

    // Switch page visibility
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const activePage = document.getElementById(`page-${routeDef.page}`);
    if (activePage) activePage.classList.add('active');

    // Toggle bottom nav + FAB visibility
    const nav = document.getElementById('bottom-nav');
    const fab = document.getElementById('fab');
    if (routeDef.showNav) {
        nav.classList.remove('hidden');
        fab.classList.remove('hidden');
    } else {
        nav.classList.add('hidden');
        fab.classList.add('hidden');
    }

    // Update active tab highlight
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.route === routeKey);
    });

    // Notify listeners
    onRouteChangeCallbacks.forEach(fn => fn(routeKey, params));
}
