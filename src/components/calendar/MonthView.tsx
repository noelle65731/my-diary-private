"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { daysInMonth, formatShort, isSameISO, monthMatrix, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone, routineTone, taskTone } from "@/components/common/tone";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@/components/icons";
import { eventCoversDay, routineCountForDay } from "@/components/calendar/calendar-utils";

interface MonthViewProps {
  cursor: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  routines: Routine[];
  mode: ModeFilter;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  /** A3: titles shown per day before the rest folds into `할 일 N` / `+N 더`. */
  dayItems: 3 | 4 | 5;
  /** Bumped by the calendar tab when an opened detail's X closes every layer. */
  closeDayListSignal?: number;
  onSelectDay: (day: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onUpdateEvent: (id: string, patch: Record<string, unknown>) => void;
  onCreate: (date: string) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  /** B5: dragging a chip onto another date moves the 일정/할 일 there. */
  onMoveItem?: (type: "event" | "task", id: string, date: string) => void;
}

type CellItem = { type: "event"; event: CalendarEvent } | { type: "task"; task: ProjectTask };

const LAST = Number.MAX_SAFE_INTEGER;

/** All-day events keep the order the user arranged (`sort`), then the order they were written. */
function byAllDayOrder(a: CalendarEvent, b: CalendarEvent): number {
  const left = a.sort ?? LAST;
  const right = b.sort ?? LAST;
  if (left !== right) return left - right;
  return String(a.createdAt).localeCompare(String(b.createdAt));
}

function byTimeOrder(a: CalendarEvent, b: CalendarEvent): number {
  const left = a.startTime ?? "99:99";
  const right = b.startTime ?? "99:99";
  if (left !== right) return left.localeCompare(right);
  return byAllDayOrder(a, b);
}

export function MonthView({
  cursor,
  events,
  tasks,
  routines,
  mode,
  weekStartsOn,
  showWeekends,
  dayItems,
  closeDayListSignal = 0,
  onSelectDay,
  onOpenEvent,
  onOpenTask,
  onUpdateEvent,
  onRoutineCount,
  onMoveItem,
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

  /** A day list opened from a cell — the month stays on screen behind it. */
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    if (closeDayListSignal === 0) return;
    setOpenDay(null);
  }, [closeDayListSignal]);

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

  const allDayForDay = (day: string) => activeEvents.filter((event) => event.allDay && eventCoversDay(event, day)).sort(byAllDayOrder);
  const timedForDay = (day: string) => activeEvents.filter((event) => !event.allDay && eventCoversDay(event, day)).sort(byTimeOrder);
  const tasksForDay = (day: string) =>
    activeTasks
      .filter((task) => task.date === day || task.due === day)
      .sort((a, b) => (a.sort ?? LAST) - (b.sort ?? LAST) || String(a.createdAt).localeCompare(String(b.createdAt)));

  /** A3 order: all-day events → timed events by start → tasks. */
  const itemsForDay = (day: string): CellItem[] => [
    ...allDayForDay(day).map((event) => ({ type: "event" as const, event })),
    ...timedForDay(day).map((event) => ({ type: "event" as const, event })),
    ...tasksForDay(day).map((task) => ({ type: "task" as const, task })),
  ];

  /** Swaps two all-day events of that day and stores the new order in `sort`. */
  const moveAllDay = (day: string, id: string, direction: -1 | 1) => {
    const list = allDayForDay(day);
    const index = list.findIndex((event) => event.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const reordered = [...list];
    const moved = reordered[target];
    reordered[target] = reordered[index] as CalendarEvent;
    reordered[index] = moved as CalendarEvent;
    reordered.forEach((event, position) => {
      const value = (position + 1) * 10;
      if (event.sort !== value) onUpdateEvent(event.id, { sort: value });
    });
  };

  const openDayDate = openDay;
  const openDayItems = openDayDate ? itemsForDay(openDayDate) : [];

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
            {cells.map((day) => {
              const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
              const items = itemsForDay(day);
              const holiday = holidayName(day);
              const isToday = isSameISO(day, today);
              const dow = new Date(`${day}T12:00:00`).getDay();
              const visibleItems = items.slice(0, dayItems);
              const rest = items.slice(dayItems);
              const restTasks = rest.filter((item) => item.type === "task").length;
              const restEvents = rest.length - restTasks;
              return (
                <div
                  key={day}
                  onDragOver={(event) => {
                    if (onMoveItem) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    const payload = event.dataTransfer.getData("text/diary-item");
                    if (!payload || !onMoveItem) return;
                    event.preventDefault();
                    const [type, id] = payload.split(":");
                    if ((type === "event" || type === "task") && id) onMoveItem(type, id, day);
                  }}
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
                            draggable={!!onMoveItem}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/diary-item", `event:${item.event.id}`);
                              event.dataTransfer.effectAllowed = "move";
                            }}
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
                          draggable={!!onMoveItem}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/diary-item", `task:${item.task.id}`);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => onOpenTask(item.task.id)}
                          className={cn(
                            "flex w-full items-center gap-1 px-0.5 py-[1px] text-left text-[0.6rem] leading-[1.25] text-ink-500 md:px-1 md:text-[0.68rem] md:leading-[1.35]",
                            item.task.status === "완료" && "text-ink-300 line-through",
                          )}
                        >
                          <span className="hidden h-[9px] w-[9px] flex-none rounded-[2px] border border-ink-300 md:block" />
                          <span className="truncate">{item.task.title}</span>
                        </button>
                      );
                    })}
                    {restTasks > 0 ? (
                      <button
                        type="button"
                        onClick={() => setOpenDay(day)}
                        className="block w-full px-0.5 text-left text-[0.6rem] text-ink-500 hover:text-ink-800 md:px-1 md:text-[0.64rem]"
                      >
                        할 일 {restTasks}
                      </button>
                    ) : null}
                    {restEvents > 0 ? (
                      <button
                        type="button"
                        onClick={() => setOpenDay(day)}
                        className="block w-full px-0.5 text-left text-[0.6rem] text-ink-400 hover:text-ink-700 md:px-1 md:text-[0.64rem]"
                      >
                        +{restEvents} 더
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            {routineTemplates.map((routine, index) => (
              <RoutineHeat key={routine.id} routine={routine} routines={routines} days={days} index={index} onCount={(date, count) => onRoutineCount(routine, date, count)} />
            ))}
          </div>
        </div>
      ) : null}

      {openDayDate ? (
        <DayListPanel
          day={openDayDate}
          items={openDayItems}
          onClose={() => setOpenDay(null)}
          onGoDay={() => {
            setOpenDay(null);
            onSelectDay(openDayDate);
          }}
          onOpenEvent={onOpenEvent}
          onOpenTask={onOpenTask}
          onMoveAllDay={(id, direction) => moveAllDay(openDayDate, id, direction)}
        />
      ) : null}
    </div>
  );
}

/**
 * A3: the full list of one date, opened on top of the month grid (bottom sheet on a
 * phone, side card on a wide screen). It never leaves the month view by itself —
 * only `이 날짜로 이동` opens the day view, and closing returns to the same month.
 */
function DayListPanel({
  day,
  items,
  onClose,
  onGoDay,
  onOpenEvent,
  onOpenTask,
  onMoveAllDay,
}: {
  day: string;
  items: CellItem[];
  onClose: () => void;
  onGoDay: () => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onMoveAllDay: (id: string, direction: -1 | 1) => void;
}) {
  const holiday = holidayName(day);
  const allDay = items.filter((item) => item.type === "event" && item.event.allDay) as { type: "event"; event: CalendarEvent }[];
  const timed = items.filter((item) => item.type === "event" && !item.event.allDay) as { type: "event"; event: CalendarEvent }[];
  const dayTasks = items.filter((item) => item.type === "task") as { type: "task"; task: ProjectTask }[];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:justify-end">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-ink-900/10" />
      <div
        role="dialog"
        aria-label={`${formatShort(day)} 하루 목록`}
        className="relative z-10 flex max-h-[72dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-paper-300 bg-white pb-[env(safe-area-inset-bottom)] shadow-lift animate-slide-up sm:mt-24 sm:mr-6 sm:max-h-[calc(100dvh-9rem)] sm:w-[21rem] sm:animate-pop-in sm:rounded-2xl sm:pb-0"
      >
        <div className="flex items-start gap-3 border-b border-paper-300/80 px-4 pb-2.5 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.66rem] text-ink-400">이 날짜 전체</p>
            <p className="mt-0.5 truncate text-[0.96rem] font-semibold text-ink-900">
              {formatShort(day)} {weekdayKo(day)}요일
              {holiday ? <span className="ml-1 text-[0.74rem] font-normal text-red-500">{holiday}</span> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn -mr-1 -mt-1" aria-label="닫기">
            <XIcon size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <p className="rounded-xl bg-paper-200/50 px-3 py-6 text-center text-[0.74rem] text-ink-400">이 날짜에는 일정도 할 일도 없습니다.</p>
          ) : null}

          {allDay.length > 0 ? (
            <section className="mb-3">
              <p className="mb-1 flex items-baseline justify-between text-[0.66rem] text-ink-400">
                <span>종일 일정</span>
                {allDay.length > 1 ? <span className="text-[0.62rem] text-ink-300">↑↓ 로 순서 바꾸기</span> : null}
              </p>
              <ul className="space-y-1">
                {allDay.map(({ event }, index) => {
                  const tone = categoryTone(event.category);
                  return (
                    <li key={event.id} className={cn("flex items-center gap-1 rounded-lg border px-2 py-1.5", tone.bg, tone.border)}>
                      <button
                        type="button"
                        onClick={() => onOpenEvent(event.id)}
                        className={cn(
                          "min-w-0 flex-1 truncate text-left text-[0.78rem]",
                          tone.text,
                          event.canceled && "line-through opacity-50",
                          event.done && "opacity-60",
                        )}
                      >
                        {event.title}
                      </button>
                      {allDay.length > 1 ? (
                        <span className="flex flex-none items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onMoveAllDay(event.id, -1)}
                            disabled={index === 0}
                            aria-label={`${event.title} 위로`}
                            className="flex h-5 w-5 items-center justify-center rounded text-ink-400 transition hover:bg-white/70 hover:text-ink-800 disabled:opacity-25"
                          >
                            <ChevronLeftIcon size={12} className="rotate-90" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveAllDay(event.id, 1)}
                            disabled={index === allDay.length - 1}
                            aria-label={`${event.title} 아래로`}
                            className="flex h-5 w-5 items-center justify-center rounded text-ink-400 transition hover:bg-white/70 hover:text-ink-800 disabled:opacity-25"
                          >
                            <ChevronRightIcon size={12} className="rotate-90" />
                          </button>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {timed.length > 0 ? (
            <section className="mb-3">
              <p className="mb-1 text-[0.66rem] text-ink-400">시간 일정</p>
              <ul className="space-y-1">
                {timed.map(({ event }) => {
                  const tone = categoryTone(event.category);
                  return (
                    <li key={event.id} className="flex items-center gap-2">
                      <span className={cn("w-[4.4rem] flex-none text-[0.68rem] tabular-nums", tone.text)}>
                        {event.startTime}
                        {event.endTime ? `–${event.endTime}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenEvent(event.id)}
                        className={cn("min-w-0 flex-1 truncate text-left text-[0.78rem] text-ink-700", event.canceled && "line-through opacity-50")}
                      >
                        {event.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {dayTasks.length > 0 ? (
            <section className="mb-3">
              <p className="mb-1 text-[0.66rem] text-ink-400">할 일 {dayTasks.length}</p>
              <ul className="space-y-0.5">
                {dayTasks.map(({ task }) => {
                  const tone = taskTone(task.category);
                  const waiting = task.status === "대기 중";
                  return (
                    <li key={task.id} className="flex items-start gap-2">
                      <span className={cn("mt-[5px] h-[9px] w-[9px] flex-none rounded-[2px] border", task.status === "완료" ? cn(tone.solid, "border-transparent") : "border-ink-300")} />
                      <button
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        className={cn(
                          "min-w-0 flex-1 text-left text-[0.78rem] leading-snug text-ink-700",
                          task.status === "완료" && "text-ink-300 line-through",
                        )}
                      >
                        {task.title}
                      </button>
                      {waiting ? <span className="mt-[1px] flex-none rounded bg-paper-200 px-1 text-[0.58rem] text-ink-500">대기</span> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-paper-300/80 bg-paper-50/60 px-4 py-2.5">
          <button type="button" onClick={onClose} className="btn-ghost btn-xs">
            닫기
          </button>
          <button type="button" onClick={onGoDay} className="btn-primary btn-xs">
            이 날짜로 이동
          </button>
        </div>
      </div>
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
                "relative flex h-[1.55rem] items-center justify-center rounded-md text-[0.62rem] tabular-nums transition",
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
              {count > 0 && !done ? (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-ink-900 px-[3px] text-[0.44rem] font-semibold leading-[0.7rem] text-white">
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
