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
 * A28: which way the date order runs in a project list.
 * `near` — 가장 가까운 날짜가 위(오름차순), `far` — 먼 날짜가 위(내림차순).
 * 날짜 없는 할 일은 어느 쪽이든 날짜가 있는 할 일 아래에 놓입니다.
 */
export type TaskDateOrder = "near" | "far";

export const TASK_DATE_ORDER_LABELS: Record<TaskDateOrder, string> = {
  near: "가까운 날짜순",
  far: "먼 날짜순",
};

function compareSameDate(a: ProjectTask, b: ProjectTask): number {
  // 시간이 있는 할 일이 먼저, 그다음 시각이 빠른 순 — 같은 시각이면 수동 순서, 그다음 제목.
  const aTime = a.startTime ?? "";
  const bTime = b.startTime ?? "";
  if (aTime !== bTime) {
    if (aTime && !bTime) return -1;
    if (!aTime && bTime) return 1;
    return aTime.localeCompare(bTime);
  }
  const aSort = a.sort ?? Number.POSITIVE_INFINITY;
  const bSort = b.sort ?? Number.POSITIVE_INFINITY;
  if (aSort !== bSort) return aSort - bSort;
  return a.title.localeCompare(b.title, "ko");
}

/**
 * Project content order by date, in the chosen direction.
 * Undated items follow every dated item, newest created first; the manual
 * `sort` value only breaks ties inside the same date (and once a date is fixed,
 * the time of day comes before it).
 */
export function compareTasksByDate(a: ProjectTask, b: ProjectTask, order: TaskDateOrder = "near"): number {
  const aDate = taskSortDate(a);
  const bDate = taskSortDate(b);
  if (aDate && bDate) {
    if (aDate !== bDate) return order === "near" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
  } else if (aDate) {
    return -1;
  } else if (bDate) {
    return 1;
  } else {
    const byCreated = taskCreatedKey(b).localeCompare(taskCreatedKey(a));
    if (byCreated !== 0) return byCreated;
  }
  return compareSameDate(a, b);
}

/** 먼 날짜가 위 — 완료·취소 기록의 기본 순서(A19). */
export function compareTasksNewestFirst(a: ProjectTask, b: ProjectTask): number {
  return compareTasksByDate(a, b, "far");
}

/** 가까운 날짜가 위 — 남은 할 일의 기본 순서(A28). */
export function compareTasksNearestFirst(a: ProjectTask, b: ProjectTask): number {
  return compareTasksByDate(a, b, "near");
}

export function sortTasksNewestFirst(tasks: ProjectTask[]): ProjectTask[] {
  return [...tasks].sort(compareTasksNewestFirst);
}

/** A28: 남은 할 일 — 고른 방향(가까운 날짜순/먼 날짜순)으로 정렬합니다. */
export function sortTasksByDate(tasks: ProjectTask[], order: TaskDateOrder = "near"): ProjectTask[] {
  return [...tasks].sort((a, b) => compareTasksByDate(a, b, order));
}

/** Open items above, completed/canceled below; inside a group the newest date comes first. */
export function isClosedTask(task: ProjectTask): boolean {
  return task.status === "완료" || task.status === "취소";
}

/**
 * A10: the one order every project task list uses (card, drawer, detail list).
 * Open → closed, so 남은 할 일 is always above 최근 기록; inside the open group the
 * date runs the way the user picked (A28: 기본은 가까운 날짜순), and completed
 * records always keep the newest date on top. The manual `sort` only reorders
 * items that sit on the same date, so a drag can never break the date order.
 */
export function sortProjectTaskList(tasks: ProjectTask[], order: TaskDateOrder = "near"): ProjectTask[] {
  return [...tasks].sort((a, b) => {
    const closedA = isClosedTask(a);
    const closedB = isClosedTask(b);
    if (closedA !== closedB) return closedA ? 1 : -1;
    if (closedA) return compareTasksNewestFirst(a, b);
    return compareTasksByDate(a, b, order);
  });
}

/** New `sort` values that reorder only the given same-date group. */
export function reorderSameDate(
  group: ProjectTask[],
  movedId: string,
  targetId: string,
): Array<{ id: string; sort: number }> {
  const ids = group.map((item) => item.id);
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, movedId);
  return next.map((id, index) => ({ id, sort: (index + 1) * 10 }));
}

/** Insertion index for a vertical list drop, from the target element's position. */
export function listInsertIndex(listLength: number, targetIndex: number | null, after: boolean): number {
  if (targetIndex === null || Number.isNaN(targetIndex)) return listLength;
  return Math.max(0, Math.min(listLength, targetIndex + (after ? 1 : 0)));
}
