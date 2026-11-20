"use client";

import { useMemo } from "react";
import type { CalendarEvent } from "@/lib/types";
import { formatShort, minutesToTime, todayISO, weekdayKo } from "@/lib/date";
import { cn } from "@/lib/utils";
import { categoryTone } from "@/components/common/tone";
import { useDnd } from "@/components/common/dnd";
import {
  eventCoversDay,
  eventEndMinutes,
  eventStartMinutes,
  layoutDayEvents,
  timedEventsForDay,
} from "@/components/calendar/calendar-utils";

export interface EventTimePatch {
  date: string;
  startTime: string | null;
  endTime: string | null;
  endDate: string | null;
}

export interface TimelineProps {
  days: string[];
  events: CalendarEvent[];
  startHour: number;
  endHour: number;
  hourHeight?: number;
  gutterWidth?: string;
  onOpenEvent: (id: string) => void;
  onCreate?: (date: string, time?: string | null) => void;
  onMoveEvent?: (id: string, next: EventTimePatch) => void;
  onResizeEvent?: (id: string, next: EventTimePatch) => void;
  compact?: boolean;
}

const SNAP = 15;

function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const suffix = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${suffix} ${h12}`;
}

function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP;
}

function timeLabel(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  return minutesToTime(clamped);
}

export function Timeline({
  days,
  events,
  startHour,
  endHour,
  hourHeight = 34,
  gutterWidth = "3.1rem",
  onOpenEvent,
  onCreate,
  onMoveEvent,
  onResizeEvent,
  compact = false,
}: TimelineProps) {
  const { start } = useDnd();
  const today = todayISO();
  const active = useMemo(() => events.filter((event) => !event.trash), [events]);

  const bounds = useMemo(() => {
    let from = startHour * 60;
    let to = endHour * 60;
    for (const event of active) {
      if (event.allDay || event.kind !== "일정") continue;
      for (const day of days) {
        if (!eventCoversDay(event, day)) continue;
        from = Math.min(from, Math.floor(eventStartMinutes(event) / 60) * 60);
        to = Math.max(to, Math.ceil(eventEndMinutes(event) / 60) * 60);
      }
    }
    return { start: Math.max(0, from), end: Math.min(24 * 60, Math.max(to, from + 60)) };
  }, [active, days, endHour, startHour]);

  const totalHeight = ((bounds.end - bounds.start) / 60) * hourHeight;
  const marks = useMemo(() => {
    const list: number[] = [];
    for (let minutes = bounds.start; minutes <= bounds.end; minutes += 60) list.push(minutes);
    return list;
  }, [bounds]);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = days.includes(today) && nowMinutes >= bounds.start && nowMinutes <= bounds.end;
  const nowTop = ((nowMinutes - bounds.start) / 60) * hourHeight;

  /** Pointer y inside a column → minutes from midnight, snapped to 15 minutes. */
  const minutesAt = (rect: DOMRect, y: number) => bounds.start + ((y - rect.top) / hourHeight) * 60;

  const columnHint = (date: string, minutes: number) =>
    `${formatShort(date)} ${weekdayKo(date)} · ${timeLabel(snapMinutes(minutes))}`;

  const handleMove = (event: CalendarEvent) => (pointerEvent: React.PointerEvent<HTMLElement>) => {
    if (!onMoveEvent) return;
    const duration = Math.max(SNAP, eventEndMinutes(event) - eventStartMinutes(event));
    start(
      pointerEvent,
      { kind: "event", id: event.id, label: event.title },
      (target, point) => {
        if (!target) return;
        const date = target.zone === "cal-day" ? target.data.date : null;
        if (!date) return;
        const dropMinutes = snapMinutes(minutesAt(target.rect, point.y));
        const from = Math.max(0, Math.min(24 * 60 - duration, dropMinutes));
        onMoveEvent(event.id, {
          date,
          startTime: timeLabel(from),
          endTime: timeLabel(from + duration),
          endDate: date,
        });
      },
      {
        getHint: (target, point) =>
          target.zone === "cal-day" && target.data.date
            ? columnHint(target.data.date, minutesAt(target.rect, point.y))
            : null,
      },
    );
  };

  const handleResize = (event: CalendarEvent, edge: "start" | "end") => (pointerEvent: React.PointerEvent<HTMLElement>) => {
    if (!onResizeEvent) return;
    const columnEl = pointerEvent.currentTarget.parentElement;
    const label = edge === "start" ? `${event.title} · 시작` : `${event.title} · 끝`;
    start(
      pointerEvent,
      { kind: "event-resize", id: event.id, label },
      (target, point) => {
        const rect = columnEl?.getBoundingClientRect() ?? target?.rect;
        if (!rect) return;
        const minutes = Math.max(0, Math.min(24 * 60, snapMinutes(minutesAt(rect, point.y))));
        if (edge === "start") {
          const end = eventEndMinutes(event);
          const nextStart = Math.min(minutes, end - SNAP);
          onResizeEvent(event.id, {
            date: event.date,
            startTime: timeLabel(nextStart),
            endTime: timeLabel(end),
            endDate: event.endDate && event.endDate > event.date ? event.endDate : event.date,
          });
        } else {
          const from = eventStartMinutes(event);
          const nextEnd = Math.max(from + SNAP, minutes);
          onResizeEvent(event.id, {
            date: event.date,
            startTime: timeLabel(from),
            endTime: timeLabel(nextEnd),
            endDate: event.date,
          });
        }
      },
      { getHint: () => null },
    );
  };

  return (
    <div className="relative">
      {showNow ? (
        <div
          className="pointer-events-none absolute right-0 z-10 h-px bg-red-400"
          style={{ top: nowTop, left: gutterWidth }}
        >
          <span className="absolute -left-[3px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-red-500" />
        </div>
      ) : null}
      <div className="grid" style={{ gridTemplateColumns: `${gutterWidth} repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="relative" style={{ height: totalHeight }}>
          {marks.map((minutes) => (
            <div
              key={minutes}
              className="absolute right-2 -translate-y-1/2 text-[0.64rem] tabular-nums text-ink-400"
              style={{ top: ((minutes - bounds.start) / 60) * hourHeight }}
            >
              {hourLabel(minutes)}
            </div>
          ))}
          {showNow ? (
            <span
              className="absolute left-0 z-20 flex -translate-y-1/2 items-center rounded-full border border-red-300 bg-white px-1.5 py-0.5 text-[0.58rem] font-medium text-red-500"
              style={{ top: Math.max(6, ((nowMinutes - bounds.start) / 60) * hourHeight) }}
            >
              <span className="mr-0.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-red-500" />
              지금
            </span>
          ) : null}
        </div>

        {days.map((day) => {
          const timed = timedEventsForDay(active, day);
          const laidOut = layoutDayEvents(timed);
          const isToday = day === today;
          return (
            <div
              key={day}
              data-drop-zone="cal-day"
              data-drop-date={day}
              data-drop-hint={`${formatShort(day)} ${weekdayKo(day)}`}
              onClick={(clickEvent) => {
                if (clickEvent.target !== clickEvent.currentTarget) return;
                const rect = clickEvent.currentTarget.getBoundingClientRect();
                const minutes = Math.max(0, Math.min(24 * 60 - 60, snapMinutes(minutesAt(rect, clickEvent.clientY))));
                onCreate?.(day, toTime(minutes));
              }}
              className={cn("relative border-l border-paper-300", isToday && "bg-paper-200/25")}
              style={{
                height: totalHeight,
                backgroundImage:
                  "repeating-linear-gradient(to bottom, #eef0f3 0, #eef0f3 1px, transparent 1px, transparent " + `${hourHeight}px)`,
              }}
            >
              {laidOut.map(({ event, start: eventStart, end, lane, lanes }) => {
                const top = ((Math.max(eventStart, bounds.start) - bounds.start) / 60) * hourHeight;
                const height = Math.max(18, ((Math.min(end, bounds.end) - Math.max(eventStart, bounds.start)) / 60) * hourHeight - 2);
                const tone = categoryTone(event.category);
                const width = `calc(${100 / lanes}% - 4px)`;
                const left = `calc(${(lane * 100) / lanes}% + 2px)`;
                const resizable = height >= 20 && !!onResizeEvent && !!event.startTime;
                const handleClass = height > 40 ? "h-[9px]" : "h-[6px]";
                return (
                  <div key={`${event.id}-${day}`} className="absolute" style={{ top, height, width, left }}>
                    <button
                      type="button"
                      data-drag-source="event"
                      onPointerDown={handleMove(event)}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onOpenEvent(event.id);
                      }}
                      className={cn(
                        "absolute inset-0 overflow-hidden rounded-md border px-1.5 py-[3px] text-left transition hover:brightness-[0.99]",
                        tone.bg,
                        tone.border,
                        event.canceled && "opacity-50",
                        onMoveEvent && "cursor-grab",
                      )}
                      style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
                    >
                      <span
                        className={cn(
                          "block whitespace-normal break-words text-[0.6rem] font-medium leading-[1.2] md:truncate md:whitespace-nowrap md:text-[0.68rem]",
                          tone.text,
                          event.canceled && "line-through",
                        )}
                      >
                        {event.title}
                      </span>
                      {height > 34 ? (
                        <span className={cn("mt-0.5 hidden truncate text-[0.6rem] leading-tight opacity-80 md:block", tone.text)}>
                          {event.startTime}
                          {event.endTime ? `–${event.endTime}` : ""}
                        </span>
                      ) : null}
                    </button>
                    {resizable ? (
                      <>
                        <span
                          role="presentation"
                          aria-hidden="true"
                          onPointerDown={handleResize(event, "start")}
                          className={cn("dnd-handle absolute inset-x-1 top-0 z-10 cursor-ns-resize", handleClass)}
                        />
                        <span
                          role="presentation"
                          aria-hidden="true"
                          onPointerDown={handleResize(event, "end")}
                          className={cn("dnd-handle absolute inset-x-1 bottom-0 z-10 cursor-ns-resize", handleClass)}
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}

              {compact ? null : (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreate?.(day, null);
                  }}
                  className="absolute inset-x-0 bottom-0 hidden items-center justify-center py-0.5 text-[0.6rem] text-ink-300 hover:text-ink-500 lg:flex"
                  aria-label="일정 추가"
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
