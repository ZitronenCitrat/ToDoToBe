import { reorderTodos } from './db.js';

let sortableInstance = null;

export async function initSortable(containerEl, getTodos) {
    // SortableJS loaded via CDN as ES module
    const { default: Sortable } = await import('https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/modular/sortable.esm.js');

    if (sortableInstance) {
        sortableInstance.destroy();
    }

    sortableInstance = new Sortable(containerEl, {
        animation: 150,
        ghostClass: 'todo-ghost',
        chosenClass: 'todo-chosen',
        handle: '.drag-handle',
        onEnd(evt) {
            const { oldIndex, newIndex } = evt;
            if (oldIndex === newIndex) return;

            const todos = getTodos();
            const movedTodo = todos[oldIndex];
            if (!movedTodo) return;

            // Calculate new sortOrder
            const reordered = [...todos];
            reordered.splice(oldIndex, 1);
            reordered.splice(newIndex, 0, movedTodo);

            // Assign new sortOrder values
            const updates = reordered.map((todo, index) => ({
                id: todo.id,
                sortOrder: index + 1
            }));

            reorderTodos(updates);
        }
    });

    return sortableInstance;
}

export function destroySortable() {
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
}
