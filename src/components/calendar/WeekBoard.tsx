"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, ProjectTask, Routine } from "@/lib/types";
import { addDaysISO, diffDays, formatShort, isSameISO, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone, priorityOf, projectEmoji, routineTone, taskTone } from "@/components/common/tone";
import { CheckIcon } from "@/components/icons";
import { isAfterTarget, useDnd } from "@/components/common/dnd";
import { sortByStoredOrder, sortTasksNewestFirst } from "@/lib/order";
import { eventCoversDay, routineCountForDay } from "@/components/calendar/calendar-utils";
import { Timeline, type EventTimePatch } from "@/components/calendar/Timeline";

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
  onUpdateEvent: (id: string, patch: Record<string, unknown>) => void;
  onUpdateTask: (id: string, patch: Record<string, unknown>) => void;
  onToggleTask: (task: ProjectTask) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  onReorderProjects: (ordered: ProjectTask[], movedId: string, insertIndex: number) => void;
  onReorderRoutines: (ordered: Routine[], movedId: string, insertIndex: number) => void;
  onCreateTaskForProject: (projectId: string) => void;
  onCreateRoutine: () => void;
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
  onUpdateEvent,
  onUpdateTask,
  onToggleTask,
  onRoutineCount,
  onReorderProjects,
  onReorderRoutines,
  onCreateTaskForProject,
  onCreateRoutine,
}: WeekBoardProps) {
  const { start } = useDnd();
  const today = todayISO();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const gutter = narrow ? "2.6rem" : "7.6rem";
  const grid = useMemo(
    () => ({ gridTemplateColumns: `${gutter} repeat(${days.length}, minmax(0, 1fr))` }),
    [days.length, gutter],
  );

  const visibleEvents = events.filter((event) => !event.trash);
  const visibleTasks = useMemo(
    () => tasks.filter((task) => !task.trash && task.status !== "취소"),
    [tasks],
  );

  const weekTasks = useMemo(
    () => visibleTasks.filter((task) => (task.date && days.includes(task.date)) || (task.due && days.includes(task.due))),
    [visibleTasks, days],
  );

  const orderedProjects = useMemo(
    () => sortByStoredOrder(projects.filter((project) => !project.trash)),
    [projects],
  );

  const rows = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    for (const task of weekTasks) {
      const projectId = task.projectIds[0] ?? "inbox";
      if (!map.has(projectId)) map.set(projectId, []);
      map.get(projectId)!.push(task);
    }
    const order = orderedProjects.map((project) => project.id);
    return [...map.entries()]
      .sort((a, b) => {
        if (a[0] === "inbox") return -1;
        if (b[0] === "inbox") return 1;
        const left = order.indexOf(a[0]);
        const right = order.indexOf(b[0]);
        return (left === -1 ? Number.MAX_SAFE_INTEGER : left) - (right === -1 ? Number.MAX_SAFE_INTEGER : right);
      })
      .slice(0, 7)
      .map(([key, items]) => ({
        key,
        project: orderedProjects.find((project) => project.id === key) ?? null,
        tasks: sortTasksNewestFirst(items),
      }));
  }, [weekTasks, orderedProjects]);

  const rowProjects = useMemo(
    () => rows.map((row) => row.project).filter((project): project is ProjectTask => !!project),
    [rows],
  );

  const routineGroups = useMemo(() => {
    const active = sortByStoredOrder(routines.filter((routine) => routine.kind === "루틴" && !routine.trash && !routine.history));
    return (["개인", "공부"] as const)
      .map((category) => ({ category, items: active.filter((routine) => routine.category === category) }))
      .filter((group) => group.items.length > 0);
  }, [routines]);

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
    return bars.slice(0, 8);
  }, [visibleEvents, days]);

  const allDayHeight = Math.max(allDayBars.length > 0 ? Math.min(2, Math.max(...allDayBars.map((bar) => bar.lane)) + 1) : 1, 1) * 26 + 8;

  /* ── drag handlers ─────────────────────────────────────────── */

  const handleAllDayDrag = (event: CalendarEvent) => (pointerEvent: React.PointerEvent<HTMLElement>) => {
    start(
      pointerEvent,
      { kind: "event", id: event.id, label: event.title },
      (target) => {
        if (!target) return;
        const date = target.data.date;
        if (!date || target.zone !== "cal-allday") return;
        const delta = diffDays(date, event.date);
        if (delta === 0) return;
        const multiDay = !!event.endDate && event.endDate > event.date;
        onUpdateEvent(event.id, {
          date,
          endDate: multiDay ? addDaysISO(event.endDate!, delta) : date,
          startTime: null,
          endTime: null,
        });
      },
      {
        getHint: (target) =>
          target.zone === "cal-allday" && target.data.date
            ? `${formatShort(target.data.date)} ${weekdayKo(target.data.date)}로 옮기기`
            : null,
      },
    );
  };

  const handleTaskDrag = (task: ProjectTask) => (pointerEvent: React.PointerEvent<HTMLElement>) => {
    start(
      pointerEvent,
      { kind: "task", id: task.id, label: task.title },
      (target) => {
        if (!target) return;
        const patch: Record<string, unknown> = {};
        const date = target.zone === "cal-task-cell" ? target.data.date : target.zone === "cal-day" ? target.data.date : null;
        if (date && task.date !== date) patch.date = date;
        const projectId = typeof target.data.project === "string" ? target.data.project : null;
        if (projectId !== null && (task.projectIds[0] ?? "") !== projectId) {
          patch.projectIds = projectId ? [projectId] : [];
        }
        if (Object.keys(patch).length > 0) onUpdateTask(task.id, patch);
      },
      {
        getHint: (target, point) => {
          const date = target.data.date;
          if (!date) return null;
          const projectTitle = target.data.project
            ? (projects.find((project) => project.id === target.data.project)?.title ?? "프로젝트")
            : "받은함";
          return `${formatShort(date)} ${weekdayKo(date)} · ${projectTitle}`;
        },
      },
    );
  };

  const handleProjectRowDrag = (project: ProjectTask) => (pointerEvent: React.PointerEvent<HTMLElement>) => {
    const list = rowProjects;
    start(
      pointerEvent,
      { kind: "project", id: project.id, label: project.title },
      (target, point) => {
        if (!target) return;
        let targetId = target.data.id ?? "";
        if (target.zone === "cal-task-cell") targetId = target.data.project ?? "";
        else if (target.zone !== "cal-project-row") return;
        let insert = list.length;
        if (targetId) {
          const index = list.findIndex((item) => item.id === targetId);
          if (index === -1) return;
          insert = index + (isAfterTarget(target, point.y) ? 1 : 0);
        }
        onReorderProjects(list, project.id, insert);
      },
      { getHint: () => "줄 순서 바꾸기" },
    );
  };

  const handleRoutineRowDrag = (routine: Routine, list: Routine[]) => (pointerEvent: React.PointerEvent<HTMLElement>) => {
    start(
      pointerEvent,
      { kind: "routine", id: routine.id, label: routine.title },
      (target, point) => {
        if (!target || target.zone !== "cal-routine-row") return;
        let insert = list.length;
        const targetId = target.data.id;
        if (targetId) {
          const index = list.findIndex((item) => item.id === targetId);
          if (index === -1) return;
          insert = index + (isAfterTarget(target, point.y) ? 1 : 0);
        }
        onReorderRoutines(list, routine.id, insert);
      },
      { getHint: () => "루틴 순서 바꾸기" },
    );
  };

  return (
    <div className="min-w-0">
      {/* week day header */}
      <div className="grid items-end border-b border-paper-300 pb-1" style={grid}>
        <div className="pb-1 text-right text-[0.62rem] text-ink-400" />
        {days.map((day) => {
          const isToday = isSameISO(day, today);
          const holiday = holidayName(day);
          const dow = new Date(`${day}T12:00:00`).getDay();
          return (
            <button
              key={day}
              type="button"
              data-drop-zone="cal-allday"
              data-drop-date={day}
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
        <div className="flex items-start justify-end pr-2 pt-1.5 text-[0.62rem] text-ink-400">종일</div>
        <div className="relative" style={{ gridColumn: `2 / span ${days.length}`, height: allDayHeight }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day) => (
              <div key={day} data-drop-zone="cal-allday" data-drop-date={day} className="border-l border-paper-300" />
            ))}
          </div>
          {allDayBars.map(({ event, startIdx, span, lane }) => {
            const tone = categoryTone(event.category);
            return (
              <button
                key={event.id}
                type="button"
                data-drag-source="event"
                onPointerDown={handleAllDayDrag(event)}
                onClick={() => onOpenEvent(event.id)}
                className={cn(
                  "absolute h-[22px] cursor-grab overflow-hidden rounded-md border px-1.5 text-left text-[0.62rem] font-medium leading-[20px] md:px-2 md:text-[0.68rem]",
                  tone.bg,
                  tone.border,
                  tone.text,
                  event.canceled && "line-through opacity-50",
                )}
                style={{
                  left: `calc(${(startIdx * 100) / days.length}% + 2px)`,
                  width: `calc(${(span * 100) / days.length}% - 4px)`,
                  top: lane * 26 + 4,
                  display: lane > 1 ? "none" : "block",
                  touchAction: "pan-y",
                  WebkitTouchCallout: "none",
                }}
              >
                <span className="line-clamp-1">{event.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* timeline */}
      <Timeline
        days={days}
        events={visibleEvents.filter((event) => event.kind === "일정")}
        startHour={startHour}
        endHour={endHour}
        hourHeight={narrow ? 34 : 24}
        gutterWidth={gutter}
        onOpenEvent={onOpenEvent}
        onCreate={onCreate}
        onMoveEvent={(id, next: EventTimePatch) => onUpdateEvent(id, { ...next })}
        onResizeEvent={(id, next: EventTimePatch) => onUpdateEvent(id, { ...next })}
      />

      {/* attached project rows */}
      <div className="border-t border-paper-300" data-drop-zone="cal-project-row">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[0.72rem] text-ink-400">이번 주에 예정된 할 일이 없습니다.</div>
        ) : null}
        {rows.map(({ key, project, tasks: rowTasks }) => {
          const tone = project ? taskTone(project.category) : null;
          return (
            <div
              key={key}
              data-drop-zone="cal-project-row"
              data-drop-id={project?.id}
              className="grid border-b border-paper-300/80"
              style={grid}
            >
              <div className="flex min-h-[2.2rem] items-center gap-1.5 py-1 pr-1.5">
                <span
                  role="presentation"
                  aria-hidden="true"
                  onPointerDown={project ? handleProjectRowDrag(project) : undefined}
                  title={project ? "끌어서 줄 순서 바꾸기" : undefined}
                  className={cn(
                    "flex h-6 w-6 flex-none items-center justify-center rounded-lg text-[0.72rem]",
                    project && "cursor-grab",
                    tone ? tone.soft : "bg-paper-200",
                  )}
                >
                  {project ? projectEmoji(project.id, project.category) : "🗂️"}
                </span>
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
                const cell = rowTasks.filter((task) => task.date === day || task.due === day);
                return (
                  <div
                    key={day}
                    data-drop-zone="cal-task-cell"
                    data-drop-date={day}
                    data-drop-project={project?.id ?? ""}
                    className="min-h-[2.2rem] border-l border-paper-300/80 px-1 py-1"
                  >
                    <div className="space-y-1.5">
                      {cell.map((task) => {
                        const done = task.status === "완료";
                        const priority = priorityOf(task);
                        const taskColor = taskTone(task.category);
                        return (
                          <div key={task.id} className="flex items-start gap-1.5">
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
                            <button
                              type="button"
                              data-drag-source="task"
                              onPointerDown={handleTaskDrag(task)}
                              onClick={() => onOpenTask(task.id)}
                              className="min-w-0 flex-1 cursor-grab text-left"
                              style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
                            >
                              <span className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "truncate text-[0.72rem] leading-[1.25] text-ink-800",
                                    done && "text-ink-400 line-through",
                                  )}
                                >
                                  {task.title}
                                </span>
                                {priority !== "기타" ? (
                                  <span
                                    className={cn(
                                      "h-[5px] w-[5px] flex-none rounded-full",
                                      priority === "긴급·중요" ? "bg-red-500" : priority === "중요" ? "bg-blue-500" : "bg-amber-500",
                                    )}
                                  />
                                ) : null}
                              </span>
                              {task.memo ? <span className="mt-0.5 block truncate text-[0.64rem] leading-tight text-ink-400">{task.memo}</span> : null}
                            </button>
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
        <div key={group.category} data-drop-zone="cal-routine-row" className="border-b border-paper-300/80">
          <div className="grid" style={grid}>
            <div className="flex items-center gap-1.5 py-1.5 pl-0.5 text-[0.68rem] text-ink-500">
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
              <div
                key={routine.id}
                data-drop-zone="cal-routine-row"
                data-drop-id={routine.id}
                className="grid border-t border-paper-300/50"
                style={grid}
              >
                <button
                  type="button"
                  data-drag-source="routine"
                  onPointerDown={handleRoutineRowDrag(routine, group.items)}
                  onClick={() => onOpenRoutine(routine.id)}
                  className="flex min-w-0 cursor-grab items-center gap-1 py-[3px] pr-1 text-left text-[0.68rem] text-ink-700 hover:text-ink-900 md:gap-1.5 md:pr-2 md:text-[0.72rem]"
                  style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
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
              className="py-1 pl-0.5 text-left text-[0.68rem] text-ink-400 hover:text-ink-700"
            >
              + 루틴
            </button>
            <div style={{ gridColumn: `2 / span ${days.length}` }} />
          </div>
        </div>
      ))}

      {routineGroups.length === 0 ? (
        <div className="grid border-b border-paper-300/80" style={grid}>
          <div className="py-1.5 text-[0.68rem] text-ink-400">루틴</div>
          <button
            type="button"
            onClick={onCreateRoutine}
            className="py-1.5 text-left text-[0.68rem] text-ink-400 hover:text-ink-700"
            style={{ gridColumn: `2 / span ${days.length}` }}
          >
            + 루틴 추가
          </button>
        </div>
      ) : null}

      <p className="mt-2 text-[0.64rem] text-ink-300">
        빈 칸을 누르면 일정이 추가됩니다 · 일정·할 일은 끌어서 옮기고, 줄은 길게 눌러(PC는 잡아서) 순서를 바꿉니다.
      </p>
    </div>
  );
}
