"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { daysInMonth, formatShort, isSameISO, monthMatrix, timeRangeLabel, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { routineTone, taskTone } from "@/components/common/tone";
import { useEventColors } from "@/state/event-colors";
import { useCategoryColors } from "@/state/category-colors";
import { useProjectColors } from "@/state/project-colors";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from "@/components/icons";
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
  /** A21: 한 주 줄(빈 공간)을 누르면 그 주의 주간 보기로 — `day`는 그 주 아무 날이나 됩니다. */
  onSelectWeek?: (day: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  /** A10: a tap on the month checkbox completes the task, a second tap clears it. */
  onToggleTask?: (task: ProjectTask) => void;
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
  onSelectWeek,
  onOpenEvent,
  onOpenTask,
  onToggleTask,
  onUpdateEvent,
  onRoutineCount,
  onMoveItem,
  onCreate,
}: MonthViewProps) {
  const today = todayISO();
  const { toneFor } = useEventColors();
  /** A19: 분류에 직접 고른 색이 있으면 할 일 점·배지에 그 색을 씁니다. */
  const categoryColor = useCategoryColors();
  /** A19: 할 일 밑줄은 그 할 일이 속한 프로젝트의 색을 그대로 씁니다. */
  const { pastelOf } = useProjectColors();
  const projectById = useMemo(
    () => new Map(tasks.filter((task) => task.kind === "프로젝트").map((task) => [task.id, task])),
    [tasks],
  );
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
  /** A16: on a phone a tap shows the day's list first; the editor opens from that list. */
  const [touchLayout, setTouchLayout] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setTouchLayout(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const openItemFirst = (kind: "event" | "task", id: string, day: string) => {
    if (touchLayout) {
      setOpenDay(day);
      return;
    }
    if (kind === "event") onOpenEvent(id);
    else onOpenTask(id);
  };

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

  /** 한 칩이 차지하는 높이(px) — 설정한 개수만큼은 잘리지 않고 보이도록 행 최소 높이를 잡습니다. */
  const chipRow = 22;
  const cellMinHeight = 28 + dayItems * chipRow + (dayItems - 1) * 2 + 6;

  const openDayDate = openDay;
  const openDayItems = openDayDate ? itemsForDay(openDayDate) : [];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="grid flex-none grid-cols-7 border-b border-paper-300 pr-[1.15rem] lg:pr-0">
        {weekdays.map((label, index) => {
          const dow = weekStartsOn === 1 ? (index + 1) % 7 : index;
          return (
            <div
              key={label}
              className={cn(
                "py-1.5 pl-3 text-left text-[calc(14px*var(--fs))]",
                dow === 6 ? "text-blue-500" : dow === 0 ? "text-red-400" : "text-ink-400",
              )}
            >
              {label}
            </div>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {matrix.map((row, rowIndex) => {
        const cells = showWeekends ? row : row.filter((_, index) => {
          const dow = new Date(`${row[index]}T12:00:00`).getDay();
          return dow !== 0 && dow !== 6;
        });
        const weekStartDay = row[0] ?? cells[0] ?? cursor;
        return (
          <div
            key={rowIndex}
            data-month-row={weekStartDay}
            onClick={(event) => {
              // A21: 한 주 전체가 '주간 보기'로 가는 줄입니다. 날짜·일정·할 일·더보기는
              // 각자 할 일을 하도록 그대로 두고, 줄의 빈 공간만 주간 이동으로 씁니다.
              const target = event.target as HTMLElement;
              if (!onSelectWeek) return;
              if (target.closest("[data-month-item]") || target.closest("[data-day-num]") || target.closest("[data-month-more]")) return;
              onSelectWeek(weekStartDay);
            }}
            className="group/row relative grid min-h-0 flex-1 border-b border-paper-300 pr-[1.15rem] transition-colors last:border-b-0 hover:bg-[#eef1f6]/70 lg:pr-0"
            style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0,1fr))`, minHeight: cellMinHeight }}
          >
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
                  data-month-cell={day}
                  onClick={(event) => {
                    // A21: 주 줄이 주간 보기로 가는 동안에는 빈 공간 클릭으로 하루 목록을 열지 않습니다
                    // (하루 목록은 `할 일 N` · `+N 더`에서 열립니다). 주간 이동이 없을 때만 예전처럼 엽니다.
                    if (onSelectWeek) return;
                    // A16/A19: on a phone the whole cell leads to that day's list, and on a
                    // desktop the white space, the date and +N do too — chips keep opening
                    // their own record, so a click that landed on one is left alone.
                    if ((event.target as HTMLElement).closest("[data-month-item]")) return;
                    setOpenDay(day);
                  }}
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
                    "group relative min-h-0 overflow-hidden border-r border-paper-300 px-0.5 pb-1 pt-1 last:border-r-0 md:px-2 md:pb-1 md:pt-1",
                    !inMonth && "bg-paper-200/25",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      data-day-num={day}
                      title={`${formatShort(day)} ${weekdayKo(day)}요일 · 하루 보기`}
                      aria-label={`${formatShort(day)} 하루 보기`}
                      onClick={(event) => {
                        // A21: 날짜 숫자는 그 날의 일간 보기로 갑니다 (줄 클릭과 겹치지 않게 멈춥니다).
                        event.stopPropagation();
                        onSelectDay(day);
                      }}
                      className={cn(
                        "flex h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[calc(14px*var(--fs))] font-medium tabular-nums transition md:h-[1.4rem] md:min-w-[1.4rem] md:text-[calc(15px*var(--fs))]",
                        isToday
                          ? "bg-ink-900 text-white"
                          : holiday || dow === 0
                            ? "text-red-500"
                            : dow === 6
                              ? "text-blue-600"
                              : inMonth
                                ? "text-ink-700"
                                : "text-ink-300",
                        !isToday && "hover:bg-paper-200 group-hover/row:bg-paper-200/80",
                        "hover:ring-1 hover:ring-inset hover:ring-ink-900/15",
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </button>
                  </div>
                  {holiday ? <p className="truncate text-[calc(12.5px*var(--fs))] text-red-500">{holiday}</p> : null}

                  <div className="mt-0.5 space-y-[2px]">
                    {visibleItems.map((item) => {
                      if (item.type === "event") {
                        const tone = toneFor(item.event);
                        const multiDay = !!item.event.endDate && item.event.endDate > item.event.date;
                        return (
                          <button
                            key={item.event.id}
                            data-month-item={item.event.id}
                            type="button"
                            draggable={!!onMoveItem}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/diary-item", `event:${item.event.id}`);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() => openItemFirst("event", item.event.id, day)}
                            className={cn(
                              "flex w-full items-start gap-1 rounded px-0.5 py-[1px] text-left text-[calc(13px*var(--fs))] leading-[1.3] md:px-1 md:text-[calc(14px*var(--fs))] md:leading-[1.35]",
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
                      const taskDone = item.task.status === "완료";
                      const taskColor = categoryColor.toneOf(item.task.category, taskTone(item.task.category));
                      const owner = item.task.projectIds[0] ? projectById.get(item.task.projectIds[0]!) : undefined;
                      /* A19: 네모 배경 대신 프로젝트 색 밑줄 하나 — 프로젝트가 없으면 옅은 회색. */
                      const underline = owner ? pastelOf(owner.id).line : "#e5e7eb";
                      return (
                        <div
                          key={item.task.id}
                          data-month-item={item.task.id}
                          draggable={!!onMoveItem}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/diary-item", `task:${item.task.id}`);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          className="flex min-h-[1rem] w-full items-center gap-0.5 px-0.5 py-[1px] md:min-h-[1.05rem] md:gap-1 md:px-1"
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleTask?.(item.task);
                            }}
                            aria-label={taskDone ? `${item.task.title} 완료 해제` : `${item.task.title} 완료`}
                            aria-pressed={taskDone}
                            title={taskDone ? "다시 누르면 완료 해제" : "누르면 완료"}
                            className={cn(
                              "flex h-[10px] w-[10px] flex-none items-center justify-center rounded-[2px] border transition md:h-[11px] md:w-[11px] md:rounded-[3px]",
                              taskDone ? cn(taskColor.solid, "border-transparent text-white") : "border-ink-300 hover:border-ink-500",
                            )}
                          >
                            {taskDone ? <CheckIcon size={7} /> : null}
                          </button>
                          <button
                            type="button"
                            onClick={() => openItemFirst("task", item.task.id, day)}
                            className={cn(
                              "min-w-0 flex-1 truncate text-left text-[calc(13px*var(--fs))] leading-[1.35] text-ink-500 md:text-[calc(14px*var(--fs))] md:leading-[1.45]",
                              taskDone && "text-ink-300 line-through",
                            )}
                            data-project-underline={owner ? owner.id : "none"}
                          >
                            <span
                              className="border-b-2 pb-[0.5px]"
                              style={{ borderColor: underline }}
                            >
                              {item.task.startTime ? (
                                <span className="mr-1 hidden tabular-nums opacity-80 md:inline">
                                  {timeRangeLabel(item.task.startTime, item.task.endTime)}
                                </span>
                              ) : null}
                              {item.task.title}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                    {restTasks > 0 ? (
                      <button
                        type="button"
                        data-month-more={day}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenDay(day);
                        }}
                        className="block w-full px-0.5 text-left text-[calc(13px*var(--fs))] text-ink-500 hover:text-ink-800 md:px-1 md:text-[calc(13.5px*var(--fs))]"
                      >
                        할 일 {restTasks}
                      </button>
                    ) : null}
                    {restEvents > 0 ? (
                      <button
                        type="button"
                        data-month-more={day}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenDay(day);
                        }}
                        className="block w-full px-0.5 text-left text-[calc(13px*var(--fs))] text-ink-400 hover:text-ink-700 md:px-1 md:text-[calc(13.5px*var(--fs))]"
                      >
                        +{restEvents} 더
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {onSelectWeek ? (
              <>
                {/* 좁은 화면: 오른쪽에 늘 보이는 '주' 기둥 — 칸 내용과 겹치지 않게 자리를 비워 둡니다. */}
                <button
                  type="button"
                  data-week-link={weekStartDay}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectWeek(weekStartDay);
                  }}
                  aria-label={`${formatShort(weekStartDay)}부터 한 주 주간 보기`}
                  title="이 주 주간 보기"
                  className="absolute right-0 top-1/2 z-20 flex w-[1.15rem] -translate-y-1/2 flex-col items-center gap-[1px] rounded-l-md border border-r-0 border-paper-300 bg-white py-1 text-[calc(10px*var(--fs))] font-medium leading-none text-ink-400 transition hover:bg-paper-100 hover:text-ink-900 lg:hidden"
                >
                  주
                  <span aria-hidden className="text-[calc(9px*var(--fs))]">
                    ›
                  </span>
                </button>
                {/* 넓은 화면: 그 주 줄에 마우스를 올릴 때만 나타나는 '이 주 보기'. */}
                <button
                  type="button"
                  data-week-link-wide={weekStartDay}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectWeek(weekStartDay);
                  }}
                  aria-label={`${formatShort(weekStartDay)}부터 한 주 주간 보기`}
                  title="이 주 주간 보기"
                  className="pointer-events-none absolute right-1 top-1 z-20 hidden items-center gap-0.5 rounded-full border border-paper-300 bg-white/95 px-1.5 py-[1px] text-[calc(11.5px*var(--fs))] font-medium leading-[1.3] text-ink-500 opacity-0 shadow-sm transition hover:border-ink-900 hover:text-ink-900 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 lg:flex"
                >
                  이 주 보기
                  <span aria-hidden>›</span>
                </button>
              </>
            ) : null}
          </div>
        );
      })}

      </div>

      {routineTemplates.length > 0 ? (
        <div className="mt-2 max-h-[26%] flex-none space-y-2 overflow-y-auto xl:hidden">
          <h3 className="text-[calc(15.5px*var(--fs))] font-semibold text-ink-900">이번 달 루틴</h3>
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
          onCreate={() => onCreate(openDayDate)}
          onOpenEvent={onOpenEvent}
          onOpenTask={onOpenTask}
          onToggleTask={onToggleTask}
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
  onToggleTask,
  onMoveAllDay,
  onCreate,
}: {
  day: string;
  items: CellItem[];
  onClose: () => void;
  onGoDay: () => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleTask?: (task: ProjectTask) => void;
  onMoveAllDay: (id: string, direction: -1 | 1) => void;
  /** A16: the day list can start a new record without leaving the month. */
  onCreate?: () => void;
}) {
  const { toneFor } = useEventColors();
  const categoryColor = useCategoryColors();
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
            <p className="text-[calc(13.5px*var(--fs))] text-ink-400">이 날짜 전체</p>
            <p className="mt-0.5 truncate text-[calc(16px*var(--fs))] font-semibold text-ink-900">
              {formatShort(day)} {weekdayKo(day)}요일
              {holiday ? <span className="ml-1 text-[calc(14.5px*var(--fs))] font-normal text-red-500">{holiday}</span> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn -mr-1 -mt-1" aria-label="닫기">
            <XIcon size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <p className="rounded-xl bg-paper-200/50 px-3 py-6 text-center text-[calc(14.5px*var(--fs))] text-ink-400">이 날짜에는 일정도 할 일도 없습니다.</p>
          ) : null}

          {allDay.length > 0 ? (
            <section className="mb-3">
              <p className="mb-1 flex items-baseline justify-between text-[calc(13.5px*var(--fs))] text-ink-400">
                <span>종일 일정</span>
                {allDay.length > 1 ? <span className="text-[calc(13px*var(--fs))] text-ink-300">↑↓ 로 순서 바꾸기</span> : null}
              </p>
              <ul className="space-y-1">
                {allDay.map(({ event }, index) => {
                  const tone = toneFor(event);
                  return (
                    <li key={event.id} className={cn("flex items-center gap-1 rounded-lg border px-2 py-1.5", tone.bg, tone.border)}>
                      <button
                        type="button"
                        onClick={() => onOpenEvent(event.id)}
                        className={cn(
                          "min-w-0 flex-1 truncate text-left text-[calc(15px*var(--fs))]",
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
              <p className="mb-1 text-[calc(13.5px*var(--fs))] text-ink-400">시간 일정</p>
              <ul className="space-y-1">
                {timed.map(({ event }) => {
                  const tone = toneFor(event);
                  return (
                    <li key={event.id} className="flex items-center gap-2">
                      <span className={cn("w-[4.4rem] flex-none text-[calc(14px*var(--fs))] tabular-nums", tone.text)}>
                        {event.startTime}
                        {event.endTime ? `–${event.endTime}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenEvent(event.id)}
                        className={cn("min-w-0 flex-1 truncate text-left text-[calc(15px*var(--fs))] text-ink-700", event.canceled && "line-through opacity-50")}
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
              <p className="mb-1 text-[calc(13.5px*var(--fs))] text-ink-400">할 일 {dayTasks.length}</p>
              <ul className="space-y-0.5">
                {dayTasks.map(({ task }) => {
                  const tone = categoryColor.toneOf(task.category, taskTone(task.category));
                  const waiting = task.status === "대기 중";
                  return (
                    <li key={task.id} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleTask?.(task)}
                        aria-label={task.status === "완료" ? `${task.title} 완료 해제` : `${task.title} 완료`}
                        aria-pressed={task.status === "완료"}
                        className={cn(
                          "mt-[3px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-[4px] border transition",
                          task.status === "완료" ? cn(tone.solid, "border-transparent text-white") : "border-ink-300 hover:border-ink-500",
                        )}
                      >
                        {task.status === "완료" ? <CheckIcon size={9} /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        className={cn(
                          "min-w-0 flex-1 text-left text-[calc(15px*var(--fs))] leading-snug text-ink-700",
                          task.status === "완료" && "text-ink-300 line-through",
                        )}
                      >
                        {task.title}
                      </button>
                      {waiting ? <span className="mt-[1px] flex-none rounded bg-paper-200 px-1 text-[calc(12.5px*var(--fs))] text-ink-500">대기</span> : null}
                      {task.startTime ? (
                        <span className="mt-[3px] flex-none text-[calc(12.5px*var(--fs))] tabular-nums text-ink-400">
                          {timeRangeLabel(task.startTime, task.endTime)}
                        </span>
                      ) : null}
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
          <div className="flex items-center gap-1.5">
            {onCreate ? (
              <button type="button" onClick={onCreate} className="btn-outline btn-xs">
                + 새 일정
              </button>
            ) : null}
            <button type="button" onClick={onGoDay} className="btn-primary btn-xs">
              이 날짜로 이동
            </button>
          </div>
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
          <span className={cn("flex h-5 w-5 flex-none items-center justify-center rounded-md text-[calc(13px*var(--fs))]", tone.soft, tone.text)}>루</span>
          <span className="truncate text-[calc(15px*var(--fs))] font-semibold text-ink-900">{routine.title}</span>
        </div>
        <span className="flex-none text-[calc(15px*var(--fs))] font-semibold tabular-nums text-ink-900">
          {doneCount}
          <span className="text-[calc(14px*var(--fs))] font-normal text-ink-400">/{scheduledCount}</span>
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
                "relative flex h-[1.55rem] items-center justify-center rounded-md text-[calc(13px*var(--fs))] tabular-nums transition",
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
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-ink-900 px-[3px] text-[calc(10px*var(--fs))] font-semibold leading-[0.7rem] text-white">
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
