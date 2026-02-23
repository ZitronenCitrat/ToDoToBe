# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ToDoToBe is a Todo Planner PWA with a "Dark Liquid Glass" design, using Firebase (Auth + Firestore) as backend. Deployed via GitHub Pages (public repo). UI language is German.

## Tech Stack

- Vanilla JavaScript with ES Modules (`<script type="module">`)
- Firebase SDK v11.3.0 via CDN imports (no npm)
- Tailwind CSS via CDN (Play CDN)
- Google Fonts: Inter, Material Symbols Outlined
- SortableJS via CDN for drag & drop
- No build tools, no bundler, no framework
- Static files served directly from GitHub Pages

## Running Locally

```
python3 -m http.server 8000
```
Open http://localhost:8000. No build step needed.

## Architecture

### SPA with Hash Router
Navigation is hash-based (`#today`, `#calendar`, `#projects`, `#project/{id}`, `#task/{id}`, `#stats`, `#settings`). The router in `router.js` shows/hides page containers and toggles the bottom nav/FAB visibility.

### File Structure
- **index.html** — SPA shell: blob background, auth screen, page containers, bottom nav, FAB, quick-add modal
- **app.js** — Entry point: Firebase init, global `appState` + pub/sub, auth listener, page initialization
- **router.js** — Hash-based SPA router with `navigate()`, `back()`, `onRouteChange()`
- **nav.js** — Bottom tab navigation (Heute, Kalender, Projekte, Statistik) + badge counts
- **auth.js** — Google Sign-In / Sign-Out (unchanged)
- **db.js** — All Firestore CRUD: todos, lists, subtasks, user settings + real-time listeners
- **utils.js** — German date formatting, calendar helpers (getDaysInMonth, getFirstDayOfWeek, etc.)
- **todo-item.js** — Glass-style todo element with priority bar, Material Symbols, subtask count
- **drag-drop.js** — SortableJS integration for reordering
- **mindmap.js** — Brainstorm mindmap component (stores nodes on list document)
- **page-today.js** — Today dashboard: daily goal ring, task list, completed section
- **page-task-detail.js** — Task editor: title, date, priority, list, subtasks, notes
- **page-projects.js** — Projects hub: overview card, 2x2 grid of lists
- **page-project-detail.js** — Project detail: progress ring, tabs (Aufgaben/Übersicht/Brainstorm)
- **page-calendar.js** — Month calendar grid with day selection and daily tasks
- **page-stats.js** — Statistics: streak, productivity chart, per-list breakdown
- **page-settings.js** — Settings: profile, theme toggle (dark/light), sign out
- **style.css** — Dark Liquid Glass design system: blobs, glass panels, neon accent, light theme support
- **sw.js** — Service worker: cache-first for app shell, stale-while-revalidate for CDN
- **manifest.json** — PWA manifest (dark theme)

### Global State Pattern
```
appState = { user, allTodos, allLists, settings }
onStateChange(fn) — registers a listener, returns unsubscribe function
```
All page modules import `appState` and `onStateChange` from `app.js`. Firestore real-time listeners update `appState` centrally, then notify all pages.

### Module Dependency Graph
```
app.js → auth.js, router.js, nav.js → (dynamic imports) → page-*.js, db.js, utils.js
page-*.js → app.js (appState, onStateChange), router.js, todo-item.js, db.js, utils.js
db.js → app.js (auth, db instances)
```
Note: `app.js` ↔ `db.js` is a circular dependency. Works because db.js only accesses `auth`/`db` inside function bodies. App.js uses dynamic `import()` for db.js.

### Firestore Data Model
```
users/{userId}/ → displayName, email, photoURL, settings: {theme, notifications}, createdAt
  lists/{listId}/ → name, icon, color, sortOrder, isDefault, mindmapNodes?, createdAt
  todos/{todoId}/ → title, notes, completed, completedAt, priority (1-4), dueDate, listId, subtasks: [{id, title, completed}], sortOrder, createdAt, updatedAt
```

## Firebase Config

Firebase config is in `app.js` (safe in public repo — security via Firestore Rules). The project ID is `todoistobe-c5014`.

## Design System

- **Dark Liquid Glass**: #050505 background, animated gradient blobs, glass panels (backdrop-blur + semi-transparent borders)
- **Accent color**: #00ffd5 (Zen neon cyan/teal)
- **Light theme**: Toggled via `[data-theme="light"]` on `<html>`, uses CSS variable overrides
- **Priority colors**: 1=#ff4757 (red), 2=#ffa502 (orange), 3=#3742fa (blue), 4=transparent
- **CSS classes**: `.glass`, `.glass-sm`, `.glass-input`, `.glass-select`, `.glass-textarea`, `.btn-accent`, `.btn-danger`, `.btn-ghost`, `.priority-chip`, `.tab-btn`, `.icon-btn`
