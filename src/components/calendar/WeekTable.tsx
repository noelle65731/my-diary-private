"use client";

import { useMemo, useState } from "react";
import type { ProjectTask, Routine } from "@/lib/types";
import { formatShort, weekdayKo, weekDays } from "@/lib/date";
import { cn } from "@/lib/utils";
import { taskTone } from "@/components/common/tone";
import { ChevronDownIcon } from "@/components/icons";
import { routineCountForDay } from "@/components/calendar/calendar-utils";

interface WeekTableProps {
  weekStart: string;
  tasks: ProjectTask[];
  routines: Routine[];
  onOpenTask: (id: string) => void;
  onOpenRoutine: (id: string) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  onCreateTaskForProject: (projectId: string) => void;
}

export function WeekTable({
  weekStart,
  tasks,
  routines,
  onOpenTask,
  onOpenRoutine,
  onRoutineCount,
  onCreateTaskForProject,
}: WeekTableProps) {
  const [open, setOpen] = useState(false);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const weekEnd = days[days.length - 1] ?? weekStart;

  const projects = tasks.filter((task) => task.kind === "프로젝트" && !task.trash);
  const templates = routines.filter((routine) => routine.kind === "루틴" && !routine.trash && !routine.history);

  const rows = projects.map((project) => {
    const children = tasks.filter(
      (task) => task.kind === "할 일" && !task.trash && task.projectIds.includes(project.id),
    );
    const weekChildren = children.filter((task) => task.date && task.date >= weekStart && task.date <= weekEnd);
    const done = children.filter((task) => task.status === "완료").length;
    return { project, children, weekChildren, done };
  });

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-paper-100/60"
      >
        <span className="flex items-center gap-2">
          <ChevronDownIcon size={15} className={cn("text-ink-400 transition", !open && "-rotate-90")} />
          <span className="text-[0.84rem] font-medium text-ink-800">이번 주 프로젝트 · 루틴</span>
          <span className="text-[0.66rem] text-ink-400">
            {projects.length}개 프로젝트 · {templates.length}개 루틴
          </span>
        </span>
        <span className="text-[0.64rem] text-ink-400">
          {formatShort(weekStart)}–{formatShort(weekEnd)}
        </span>
      </button>

      {open ? (
        <div className="border-t border-paper-300/70">
          {rows.length === 0 && templates.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.78rem] text-ink-400">이번 주에 볼 프로젝트나 루틴이 없습니다.</p>
          ) : null}

          {rows.length > 0 ? (
            <div className="divide-y divide-paper-300/40">
              {rows.map(({ project, children, weekChildren, done }) => (
                <div key={project.id} className="px-3.5 py-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", taskTone(project.category).dot)} />
                    <button
                      type="button"
                      onClick={() => onOpenTask(project.id)}
                      className="min-w-0 flex-1 truncate text-left text-[0.8rem] font-medium text-ink-800 hover:text-ink-900"
                    >
                      {project.title}
                    </button>
                    <span className="text-[0.62rem] text-ink-400">
                      {done}/{children.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => onCreateTaskForProject(project.id)}
                      className="rounded px-1 text-[0.62rem] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                    >
                      + 할 일
                    </button>
                  </div>
                  {children.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {(weekChildren.length > 0 ? weekChildren : children).slice(0, 4).map((task) => (
                        <li key={task.id} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id)}
                            className={cn(
                              "min-w-0 flex-1 truncate text-left text-[0.72rem] text-ink-600 hover:text-ink-900",
                              task.status === "완료" && "text-ink-400 line-through",
                            )}
                          >
                            {task.title}
                          </button>
                          {task.date ? (
                            <span className="text-[0.6rem] text-ink-400">
                              {formatShort(task.date)} {weekdayKo(task.date)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {templates.length > 0 ? (
            <div className="border-t border-paper-300/50 px-3.5 py-2">
              <p className="mb-1 text-[0.64rem] uppercase tracking-wide text-ink-400">루틴</p>
              <div className="space-y-1">
                {templates.map((routine) => {
                  const target = routine.targetCount ?? 1;
                  return (
                    <div key={routine.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenRoutine(routine.id)}
                        className="w-24 flex-none truncate text-left text-[0.74rem] text-ink-700 hover:text-ink-900"
                      >
                        {routine.title}
                      </button>
                      <div className="flex flex-1 items-center gap-1">
                        {days.map((day) => {
                          const count = routineCountForDay(routines, routine, day);
                          const scheduled = routine.repeatDays.length === 0 || routine.repeatDays.includes(weekdayKo(day));
                          return (
                            <button
                              key={day}
                              type="button"
                              disabled={!scheduled}
                              onClick={() => onRoutineCount(routine, day, count >= target ? 0 : count + 1)}
                              title={`${formatShort(day)} · ${count}/${target}`}
                              className={cn(
                                "flex h-4 w-4 items-center justify-center rounded-[3px] text-[0.5rem] transition",
                                !scheduled
                                  ? "bg-transparent text-transparent"
                                  : count >= target
                                    ? "bg-sage-400 text-white"
                                    : count > 0
                                      ? "bg-sage-200 text-sage-500"
                                      : "bg-paper-200/70 text-transparent hover:bg-paper-300",
                              )}
                            >
                              {scheduled && count > 0 ? count : ""}
                            </button>
                          );
                        })}
                      </div>
                      <span className="w-12 text-right text-[0.6rem] text-ink-400">
                        {days.reduce((sum, day) => sum + (routineCountForDay(routines, routine, day) >= target ? 1 : 0), 0)}일
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
