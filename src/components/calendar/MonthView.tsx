"use client";

import { useMemo } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { daysInMonth, formatShort, isSameISO, monthMatrix, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone, routineTone } from "@/components/common/tone";
import { routineCountForDay } from "@/components/calendar/calendar-utils";

interface MonthViewProps {
  cursor: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  routines: Routine[];
  mode: ModeFilter;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  onSelectDay: (day: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onCreate: (date: string) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
}

type CellItem = { type: "event"; event: CalendarEvent } | { type: "task"; task: ProjectTask };

export function MonthView({
  cursor,
  events,
  tasks,
  routines,
  mode,
  weekStartsOn,
  showWeekends,
  onSelectDay,
  onOpenEvent,
  onOpenTask,
  onRoutineCount,
}: MonthViewProps) {
  const today = todayISO();
  const year = Number(cursor.slice(0, 4));
  const month0 = Number(cursor.slice(5, 7)) - 1;
  const matrix = useMemo(() => monthMatrix(year, month0, weekStartsOn), [year, month0, weekStartsOn]);
  const weekdays = weekStartsOn === 1 ? ["월", "화", "수", "목", "금", "토", "일"] : ["일", "월", "화", "수", "목", "금", "토"];
  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month0) }, (_, i) => `${year}-${String(month0 + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
    [year, month0],
  );

  const activeEvents = events.filter(
    (event) => event.kind === "일정" && !event.trash && (mode === "all" || !event.hidden),
  );
  const activeTasks = tasks.filter(
    (task) => !task.trash && (mode === "all" || !task.hidden) && task.status !== "취소",
  );
  const routineTemplates = useMemo(
    () => routines.filter((routine) => routine.kind === "루틴" && !routine.trash && !routine.history && (mode === "all" || !routine.hidden)),
    [routines, mode],
  );

  const itemsForDay = (day: string): CellItem[] => {
    const dayEvents: CellItem[] = activeEvents
      .filter((event) => day >= (event.date || "") && day <= (event.endDate || event.date || ""))
      .map((event) => ({ type: "event" as const, event }));
    const dayTasks: CellItem[] = activeTasks
      .filter((task) => task.date === day || task.due === day)
      .map((task) => ({ type: "task" as const, task }));
    return [...dayEvents, ...dayTasks];
  };

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-7 border-b border-paper-300">
        {weekdays.map((label, index) => {
          const dow = weekStartsOn === 1 ? (index + 1) % 7 : index;
          return (
            <div
              key={label}
              className={cn(
                "py-1.5 pl-3 text-left text-[0.68rem]",
                dow === 6 ? "text-blue-500" : dow === 0 ? "text-red-400" : "text-ink-400",
              )}
            >
              {label}
            </div>
          );
        })}
      </div>

      {matrix.map((row, rowIndex) => {
        const cells = showWeekends ? row : row.filter((_, index) => {
          const dow = new Date(`${row[index]}T12:00:00`).getDay();
          return dow !== 0 && dow !== 6;
        });
        return (
          <div key={rowIndex} className="grid border-b border-paper-300 last:border-b-0" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0,1fr))` }}>
            {cells.map((day, columnIndex) => {
              const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
              const items = itemsForDay(day);
              const holiday = holidayName(day);
              const isToday = isSameISO(day, today);
              const dow = new Date(`${day}T12:00:00`).getDay();
              const visibleItems = items.slice(0, 3);
              const hidden = items.length - visibleItems.length;
              return (
                <div
                  key={day}
                  className={cn(
                    "group relative min-h-[5rem] border-r border-paper-300 px-1 pb-1 pt-1 last:border-r-0 md:min-h-[7.2rem] md:px-2 md:pb-1.5 md:pt-1.5",
                    !inMonth && "bg-paper-200/25",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onSelectDay(day)}
                      className={cn(
                        "flex h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[0.72rem] font-medium tabular-nums transition md:h-[1.4rem] md:min-w-[1.4rem] md:text-[0.78rem]",
                        isToday
                          ? "bg-ink-900 text-white"
                          : holiday || dow === 0
                            ? "text-red-500"
                            : dow === 6
                              ? "text-blue-600"
                              : inMonth
                                ? "text-ink-700"
                                : "text-ink-300",
                        !isToday && "hover:bg-paper-200",
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </button>
                  </div>
                  {holiday ? <p className="truncate text-[0.58rem] text-red-500">{holiday}</p> : null}

                  <div className="mt-0.5 space-y-[2px] md:space-y-[3px]">
                    {visibleItems.map((item) => {
                      if (item.type === "event") {
                        const tone = categoryTone(item.event.category);
                        const multiDay = !!item.event.endDate && item.event.endDate > item.event.date;
                        return (
                          <button
                            key={item.event.id}
                            type="button"
                            onClick={() => onOpenEvent(item.event.id)}
                            className={cn(
                              "flex w-full items-start gap-1 rounded px-0.5 py-[1px] text-left text-[0.6rem] leading-[1.25] md:px-1 md:text-[0.68rem] md:leading-[1.35]",
                              multiDay ? cn(tone.bg, tone.text) : tone.text,
                              item.event.canceled && "line-through opacity-50",
                              item.event.done && "opacity-60",
                            )}
                          >
                            {item.event.startTime ? <span className="hidden flex-none tabular-nums opacity-80 md:inline">{item.event.startTime}</span> : null}
                            <span className="line-clamp-2 md:line-clamp-1">{item.event.title}</span>
                          </button>
                        );
                      }
                      return (
                        <button
                          key={item.task.id}
                          type="button"
                          onClick={() => onOpenTask(item.task.id)}
                          className={cn(
                            "hidden w-full items-center gap-1 truncate px-1 py-[1px] text-left text-[0.68rem] leading-[1.35] text-ink-500 md:flex",
                            item.task.status === "완료" && "text-ink-300 line-through",
                          )}
                        >
                          <span className="h-[9px] w-[9px] flex-none rounded-[2px] border border-ink-300" />
                          <span className="truncate">{item.task.title}</span>
                        </button>
                      );
                    })}
                    {hidden > 0 ? (
                      <button
                        type="button"
                        onClick={() => onSelectDay(day)}
                        className="px-1 text-left text-[0.64rem] text-ink-400 hover:text-ink-700"
                      >
                        +{hidden} 더
                      </button>
                    ) : null}
                    {items.length > 0 && items.filter((item) => item.type === "task").length > 0 ? (
                      <button
                        type="button"
                        onClick={() => onSelectDay(day)}
                        className="px-1 text-left text-[0.62rem] text-ink-300 hover:text-ink-500"
                      >
                        할 일 {items.filter((item) => item.type === "task").length}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {routineTemplates.length > 0 ? (
        <div className="mt-4 space-y-3 xl:hidden">
          <h3 className="text-[0.86rem] font-semibold text-ink-900">이번 달 루틴</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {routineTemplates.map((routine, index) => (
              <RoutineHeat key={routine.id} routine={routine} routines={routines} days={days} index={index} onCount={(date, count) => onRoutineCount(routine, date, count)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RoutineHeat({
  routine,
  routines,
  days,
  index,
  onCount,
}: {
  routine: Routine;
  routines: Routine[];
  days: string[];
  index: number;
  onCount: (date: string, count: number) => void;
}) {
  const target = routine.targetCount ?? 1;
  const tone = routineTone(index);
  const today = todayISO();
  const doneCount = days.filter((day) => routineCountForDay(routines, routine, day) >= target).length;
  const scheduledCount = days.filter((day) => {
    const label = weekdayKo(day);
    return routine.repeatDays.length === 0 || routine.repeatDays.includes(label);
  }).length;

  return (
    <div className="rounded-2xl border border-paper-300 p-3">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("flex h-5 w-5 flex-none items-center justify-center rounded-md text-[0.6rem]", tone.soft, tone.text)}>루</span>
          <span className="truncate text-[0.82rem] font-semibold text-ink-900">{routine.title}</span>
        </div>
        <span className="flex-none text-[0.78rem] font-semibold tabular-nums text-ink-900">
          {doneCount}
          <span className="text-[0.68rem] font-normal text-ink-400">/{scheduledCount}</span>
        </span>
      </header>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const label = weekdayKo(day);
          const scheduled = routine.repeatDays.length === 0 || routine.repeatDays.includes(label);
          const count = routineCountForDay(routines, routine, day);
          const done = count >= target;
          const past = day < today;
          const isToday = day === today;
          const future = day > today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onCount(day, done ? 0 : count + 1)}
              title={`${formatShort(day)} · ${count}/${target}`}
              className={cn(
                "flex h-[1.55rem] items-center justify-center rounded-md text-[0.62rem] tabular-nums transition",
                done
                  ? cn(tone.solid, "font-semibold text-white")
                  : future || !scheduled
                    ? "bg-transparent text-ink-300"
                    : past
                      ? "bg-paper-200 text-ink-400 hover:bg-paper-300"
                      : "bg-paper-200/70 text-ink-400 hover:bg-paper-300",
                isToday && "ring-1 ring-inset ring-ink-900",
              )}
            >
              {Number(day.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
