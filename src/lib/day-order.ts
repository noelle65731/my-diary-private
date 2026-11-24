import { useSyncExternalStore } from "react";
import type { CalendarEvent, ProjectTask } from "./types";
import { eventCoversDay } from "@/components/calendar/calendar-utils";
import { pushToast } from "./toast-bus";

/**
 * A49: 하루 안의 일정·할 일 순서.
 *
 * 하루 목록은 세 층으로 그립니다.
 *   1층 종일 일정 · 2층 시간이 있는 일정과 할 일을 시작 시각 순으로 섞어서 · 3층 시간 없는 할 일
 * 층과 층 사이는 시간이 정하므로 사용자가 바꿀 수 없고, 같은 층·같은 시작 시각 안에서만
 * 손으로 순서를 바꿉니다. 노션 `정렬` 은 일정·할 일이 서로 다른 DB라 두 DB의 값을 견줄 수
 * 없어서(같은 14:00 일정과 할 일의 순서를 한 숫자로는 담을 수 없습니다) 섞인 층은 이 브라우저의
 * `my-diary:day-order:v1` 에 날짜 → 층(시각) → 키 배열로 남깁니다. 새로고침해도 그대로입니다.
 */
export type DayOrderItem = { type: "event"; event: CalendarEvent } | { type: "task"; task: ProjectTask };

/** 1: 종일 일정 · 2: 시작 시각이 있는 일정·할 일 · 3: 시간 없는 할 일 */
export type DayOrderLevel = 1 | 2 | 3;

export const GROUP_ALL_DAY = "allday";
export const GROUP_NO_TIME = "none";
export const DAY_ORDER_KEY = "my-diary:day-order:v1";

const LAST = Number.MAX_SAFE_INTEGER;

/** 날짜 → 층 → 항목 키 배열 (`e:일정id`, `t:할일id`). */
export type DayTimeOrder = Record<string, Record<string, string[]>>;

export const dayItemKey = (item: DayOrderItem): string =>
  item.type === "event" ? `e:${item.event.id}` : `t:${item.task.id}`;

export const dayItemTitle = (item: DayOrderItem): string => (item.type === "event" ? item.event.title : item.task.title);

export function dayItemLevel(item: DayOrderItem): DayOrderLevel {
  if (item.type === "event") return item.event.allDay || !item.event.startTime ? 1 : 2;
  return item.task.startTime ? 2 : 3;
}

/** 2층 항목의 시작 시각(HH:MM). 다른 층은 null. */
export function dayItemTime(item: DayOrderItem): string | null {
  if (dayItemLevel(item) !== 2) return null;
  return item.type === "event" ? item.event.startTime ?? null : item.task.startTime ?? null;
}

/** 순서를 함께 바꿀 수 있는 묶음의 이름 — 종일 / 같은 시작 시각 / 시간 없음. */
export function dayItemGroup(item: DayOrderItem): string {
  const level = dayItemLevel(item);
  if (level === 1) return GROUP_ALL_DAY;
  if (level === 3) return GROUP_NO_TIME;
  return `t:${dayItemTime(item)}`;
}

const createdAtOf = (item: DayOrderItem): string =>
  String(item.type === "event" ? item.event.createdAt : item.task.createdAt);

const sortOf = (item: DayOrderItem): number => {
  const value = item.type === "event" ? item.event.sort : item.task.sort;
  return value ?? LAST;
};

/** 층 → (2층은) 시작 시각 → 사용자가 정한 정렬 → 쓴 순서. */
function baseCompare(a: DayOrderItem, b: DayOrderItem): number {
  const level = dayItemLevel(a) - dayItemLevel(b);
  if (level !== 0) return level;
  const timeA = dayItemTime(a) ?? "";
  const timeB = dayItemTime(b) ?? "";
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;
  const sortA = sortOf(a);
  const sortB = sortOf(b);
  if (sortA !== sortB) return sortA - sortB;
  return createdAtOf(a).localeCompare(createdAtOf(b));
}

/**
 * 그 날의 일정·할 일을 3층으로 늘어놓고, 저장된 순서가 있으면 같은 층 안에서만 다시 세웁니다.
 * 층과 층 사이는 시간이 정하므로 저장된 순서로도 뒤바뀌지 않습니다.
 */
export function orderDayItems(items: DayOrderItem[], day: string, order: DayTimeOrder): DayOrderItem[] {
  const base = [...items].sort(baseCompare);
  const groups = order[day];
  if (!groups) return base;
  return base.sort((a, b) => {
    const keyA = dayItemGroup(a);
    if (keyA !== dayItemGroup(b)) return 0;
    const stored = groups[keyA];
    if (!stored || stored.length < 2) return 0;
    const indexA = stored.indexOf(dayItemKey(a));
    const indexB = stored.indexOf(dayItemKey(b));
    return (indexA < 0 ? LAST : indexA) - (indexB < 0 ? LAST : indexB);
  });
}

/** 그 날의 일정·할 일만 골라 3층으로 — 화면마다 같은 함수를 씁니다. */
export function buildDayItems(
  events: CalendarEvent[],
  tasks: ProjectTask[],
  day: string,
  order: DayTimeOrder,
): DayOrderItem[] {
  const items: DayOrderItem[] = [];
  for (const event of events) {
    if (event.kind !== "일정") continue;
    if (!eventCoversDay(event, day)) continue;
    items.push({ type: "event", event });
  }
  for (const task of tasks) {
    if (!(task.date === day || task.due === day)) continue;
    items.push({ type: "task", task });
  }
  return orderDayItems(items, day, order);
}

/** 한 묶음(같은 층·같은 시각)의 항목만. */
export function groupOf(items: DayOrderItem[], group: string): DayOrderItem[] {
  return items.filter((item) => dayItemGroup(item) === group);
}

/** `key` 를 `targetKey` 앞/뒤로 옮긴 새 키 순서. 같은 묶음이 아니면 null. */
export function moveWithinGroup(
  group: DayOrderItem[],
  key: string,
  targetKey: string,
  after: boolean,
): string[] | null {
  if (key === targetKey) return null;
  const keys = group.map(dayItemKey);
  if (!keys.includes(key) || !keys.includes(targetKey)) return null;
  const next = keys.filter((item) => item !== key);
  const at = next.indexOf(targetKey);
  if (at < 0) return null;
  next.splice(at + (after ? 1 : 0), 0, key);
  return next;
}

/** ↑↓ 한 칸 — 같은 묶음 안에서만. */
export function shiftWithinGroup(group: DayOrderItem[], key: string, direction: -1 | 1): string[] | null {
  const keys = group.map(dayItemKey);
  const index = keys.indexOf(key);
  const target = keys[index + direction];
  if (index < 0 || target === undefined) return null;
  return moveWithinGroup(group, key, target, direction > 0);
}

/* ── 저장소 (브라우저) ─────────────────────────────────────────────
   여러 화면(월간 칸·하루 목록·주간 칸·시트)이 같은 순서를 즉시 보도록,
   localStorage 위에 작은 구독 저장소를 둡니다. */

let cache: DayTimeOrder | null = null;
const listeners = new Set<() => void>();
const EMPTY: DayTimeOrder = {};

function readStore(): DayTimeOrder {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DAY_ORDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: DayTimeOrder = {};
    for (const [day, groups] of Object.entries(parsed as Record<string, unknown>)) {
      if (!groups || typeof groups !== "object") continue;
      const dayGroups: Record<string, string[]> = {};
      for (const [group, keys] of Object.entries(groups as Record<string, unknown>)) {
        if (!Array.isArray(keys)) continue;
        dayGroups[group] = keys.filter((key): key is string => typeof key === "string");
      }
      out[day] = dayGroups;
    }
    return out;
  } catch {
    return {};
  }
}

export function dayOrderSnapshot(): DayTimeOrder {
  if (cache === null) cache = readStore();
  return cache;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 화면에서 쓰는 훅 — 순서를 바꾸면 이 훅을 쓴 모든 화면이 함께 다시 그려집니다. */
export function useDayOrder(): DayTimeOrder {
  return useSyncExternalStore(subscribe, dayOrderSnapshot, () => EMPTY);
}

/** 마지막으로 순서를 바꾼 시각 — 드래그 뒤의 클릭·스와이프를 잠깐 막는 데 씁니다. */
let lastChangedAt = 0;
export const dayOrderChangedAt = () => lastChangedAt;

export function saveGroupOrder(day: string, group: string, keys: string[]): void {
  const current = dayOrderSnapshot();
  const next: DayTimeOrder = { ...current, [day]: { ...(current[day] ?? {}), [group]: keys } };
  cache = next;
  lastChangedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  try {
    window.localStorage.setItem(DAY_ORDER_KEY, JSON.stringify(next));
  } catch {
    /* 저장 공간이 없으면 이번 화면에서만 유지됩니다. */
  }
  for (const listener of listeners) listener();
}

/**
 * 한 묶음의 새 순서를 저장하고 알립니다. `group` 은 그 묶음의 항목들이며(모두 같은 층·시각),
 * `keys` 는 그 묶음 전체의 새 순서입니다 — 화면에 보이는 일부만 넘기면 나머지가 기본 순서로
 * 돌아가므로, 부르는 쪽은 그 날 그 묶음의 항목을 모두 모아 넘깁니다.
 *
 * 1·3층(종일 일정·시간 없는 할 일)은 노션 `정렬` 을 10, 20, 30 … 으로 다시 매겨 저장합니다 —
 * 프로젝트 탭·주간 막대처럼 같은 항목을 다른 화면에서도 같은 순서로 보여야 하기 때문입니다.
 * 2층(같은 시작 시각에 섞인 일정·할 일)만 이 브라우저의 순서 저장소를 씁니다.
 */
export interface DayOrderHandlers {
  updateEvent: (id: string, patch: Record<string, unknown>) => void;
  updateTask: (id: string, patch: Record<string, unknown>) => void;
}

export function applyGroupOrder(
  day: string,
  group: DayOrderItem[],
  keys: string[] | null,
  handlers: DayOrderHandlers,
  message = "순서를 바꿨습니다",
): boolean {
  const first = group[0];
  if (!keys || keys.length === 0 || !first) return false;
  const level = dayItemLevel(first);
  /* 이 화면(브라우저)의 순서는 언제나 남깁니다 — 노션 저장이 끝나기 전에 새로고침해도 그대로. */
  saveGroupOrder(day, dayItemGroup(first), keys);
  if (level !== 2) {
    const byKey = new Map(group.map((item) => [dayItemKey(item), item]));
    keys.forEach((key, index) => {
      const item = byKey.get(key);
      if (!item) return;
      const value = (index + 1) * 10;
      if (item.type === "event") {
        if (item.event.sort !== value) handlers.updateEvent(item.event.id, { sort: value });
      } else if (item.task.sort !== value) {
        handlers.updateTask(item.task.id, { sort: value });
      }
    });
  }
  pushToast(message);
  return true;
}
