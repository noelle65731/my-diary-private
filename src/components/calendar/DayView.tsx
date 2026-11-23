"use client";

import { useMemo } from "react";
import type { CalendarEvent, ProjectTask, Routine } from "@/lib/types";
import { formatFullKo, timeRangeLabel } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { routineTone, taskTone } from "@/components/common/tone";
import { useEventColors } from "@/state/event-colors";
import { useCategoryColors } from "@/state/category-colors";
import { ProjectIcon } from "@/components/common/ProjectIcon";
import { CheckIcon, PencilIcon, PlusIcon } from "@/components/icons";
import {
  allDayEventsForDay,
  routineCountForDay,
  routinesForDay,
  tasksForDay,
  timedEventsForDay,
} from "@/components/calendar/calendar-utils";
import { Timeline, minutesFromDrop } from "@/components/calendar/Timeline";
import { useDnd } from "@/components/common/dnd";

interface DayViewProps {
  day: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  projects: ProjectTask[];
  routines: Routine[];
  hiddenIncluded: boolean;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onCreate: (date: string, time?: string | null) => void;
  onToggleTask: (task: ProjectTask) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  /** B5: the day view takes part in dragging events to another time. */
  onMoveEvent?: (id: string, date: string, time: string | null) => void;
  onResizeEvent?: (id: string, startTime: string, endTime: string) => void;
  onWriteDiary: (date: string) => void;
  onCreateTaskForProject: (projectId: string) => void;
  /** A8: how many diary/note records the day holds (`기록 N`). */
  recordCount: number;
  /** A44: 고정 줄의 `할 일` 토글 — 끄면 오른쪽 할 일 목록 대신 `할 일 N개`만 남깁니다. */
  showTasks?: boolean;
}

export function DayView({
  day,
  events,
  tasks,
  projects,
  routines,
  hiddenIncluded,
  onOpenEvent,
  onOpenTask,
  onCreate,
  onToggleTask,
  onRoutineCount,
  onMoveEvent,
  onResizeEvent,
  onWriteDiary,
  onCreateTaskForProject,
  recordCount,
  showTasks = true,
}: DayViewProps) {
  const dnd = useDnd();
  const { toneFor } = useEventColors();
  const categoryColor = useCategoryColors();
  const visible = events.filter((event) => !event.trash && (hiddenIncluded || !event.hidden));
  const allDay = allDayEventsForDay(visible, day);
  const timed = timedEventsForDay(visible, day).filter((event) => !event.canceled);
  const dayTasks = tasksForDay(
    tasks.filter((task) => !task.trash && (hiddenIncluded || !task.hidden)),
    day,
  );
  const dueRoutines = routinesForDay(routines, day).filter((routine) => !routine.trash && (hiddenIncluded || !routine.hidden));
  const holiday = holidayName(day);
  const scheduleCount = allDay.filter((event) => !event.canceled).length + timed.length;

  const groups = useMemo(() => {
    const map = new Map<string, { project: ProjectTask | null; tasks: ProjectTask[] }>();
    for (const task of dayTasks) {
      const id = task.projectIds[0] ?? "";
      const project = projects.find((item) => item.id === id) ?? null;
      const key = project?.id ?? "inbox";
      if (!map.has(key)) map.set(key, { project, tasks: [] });
      map.get(key)!.tasks.push(task);
    }
    return [...map.values()];
  }, [dayTasks, projects]);

  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-2 border-b border-paper-300 pb-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[calc(13.5px*var(--fs))] text-ink-400">
            <span>일정 <b className="font-semibold text-ink-700">{scheduleCount}</b></span>
            <span className="text-paper-400">·</span>
            <span>할 일 <b className="font-semibold text-ink-700">{dayTasks.length}</b></span>
            <span className="text-paper-400">·</span>
            <span>기록 <b className="font-semibold text-ink-700">{recordCount}</b></span>
          </p>
          <p className="mt-1 text-[calc(15px*var(--fs))] font-medium text-ink-800">
            {formatFullKo(day)}
            {holiday ? <span className="ml-1 text-[calc(14px*var(--fs))] font-normal text-red-500">{holiday}</span> : null}
          </p>
        </div>

        {allDay.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-paper-300 pb-2">
            <span className="text-[calc(13.5px*var(--fs))] text-ink-400">종일</span>
            {allDay.map((event) => {
              const tone = toneFor(event);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onOpenEvent(event.id)}
                  onPointerDown={(pointerEvent) => {
                    if (!onMoveEvent) return;
                    dnd.start(
                      pointerEvent,
                      { kind: "event", id: event.id, label: event.title },
                      (target, point) => {
                        if (!target || target.zone !== "timeline-day") return;
                        const minutes = minutesFromDrop(target, point);
                        if (minutes === null) return;
                        const snapped = Math.round(minutes / 15) * 15;
                        const clock = `${String(Math.floor(snapped / 60) % 24).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`;
                        onMoveEvent(event.id, day, clock);
                      },
                      {
                        getHint: (target, point) => {
                          if (target.zone !== "timeline-day") return null;
                          const minutes = minutesFromDrop(target, point);
                          if (minutes === null) return null;
                          const snapped = Math.round(minutes / 15) * 15;
                          return `${String(Math.floor(snapped / 60) % 24).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")} 일정으로`;
                        },
                      },
                    );
                  }}
                  title="끌어서 시간표에 놓으면 그 시간 일정이 됩니다"
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[calc(14px*var(--fs))]",
                    tone.bg,
                    tone.border,
                    tone.text,
                    event.canceled && "line-through opacity-50",
                    /* A34: 완료한 종일 일정도 할 일처럼 줄을 긋습니다. */
                    event.done && "line-through opacity-60",
                  )}
                >
                  {event.title}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
        <Timeline
          days={[day]}
          events={visible.filter((event) => event.kind === "일정")}
          startHour={7}
          endHour={22}
          hourHeight={34}
          gutterWidth="3.4rem"
          onOpenEvent={onOpenEvent}
          onCreate={onCreate}
          onMoveEvent={onMoveEvent}
          onResizeEvent={onResizeEvent}
        />
        </div>

        <div className="mt-1 flex flex-none items-center justify-end border-t border-paper-300 pt-1 text-[calc(14px*var(--fs))] text-ink-400">
          <button type="button" onClick={() => onCreate(day, "09:00")} className="text-ink-500 hover:text-ink-900">
            + 일정
          </button>
        </div>
      </div>

      <aside className="min-h-0 min-w-0 space-y-2 overflow-y-auto pb-1">
        <h3 className="flex items-baseline gap-1.5 text-[calc(15px*var(--fs))] text-ink-500">
          오늘 할 일
          {/* A44: 토글이 꺼져 있어도 몇 개인지는 연한 회색 글씨로 남깁니다. */}
          {!showTasks && dayTasks.length > 0 ? (
            <span data-day-task-count="true" className="text-[calc(13px*var(--fs))] text-ink-300">할 일 {dayTasks.length}개</span>
          ) : null}
        </h3>

        {!showTasks ? null : groups.length === 0 ? (
          <div className="rounded-2xl bg-paper-200/50 px-3 py-5 text-center text-[calc(14px*var(--fs))] text-ink-400">오늘 예정된 할 일이 없습니다.</div>
        ) : null}

        {!showTasks ? null : groups.map(({ project, tasks: items }) => {
          const tone = categoryColor.toneOf(project?.category ?? "개인", taskTone(project?.category ?? "개인"));
          return (
            <section key={project?.id ?? "inbox"} className="rounded-2xl bg-paper-200/50 px-3 py-2.5">
              <header className="flex items-center gap-2">
                <span className={cn("flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-lg bg-white text-[calc(16px*var(--fs))]")}>
                  {project ? (
                    <ProjectIcon icon={project.icon} seed={project.id} category={project.category} className="h-full w-full" />
                  ) : (
                    "🗂️"
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => (project ? onOpenTask(project.id) : undefined)}
                  className="line-clamp-2 min-w-0 flex-1 text-left text-[calc(15.5px*var(--fs))] font-semibold leading-snug text-ink-900 md:line-clamp-1 md:text-[calc(16px*var(--fs))]"
                >
                  {project?.title ?? "index"}
                </button>
              </header>
              <ul className="mt-1.5 space-y-1">
                {items.map((task) => {
                  const done = task.status === "완료";
                  return (
                    <li key={task.id} className={cn("flex items-start gap-1.5", task.status === "취소" && "opacity-45")}>
                      <button
                        type="button"
                        onClick={() => onToggleTask(task)}
                        aria-label="완료"
                        className={cn(
                          "mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[5px] border transition",
                          done ? cn(tone.solid, "border-transparent text-white") : "border-paper-300 bg-white hover:border-ink-400",
                        )}
                      >
                        {done ? <CheckIcon size={10} /> : null}
                      </button>
                      <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                        <span className={cn("block text-[calc(15px*var(--fs))] leading-snug text-ink-800", (done || task.status === "취소") && "text-ink-400 line-through")}>
                          {task.startTime ? (
                            <span className="mr-1 text-[calc(14px*var(--fs))] tabular-nums text-ink-400">{timeRangeLabel(task.startTime, task.endTime)}</span>
                          ) : null}
                          {task.title}
                          {task.status === "취소" ? (
                            <span className="ml-1 rounded bg-paper-200 px-1 text-[calc(12px*var(--fs))] not-italic text-ink-500">취소</span>
                          ) : null}
                        </span>
                        {task.memo ? <span className="mt-0.5 block text-[calc(14px*var(--fs))] leading-snug text-ink-400">{task.memo}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {project ? (
                <button
                  type="button"
                  onClick={() => onCreateTaskForProject(project.id)}
                  className="mt-1.5 text-[calc(14px*var(--fs))] text-ink-400 transition hover:text-ink-700"
                >
                  + 추가
                </button>
              ) : null}
            </section>
          );
        })}

        <section className="rounded-2xl bg-paper-200/50 px-3 py-2.5">
          <header className="flex items-center gap-2">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-white text-[calc(15px*var(--fs))]">🔁</span>
            <h4 className="min-w-0 flex-1 text-[calc(16px*var(--fs))] font-semibold text-ink-900">루틴</h4>
          </header>
          {dueRoutines.length === 0 ? (
            <p className="mt-1 text-[calc(14px*var(--fs))] text-ink-400">오늘 예정된 루틴이 없습니다.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {dueRoutines.map((routine, index) => {
                const target = routine.targetCount ?? 1;
                const count = routineCountForDay(routines, routine, day);
                const done = count >= target;
                const tone = routineTone(index);
                return (
                  <li key={routine.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRoutineCount(routine, day, done ? 0 : count + 1)}
                      aria-label="루틴 체크"
                      className={cn(
                        "flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[5px] border transition",
                        done ? cn(tone.solid, "text-white") : "border-dashed border-ink-300 bg-white hover:border-ink-500",
                      )}
                    >
                      {done ? <CheckIcon size={10} /> : null}
                    </button>
                    <span className={cn("min-w-0 flex-1 truncate text-[calc(15px*var(--fs))] text-ink-700", done && "text-ink-400")}>{routine.title}</span>
                    <span className="flex-none text-[calc(13.5px*var(--fs))] tabular-nums text-ink-400">
                      {count}/{target}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <button
          type="button"
          onClick={() => onWriteDiary(day)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-paper-300 px-3 py-2 text-[calc(15px*var(--fs))] text-ink-600 transition hover:bg-paper-200/60"
        >
          <PencilIcon size={13} /> 이 날 일기 쓰기
        </button>

        <button
          type="button"
          onClick={() => onCreate(day, null)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-paper-300 px-3 py-2 text-[calc(14px*var(--fs))] text-ink-400 transition hover:border-ink-300 hover:text-ink-600"
        >
          <PlusIcon size={12} /> 종일 일정 추가
        </button>
      </aside>
    </div>
  );
}
