import { db, auth } from './app.js';
import {
    collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, onSnapshot, writeBatch, Timestamp, getDocs, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js';

function uid() { return auth.currentUser.uid; }
function userCol(name) { return collection(db, 'users', uid(), name); }
function userDoc(col, id) { return doc(db, 'users', uid(), col, id); }

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
    }
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
    return addDoc(todosRef, {
        title, notes, completed: false, completedAt: null,
        priority, dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        listId, subtasks: [], sortOrder: maxOrder + 1,
        recurrence: null, recurrenceWeekdays: [], lastResetDate: null,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
}

export async function updateTodo(todoId, updates) {
    if (updates.dueDate !== undefined) {
        updates.dueDate = updates.dueDate ? Timestamp.fromDate(new Date(updates.dueDate)) : null;
    }
    updates.updatedAt = Timestamp.now();
    return updateDoc(userDoc('todos', todoId), updates);
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
    return addDoc(userCol('courses'), {
        name: data.name || '', instructor: data.instructor || '', room: data.room || '',
        color: data.color || '#3742fa', weekdays: data.weekdays || [],
        startTime: data.startTime || '08:00', endTime: data.endTime || '09:30',
        semesterId: data.semesterId || null, creditHours: data.creditHours || 0,
        sortOrder: maxOrder + 1, createdAt: Timestamp.now()
    });
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
    return addDoc(userCol('exams'), {
        courseId: data.courseId || '', title: data.title || '',
        date: data.date ? Timestamp.fromDate(new Date(data.date)) : null,
        time: data.time || '', room: data.room || '',
        grade: data.grade ?? null, weight: data.weight ?? 1,
        creditPoints: data.creditPoints ?? 0,
        notes: data.notes || '', completed: false,
        createdAt: Timestamp.now()
    });
}

export async function updateExam(examId, updates) {
    if (updates.date !== undefined) {
        updates.date = updates.date ? Timestamp.fromDate(new Date(updates.date)) : null;
    }
    return updateDoc(userDoc('exams', examId), updates);
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
    return addDoc(userCol('assignments'), {
        courseId: data.courseId || '', title: data.title || '',
        dueDate: data.dueDate ? Timestamp.fromDate(new Date(data.dueDate)) : null,
        completed: false, completedAt: null,
        grade: data.grade ?? null, weight: data.weight ?? 1,
        notes: data.notes || '', priority: data.priority || 4,
        sortOrder: maxOrder + 1, createdAt: Timestamp.now()
    });
}

export async function updateAssignment(assignmentId, updates) {
    if (updates.dueDate !== undefined) {
        updates.dueDate = updates.dueDate ? Timestamp.fromDate(new Date(updates.dueDate)) : null;
    }
    return updateDoc(userDoc('assignments', assignmentId), updates);
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
    return addDoc(userCol('wishlistItems'), {
        title: data.title || '', category: data.category || 'Sonstiges',
        price: data.price ?? null,
        originalPrice: data.originalPrice ?? null,
        nutzen: data.nutzen ?? 2,
        purchased: false, purchasedAt: null,
        priority: data.priority || 4, notes: data.notes || '',
        url: data.url || '', sortOrder: maxOrder + 1, createdAt: Timestamp.now()
    });
}

export async function updateWishlistItem(itemId, updates) {
    return updateDoc(userDoc('wishlistItems', itemId), updates);
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
        lectureStart: data.lectureStart || null,
        lectureEnd: data.lectureEnd || null,
        lectureFreeStart: data.lectureFreeStart || null,
        lectureFreeEnd: data.lectureFreeEnd || null,
        holidays: data.holidays || [],
        isActive: data.isActive || false,
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
