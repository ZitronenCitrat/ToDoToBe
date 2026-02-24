import { db, auth, appState } from './app.js';
import {
    collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, onSnapshot, writeBatch, Timestamp, getDocs, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js';

function uid() { return auth.currentUser.uid; }
function userCol(name) { return collection(db, 'users', uid(), name); }
function userDoc(col, id) { return doc(db, 'users', uid(), col, id); }

// ===== Google Calendar sync helper =====
// Fire-and-forget: dynamically imports gcal.js to avoid circular deps.
// Merges the current appState entity with any pending updates before syncing.
function gcalSync(type, id, updates = {}, meta = {}) {
    import('./gcal.js').then(({ syncEntityToGcal }) => {
        let base = null;
        if (type === 'todo')       base = appState.allTodos.find(t => t.id === id);
        else if (type === 'event') base = appState.allEvents.find(e => e.id === id);
        else if (type === 'exam')  base = appState.allExams.find(e => e.id === id);
        else if (type === 'assignment') base = appState.allAssignments.find(a => a.id === id);
        else if (type === 'wish')  base = appState.allWishlistItems.find(w => w.id === id);
        const entity = { ...(base || {}), ...updates, id };
        syncEntityToGcal(type, entity, meta).catch(() => {});
    }).catch(() => {});
}

// ===== User =====

export async function initUser(user) {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
        await setDoc(userRef, {
            displayName: user.displayName || '',
            email: user.email || '',
            photoURL: user.photoURL || '',
            settings: { theme: 'dark', notifications: false },
            createdAt: Timestamp.now()
        });

        await addDoc(collection(db, 'users', user.uid, 'lists'), {
            name: 'Eingang',
            icon: '📥',
            color: '#007aff',
            sortOrder: 0,
            isDefault: true,
            createdAt: Timestamp.now()
        });

        return { isNewUser: true };
    }

    return { isNewUser: false };
}

// ===== User Settings =====

export async function getUserSettings() {
    const userSnap = await getDoc(doc(db, 'users', uid()));
    if (userSnap.exists()) {
        return userSnap.data().settings || { theme: 'dark', notifications: false };
    }
    return { theme: 'dark', notifications: false };
}

export async function updateUserSettings(settings) {
    return updateDoc(doc(db, 'users', uid()), { settings });
}

// ===== Lists =====

export function subscribeLists(callback) {
    const q = query(userCol('lists'), orderBy('sortOrder', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const lists = [];
        snapshot.forEach((d) => lists.push({ id: d.id, ...d.data() }));
        callback(lists);
    });
}

export async function createList(name, color = '#007aff', icon = '📋') {
    const listsRef = userCol('lists');
    const snapshot = await getDocs(listsRef);
    let maxOrder = 0;
    snapshot.forEach((d) => {
        if (d.data().sortOrder > maxOrder) maxOrder = d.data().sortOrder;
    });
    return addDoc(listsRef, {
        name, icon, color, sortOrder: maxOrder + 1, isDefault: false, createdAt: Timestamp.now()
    });
}

export async function updateList(listId, updates) {
    return updateDoc(userDoc('lists', listId), updates);
}

export async function deleteList(listId) {
    const batch = writeBatch(db);
    const todosQuery = query(userCol('todos'), where('listId', '==', listId));
    const todosDocs = await getDocs(todosQuery);
    todosDocs.forEach((d) => batch.delete(d.ref));
    batch.delete(userDoc('lists', listId));
    return batch.commit();
}

// ===== Todos =====

export function subscribeTodos(callback) {
    const q = query(userCol('todos'), orderBy('sortOrder', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const todos = [];
        snapshot.forEach((d) => todos.push({ id: d.id, ...d.data() }));
        callback(todos);
    });
}

export async function createTodo(title, listId, { priority = 4, dueDate = null, notes = '' } = {}) {
    const todosRef = userCol('todos');
    const snapshot = await getDocs(query(todosRef, where('listId', '==', listId)));
    let maxOrder = 0;
    snapshot.forEach((d) => {
        if (d.data().sortOrder > maxOrder) maxOrder = d.data().sortOrder;
    });
    const dueDateTs = dueDate ? Timestamp.fromDate(new Date(dueDate)) : null;
    const ref = await addDoc(todosRef, {
        title, notes, completed: false, completedAt: null,
        priority, dueDate: dueDateTs,
        listId, subtasks: [], sortOrder: maxOrder + 1,
        recurrence: null, recurrenceWeekdays: [], lastResetDate: null,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
    gcalSync('todo', ref.id, { title, notes, dueDate: dueDateTs });
    return ref;
}

export async function updateTodo(todoId, updates) {
    if (updates.dueDate !== undefined) {
        updates.dueDate = updates.dueDate ? Timestamp.fromDate(new Date(updates.dueDate)) : null;
    }
    updates.updatedAt = Timestamp.now();
    await updateDoc(userDoc('todos', todoId), updates);
    // Sync to gcal when date/title/notes change (not for completed toggles or sort reorders)
    if (updates.dueDate !== undefined || updates.title !== undefined || updates.notes !== undefined) {
        gcalSync('todo', todoId, updates);
    }
}

export async function toggleTodo(todoId, completed) {
    return updateTodo(todoId, {
        completed,
        completedAt: completed ? Timestamp.now() : null
    });
}

export async function deleteTodo(todoId) {
    return deleteDoc(userDoc('todos', todoId));
}

export async function reorderTodos(todoUpdates) {
    const batch = writeBatch(db);
    for (const { id, sortOrder } of todoUpdates) {
        batch.update(userDoc('todos', id), { sortOrder, updatedAt: Timestamp.now() });
    }
    return batch.commit();
}

// ===== Subtasks =====

function generateId() {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 12);
}

export async function addSubtask(todoId, title) {
    const subtask = { id: generateId(), title, completed: false };
    return updateDoc(userDoc('todos', todoId), {
        subtasks: arrayUnion(subtask), updatedAt: Timestamp.now()
    });
}

export async function toggleSubtask(todoId, subtaskId, currentSubtasks) {
    const updated = currentSubtasks.map(s =>
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );
    return updateDoc(userDoc('todos', todoId), { subtasks: updated, updatedAt: Timestamp.now() });
}

export async function updateSubtaskTitle(todoId, subtaskId, title, currentSubtasks) {
    const updated = currentSubtasks.map(s =>
        s.id === subtaskId ? { ...s, title } : s
    );
    return updateDoc(userDoc('todos', todoId), { subtasks: updated, updatedAt: Timestamp.now() });
}

export async function removeSubtask(todoId, subtaskId, currentSubtasks) {
    const updated = currentSubtasks.filter(s => s.id !== subtaskId);
    return updateDoc(userDoc('todos', todoId), { subtasks: updated, updatedAt: Timestamp.now() });
}

// ===== Courses (Uni) =====

export function subscribeCourses(callback) {
    const q = query(userCol('courses'), orderBy('sortOrder', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function addCourse(data) {
    const snapshot = await getDocs(userCol('courses'));
    let maxOrder = 0;
    snapshot.forEach((d) => { if (d.data().sortOrder > maxOrder) maxOrder = d.data().sortOrder; });

    // Build timeSlots from either new format or legacy weekdays+startTime+endTime
    let timeSlots = data.timeSlots || [];
    if (timeSlots.length === 0 && data.weekdays && data.weekdays.length > 0) {
        timeSlots = data.weekdays.map(wd => ({
            weekday: wd,
            startTime: data.startTime || '08:00',
            endTime: data.endTime || '09:30'
        }));
    }

    return addDoc(userCol('courses'), {
        name: data.name || '', instructor: data.instructor || '', room: data.room || '',
        color: data.color || '#3742fa',
        timeSlots,
        // Keep legacy fields for backward compat during migration
        weekdays: timeSlots.map(s => s.weekday),
        startTime: timeSlots[0]?.startTime || '08:00',
        endTime: timeSlots[0]?.endTime || '09:30',
        semesterId: data.semesterId || null, creditHours: data.creditHours || 0,
        additionalEvents: data.additionalEvents || [],
        skippedDates: data.skippedDates || [],
        sortOrder: maxOrder + 1, createdAt: Timestamp.now()
    });
}

// Migrate a course to use timeSlots (called automatically when loading)
export async function migrateCourseToTimeSlots(courseId, course) {
    if (course.timeSlots && course.timeSlots.length > 0) return; // already migrated
    const weekdays = course.weekdays || [];
    if (weekdays.length === 0) return;
    const timeSlots = weekdays.map(wd => ({
        weekday: wd,
        startTime: course.startTime || '08:00',
        endTime: course.endTime || '09:30'
    }));
    return updateDoc(userDoc('courses', courseId), { timeSlots });
}

export async function skipCourseDate(courseId, dateStr) {
    const ref = userDoc('courses', courseId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const skipped = snap.data().skippedDates || [];
    if (!skipped.includes(dateStr)) {
        await updateDoc(ref, { skippedDates: [...skipped, dateStr] });
    }
}

export async function unskipCourseDate(courseId, dateStr) {
    const ref = userDoc('courses', courseId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const skipped = (snap.data().skippedDates || []).filter(d => d !== dateStr);
    await updateDoc(ref, { skippedDates: skipped });
}

export async function updateCourse(courseId, updates) {
    return updateDoc(userDoc('courses', courseId), updates);
}

export async function deleteCourse(courseId) {
    const batch = writeBatch(db);
    // Delete related exams
    const examsSnap = await getDocs(query(userCol('exams'), where('courseId', '==', courseId)));
    examsSnap.forEach((d) => batch.delete(d.ref));
    // Delete related assignments
    const assignSnap = await getDocs(query(userCol('assignments'), where('courseId', '==', courseId)));
    assignSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(userDoc('courses', courseId));
    return batch.commit();
}

// ===== Exams (Uni) =====

export function subscribeExams(callback) {
    const q = query(userCol('exams'), orderBy('date', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function addExam(data) {
    const dateTs = data.date ? Timestamp.fromDate(new Date(data.date)) : null;
    const ref = await addDoc(userCol('exams'), {
        courseId: data.courseId || '', title: data.title || '',
        date: dateTs,
        time: data.time || '', room: data.room || '',
        grade: data.grade ?? null, weight: data.weight ?? 1,
        creditPoints: data.creditPoints ?? 0,
        notes: data.notes || '', completed: false,
        createdAt: Timestamp.now()
    });
    const course = appState.allCourses.find(c => c.id === data.courseId);
    gcalSync('exam', ref.id, { title: data.title, date: dateTs, time: data.time, room: data.room, courseId: data.courseId }, { courseName: course?.name || '' });
    return ref;
}

export async function updateExam(examId, updates) {
    if (updates.date !== undefined) {
        updates.date = updates.date ? Timestamp.fromDate(new Date(updates.date)) : null;
    }
    await updateDoc(userDoc('exams', examId), updates);
    if (updates.date !== undefined || updates.title !== undefined || updates.time !== undefined || updates.room !== undefined) {
        const existing = appState.allExams.find(e => e.id === examId);
        const course = existing ? appState.allCourses.find(c => c.id === existing.courseId) : null;
        gcalSync('exam', examId, updates, { courseName: course?.name || '' });
    }
}

export async function deleteExam(examId) {
    return deleteDoc(userDoc('exams', examId));
}

// ===== Assignments (Uni) =====

export function subscribeAssignments(callback) {
    const q = query(userCol('assignments'), orderBy('sortOrder', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function addAssignment(data) {
    const snapshot = await getDocs(userCol('assignments'));
    let maxOrder = 0;
    snapshot.forEach((d) => { if (d.data().sortOrder > maxOrder) maxOrder = d.data().sortOrder; });
    const dueDateTs = data.dueDate ? Timestamp.fromDate(new Date(data.dueDate)) : null;
    const ref = await addDoc(userCol('assignments'), {
        courseId: data.courseId || '', title: data.title || '',
        dueDate: dueDateTs,
        completed: false, completedAt: null,
        grade: data.grade ?? null, weight: data.weight ?? 1,
        notes: data.notes || '', priority: data.priority || 4,
        sortOrder: maxOrder + 1, createdAt: Timestamp.now()
    });
    const course = appState.allCourses.find(c => c.id === data.courseId);
    gcalSync('assignment', ref.id, { title: data.title, dueDate: dueDateTs, courseId: data.courseId }, { courseName: course?.name || '' });
    return ref;
}

export async function updateAssignment(assignmentId, updates) {
    if (updates.dueDate !== undefined) {
        updates.dueDate = updates.dueDate ? Timestamp.fromDate(new Date(updates.dueDate)) : null;
    }
    await updateDoc(userDoc('assignments', assignmentId), updates);
    if (updates.dueDate !== undefined || updates.title !== undefined) {
        const existing = appState.allAssignments.find(a => a.id === assignmentId);
        const course = existing ? appState.allCourses.find(c => c.id === existing.courseId) : null;
        gcalSync('assignment', assignmentId, updates, { courseName: course?.name || '' });
    }
}

export async function deleteAssignment(assignmentId) {
    return deleteDoc(userDoc('assignments', assignmentId));
}

// ===== Wishlist Items =====

export function subscribeWishlistItems(callback) {
    const q = query(userCol('wishlistItems'), orderBy('sortOrder', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function addWishlistItem(data) {
    const snapshot = await getDocs(userCol('wishlistItems'));
    let maxOrder = 0;
    snapshot.forEach((d) => { if (d.data().sortOrder > maxOrder) maxOrder = d.data().sortOrder; });
    const dateTs = data.date ? Timestamp.fromDate(new Date(data.date)) : null;
    const ref = await addDoc(userCol('wishlistItems'), {
        title: data.title || '', category: data.category || 'Sonstiges',
        price: data.price ?? null,
        nutzen: data.nutzen ?? 3,              // 1–5 star rating (was binary, now numeric scale)
        date: dateTs,                          // release/purchase date
        purchased: false, purchasedAt: null,
        priority: data.priority || 4, notes: data.notes || '',
        url: data.url || '', sortOrder: maxOrder + 1, createdAt: Timestamp.now()
    });
    gcalSync('wish', ref.id, { title: data.title, date: dateTs, category: data.category, price: data.price });
    return ref;
}

export async function updateWishlistItem(itemId, updates) {
    await updateDoc(userDoc('wishlistItems', itemId), updates);
    if (updates.date !== undefined || updates.title !== undefined || updates.price !== undefined) {
        gcalSync('wish', itemId, updates);
    }
}

export async function deleteWishlistItem(itemId) {
    return deleteDoc(userDoc('wishlistItems', itemId));
}

export async function toggleWishlistItem(itemId, purchased) {
    return updateWishlistItem(itemId, {
        purchased,
        purchasedAt: purchased ? Timestamp.now() : null
    });
}

// ===== Habits =====

export function subscribeHabits(callback) {
    const q = query(userCol('habits'), orderBy('sortOrder', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function addHabit(data) {
    const snapshot = await getDocs(userCol('habits'));
    let maxOrder = 0;
    snapshot.forEach((d) => { if (d.data().sortOrder > maxOrder) maxOrder = d.data().sortOrder; });
    return addDoc(userCol('habits'), {
        title: data.title || '', icon: data.icon || 'fitness_center',
        color: data.color || '#00ffd5', frequency: data.frequency || 'daily',
        weekdays: data.weekdays || [], currentStreak: 0, longestStreak: 0,
        lastCompletedDate: null, sortOrder: maxOrder + 1,
        createdAt: Timestamp.now(), archived: false
    });
}

export async function updateHabit(habitId, updates) {
    return updateDoc(userDoc('habits', habitId), updates);
}

export async function deleteHabit(habitId) {
    // Delete associated logs
    const batch = writeBatch(db);
    const logsSnap = await getDocs(query(userCol('habitLogs'), where('habitId', '==', habitId)));
    logsSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(userDoc('habits', habitId));
    return batch.commit();
}

// ===== Habit Logs =====

export function subscribeHabitLogs(callback) {
    const q = query(userCol('habitLogs'), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function toggleHabitLog(habitId, dateStr) {
    const logId = `${habitId}_${dateStr}`;
    const logRef = userDoc('habitLogs', logId);
    const logSnap = await getDoc(logRef);

    if (logSnap.exists() && logSnap.data().completed) {
        // Uncomplete
        await updateDoc(logRef, { completed: false, completedAt: null });
    } else if (logSnap.exists()) {
        // Complete existing
        await updateDoc(logRef, { completed: true, completedAt: Timestamp.now() });
    } else {
        // Create new log
        await setDoc(logRef, {
            habitId, date: dateStr, completed: true, completedAt: Timestamp.now()
        });
    }

    // Update streak on habit
    await recalculateStreak(habitId);
}

// ===== Flashcards =====

export function subscribeFlashcards(callback) {
    const q = query(userCol('flashcards'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function addFlashcard(data) {
    return addDoc(userCol('flashcards'), {
        courseId: data.courseId || '',
        front: data.front || '',
        back: data.back || '',
        repetitions: 0,
        interval: 1,
        easeFactor: 2.5,
        dueDate: Timestamp.now(),
        createdAt: Timestamp.now()
    });
}

export async function updateFlashcard(cardId, updates) {
    if (updates.dueDate !== undefined && updates.dueDate instanceof Date) {
        updates.dueDate = Timestamp.fromDate(updates.dueDate);
    }
    return updateDoc(userDoc('flashcards', cardId), updates);
}

export async function deleteFlashcard(cardId) {
    return deleteDoc(userDoc('flashcards', cardId));
}

// ===== Weekly Reviews =====

export async function saveWeeklyReview(weekKey, data) {
    await setDoc(userDoc('weeklyReviews', weekKey), {
        ...data,
        updatedAt: Timestamp.now()
    }, { merge: true });
}

export async function getWeeklyReview(weekKey) {
    const snap = await getDoc(userDoc('weeklyReviews', weekKey));
    return snap.exists() ? snap.data() : null;
}

// ===== Semesters (Uni) =====

export function subscribeSemesters(callback) {
    const q = query(userCol('semesters'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function addSemester(data) {
    return addDoc(userCol('semesters'), {
        name: data.name || '',
        semesterStart: data.semesterStart || null,   // outer frame start
        semesterEnd: data.semesterEnd || null,       // outer frame end
        lectureStart: data.lectureStart || null,     // lecture period start (within semester)
        lectureEnd: data.lectureEnd || null,         // lecture period end
        holidays: data.holidays || [],               // individual holiday periods within lecture period
        isActive: data.isActive || false,            // manual override
        createdAt: Timestamp.now()
    });
}

export async function updateSemester(semesterId, updates) {
    return updateDoc(userDoc('semesters', semesterId), updates);
}

export async function deleteSemester(semesterId) {
    return deleteDoc(userDoc('semesters', semesterId));
}

export async function setActiveSemester(semesterId, allSemesters) {
    const batch = writeBatch(db);
    allSemesters.forEach(sem => {
        batch.update(userDoc('semesters', sem.id), { isActive: sem.id === semesterId });
    });
    return batch.commit();
}

async function recalculateStreak(habitId) {
    const logsSnap = await getDocs(query(userCol('habitLogs'), where('habitId', '==', habitId)));
    const completedDates = new Set();
    logsSnap.forEach((d) => {
        if (d.data().completed) completedDates.add(d.data().date);
    });

    let currentStreak = 0;
    const today = new Date();
    const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    // Count backwards from today
    let checkDate = new Date(today);
    while (completedDates.has(dateStr(checkDate))) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
    }

    // Find longest streak
    const sortedDates = Array.from(completedDates).sort();
    let longestStreak = 0;
    let streak = 0;
    let prevDate = null;
    for (const ds of sortedDates) {
        const d = new Date(ds);
        if (prevDate) {
            const diff = (d - prevDate) / (1000 * 60 * 60 * 24);
            if (diff === 1) {
                streak++;
            } else {
                streak = 1;
            }
        } else {
            streak = 1;
        }
        if (streak > longestStreak) longestStreak = streak;
        prevDate = d;
    }

    await updateDoc(userDoc('habits', habitId), {
        currentStreak, longestStreak,
        lastCompletedDate: completedDates.has(dateStr(today)) ? dateStr(today) : null
    });
}

// ===== Calendar Events (Termine) =====

export function subscribeEvents(callback) {
    const q = query(userCol('events'), orderBy('date', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    });
}

export async function addEvent(data) {
    const dateTs = data.date ? Timestamp.fromDate(new Date(data.date)) : null;
    const ref = await addDoc(userCol('events'), {
        title: data.title || '',
        date: dateTs,
        time: data.time || '',
        category: data.category || 'Sonstiges',
        recurrence: data.recurrence || 'none', // 'none' | 'daily' | 'weekly' | 'monthly'
        notes: data.notes || '',
        color: data.color || null,
        createdAt: Timestamp.now()
    });
    gcalSync('event', ref.id, { title: data.title, date: dateTs, time: data.time, category: data.category });
    return ref;
}

export async function updateEvent(eventId, updates) {
    if (updates.date !== undefined) {
        updates.date = updates.date ? Timestamp.fromDate(new Date(updates.date)) : null;
    }
    await updateDoc(userDoc('events', eventId), updates);
    if (updates.date !== undefined || updates.title !== undefined || updates.time !== undefined) {
        gcalSync('event', eventId, updates);
    }
}

export async function deleteEvent(eventId) {
    return deleteDoc(userDoc('events', eventId));
}
