"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { isSameISO, timeRangeLabel, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { mergeCategories } from "@/state/categories";
import { priorityOf, projectEmoji, routineTone, taskTone } from "@/components/common/tone";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, XIcon } from "@/components/icons";
import {
  eventCoversDay,
  eventEndMinutes,
  eventStartMinutes,
  routineCountForDay,
} from "@/components/calendar/calendar-utils";
import { Timeline, minutesFromDrop } from "@/components/calendar/Timeline";
import { useDnd } from "@/components/common/dnd";
import { useEventColors } from "@/state/event-colors";
import { useProjectColors } from "@/state/project-colors";
import { useAutoHideScrollbar } from "@/lib/use-auto-hide-scroll";
import { useCategoryColors } from "@/state/category-colors";

interface WeekBoardProps {
  days: string[];
  events: CalendarEvent[];
  tasks: ProjectTask[];
  projects: ProjectTask[];
  routines: Routine[];
  startHour: number;
  endHour: number;
  onSelectDay: (day: string) => void;
  /** A32: 요일 머리글·일정 칸을 누르면 그 날의 정리 목록(종일·시간 일정 + 할 일)을 엽니다. */
  onOpenDaySummary?: (day: string, startTime?: string | null) => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onOpenRoutine: (id: string) => void;
  onCreate: (date: string, time?: string | null) => void;
  onMoveEvent: (id: string, date: string, time: string | null) => void;
  /** A12: a task dragged onto another weekday column changes its date. */
  onMoveTask?: (id: string, date: string, fromDay: string) => void;
  /** A16: an all-day bar dragged to another day (or down to a time slot). */
  onMoveAllDayDate?: (id: string, date: string) => void;
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
}

/** 프로젝트가 없는 할 일은 게시판에서 index 행으로 모입니다. */
const INBOX_KEY = "inbox";
/** A32: 행을 만드는 기준과 똑같이, 이 할 일이 어느 행에 속하는지 돌려줍니다. */
const rowKeyOf = (task: ProjectTask, projects: ProjectTask[]) =>
  projects.find((item) => item.id === (task.projectIds[0] ?? ""))?.id ?? INBOX_KEY;

const snapMinutes = (minutes: number) => Math.round(minutes / 15) * 15;
const toClock = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function WeekBoard({
  days,
  events,
  tasks,
  projects,
  routines,
  startHour,
  endHour,
  onSelectDay,
  onOpenDaySummary,
  onOpenEvent,
  onOpenTask,
  onOpenRoutine,
  onCreate,
  onMoveEvent,
  onMoveTask,
  onMoveAllDayDate,
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
}: WeekBoardProps) {
  const today = todayISO();
  /** 오늘 열은 일정·프로젝트·루틴이 같은 톤으로 이어지도록 한 가지 색을 같이 씁니다.
   *  A20: #e8edf4가 너무 진하다는 요청에 흰 바탕 대비 농도를 절반으로 낮췄습니다(#f4f6fa). */
  const todayCell = "bg-[#f4f6fa]";
  /** A6: the first project row carries the collapse-all control for the whole project area. */
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  /** The routine area folds away as a whole, the same way the project area does. */
  const [routinesCollapsed, setRoutinesCollapsed] = useState(false);
  /** B5: all-day 4건 → 3건 + 펼치기, and the 시간표 lifts when the rows fold. */
  const [allDayExpanded, setAllDayExpanded] = useState(false);
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
  /** 시트 안의 할 일을 꾹 눌러(마우스는 조금 끌어) 다른 날짜 열로 옮깁니다. */
  const startSheetDrag = (event: ReactPointerEvent<HTMLElement>, task: ProjectTask, day: string) => {
    if (!onMoveTask) return;
    dnd.start(
      event,
      { kind: "task", id: task.id, label: task.title },
      (target) => {
        if (!target) return;
        const next = target.data.day;
        if (!next || next === day) return;
        onMoveTask(task.id, next, day);
      },
      {
        onStart: hideCellSheet,
        onEnd: restoreCellSheet,
        getHint: (target) => {
          const next = target.data.day;
          if (!next || next === day) return null;
          return `${next.slice(5).replace("-", "/")}로 옮기기`;
        },
      },
    );
  };
  const [narrow, setNarrow] = useState(false);
  /** Lets the timetable take the full height when the user wants every event at once. */
  const [timeExpanded, setTimeExpanded] = useState(false);
  /** A14: the 일정 area folds away like 프로젝트 and 루틴 do. */
  const [scheduleCollapsed, setScheduleCollapsed] = useState(false);
  /**
   * A2: on a phone the task title itself is the checkbox — one tap completes, another
   * clears it. A tap that turned into a swipe or a scroll must never toggle anything,
   * so the pointer is sampled on down and compared on click.
   */
  const tapOrigin = useRef<{ id: string; x: number; y: number; at: number } | null>(null);
  const { toneFor } = useEventColors();
  const { pastelOf } = useProjectColors();
  /** A19: 분류에 직접 고른 색이 있으면 프로젝트 점·할 일 체크·루틴 배지에 그 색을 씁니다. */
  const categoryColor = useCategoryColors();
  const dnd = useDnd();
  /** A20: 게시판·일정 창 모두 스크롤바가 움직일 때만 보입니다. */
  const boardBar = useAutoHideScrollbar();
  const scheduleBar = useAutoHideScrollbar();
  const scroller = useRef<HTMLDivElement | null>(null);
  /** A19: 일정 영역(종일+시간표)의 스크롤 창 — 지금 시각이 보이도록 처음에 옮깁니다. */
  const scheduleScroll = useRef<HTMLDivElement | null>(null);
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
  /**
   * A19: 데스크톱 기본 보기는 세 시간 남짓만 보이는 스크롤 창입니다. 예전에는 늘 시작 시각(9시)
   * 에서 열려 하루가 지난 뒤에는 현재 시각 빨간 선을 볼 수 없었습니다. 창을 지금 근처로 옮깁니다.
   */
  useEffect(() => {
    if (narrow || timeExpanded || scheduleCollapsed) return;
    const node = scheduleScroll.current;
    if (!node) return;
    const clock = new Date();
    const minutes = clock.getHours() * 60 + clock.getMinutes();
    const top = ((minutes - startHour * 60) / 60) * 32;
    const max = Math.max(0, node.scrollHeight - node.clientHeight);
    node.scrollTop = Math.min(max, Math.max(0, top - 48));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow, timeExpanded, scheduleCollapsed]);

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
    return [...map.entries()]
      .filter(([key]) => mode !== "custom" || !hiddenProjectIds.includes(key))
      .sort((a, b) => {
        if (a[0] === "inbox") return -1;
        if (b[0] === "inbox") return 1;
        const order = { 업무: 0, 개인: 1, 공부: 2 } as const;
        const pa = a[1].project;
        const pb = b[1].project;
        return (order[(pa?.category ?? "개인") as keyof typeof order] ?? 1) - (order[(pb?.category ?? "개인") as keyof typeof order] ?? 1);
      });
  }, [weekTasks, projects, mode, hiddenProjectIds]);

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

  const allDayBars = useMemo(() => {
    const bars: { event: CalendarEvent; startIdx: number; span: number; lane: number }[] = [];
    const laneEnds: number[] = [];
    const allDay = visibleEvents.filter((event) => event.kind === "일정" && event.allDay);
    for (const event of allDay) {
      const covered = days.filter((day) => eventCoversDay(event, day));
      if (covered.length === 0) continue;
      const startIdx = days.indexOf(covered[0]!);
      const span = days.indexOf(covered[covered.length - 1]!) - startIdx + 1;
      let lane = laneEnds.findIndex((end) => end <= startIdx);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(startIdx + span);
      } else {
        laneEnds[lane] = startIdx + span;
      }
      bars.push({ event, startIdx, span, lane });
    }
    return bars;
  }, [visibleEvents, days]);

  /** 종일 줄은 시간표와 스크롤 창을 나눠 쓰므로, 데스크톱에서는 두 줄까지만 펼쳐 둡니다.
   *  모바일은 일정 영역이 딱 네 칸이라 종일 한 줄만 남기고 나머지는 +N으로 접습니다. */
  const allDayVisibleCap = narrow ? 1 : 2;
  /** 종일 줄 아래로 보이는 시간표 높이 — 32px 한 줄 × 세 칸(3시간). */
  const timelineWindow = 96;
  const laneCount = allDayBars.length > 0 ? Math.max(...allDayBars.map((bar) => bar.lane)) + 1 : 0;
  const visibleLanes = allDayExpanded ? laneCount : Math.min(allDayVisibleCap, laneCount);
  /** 종일 줄은 시간표와 같은 스크롤 창 안에 들어가므로 한 줄을 20px로 조입니다. */
  const allDayLane = 20;
  /** 넘친 종일 일정은 그 요일 칸 바로 밑에 +N 버튼으로 펼칩니다. */
  const overflows = laneCount > allDayVisibleCap;
  const hiddenByDay = days.map((_, index) =>
    allDayExpanded
      ? 0
      : allDayBars.filter((bar) => bar.lane >= visibleLanes && index >= bar.startIdx && index < bar.startIdx + bar.span).length,
  );
  const allDayHeight = allDayBars.length === 0 ? 0 : Math.max(visibleLanes, 1) * allDayLane + (overflows ? 15 : 0) + 2;
  const routineTotal = routineGroups.reduce((sum, group) => sum + group.items.length, 0);
  /** A16: no 분류 header rows — each row carries its own badge, sorted by 분류 first. */
  const routineRows = routineGroups.flatMap((group) => group.items.map((routine) => ({ routine, category: group.category })));

  /**
   * 모바일 기본 모드: 시간표를 세 칸만 그립니다(종일 한 칸 + 시간 세 칸 = 네 칸).
   * 지금 한 시간 전부터 세 시간을 보여 주고, 그 안에 아직 끝나지 않은 오늘 일정이 하나도 없으면
   * 다음 일정이 있는 시간대로 창을 옮깁니다. '전체'를 누르면 하루 전체가 펼쳐집니다.
   * 세로 스크롤 창을 만들지 않고 그리는 줄 자체를 줄여, 가로 스크롤에서 왼쪽 열이 붙어 있는
   * sticky 동작이 그대로 남습니다.
   */
  const mobileWindow = (() => {
    if (!narrow || timeExpanded) return null;
    const span = Math.min(3, Math.max(1, endHour - startHour));
    const now = new Date();
    const nowHour = now.getHours();
    const nowMinutes = nowHour * 60 + now.getMinutes();
    const upcoming = visibleEvents
      .filter(
        (event) =>
          event.kind === "일정" &&
          !event.allDay &&
          eventCoversDay(event, today) &&
          eventEndMinutes(event) > nowMinutes,
      )
      .map((event) => eventStartMinutes(event) / 60)
      .sort((a, b) => a - b);
    let start = now.getHours() - 1;
    if (upcoming.length > 0 && !upcoming.some((hour) => hour >= start && hour < start + span)) {
      start = Math.floor(upcoming[0]!);
    }
    /* A19: 설정한 끝 시각을 지나도 창은 지금 시각을 따라갑니다 — 지금 빨간 띠가 사라지지 않게. */
    start = Math.max(startHour, Math.min(start, Math.max(endHour - span, nowHour - span + 1)));
    start = Math.max(startHour, Math.min(start, Math.max(startHour, 24 - span)));
    return { start, end: Math.min(24, start + span) };
  })();

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
        <div className="sticky left-0 z-40 self-stretch border-r border-paper-300 bg-white pb-1 text-right text-[calc(13px*var(--fs))] text-ink-400">
          {allDayBars.length > 0 ? "" : ""}
        </div>
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
        <span className="truncate text-[calc(13.5px*var(--fs))] font-medium text-ink-500">일정</span>
        <div className="seg-track flex-none p-[2px]">
          {([
            { key: "base", label: "기본" },
            { key: "full", label: "전체" },
            { key: "fold", label: "접기" },
          ] as const).map((option) => {
            const active = option.key === "fold" ? scheduleCollapsed : option.key === "full" ? timeExpanded && !scheduleCollapsed : !timeExpanded && !scheduleCollapsed;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (option.key === "fold") {
                    setScheduleCollapsed(true);
                    return;
                  }
                  setScheduleCollapsed(false);
                  setTimeExpanded(option.key === "full");
                }}
                className={cn("seg-item px-2 py-[2px] text-[calc(12.5px*var(--fs))]", active && "seg-item-active")}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {scheduleCollapsed ? null : (
      <div
        ref={scheduleScroll}
        data-week-scroll="true"
        onScroll={scheduleBar.onScroll}
        style={
          narrow
            ? undefined
            : { height: timeExpanded ? "62dvh" : `${Math.min(allDayHeight + timelineWindow, 124)}px` }
        }
        className={cn(
          "relative flex-none",
          narrow ? "overflow-visible" : "overflow-y-auto overflow-x-clip overscroll-contain",
          scheduleBar.className,
        )}
      >
        {/* all-day — 스크롤 창 안, 시간표 바로 위. 접지 않고 같이 올라갑니다. */}
        {allDayBars.length === 0 ? null : (
          <div className="grid border-b border-paper-300/70" style={grid} data-all-day-block="true">
            <div className="sticky left-0 z-20 flex items-start justify-end border-r border-paper-300 bg-white pr-2 pt-1 text-[calc(13px*var(--fs))] text-ink-400">종일</div>
            <div className="relative" style={{ gridColumn: `2 / span ${days.length}`, height: allDayHeight }}>
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((day) => (
                  <div
                    key={day}
                    data-drop-zone="allday-day"
                    data-drop-day={day}
                    onClick={() => {
                      /* A32: 종일 칸의 빈 자리를 눌러도 그 날의 정리 목록이 먼저 열립니다. */
                      if (narrow) return;
                      onOpenDaySummary?.(day);
                    }}
                    className={cn("border-l border-paper-300", isSameISO(day, today) && todayCell)}
                  />
                ))}
              </div>
              {allDayBars.map(({ event, startIdx, span, lane }) => {
                const tone = toneFor(event);
                return (
                  <button
                    key={event.id}
                    type="button"
                    data-all-day-bar={event.id}
                    onPointerDown={(pointerEvent) => {
                      dnd.start(
                        pointerEvent,
                        { kind: "event", id: event.id, label: event.title },
                        (target, point) => {
                          if (!target) return;
                          const nextDay = target.data.day;
                          if (!nextDay) return;
                          if (target.zone === "allday-bar") {
                            const over = target.data.id;
                            if (!over || over === event.id || !onReorderAllDay) return;
                            const ids = allDayBars.map((item) => item.event.id).filter((id) => id !== event.id);
                            const at = ids.indexOf(over);
                            ids.splice(at < 0 ? ids.length : at, 0, event.id);
                            onReorderAllDay(ids);
                            return;
                          }
                          if (target.zone === "allday-day") {
                            onMoveAllDayDate?.(event.id, nextDay);
                            return;
                          }
                          if (target.zone === "timeline-day") {
                            const minutes = minutesFromDrop(target, point);
                            // 다른 날로 옮길 때는 날짜만 — 종일 막대는 종일로 남습니다.
                            if (minutes !== null && nextDay === event.date) onMoveEvent(event.id, nextDay, toClock(snapMinutes(minutes)));
                            else onMoveEvent(event.id, nextDay, null);
                          }
                        },
                        {
                          getHint: (target, point) => {
                            const nextDay = target.data.day;
                            if (!nextDay) return null;
                            const stamp = nextDay.slice(5).replace("-", "/");
                            if (target.zone === "timeline-day") {
                              const minutes = minutesFromDrop(target, point);
                              if (minutes === null || nextDay !== event.date) return `${stamp}로 옮기기`;
                              return `${stamp} ${toClock(snapMinutes(minutes))} 일정으로`;
                            }
                            return target.zone === "allday-day" ? `${stamp} 종일로 옮기기` : null;
                          },
                        },
                      );
                    }}
                    data-drop-zone="allday-bar"
                    data-drop-id={event.id}
                    onClick={(clickEvent) => {
                      /* A32: 종일 막대도 그 일정의 수정 화면이 아니라, 누른 날의 정리 목록을 먼저 엽니다. */
                      if (!narrow && onOpenDaySummary) {
                        const box = clickEvent.currentTarget.getBoundingClientRect();
                        const ratio = box.width > 0 ? (clickEvent.clientX - box.left) / box.width : 0;
                        const offset = Math.max(0, Math.min(span - 1, Math.floor(ratio * span)));
                        onOpenDaySummary(days[startIdx + offset] ?? event.date);
                        return;
                      }
                      onOpenEvent(event.id);
                    }}
                    title={allDayExpanded ? undefined : "끌어서 종일 일정 순서 바꾸기"}
                    className={cn(
                      "absolute h-[19px] overflow-hidden rounded-md border px-1.5 text-left text-[calc(13px*var(--fs))] font-medium leading-[17px] md:px-2 md:text-[calc(13.5px*var(--fs))]",
                      tone.bg,
                      tone.border,
                      tone.text,
                      event.canceled && "line-through opacity-50",
                      /* A34: 완료한 종일 일정도 할 일처럼 줄을 긋습니다. */
                      event.done && "line-through opacity-60",
                    )}
                    style={{
                      left: `calc(${(startIdx * 100) / days.length}% + 2px)`,
                      width: `calc(${(span * 100) / days.length}% - 4px)`,
                      top: lane * allDayLane + 2,
                      display: lane >= visibleLanes ? "none" : "block",
                    }}
                  >
                    <span className="line-clamp-1">{event.title}</span>
                  </button>
                );
              })}
              {/* A16: +N sits under the day column that overflows, not at the row's right end. */}
              {allDayExpanded ? (
                overflows ? (
                  <button
                    type="button"
                    onClick={() => setAllDayExpanded(false)}
                    className="absolute right-1 rounded px-1 text-[calc(12px*var(--fs))] font-medium text-ink-400 hover:text-ink-700"
                    style={{ top: laneCount * allDayLane + 1 }}
                  >
                    접기
                  </button>
                ) : null
              ) : (
                hiddenByDay.map((count, index) =>
                  count > 0 ? (
                    <button
                      key={days[index]}
                      type="button"
                      data-allday-more={days[index]}
                      onClick={() => setAllDayExpanded(true)}
                      aria-label={`${weekdayKo(days[index] ?? "")}요일 종일 일정 ${count}개 더 보기`}
                      className="absolute rounded bg-paper-200/90 text-center text-[calc(11.5px*var(--fs))] font-medium leading-[15px] text-ink-500 transition hover:bg-paper-300/80 hover:text-ink-800"
                      style={{
                        left: `calc(${(index * 100) / days.length}% + 2px)`,
                        width: `calc(${100 / days.length}% - 4px)`,
                        top: visibleLanes * allDayLane + 1,
                      }}
                    >
                      +{count} 더
                    </button>
                  ) : null,
                )
              )}
            </div>
          </div>
        )}

        {/* timeline — the same scroll window as 종일, so the two move together. */}
        <Timeline
          days={days}
          events={visibleEvents.filter((event) => event.kind === "일정")}
          startHour={mobileWindow ? mobileWindow.start : startHour}
          endHour={mobileWindow ? mobileWindow.end : endHour}
          fixedWindow={!!mobileWindow}
          hourHeight={timeExpanded ? 40 : 32}
          gutterWidth={gutter}
          onOpenEvent={onOpenEvent}
          onOpenEventDay={
            narrow || !onOpenDaySummary ? undefined : (_id, day) => onOpenDaySummary(day)
          }
          onClickEmptyDay={
            narrow || !onOpenDaySummary ? undefined : (day, time) => onOpenDaySummary(day, time)
          }
          onCreate={onCreate}
          onMoveEvent={onMoveEvent}
          onMoveAllDayDate={onMoveAllDayDate}
          onResizeEvent={onResizeEvent}
        />
      </div>
      )}
      </section>

      {/* attached project rows — A18: 프로젝트는 몇 개든 접기 전까지 전부 펼쳐 둡니다.
          안쪽에 세로 스크롤 창을 만들지 않고, 내용이 길면 게시판 전체가 길어집니다. */}
      <section
        data-week-section="projects"
        data-week-projects="true"
        className={cn("overflow-clip border-b-2 border-[#6b7280]", narrow ? "flex-none" : "min-h-fit flex-1")}
      >
      <div>
        <div className="flex items-center justify-between border-b border-paper-300/70 bg-paper-50/60 py-[3px] pl-2 pr-1.5">
          <span className="text-[calc(13.5px*var(--fs))] font-medium text-ink-500">프로젝트</span>
          <button
            type="button"
            onClick={() => setProjectsCollapsed((open) => !open)}
            aria-expanded={!projectsCollapsed}
            className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
          >
            {projectsCollapsed ? "프로젝트 영역 펴기" : "프로젝트 영역 접기"}
            <ChevronDownIcon size={10} className={cn("transition", projectsCollapsed && "rotate-180")} />
          </button>
        </div>
        {projectsCollapsed ? null : rows.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[calc(14px*var(--fs))] text-ink-400">이번 주에 예정된 할 일이 없습니다.</div>
        ) : null}
        {projectsCollapsed ? null : rows.map(([key, row]) => {
          const project = row.project;
          const tone = project ? categoryColor.toneOf(project.category, taskTone(project.category)) : null;
          return (
            <div key={key} className="grid border-b border-paper-300/80 last:border-b-0" style={grid}>
              {/* A19: 프로젝트 이름(색 점 포함, index 행 포함)은 왼쪽 열 안에서 가로·세로 가운데로
                  모읍니다. 예전에는 이름이 왼쪽 벽에 붙어 있었습니다. */}
              <div
                className={cn(
                  "group/row relative sticky left-0 z-20 flex min-h-[2rem] items-center justify-center border-r border-paper-300 px-1 py-0.5 text-center",
                  project ? pastelOf(project.id).bg : "bg-white",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center justify-center gap-1 text-center">
                  {project ? (
                    <span className={cn("h-2 w-2 flex-none rounded-full", tone ? tone.dot : "bg-paper-400")} aria-hidden="true" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => (project ? onOpenTask(project.id) : onCreateTaskForProject(""))}
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
                              if (!onMoveTask) return;
                              dnd.start(
                                event,
                                { kind: "task", id: task.id, label: task.title },
                                (target) => {
                                  if (!target) return;
                                  if (target.zone === "week-task-day") {
                                    const next = target.data.day;
                                    if (next && next !== day) onMoveTask(task.id, next, day);
                                    return;
                                  }
                                  if (target.zone === "timeline-day") {
                                    const next = target.data.day;
                                    // 시간표 칸에 놓아도 할 일은 그 날로만 옮깁니다 — 정해 둔 시각은 그대로.
                                    if (next) onMoveTask(task.id, next, day);
                                  }
                                },
                                {
                                  getHint: (target) => {
                                    const next = target.data.day;
                                    if (!next || next === day) return null;
                                    return `${next.slice(5).replace("-", "/")}로 옮기기`;
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
                  onClick={() => onOpenRoutine(routine.id)}
                  className="sticky left-0 z-20 flex min-w-0 items-center gap-1 border-r border-paper-300 bg-white py-[3px] pl-1.5 pr-1 text-left hover:text-ink-900"
                  title={`${category} · ${routine.title}`}
                >
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
                          onPointerDown={(pointerEvent) => startSheetDrag(pointerEvent, task, cellSheet.day)}
                          onClick={() => {
                            setCellSheet(null);
                            onOpenTask(task.id);
                          }}
                          title={onMoveTask ? "끌어서 다른 날짜로 옮기기" : undefined}
                          className="min-w-0 flex-1 text-left"
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
