"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { formatClock, isSameISO, timeRangeLabel, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { mergeCategories } from "@/state/categories";
import { priorityOf, projectEmoji, routineTone, taskTone } from "@/components/common/tone";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, XIcon } from "@/components/icons";
import { eventStartMinutes, routineCountForDay } from "@/components/calendar/calendar-utils";
import { isSpanned, spanSegments } from "@/components/calendar/span-bars";
import { pushToast } from "@/lib/toast-bus";
import { useDnd, type DropTarget } from "@/components/common/dnd";
import { useEventColors } from "@/state/event-colors";
import { useProjectColors } from "@/state/project-colors";
import { useAutoHideScrollbar } from "@/lib/use-auto-hide-scroll";
import { useCategoryColors } from "@/state/category-colors";
import { useSettings } from "@/state/settings";

interface WeekBoardProps {
  days: string[];
  events: CalendarEvent[];
  tasks: ProjectTask[];
  projects: ProjectTask[];
  routines: Routine[];
  onSelectDay: (day: string) => void;
  /** A32: 요일 머리글·일정 칸을 누르면 그 날의 정리 목록(종일·시간 일정 + 할 일)을 엽니다. */
  onOpenDaySummary?: (day: string, startTime?: string | null) => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  /** A41: 행 이름(프로젝트·index)을 누르면 프로젝트 탭과 같은 프로젝트 서랍을 엽니다. */
  onOpenProject?: (key: string) => void;
  onOpenRoutine: (id: string) => void;
  onCreate: (date: string, time?: string | null) => void;
  onMoveEvent: (id: string, date: string, time: string | null) => void;
  /** A12: a task dragged onto another weekday column changes its date. */
  onMoveTask?: (id: string, date: string, fromDay: string) => void;
  /** A35: 프로젝트 칸 시트에서 다른 프로젝트 행으로 끌어 놓으면 프로젝트까지 바뀝니다. */
  onMoveTaskToProject?: (id: string, projectId: string | null, date: string, fromDay: string) => void;
  /** A39: 일정을 프로젝트/index 칸에 놓으면 그 프로젝트의 할 일로 바꿉니다(새 Projects 행). */
  onConvertEventToTask?: (id: string, projectKey: string, date: string | null) => void;
  /** A39: 할 일을 종일 칸에 놓으면 종일 일정, 시간표 칸에 놓으면 그 시각의 일정으로 바꿉니다. */
  onConvertTaskToEvent?: (id: string, day: string, time: string | null) => void;
  /** A16: an all-day bar dragged to another day (or down to a time slot). */
  onMoveAllDayDate?: (id: string, date: string) => void;
  /** A41: 연결 막대를 끌어 날짜만 옮깁니다 — 정해 둔 시각·기간은 그대로입니다. */
  onMoveDateOnly?: (id: string, date: string) => void;
  /** A41: 연결 막대 양끝을 끌어 기간 늘리기/줄이기. */
  onResizeSpan?: (id: string, side: "start" | "end", day: string) => void;
  /** B5: edge drag resizes an event. */
  onResizeEvent?: (id: string, startTime: string, endTime: string) => void;
  onToggleTask: (task: ProjectTask) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  /** A19: a phone tap on a project's day opens that day's list; adding from it keeps the date. */
  onCreateTaskForProject: (projectId: string, date?: string) => void;
  onCreateRoutine: () => void;
  /** A6: 맞춤 — projects/routines hidden one by one in the week view. */
  mode?: ModeFilter;
  hiddenProjectIds?: string[];
  hiddenRoutineIds?: string[];
  onToggleProjectHidden?: (id: string) => void;
  onToggleRoutineHidden?: (id: string) => void;
  /** B5: all-day bars reorder by dragging one onto another. */
  onReorderAllDay?: (orderedIds: string[]) => void;
  /** A44: 고정 줄의 `할 일` 토글 — 끄면 아래 프로젝트 영역이 접힙니다. */
  showTasks?: boolean;
  /** A44: 프로젝트 영역이 `할 일` 토글 때문에 가려져 있을 때, 펴기 버튼이 토글을 켭니다. */
  onShowTasks?: () => void;
  /** A48: NOW가 꺼져 있으면 이번 창에 할 일이 없는 프로젝트도 빈 행으로 남깁니다. */
  nowOnly?: boolean;
}

/** 프로젝트가 없는 할 일은 게시판에서 index 행으로 모입니다. */
const INBOX_KEY = "inbox";
/** A40: 주간·3일 보기의 프로젝트 행·루틴 행 순서는 이 브라우저에 남깁니다. */
const ROW_ORDER_KEY = "my-diary:week-row-order:v1";
/**
 * A42: 하루 일정 목록의 순서도 이 브라우저에 남깁니다 — 날짜 → 일정 id 배열.
 * 같은 시각에 겹친 일정을 끌어 위아래로 바꾸면 이 순서가 먼저 적용됩니다.
 */
const EVENT_ORDER_KEY = "my-diary:week-event-order:v1";

type DayEventOrder = Record<string, string[]>;

function readEventOrder(): DayEventOrder {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EVENT_ORDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: DayEventOrder = {};
    for (const [day, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(list)) out[day] = list.filter((id): id is string => typeof id === "string");
    }
    return out;
  } catch {
    return {};
  }
}

type RowOrder = { projects: string[]; routines: string[] };

function readRowOrder(): RowOrder {
  if (typeof window === "undefined") return { projects: [], routines: [] };
  try {
    const raw = window.localStorage.getItem(ROW_ORDER_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<RowOrder>) : {};
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter((id): id is string => typeof id === "string") : [],
      routines: Array.isArray(parsed.routines) ? parsed.routines.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return { projects: [], routines: [] };
  }
}

/** 저장된 순서에 있는 행이 먼저, 새로 생긴 행은 그 뒤에 원래 순서대로. */
function orderOf(list: string[], key: string): number {
  const index = list.indexOf(key);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
/** A32: 행을 만드는 기준과 똑같이, 이 할 일이 어느 행에 속하는지 돌려줍니다. */
const rowKeyOf = (task: ProjectTask, projects: ProjectTask[]) =>
  projects.find((item) => item.id === (task.projectIds[0] ?? ""))?.id ?? INBOX_KEY;

/** 하루 일정 목록의 기본 순서 — 종일(시간 없음)이 먼저, 그다음 시작 시각이 빠른 순. */
const listKeyOf = (event: CalendarEvent) => (event.allDay || !event.startTime ? -1 : eventStartMinutes(event));

export function WeekBoard({
  days,
  events,
  tasks,
  projects,
  routines,
  onSelectDay,
  onOpenDaySummary,
  onOpenEvent,
  onOpenTask,
  onOpenProject,
  onOpenRoutine,
  onCreate,
  onMoveEvent,
  onMoveTask,
  onMoveTaskToProject,
  onConvertEventToTask,
  onConvertTaskToEvent,
  onMoveAllDayDate,
  onMoveDateOnly,
  onResizeSpan,
  onResizeEvent,
  onToggleTask,
  onRoutineCount,
  onCreateTaskForProject,
  onCreateRoutine,
  mode = "all",
  hiddenProjectIds = [],
  hiddenRoutineIds = [],
  onToggleProjectHidden,
  onToggleRoutineHidden,
  onReorderAllDay,
  showTasks = true,
  onShowTasks,
  nowOnly = false,
}: WeekBoardProps) {
  const today = todayISO();
  /** 오늘 열은 일정·프로젝트·루틴이 같은 톤으로 이어지도록 한 가지 색을 같이 씁니다.
   *  A20: #e8edf4가 너무 진하다는 요청에 흰 바탕 대비 농도를 절반으로 낮췄습니다(#f4f6fa). */
  const todayCell = "bg-[#f4f6fa]";
  /** A6: the first project row carries the collapse-all control for the whole project area. */
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  /** A40: 프로젝트 행·루틴 행을 끌어 올리고 내리는 순서. */
  const [rowOrder, setRowOrder] = useState<RowOrder>(() => readRowOrder());
  const saveRowOrder = (kind: keyof RowOrder, ids: string[]) => {
    /* A41: 순서를 바꾼 것도 데이터 변경 — 짧게 알립니다. */
    pushToast(kind === "projects" ? "프로젝트 행 순서를 바꿨습니다" : "루틴 행 순서를 바꿨습니다");
    setRowOrder((current) => {
      const next = { ...current, [kind]: ids };
      try {
        window.localStorage.setItem(ROW_ORDER_KEY, JSON.stringify(next));
      } catch {
        /* 저장 공간이 없으면 이번 화면에서만 유지됩니다. */
      }
      return next;
    });
  };
  /** The routine area folds away as a whole, the same way the project area does. */
  const [routinesCollapsed, setRoutinesCollapsed] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  /**
   * A19 · A32: 주간 칸을 누르면 열리는 '그 날 이 프로젝트의 할 일' 시트.
   * 폰에서 먼저 쓰던 화면이고, 이제 PC에서도 프로젝트 칸·할 일 제목을 누르면
   * 바로 수정 화면으로 들어가지 않고 이 목록이 먼저 열립니다.
   * `key`는 프로젝트 id, 프로젝트가 없으면 index 행과 같은 "inbox"입니다.
   */
  const [cellSheet, setCellSheet] = useState<{ key: string; title: string; day: string } | null>(null);
  /** A33: 프로젝트 칸 시트에서도 항목을 다른 날짜 칸으로 끌어 옮길 수 있습니다. */
  const cellSheetRef = useRef<HTMLDivElement | null>(null);
  const [cellSheetDragging, setCellSheetDragging] = useState(false);
  const hideCellSheet = () => {
    setCellSheetDragging(true);
    const node = cellSheetRef.current;
    if (!node) return;
    node.style.opacity = "0";
    node.style.pointerEvents = "none";
  };
  const restoreCellSheet = () => {
    setCellSheetDragging(false);
    const node = cellSheetRef.current;
    if (!node) return;
    node.style.opacity = "";
    node.style.pointerEvents = "";
  };
  /** 프로젝트 행 이름 — 시트에서 끌어온 할 일이 어느 프로젝트로 가는지 안내에 씁니다. */
  const rowTitleOf = (key: string) => (key === INBOX_KEY ? "index" : projects.find((project) => project.id === key)?.title ?? "");

  /**
   * A35: 놓은 자리에서 무엇이 바뀌는지(날짜·프로젝트)를 계산해 저장으로 넘깁니다.
   * 다른 프로젝트 행의 같은 날 칸이나 그 행의 이름에 놓으면 프로젝트만, 같은 행의 다른 날
   * 칸에 놓으면 날짜만, 둘 다 다르면 둘 다 바뀝니다. 프로젝트가 바뀌면 그 프로젝트의 분류를
   * 따라가 카드 색·필터가 어긋나지 않습니다.
   */
  const applyTaskDrop = (task: ProjectTask, fromDay: string, fromKey: string, target: DropTarget) => {
    const nextDay = target.data.day || fromDay;
    const nextKey = target.data.project;
    const projectChanged = nextKey !== undefined && nextKey !== fromKey;
    const dayChanged = nextDay !== fromDay;
    if (!projectChanged && !dayChanged) return;
    if (projectChanged && onMoveTaskToProject) {
      onMoveTaskToProject(task.id, nextKey === INBOX_KEY ? null : nextKey!, dayChanged ? nextDay : fromDay, fromDay);
      return;
    }
    if (dayChanged) onMoveTask?.(task.id, nextDay, fromDay);
  };

  /** 놓을 자리 안내 — `집 정리 · 11/22로 옮기기`처럼 바뀌는 것을 모두 보여 줍니다. */
  const taskDropHint = (fromDay: string, fromKey: string, target: DropTarget) => {
    const nextDay = target.data.day || fromDay;
    const nextKey = target.data.project;
    const projectChanged = nextKey !== undefined && nextKey !== fromKey;
    const projectLabel = projectChanged ? rowTitleOf(nextKey!) : null;
    const dayLabel = nextDay !== fromDay ? nextDay.slice(5).replace("-", "/") : null;
    if (projectLabel && dayLabel) return `${projectLabel} · ${dayLabel}로 옮기기`;
    if (projectLabel) return `${projectLabel}로 옮기기`;
    if (dayLabel) return `${dayLabel}로 옮기기`;
    return null;
  };

  /**
   * A35: 시트 안의 할 일을 꾹 눌러(마우스는 조금 끌어) 다른 칸으로 옮깁니다.
   * 프로젝트 목록 시트를 닫지 않고도 다른 프로젝트 행·다른 날로 옮길 수 있습니다.
   */
  const startSheetDrag = (event: ReactPointerEvent<HTMLElement>, task: ProjectTask, day: string, fromKey: string) => {
    if (!onMoveTask && !onMoveTaskToProject) return;
    dnd.start(
      event,
      { kind: "task", id: task.id, label: task.title },
      (target) => {
        if (target) applyTaskDrop(task, day, fromKey, target);
      },
      {
        onStart: hideCellSheet,
        onEnd: restoreCellSheet,
        getHint: (target) => taskDropHint(day, fromKey, target),
      },
    );
  };
  const [narrow, setNarrow] = useState(false);
  /** A14: the 일정 area folds away like 프로젝트 and 루틴 do. */
  const [scheduleCollapsed, setScheduleCollapsed] = useState(false);
  /** A42: 하루 일정이 설정한 개수를 넘으면 그 요일만 펼칩니다. */
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  /** A42: 끌어서 바꾼 하루 일정 순서 — 날짜마다 id 배열로 남깁니다. */
  const [eventOrder, setEventOrder] = useState<DayEventOrder>(() => readEventOrder());
  /**
   * A2: on a phone the task title itself is the checkbox — one tap completes, another
   * clears it. A tap that turned into a swipe or a scroll must never toggle anything,
   * so the pointer is sampled on down and compared on click.
   */
  const tapOrigin = useRef<{ id: string; x: number; y: number; at: number } | null>(null);
  const { toneFor } = useEventColors();
  const { settings } = useSettings();
  const { pastelOf } = useProjectColors();
  /** A19: 분류에 직접 고른 색이 있으면 프로젝트 점·할 일 체크·루틴 배지에 그 색을 씁니다. */
  const categoryColor = useCategoryColors();
  const dnd = useDnd();
  /** A20: 게시판 스크롤바가 움직일 때만 보입니다. */
  const boardBar = useAutoHideScrollbar();
  const scroller = useRef<HTMLDivElement | null>(null);
  const dayKey = days.join(",");
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /** Keeps today's column in view when the narrow board scrolls sideways. */
  useEffect(() => {
    if (!narrow || !scroller.current) return;
    const node = scroller.current.querySelector<HTMLElement>("[data-today='true']");
    if (!node) return;
    const box = node.getBoundingClientRect();
    const frame = scroller.current.getBoundingClientRect();
    const delta = box.left - frame.left;
    scroller.current.scrollLeft += delta - (scroller.current.clientWidth - box.width) / 2;
  }, [narrow, dayKey]);
  /* the frozen left column: wide enough on a phone to read a project or routine name;
     on a desktop a little wider so '브랜드 포트폴리오' is not cut to '브랜드 포…' */
  const gutter = narrow ? "6rem" : "9rem";
  const grid = useMemo(
    () => ({ gridTemplateColumns: `${gutter} repeat(${days.length}, minmax(0, 1fr))` }),
    [days.length, gutter],
  );

  const visibleEvents = useMemo(() => events.filter((event) => !event.trash), [events]);
  // B4: a canceled task stays faintly in its own place (with its reason), never vanishes.
  const visibleTasks = useMemo(() => tasks.filter((task) => !task.trash), [tasks]);

  const weekTasks = useMemo(
    () => visibleTasks.filter((task) => (task.date && days.includes(task.date)) || (task.due && days.includes(task.due))),
    [visibleTasks, days],
  );

  const rows = useMemo(() => {
    const map = new Map<string, { project: ProjectTask | null; tasks: ProjectTask[] }>();
    for (const task of weekTasks) {
      const projectId = task.projectIds[0] ?? "";
      const project = projects.find((item) => item.id === projectId) ?? null;
      const key = project?.id ?? "inbox";
      if (!map.has(key)) map.set(key, { project, tasks: [] });
      map.get(key)!.tasks.push(task);
    }
    /* A48: NOW가 꺼져 있으면 이번 창에 할 일이 하나도 없는 프로젝트도 행으로 남깁니다.
       (NOW가 켜져 있을 때는 예전처럼 이번 창에 할 일이 있는 프로젝트만 보입니다.) */
    if (!nowOnly) {
      for (const project of projects) {
        if (map.has(project.id)) continue;
        map.set(project.id, { project, tasks: [] });
      }
    }
    return [...map.entries()]
      .filter(([key]) => mode !== "custom" || !hiddenProjectIds.includes(key))
      .sort((a, b) => {
        if (a[0] === "inbox") return -1;
        if (b[0] === "inbox") return 1;
        // A40: 끌어서 정한 행 순서가 먼저, 정한 적 없는 행은 분류 순서대로 뒤에.
        const oa = orderOf(rowOrder.projects, a[0]);
        const ob = orderOf(rowOrder.projects, b[0]);
        if (oa !== ob) return oa - ob;
        const order = { 업무: 0, 개인: 1, 공부: 2 } as const;
        const pa = a[1].project;
        const pb = b[1].project;
        return (order[(pa?.category ?? "개인") as keyof typeof order] ?? 1) - (order[(pb?.category ?? "개인") as keyof typeof order] ?? 1);
      });
  }, [weekTasks, projects, mode, hiddenProjectIds, rowOrder.projects, nowOnly]);

  /**
   * A19: 프로젝트 칸 시트에 보여 줄 그 날의 할 일 — 진행 중인 것과 완료한 것 모두.
   * A32: 행을 만들 때와 똑같은 기준으로 프로젝트를 찾습니다. 예전에는 프로젝트가 없는
   * 할 일을 `""`로 비교해, 게시판에서 index 행에 보이던 할 일이 시트에서는 하나도
   * 나오지 않았습니다(`"" !== "inbox"`). 지금은 없는 프로젝트도 index 행으로 모입니다.
   */
  const sheetTasks = useMemo(() => {
    if (!cellSheet) return [];
    return visibleTasks
      .filter((task) => {
        if (!(task.date === cellSheet.day || task.due === cellSheet.day)) return false;
        return rowKeyOf(task, projects) === cellSheet.key;
      })
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  }, [cellSheet, visibleTasks, projects]);

  const sheetDateLabel = cellSheet
    ? `${Number(cellSheet.day.slice(5, 7))}월 ${Number(cellSheet.day.slice(8, 10))}일 (${weekdayKo(cellSheet.day)})`
    : "";
  const routineGroups = useMemo(() => {
    const active = routines.filter(
      (routine) =>
        routine.kind === "루틴" &&
        !routine.trash &&
        !routine.history &&
        (mode !== "custom" || !hiddenRoutineIds.includes(routine.id)),
    );
    // A16: every 분류 that has a routine today gets its own row — 업무 and user-made ones too.
    return mergeCategories([], active.map((routine) => routine.category))
      .map((category) => ({ category, items: active.filter((routine) => routine.category === category) }))
      .filter((group) => group.items.length > 0);
  }, [routines, mode, hiddenRoutineIds]);

  /**
   * A42: 두 날 이상 이어지는 일정(종일·시간 유무 무관)은 월간처럼 하나의 연결 막대로,
   * 하루짜리 일정은 그 아래 요일 칸 목록으로 놓습니다. 시간표(0~24시 눈금)는 없앴습니다.
   */
  const spanBars = useMemo(
    () => spanSegments(visibleEvents.filter((event) => event.kind === "일정"), days, { includeAllDaySingles: true }),
    [visibleEvents, days],
  );
  /** 연결 막대 한 줄 높이와, 그 줄이 차지하는 자리(아래 목록이 그만큼 내려갑니다). */
  const barLane = 19;
  const laneCount = spanBars.length > 0 ? Math.max(...spanBars.map((bar) => bar.lane)) + 1 : 0;
  const barsHeight = laneCount > 0 ? laneCount * barLane + 5 : 0;
  /** A42: 설정 → 캘린더의 `주간 하루 일정` 개수(3~7). */
  const dayItemCap = Math.max(3, Math.min(7, Number(settings.weekDayItems) || 5));

  /**
   * 그 날의 하루 일정 — 종일이 먼저, 그다음 시작 시각이 빠른 순입니다.
   * 끌어서 바꾼 순서가 있으면 그 순서를 그대로 쓰고, 새로 생긴 일정은 시각 자리에 들어갑니다.
   */
  const dayEventsFor = (day: string): CalendarEvent[] => {
    /* A44: 종일 일정(하루짜리 포함)은 위의 색 막대가 맡으므로 목록에는 시간 지정 일정만 남깁니다. */
    const items = visibleEvents.filter(
      (event) => event.kind === "일정" && !isSpanned(event) && !event.allDay && event.date === day,
    );
    const byTime = [...items].sort(
      (a, b) => listKeyOf(a) - listKeyOf(b) || String(a.createdAt).localeCompare(String(b.createdAt)),
    );
    const stored = eventOrder[day];
    if (!stored || stored.length === 0) return byTime;
    const remaining = new Map(byTime.map((event) => [event.id, event]));
    const out: CalendarEvent[] = [];
    for (const id of stored) {
      const event = remaining.get(id);
      if (!event) continue;
      out.push(event);
      remaining.delete(id);
    }
    for (const event of byTime) {
      if (!remaining.has(event.id)) continue;
      const at = out.findIndex((other) => listKeyOf(other) > listKeyOf(event));
      out.splice(at < 0 ? out.length : at, 0, event);
    }
    return out;
  };
  const dayLists = days.map((day) => ({ day, list: dayEventsFor(day) }));
  /** 구역 머리에 보여 줄 이번 창의 일정 수(막대 + 목록, 중복 없이). */
  const weekEventCount = (() => {
    const ids = new Set(spanBars.map((bar) => bar.event.id));
    for (const entry of dayLists) for (const event of entry.list) ids.add(event.id);
    return ids.size;
  })();

  const routineTotal = routineGroups.reduce((sum, group) => sum + group.items.length, 0);
  /** A16: no 분류 header rows — each row carries its own badge, sorted by 분류 first. */
  /** A40: 루틴 행도 끌어서 정한 순서를 따릅니다(정한 적 없으면 분류·원래 순서). */
  const routineRows = [...routineGroups.flatMap((group) => group.items.map((routine) => ({ routine, category: group.category })))]
    .sort((a, b) => orderOf(rowOrder.routines, a.routine.id) - orderOf(rowOrder.routines, b.routine.id));

  /** A40: 행을 끌어 다른 행 앞으로 옮깁니다 — 저장된 순서 배열만 다시 적습니다. */
  const moveRow = (kind: keyof RowOrder, dragId: string, targetId: string, after = false) => {
    if (!dragId || !targetId || dragId === targetId) return;
    const current =
      kind === "projects"
        ? rows.map(([key]) => key).filter((key) => key !== INBOX_KEY)
        : routineRows.map(({ routine }) => routine.id);
    const next = current.filter((id) => id !== dragId);
    const at = next.indexOf(targetId);
    if (at < 0) return;
    // A40: 대상 행의 아래쪽 절반에 놓으면 그 아래로 — 위/아래 모두 자연스럽게 옮깁니다.
    next.splice(at + (after ? 1 : 0), 0, dragId);
    saveRowOrder(kind, next);
  };

  /** 행 이름 왼쪽의 손잡이 — 마우스도 손가락도 이 자리에서 끕니다. */
  const startRowDrag = (kind: keyof RowOrder, id: string, label: string) => (event: ReactPointerEvent<HTMLElement>) => {
    dnd.start(
      event,
      { kind: kind === "projects" ? "project-row" : "routine-row", id, label },
      (target, point) => {
        if (!target) return;
        const after = point.y > target.rect.top + target.rect.height / 2;
        if (kind === "projects" && target.zone === "week-project-row" && target.data.project) {
          if (target.data.project === INBOX_KEY) return;
          moveRow("projects", id, target.data.project, after);
          return;
        }
        if (kind === "routines" && target.zone === "week-routine-row" && target.data.routine) {
          moveRow("routines", id, target.data.routine, after);
        }
      },
      {
        getHint: (target) => {
          if (kind === "projects" && target.zone === "week-project-row" && target.data.project && target.data.project !== INBOX_KEY) {
            return `${rowTitleOf(target.data.project)} 위로 옮기기`;
          }
          if (kind === "routines" && target.zone === "week-routine-row" && target.data.routine) return "이 루틴 위로 옮기기";
          return null;
        },
      },
    );
  };

  /** A42: 끌어서 바꾼 하루 일정 순서를 이 브라우저에 남깁니다. */
  const saveEventOrder = (day: string, ids: string[]) => {
    pushToast("일정 순서를 변경했습니다");
    setEventOrder((current) => {
      const next = { ...current, [day]: ids };
      try {
        window.localStorage.setItem(EVENT_ORDER_KEY, JSON.stringify(next));
      } catch {
        /* 저장 공간이 없으면 이번 화면에서만 유지됩니다. */
      }
      return next;
    });
  };

  /**
   * A42: 하루 일정 한 줄을 끕니다 — 같은 날 다른 줄 위에 놓으면 그 자리로 순서를 바꾸고,
   * 다른 날 칸에 놓으면 그 날짜로 옮깁니다(시작·끝 시각 유지).
   */
  const startEventDrag = (pointerEvent: ReactPointerEvent<HTMLElement>, item: CalendarEvent, day: string) => {
    if (!onMoveEvent && !onConvertEventToTask) return;
    dnd.start(
      pointerEvent,
      { kind: "event", id: item.id, label: item.title },
      (target, point) => {
        if (!target) return;
        /* A39: 프로젝트 칸·index 칸에 놓으면 그 프로젝트의 할 일로 바꿉니다. */
        if (target.zone === "week-task-day" || target.zone === "week-project-row") {
          onConvertEventToTask?.(item.id, target.data.project ?? INBOX_KEY, target.data.day ?? null);
          return;
        }
        const nextDay = target.data.day;
        if (!nextDay) return;
        if (target.zone === "week-event-item" && nextDay === day) {
          const over = target.data.id;
          if (!over || over === item.id) return;
          const ids = dayEventsFor(day)
            .map((event) => event.id)
            .filter((id) => id !== item.id);
          const at = ids.indexOf(over);
          if (at < 0) return;
          const after = point.y > target.rect.top + target.rect.height / 2;
          ids.splice(at + (after ? 1 : 0), 0, item.id);
          saveEventOrder(day, ids);
          return;
        }
        if (nextDay === day) return;
        onMoveEvent?.(item.id, nextDay, null);
      },
      {
        getHint: (target, point) => {
          if (target.zone === "week-task-day" || target.zone === "week-project-row") {
            return `${rowTitleOf(target.data.project ?? INBOX_KEY)} 할 일로 옮기기`;
          }
          const nextDay = target.data.day;
          if (!nextDay) return null;
          if (target.zone === "week-event-item" && nextDay === day) {
            return point.y > target.rect.top + target.rect.height / 2 ? "아래로 순서 바꾸기" : "위로 순서 바꾸기";
          }
          if (nextDay === day) return null;
          const keeps = item.startTime && !item.allDay ? ` (${formatClock(item.startTime)} 유지)` : "";
          return `${nextDay.slice(5).replace("-", "/")}로 옮기기${keeps}`;
        },
      },
    );
  };

  /**
   * A42: 연결 막대(두 날 이상 일정)를 끕니다 — 다른 날 칸에 놓으면 날짜만 옮기고
   * 예전에 정한 시작·끝 시각과 일수는 그대로 둡니다. 다른 막대 위에 놓으면 순서만 바뀝니다.
   */
  const startBarDrag = (pointerEvent: ReactPointerEvent<HTMLElement>, event: CalendarEvent) => {
    dnd.start(
      pointerEvent,
      { kind: "event", id: event.id, label: event.title },
      (target) => {
        if (!target) return;
        /* A39: 프로젝트 칸·index 칸에 놓으면 그 프로젝트의 할 일로 바꿉니다. */
        if (target.zone === "week-task-day" || target.zone === "week-project-row") {
          onConvertEventToTask?.(event.id, target.data.project ?? INBOX_KEY, target.data.day ?? null);
          return;
        }
        const nextDay = target.data.day;
        if (!nextDay) return;
        if (target.zone === "span-bar") {
          const over = target.data.id;
          if (!over || over === event.id || !onReorderAllDay) return;
          const ids = spanBars.map((bar) => bar.event.id).filter((id) => id !== event.id);
          const at = ids.indexOf(over);
          ids.splice(at < 0 ? ids.length : at, 0, event.id);
          onReorderAllDay(ids);
          return;
        }
        if (onMoveDateOnly) onMoveDateOnly(event.id, nextDay);
        else onMoveAllDayDate?.(event.id, nextDay);
      },
      {
        getHint: (target) => {
          if (target.zone === "week-task-day" || target.zone === "week-project-row") {
            const key = target.data.project ?? INBOX_KEY;
            const stamp = target.data.day ? ` · ${target.data.day.slice(5).replace("-", "/")}` : "";
            return `${rowTitleOf(key)}${stamp} 할 일로 옮기기`;
          }
          if (target.zone === "span-bar") return "막대 순서 바꾸기";
          const nextDay = target.data.day;
          if (!nextDay) return null;
          return `${nextDay.slice(5).replace("-", "/")}부터 시작으로 옮기기`;
        },
      },
    );
  };

  /** A42: 하루 일정 목록 한 줄 — 왼쪽에 얇은 색 선, 위(또는 앞)에 작은 시간, 그 아래 제목. */
  const renderDayEvent = (event: CalendarEvent, day: string) => {
    const tone = toneFor(event);
    const timeText = event.allDay || !event.startTime ? "" : timeRangeLabel(event.startTime, event.endTime);
    const stacked = days.length > 3 || narrow;
    return (
      <button
        key={event.id}
        type="button"
        data-week-event={event.id}
        data-week-event-day={day}
        data-drop-zone="week-event-item"
        data-drop-id={event.id}
        data-drop-day={day}
        onPointerDown={(pointerEvent) => startEventDrag(pointerEvent, event, day)}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          onOpenEvent(event.id);
        }}
        title={`${event.title}${timeText ? ` · ${timeText}` : ""} · 끌어서 순서·날짜 바꾸기`}
        className={cn(
          "relative flex w-full min-w-0 rounded-[4px] pl-[7px] pr-1 py-[1px] text-left transition hover:bg-paper-200/70",
          stacked ? "flex-col gap-0" : "items-center gap-1",
          (event.canceled || event.done) && "opacity-60",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute bottom-[2px] left-0 top-[2px] w-[3px] rounded-full", tone.solid)}
        />
        {timeText ? (
          <span
            className={cn(
              "flex-none tabular-nums text-ink-400",
              stacked ? "text-[calc(10.5px*var(--fs))] leading-[1.25]" : "text-[calc(11.5px*var(--fs))] leading-none",
            )}
          >
            {timeText}
          </span>
        ) : null}
        <span
          className={cn(
            "block min-w-0 break-keep line-clamp-2 text-[calc(12.5px*var(--fs))] leading-[1.25]",
            tone.text,
            (event.canceled || event.done) && "line-through",
          )}
        >
          {event.title}
        </span>
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* A2: on a phone the board keeps readable column widths and scrolls sideways a little,
          so an 8–10 character title is never squeezed into two letters per line. */}
      <div
        ref={scroller}
        data-week-board-scroll="true"
        onScroll={boardBar.onScroll}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overscroll-contain",
          /* A18: 프로젝트를 다 펼치면 게시판이 화면보다 길어질 수 있습니다. 그때는
             프로젝트 칸이 아니라 이 게시판 전체가 세로로 움직입니다(날짜 머리글은 위에 붙음). */
          narrow ? "-mx-1 overflow-auto pb-1" : "overflow-y-auto overflow-x-clip pb-1",
          boardBar.className,
        )}
      >
        <div className={cn("flex min-h-full flex-col pb-1", narrow && "min-w-[44rem]")}>
      {mode === "custom" ? (
        <div className="mb-2 rounded-xl border border-paper-300 bg-paper-50/70 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setCustomOpen((open) => !open)}
            aria-expanded={customOpen}
            className="flex w-full items-center justify-between text-left text-[calc(14px*var(--fs))] font-medium text-ink-700"
          >
            <span>맞춤 · 프로젝트 {projects.length}개 · 루틴 {routines.filter((item) => item.kind === "루틴" && !item.history && !item.trash).length}개</span>
            <span className="text-[calc(13.5px*var(--fs))] font-normal text-ink-400">{customOpen ? "접기" : "숨길 항목 고르기"}</span>
          </button>
          {customOpen ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[calc(13px*var(--fs))] text-ink-400">프로젝트</p>
                <div className="flex flex-wrap gap-1">
                  {projects.map((project) => {
                    const shown = !hiddenProjectIds.includes(project.id);
                    return (
                      <button
                        key={project.id}
                        type="button"
                        aria-pressed={shown}
                        onClick={() => onToggleProjectHidden?.(project.id)}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[calc(13.5px*var(--fs))]",
                          shown ? "border-ink-900 bg-ink-900 text-white" : "border-paper-400 bg-white text-ink-400",
                        )}
                      >
                        {shown ? "표시" : "숨김"} · {project.title}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[calc(13px*var(--fs))] text-ink-400">루틴</p>
                <div className="flex flex-wrap gap-1">
                  {routines
                    .filter((item) => item.kind === "루틴" && !item.history && !item.trash)
                    .map((routine) => {
                      const shown = !hiddenRoutineIds.includes(routine.id);
                      return (
                        <button
                          key={routine.id}
                          type="button"
                          aria-pressed={shown}
                          onClick={() => onToggleRoutineHidden?.(routine.id)}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[calc(13.5px*var(--fs))]",
                            shown ? "border-ink-900 bg-ink-900 text-white" : "border-paper-400 bg-white text-ink-400",
                          )}
                        >
                          {shown ? "표시" : "숨김"} · {routine.title}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {/* week day header — frozen at the top while the projects and routines scroll (mobile) */}
      <div
        className="sticky top-0 z-30 grid flex-none items-end border-b border-paper-300 bg-white pb-1"
        style={grid}
        data-week-header="true"
      >
        <div className="sticky left-0 z-40 self-stretch border-r border-paper-300 bg-white pb-1 text-right text-[calc(13px*var(--fs))] text-ink-400" />
        {days.map((day) => {
          const isToday = isSameISO(day, today);
          const holiday = holidayName(day);
          const dow = new Date(`${day}T12:00:00`).getDay();
          return (
            <button
              key={day}
              type="button"
              data-today={isToday ? "true" : undefined}
              data-week-day-head={day}
              /* A33: 하루 목록 시트에서 끌어온 항목을 이 날짜 열에 놓을 수 있습니다 —
                 머리글이 그 날의 가장 넓고 안정된 놓을 자리입니다. */
              data-drop-zone="week-day"
              data-drop-day={day}
              title={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 ${weekdayKo(day)}요일 · 그 날 정리`}
              aria-label={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 그 날 정리`}
              onClick={() => {
                /* A32: 날짜 머리글은 바로 일간 보기로 뛰지 않고, 그 날의 일정·할 일 요약을 먼저 엽니다.
                   일간 보기는 그 요약의 `이 날짜로 이동`으로 들어갑니다. */
                if (onOpenDaySummary) onOpenDaySummary(day);
                else onSelectDay(day);
              }}
              className="group/day flex flex-col items-center gap-0.5 pb-0.5 pt-1.5 transition hover:bg-paper-200/40"
            >
              <span
                className={cn(
                  "text-[calc(14px*var(--fs))] transition group-hover/day:font-semibold",
                  dow === 6 ? "text-blue-500" : dow === 0 ? "text-red-400" : "text-ink-400 group-hover/day:text-ink-700",
                )}
              >
                {weekdayKo(day)}
              </span>
              <span
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[calc(18px*var(--fs))] font-semibold leading-none tabular-nums md:h-9 md:min-w-9 md:text-[calc(20px*var(--fs))]",
                  isToday
                    ? "bg-ink-900 text-white group-hover/day:ring-2 group-hover/day:ring-ink-900/20"
                    : holiday || dow === 0
                      ? "text-red-500 group-hover/day:bg-red-50 group-hover/day:ring-1 group-hover/day:ring-inset group-hover/day:ring-red-200"
                      : dow === 6
                        ? "text-blue-600 group-hover/day:bg-blue-50 group-hover/day:ring-1 group-hover/day:ring-inset group-hover/day:ring-blue-200"
                        : "text-ink-900 group-hover/day:bg-paper-200 group-hover/day:ring-1 group-hover/day:ring-inset group-hover/day:ring-ink-900/15",
                )}
              >
                {String(Number(day.slice(8, 10)))}
              </span>
              {holiday ? <span className="max-w-full truncate text-[calc(12.5px*var(--fs))] text-red-500">{holiday}</span> : null}
            </button>
          );
        })}
      </div>

      {/* 일정·프로젝트·루틴은 한 틀 안에 여백 없이 붙고, 구역 사이는 2px 진회색 실선이 나눕니다.
          A18: 검정(#111827)은 너무 무겁다는 요청에 절반 농도의 진회색으로 낮췄습니다. */}
      <div
        data-week-frame="true"
        className={cn(
          "flex min-w-0 flex-col overflow-clip rounded-xl border-2 border-[#6b7280] bg-white",
          /* A18: 내용이 짧으면 남는 높이를 채우고, 길면 잘리지 않고 게시판과 함께 자랍니다. */
          narrow ? "min-h-0 flex-none" : "min-h-fit flex-1",
        )}
      >
      <section data-week-section="schedule" className="flex-none overflow-clip border-b-2 border-[#6b7280]">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-paper-300/70 bg-paper-50/60 py-[3px] pl-2 pr-1.5">
        <span className="truncate text-[calc(13.5px*var(--fs))] font-medium text-ink-500">
          일정{weekEventCount > 0 ? ` · ${weekEventCount}개` : ""}
        </span>
        <button
          type="button"
          data-week-list-toggle="true"
          onClick={() => setScheduleCollapsed((open) => !open)}
          aria-expanded={!scheduleCollapsed}
          className="inline-flex flex-none items-center gap-1 rounded-full bg-paper-200 px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
        >
          {scheduleCollapsed ? "일정 영역 펴기" : "일정 영역 접기"}
          <ChevronDownIcon size={10} className={cn("transition", scheduleCollapsed && "rotate-180")} />
        </button>
      </div>
      {scheduleCollapsed ? null : (
      /* A42: 시간표(0~24시 눈금) 없이 — 왼쪽 라벨 `일정` 하나에, 두 날 이상은 위 연결 막대,
         하루짜리는 그 아래 요일 칸 목록으로 모읍니다. */
      <div className="grid" style={grid} data-week-list-block="true">
        <div className="sticky left-0 z-20 flex items-start justify-end border-r border-paper-300 bg-white px-2 pt-1 text-[calc(13px*var(--fs))] text-ink-400">
          일정
        </div>
        <div className="relative min-w-0" style={{ gridColumn: `2 / span ${days.length}` }}>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {dayLists.map(({ day, list }) => {
              const isToday = isSameISO(day, today);
              const expanded = expandedDays.includes(day);
              const shown = expanded ? list : list.slice(0, dayItemCap);
              const rest = list.length - shown.length;
              return (
                <div
                  key={day}
                  data-drop-zone="week-day-list"
                  data-drop-day={day}
                  data-week-day-list={day}
                  onClick={(clickEvent) => {
                    /* A32: 빈 자리를 누르면 그 날의 정리 목록 — 일정 줄·+ 일정은 각자 맡습니다. */
                    if ((clickEvent.target as HTMLElement).closest("[data-week-event], [data-week-add-event], [data-week-event-more]")) return;
                    onOpenDaySummary?.(day);
                  }}
                  className={cn(
                    "group/daycol flex min-w-0 flex-col border-l border-paper-300 pb-1",
                    /* 오늘 열은 배경과 얇은 테두리로만 표시합니다 — 현재 시각 빨간 선은 일간 보기에만. */
                    isToday && cn(todayCell, "ring-1 ring-inset ring-[#cdd9ea]"),
                  )}
                  style={{ paddingTop: barsHeight + 4 }}
                >
                  <div className={cn("px-1", narrow ? "space-y-[3px]" : "space-y-0.5")}>
                    {shown.map((event) => renderDayEvent(event, day))}
                  </div>
                  <div className="mt-auto">
                  {rest > 0 ? (
                    <button
                      type="button"
                      data-week-event-more={day}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        setExpandedDays((current) => (current.includes(day) ? current : [...current, day]));
                      }}
                      aria-label={`${weekdayKo(day)}요일 일정 ${rest}개 더 보기`}
                      className="mt-0.5 block w-full rounded bg-paper-200/80 py-[1px] text-center text-[calc(11.5px*var(--fs))] font-medium text-ink-500 transition hover:bg-paper-300/80 hover:text-ink-800"
                    >
                      +{rest}개 더 보기
                    </button>
                  ) : expanded && list.length > dayItemCap ? (
                    <button
                      type="button"
                      data-week-event-fold={day}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        setExpandedDays((current) => current.filter((item) => item !== day));
                      }}
                      className="mt-0.5 block w-full rounded py-[1px] text-center text-[calc(11.5px*var(--fs))] font-medium text-ink-400 transition hover:bg-paper-200/70 hover:text-ink-700"
                    >
                      접기
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-week-add-event={day}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onCreate(day, null);
                    }}
                    aria-label={`${weekdayKo(day)}요일 일정 추가`}
                    title="이 날짜로 일정 추가"
                    className="mt-0.5 flex w-full items-center justify-center gap-0.5 rounded py-[1px] text-[calc(12px*var(--fs))] text-ink-400/80 transition hover:bg-paper-200/70 hover:text-ink-800 group-hover/daycol:text-ink-500"
                  >
                    + 일정
                  </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 연결 막대 — 두 날 이상 이어지는 일정(종일·시간 무관)을 하나의 긴 막대로. */}
          {spanBars.length === 0 ? null : (
            <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: barsHeight }} data-span-bars="true">
              {spanBars.map(({ event, startIdx, span, lane, cutStart, cutEnd }) => {
                const tone = toneFor(event);
                const timeText = event.allDay || !event.startTime ? "" : timeRangeLabel(event.startTime, event.endTime);
                return (
                  <button
                    key={event.id}
                    type="button"
                    data-all-day-bar={event.id}
                    data-all-day-start={startIdx}
                    data-all-day-end={startIdx + span - 1}
                    data-drop-zone="span-bar"
                    data-drop-id={event.id}
                    data-drop-day={days[startIdx] ?? event.date}
                    onPointerDown={(pointerEvent) => startBarDrag(pointerEvent, event)}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onOpenEvent(event.id);
                    }}
                    title={`${event.title}${timeText ? ` · ${timeText}` : ""} · 끌어서 기간·순서 바꾸기`}
                    className={cn(
                      "pointer-events-auto absolute flex items-center gap-1 overflow-hidden border px-1.5 text-left text-[calc(12.5px*var(--fs))] font-medium leading-[17px]",
                      cutStart ? "rounded-l-none border-l-0" : "rounded-l-md",
                      cutEnd ? "rounded-r-none border-r-0" : "rounded-r-md",
                      tone.bg,
                      tone.border,
                      tone.text,
                      event.canceled && "line-through opacity-50",
                      /* A34: 완료한 일정도 할 일처럼 줄을 긋습니다. */
                      event.done && "line-through opacity-60",
                    )}
                    style={{
                      left: `calc(${(startIdx * 100) / days.length}% + 2px)`,
                      width: `calc(${(span * 100) / days.length}% - 4px)`,
                      top: lane * barLane + 3,
                      height: barLane - 2,
                    }}
                  >
                    {onResizeSpan ? (
                      <span
                        role="separator"
                        aria-label={`${event.title} 시작일 늘리기`}
                        data-all-day-handle="start"
                        onPointerDown={(pointerEvent) => {
                          pointerEvent.stopPropagation();
                          if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
                          dnd.start(
                            pointerEvent,
                            { kind: "event", id: event.id, label: event.title },
                            (target) => {
                              if (!target?.data.day) return;
                              onResizeSpan(event.id, "start", target.data.day);
                            },
                            { getHint: (target) => (target.data.day ? `${target.data.day.slice(5).replace("-", "/")}부터 시작` : null) },
                          );
                        }}
                        className="absolute inset-y-0 left-0 w-[8px] cursor-ew-resize bg-black/[0.06] opacity-60 transition hover:opacity-100"
                      />
                    ) : null}
                    <span className={cn("line-clamp-1", onResizeSpan && "px-1.5")}>{event.title}</span>
                    {timeText ? (
                      /* A42: 좁은 폰에서는 제목 자리를 지키도록 시각을 숨깁니다(막대를 누르면 상세에 보입니다). */
                      <span className="ml-auto hidden flex-none text-[calc(11px*var(--fs))] tabular-nums opacity-80 md:inline">{timeText}</span>
                    ) : null}
                    {cutEnd ? <span className="absolute right-[9px] top-0 leading-[17px] opacity-70">›</span> : null}
                    {onResizeSpan ? (
                      <span
                        role="separator"
                        aria-label={`${event.title} 끝날 늘리기`}
                        data-all-day-handle="end"
                        onPointerDown={(pointerEvent) => {
                          pointerEvent.stopPropagation();
                          if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
                          dnd.start(
                            pointerEvent,
                            { kind: "event", id: event.id, label: event.title },
                            (target) => {
                              if (!target?.data.day) return;
                              onResizeSpan(event.id, "end", target.data.day);
                            },
                            { getHint: (target) => (target.data.day ? `${target.data.day.slice(5).replace("-", "/")}까지` : null) },
                          );
                        }}
                        className="absolute inset-y-0 right-0 w-[8px] cursor-ew-resize bg-black/[0.06] opacity-60 transition hover:opacity-100"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
      </section>

      {/* attached project rows — A18: 프로젝트는 몇 개든 접기 전까지 전부 펼쳐 둡니다.
          안쪽에 세로 스크롤 창을 만들지 않고, 내용이 길면 게시판 전체가 길어집니다. */}
      <section
        data-week-section="projects"
        data-week-projects="true"
        className={cn(
          "overflow-clip border-b-2 border-[#6b7280]",
          /* A44: `할 일` 토글이 꺼져 프로젝트 행이 없을 때는 머리글 줄만 남기고 자리를 비우지 않습니다. */
          narrow || !showTasks ? "flex-none" : "min-h-fit flex-1",
        )}
      >
      <div>
        <div className="flex items-center justify-between border-b border-paper-300/70 bg-paper-50/60 py-[3px] pl-2 pr-1.5">
          <span className="flex items-baseline gap-1.5 text-[calc(13.5px*var(--fs))] font-medium text-ink-500">
            프로젝트
            {/* A44: `할 일` 토글이 꺼져 있어도 이 주의 할 일이 몇 개인지는 연한 회색으로 남깁니다. */}
            {!showTasks && weekTasks.length > 0 ? (
              <span data-week-task-count="true" className="font-normal text-ink-300">할 일 {weekTasks.length}개</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => {
              /* A44: `할 일` 토글이 꺼져 있으면 이 버튼이 그 토글을 켜서 프로젝트를 보여 줍니다. */
              if (!showTasks) {
                onShowTasks?.();
                return;
              }
              setProjectsCollapsed((open) => !open);
            }}
            aria-expanded={showTasks && !projectsCollapsed}
            data-week-projects-toggle="true"
            className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
          >
            {!showTasks || projectsCollapsed ? "프로젝트 영역 펴기" : "프로젝트 영역 접기"}
            <ChevronDownIcon size={10} className={cn("transition", (!showTasks || projectsCollapsed) && "rotate-180")} />
          </button>
        </div>
        {!showTasks ? null : projectsCollapsed ? null : rows.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[calc(14px*var(--fs))] text-ink-400">이번 주에 예정된 할 일이 없습니다.</div>
        ) : null}
        {!showTasks || projectsCollapsed ? null : rows.map(([key, row]) => {
          const project = row.project;
          const tone = project ? categoryColor.toneOf(project.category, taskTone(project.category)) : null;
          return (
            <div key={key} className="grid border-b border-paper-300/80 last:border-b-0" style={grid}>
              {/* A19: 프로젝트 이름(색 점 포함, index 행 포함)은 왼쪽 열 안에서 가로·세로 가운데로
                  모읍니다. 예전에는 이름이 왼쪽 벽에 붙어 있었습니다. */}
              <div
                data-drop-zone="week-project-row"
                data-drop-project={key}
                data-week-project-row={key}
                className={cn(
                  "group/row relative sticky left-0 z-20 flex min-h-[2rem] items-center justify-center border-r border-paper-300 px-1 py-0.5 text-center",
                  project ? pastelOf(project.id).bg : "bg-white",
                )}
              >
                {project ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`${project.title} 행 순서 바꾸기`}
                    title="끌어서 행 순서 바꾸기"
                    data-week-row-grip={project.id}
                    onPointerDown={startRowDrag("projects", key, project.title)}
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-0.5 top-1/2 -translate-y-1/2 cursor-grab touch-none select-none px-0.5 text-[calc(11px*var(--fs))] leading-none text-ink-300 opacity-40 transition hover:text-ink-700 group-hover/row:opacity-100 active:cursor-grabbing"
                  >
                    ⠿
                  </span>
                ) : null}
                <div className="flex min-w-0 flex-1 items-center justify-center gap-1 text-center">
                  {project ? (
                    <span className={cn("h-2 w-2 flex-none rounded-full", tone ? tone.dot : "bg-paper-400")} aria-hidden="true" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      onOpenProject ? onOpenProject(key) : project ? onOpenTask(project.id) : onCreateTaskForProject("")
                    }
                    className="line-clamp-2 min-w-0 max-w-full break-keep text-center text-[calc(14px*var(--fs))] font-semibold leading-[1.15] text-ink-900 hover:text-ink-900"
                    title={project?.title ?? "index"}
                    aria-label={project?.title ?? "index"}
                  >
                    {project?.title ?? "index"}
                  </button>
                </div>
                {project && !narrow ? (
                  <button
                    type="button"
                    onClick={() => onCreateTaskForProject(project.id)}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded px-1 text-[calc(16px*var(--fs))] leading-none text-ink-400 opacity-0 transition hover:text-ink-800 group-hover/row:opacity-100"
                    aria-label="할 일 추가"
                  >
                    +
                  </button>
                ) : null}
              </div>

              {days.map((day) => {
                const cell = row.tasks.filter((task) => task.date === day || task.due === day);
                return (
                  <div
                    key={day}
                    data-drop-zone="week-task-day"
                    data-drop-day={day}
                    data-drop-project={key}
                    data-week-task-day={day}
                    data-week-project-cell={`${project?.title ?? "index"}:${day}`}
                    onClick={(event) => {
                      /* A19: 폰에서는 칸이 좁아, 칸을 한 번 누르면 그 날 이 프로젝트의 할 일을
                         모아 보여 주고 거기서 새 할 일도 더합니다(할 일 줄을 누른 경우는 빼고).
                         A32: PC에서도 똑같이 — 바로 수정 화면으로 들어가지 않고 정리된 목록이
                         먼저 열립니다. */
                      if ((event.target as HTMLElement).closest("[data-week-task]")) return;
                      setCellSheet({ key, title: project?.title ?? "index", day });
                    }}
                    className={cn(
                      "min-h-[2rem] border-l border-paper-300/80 py-0.5",
                      narrow ? "px-[3px]" : "px-1",
                      isSameISO(day, today) && todayCell,
                    )}
                  >
                    <div className={cn(narrow ? "space-y-1.5" : "space-y-1")}>
                      {cell.map((task) => {
                        const done = task.status === "완료";
                        const waiting = task.status === "대기 중";
                        const canceled = task.status === "취소";
                        const priority = priorityOf(task);
                        const taskColor = categoryColor.toneOf(task.category, taskTone(task.category));
                        const memoLine = task.memo ? task.memo.split(/\r?\n/)[0]!.trim() : "";
                        return (
                          <div
                            key={task.id}
                            data-week-task={task.id}
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => {
                              if (!onMoveTask && !onMoveTaskToProject) return;
                              dnd.start(
                                event,
                                { kind: "task", id: task.id, label: task.title },
                                (target) => {
                                  /* A35: 게시판에서 바로 다른 프로젝트 행·다른 날로 끌어도 됩니다. */
                                  if (!target) return;
                                  if (target.zone === "week-task-day" || target.zone === "week-project-row") {
                                    applyTaskDrop(task, day, key, target);
                                    return;
                                  }
                                  /* A42: 일정 목록 칸에 놓으면 그 날의 종일 일정으로 바꿉니다. */
                                  if (target.zone === "week-day-list") {
                                    onConvertTaskToEvent?.(task.id, target.data.day ?? day, null);
                                  }
                                },
                                {
                                  getHint: (target) => {
                                    if (target.zone === "week-day-list") {
                                      const stamp = (target.data.day ?? day).slice(5).replace("-", "/");
                                      return `${stamp} 종일 일정으로 옮기기`;
                                    }
                                    return taskDropHint(day, key, target);
                                  },
                                },
                              );
                            }}
                            title={canceled ? `취소${task.cancelReason ? ` · ${task.cancelReason}` : ""}` : "끌어서 다른 날짜로 옮기기"}
                            className={cn("flex items-start", narrow ? "gap-0.5" : "gap-1", canceled && "opacity-45")}
                          >
                            {narrow ? null : (
                              <button
                                type="button"
                                onClick={() => onToggleTask(task)}
                                aria-label={done ? "완료 취소" : "완료"}
                                className={cn(
                                  "mt-[1px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-[4px] border transition",
                                  done ? cn(taskColor.solid, taskColor.solidText, "border-transparent") : "border-dashed border-ink-300 hover:border-ink-500",
                                )}
                              >
                                {done ? <CheckIcon size={9} /> : null}
                              </button>
                            )}
                            <button
                              type="button"
                              onPointerDown={
                                narrow
                                  ? (event) => {
                                      tapOrigin.current = { id: task.id, x: event.clientX, y: event.clientY, at: Date.now() };
                                    }
                                  : undefined
                              }
                              onClick={(event) => {
                                /* A19: 폰에서는 할 일 제목을 눌러도 그 날 목록 시트로 갑니다 —
                                   체크는 시트 안에서 한 번 더 누르면 됩니다.
                                   A32: PC에서도 같은 목록을 먼저 보여 줍니다(끌기로 옮긴 경우는
                                   dnd가 클릭을 막아 여기 오지 않습니다). */
                                if (!narrow) {
                                  event.stopPropagation();
                                  setCellSheet({ key, title: project?.title ?? "index", day });
                                  return;
                                }
                                const origin = tapOrigin.current;
                                tapOrigin.current = null;
                                const travelled = origin && origin.id === task.id ? Math.hypot(event.clientX - origin.x, event.clientY - origin.y) : 0;
                                if (travelled > 10) return;
                                event.stopPropagation();
                                setCellSheet({ key, title: project?.title ?? "index", day });
                              }}
                              aria-label={narrow ? `${task.title} ${done ? "완료 해제" : "완료"}` : undefined}
                              title={narrow ? (done ? "한 번 더 누르면 완료 해제" : "한 번 누르면 완료") : undefined}
                              className="min-w-0 flex-1 touch-manipulation select-none text-left"
                            >
                              <span className={cn("flex gap-1", narrow ? "items-start" : "items-center")}>
                                {!narrow && task.startTime ? (
                                  <span className="flex-none text-[0.6rem] tabular-nums text-ink-400">
                                    {timeRangeLabel(task.startTime, task.endTime)}
                                  </span>
                                ) : null}
                                {narrow && done ? (
                                  <span className={cn("mt-[5px] h-[5px] w-[5px] flex-none rounded-full", taskColor.solid)} />
                                ) : null}
                                <span
                                  className={cn(
                                    "min-w-0 text-ink-800",
                                    /* 두 줄까지는 그대로 보여 주고, 그 뒤에야 …으로 줄입니다. */
                                    "line-clamp-2 break-keep text-[calc(14px*var(--fs))] leading-[1.2]",
                                    (done || canceled) && "text-ink-400 line-through",
                                  )}
                                >
                                  {task.title}
                                </span>
                                {canceled ? (
                                  <span className="flex-none rounded bg-paper-200 px-1 text-[calc(11px*var(--fs))] font-medium leading-[1.4] text-ink-500">취소</span>
                                ) : null}
                                {!narrow && priority !== "기타" ? (
                                  <span
                                    className={cn(
                                      "h-[5px] w-[5px] flex-none rounded-full",
                                      priority === "긴급·중요" ? "bg-red-500" : priority === "중요" ? "bg-blue-500" : "bg-amber-500",
                                    )}
                                  />
                                ) : null}
                                {!narrow && waiting ? (
                                  <span className="flex-none rounded bg-paper-200 px-1 text-[calc(12px*var(--fs))] font-medium leading-[1.4] text-ink-500">대기</span>
                                ) : null}
                              </span>
                              {narrow && (priority !== "기타" || waiting || !!task.startTime) ? (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                  {task.startTime ? (
                                    <span className="rounded bg-paper-200 px-[3px] text-[0.55rem] tabular-nums leading-[1.35] text-ink-500">
                                      {timeRangeLabel(task.startTime, task.endTime)}
                                    </span>
                                  ) : null}
                                  {priority !== "기타" ? (
                                    <span
                                      className={cn(
                                        "h-[5px] w-[5px] rounded-full",
                                        priority === "긴급·중요" ? "bg-red-500" : priority === "중요" ? "bg-blue-500" : "bg-amber-500",
                                      )}
                                    />
                                  ) : null}
                                  {waiting ? (
                                    <span className="rounded bg-paper-200 px-[3px] text-[calc(11.5px*var(--fs))] font-medium leading-[1.35] text-ink-500">대기</span>
                                  ) : null}
                                </span>
                              ) : null}
                              {memoLine ? (
                                <span className="mt-0.5 block truncate text-[calc(13px*var(--fs))] leading-tight text-ink-400">{memoLine}</span>
                              ) : null}
                            </button>
                            {narrow ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenTask(task.id);
                                }}
                                aria-label="상세 열기"
                                title="상세 열기"
                                className="mt-[1px] flex h-[20px] w-[15px] flex-none items-center justify-center rounded text-ink-300 transition hover:text-ink-800"
                              >
                                <ChevronRightIcon size={11} />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      </section>

      {/* routine rows — 분류 shows as a small badge in each row, so no extra header lines */}
      <section data-week-section="routines" className="flex-none overflow-clip">
        <div className="flex items-center justify-between gap-2 border-b border-paper-300/70 bg-paper-50/60 py-[3px] pl-2 pr-1.5">
          <span className="text-[calc(13.5px*var(--fs))] font-medium text-ink-500">
            루틴{routineTotal > 0 ? ` · ${routineTotal}개` : ""}
          </span>
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              onClick={onCreateRoutine}
              className="rounded-full bg-paper-200 px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
            >
              + 루틴
            </button>
            <button
              type="button"
              onClick={() => setRoutinesCollapsed((open) => !open)}
              aria-expanded={!routinesCollapsed}
              className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
            >
              {routinesCollapsed ? "루틴 영역 펴기" : "루틴 영역 접기"}
              <ChevronDownIcon size={10} className={cn("transition", routinesCollapsed && "rotate-180")} />
            </button>
          </div>
        </div>

        {routinesCollapsed ? null : routineRows.length === 0 ? (
          <div className="px-2 py-2 text-[calc(14px*var(--fs))] text-ink-400">이번 주에 보이는 루틴이 없습니다.</div>
        ) : (
          routineRows.map(({ routine, category }, index) => {
            const target = routine.targetCount ?? 1;
            const tone = routineTone(index);
            const categoryTone = categoryColor.toneOf(category, taskTone(category));
            return (
              <div key={routine.id} className="grid border-t border-paper-300/50" style={grid}>
                <button
                  type="button"
                  data-drop-zone="week-routine-row"
                  data-drop-routine={routine.id}
                  data-week-routine-row={routine.id}
                  onClick={() => onOpenRoutine(routine.id)}
                  className="sticky left-0 z-20 flex min-w-0 items-center gap-1 border-r border-paper-300 bg-white py-[3px] pl-[0.9rem] pr-1 text-left hover:text-ink-900"
                  style={{ position: "sticky" }}
                  title={`${category} · ${routine.title}`}
                >
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`${routine.title} 행 순서 바꾸기`}
                    title="끌어서 행 순서 바꾸기"
                    data-week-row-grip={routine.id}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      startRowDrag("routines", routine.id, routine.title)(event);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-0.5 top-1/2 -translate-y-1/2 cursor-grab touch-none select-none px-0.5 text-[calc(11px*var(--fs))] leading-none text-ink-300 opacity-40 transition hover:text-ink-700 group-hover/row:opacity-100 active:cursor-grabbing"
                  >
                    ⠿
                  </span>
                  <span
                    className={cn(
                      "flex-none rounded px-1 text-[calc(11.5px*var(--fs))] font-medium leading-[1.5]",
                      categoryTone.soft,
                      categoryTone.text,
                    )}
                  >
                    {category}
                  </span>
                  <span className="truncate text-[calc(14px*var(--fs))] text-ink-700">{routine.title}</span>
                </button>
                {days.map((day) => {
                  const scheduled = routine.repeatDays.length === 0 || routine.repeatDays.includes(weekdayKo(day));
                  const count = routineCountForDay(routines, routine, day);
                  const done = count >= target;
                  return (
                    <div
                      key={day}
                      data-week-routine-day={day}
                      className={cn(
                        "flex items-center justify-center border-l border-paper-300/50 py-[3px]",
                        isSameISO(day, today) && todayCell,
                      )}
                    >
                      {scheduled ? (
                        <button
                          type="button"
                          onClick={() => onRoutineCount(routine, day, done ? 0 : count + 1)}
                          title={`${routine.title} · ${count}/${target}`}
                          className={cn(
                            "flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border text-[calc(11.5px*var(--fs))] font-semibold transition",
                            done
                              ? cn(tone.solid, "text-white")
                              : count > 0
                                ? cn(tone.soft, tone.text, "border-transparent")
                                : "border-dashed border-ink-300 hover:border-ink-500",
                          )}
                        >
                          {done ? <CheckIcon size={9} /> : count > 0 ? count : ""}
                        </button>
                      ) : (
                        <span className="h-[3px] w-[3px] rounded-full bg-paper-300" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </section>
      </div>

        </div>
      </div>

      {/*
        A19 · A32: 주간 칸을 누르면 — 그 날 이 프로젝트의 할 일을 한 화면에 모아 보여 주고,
        여기서 새 할 일도 더합니다. 폰에서는 원래 이 화면이었고, 이제 PC에서도 똑같이
        바로 수정 화면으로 들어가지 않고 이 정리된 목록이 먼저 열립니다.
      */}
      {cellSheet ? (
        <div
          ref={cellSheetRef}
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:justify-end"
          data-week-cell-sheet={cellSheet.day}
          data-sheet-dragging={cellSheetDragging ? "true" : undefined}
        >
          <button type="button" aria-label="닫기" onClick={() => setCellSheet(null)} className="absolute inset-0 bg-ink-900/10" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${cellSheet.title} ${sheetDateLabel} 할 일`}
            className="relative z-10 flex max-h-[70dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-paper-300 bg-white pb-[env(safe-area-inset-bottom)] shadow-lift animate-slide-up sm:mt-20 sm:mr-6 sm:max-h-[calc(100dvh-8rem)] sm:w-[24rem] sm:rounded-3xl sm:pb-0"
          >
            <div className="flex items-start gap-3 border-b border-paper-300/80 px-4 pb-2.5 pt-3">
              <div className="min-w-0 flex-1">
                <p className="text-[calc(13.5px*var(--fs))] text-ink-400">
                  이 날 할 일 {sheetTasks.length > 0 ? `· ${sheetTasks.length}개` : ""}
                </p>
                <p className="mt-0.5 truncate text-[calc(16px*var(--fs))] font-semibold text-ink-900">
                  {cellSheet.title} · {sheetDateLabel}
                </p>
              </div>
              <button type="button" onClick={() => setCellSheet(null)} className="icon-btn -mr-1 -mt-1" aria-label="닫기">
                <XIcon size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-sheet-scroll="true">
              {sheetTasks.length === 0 ? (
                <p className="rounded-xl bg-paper-200/50 px-3 py-6 text-center text-[calc(14.5px*var(--fs))] text-ink-400">
                  이 날 이 프로젝트에 예정된 할 일이 없습니다.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sheetTasks.map((task) => {
                    const done = task.status === "완료";
                    const canceled = task.status === "취소";
                    const waiting = task.status === "대기 중";
                    const tone = categoryColor.toneOf(task.category, taskTone(task.category));
                    const memoLine = task.memo ? task.memo.split(/\r?\n/)[0]!.trim() : "";
                    return (
                      <li key={task.id} data-week-cell-task={task.id} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleTask(task)}
                          aria-label={done ? `${task.title} 완료 해제` : `${task.title} 완료`}
                          aria-pressed={done}
                          className={cn(
                            "mt-[3px] flex h-[16px] w-[16px] flex-none items-center justify-center rounded-[4px] border transition",
                            done ? cn(tone.solid, "border-transparent text-white") : "border-dashed border-ink-300 hover:border-ink-500",
                          )}
                        >
                          {done ? <CheckIcon size={9} /> : null}
                        </button>
                        <button
                          type="button"
                          data-week-cell-drag={task.id}
                          onPointerDown={(pointerEvent) => startSheetDrag(pointerEvent, task, cellSheet.day, cellSheet.key)}
                          onClick={() => {
                            setCellSheet(null);
                            onOpenTask(task.id);
                          }}
                          title={onMoveTask ? "끌어서 다른 날짜로 옮기기" : undefined}
                          className="min-w-0 flex-1 select-none text-left"
                        >
                          <span
                            className={cn(
                              "block break-keep text-[calc(15px*var(--fs))] leading-snug",
                              done || canceled ? "text-ink-400 line-through" : "text-ink-800",
                            )}
                          >
                            {task.title}
                          </span>
                          {memoLine ? <span className="mt-0.5 block truncate text-[calc(13px*var(--fs))] text-ink-400">{memoLine}</span> : null}
                        </button>
                        {task.startTime ? (
                          <span className="mt-[3px] flex-none text-[calc(12.5px*var(--fs))] tabular-nums text-ink-400">
                            {timeRangeLabel(task.startTime, task.endTime)}
                          </span>
                        ) : null}
                        {canceled ? (
                          <span className="mt-[2px] flex-none rounded bg-paper-200 px-1 text-[calc(11.5px*var(--fs))] font-medium text-ink-500">취소</span>
                        ) : waiting ? (
                          <span className="mt-[2px] flex-none rounded bg-paper-200 px-1 text-[calc(11.5px*var(--fs))] font-medium text-ink-500">대기</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-paper-300/80 bg-paper-50/60 px-4 py-2.5">
              <button type="button" onClick={() => setCellSheet(null)} className="btn-ghost btn-xs">
                닫기
              </button>
              <button
                type="button"
                data-week-cell-add="true"
                onClick={() => {
                  const target = cellSheet;
                  setCellSheet(null);
                  /* index 행(프로젝트 없음)에서 더한 할 일은 프로젝트 없이 저장됩니다. */
                  onCreateTaskForProject(target.key === INBOX_KEY ? "" : target.key, target.day);
                }}
                className="btn-primary btn-xs"
              >
                + 할 일 추가
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
