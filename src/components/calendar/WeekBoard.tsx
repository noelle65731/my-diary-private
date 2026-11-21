"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { isSameISO, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone, priorityOf, projectEmoji, routineTone, taskTone } from "@/components/common/tone";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { eventCoversDay, routineCountForDay } from "@/components/calendar/calendar-utils";
import { Timeline, minutesFromDrop } from "@/components/calendar/Timeline";
import { useDnd } from "@/components/common/dnd";

interface WeekBoardProps {
  days: string[];
  events: CalendarEvent[];
  tasks: ProjectTask[];
  projects: ProjectTask[];
  routines: Routine[];
  startHour: number;
  endHour: number;
  onSelectDay: (day: string) => void;
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
  onCreateTaskForProject: (projectId: string) => void;
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
  /** A6: the first project row carries the collapse-all control for the whole project area. */
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  /** The routine area folds away as a whole, the same way the project area does. */
  const [routinesCollapsed, setRoutinesCollapsed] = useState(false);
  /** B5: all-day 4건 → 3건 + 펼치기, and the 시간표 lifts when the rows fold. */
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
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
  const dnd = useDnd();
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
  const gutter = narrow ? "3.2rem" : "7.6rem";
  const grid = useMemo(
    () => ({ gridTemplateColumns: `${gutter} repeat(${days.length}, minmax(0, 1fr))` }),
    [days.length, gutter],
  );

  const visibleEvents = events.filter((event) => !event.trash);
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

  const routineGroups = useMemo(() => {
    const active = routines.filter(
      (routine) =>
        routine.kind === "루틴" &&
        !routine.trash &&
        !routine.history &&
        (mode !== "custom" || !hiddenRoutineIds.includes(routine.id)),
    );
    return (["개인", "공부"] as const)
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

  /** 종일 줄은 시간표와 스크롤 창을 나눠 쓰므로, 데스크톱에서는 두 줄까지만 펼쳐 둡니다. */
  const allDayVisibleCap = narrow ? 3 : 2;
  /** 종일 줄 아래로 보이는 시간표 높이 — 32px 한 줄 × 약 3시간. */
  const timelineWindow = 132;
  const laneCount = allDayBars.length > 0 ? Math.max(...allDayBars.map((bar) => bar.lane)) + 1 : 0;
  const visibleLanes = allDayExpanded ? laneCount : Math.min(allDayVisibleCap, laneCount);
  const hiddenBars = allDayExpanded ? 0 : allDayBars.filter((bar) => bar.lane >= allDayVisibleCap).length;
  /** 종일 줄은 시간표와 같은 스크롤 창 안에 들어가므로 한 줄을 20px로 조입니다. */
  const allDayLane = 20;
  const allDayHeight = allDayBars.length === 0 ? 0 : Math.max(visibleLanes, 1) * allDayLane + (hiddenBars > 0 ? 15 : 0) + 2;
  const routineTotal = routineGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* A2: on a phone the board keeps readable column widths and scrolls sideways a little,
          so an 8–10 character title is never squeezed into two letters per line. */}
      <div
        ref={scroller}
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col", narrow && "-mx-1 overflow-x-auto overscroll-x-contain pb-1")}
      >
        <div className={cn("flex min-h-0 flex-col", narrow && "min-w-[42rem]")}>
      {mode === "custom" ? (
        <div className="mb-2 rounded-xl border border-paper-300 bg-paper-50/70 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setCustomOpen((open) => !open)}
            aria-expanded={customOpen}
            className="flex w-full items-center justify-between text-left text-[14px] font-medium text-ink-700"
          >
            <span>맞춤 · 프로젝트 {projects.length}개 · 루틴 {routines.filter((item) => item.kind === "루틴" && !item.history && !item.trash).length}개</span>
            <span className="text-[13.5px] font-normal text-ink-400">{customOpen ? "접기" : "숨길 항목 고르기"}</span>
          </button>
          {customOpen ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[13px] text-ink-400">프로젝트</p>
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
                          "rounded-full border px-2 py-0.5 text-[13.5px]",
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
                <p className="mb-1 text-[13px] text-ink-400">루틴</p>
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
                            "rounded-full border px-2 py-0.5 text-[13.5px]",
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
      {/* week day header */}
      <div className="grid flex-none items-end border-b border-paper-300 pb-1" style={grid} data-week-header="true">
        <div className="sticky left-0 z-20 self-stretch bg-white pb-1 text-right text-[13px] text-ink-400">
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
              onClick={() => onSelectDay(day)}
              className="flex flex-col items-center gap-0.5 pb-0.5 pt-1.5 transition hover:bg-paper-200/40"
            >
              <span className={cn("text-[14px]", dow === 6 ? "text-blue-500" : dow === 0 ? "text-red-400" : "text-ink-400")}>
                {weekdayKo(day)}
              </span>
              <span
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[18px] font-semibold leading-none tabular-nums md:h-9 md:min-w-9 md:text-[20px]",
                  isToday
                    ? "bg-ink-900 text-white"
                    : holiday || dow === 0
                      ? "text-red-500"
                      : dow === 6
                        ? "text-blue-600"
                        : "text-ink-900",
                )}
              >
                {String(Number(day.slice(8, 10)))}
              </span>
              {holiday ? <span className="max-w-full truncate text-[12.5px] text-red-500">{holiday}</span> : null}
            </button>
          );
        })}
      </div>

      {/* 종일·시간표 — 한 스크롤 창: 종일을 따로 고정하지 않고 시간표와 함께 위아래로 움직이며,
          창 높이는 약 3시간(≈3줄)만 보이도록 압축했습니다. */}
      <div className="flex flex-none items-center justify-between gap-2 border-b border-paper-300/70 px-1 py-[2px]">
        <span className="truncate text-[13px] text-ink-500">일정</span>
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
                className={cn("seg-item px-2 py-[2px] text-[12.5px]", active && "seg-item-active")}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {scheduleCollapsed ? null : (
      <div
        data-week-scroll="true"
        style={
          narrow
            ? undefined
            : { height: timeExpanded ? "62dvh" : `${Math.min(allDayHeight + timelineWindow, 206)}px` }
        }
        className={cn(
          "relative flex-none border-b border-paper-300/60",
          narrow ? "overflow-visible" : "overflow-y-auto overflow-x-clip overscroll-contain",
        )}
      >
        {/* all-day — 스크롤 창 안, 시간표 바로 위. 접지 않고 같이 올라갑니다. */}
        {allDayBars.length === 0 ? null : (
          <div className="grid border-b border-paper-300/70" style={grid} data-all-day-block="true">
            <div className="sticky left-0 z-20 flex items-start justify-end bg-white pr-2 pt-1 text-[13px] text-ink-400">종일</div>
            <div className="relative" style={{ gridColumn: `2 / span ${days.length}`, height: allDayHeight }}>
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((day) => (
                  <div
                    key={day}
                    data-drop-zone="allday-day"
                    data-drop-day={day}
                    className="border-l border-paper-300"
                  />
                ))}
              </div>
              {allDayBars.map(({ event, startIdx, span, lane }) => {
                const tone = categoryTone(event.category);
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
                            if (minutes !== null) onMoveEvent(event.id, nextDay, toClock(snapMinutes(minutes)));
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
                              return minutes === null ? `${stamp}로 옮기기` : `${stamp} ${toClock(snapMinutes(minutes))} 일정으로`;
                            }
                            return target.zone === "allday-day" ? `${stamp} 종일로 옮기기` : null;
                          },
                        },
                      );
                    }}
                    data-drop-zone="allday-bar"
                    data-drop-id={event.id}
                    onClick={() => onOpenEvent(event.id)}
                    title={allDayExpanded ? undefined : "끌어서 종일 일정 순서 바꾸기"}
                    className={cn(
                      "absolute h-[19px] overflow-hidden rounded-md border px-1.5 text-left text-[13px] font-medium leading-[17px] md:px-2 md:text-[13.5px]",
                      tone.bg,
                      tone.border,
                      tone.text,
                      event.canceled && "line-through opacity-50",
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
              {laneCount > allDayVisibleCap ? (
                <button
                  type="button"
                  onClick={() => setAllDayExpanded((open) => !open)}
                  className="absolute bottom-0 right-1 rounded px-1 text-[12px] font-medium text-ink-400 hover:text-ink-700"
                >
                  {allDayExpanded ? "접기" : `+${hiddenBars} 더 · 펼치기`}
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* timeline — the same scroll window as 종일, so the two move together. */}
        <Timeline
          days={days}
          events={visibleEvents.filter((event) => event.kind === "일정")}
          startHour={startHour}
          endHour={endHour}
          hourHeight={timeExpanded ? 40 : 32}
          gutterWidth={gutter}
          onOpenEvent={onOpenEvent}
          onCreate={onCreate}
          onMoveEvent={onMoveEvent}
          onResizeEvent={onResizeEvent}
        />
      </div>
      )}

      {/* attached project rows — they share the rest of the screen and scroll together */}
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-t border-paper-300">
        <div className="flex items-center justify-between border-b border-paper-300/70 bg-paper-50/50 px-2 py-[3px]">
          <span className="text-[13.5px] text-ink-400">프로젝트</span>
          <button
            type="button"
            onClick={() => setProjectsCollapsed((open) => !open)}
            aria-expanded={!projectsCollapsed}
            className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-[2px] text-[13px] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
          >
            {projectsCollapsed ? "프로젝트 영역 펴기" : "프로젝트 영역 접기"}
            <ChevronDownIcon size={10} className={cn("transition", projectsCollapsed && "rotate-180")} />
          </button>
        </div>
        {projectsCollapsed ? null : rows.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[14px] text-ink-400">이번 주에 예정된 할 일이 없습니다.</div>
        ) : null}
        {projectsCollapsed ? null : rows.map(([key, row]) => {
          const project = row.project;
          const tone = project ? taskTone(project.category) : null;
          return (
            <div key={key} className="grid border-b border-paper-300/80" style={grid}>
              <div className="sticky left-0 z-20 flex min-h-[2rem] items-center gap-1 bg-white py-0.5 pr-1">
                {project ? (
                  <span className={cn("h-2 w-2 flex-none rounded-full", tone ? tone.dot : "bg-paper-400")} aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  onClick={() => (project ? onOpenTask(project.id) : onCreateTaskForProject(""))}
                  className="min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold text-ink-900 hover:text-ink-900"
                  title={project?.title ?? "받은함"}
                  aria-label={project?.title ?? "받은함"}
                >
                  {project?.title ?? "받은함"}
                </button>
                {project && !narrow ? (
                  <button
                    type="button"
                    onClick={() => onCreateTaskForProject(project.id)}
                    className="flex-none rounded px-1 text-[16px] leading-none text-ink-300 hover:text-ink-600"
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
                    className={cn("min-h-[2rem] border-l border-paper-300/80 py-0.5", narrow ? "px-[3px]" : "px-1")}
                  >
                    <div className={cn(narrow ? "space-y-1.5" : "space-y-1")}>
                      {cell.map((task) => {
                        const done = task.status === "완료";
                        const waiting = task.status === "대기 중";
                        const canceled = task.status === "취소";
                        const priority = priorityOf(task);
                        const taskColor = taskTone(task.category);
                        const memoLine = task.memo ? task.memo.split(/\r?\n/)[0]!.trim() : "";
                        return (
                          <div
                            key={task.id}
                            data-week-task={task.id}
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
                                    if (next) onMoveEvent(task.id, next, null);
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
                            className={cn("flex items-start", narrow ? "gap-0.5" : "gap-1.5", canceled && "opacity-45")}
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
                                if (!narrow) {
                                  onOpenTask(task.id);
                                  return;
                                }
                                const origin = tapOrigin.current;
                                tapOrigin.current = null;
                                const travelled = origin && origin.id === task.id ? Math.hypot(event.clientX - origin.x, event.clientY - origin.y) : 0;
                                const elapsed = origin ? Date.now() - origin.at : 0;
                                if (travelled > 10 || elapsed > 900) return;
                                onToggleTask(task);
                              }}
                              aria-label={narrow ? `${task.title} ${done ? "완료 해제" : "완료"}` : undefined}
                              title={narrow ? (done ? "한 번 더 누르면 완료 해제" : "한 번 누르면 완료") : undefined}
                              className="min-w-0 flex-1 touch-manipulation select-none text-left"
                            >
                              <span className={cn("flex gap-1", narrow ? "items-start" : "items-center")}>
                                {narrow && done ? (
                                  <span className={cn("mt-[5px] h-[5px] w-[5px] flex-none rounded-full", taskColor.solid)} />
                                ) : null}
                                <span
                                  className={cn(
                                    "min-w-0 text-ink-800",
                                    narrow
                                      ? "line-clamp-2 break-words text-[14px] leading-[1.2]"
                                      : "truncate text-[14px] leading-[1.25]",
                                    (done || canceled) && "text-ink-400 line-through",
                                  )}
                                >
                                  {task.title}
                                </span>
                                {canceled ? (
                                  <span className="flex-none rounded bg-paper-200 px-1 text-[11px] font-medium leading-[1.4] text-ink-500">취소</span>
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
                                  <span className="flex-none rounded bg-paper-200 px-1 text-[12px] font-medium leading-[1.4] text-ink-500">대기</span>
                                ) : null}
                              </span>
                              {narrow && (priority !== "기타" || waiting) ? (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                  {priority !== "기타" ? (
                                    <span
                                      className={cn(
                                        "h-[5px] w-[5px] rounded-full",
                                        priority === "긴급·중요" ? "bg-red-500" : priority === "중요" ? "bg-blue-500" : "bg-amber-500",
                                      )}
                                    />
                                  ) : null}
                                  {waiting ? (
                                    <span className="rounded bg-paper-200 px-[3px] text-[11.5px] font-medium leading-[1.35] text-ink-500">대기</span>
                                  ) : null}
                                </span>
                              ) : null}
                              {memoLine ? (
                                <span className="mt-0.5 block truncate text-[13px] leading-tight text-ink-400">{memoLine}</span>
                              ) : null}
                            </button>
                            {narrow ? (
                              <button
                                type="button"
                                onClick={() => onOpenTask(task.id)}
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

      {/* routine rows — the whole routine area folds away like the project area */}
      <div className="border-t border-paper-300">
        <div className="flex items-center justify-between border-b border-paper-300/70 bg-paper-50/50 px-2 py-[3px]">
          <span className="text-[13.5px] text-ink-400">
            루틴{routineTotal > 0 ? ` · ${routineTotal}개` : ""}
          </span>
          <button
            type="button"
            onClick={() => setRoutinesCollapsed((open) => !open)}
            aria-expanded={!routinesCollapsed}
            className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-[2px] text-[13px] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
          >
            {routinesCollapsed ? "루틴 영역 펴기" : "루틴 영역 접기"}
            <ChevronDownIcon size={10} className={cn("transition", routinesCollapsed && "rotate-180")} />
          </button>
        </div>
      </div>
      {routinesCollapsed ? null : routineGroups.map((group) => (
        <div key={group.category} className="border-b border-paper-300/80">
          <div className="grid" style={grid}>
            <div className="sticky left-0 z-20 flex items-center gap-1.5 bg-white py-1 pl-0.5 text-[13.5px] text-ink-500">
              <span className={cn("h-[5px] w-[5px] rounded-full", group.category === "개인" ? "bg-amber-400" : "bg-dusk-500")} />
              {group.category}
            </div>
            <div style={{ gridColumn: `2 / span ${days.length}` }} />
          </div>
          {group.items.map((routine, index) => {
            const target = routine.targetCount ?? 1;
            const tone = routineTone(index);
            return (
              <div key={routine.id} className="grid border-t border-paper-300/50" style={grid}>
                <button
                  type="button"
                  onClick={() => onOpenRoutine(routine.id)}
                  className="sticky left-0 z-20 flex min-w-0 items-center gap-1 bg-white py-[3px] pr-1 text-left text-[14px] text-ink-700 hover:text-ink-900 md:gap-1.5 md:pr-2 md:text-[14px]"
                >
                  <span className={cn("h-[5px] w-[5px] flex-none rounded-full", tone.dot)} />
                  <span className="truncate">{routine.title}</span>
                </button>
                {days.map((day) => {
                  const scheduled = routine.repeatDays.length === 0 || routine.repeatDays.includes(weekdayKo(day));
                  const count = routineCountForDay(routines, routine, day);
                  const done = count >= target;
                  return (
                    <div key={day} className="flex items-center justify-center border-l border-paper-300/50 py-[3px]">
                      {scheduled ? (
                        <button
                          type="button"
                          onClick={() => onRoutineCount(routine, day, done ? 0 : count + 1)}
                          title={`${routine.title} · ${count}/${target}`}
                          className={cn(
                            "flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border text-[11.5px] font-semibold transition",
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
          })}
          <div className="grid" style={grid}>
            <button
              type="button"
              onClick={onCreateRoutine}
              className="sticky left-0 z-20 bg-white py-1 pl-0.5 text-left text-[14px] text-ink-400 hover:text-ink-700"
            >
              + 루틴
            </button>
            <div style={{ gridColumn: `2 / span ${days.length}` }} />
          </div>
        </div>
      ))}

      {routinesCollapsed ? null : routineGroups.length === 0 ? (
        <div className="grid border-b border-paper-300/80" style={grid}>
          <div className="sticky left-0 z-20 bg-white py-1.5 text-[14px] text-ink-400">루틴</div>
          <button
            type="button"
            onClick={onCreateRoutine}
            className="sticky left-0 z-20 bg-white py-1.5 text-left text-[14px] text-ink-400 hover:text-ink-700"
            style={{ gridColumn: `2 / span ${days.length}` }}
          >
            + 루틴 추가
          </button>
        </div>
      ) : null}

        </div>
      </div>
      </div>
      <p className="px-1 pb-0.5 text-[12.5px] text-ink-400">
        {narrow
          ? "요일을 옆으로 밀어도 왼쪽 시간은 그대로 보입니다. 할 일 제목을 한 번 누르면 완료, 다시 누르면 해제되고 오른쪽 › 를 누르면 상세가 열립니다."
          : "종일과 시간표는 한 칸에서 함께 스크롤되고 ‘전체 일정 보기’로 넓게 볼 수 있습니다. 빈 칸을 누르면 일정이 추가되고, 일정 블록은 끌어서 옮길 수 있습니다."}
      </p>
    </div>
  );
}
