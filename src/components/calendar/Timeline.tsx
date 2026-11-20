"use client";

import { useMemo } from "react";
import type { CalendarEvent } from "@/lib/types";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { categoryTone } from "@/components/common/tone";
import {
  eventCoversDay,
  eventEndMinutes,
  eventStartMinutes,
  layoutDayEvents,
  timedEventsForDay,
} from "@/components/calendar/calendar-utils";

export interface TimelineProps {
  days: string[];
  events: CalendarEvent[];
  startHour: number;
  endHour: number;
  hourHeight?: number;
  gutterWidth?: string;
  onOpenEvent: (id: string) => void;
  onCreate?: (date: string, time?: string | null) => void;
  onMoveEvent?: (id: string, date: string, time: string | null) => void;
  compact?: boolean;
}

function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const suffix = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${suffix} ${h12}`;
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
  compact = false,
}: TimelineProps) {
  const today = todayISO();
  const active = useMemo(() => events.filter((event) => !event.trash), [events]);

  const bounds = useMemo(() => {
    let start = startHour * 60;
    let end = endHour * 60;
    for (const event of active) {
      if (event.allDay || event.kind !== "일정") continue;
      for (const day of days) {
        if (!eventCoversDay(event, day)) continue;
        start = Math.min(start, Math.floor(eventStartMinutes(event) / 60) * 60);
        end = Math.max(end, Math.ceil(eventEndMinutes(event) / 60) * 60);
      }
    }
    return { start: Math.max(0, start), end: Math.min(24 * 60, Math.max(end, start + 60)) };
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

  const dropTime = (event: { clientY: number; currentTarget: HTMLDivElement }, boundsStart: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const minutes = boundsStart + (offsetY / hourHeight) * 60;
    return Math.max(0, Math.min(23 * 60 + 30, Math.round(minutes / 30) * 30));
  };

  const nowTop = ((nowMinutes - bounds.start) / 60) * hourHeight;

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
        <div className="sticky left-0 z-20 bg-white" style={{ height: totalHeight }}>
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
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                onCreate?.(day, toTime(dropTime(event, bounds.start)));
              }}
              onDragOver={(event) => {
                if (!onMoveEvent) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!onMoveEvent) return;
                event.preventDefault();
                const id = event.dataTransfer.getData("text/diary-event");
                if (!id) return;
                onMoveEvent(id, day, toTime(dropTime(event, bounds.start)));
              }}
              className={cn("relative border-l border-paper-300", isToday && "bg-paper-200/25")}
              style={{
                height: totalHeight,
                backgroundImage:
                  "repeating-linear-gradient(to bottom, #eef0f3 0, #eef0f3 1px, transparent 1px, transparent " + `${hourHeight}px)`,
              }}
            >

              {laidOut.map(({ event, start, end, lane, lanes }) => {
                const top = ((Math.max(start, bounds.start) - bounds.start) / 60) * hourHeight;
                const height = Math.max(18, ((Math.min(end, bounds.end) - Math.max(start, bounds.start)) / 60) * hourHeight - 2);
                const tone = categoryTone(event.category);
                const width = `calc(${100 / lanes}% - 4px)`;
                const left = `calc(${(lane * 100) / lanes}% + 2px)`;
                const timeLabel = event.startTime
                  ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
                  : "";
                // A8: a 30-minute card is only 18px tall, so the start time and the title
                // share one compact line instead of the time being cut below the fold.
                const compactCard = height < 34;
                return (
                  <button
                    key={`${event.id}-${day}`}
                    type="button"
                    draggable={!!onMoveEvent}
                    onDragStart={(dragEvent) => {
                      dragEvent.dataTransfer.setData("text/diary-event", event.id);
                      dragEvent.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onOpenEvent(event.id);
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded-md border text-left transition hover:brightness-[0.99]",
                      compactCard ? "px-1 py-[1px]" : "px-1.5 py-[3px]",
                      tone.bg,
                      tone.border,
                      event.canceled && "opacity-50",
                    )}
                    style={{ top, height, width, left }}
                  >
                    {timeLabel ? (
                      <span
                        className={cn(
                          "flex items-center gap-1 tabular-nums opacity-85",
                          compactCard ? "text-[0.56rem] leading-[1.1]" : "text-[0.58rem] leading-[1.15]",
                          tone.text,
                        )}
                      >
                        <span className={cn("flex-none", compactCard && "font-semibold")}>{timeLabel}</span>
                        {compactCard ? (
                          <span
                            className={cn(
                              "min-w-0 truncate text-[0.56rem] font-medium leading-[1.1]",
                              event.canceled && "line-through",
                            )}
                          >
                            {event.title}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {compactCard && !timeLabel ? (
                      <span className={cn("block truncate text-[0.56rem] font-medium leading-[1.1]", tone.text, event.canceled && "line-through")}>
                        {event.title}
                      </span>
                    ) : null}
                    {compactCard ? null : (
                      <span
                        className={cn(
                          "mt-0.5 block whitespace-normal break-words text-[0.6rem] font-medium leading-[1.2] md:text-[0.66rem]",
                          tone.text,
                          event.canceled && "line-through",
                        )}
                      >
                        {event.title}
                      </span>
                    )}
                  </button>
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
