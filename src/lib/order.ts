import type { ProjectTask, Resource } from "./types";

/**
 * Ordering rules shared by the drag-and-drop surfaces.
 *
 * Notion keeps a manual order in the `정렬` number property. Values are sparse
 * (10, 20, 30 …) so dropping an item between two others only rewrites that one
 * item; when there is no room left the whole list is renumbered once.
 */

const STRIDE = 10;

type Sortable = { id: string; sort: number | null };

/** Stored manual order: items with `sort` first (ascending), the rest in input order. */
export function sortByStoredOrder<T extends Sortable>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aSort = a.item.sort;
      const bSort = b.item.sort;
      if (aSort !== null && bSort !== null) return aSort - bSort || a.index - b.index;
      if (aSort !== null) return -1;
      if (bSort !== null) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * New `sort` values after moving `movedId` to `insertIndex` of the full list
 * (0 = before the first item, `ordered.length` = after the last one).
 */
export function reorderSortValues<T extends Sortable>(
  ordered: T[],
  movedId: string,
  insertIndex: number,
): Array<{ id: string; sort: number }> {
  const from = ordered.findIndex((item) => item.id === movedId);
  if (from === -1) return [];
  const moved = ordered[from]!;
  const rest = ordered.filter((item) => item.id !== movedId);
  let index = insertIndex;
  if (index > from) index -= 1;
  index = Math.max(0, Math.min(rest.length, index));

  const before = rest[index - 1];
  const after = rest[index];
  const left = before?.sort ?? null;
  const right = after?.sort ?? null;

  if (left !== null && right !== null) {
    if (right - left > 2) return [{ id: moved.id, sort: (left + right) / 2 }];
  } else if (left !== null) {
    return [{ id: moved.id, sort: left + STRIDE }];
  } else if (left === null && right !== null) {
    // A numbered item after un-numbered ones is inconsistent: renumber instead.
  } else if (!before && !after) {
    return [{ id: moved.id, sort: STRIDE }];
  }

  const renumbered = [...rest.slice(0, index), moved, ...rest.slice(index)];
  return renumbered.map((item, position) => ({ id: item.id, sort: (position + 1) * STRIDE }));
}

/** Writes only the values that really change. */
export function applySortValues(
  update: (resource: Resource, id: string, patch: Record<string, unknown>) => Promise<boolean>,
  resource: Resource,
  current: Sortable[],
  changes: Array<{ id: string; sort: number }>,
): void {
  for (const change of changes) {
    const item = current.find((entry) => entry.id === change.id);
    if (!item) continue;
    if (item.sort !== null && Math.abs(item.sort - change.sort) < 0.001) continue;
    void update(resource, change.id, { sort: change.sort });
  }
}

/* ───────────────── project content ordering ───────────────── */

/** Date a task is filed under — the same one the project cards show. */
export function taskSortDate(task: ProjectTask): string {
  return (task.doneAt ?? "").slice(0, 10) || (task.due ?? "") || (task.date ?? "");
}

function taskCreatedKey(task: ProjectTask): string {
  return (task.createdAt ?? "").slice(0, 19);
}

/**
 * Project content order: newest date on top, oldest at the bottom.
 * Undated items follow every dated item, newest created first; the manual
 * `sort` value only breaks ties inside the same date.
 */
export function compareTasksNewestFirst(a: ProjectTask, b: ProjectTask): number {
  const aDate = taskSortDate(a);
  const bDate = taskSortDate(b);
  if (aDate && bDate) {
    if (aDate !== bDate) return bDate.localeCompare(aDate);
  } else if (aDate) {
    return -1;
  } else if (bDate) {
    return 1;
  } else {
    const byCreated = taskCreatedKey(b).localeCompare(taskCreatedKey(a));
    if (byCreated !== 0) return byCreated;
  }
  const aSort = a.sort ?? Number.POSITIVE_INFINITY;
  const bSort = b.sort ?? Number.POSITIVE_INFINITY;
  if (aSort !== bSort) return aSort - bSort;
  return a.title.localeCompare(b.title, "ko");
}

export function sortTasksNewestFirst(tasks: ProjectTask[]): ProjectTask[] {
  return [...tasks].sort(compareTasksNewestFirst);
}

/** Insertion index for a vertical list drop, from the target element's position. */
export function listInsertIndex(listLength: number, targetIndex: number | null, after: boolean): number {
  if (targetIndex === null || Number.isNaN(targetIndex)) return listLength;
  return Math.max(0, Math.min(listLength, targetIndex + (after ? 1 : 0)));
}
