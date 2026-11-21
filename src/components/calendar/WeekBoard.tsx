"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { isSameISO, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone, priorityOf, projectEmoji, routineTone, taskTone } from "@/components/common/tone";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { eventCoversDay, routineCountForDay } from "@/components/calendar/calendar-utils";
import { Timeline } from "@/components/calendar/Timeline";

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
  /** B5: all-day 4건 → 3건 + 펼치기, and the 시간표 lifts when the rows fold. */
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  /** Lets the timetable take the full height when the user wants every event at once. */
  const [timeExpanded, setTimeExpanded] = useState(false);
  /**
   * A2: on a phone the task title itself is the checkbox — one tap completes, another
   * clears it. A tap that turned into a swipe or a scroll must never toggle anything,
   * so the pointer is sampled on down and compared on click.
   */
  const tapOrigin = useRef<{ id: string; x: number; y: number; at: number } | null>(null);
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
  const gutter = narrow ? "2.6rem" : "7.6rem";
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

  const laneCount = allDayBars.length > 0 ? Math.max(...allDayBars.map((bar) => bar.lane)) + 1 : 0;
  const visibleLanes = allDayExpanded ? laneCount : Math.min(3, laneCount);
  const hiddenBars = allDayExpanded ? 0 : allDayBars.filter((bar) => bar.lane >= 3).length;
  const allDayHeight = Math.max(visibleLanes, 1) * 26 + (hiddenBars > 0 ? 18 : 0) + 8;

  return (
    <div className="min-w-0">
      {/* A2: on a phone the board keeps readable column widths and scrolls sideways a little,
          so an 8–10 character title is never squeezed into two letters per line. */}
      <div
        ref={scroller}
        className={cn("min-w-0", narrow && "-mx-1 overflow-x-auto overscroll-x-contain pb-1")}
      >
        <div className={cn(narrow && "min-w-[42rem]")}>
      {mode === "custom" ? (
        <div className="mb-2 rounded-xl border border-paper-300 bg-paper-50/70 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setCustomOpen((open) => !open)}
            aria-expanded={customOpen}
            className="flex w-full items-center justify-between text-left text-[0.7rem] font-medium text-ink-700"
          >
            <span>맞춤 · 프로젝트 {projects.length}개 · 루틴 {routines.filter((item) => item.kind === "루틴" && !item.history && !item.trash).length}개</span>
            <span className="text-[0.64rem] font-normal text-ink-400">{customOpen ? "접기" : "숨길 항목 고르기"}</span>
          </button>
          {customOpen ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[0.62rem] text-ink-400">프로젝트</p>
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
                          "rounded-full border px-2 py-0.5 text-[0.66rem]",
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
                <p className="mb-1 text-[0.62rem] text-ink-400">루틴</p>
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
                            "rounded-full border px-2 py-0.5 text-[0.66rem]",
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
      <div className="grid items-end border-b border-paper-300 pb-1" style={grid}>
        <div className="sticky left-0 z-20 bg-white pb-1 text-right text-[0.62rem] text-ink-400">
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
              <span className={cn("text-[0.68rem]", dow === 6 ? "text-blue-500" : dow === 0 ? "text-red-400" : "text-ink-400")}>
                {weekdayKo(day)}
              </span>
              <span
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[1.05rem] font-semibold leading-none tabular-nums md:h-9 md:min-w-9 md:text-[1.18rem]",
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
              {holiday ? <span className="max-w-full truncate text-[0.58rem] text-red-500">{holiday}</span> : null}
            </button>
          );
        })}
      </div>

      {/* all-day */}
      <div className="grid border-b border-paper-300" style={grid}>
        <div className="sticky left-0 z-20 flex items-start justify-end bg-white pr-2 pt-1.5 text-[0.62rem] text-ink-400">종일</div>
        <div className="relative" style={{ gridColumn: `2 / span ${days.length}`, height: allDayHeight }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day) => (
              <div key={day} className="border-l border-paper-300" />
            ))}
          </div>
          {allDayBars.map(({ event, startIdx, span, lane }) => {
            const tone = categoryTone(event.category);
            return (
              <button
                key={event.id}
                type="button"
                draggable={!!onReorderAllDay}
                onDragStart={(dragEvent) => {
                  dragEvent.dataTransfer.setData("text/diary-allday", event.id);
                  dragEvent.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(dragEvent) => {
                  if (dragEvent.dataTransfer.types.includes("text/diary-allday")) dragEvent.preventDefault();
                }}
                onDrop={(dropEvent) => {
                  const dragged = dropEvent.dataTransfer.getData("text/diary-allday");
                  if (!dragged || dragged === event.id) return;
                  dropEvent.preventDefault();
                  const ids = allDayBars.map((bar) => bar.event.id).filter((id) => id !== dragged);
                  const at = ids.indexOf(event.id);
                  ids.splice(at < 0 ? ids.length : at, 0, dragged);
                  onReorderAllDay?.(ids);
                }}
                onClick={() => onOpenEvent(event.id)}
                title={allDayExpanded ? undefined : "끌어서 종일 일정 순서 바꾸기"}
                className={cn(
                  "absolute h-[22px] overflow-hidden rounded-md border px-1.5 text-left text-[0.62rem] font-medium leading-[20px] md:px-2 md:text-[0.68rem]",
                  tone.bg,
                  tone.border,
                  tone.text,
                  event.canceled && "line-through opacity-50",
                )}
                style={{
                  left: `calc(${(startIdx * 100) / days.length}% + 2px)`,
                  width: `calc(${(span * 100) / days.length}% - 4px)`,
                  top: lane * 26 + 4,
                  display: lane >= visibleLanes ? "none" : "block",
                }}
              >
                <span className="line-clamp-1">{event.title}</span>
              </button>
            );
          })}
          {laneCount > 3 ? (
            <button
              type="button"
              onClick={() => setAllDayExpanded((open) => !open)}
              className="absolute bottom-0 right-1 rounded px-1 text-[0.58rem] font-medium text-ink-400 hover:text-ink-700"
            >
              {allDayExpanded ? "접기" : `+${hiddenBars} 더 · 펼치기`}
            </button>
          ) : null}
        </div>
      </div>

      {/* timeline — capped to about 2/5 of the screen so the project and routine rows stay the centre of the week */}
      <div className="flex items-center justify-end gap-2 border-b border-paper-300/70 px-1 py-1">
        <button
          type="button"
          onClick={() => setTimeExpanded((open) => !open)}
          aria-expanded={timeExpanded}
          className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-[3px] text-[0.62rem] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
        >
          {timeExpanded ? "기본 비율로" : "전체 일정 보기"}
          <ChevronDownIcon size={10} className={cn("transition", timeExpanded && "rotate-180")} />
        </button>
      </div>
      <div
        className={cn(
          "relative overflow-y-auto overflow-x-clip overscroll-contain border-b border-paper-300/60",
          timeExpanded ? "max-h-[86dvh]" : narrow ? "max-h-[34dvh]" : "max-h-[36dvh]",
        )}
      >
        <div className="pt-1">
          <Timeline
            days={days}
            events={visibleEvents.filter((event) => event.kind === "일정")}
            startHour={startHour}
            endHour={endHour}
            hourHeight={timeExpanded ? (narrow ? 46 : 38) : narrow ? 30 : 24}
            gutterWidth={gutter}
            onOpenEvent={onOpenEvent}
            onCreate={onCreate}
            onMoveEvent={onMoveEvent}
            onResizeEvent={onResizeEvent}
          />
        </div>
      </div>

      {/* attached project rows */}
      <div className="border-t border-paper-300">
        <div className="flex items-center justify-between border-b border-paper-300/70 bg-paper-50/50 px-2 py-1">
          <span className="text-[0.64rem] text-ink-400">프로젝트 · 루틴</span>
          <button
            type="button"
            onClick={() => setProjectsCollapsed((open) => !open)}
            aria-expanded={!projectsCollapsed}
            className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-[2px] text-[0.62rem] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
          >
            {projectsCollapsed ? "프로젝트 영역 펴기" : "프로젝트 영역 접기"}
            <ChevronDownIcon size={10} className={cn("transition", projectsCollapsed && "rotate-180")} />
          </button>
        </div>
        {projectsCollapsed ? null : rows.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[0.72rem] text-ink-400">이번 주에 예정된 할 일이 없습니다.</div>
        ) : null}
        {projectsCollapsed ? null : rows.map(([key, row]) => {
          const project = row.project;
          const tone = project ? taskTone(project.category) : null;
          return (
            <div key={key} className="grid border-b border-paper-300/80" style={grid}>
              <div className="sticky left-0 z-20 flex min-h-[2.2rem] items-center gap-1.5 bg-white py-1 pr-1.5">
                <button
                  type="button"
                  onClick={() => (project ? onOpenTask(project.id) : onCreateTaskForProject(""))}
                  aria-label={project?.title ?? "받은함"}
                  title={project?.title ?? "받은함"}
                  className={cn(
                    "flex h-6 w-6 flex-none items-center justify-center rounded-lg text-[0.72rem]",
                    tone ? tone.soft : "bg-paper-200",
                  )}
                >
                  {project ? projectEmoji(project.id, project.category) : "🗂️"}
                </button>
                {narrow ? null : (
                  <button
                    type="button"
                    onClick={() => (project ? onOpenTask(project.id) : onCreateTaskForProject(""))}
                    className="min-w-0 flex-1 truncate text-left text-[0.74rem] font-medium text-ink-800 hover:text-ink-900"
                    title={project?.title ?? "받은함"}
                  >
                    {project?.title ?? "받은함"}
                  </button>
                )}
                {project && !narrow ? (
                  <button
                    type="button"
                    onClick={() => onCreateTaskForProject(project.id)}
                    className="flex-none rounded px-1 text-[0.9rem] leading-none text-ink-300 hover:text-ink-600"
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
                    className={cn("min-h-[2.2rem] border-l border-paper-300/80 py-1", narrow ? "px-[3px]" : "px-1")}
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
                            title={canceled ? `취소${task.cancelReason ? ` · ${task.cancelReason}` : ""}` : undefined}
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
                                      ? "line-clamp-2 break-words text-[0.7rem] leading-[1.2]"
                                      : "truncate text-[0.72rem] leading-[1.25]",
                                    (done || canceled) && "text-ink-400 line-through",
                                  )}
                                >
                                  {task.title}
                                </span>
                                {canceled ? (
                                  <span className="flex-none rounded bg-paper-200 px-1 text-[0.54rem] font-medium leading-[1.4] text-ink-500">취소</span>
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
                                  <span className="flex-none rounded bg-paper-200 px-1 text-[0.56rem] font-medium leading-[1.4] text-ink-500">대기</span>
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
                                    <span className="rounded bg-paper-200 px-[3px] text-[0.55rem] font-medium leading-[1.35] text-ink-500">대기</span>
                                  ) : null}
                                </span>
                              ) : null}
                              {memoLine ? (
                                <span className="mt-0.5 block truncate text-[0.62rem] leading-tight text-ink-400">{memoLine}</span>
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

      {/* routine rows */}
      {routineGroups.map((group) => (
        <div key={group.category} className="border-b border-paper-300/80">
          <div className="grid" style={grid}>
            <div className="sticky left-0 z-20 flex items-center gap-1.5 bg-white py-1.5 pl-0.5 text-[0.68rem] text-ink-500">
              루틴
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
                  className="sticky left-0 z-20 flex min-w-0 items-center gap-1 bg-white py-[3px] pr-1 text-left text-[0.68rem] text-ink-700 hover:text-ink-900 md:gap-1.5 md:pr-2 md:text-[0.72rem]"
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
                            "flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border text-[0.55rem] font-semibold transition",
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
              className="sticky left-0 z-20 bg-white py-1 pl-0.5 text-left text-[0.68rem] text-ink-400 hover:text-ink-700"
            >
              + 루틴
            </button>
            <div style={{ gridColumn: `2 / span ${days.length}` }} />
          </div>
        </div>
      ))}

      {routineGroups.length === 0 ? (
        <div className="grid border-b border-paper-300/80" style={grid}>
          <div className="sticky left-0 z-20 bg-white py-1.5 text-[0.68rem] text-ink-400">루틴</div>
          <button
            type="button"
            onClick={onCreateRoutine}
            className="sticky left-0 z-20 bg-white py-1.5 text-left text-[0.68rem] text-ink-400 hover:text-ink-700"
            style={{ gridColumn: `2 / span ${days.length}` }}
          >
            + 루틴 추가
          </button>
        </div>
      ) : null}

        </div>
      </div>
      <p className="mt-2 text-[0.64rem] text-ink-300">
        {narrow
          ? "시간표는 위아래로 밀어 볼 수 있고, ‘전체 일정 보기’로 넓게 볼 수 있어요. 할 일 제목을 한 번 누르면 완료, 다시 누르면 해제되고 오른쪽 › 를 누르면 상세가 열립니다."
          : "시간표는 위아래로 스크롤되고 ‘전체 일정 보기’로 넓게 볼 수 있습니다. 빈 칸을 누르면 일정이 추가되고, 일정 블록은 끌어서 옮길 수 있습니다."}
      </p>
    </div>
  );
}
