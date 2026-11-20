"use client";

import { useMemo } from "react";
import type { CalendarEvent, ProjectTask, Routine } from "@/lib/types";
import { formatFullKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone, projectEmoji, routineTone, taskTone } from "@/components/common/tone";
import { CheckIcon, PencilIcon, PlusIcon } from "@/components/icons";
import {
  allDayEventsForDay,
  routineCountForDay,
  routinesForDay,
  tasksForDay,
  timedEventsForDay,
} from "@/components/calendar/calendar-utils";
import { Timeline } from "@/components/calendar/Timeline";

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
  onWriteDiary: (date: string) => void;
  onCreateTaskForProject: (projectId: string) => void;
  /** A8: how many diary/note records the day holds (`기록 N`). */
  recordCount: number;
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
  onWriteDiary,
  onCreateTaskForProject,
  recordCount,
}: DayViewProps) {
  const visible = events.filter((event) => !event.trash && (hiddenIncluded || !event.hidden));
  const allDay = allDayEventsForDay(visible, day);
  const timed = timedEventsForDay(visible, day).filter((event) => !event.canceled);
  const dayTasks = tasksForDay(
    tasks.filter((task) => !task.trash && (hiddenIncluded || !task.hidden)),
    day,
  ).filter((task) => task.status !== "취소");
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
    <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0">
        <div className="mb-2 border-b border-paper-300 pb-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.66rem] text-ink-400">
            <span>일정 <b className="font-semibold text-ink-700">{scheduleCount}</b></span>
            <span className="text-paper-400">·</span>
            <span>할 일 <b className="font-semibold text-ink-700">{dayTasks.length}</b></span>
            <span className="text-paper-400">·</span>
            <span>기록 <b className="font-semibold text-ink-700">{recordCount}</b></span>
          </p>
          <p className="mt-1 text-[0.78rem] font-medium text-ink-800">
            {formatFullKo(day)}
            {holiday ? <span className="ml-1 text-[0.72rem] font-normal text-red-500">{holiday}</span> : null}
          </p>
        </div>

        {allDay.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-paper-300 pb-2">
            <span className="text-[0.64rem] text-ink-400">종일</span>
            {allDay.map((event) => {
              const tone = categoryTone(event.category);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onOpenEvent(event.id)}
                  className={cn("rounded-md border px-2 py-0.5 text-[0.7rem]", tone.bg, tone.border, tone.text, event.canceled && "line-through opacity-50")}
                >
                  {event.title}
                </button>
              );
            })}
          </div>
        ) : null}

        <Timeline
          days={[day]}
          events={visible.filter((event) => event.kind === "일정")}
          startHour={7}
          endHour={22}
          hourHeight={34}
          gutterWidth="3.4rem"
          onOpenEvent={onOpenEvent}
          onCreate={onCreate}
        />

        <div className="mt-3 flex items-center justify-end border-t border-paper-300 pt-2 text-[0.68rem] text-ink-400">
          <button type="button" onClick={() => onCreate(day, "09:00")} className="text-ink-500 hover:text-ink-900">
            + 일정
          </button>
        </div>
      </div>

      <aside className="min-w-0 space-y-3">
        <h3 className="text-[0.82rem] text-ink-400">오늘 할 일</h3>

        {groups.length === 0 ? (
          <div className="rounded-2xl bg-paper-200/50 px-3 py-5 text-center text-[0.72rem] text-ink-400">오늘 예정된 할 일이 없습니다.</div>
        ) : null}

        {groups.map(({ project, tasks: items }) => {
          const tone = taskTone(project?.category ?? "개인");
          return (
            <section key={project?.id ?? "inbox"} className="rounded-2xl bg-paper-200/50 px-3 py-2.5">
              <header className="flex items-center gap-2">
                <span className={cn("flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-white text-[0.78rem]")}>
                  {project ? projectEmoji(project.id, project.category) : "🗂️"}
                </span>
                <button
                  type="button"
                  onClick={() => (project ? onOpenTask(project.id) : undefined)}
                  className="line-clamp-2 min-w-0 flex-1 text-left text-[0.86rem] font-semibold leading-snug text-ink-900 md:line-clamp-1 md:text-[0.9rem]"
                >
                  {project?.title ?? "받은함"}
                </button>
              </header>
              <ul className="mt-1.5 space-y-1">
                {items.map((task) => {
                  const done = task.status === "완료";
                  return (
                    <li key={task.id} className="flex items-start gap-1.5">
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
                        <span className={cn("block text-[0.8rem] leading-snug text-ink-800", done && "text-ink-400 line-through")}>
                          {task.title}
                        </span>
                        {task.memo ? <span className="mt-0.5 block text-[0.68rem] leading-snug text-ink-400">{task.memo}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {project ? (
                <button
                  type="button"
                  onClick={() => onCreateTaskForProject(project.id)}
                  className="mt-1.5 text-[0.7rem] text-ink-400 transition hover:text-ink-700"
                >
                  + 추가
                </button>
              ) : null}
            </section>
          );
        })}

        <section className="rounded-2xl bg-paper-200/50 px-3 py-2.5">
          <header className="flex items-center gap-2">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-white text-[0.78rem]">🔁</span>
            <h4 className="min-w-0 flex-1 text-[0.9rem] font-semibold text-ink-900">루틴</h4>
          </header>
          {dueRoutines.length === 0 ? (
            <p className="mt-1 text-[0.7rem] text-ink-400">오늘 예정된 루틴이 없습니다.</p>
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
                    <span className={cn("min-w-0 flex-1 truncate text-[0.78rem] text-ink-700", done && "text-ink-400")}>{routine.title}</span>
                    <span className="flex-none text-[0.66rem] tabular-nums text-ink-400">
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
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-paper-300 px-3 py-2 text-[0.76rem] text-ink-600 transition hover:bg-paper-200/60"
        >
          <PencilIcon size={13} /> 이 날 일기 쓰기
        </button>

        <button
          type="button"
          onClick={() => onCreate(day, null)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-paper-300 px-3 py-2 text-[0.72rem] text-ink-400 transition hover:border-ink-300 hover:text-ink-600"
        >
          <PlusIcon size={12} /> 종일 일정 추가
        </button>
      </aside>
    </div>
  );
}
