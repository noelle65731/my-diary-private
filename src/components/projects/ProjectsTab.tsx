"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useProjectColors } from "@/state/project-colors";
import { PASTELS } from "@/components/common/pastels";
import { useSettings } from "@/state/settings";
import { useCategoryOptions } from "@/state/categories";
import { useTabReset, useUi } from "@/state/ui";
import { cn, categoryNameOf, matchesMode } from "@/lib/utils";
import { formatShort, startOfWeekISO, timeRangeLabel, todayISO, weekdayKo } from "@/lib/date";
import { type CalendarEvent, type ModeFilter, type ProjectTask, type Routine, type TaskCategory } from "@/lib/types";
import { PRIORITY_TONES, priorityOf, routineTone, taskTone } from "@/components/common/tone";
import { useCategoryColors } from "@/state/category-colors";
import { ProjectIcon } from "@/components/common/ProjectIcon";
import { CheckIcon, ChevronRightIcon, EyeIcon, InboxIcon, PencilIcon, PlusIcon, RepeatIcon, TrashIcon } from "@/components/icons";
import { ModeChips } from "@/components/common/ModeChips";
import { Switch } from "@/components/common/primitives";
import { INDEX_DRAWER_ID, ProjectDrawer } from "@/components/projects/ProjectDrawer";
import { ScheduleCard, ScheduleDrawer, scheduleDateLabel } from "@/components/projects/ScheduleCard";
import { TaskDetail } from "@/components/detail/TaskDetail";
import { EventDetail } from "@/components/detail/EventDetail";
import { useDnd } from "@/components/common/dnd";
import { useConvert } from "@/state/convert";
import { RoutineEditor } from "@/components/editors/RoutineEditor";
import { routineCountForDay } from "@/components/calendar/calendar-utils";
import { writeRoutineNow } from "@/lib/routine-now";
import { sortProjectTaskList, sortTasksByDate } from "@/lib/order";

type ProjectView = "tracks" | "priority" | "history" | "journal";
/** A card keeps five open tasks in view — fewer than four hid the work that was left. */
const CARD_OPEN_PREVIEW = 5;
/** A19: 기본 보기의 '최근 기록'은 최근 완료·취소한 할 일 두 개까지. */
const RECENT_LOG_MAX = 2;
/**
 * A41: 카드 배치는 `__break__` 같은 표시가 아니라 진짜 격자 칸(슬롯) 좌표로 남깁니다.
 * 0번 칸은 index 카드 자리이고, 3·4·5칸 보기 어디서든 빈 칸을 포함한 아무 칸으로나 옮길 수 있습니다.
 */
const SLOT_KEY = "my-diary:project-card-slots:v1";
const COLS_KEY = "my-diary:project-cols:v1";
/** index 카드가 늘 차지하는 칸 */
const INDEX_SLOT = 0;
/** 처음 열었을 때의 줄 수 — 카드가 더 많으면 그만큼 늘어납니다. */
const DEFAULT_ROWS = 3;
/** 카드 한 장에 들어가는 루틴 수. */
const ROUTINES_PER_CARD = 3;

type SlotCols = 3 | 4 | 5;
interface SlotLayout {
  cols: SlotCols;
  rows: number;
  /** 카드 키 → 칸 번호(0부터, 행 우선) */
  cells: Record<string, number>;
}

function readSlotLayout(): SlotLayout {
  const fallbackCols = (() => {
    if (typeof window === "undefined") return 4 as SlotCols;
    try {
      const saved = Number(window.localStorage.getItem(COLS_KEY));
      return saved === 3 || saved === 5 ? (saved as SlotCols) : (4 as SlotCols);
    } catch {
      return 4 as SlotCols;
    }
  })();
  if (typeof window === "undefined") return { cols: fallbackCols, rows: DEFAULT_ROWS, cells: {} };
  try {
    const raw = window.localStorage.getItem(SLOT_KEY);
    if (!raw) return { cols: fallbackCols, rows: DEFAULT_ROWS, cells: {} };
    const parsed = JSON.parse(raw) as Partial<SlotLayout> | null;
    const cells: Record<string, number> = {};
    const rawCells = parsed && typeof parsed.cells === "object" && parsed.cells ? parsed.cells : {};
    for (const [key, value] of Object.entries(rawCells)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) cells[key] = Math.round(value);
    }
    const cols = parsed && (parsed.cols === 3 || parsed.cols === 4 || parsed.cols === 5) ? (parsed.cols as SlotCols) : fallbackCols;
    const rows = parsed && typeof parsed.rows === "number" && parsed.rows >= 1 ? Math.min(30, Math.round(parsed.rows)) : DEFAULT_ROWS;
    return { cols, rows, cells };
  } catch {
    return { cols: fallbackCols, rows: DEFAULT_ROWS, cells: {} };
  }
}

/** 칸 수가 달라지면(3↔4↔5) 같은 줄·같은 열에 최대한 남도록 좌표를 옮겨 적습니다. */
function remapCells(cells: Record<string, number>, fromCols: number, toCols: number): Record<string, number> {
  if (fromCols === toCols) return cells;
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(cells)) {
    const row = Math.floor(value / fromCols);
    const col = value % fromCols;
    next[key] = row * toCols + Math.min(col, toCols - 1);
  }
  return next;
}

/** 이번 줄 수·칸 수에서 카드를 놓을 칸 목록 — 모자라면 뒤에 이어 붙입니다. */
function buildSlots(cells: Record<string, number>, rows: number, cols: number, keys: string[]): (string | null)[] {
  const total = Math.max(1, rows * cols);
  const slots: (string | null)[] = Array.from({ length: total }, () => null);
  slots[INDEX_SLOT] = "index";
  const used = new Set<number>([INDEX_SLOT]);
  const pending: string[] = [];
  for (const key of keys) {
    const at = cells[key];
    if (at !== undefined && at > INDEX_SLOT && at < total && !used.has(at)) {
      slots[at] = key;
      used.add(at);
      continue;
    }
    pending.push(key);
  }
  let cursor = INDEX_SLOT + 1;
  for (const key of pending) {
    while (cursor < slots.length && slots[cursor]) cursor += 1;
    if (cursor >= slots.length) {
      slots.push(key);
      cursor += 1;
      continue;
    }
    slots[cursor] = key;
    cursor += 1;
  }
  return slots;
}

function dateLabel(date: string | null): string {
  if (!date) return "";
  return `${formatShort(date)} ${weekdayKo(date)}`;
}

/** A26: 완료한 할 일의 기록 줄 — 끝낸 날(없으면 잡아 둔 날)에 시간이 있으면 시간까지 붙입니다. */
function recordDateLabel(task: ProjectTask): string {
  const day = dateLabel(task.doneAt?.slice(0, 10) ?? task.date);
  const time = timeRangeLabel(task.startTime, task.endTime);
  return time ? `${day} ${time}` : day;
}

/** The date a task row shows, plus its 시작~종료 when that date is the task's own day. */
function taskDateLabel(task: ProjectTask): string {
  const shown = task.due ?? task.date;
  if (!shown) return "";
  const day = dateLabel(shown);
  const time = shown === task.date ? timeRangeLabel(task.startTime, task.endTime) : "";
  return time ? `${day} ${time}` : day;
}

/** A40: 카드의 '기록' 순서 — 완료한 날, 취소한 날, 마지막으로 고친 때 순. */
function finishedAt(task: ProjectTask): string | null {
  return task.doneAt ?? task.cancelAt ?? task.updatedAt ?? null;
}


export function ProjectsTab() {
  const { data, update, setRoutineCount, create } = useData();
  const { settings, set: setSetting, addCategory, removeCategory } = useSettings();
  // A16: filters and pickers share one 분류 list, so a new one shows up everywhere.
  const categoryOptions = useCategoryOptions();
  const { focus, clearFocus, openTrash, views, setView: setTabView, openTaskDraft, notify } = useUi();

  // A15: tracks / priority / history is kept in the shared UI state for 뒤로 가기.
  const view = ((views.projects || "tracks") as ProjectView);
  const setView = (next: ProjectView) => setTabView("projects", next);
  /**
   * A12/A41: 3·4·5 cards per row — the user picks how wide each card reads.
   * 배치(칸 좌표)도 같은 곳에 남겨, 새로 고쳐도 카드가 제자리에 있습니다.
   */
  const [layout, setLayout] = useState<SlotLayout>(() => readSlotLayout());
  const cols = layout.cols;
  const saveLayout = (next: SlotLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(SLOT_KEY, JSON.stringify(next));
      window.localStorage.setItem(COLS_KEY, String(next.cols));
    } catch {
      /* 저장 공간이 없으면 이번 화면에서만 유지됩니다. */
    }
  };
  // A6: 전체(all) is the default filter on every device.
  const [mode, setMode] = useState<ModeFilter>("all");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  /** A39: 프로젝트 탭의 `일정` 카드 서랍과, 그 안에서 열리는 일정 상세. */
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  // A30: 새 할 일·프로젝트 창은 앱 공통 플로팅 창(ui 상태)에서 열어, 뒤 화면을 보거나 탭을 옮겨도 유지됩니다.
  const [routineId, setRoutineId] = useState<string | null>(null);
  /** A24: 우선순위 탭에만 걸리는 기간 — 다른 보기를 다녀와도 이 화면에서만 유지됩니다. */
  const [priorityRange, setPriorityRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState<TaskCategory>("개인");
  const [busy, setBusy] = useState(false);
  /** A41: 카드 자체를 끌고 있는 동안 — 빈 칸을 눈에 보이게 합니다. */
  const [cardDragging, setCardDragging] = useState<string | null>(null);
  /**
   * A4: the open detail registers its save-and-validate step here, so tapping another
   * task in the right list stores what changed before the centre swaps.
   */
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const registerFlush = (flush: (() => Promise<boolean>) | null) => {
    flushRef.current = flush;
  };

  const openTask = async (id: string) => {
    if (id === taskId) return;
    if (flushRef.current) {
      const ok = await flushRef.current();
      if (!ok) return;
    }
    setTaskId(id);
  };

  useEffect(() => {
    if (!focus) return;
    if (focus.resource === "projects") {
      const item = data.projects.find((task) => task.id === focus.id);
      if (item) {
        if (item.kind === "프로젝트") setProjectId(item.id);
        else void openTask(item.id);
      }
    }
    if (focus.resource === "routines") setRoutineId(focus.id);
    clearFocus();
  }, [focus, data.projects, clearFocus]);

  useEffect(() => {
    if (mode !== "now" && mode !== "all" && mode !== "custom") setQuickCategory(categoryNameOf(mode) as TaskCategory);
  }, [mode]);

  useTabReset("projects", () => {
    setView("tracks");
    setMode("all");
    setProjectId(null);
    setTaskId(null);
    setRoutineId(null);
    setQuickTitle("");
    setScheduleOpen(false);
    setEventId(null);
  });

  /**
   * A6/A7: projects in History leave the working list, NOW and the new-task choices.
   * A7: 미완료 묶음 → 완료 묶음, oldest first inside each group; `sort` wins when set.
   */
  const projects = useMemo(() => {
    const list = data.projects.filter(
      (task) =>
        task.kind === "프로젝트" &&
        !task.trash &&
        !task.history &&
        (!settings.nowOnly || !task.hidden) &&
        matchesMode(mode, task, task.category),
    );
    const done = (task: ProjectTask) => task.status === "완료" || task.status === "취소";
    return [...list].sort((a, b) => {
      if (done(a) !== done(b)) return done(a) ? 1 : -1;
      if (a.sort !== null && b.sort !== null && a.sort !== b.sort) return a.sort - b.sort;
      if (a.sort !== null && b.sort === null) return -1;
      if (a.sort === null && b.sort !== null) return 1;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }, [data.projects, mode, settings.nowOnly]);
  const hiddenProjectIds = useMemo(
    () => data.projects.filter((project) => project.kind === "프로젝트" && project.hidden).map((project) => project.id),
    [data.projects],
  );
  const tasks = useMemo(
    () =>
      data.projects.filter(
        (task) =>
          task.kind === "할 일" &&
          (!settings.nowOnly || (!task.hidden && !task.projectIds.some((id) => hiddenProjectIds.includes(id)))) &&
          matchesMode(mode, task, task.category),
      ),
    [data.projects, mode, settings.nowOnly, hiddenProjectIds],
  );
  const routines = useMemo(
    () =>
      data.routines.filter(
        (routine) =>
          routine.kind === "루틴" &&
          !routine.history &&
          (!settings.nowOnly || !routine.hidden) &&
          matchesMode(mode, routine, routine.category),
      ),
    [data.routines, mode, settings.nowOnly],
  );

  /**
   * A27: 루틴은 분류별로 카드를 나누지 않고, 지금 필터를 통과한 전체 목록을 순서대로
   * 세 개씩 묶어 카드로 보여 줍니다 — 네 번째 루틴부터 잘려 보이지 않게.
   */
  const orderedRoutines = useMemo(
    () =>
      [...routines].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.createdAt.localeCompare(b.createdAt),
      ),
    [routines],
  );
  const routineChunks = useMemo(() => {
    const chunks: Routine[][] = [];
    for (let i = 0; i < orderedRoutines.length; i += ROUTINES_PER_CARD) {
      chunks.push(orderedRoutines.slice(i, i + ROUTINES_PER_CARD));
    }
    return chunks;
  }, [orderedRoutines]);

  /** A41: 지금 있는 카드의 키 — 일정 하나(켜져 있을 때), 프로젝트마다 하나, 루틴 묶음마다 하나. */
  const cardKeys = useMemo(
    () => [
      ...(settings.showScheduleCard ? ["schedule"] : []),
      ...projects.map((project) => `p:${project.id}`),
      ...routineChunks.map((_, index) => `r:${index}`),
    ],
    [settings.showScheduleCard, projects, routineChunks],
  );
  /** 카드가 모자라지 않을 만큼의 줄 — 저장한 줄이 더 많으면 그대로 둡니다. */
  const rows = Math.max(layout.rows, Math.ceil((cardKeys.length + 1) / cols), 1);
  const slots = useMemo(() => buildSlots(layout.cells, rows, cols, cardKeys), [layout.cells, rows, cols, cardKeys]);
  /** 마지막 줄이 통째로 비었는지 — `빈 줄 접기`를 보여 줄지 정합니다. */
  const lastRowEmpty = slots.every((key, index) => index < (rows - 1) * cols || key === null);

  /** A41: 칸 수를 바꾸면 같은 줄·열에 최대한 남도록 옮겨 적습니다. */
  const pickCols = (next: SlotCols) => {
    if (next === layout.cols) return;
    const nextRows = Math.max(layout.rows, Math.ceil((cardKeys.length + 1) / next));
    saveLayout({ cols: next, rows: nextRows, cells: remapCells(layout.cells, layout.cols, next) });
    notify(`${next}칸 보기로 했습니다`);
  };

  /** A41: 한 줄 더 — 빈 줄까지 원하는 만큼 늘려 카드를 내려 놓을 수 있습니다. */
  const addRow = () => {
    saveLayout({ ...layout, rows: rows + 1 });
    notify("카드 줄을 하나 더했습니다");
  };
  /** A41: 마지막 줄이 비어 있으면 접습니다. */
  const trimRow = () => {
    if (rows <= 1 || !lastRowEmpty) return;
    saveLayout({ ...layout, rows: rows - 1 });
    notify("빈 줄을 접었습니다");
  };

  const openTasks = tasks.filter((task) => !task.trash && task.status !== "완료" && task.status !== "취소" && !task.history);
  /**
   * A36: index 카드도 프로젝트 카드와 같은 규격으로 — 같은 정렬(남은 일은 날짜순, 기록은 최근 것부터)을
   * 거친 목록에서 남은 할 일과 완료한 할 일을 나눕니다. 히스토리로 보낸 항목은 index 몫이 아닙니다.
   */
  const indexChildren = sortProjectTaskList(
    tasks.filter((task) => !task.trash && !task.history && task.projectIds.length === 0),
    settings.projectTaskOrder,
  );
  const indexOpen = indexChildren.filter((task) => task.status !== "완료" && task.status !== "취소");
  /** A40: 완료와 취소는 함께 '기록' 영역에 — 끝낸 날(없으면 취소한 날·최근 수정) 순서. */
  const indexCompleted = indexChildren
    .filter((task) => task.status === "완료" || task.status === "취소")
    .sort((a, b) => (finishedAt(b) ?? "").localeCompare(finishedAt(a) ?? ""));
  /** A36: '완료 보기'를 켜면 index 카드도 완료한 할 일만 보여 줍니다(프로젝트 카드와 같게). */
  const indexDoneOnly = settings.showCompletedTasks;
  const indexPreview = indexDoneOnly ? indexCompleted : indexOpen;
  /** A19/A36: '최근 기록'은 토글과 상관없이 늘 보이고, 최근 두 개까지. */
  const indexRecent = indexDoneOnly ? [] : indexCompleted.slice(0, RECENT_LOG_MAX);
  const projectCount = data.projects.filter((task) => task.kind === "프로젝트" && !task.trash && task.status !== "완료" && task.status !== "취소").length;

  /**
   * A38: index 카드도 프로젝트 카드처럼 누르면 서랍이 열립니다. 카드 안의 체크박스·할 일 이름·
   * '+ 할 일' 입력창·최근 기록 같은 버튼과 입력은 그 일만 하고, 카드 열기로 번지지 않습니다.
   */
  const openIndexDrawerFromCard = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, label, form")) return;
    setProjectId(INDEX_DRAWER_ID);
  };

  /**
   * A40: 취소한 항목은 완료로 바꾸지 않습니다 — 누르면 그대로 두고, 되돌리기는 상세에서 합니다.
   * (완료 ↔ 미완료 토글은 예전 그대로.)
   */
  const toggleTask = (task: ProjectTask) => {
    if (task.status === "취소") return;
    void update("projects", task.id, {
      status: task.status === "완료" ? "미완료" : "완료",
      doneAt: task.status === "완료" ? null : todayISO(),
    });
  };

  /** A39/A40: 일정 카드·서랍에서 한 번 눌러 완료/해제. 취소한 일정은 그대로 둡니다. */
  const toggleEventDone = (event: CalendarEvent) => {
    if (event.canceled) return;
    void update("calendar", event.id, { done: !event.done });
  };

  /** A39: `+ 일정` 빠른 입력 — 오늘 종일 일정으로 담고, 분류는 기본 '개인'. */
  const createEventQuick = async (title: string) => {
    await create("calendar", { title, kind: "일정", category: "개인", date: todayISO(), allDay: true });
  };

  /** A39: 서랍에서 담는 일정 — 서랍의 분류 필터를 그대로 따릅니다. */
  const createEventInDrawer = async (title: string, category: string) => {
    await create("calendar", { title, kind: "일정", category, date: todayISO(), allDay: true });
  };

  /**
   * A41: 카드 자체를 끌어 격자 칸(슬롯)으로 옮깁니다. 카드는 dnd 의 포인터 시스템을 함께 써서
   * 마우스·손가락 모두 같은 방식으로 옮깁니다(HTML5 드래그는 손가락에서 동작하지 않습니다).
   * index 카드는 1행 1열에 고정이라 끌지 않고, 빈 칸이든 카드가 있는 칸이든 그 자리로 갑니다.
   * 카드가 있는 칸에 놓으면 두 카드의 자리를 맞바꿉니다.
   */
  const moveCard = (dragKey: string, targetSlot: number) => {
    if (targetSlot <= INDEX_SLOT || targetSlot >= slots.length) return;
    const from = slots.indexOf(dragKey);
    const occupant = slots[targetSlot] ?? null;
    if (from === targetSlot || occupant === dragKey) return;
    const cells = { ...layout.cells };
    cells[dragKey] = targetSlot;
    if (occupant && occupant !== "index") cells[occupant] = from > 0 ? from : targetSlot;
    saveLayout({ cols: layout.cols, rows: Math.max(layout.rows, rows), cells });
    if (occupant) notify(`${cardLabelOf(dragKey)} 카드와 ${cardLabelOf(occupant)} 카드의 자리를 바꿨습니다`);
    else notify(`${cardLabelOf(dragKey)} 카드를 ${Math.floor(targetSlot / cols) + 1}줄 ${(targetSlot % cols) + 1}칸으로 옮겼습니다`);
  };

  const cardLabelOf = (key: string) => {
    if (key === "schedule") return "일정";
    if (key.startsWith("p:")) return projects.find((project) => project.id === key.slice(2))?.title ?? "프로젝트";
    if (key.startsWith("r:")) return "루틴";
    return "카드";
  };

  /** 카드 안의 버튼·체크박스·할 일 줄은 각자 할 일을 하도록 카드 끌기에서 뺍니다. */
  const startCardDrag = (key: string) => (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, label, form, a, [data-task-id], [data-schedule-event], [data-routine-day], [data-routine-now], [data-nodrag]")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    /** 끌고 있는 카드가 놓일 칸 — 빈 칸이면 그 칸, 카드 위면 그 카드의 칸입니다. */
    const slotOfTarget = (dropTarget: { zone: string; data: Record<string, string> }): number | null => {
      if (dropTarget.zone === "card-slot") {
        const value = Number(dropTarget.data.slot ?? "");
        return Number.isFinite(value) ? value : null;
      }
      let targetKey: string | null = null;
      if (dropTarget.zone === "schedule-card") targetKey = "schedule";
      else if (dropTarget.zone === "routine-card") targetKey = `r:${dropTarget.data.routineCard ?? ""}`;
      else if (dropTarget.zone === "project-card" && dropTarget.data.project && dropTarget.data.project !== "index") {
        targetKey = `p:${dropTarget.data.project}`;
      }
      if (!targetKey) return null;
      const at = slots.indexOf(targetKey);
      return at < 0 ? null : at;
    };
    dnd.start(
      event,
      { kind: "card", id: key, label: cardLabelOf(key) },
      (dropTarget) => {
        setCardDragging(null);
        if (!dropTarget) return;
        const targetSlot = slotOfTarget(dropTarget);
        if (targetSlot === null) return;
        moveCard(key, targetSlot);
      },
      {
        onStart: () => setCardDragging(key),
        onEnd: () => setCardDragging(null),
        getHint: (dropTarget) => {
          const targetSlot = slotOfTarget(dropTarget);
          if (targetSlot === null) return null;
          if (targetSlot === INDEX_SLOT) return null;
          return `${Math.floor(targetSlot / cols) + 1}줄 ${(targetSlot % cols) + 1}칸으로 옮기기`;
        },
      },
    );
  };

  /**
   * A25: 카드 사이로 할 일을 끌어 옮깁니다 — 드롭한 카드의 프로젝트로 바로 바뀌고,
   * index 카드에 놓으면 분류 없음(projectIds 빈 값)으로 돌아갑니다.
   * store 의 update 가 먼저 화면을 바꾸고 PATCH 하며, 실패하면 원래 값으로 되돌리고 알립니다.
   */
  const moveTaskToCard = (taskId: string, project: ProjectTask | null) => {
    const task = data.projects.find((item) => item.id === taskId);
    if (!task || task.kind !== "할 일") return;
    const targetIds = project ? [project.id] : [];
    const currentIds = task.projectIds ?? [];
    if (currentIds.length === targetIds.length && currentIds.every((id, index) => id === targetIds[index])) return;
    void update("projects", taskId, {
      projectIds: targetIds,
      // 프로젝트의 분류를 따라가면 카드 색·필터가 어긋나지 않습니다(index 로 뺄 때는 그대로).
      ...(project ? { category: project.category } : {}),
    });
  };

  /** 드롭 대상 카드 강조 — 카드 안 자식 사이를 오갈 때 깜빡이지 않게 깊이를 셉니다. */
  const dnd = useDnd();
  /** A39: 일정 ↔ 할 일 변환(다른 DB 로 새로 만든 뒤 원래 항목 정리). */
  const { eventToTask, taskToEvent } = useConvert();

  /** 카드에 놓일 때 안내에 쓰는 이름 — index 카드는 그대로 `index`. */
  const projectTitleOf = (key: string | undefined | null) => {
    if (!key || key === "index") return "index";
    return projects.find((project) => project.id === key)?.title ?? "index";
  };

  /** 일정 카드 안의 일정을 프로젝트 카드에 놓으면 그 프로젝트의 할 일로 바꿉니다. */
  const dropEventOnCard = (droppedId: string, key: string | undefined | null) => {
    void eventToTask(droppedId, { projectId: key && key !== "index" ? key : null });
  };

  /** 할 일을 일정 카드에 놓으면 캘린더 일정으로 바꿉니다(정해 둔 날짜·시각 유지). */
  const dropTaskOnSchedule = (droppedId: string) => {
    const task = data.projects.find((item) => item.id === droppedId);
    void taskToEvent(droppedId, { date: task?.date ?? todayISO() });
  };

  /**
   * A39: 카드 사이 드래그를 손가락(모바일)에서도 할 수 있게 dnd.tsx 의 포인터/터치 시스템을
   * 씁니다. 마우스는 기존 HTML5 드래그가 그대로 맡고, 여기서는 손가락·펜만 시작합니다
   * (둘 다 시작하면 한 번의 끌기가 두 번 처리될 수 있습니다).
   */
  const startTaskPointerDrag = (pointerEvent: React.PointerEvent<HTMLElement>, task: ProjectTask) => {
    if (pointerEvent.pointerType === "mouse") return;
    dnd.start(
      pointerEvent,
      { kind: "task", id: task.id, label: task.title },
      (target) => {
        if (!target) return;
        if (target.zone === "schedule-card") {
          dropTaskOnSchedule(task.id);
          return;
        }
        if (target.zone === "project-card") {
          const key = target.data.project;
          if (!key || key === "index") {
            moveTaskToCard(task.id, null);
            return;
          }
          const project = projects.find((item) => item.id === key);
          if (project) moveTaskToCard(task.id, project);
        }
      },
      {
        getHint: (target) => {
          if (target.zone === "schedule-card") return "일정으로 옮기기";
          if (target.zone === "project-card") return `${projectTitleOf(target.data.project)}로 옮기기`;
          return null;
        },
      },
    );
  };

  const startEventPointerDrag = (pointerEvent: React.PointerEvent<HTMLElement>, event: CalendarEvent) => {
    if (pointerEvent.pointerType === "mouse") return;
    dnd.start(
      pointerEvent,
      { kind: "event", id: event.id, label: event.title },
      (target) => {
        if (!target) return;
        if (target.zone === "project-card") dropEventOnCard(event.id, target.data.project);
      },
      {
        getHint: (target) =>
          target.zone === "project-card" ? `${projectTitleOf(target.data.project)} 할 일로 옮기기` : null,
      },
    );
  };

  const dragDepth = useRef(0);
  const [dropCard, setDropCard] = useState<string | null>(null);
  /** A45: 서래 안 할 일을 끄는 동안 서래·배경을 감춥니다. */
  const [drawerDragHidden, setDrawerDragHidden] = useState(false);
  const clearDrop = () => {
    dragDepth.current = 0;
    setDropCard(null);
  };
  const dropProps = (
    key: string,
    taskDrop: (taskId: string) => void,
    projectDrop?: (event: React.DragEvent<HTMLElement>) => void,
    /** A39: 일정 카드에서 끌어온 일정을 이 카드에 놓으면 그 프로젝트의 할 일이 됩니다. */
    eventDrop?: (droppedId: string) => void,
  ) => ({
    onDragEnter: (event: React.DragEvent<HTMLElement>) => {
      const types = event.dataTransfer.types;
      if (!types.includes("text/diary-task") && !(eventDrop && types.includes("text/diary-event"))) return;
      dragDepth.current += 1;
      setDropCard(key);
    },
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      const types = event.dataTransfer.types;
      // preventDefault 없이는 브라우저가 drop 을 보내지 않습니다(프로젝트 순서 변경 드롭도 여기로).
      if (!types.includes("text/diary-task") && !types.includes("text/diary-project") && !(eventDrop && types.includes("text/diary-event"))) return;
      event.preventDefault();
      if (!types.includes("text/diary-task") && !(eventDrop && types.includes("text/diary-event"))) return;
      event.dataTransfer.dropEffect = "move";
      if (dropCard !== key) setDropCard(key);
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      const types = event.dataTransfer.types;
      if (!types.includes("text/diary-task") && !(eventDrop && types.includes("text/diary-event"))) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropCard((current) => (current === key ? null : current));
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      const droppedTask = event.dataTransfer.getData("text/diary-task");
      const droppedEvent = eventDrop ? event.dataTransfer.getData("text/diary-event") : "";
      clearDrop();
      if (droppedTask) {
        event.preventDefault();
        event.stopPropagation();
        taskDrop(droppedTask);
        return;
      }
      if (droppedEvent) {
        event.preventDefault();
        event.stopPropagation();
        eventDrop?.(droppedEvent);
        return;
      }
      projectDrop?.(event);
    },
    onDragEnd: clearDrop,
  });

  /**
   * A39: `일정` 카드는 할 일을 받아 일정으로 바꿉니다(마우스 = HTML5, 손가락 = dnd.tsx).
   * 카드 안의 일정을 다시 자기 위에 놓는 것은 아무 것도 바꾸지 않습니다.
   */
  const scheduleDropProps = {
    onDragEnter: (event: React.DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes("text/diary-task")) return;
      dragDepth.current += 1;
      setDropCard("schedule");
    },
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes("text/diary-task")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dropCard !== "schedule") setDropCard("schedule");
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes("text/diary-task")) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropCard((current) => (current === "schedule" ? null : current));
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      const droppedTask = event.dataTransfer.getData("text/diary-task");
      clearDrop();
      if (!droppedTask) return;
      event.preventDefault();
      event.stopPropagation();
      dropTaskOnSchedule(droppedTask);
    },
    onDragEnd: clearDrop,
  };

  /** A27: 루틴 순서 변경도 카드 경계를 넘어 전체 목록 기준으로 `sort` 를 다시 적습니다. */
  const reorderRoutines = (dragId: string, targetId: string) => {
    if (!dragId || !targetId || dragId === targetId) return;
    const ids = orderedRoutines.map((routine) => routine.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    ids.forEach((routineId, position) => {
      const routine = orderedRoutines.find((item) => item.id === routineId);
      if (routine && routine.sort !== (position + 1) * 10) {
        void update("routines", routineId, { sort: (position + 1) * 10 });
      }
    });
  };

  const addQuick = async () => {
    if (!quickTitle.trim() || busy) return;
    setBusy(true);
    await create("projects", {
      title: quickTitle.trim(),
      kind: "할 일",
      category: quickCategory,
      status: "미완료",
      date: todayISO(),
    });
    setQuickTitle("");
    setBusy(false);
  };

  /**
   * A41: 칸 하나에 놓일 카드 — 일정·프로젝트·루틴 카드를 키로 그립니다.
   * 빈 칸은 놓을 자리만 만들고, index 카드는 1행 1열에 고정입니다.
   */
  const renderCard = (key: string) => {
              if (key === "schedule") {
                return (
                  <ScheduleCard
                    key="schedule"
                    events={data.calendar}
                    nowOnly={settings.nowOnly}
                    showCompleted={settings.showCompletedTasks}
                    previewCount={settings.projectTaskPreview}
                    highlight={dropCard === "schedule"}
                    open={scheduleOpen}
                    dropProps={scheduleDropProps}
                    onOpenDrawer={() => setScheduleOpen(true)}
                    onOpenEvent={(id) => setEventId(id)}
                    onToggleDone={toggleEventDone}
                    onCreate={(title) => void createEventQuick(title)}
                    onPointerDragStart={startEventPointerDrag}
                    onCardPointerDown={startCardDrag("schedule")}
                    onDragStartEvent={(dragEvent, item) => {
                      dragEvent.dataTransfer.setData("text/diary-event", item.id);
                      dragEvent.dataTransfer.effectAllowed = "move";
                    }}
                  />
                );
              }
              if (key.startsWith("p:")) {
                const project = projects.find((item) => item.id === key.slice(2));
                if (!project) return null;
                return (
                  <ProjectCard
                    key={key}
                    project={project}
                    tasks={tasks}
                    onOpenProject={setProjectId}
                    onOpenTask={(id) => void openTask(id)}
                    onToggleTask={toggleTask}
                    onCreateTask={(target) =>
                      openTaskDraft({ kind: "할 일", category: target.category, projectId: target.id })
                    }
                    onPointerDragStart={startTaskPointerDrag}
                    onCardPointerDown={startCardDrag(key)}
                    drag={{
                      highlight: dropCard === project.id,
                      ...dropProps(
                        project.id,
                        (taskId) => moveTaskToCard(taskId, project),
                        undefined,
                        (droppedId) => dropEventOnCard(droppedId, project.id),
                      ),
                    }}
                  />
                );
              }
              if (key.startsWith("r:")) {
                const chunkIndex = Number(key.slice(2));
                const chunk = routineChunks[chunkIndex];
                if (!chunk || chunk.length === 0) return null;
                const first = chunkIndex * ROUTINES_PER_CARD + 1;
                const last = first + chunk.length - 1;
                return (
                  <RoutineCard
                    key={key}
                    chunkIndex={chunkIndex}
                    chunk={chunk}
                    first={first}
                    last={last}
                    total={orderedRoutines.length}
                    totalChunks={routineChunks.length}
                    routines={data.routines}
                    weekStartsOn={settings.weekStartsOn}
                    onCardPointerDown={startCardDrag(key)}
                    onOpenRoutine={setRoutineId}
                    onCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
                    onReorderRoutine={reorderRoutines}
                    onToggleNow={(routine) => {
                      writeRoutineNow(routine.id, !routine.hidden);
                      void update("routines", routine.id, { hidden: !routine.hidden });
                    }}
                    onCreate={() => setRoutineId("new")}
                  />
                );
              }
    return null;
  };

  return (
    <div className="pb-24">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[calc(13.5px*var(--fs))] text-ink-400">
            진행 {projectCount} · 남은 할 일 {openTasks.length}
          </p>
          <h1 className="mt-1.5 text-[calc(20px*var(--fs))] font-semibold leading-none tracking-[-0.02em] text-ink-900 md:text-[calc(21px*var(--fs))]">프로젝트</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="seg-track">
            {(
              [
                { value: "tracks", label: "진행" },
                { value: "priority", label: "우선순위" },
                { value: "history", label: "기록" },
                { value: "journal", label: "히스토리" },
              ] as { value: ProjectView; label: string }[]
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setView(item.value)}
                className={cn("seg-item", view === item.value && "seg-item-active")}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openTrash("projects")}
            className="trash-btn inline-flex items-center gap-1 rounded-full px-2 py-1 text-[calc(14.5px*var(--fs))] text-ink-500 hover:bg-paper-200 hover:text-ink-800"
            aria-label="휴지통"
          >
            <TrashIcon size={13} /> 휴지통
          </button>

          <div className="seg-track hidden sm:inline-flex" aria-label="카드 칸 수">
            {([3, 4, 5] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => pickCols(option)}
                aria-pressed={cols === option}
                className={cn("seg-item", cols === option && "seg-item-active")}
              >
                {option}칸
              </button>
            ))}
          </div>

          <Switch
            checked={settings.showCompletedTasks}
            onChange={(next) => setSetting("showCompletedTasks", next)}
            label="완료한 일도 함께 보기"
          >
            완료 보기
          </Switch>

          {/* A16: NOW 전용 토글 — 켜면 NOW 숨김 항목만 가립니다. */}
          <Switch
            checked={settings.nowOnly}
            onChange={(next) => setSetting("nowOnly", next)}
            label="NOW 숨김만 보기"
            className="inline-flex items-center gap-2 text-[calc(14.5px*var(--fs))] text-ink-500"
          >
            NOW
          </Switch>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ModeChips
          mode={mode}
          onChange={setMode}
          categories={categoryOptions}
          onAddCategory={addCategory}
          onRemoveCategory={removeCategory}
        />
        <button
          type="button"
          onClick={() => openTaskDraft({ kind: "프로젝트", category: quickCategory })}
          className="ml-auto rounded-full bg-paper-200 px-3 py-1 text-[calc(15px*var(--fs))] font-medium text-ink-700 transition hover:bg-paper-300/70"
        >
          + new
        </button>
      </div>

      {view === "tracks" ? (
        <div className="mt-4 space-y-2">
          {/* A41: 진짜 격자 칸 — 빈 칸까지 포함해 어느 칸으로든 카드를 끌어 놓습니다.
              index 는 1행 1열 고정, 폰(1열)은 빈 칸을 건너뛰고 카드 순서대로만 깔립니다. */}
          <div className="slot-grid" style={{ "--slot-cols": cols } as React.CSSProperties}>
            {slots.map((slotKey, slotIndex) => {
              if (slotIndex === INDEX_SLOT) {
                return (
                  <div key="slot-index" data-card-slot={slotIndex} className="min-w-0">
            <article
              data-drop-card="index"
              data-index-card
              data-drop-zone="project-card"
              data-drop-project="index"
              {...dropProps("index", (taskId) => moveTaskToCard(taskId, null), undefined, (droppedId) => dropEventOnCard(droppedId, "index"))}
              onClick={openIndexDrawerFromCard}
              className={cn(
                "flex min-h-[10rem] cursor-pointer flex-col rounded-2xl border px-3.5 py-3 transition",
                dropCard === "index" ? "border-ink-300 bg-paper-200/60 ring-2 ring-ink-200" : "border-paper-300 hover:border-paper-400",
              )}
            >
              <header className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setProjectId(INDEX_DRAWER_ID)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  aria-label="index 열기"
                >
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-paper-200 text-ink-500">
                    <InboxIcon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[calc(17px*var(--fs))] font-semibold tracking-tight text-ink-900">index</span>
                    <span className="block truncate text-[calc(14px*var(--fs))] text-ink-500">아직 분류되지 않은 할 일</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setProjectId(INDEX_DRAWER_ID)}
                  className="flex-none text-ink-300 transition hover:text-ink-600"
                  aria-label="index 상세 열기"
                >
                  <ChevronRightIcon size={15} />
                </button>
              </header>
              <p className="mt-1.5 text-[calc(14px*var(--fs))] text-ink-500">
                {indexDoneOnly ? `완료·취소한 할 일 ${indexCompleted.length}` : `남은 할 일 ${indexOpen.length}`}
              </p>
              <ul className="mt-1 space-y-1.5">
                {indexPreview.slice(0, CARD_OPEN_PREVIEW).map((task) => (
                  <TaskLine
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task)}
                    onOpenDrawer={() => setProjectId(INDEX_DRAWER_ID)}
                    onEdit={() => void openTask(task.id)}
                    onPointerDragStart={startTaskPointerDrag}
                  />
                ))}
                {indexPreview.length === 0 ? (
                  <li className="text-[calc(14px*var(--fs))] text-ink-300">
                    {indexDoneOnly ? "완료한 할 일이 없습니다." : "비어 있습니다."}
                  </li>
                ) : null}
                {indexPreview.length > CARD_OPEN_PREVIEW ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => setProjectId(INDEX_DRAWER_ID)}
                      className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-500 transition hover:text-ink-700"
                    >
                      +{indexPreview.length - CARD_OPEN_PREVIEW}개 더 보기
                    </button>
                  </li>
                ) : null}
              </ul>

              <RecentLog logKey="index" tasks={indexRecent} onOpenDrawer={() => setProjectId(INDEX_DRAWER_ID)} onEdit={(id) => void openTask(id)} />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void addQuick();
                }}
                className="mt-auto pt-2"
              >
                <input
                  value={quickTitle}
                  onChange={(event) => setQuickTitle(event.target.value)}
                  placeholder="+ 할 일"
                  className="w-full rounded-lg bg-paper-200/70 px-2 py-1 text-[calc(14px*var(--fs))] text-ink-900 placeholder:text-ink-400 focus:bg-paper-200 focus:outline-none"
                />
              </form>
            </article>
                  </div>
                );
              }
              if (!slotKey) {
                return (
                  <div
                    key={`slot-empty-${slotIndex}`}
                    data-drop-zone="card-slot"
                    data-drop-slot={slotIndex}
                    data-card-slot={slotIndex}
                    aria-hidden
                    className={cn(
                      "hidden rounded-2xl border border-dashed transition lg:block",
                      cardDragging ? "min-h-[10rem] border-ink-300 bg-paper-200/40" : "border-paper-300/40",
                    )}
                  />
                );
              }
              return (
                <div key={slotKey} data-card-slot={slotIndex} className="min-w-0">
                  {renderCard(slotKey)}
                </div>
              );
            })}
          </div>

          {/* A41: 한 줄 더 내려 카드를 놓거나, 통째로 빈 마지막 줄을 접습니다. */}
          <div className="flex flex-wrap items-center gap-2" data-card-rows="true">
            <button
              type="button"
              data-card-add-row="true"
              onClick={addRow}
              className="rounded-full bg-paper-200 px-2.5 py-1 text-[calc(13.5px*var(--fs))] font-medium text-ink-500 transition hover:bg-paper-300/70 hover:text-ink-900"
            >
              + 줄 추가
            </button>
            {lastRowEmpty && rows > 1 ? (
              <button
                type="button"
                data-card-trim-row="true"
                onClick={trimRow}
                className="rounded-full px-2 py-1 text-[calc(13.5px*var(--fs))] text-ink-400 transition hover:text-ink-700"
              >
                빈 줄 접기
              </button>
            ) : null}
            <span className="ml-auto text-[calc(13px*var(--fs))] tabular-nums text-ink-300">
              {cols}칸 · {rows}줄 · 카드 {Math.max(0, slots.filter(Boolean).length - 1)}장
            </span>
          </div>
        </div>
      ) : null}

      {view === "priority" ? (
        <PriorityView
          tasks={data.projects.filter((task) => task.kind === "할 일" && !task.trash && matchesMode(mode, task, task.category))}
          projects={data.projects}
          previewCount={settings.priorityTaskPreview}
          onPreviewCount={(next) => setSetting("priorityTaskPreview", next)}
          range={priorityRange}
          onRange={setPriorityRange}
          onOpenTask={(id) => void openTask(id)}
          onOpenProject={setProjectId}
          onToggle={toggleTask}
          onCreateTask={(category, urgent, important) => {
            openTaskDraft({ kind: "할 일", category, urgent, important });
          }}
        />
      ) : null}

      {view === "history" ? (
        <HistoryView
          projects={data.projects.filter((task) => task.kind === "프로젝트")}
          tasks={data.projects.filter((task) => task.kind === "할 일")}
          events={data.calendar}
          routines={data.routines.filter((routine) => routine.kind === "루틴")}
          onOpenTask={(id) => void openTask(id)}
          onOpenProject={setProjectId}
          onOpenEvent={(id) => setEventId(id)}
          onOpenRoutine={setRoutineId}
          onRestoreTask={(task) => void update("projects", task.id, { status: "미완료", doneAt: null })}
          onRestoreRoutine={(routine) => void update("routines", routine.id, { history: false })}
          onRestoreProject={(project) => void update("projects", project.id, { status: "미완료", history: false })}
        />
      ) : null}

      {view === "journal" ? (
        <HistorySpace
          projects={data.projects.filter((task) => task.kind === "프로젝트")}
          tasks={data.projects.filter((task) => task.kind === "할 일")}
          routines={data.routines.filter((routine) => routine.kind === "루틴")}
          onOpenProject={setProjectId}
          onOpenTask={(id) => void openTask(id)}
          onOpenRoutine={setRoutineId}
          onToggleHidden={(project) => void update("projects", project.id, { hidden: !project.hidden })}
          onRestoreProject={(project) => void update("projects", project.id, { status: "미완료", history: false, hidden: false })}
          onRestoreTask={(task) => void update("projects", task.id, { status: "미완료", history: false, hidden: false })}
          onRestoreRoutine={(routine) => void update("routines", routine.id, { history: false, hidden: false })}
        />
      ) : null}

      <ProjectDrawer
        projectId={projectId}
        mode={mode}
        showBackdrop={taskId === null && !drawerDragHidden}
        onDragHiddenChange={setDrawerDragHidden}
        onClose={() => setProjectId(null)}
        onOpenTask={(id) => void openTask(id)}
        /* A42: 서랍에서 연 프로젝트 수정 창을 닫으면 서랍으로 돌아옵니다 — 서랍은 열어 둡니다. */
        onEditProject={(id) => void openTask(id)}
      />

      {/* A39: `일정` 카드를 누르면 열리는 서랍 — 전체/진행/완료 + 분류 필터. */}
      <ScheduleDrawer
        open={scheduleOpen}
        events={data.calendar}
        nowOnly={settings.nowOnly}
        onClose={() => setScheduleOpen(false)}
        onOpenEvent={(id) => setEventId(id)}
        onToggleDone={toggleEventDone}
        onCreate={(title, category) => void createEventInDrawer(title, category)}
      />

      <EventDetail
        open={eventId !== null}
        eventId={eventId}
        onBack={() => setEventId(null)}
        /* A42: X는 이 상세만 닫습니다 — 일정 서랍에서 들어왔으면 서랍으로 돌아갑니다. */
        onCloseDetail={() => setEventId(null)}
      />

      <TaskDetail
        open={taskId !== null}
        taskId={taskId}
        sideBySide={projectId !== null}
        onBack={() => setTaskId(null)}
        /* A42: X는 이 상세만 닫습니다 — 서랍은 서랍의 X로만 닫힙니다. */
        onCloseDetail={() => setTaskId(null)}
        registerFlush={registerFlush}
      />

      <RoutineEditor
        open={routineId !== null}
        routineId={routineId && routineId !== "new" ? routineId : null}
        onClose={() => setRoutineId(null)}
      />
    </div>
  );
}

/**
 * 프로젝트 카드 — 진행과 히스토리가 같은 규격으로 씁니다.
 * 배경은 프로젝트마다 자동으로 돌아가는 아주 옅은 파스텔입니다.
 */
function ProjectCard({
  project,
  tasks,
  mode = "track",
  onOpenProject,
  onOpenTask,
  onToggleTask,
  onCreateTask,
  onRestore,
  restoreLabel = "되살리기",
  drag,
  onPointerDragStart,
  onCardPointerDown,
}: {
  project: ProjectTask;
  tasks: ProjectTask[];
  mode?: "track" | "history";
  onOpenProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleTask: (task: ProjectTask) => void;
  onCreateTask?: (project: ProjectTask) => void;
  /** A39: 손가락으로 할 일을 끌기 시작할 때(카드·index·일정 사이 이동). */
  onPointerDragStart?: (event: React.PointerEvent<HTMLElement>, task: ProjectTask) => void;
  /** A40: 카드 자체를 끌어 순서 바꾸기(웹·모바일 공통). */
  onCardPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
  onRestore?: (project: ProjectTask) => void;
  /** 되살리기 / 보이기 — 히스토리에서 어떤 동작인지 */
  restoreLabel?: string;
  drag?: {
    draggable?: boolean;
    /** A25: 할 일을 이 카드 위로 끌어 왔을 때의 은은한 강조 */
    highlight?: boolean;
    onDragStart?: (event: React.DragEvent<HTMLElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLElement>) => void;
    onDragLeave?: (event: React.DragEvent<HTMLElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLElement>) => void;
    onDragEnd?: (event: React.DragEvent<HTMLElement>) => void;
  };
}) {
  const { update } = useData();
  const { highlight, ...dragProps } = drag ?? {};
  const { settings } = useSettings();
  const { pastelOf } = useProjectColors();
  const categoryColor = useCategoryColors();
  const pastel = pastelOf(project.id);
  const tone = categoryColor.toneOf(project.category, taskTone(project.category));
  // A28: 남은 할 일은 설정에서 고른 날짜 방향(기본 가까운 날짜순)으로, 완료 기록은 늘 아래에 최근 것부터.
  const children = sortProjectTaskList(
    tasks.filter((task) => !task.trash && task.projectIds.includes(project.id)),
    settings.projectTaskOrder,
  );
  const open = children.filter((task) => task.status !== "완료" && task.status !== "취소");
  const orderedOpen = open;
  /** A40: 완료·취소한 할 일 — 끝낸 날(없으면 취소한 날·최근 수정) 순서로 최근 것부터. */
  const completed = children
    .filter((task) => task.status === "완료" || task.status === "취소")
    .sort((a, b) => (finishedAt(b) ?? "").localeCompare(finishedAt(a) ?? ""));
  /** A19: '완료 보기'를 켜면 카드가 완료한 할 일만 보여 줍니다(히스토리 카드도 같은 규격). */
  const doneOnly = mode === "history" || (mode === "track" && settings.showCompletedTasks);
  /** 카드 한 장에 보여 줄 개수 — 설정(3~8)을 따릅니다. */
  const previewCount = Math.max(1, settings.projectTaskPreview);
  const previewList = doneOnly ? completed : orderedOpen;
  /** 기본 보기 아래 '최근 기록'은 토글과 상관없이 늘 보이고, 최근 두 개까지만 보여 줍니다. */
  const recent = doneOnly ? [] : completed.slice(0, RECENT_LOG_MAX);
  const last = [...children].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
  /** A48: 제목 옆 미니 진행률 — 완료·취소를 뺀 완료 비율. */
  const donePercent = children.length > 0 ? Math.round((completed.length / children.length) * 100) : 0;

  return (
    <article
      data-project-card={project.id}
      data-drop-card={mode === "track" ? project.id : undefined}
      data-drop-zone={mode === "track" ? "project-card" : undefined}
      data-drop-project={mode === "track" ? project.id : undefined}
      {...dragProps}
      onPointerDown={mode === "track" ? onCardPointerDown : undefined}
      /* A42: 카드 안의 제목·빈칸 어디를 눌러도 이 프로젝트 서랍이 먼저 열립니다.
         체크박스·연필·끌기는 각자 하던 일을 그대로 합니다. */
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, a, input, textarea, select, label, form")) return;
        onOpenProject(project.id);
      }}
      className={cn(
        "flex min-h-[10rem] flex-col rounded-2xl border px-3.5 py-3 transition",
        pastel.bg,
        pastel.border,
        mode === "track" ? "cursor-pointer hover:border-paper-400" : "cursor-pointer opacity-95",
        highlight && "border-ink-400 ring-2 ring-ink-200 ring-offset-1",
      )}
    >
      <header className="flex items-start gap-2">
        <span className={cn("flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-lg text-[calc(18px*var(--fs))]", pastel.bg)}>
          <ProjectIcon icon={project.icon} seed={project.id} category={project.category} className="h-full w-full" />
        </span>
        <button type="button" onClick={() => onOpenProject(project.id)} className="min-w-0 flex-1 text-left">
          {/* A48: 진행률은 제목과 같은 줄에 작게 — 카드 세로 높이가 늘지 않습니다. */}
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[calc(17px*var(--fs))] font-semibold tracking-tight text-ink-900">{project.title}</span>
            <span data-project-progress={project.id} className="flex flex-none items-center gap-1" title={`완료 ${donePercent}%`}>
              <span className="text-[calc(12px*var(--fs))] font-medium leading-none tabular-nums text-ink-500">{donePercent}%</span>
              <span
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={donePercent}
                aria-label={`${project.title} 완료율`}
                className="block h-[4px] w-[24px] overflow-hidden rounded-full bg-black/[0.09]"
              >
                <span className="block h-full rounded-full bg-sage-500 transition-all" style={{ width: `${donePercent}%` }} />
              </span>
            </span>
          </span>
          {/* A45: 제목 밑의 `~ 기록`(시작일) 문구를 지우고, 그 자리에 완료율 막대를 둘니다. */}
          {mode === "history" ? (
            <p className="truncate text-[calc(14px*var(--fs))] text-ink-500">
              {`${project.category} · ${project.history ? "History" : project.status}`}
            </p>
          ) : null}
        </button>
        {mode === "track" ? (
          <button
            type="button"
            onClick={(event) => {
              // A16: 카드에서 바로 NOW 숨김 켜기/끄기 — 카드가 열리지 않게 합니다.
              event.stopPropagation();
              void update("projects", project.id, { hidden: !project.hidden });
            }}
            className={cn(
              "flex-none rounded-full px-1.5 py-[1px] text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] transition",
              project.hidden ? "bg-ink-900 text-white" : "bg-white/70 text-ink-400 hover:bg-paper-200 hover:text-ink-700",
            )}
            aria-label={project.hidden ? `${project.title} NOW 숨김 해제` : `${project.title} NOW 숨기기`}
            aria-pressed={!!project.hidden}
            title={project.hidden ? "NOW 숨김 켜짐 — 누르면 다시 보입니다" : "NOW 숨김 켜기"}
          >
            NOW
          </button>
        ) : (
          <span className="flex-none rounded-full bg-white/70 px-1.5 py-[1px] text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] text-ink-500">
            {project.category}
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpenProject(project.id)}
          className="flex-none text-ink-300 transition hover:text-ink-600"
          aria-label="프로젝트 열기"
        >
          <ChevronRightIcon size={15} />
        </button>
      </header>

      <p className="mt-1.5 text-[calc(14px*var(--fs))] text-ink-500">
        {doneOnly ? `완료·취소한 할 일 ${completed.length}` : `남은 할 일 ${open.length}`}
      </p>
      <ul className="mt-1 space-y-1.5">
        {previewList.slice(0, previewCount).map((task) => (
          <TaskLine
            key={task.id}
            task={task}
            onToggle={() => onToggleTask(task)}
            onOpenDrawer={() => onOpenProject(project.id)}
            onEdit={() => onOpenTask(task.id)}
            onPointerDragStart={onPointerDragStart}
          />
        ))}
        {previewList.length === 0 ? (
          <li className="text-[calc(14px*var(--fs))] text-ink-400">
            {doneOnly ? "완료한 할 일이 없습니다." : "남은 할 일이 없습니다."}
          </li>
        ) : null}
        {previewList.length > previewCount ? (
          <li>
            <button
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-500 transition hover:text-ink-700"
            >
              +{previewList.length - previewCount}개 더 보기
            </button>
          </li>
        ) : null}
      </ul>

      <RecentLog logKey={project.id} tasks={recent} onOpenDrawer={() => onOpenProject(project.id)} onEdit={onOpenTask} />

      {mode === "history" ? (
        <button
          type="button"
          onClick={() => onRestore?.(project)}
          className="mt-auto pt-2 text-left text-[calc(14px*var(--fs))] text-ink-500 transition hover:text-ink-800"
        >
          {restoreLabel}
        </button>
      ) : (
        onCreateTask ? (
          <button
            type="button"
            onClick={() => onCreateTask(project)}
            className="mt-auto pt-1.5 text-left text-[calc(14px*var(--fs))] text-ink-400 transition hover:text-ink-700"
          >
            + 할 일
          </button>
        ) : null
      )}
    </article>
  );
}

/**
 * A36: 카드 아래 '최근 기록' — 완료한 할 일의 이름과 끝낸 날(시간이 있으면 시간까지)을 보여 주고,
 * 누르면 상세가 열립니다. 프로젝트 카드와 index 카드가 함께 씁니다.
 */
function RecentLog({
  logKey,
  tasks,
  onOpenDrawer,
  onEdit,
}: {
  logKey: string;
  tasks: ProjectTask[];
  /** A42: 기록 줄도 카드와 같게 — 누르면 서랍, 연필이면 바로 수정. */
  onOpenDrawer: () => void;
  onEdit: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div data-recent-log={logKey} className="mt-2 border-t border-black/[0.06] pt-1.5">
      <p className="text-[calc(13px*var(--fs))] text-ink-400">최근 기록</p>
      <ul className="mt-0.5 space-y-0.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenDrawer}
              className={cn(
                "min-w-0 flex-1 truncate text-left text-[calc(14px*var(--fs))]",
                task.status === "취소" ? "text-ink-600 line-through" : "text-ink-500",
              )}
            >
              {task.title}
            </button>
            {task.status === "취소" ? <CancelBadge /> : null}
            <span className="flex-none whitespace-nowrap text-[calc(13px*var(--fs))] tabular-nums text-ink-400">{recordDateLabel(task)}</span>
            <button
              type="button"
              data-task-edit={task.id}
              onClick={() => onEdit(task.id)}
              aria-label={`${task.title} 바로 수정`}
              title="바로 수정"
              className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-ink-300 transition hover:bg-white hover:text-ink-700"
            >
              <PencilIcon size={11} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A40: 취소 배지 — 예전 연한 회색보다 진하게, 목록 오른쪽에서도 바로 보이게. */
function CancelBadge({ className }: { className?: string }) {
  return (
    <span
      data-cancel-badge="true"
      className={cn(
        "flex-none rounded bg-ink-900/[0.12] px-1 text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] tracking-tight text-ink-800",
        className,
      )}
    >
      취소
    </span>
  );
}

function TaskLine({
  task,
  onToggle,
  onOpenDrawer,
  onEdit,
  onPointerDragStart,
}: {
  task: ProjectTask;
  onToggle: () => void;
  /** A42: 제목·빈칸을 누르면 이 카드의 서랍이 먼저 열립니다. */
  onOpenDrawer: () => void;
  /** A42: 연필을 눌렀을 때만 바로 수정(세부내역)으로. */
  onEdit?: () => void;
  onPointerDragStart?: (event: React.PointerEvent<HTMLElement>, task: ProjectTask) => void;
}) {
  const { update } = useData();
  const categoryColor = useCategoryColors();
  const done = task.status === "완료";
  const canceled = task.status === "취소";
  const priority = priorityOf(task);
  const tone = categoryColor.toneOf(task.category, taskTone(task.category));
  return (
    <li
      data-task-id={task.id}
      className="flex cursor-grab items-start gap-1.5 active:cursor-grabbing"
      draggable
      onDragStart={(event) => {
        // B6: dragging an inbox task only carries its id — the text, 기타 and body stay intact.
        event.dataTransfer.setData("text/diary-task", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      title="끌어서 프로젝트나 사분면으로 옮기기"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? "완료 취소" : "완료"}
        data-on={done ? "true" : undefined}
        className={cn(
          "chk mt-[3px] flex h-[16px] w-[16px] flex-none items-center justify-center rounded-[4px] border",
          done ? cn(tone.solid, "border-transparent text-white") : "border-paper-400 hover:border-ink-500",
        )}
      >
        {done ? <CheckIcon size={9} /> : null}
      </button>
      <button
        type="button"
        data-task-drag={task.id}
        onClick={onOpenDrawer}
        onPointerDown={(pointerEvent) => onPointerDragStart?.(pointerEvent, task)}
        className="min-w-0 flex-1 touch-manipulation select-none text-left"
      >
        <span className="flex items-center gap-1">
          {canceled ? <CancelBadge /> : null}
          <span
            className={cn(
              "truncate text-[calc(15.5px*var(--fs))] leading-[1.35] text-ink-900",
              (done || canceled) && "text-ink-400 line-through",
            )}
          >
            {task.title}
          </span>
          {priority !== "기타" ? (
            <span className={cn("flex-none rounded px-1 text-[calc(12.5px*var(--fs))] font-medium leading-4", PRIORITY_TONES[priority].badge)}>
              {PRIORITY_TONES[priority].label}
            </span>
          ) : null}
        </span>
      </button>
      <span className="flex-none text-[calc(13px*var(--fs))] tabular-nums text-ink-400">{taskDateLabel(task)}</span>
      {/* A42: 연필 — 이 항목만 바로 수정 창으로 직행합니다. */}
      {onEdit ? (
        <button
          type="button"
          data-task-edit={task.id}
          onClick={onEdit}
          aria-label={`${task.title} 바로 수정`}
          title="바로 수정"
          className="mt-[1px] flex h-5 w-5 flex-none items-center justify-center rounded-full text-ink-300 transition hover:bg-white hover:text-ink-700"
        >
          <PencilIcon size={11} />
        </button>
      ) : null}
    </li>
  );
}

function RoutineWeekRow({
  routine,
  routines,
  toneIndex,
  weekStartsOn,
  showCategory = false,
  onOpen,
  onCount,
  onToggleNow,
}: {
  routine: Routine;
  routines: Routine[];
  toneIndex: number;
  /** A40: 설정의 주 시작(일요일/월요일)을 루틴 요일 칸도 그대로 따릅니다. */
  weekStartsOn: 0 | 1;
  /** A27: 전체 루틴을 한 카드에 모아 보여 줄 때 어느 분류인지 작은 배지로 알려 줍니다. */
  showCategory?: boolean;
  onOpen: () => void;
  onCount: (date: string, count: number) => void;
  onToggleNow: () => void;
}) {
  const categoryColor = useCategoryColors();
  const weekStart = startOfWeekISO(todayISO(), weekStartsOn);
  /** A40: 요일 글자도 주 시작에 맞춰 돌립니다 — 일요일 시작이면 일·월·화 … */
  const weekdayLetters =
    weekStartsOn === 1 ? ["월", "화", "수", "목", "금", "토", "일"] : ["일", "월", "화", "수", "목", "금", "토"];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const target = routine.targetCount ?? 1;
  const doneCount = days.filter((day) => routineCountForDay(routines, routine, day) >= target).length;
  const tone = routineTone(toneIndex);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {showCategory ? (
          <span
            data-routine-category={routine.category}
            className={cn(
              "flex-none rounded bg-white/70 px-1 text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] tracking-tight",
              categoryColor.toneOf(routine.category, taskTone(routine.category)).text,
            )}
          >
            {routine.category}
          </span>
        ) : null}
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-[calc(14.5px*var(--fs))] text-ink-700 hover:text-ink-900">
          {routine.title}
        </button>
        {/* A42: 루틴은 따로 서랍이 없어 연필도 이 루틴의 수정 창으로 갑니다. */}
        <button
          type="button"
          data-routine-edit={routine.id}
          onClick={onOpen}
          aria-label={`${routine.title} 바로 수정`}
          title="바로 수정"
          className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-ink-300 transition hover:bg-white hover:text-ink-700"
        >
          <PencilIcon size={11} />
        </button>
        <span className="flex-none text-[calc(13.5px*var(--fs))] font-medium tabular-nums text-ink-700">
          {doneCount}/{days.length}
        </span>
        {/* A18: 한 줄짜리 NOW 토글 — 행을 열지 않고 바로 켜고 끕니다. */}
        <button
          type="button"
          data-routine-now={routine.id}
          onClick={(event) => {
            event.stopPropagation();
            onToggleNow();
          }}
          aria-pressed={!!routine.hidden}
          aria-label={routine.hidden ? `${routine.title} NOW 숨김 해제` : `${routine.title} NOW 숨기기`}
          title={routine.hidden ? "NOW 숨김 켜짐 — 누르면 다시 보입니다" : "NOW 숨김 켜기"}
          className={cn(
            "flex-none rounded-full px-1.5 py-[1px] text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] transition",
            routine.hidden ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-400 hover:bg-paper-300/70 hover:text-ink-700",
          )}
        >
          NOW
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        {days.map((day, index) => {
          const label = weekdayLetters[index]!;
          const scheduled = routine.repeatDays.length === 0 || routine.repeatDays.includes(weekdayKo(day));
          const count = routineCountForDay(routines, routine, day);
          const done = count >= target;
          return (
            <button
              key={day}
              type="button"
              data-routine-day={label}
              disabled={!scheduled}
              onClick={() => onCount(day, done ? 0 : count + 1)}
              /* 요일 동그라미는 손끝으로도 짚을 수 있게 키웁니다 — 카드 폭(4단 227px)에 일곱 개가 들어가는 한도 */
              className={cn(
                "relative flex h-[28px] w-[28px] touch-manipulation items-center justify-center rounded-full text-[calc(13.5px*var(--fs))] leading-none transition",
                done
                  ? cn(tone.solid, "font-semibold text-white")
                  : scheduled
                    ? "bg-paper-200 text-ink-500 hover:bg-paper-300"
                    : "bg-transparent text-ink-300/50",
              )}
            >
              <span>{label}</span>
              {count > 0 && !done ? (
                <span className="absolute -right-[3px] -top-[3px] rounded-full bg-ink-900 px-[3px] text-[calc(10.5px*var(--fs))] font-semibold leading-[0.8rem] text-white">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A40: 루틴 카드 — 프로젝트 카드와 같은 줄에서 끌어 옮길 수 있게 한 장으로 묶었습니다.
 * 카드 안의 루틴 줄은 예전처럼 끌어 전체 루틴 순서를 바꿉니다.
 */
function RoutineCard({
  chunk,
  chunkIndex,
  first,
  last,
  total,
  totalChunks,
  routines,
  weekStartsOn,
  onCardPointerDown,
  onOpenRoutine,
  onCount,
  onReorderRoutine,
  onToggleNow,
  onCreate,
}: {
  chunk: Routine[];
  chunkIndex: number;
  first: number;
  last: number;
  total: number;
  totalChunks: number;
  routines: Routine[];
  weekStartsOn: 0 | 1;
  onCardPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onOpenRoutine: (id: string) => void;
  onCount: (routine: Routine, date: string, count: number) => void;
  onReorderRoutine: (dragId: string, targetId: string) => void;
  onToggleNow: (routine: Routine) => void;
  onCreate: () => void;
}) {
  return (
    <article
      data-routine-card={chunkIndex}
      data-drop-zone="routine-card"
      data-routine-card-index={chunkIndex}
      onPointerDown={onCardPointerDown}
      className="rounded-2xl border border-paper-300 px-3 py-3"
    >
      <header className="flex items-start gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-paper-200 text-[calc(15px*var(--fs))]">
          <RepeatIcon size={14} className="text-ink-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[calc(17px*var(--fs))] font-semibold tracking-tight text-ink-900">루틴</p>
          {/* A27: 분류별로 나누지 않고 전체 목록을 순서대로 세 개씩 — 어디까지 보이는지 적습니다. */}
          <p data-routine-card-range={chunkIndex} className="truncate text-[calc(14px*var(--fs))] text-ink-500">
            {totalChunks === 1 ? `전체 · ${total}개` : `${first}~${last} · ${total}개`}
          </p>
        </div>
      </header>

      <div className="mt-2 space-y-2">
        {chunk.map((routine, index) => (
          <div
            key={routine.id}
            data-routine-row={routine.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/diary-routine", routine.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("text/diary-routine")) event.preventDefault();
            }}
            onDrop={(event) => {
              const id = event.dataTransfer.getData("text/diary-routine");
              if (!id || id === routine.id) return;
              event.preventDefault();
              // A27: 카드가 갈라져 있어도 전체 루틴 목록 기준으로 순서를 다시 적습니다.
              onReorderRoutine(id, routine.id);
            }}
          >
            <RoutineWeekRow
              routine={routine}
              toneIndex={index}
              weekStartsOn={weekStartsOn}
              routines={routines}
              showCategory
              onOpen={() => onOpenRoutine(routine.id)}
              onCount={(date, count) => onCount(routine, date, count)}
              onToggleNow={() => onToggleNow(routine)}
            />
          </div>
        ))}
      </div>

      <button type="button" onClick={onCreate} className="mt-2 text-[calc(14px*var(--fs))] text-ink-400 transition hover:text-ink-700">
        + 루틴
      </button>
    </article>
  );
}

/** 설정된 개수를 넘는 할 일은 `+N개 더 보기`로 펼칩니다 — 3~10개 사이에서 고릅니다. */
const PRIORITY_PREVIEW_MIN = 3;
const PRIORITY_PREVIEW_MAX = 10;

/**
 * A24: 우선순위 탭 — 사분면마다 기본으로 보여 줄 할 일 수(3~10)와 이 탭에만 걸리는
 * 기간(부터 ~ 까지)을 사용자가 고릅니다. 둘 다 이 화면 안에서만 쓰므로 진행·기록·히스토리
 * 탭의 목록은 그대로입니다.
 */
function PriorityView({
  tasks,
  projects,
  previewCount,
  onPreviewCount,
  range,
  onRange,
  onOpenTask,
  onOpenProject,
  onToggle,
  onCreateTask,
}: {
  tasks: ProjectTask[];
  projects: ProjectTask[];
  /** 사분면 하나에 기본으로 보여 줄 할 일 수 (3~10) — 설정에 저장돼 새로고침해도 남습니다. */
  previewCount: number;
  onPreviewCount: (next: number) => void;
  /** 우선순위 탭 전용 기간 — 비어 있으면 전체입니다. */
  range: { from: string; to: string };
  onRange: (next: { from: string; to: string }) => void;
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onToggle: (task: ProjectTask) => void;
  onCreateTask: (category: TaskCategory, urgent: boolean, important: boolean) => void;
}) {
  const { update } = useData();
  const { settings } = useSettings();
  const categoryColor = useCategoryColors();
  /** A40: 프로젝트 배지는 `진행` 탭 카드와 같은 프로젝트 색을 그대로 씁니다. */
  const { pastelOf } = useProjectColors();
  // A28: 사분면 안에서도 남은 할 일이 같은 날짜 방향을 따릅니다.
  const open = sortTasksByDate(
    tasks.filter((task) => task.status !== "완료" && task.status !== "취소"),
    settings.projectTaskOrder,
  );

  const { from, to } = range;
  /** 펼쳐 둔 사분면 key 목록 */
  const [expanded, setExpanded] = useState<string[]>([]);
  /**
   * A24: 날짜를 한 글자씩 치는 동안 반대쪽 칸을 몰래 고치지 않습니다 — 시작일이 종료일보다
   * 늦으면 기간을 잠시 풀고 아래에 다시 골라 달라고 적습니다.
   */
  const rangeInvalid = Boolean(from && to && from > to);
  const rangeActive = Boolean(from || to) && !rangeInvalid;
  const clearRange = () => {
    onRange({ from: "", to: "" });
    setExpanded([]);
  };

  /** 기간 비교에 쓰는 하루 — 화면에 보이는 날짜(마감일 우선)와 같습니다. */
  const dayOf = (task: ProjectTask) => (task.due ?? task.date ?? "").slice(0, 10);
  const inRange = (task: ProjectTask) => {
    if (!rangeActive) return true;
    const day = dayOf(task);
    // 날짜가 없는 할 일은 기간을 고르면 빠집니다 — 몇 개가 빠졌는지 아래에 적어 둡니다.
    if (!day) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };
  const shown = open.filter(inRange);
  const undated = rangeActive ? open.filter((task) => !dayOf(task)).length : 0;

  const preview = Math.max(PRIORITY_PREVIEW_MIN, Math.min(PRIORITY_PREVIEW_MAX, Math.round(previewCount)));
  const stepPreview = (delta: number) =>
    onPreviewCount(Math.max(PRIORITY_PREVIEW_MIN, Math.min(PRIORITY_PREVIEW_MAX, preview + delta)));

  const quadrants = [
    { key: "do", label: "긴급·중요", urgent: true, important: true },
    { key: "plan", label: "중요", urgent: false, important: true },
    { key: "delegate", label: "긴급", urgent: true, important: false },
    { key: "later", label: "기타", urgent: false, important: false },
  ] as const;

  const projectOf = (task: ProjectTask) => projects.find((project) => project.id === (task.projectIds[0] ?? "")) ?? null;

  const card = (quadrant: (typeof quadrants)[number]) => {
    const items = shown.filter((task) => task.urgent === quadrant.urgent && task.important === quadrant.important);
    const isExpanded = expanded.includes(quadrant.key);
    const visible = isExpanded ? items : items.slice(0, preview);
    const hidden = items.length - visible.length;
    return (
      <section
        data-quadrant={quadrant.key}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/diary-task")) event.preventDefault();
        }}
        onDrop={(event) => {
          const id = event.dataTransfer.getData("text/diary-task");
          if (!id) return;
          event.preventDefault();
          // B6: a quadrant drop changes 긴급·중요 only.
          void update("projects", id, { urgent: quadrant.urgent, important: quadrant.important });
        }}
        className="min-h-[10.5rem] rounded-xl border border-paper-300 px-3 py-2.5"
      >
        <header className="flex items-baseline gap-1.5">
          <h3 className={cn("rounded px-1 text-[calc(15px*var(--fs))] font-semibold leading-5", PRIORITY_TONES[quadrant.label].badge)}>
            {quadrant.label}
          </h3>
          <span data-quadrant-count={quadrant.key} className="text-[calc(14px*var(--fs))] text-ink-400">
            {items.length}
          </span>
        </header>

        <ul className="mt-1.5 space-y-1.5">
          {visible.map((task) => {
            const project = projectOf(task);
            const tone = categoryColor.toneOf(project?.category ?? task.category, taskTone(project?.category ?? task.category));
            // A10: a task with neither 긴급 nor 중요 is still unclassified — say so in small,
            // faint letters (기타 사분면 included), whether or not it already has a project.
            const unclassified = !task.urgent && !task.important;
            return (
              <li key={task.id} data-priority-task={task.id} className="flex items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggle(task)}
                  aria-label="완료"
                  className="mt-[2px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full border border-paper-400 hover:border-ink-500"
                >
                  {task.status === "완료" ? <CheckIcon size={9} /> : null}
                </button>
                <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-baseline gap-1.5">
                    <span className="truncate text-[calc(15px*var(--fs))] text-ink-800">{task.title}</span>
                    {unclassified ? (
                      <span className="flex-none text-[calc(12px*var(--fs))] font-normal leading-4 tracking-tight text-ink-300">분류 전</span>
                    ) : null}
                    {project ? (() => {
                      // A40: `진행` 탭 카드의 프로젝트 색(파스텔)과 똑같은 색의 배지.
                      const pastel = pastelOf(project.id);
                      return (
                        <span
                          data-priority-project={project.id}
                          className="flex flex-none items-center gap-1 rounded-full px-1.5 py-[1px] text-[calc(12.5px*var(--fs))] font-medium leading-[1.5] text-ink-700"
                          style={{ backgroundColor: `${pastel.line}26` }}
                        >
                          <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ backgroundColor: pastel.line }} />
                          <span className="max-w-[8rem] truncate">{project.title}</span>
                        </span>
                      );
                    })() : null}
                  </span>
                </button>
                <span className="flex-none text-[calc(13.5px*var(--fs))] tabular-nums text-ink-400">{taskDateLabel(task)}</span>
              </li>
            );
          })}
          {items.length === 0 ? (
            <li className="py-2 text-[calc(14px*var(--fs))] text-ink-300">
              {rangeActive ? "이 기간에 해당하는 할 일이 없습니다." : "비어 있습니다."}
            </li>
          ) : null}
          {hidden > 0 ? (
            <li>
              <button
                type="button"
                data-priority-more={quadrant.key}
                aria-expanded={false}
                onClick={() => setExpanded((current) => [...current, quadrant.key])}
                className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-400 transition hover:text-ink-700"
              >
                +{hidden}개 더 보기
              </button>
            </li>
          ) : null}
          {isExpanded && items.length > preview ? (
            <li>
              <button
                type="button"
                data-priority-less={quadrant.key}
                aria-expanded
                onClick={() => setExpanded((current) => current.filter((key) => key !== quadrant.key))}
                className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-400 transition hover:text-ink-700"
              >
                접기
              </button>
            </li>
          ) : null}
        </ul>

        <button
          type="button"
          onClick={() => onCreateTask("개인", quadrant.urgent, quadrant.important)}
          className="mt-1 w-full rounded-lg bg-paper-200/50 px-2 py-1 text-left text-[calc(14px*var(--fs))] text-ink-400 transition hover:bg-paper-200 hover:text-ink-700"
        >
          + 할 일
        </button>
      </section>
    );
  };

  return (
    <div className="mt-4" data-priority-view="true">
      {/* A24: 우선순위 탭 전용 도구줄 — 기간(부터~까지)과 사분면 표시 개수(3~10). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:flex-1" data-priority-range="true">
          <span className="hidden text-[calc(14px*var(--fs))] text-ink-500 sm:inline">기간</span>
          <input
            type="date"
            aria-label="시작일"
            data-priority-from="true"
            value={from}
            onChange={(event) => onRange({ from: event.target.value, to })}
            className="rounded-lg bg-paper-200 px-2 py-1 text-[calc(14px*var(--fs))] tabular-nums text-ink-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-paper-200"
          />
          <span className="text-[calc(14px*var(--fs))] text-ink-300">~</span>
          <input
            type="date"
            aria-label="종료일"
            data-priority-to="true"
            value={to}
            onChange={(event) => onRange({ from, to: event.target.value })}
            className="rounded-lg bg-paper-200 px-2 py-1 text-[calc(14px*var(--fs))] tabular-nums text-ink-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-paper-200"
          />
          <button
            type="button"
            data-priority-range-clear="true"
            onClick={clearRange}
            disabled={!from && !to}
            className={cn(
              "rounded-full px-2 py-1 text-[calc(13.5px*var(--fs))] transition",
              from || to ? "bg-paper-200 text-ink-600 hover:bg-paper-300/70 hover:text-ink-900" : "text-ink-300",
            )}
          >
            전체 보기
          </button>
        </div>

        <div
          className="ml-auto flex items-center gap-1.5 text-[calc(14px*var(--fs))] text-ink-500"
          data-priority-count-control="true"
          title="우선순위 사분면마다 처음에 보여 줄 할 일 개수입니다"
        >
          <span>표시</span>
          <div className="inline-flex items-center gap-0.5 rounded-full border border-paper-300 bg-paper-200 p-0.5">
            <button
              type="button"
              aria-label="표시 개수 줄이기"
              data-priority-preview-step="-1"
              onClick={() => stepPreview(-1)}
              disabled={preview <= PRIORITY_PREVIEW_MIN}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[calc(15px*var(--fs))] leading-none transition",
                preview <= PRIORITY_PREVIEW_MIN ? "text-ink-300" : "text-ink-600 hover:bg-white hover:text-ink-900",
              )}
            >
              −
            </button>
            <span data-priority-preview={preview} className="w-6 text-center text-[calc(14.5px*var(--fs))] font-semibold tabular-nums text-ink-800">
              {preview}
            </span>
            <button
              type="button"
              aria-label="표시 개수 늘리기"
              data-priority-preview-step="1"
              onClick={() => stepPreview(1)}
              disabled={preview >= PRIORITY_PREVIEW_MAX}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[calc(15px*var(--fs))] leading-none transition",
                preview >= PRIORITY_PREVIEW_MAX ? "text-ink-300" : "text-ink-600 hover:bg-white hover:text-ink-900",
              )}
            >
              +
            </button>
          </div>
          <span className="text-ink-400">개씩</span>
        </div>
      </div>

      {rangeInvalid ? (
        <p data-priority-range-invalid="true" className="mt-1.5 text-[calc(13.5px*var(--fs))] leading-relaxed text-rose-600">
          시작일이 종료일보다 늦습니다. 기간을 다시 골라 주세요 — 지금은 전체를 보여 줍니다.
        </p>
      ) : null}

      {rangeActive ? (
        <p data-priority-range-note="true" className="mt-1.5 text-[calc(13.5px*var(--fs))] leading-relaxed text-ink-400">
          {from ? formatShort(from) : "처음"} ~ {to ? formatShort(to) : "끝"} 기간의 할 일만 보는 중
          {undated > 0 ? ` · 날짜 없는 할 일 ${undated}개는 빠집니다` : ""}
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-2 pb-1.5 text-center text-[calc(14px*var(--fs))] text-ink-400">
            <span />
            <span>급함</span>
            <span>안 급함</span>
          </div>
          <div className="grid grid-cols-[2.2rem_1fr_1fr] gap-2">
            <div className="flex items-center justify-center text-[calc(14px*var(--fs))] text-ink-400">
              <span className="writing-vertical">중요</span>
            </div>
            {card(quadrants[0])}
            {card(quadrants[1])}
            <div className="flex items-center justify-center text-[calc(14px*var(--fs))] text-ink-400">
              <span className="writing-vertical">안 중요</span>
            </div>
            {card(quadrants[2])}
            {card(quadrants[3])}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A40: `기록` 탭의 목록 — 처음 다섯 개만 보여 주고, 더 있으면 `펼치기`로 전부 봅니다.
 * 모든 줄에 날짜(와 시간)를 함께 적습니다.
 */
function ShowMoreList<T>({
  items,
  initial = 5,
  empty,
  render,
  listKey,
}: {
  items: T[];
  initial?: number;
  empty: string;
  render: (item: T, index: number) => React.ReactNode;
  listKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return <p className="text-[calc(14.5px*var(--fs))] text-ink-400">{empty}</p>;
  const shown = expanded ? items : items.slice(0, initial);
  return (
    <>
      <ul data-history-list={listKey} className="divide-y divide-paper-300/60">
        {shown.map((item, index) => render(item, index))}
      </ul>
      {items.length > initial ? (
        <button
          type="button"
          data-history-more={listKey}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="mt-1.5 rounded-full bg-paper-200 px-2.5 py-1 text-[calc(13.5px*var(--fs))] font-medium text-ink-500 transition hover:bg-paper-300/70 hover:text-ink-900"
        >
          {expanded ? "접기" : `${items.length - initial}개 더 보기 · 펼치기`}
        </button>
      ) : null}
    </>
  );
}

/** A40: 완료·취소한 일정 한 줄 — 날짜와 시간을 늘 함께 적습니다. */
function HistoryEventRow({
  event,
  onOpen,
}: {
  event: CalendarEvent;
  onOpen: () => void;
}) {
  const canceled = event.canceled;
  return (
    <li data-history-event={event.id} className="flex items-center gap-2 py-1.5">
      <CheckIcon size={11} className={cn("flex-none", canceled ? "text-ink-400" : "text-sage-500")} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-[calc(15px*var(--fs))]", canceled ? "text-ink-600 line-through" : "text-ink-700")}>
          {event.title}
        </span>
        {canceled && event.cancelReason ? (
          <span className="block truncate text-[calc(13px*var(--fs))] text-ink-400">{event.cancelReason}</span>
        ) : null}
      </button>
      {canceled ? <CancelBadge /> : null}
      <span className="flex-none whitespace-nowrap text-[calc(13px*var(--fs))] tabular-nums text-ink-400">{scheduleDateLabel(event)}</span>
    </li>
  );
}

function HistoryView({
  projects,
  tasks,
  events,
  routines,
  onOpenTask,
  onOpenProject,
  onOpenEvent,
  onOpenRoutine,
  onRestoreTask,
  onRestoreRoutine,
  onRestoreProject,
}: {
  projects: ProjectTask[];
  tasks: ProjectTask[];
  events: CalendarEvent[];
  routines: Routine[];
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenRoutine: (id: string) => void;
  onRestoreTask: (task: ProjectTask) => void;
  onRestoreRoutine: (routine: Routine) => void;
  onRestoreProject: (project: ProjectTask) => void;
}) {
  /** 완료·취소·History·숨김까지 모두 카드로 보여 줍니다 (진행과 같은 규격). */
  const finishedProjects = projects.filter(
    (project) => !project.trash && (project.status === "완료" || project.status === "취소" || project.history || project.hidden),
  );
  const pastRoutines = routines.filter((routine) => routine.history || routine.trash);
  /** A40: 기록 탭에도 일정 — 완료하거나 취소한 일정을 최근 날짜부터 모읍니다. */
  const finishedEvents = events
    .filter((event) => event.kind === "일정" && !event.trash && (event.done || event.canceled))
    .sort((a, b) => (b.endDate ?? b.date ?? "").localeCompare(a.endDate ?? a.date ?? ""));
  const doneTasks = tasks
    .filter((task) => task.status === "완료")
    .sort((a, b) => (finishedAt(b) ?? "").localeCompare(finishedAt(a) ?? ""));
  const canceled = tasks
    .filter((task) => task.status === "취소")
    .sort((a, b) => (finishedAt(b) ?? "").localeCompare(finishedAt(a) ?? ""));

  return (
    <div className="mt-4 space-y-4">
      <section>
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">지난 프로젝트</h3>
        {finishedProjects.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">완료했거나 접은 프로젝트가 아직 없습니다.</p>
        ) : (
          <div className="cards-grid" style={{ "--proj-cols": 3 } as React.CSSProperties}>
            {finishedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={tasks}
                mode="history"
                onOpenProject={onOpenProject}
                onOpenTask={onOpenTask}
                onToggleTask={(task) => onRestoreTask(task)}
                onRestore={onRestoreProject}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3" data-history-events="true">
        <h3 className="mb-2 flex items-baseline gap-1.5 text-[calc(15px*var(--fs))] font-semibold text-ink-900">
          완료·취소한 일정
          <span className="text-[calc(13.5px*var(--fs))] font-normal text-ink-400">{finishedEvents.length}</span>
        </h3>
        <ShowMoreList
          listKey="events"
          items={finishedEvents}
          empty="완료하거나 취소한 일정이 아직 없습니다."
          render={(event) => <HistoryEventRow event={event} onOpen={() => onOpenEvent(event.id)} />}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 flex items-baseline gap-1.5 text-[calc(15px*var(--fs))] font-semibold text-ink-900">
          최근 완료한 할 일
          <span className="text-[calc(13.5px*var(--fs))] font-normal text-ink-400">{doneTasks.length}</span>
        </h3>
        <ShowMoreList
          listKey="tasks"
          items={doneTasks}
          empty="완료한 할 일이 아직 없습니다."
          render={(task) => (
            <li data-history-task={task.id} className="flex items-center gap-1.5 py-1.5">
              <CheckIcon size={11} className="flex-none text-sage-500" />
              <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[calc(15px*var(--fs))] text-ink-600">{task.title}</span>
                <span className="block truncate text-[calc(13px*var(--fs))] text-ink-400">{recordDateLabel(task)}</span>
              </button>
              <button type="button" onClick={() => onRestoreTask(task)} className="flex-none text-[calc(13px*var(--fs))] text-ink-400 hover:text-ink-700">
                되살리기
              </button>
            </li>
          )}
        />
      </section>

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 flex items-baseline gap-1.5 text-[calc(15px*var(--fs))] font-semibold text-ink-900">
          취소한 할 일
          <span className="text-[calc(13.5px*var(--fs))] font-normal text-ink-400">{canceled.length}</span>
        </h3>
        <ShowMoreList
          listKey="canceled"
          items={canceled}
          empty="취소한 할 일이 없습니다."
          render={(task) => (
            <li data-history-canceled={task.id} className="flex items-center gap-2 py-1.5">
              <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-1">
                  <CancelBadge />
                  <span className="truncate text-[calc(15px*var(--fs))] text-ink-600 line-through">{task.title}</span>
                </span>
                <span className="block truncate text-[calc(13px*var(--fs))] text-ink-400">
                  {recordDateLabel(task)}
                  {task.cancelReason ? ` · ${task.cancelReason}` : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRestoreTask(task)}
                className="flex-none rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
              >
                되살리기
              </button>
            </li>
          )}
        />
      </section>

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3 lg:col-span-2">
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">지난 루틴</h3>
        {pastRoutines.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">기록으로 보낸 루틴이 여기에 모입니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/60">
            {pastRoutines.map((routine) => (
              <li key={routine.id} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => onOpenRoutine(routine.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[calc(15px*var(--fs))] text-ink-700">{routine.title}</span>
                  <span className="text-[calc(13px*var(--fs))] text-ink-400">
                    {routine.category} · {routine.unit || "루틴"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreRoutine(routine)}
                  className="rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                >
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

/* ───────────────────────── A16: 히스토리 전용 화면 ───────────────────────── */

/** 숨긴 프로젝트 · 완료한 프로젝트 · History로 보낸 항목을 한 화면에 모읍니다. */
function HistorySpace({
  projects,
  tasks,
  routines,
  onOpenProject,
  onOpenTask,
  onOpenRoutine,
  onToggleHidden,
  onRestoreProject,
  onRestoreTask,
  onRestoreRoutine,
}: {
  projects: ProjectTask[];
  tasks: ProjectTask[];
  routines: Routine[];
  onOpenProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onOpenRoutine: (id: string) => void;
  onToggleHidden: (project: ProjectTask) => void;
  onRestoreProject: (project: ProjectTask) => void;
  onRestoreTask: (task: ProjectTask) => void;
  onRestoreRoutine: (routine: Routine) => void;
}) {
  const alive = projects.filter((project) => !project.trash);
  const hiddenProjects = alive.filter((project) => project.hidden && !project.history);
  const doneProjects = alive.filter(
    (project) => !project.hidden && (project.history || project.status === "완료" || project.status === "취소"),
  );
  return (
    <div className="mt-4 space-y-4">
      <section>
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">숨긴 프로젝트</h3>
        {hiddenProjects.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">숨긴 프로젝트가 없습니다.</p>
        ) : (
          <div className="cards-grid" style={{ "--proj-cols": 3 } as React.CSSProperties}>
            {hiddenProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={tasks}
                mode="history"
                restoreLabel="보이기"
                onOpenProject={onOpenProject}
                onOpenTask={onOpenTask}
                onToggleTask={(task) => onRestoreTask(task)}
                onRestore={onToggleHidden}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">완료한 프로젝트</h3>
        {doneProjects.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">완료했거나 접은 프로젝트가 없습니다.</p>
        ) : (
          <div className="cards-grid" style={{ "--proj-cols": 3 } as React.CSSProperties}>
            {doneProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={tasks}
                mode="history"
                onOpenProject={onOpenProject}
                onOpenTask={onOpenTask}
                onToggleTask={(task) => onRestoreTask(task)}
                onRestore={onRestoreProject}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
