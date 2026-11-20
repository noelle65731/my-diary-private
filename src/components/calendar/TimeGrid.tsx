"use client";

import { useMemo, useRef, useState } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { formatShort, isSameISO, minutesToTime, todayISO, weekdayKo } from "@/lib/date";
import { holidayName, isRedDay } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone } from "@/components/common/tone";
import { CheckIcon, PlusIcon, RepeatIcon } from "@/components/icons";
import {
  allDayEventsForDay,
  eventCoversDay,
  eventEndMinutes,
  eventStartMinutes,
  layoutDayEvents,
  routineCountForDay,
  routinesForDay,
  tasksForDay,
  timedEventsForDay,
} from "@/components/calendar/calendar-utils";

const HOUR_HEIGHT = 52;

export interface TimeGridProps {
  days: string[];
  events: CalendarEvent[];
  tasks: ProjectTask[];
  routines: Routine[];
  mode: ModeFilter;
  showWeekends: boolean;
  startHour: number;
  endHour: number;
  allDayCollapse: number;
  onSelectDay: (day: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onCreate: (date: string, time?: string | null) => void;
  onMoveEvent: (id: string, date: string, time: string | null) => void;
  onToggleTask: (task: ProjectTask) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
}

export function TimeGrid({
  days,
  events,
  tasks,
  routines,
  mode,
  showWeekends,
  startHour,
  endHour,
  allDayCollapse,
  onSelectDay,
  onOpenEvent,
  onOpenTask,
  onCreate,
  onMoveEvent,
  onToggleTask,
  onRoutineCount,
}: TimeGridProps) {
  const today = todayISO();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const visibleDays = useMemo(
    () => days.filter((day) => showWeekends || !isRedDay(day) || isSameISO(day, today)),
    [days, showWeekends, today],
  );

  const activeEvents = useMemo(
    () => events.filter((event) => !event.trash && (mode === "all" || !event.hidden)),
    [events, mode],
  );
  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.trash && (mode === "all" || !task.hidden)),
    [tasks, mode],
  );

  const bounds = useMemo(() => {
    let start = startHour * 60;
    let end = endHour * 60;
    for (const event of activeEvents) {
      if (event.allDay || event.kind !== "일정") continue;
      for (const day of visibleDays) {
        if (!eventCoversDay(event, day)) continue;
        start = Math.min(start, Math.floor(eventStartMinutes(event) / 60) * 60);
        end = Math.max(end, Math.ceil(eventEndMinutes(event) / 60) * 60);
      }
    }
    return { start: Math.max(0, start), end: Math.min(24 * 60, Math.max(end, start + 60)) };
  }, [activeEvents, endHour, startHour, visibleDays]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let minutes = bounds.start; minutes <= bounds.end; minutes += 60) marks.push(minutes);
    return marks;
  }, [bounds]);

  const totalHeight = ((bounds.end - bounds.start) / 60) * HOUR_HEIGHT;
  const gridTemplate = `3.1rem repeat(${visibleDays.length}, minmax(6.2rem, 1fr))`;
  const minWidth = `${56 + visibleDays.length * 104}px`;

  const handleDrop = (day: string, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/diary-event");
    if (!id) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const minutes = bounds.start + (offsetY / HOUR_HEIGHT) * 60;
    const rounded = Math.round(minutes / 30) * 30;
    onMoveEvent(id, day, minutesToTime(Math.max(0, Math.min(23 * 60 + 30, rounded))));
  };

  const handleColumnClick = (day: string, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const minutes = bounds.start + (offsetY / HOUR_HEIGHT) * 60;
    const rounded = Math.round(minutes / 30) * 30;
    onCreate(day, minutesToTime(Math.max(0, Math.min(23 * 60 + 30, rounded))));
  };

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          {/* day header */}
          <div className="grid border-b border-paper-300/80" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="flex items-end justify-center pb-2 pt-3">
              <span className="text-[0.6rem] uppercase tracking-wide text-ink-400">시간</span>
            </div>
            {visibleDays.map((day) => {
              const holiday = holidayName(day);
              const isToday = isSameISO(day, today);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={cn(
                    "group flex flex-col items-center gap-0.5 border-l border-paper-300/60 px-1 pb-2 pt-2.5 transition hover:bg-paper-100/70",
                    isToday && "bg-accent-50/60",
                  )}
                >
                  <span className={cn("text-[0.64rem]", isRedDay(day) ? "text-accent-500" : "text-ink-400")}>{weekdayKo(day)}</span>
                  <span
                    className={cn(
                      "flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[0.92rem] font-medium",
                      isToday ? "bg-ink-900 text-paper-50" : isRedDay(day) ? "text-accent-600" : "text-ink-800",
                    )}
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                  {holiday ? <span className="max-w-full truncate text-[0.56rem] text-accent-500">{holiday}</span> : null}
                </button>
              );
            })}
          </div>

          {/* all-day + tasks */}
          <div className="grid border-b border-paper-300/80 bg-paper-50/40" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="flex flex-col items-end justify-start gap-1 py-2 pr-1.5">
              <span className="text-[0.6rem] font-medium text-ink-400">종일</span>
            </div>
            {visibleDays.map((day) => {
              const allDay = allDayEventsForDay(activeEvents, day);
              const dayTasks = tasksForDay(activeTasks, day).filter((task) => task.status !== "취소");
              const total = allDay.length + dayTasks.length;
              const collapsed = total > allDayCollapse && !expanded[day];
              const routineItems = mode === "all" ? routinesForDay(routines, day) : [];
              return (
                <div key={day} className="min-h-[2.4rem] border-l border-paper-300/60 px-1 py-1.5">
                  <div className="flex flex-col gap-1">
                    {(collapsed ? allDay.slice(0, 1) : allDay).map((event) => {
                      const tone = categoryTone(event.category);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => onOpenEvent(event.id)}
                          className={cn(
                            "flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[0.66rem] font-medium",
                            tone.bg,
                            tone.text,
                            event.canceled && "opacity-50 line-through",
                            event.done && "opacity-70",
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 flex-none rounded-full", tone.dot)} />
                          <span className="truncate">{event.title}</span>
                        </button>
                      );
                    })}
                    {(collapsed ? dayTasks.slice(0, 1) : dayTasks).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        className={cn(
                          "group flex items-center gap-1 truncate rounded-md border border-paper-300 bg-white/70 px-1.5 py-0.5 text-left text-[0.66rem] text-ink-600",
                          task.status === "완료" && "text-ink-400 line-through",
                        )}
                      >
                        <span
                          role="checkbox"
                          aria-checked={task.status === "완료"}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            onToggleTask(task);
                          }}
                          className={cn(
                            "flex h-3 w-3 flex-none items-center justify-center rounded-[3px] border",
                            task.status === "완료" ? "border-sage-400 bg-sage-400 text-white" : "border-paper-400",
                          )}
                        >
                          {task.status === "완료" ? <CheckIcon size={8} /> : null}
                        </span>
                        <span className="truncate">{task.title}</span>
                      </button>
                    ))}
                    {mode === "all"
                      ? routineItems.map((routine) => {
                          const count = routineCountForDay(routines, routine, day);
                          const target = routine.targetCount ?? 1;
                          return (
                            <button
                              key={routine.id}
                              type="button"
                              onClick={() => onRoutineCount(routine, day, count >= target ? 0 : count + 1)}
                              className={cn(
                                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.64rem]",
                                count >= target ? "bg-sage-100 text-sage-500" : "bg-paper-200/70 text-ink-500",
                              )}
                            >
                              <RepeatIcon size={10} />
                              <span className="truncate">{routine.title}</span>
                              <span className="ml-auto font-medium">
                                {count}/{target}
                              </span>
                            </button>
                          );
                        })
                      : null}
                    {collapsed ? (
                      <button
                        type="button"
                        onClick={() => setExpanded((current) => ({ ...current, [day]: true }))}
                        className="rounded-md bg-paper-200/70 px-1.5 py-0.5 text-left text-[0.62rem] text-ink-500 hover:bg-paper-200"
                      >
                        +{total - (allDay.length > 0 ? 1 : 0) - (dayTasks.length > 0 ? 1 : 0)} 더 보기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onCreate(day, null)}
                      className="flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[0.6rem] text-ink-300 transition hover:bg-paper-100 hover:text-ink-600"
                    >
                      <PlusIcon size={10} /> 추가
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* timeline */}
          <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="relative" style={{ height: totalHeight }}>
              {hourMarks.map((minutes) => (
                <div
                  key={minutes}
                  className="absolute right-1.5 -translate-y-1/2 text-[0.6rem] tabular-nums text-ink-400"
                  style={{ top: ((minutes - bounds.start) / 60) * HOUR_HEIGHT }}
                >
                  {String(Math.floor(minutes / 60)).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {visibleDays.map((day) => {
              const timed = timedEventsForDay(activeEvents, day);
              const laidOut = layoutDayEvents(timed);
              return (
                <div
                  key={day}
                  ref={(node) => {
                    columnRefs.current[day] = node;
                  }}
                  onClick={(event) => handleColumnClick(day, event)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(day, event)}
                  className="relative border-l border-paper-300/60"
                  style={{
                    height: totalHeight,
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, rgba(185,173,152,0.22) 0, rgba(185,173,152,0.22) 1px, transparent 1px, transparent " +
                      `${HOUR_HEIGHT}px)`,
                  }}
                >
                  {laidOut.map(({ event, start, end, lane, lanes }) => {
                    const top = ((Math.max(start, bounds.start) - bounds.start) / 60) * HOUR_HEIGHT;
                    const height = Math.max(20, ((Math.min(end, bounds.end) - Math.max(start, bounds.start)) / 60) * HOUR_HEIGHT - 2);
                    const tone = categoryTone(event.category);
                    const width = `calc(${100 / lanes}% - 3px)`;
                    const left = `calc(${(lane * 100) / lanes}% + 1px)`;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        draggable
                        onDragStart={(dragEvent) => {
                          dragEvent.dataTransfer.setData("text/diary-event", event.id);
                          dragEvent.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onOpenEvent(event.id);
                        }}
                        className={cn(
                          "absolute overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-sm transition hover:brightness-[1.02] hover:shadow-md",
                          tone.soft,
                          tone.border,
                          event.canceled && "opacity-45",
                        )}
                        style={{ top, height, width, left }}
                      >
                        <span className={cn("block truncate text-[0.64rem] font-medium leading-tight", tone.text, event.canceled && "line-through")}>
                          {event.title}
                        </span>
                        {height > 30 ? (
                          <span className="mt-0.5 block truncate text-[0.58rem] text-ink-500">
                            {event.startTime}
                            {event.endTime ? `–${event.endTime}` : ""}
                          </span>
                        ) : null}
                        {event.done && height > 44 ? (
                          <span className="mt-0.5 inline-flex items-center gap-0.5 text-[0.56rem] text-sage-500">
                            <CheckIcon size={9} /> 완료
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-paper-300/70 px-3 py-1.5 text-[0.62rem] text-ink-400">
        <span>클릭해서 추가 · 드래그로 옮기기</span>
        <span className="ml-auto hidden sm:inline">{formatShort(visibleDays[0] ?? today)} – {formatShort(visibleDays[visibleDays.length - 1] ?? today)}</span>
        <span className="text-ink-300">{visibleDays.length}일</span>
      </div>
    </div>
  );
}
