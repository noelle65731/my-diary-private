"use client";

import { formatClock } from "@/lib/date";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useEventColors } from "@/state/event-colors";
import { useDnd, type DropTarget } from "@/components/common/dnd";
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
  /** Keeps the drawn hours exactly startHour–endHour, even when an event sits outside them.
   *  The week board uses this on a phone so the day shows a few hours, not all of them. */
  fixedWindow?: boolean;
  hourHeight?: number;
  gutterWidth?: string;
  onOpenEvent: (id: string) => void;
  /**
   * A32: 넓은 화면에서 일정 카드를 누르면 그 일정을 바로 열지 않고,
   * 그 날의 정리 목록을 먼저 보여 줍니다. 이 값이 있으면 이쪽이 먼저 불립니다.
   */
  onOpenEventDay?: (id: string, day: string) => void;
  /**
   * A32: 빈 시간표 칸을 한 번 눌렀을 때. 넘기지 않으면 예전처럼 그 시각으로 새 일정을 엽니다.
   * (끌어서 범위를 그리는 동작은 그대로 새 일정을 만듭니다.)
   */
  onClickEmptyDay?: (day: string, time: string | null) => void;
  /** B5: an empty-slot drag fills start and end; a plain tap still creates a 1-hour slot. */
  onCreate?: (date: string, time?: string | null, endTime?: string | null) => void;
  onMoveEvent?: (id: string, date: string, time: string | null) => void;
  /** A39: 시간 일정을 프로젝트 칸·index 칸에 놓으면 그곳의 할 일로 바꿉니다. */
  onDropEventToTask?: (id: string, projectKey: string, day: string | null) => void;
  /** A18: 시간표의 일정을 종일 칸에 놓으면 그 날의 종일 일정이 됩니다. */
  onMoveAllDayDate?: (id: string, date: string) => void;
  /** B5: dragging the top/bottom edge of an event resizes it (13–15 → 13–17). */
  onResizeEvent?: (id: string, startTime: string, endTime: string) => void;
  compact?: boolean;
}

function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const suffix = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${suffix} ${h12}`;
}

function toTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const snap = (minutes: number) => Math.round(minutes / 15) * 15;

/** Minutes under the pointer inside a dropped timeline column (null when outside one). */
export function minutesFromDrop(target: DropTarget, point: { x: number; y: number }): number | null {
  if (target.zone !== "timeline-day") return null;
  const start = Number(target.element.dataset.startMinute ?? "0") || 0;
  const height = Number(target.element.dataset.hourHeight ?? "34") || 34;
  const offset = point.y - target.rect.top;
  if (offset < 0 || offset > target.rect.height) return null;
  return Math.max(0, Math.min(24 * 60 - 15, start + (offset / height) * 60));
}

/** Minutes under the pointer inside a dropped day column (null when outside one). */
function minutesAtPoint(
  target: DropTarget,
  point: { x: number; y: number },
  boundsStart: number,
  hourHeight: number,
): number | null {
  if (target.zone !== "timeline-day") return null;
  const offset = point.y - target.rect.top;
  if (offset < 0 || offset > target.rect.height) return null;
  return Math.max(0, Math.min(24 * 60 - 15, boundsStart + (offset / hourHeight) * 60));
}

export function Timeline({
  days,
  events,
  startHour,
  endHour,
  fixedWindow = false,
  hourHeight = 34,
  gutterWidth = "3.1rem",
  onOpenEvent,
  onOpenEventDay,
  onClickEmptyDay,
  onCreate,
  onMoveEvent,
  onDropEventToTask,
  onMoveAllDayDate,
  onResizeEvent,
  compact = false,
}: TimelineProps) {
  const today = todayISO();
  const { toneFor } = useEventColors();
  const dnd = useDnd();
  const active = useMemo(() => events.filter((event) => !event.trash), [events]);
  /** B5: the current-time line keeps moving without a reload. */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const bounds = useMemo(() => {
    let start = startHour * 60;
    let end = endHour * 60;
    if (!fixedWindow) {
      /* A19: 설정한 시작·끝 시각 밖에 있더라도 오늘 화면이라면 지금 시각까지는 그립니다.
         (예: 19시까지 설정했는데 19시 30분이면 현재 시각 빨간 선이 사라져 버렸습니다.) */
      if (days.includes(today)) {
        const clock = new Date(nowTick);
        const minutes = clock.getHours() * 60 + clock.getMinutes();
        start = Math.min(start, Math.floor(minutes / 60) * 60);
        end = Math.max(end, Math.ceil((minutes + 1) / 60) * 60);
      }
      for (const event of active) {
        if (event.allDay || event.kind !== "일정") continue;
        for (const day of days) {
          if (!eventCoversDay(event, day)) continue;
          start = Math.min(start, Math.floor(eventStartMinutes(event) / 60) * 60);
          end = Math.max(end, Math.ceil(eventEndMinutes(event) / 60) * 60);
        }
      }
    }
    return { start: Math.max(0, start), end: Math.min(24 * 60, Math.max(end, start + 60)) };
  }, [active, days, endHour, fixedWindow, nowTick, startHour, today]);

  const totalHeight = ((bounds.end - bounds.start) / 60) * hourHeight;
  const marks = useMemo(() => {
    const list: number[] = [];
    for (let minutes = bounds.start; minutes <= bounds.end; minutes += 60) list.push(minutes);
    return list;
  }, [bounds]);

  const now = new Date(nowTick);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = days.includes(today) && nowMinutes >= bounds.start && nowMinutes <= bounds.end;

  const dropTime = (event: { clientY: number; currentTarget: HTMLDivElement }, boundsStart: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const minutes = boundsStart + (offsetY / hourHeight) * 60;
    return Math.max(0, Math.min(23 * 60 + 30, Math.round(minutes / 30) * 30));
  };

  const nowTop = ((nowMinutes - bounds.start) / 60) * hourHeight;

  /** B5: pointer drag (mouse and touch) on an empty column paints a new time range. */
  const [drag, setDrag] = useState<{ day: string; anchor: number; current: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const moved = useRef(false);
  /**
   * A new event opens only on a real tap. The pointer has to stay almost still (under 6px)
   * and lift quickly: a touch that lands while scrolling, a sweep across the grid, or a
   * hold never opens the editor.
   */
  const tap = useRef<{ x: number; y: number; at: number; day: string } | null>(null);
  const TAP_SLOP = 6;
  const TAP_MS = 600;
  /** B5: pointer drag on an event's top/bottom edge resizes it. */
  const [resize, setResize] = useState<{ id: string; edge: "top" | "bottom"; start: number; end: number; dayIndex: number } | null>(null);
  const resizeRef = useRef(resize);
  resizeRef.current = resize;
  const columns = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!drag && !resize) return;
    const minutesAt = (node: HTMLElement, clientY: number) => {
      const rect = node.getBoundingClientRect();
      return bounds.start + ((clientY - rect.top) / hourHeight) * 60;
    };
    let column: HTMLElement | null = null;
    const onMove = (event: PointerEvent) => {
      if (dragRef.current && column) {
        const minutes = Math.max(0, Math.min(24 * 60, minutesAt(column, event.clientY)));
        const origin = tap.current;
        if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TAP_SLOP) {
          moved.current = true;
        }
        setDrag((current) => (current ? { ...current, current: snap(minutes) } : current));
      }
      if (resizeRef.current) {
        const node = columns.current[resizeRef.current.dayIndex];
        if (!node) return;
        const minutes = Math.max(0, Math.min(24 * 60, snap(minutesAt(node, event.clientY))));
        moved.current = true;
        setResize((current) => {
          if (!current) return current;
          if (current.edge === "top") {
            return { ...current, start: Math.min(minutes, current.end - 15) };
          }
          return { ...current, end: Math.max(minutes, current.start + 15) };
        });
      }
    };
    /**
     * A pointer the browser takes away (a finger that started a page scroll, a lost touch)
     * is not a gesture on the grid: nothing is created and nothing is resized.
     */
    const onCancel = () => {
      setDrag(null);
      setResize(null);
      tap.current = null;
      moved.current = false;
      column = null;
    };
    const onUp = () => {
      const state = dragRef.current;
      if (state && onCreate) {
        const from = Math.min(state.anchor, state.current);
        const to = Math.max(state.anchor, state.current);
        if (moved.current && to - from >= 15) {
          onCreate(state.day, toTime(from), toTime(to));
        }
      }
      const sized = resizeRef.current;
      if (sized && onResizeEvent && moved.current) {
        onResizeEvent(sized.id, toTime(sized.start), toTime(sized.end));
      }
      setDrag(null);
      setResize(null);
      column = null;
      setTimeout(() => {
        moved.current = false;
      }, 0);
    };
    const columnOf = (event: PointerEvent) => {
      const node = (event.target as HTMLElement | null)?.closest?.("[data-timeline-column]");
      return node instanceof HTMLElement ? node : null;
    };
    const onMoveWithColumn = (event: PointerEvent) => {
      column = column ?? columnOf(event);
      onMove(event);
    };
    window.addEventListener("pointermove", onMoveWithColumn);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMoveWithColumn);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [bounds.start, days, hourHeight, onCreate, onResizeEvent, drag, resize]);

  const beginDrag = (day: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !onCreate || !event.isPrimary) return;
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = snap(bounds.start + ((event.clientY - rect.top) / hourHeight) * 60);
    moved.current = false;
    tap.current = { x: event.clientX, y: event.clientY, at: Date.now(), day };
    setDrag({ day, anchor: minutes, current: minutes });
  };

  return (
    <div className="relative">
      {/* A19: 현재 시각 빨간 띠 — 오늘 열 위로 또렷하게 지나가도록 칸보다 위(z-30)에 그립니다. */}
      {showNow ? (
        <div
          data-now-line="true"
          title={`지금 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`}
          className="pointer-events-none absolute right-0 z-30 h-[2px] bg-[#a8695f]"
          style={{ top: nowTop - 1, left: gutterWidth }}
        >
          <span className="absolute -left-[4px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#a8695f] shadow-[0_0_0_1.5px_white]" />
        </div>
      ) : null}
      <div className="grid" style={{ gridTemplateColumns: `${gutterWidth} repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="sticky left-0 z-20 bg-white" style={{ height: totalHeight }}>
          {marks.map((minutes) => (
            <div
              key={minutes}
              className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[calc(13px*var(--fs))] tabular-nums text-ink-400 md:right-2 md:text-[calc(13.5px*var(--fs))]"
              style={{ top: Math.max(9, ((minutes - bounds.start) / 60) * hourHeight) }}
            >
              {hourLabel(minutes)}
            </div>
          ))}
          {showNow ? (
            <span
              className="absolute left-0 z-20 flex -translate-y-1/2 items-center rounded-full border border-red-300 bg-white px-1.5 py-0.5 text-[calc(12.5px*var(--fs))] font-medium text-red-500"
              style={{ top: Math.max(6, ((nowMinutes - bounds.start) / 60) * hourHeight) }}
            >
              <span className="mr-0.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-red-500" />
              지금
            </span>
          ) : null}
        </div>

        {days.map((day, dayIndex) => {
          const timed = timedEventsForDay(active, day);
          const laidOut = layoutDayEvents(timed);
          const isToday = day === today;
          return (
            <div
              key={day}
              data-timeline-column={dayIndex}
              data-drop-zone="timeline-day"
              data-drop-day={day}
              data-day={day}
              data-start-minute={bounds.start}
              data-hour-height={hourHeight}
              ref={(node) => {
                columns.current[dayIndex] = node;
              }}
              onPointerDown={(event) => beginDrag(day, event)}
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const origin = tap.current;
                tap.current = null;
                if (moved.current) return;
                if (!origin || origin.day !== day) return;
                if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= TAP_SLOP) return;
                if (Date.now() - origin.at > TAP_MS) return;
                const clickedTime = toTime(dropTime(event as unknown as { clientY: number; currentTarget: HTMLDivElement }, bounds.start));
                if (onClickEmptyDay) {
                  onClickEmptyDay(day, clickedTime);
                  return;
                }
                onCreate?.(day, clickedTime);
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
                onMoveEvent(id, day, toTime(dropTime(event as unknown as { clientY: number; currentTarget: HTMLDivElement }, bounds.start)));
              }}
              className={cn("relative touch-pan-y border-l border-paper-300", isToday && "bg-[#f4f6fa]")}
              style={{
                height: totalHeight,
                backgroundImage:
                  "repeating-linear-gradient(to bottom, #eef0f3 0, #eef0f3 1px, transparent 1px, transparent " + `${hourHeight}px)`,
              }}
            >
              {drag && drag.day === day && moved.current ? (
                <div
                  className="pointer-events-none absolute inset-x-1 z-10 rounded-md border border-accent-400 bg-accent-100/70 px-1 text-[calc(12.5px*var(--fs))] font-medium text-accent-600"
                  style={{
                    top: ((Math.min(drag.anchor, drag.current) - bounds.start) / 60) * hourHeight,
                    height: Math.max(14, (Math.abs(drag.current - drag.anchor) / 60) * hourHeight),
                  }}
                >
                  {toTime(Math.min(drag.anchor, drag.current))}–{toTime(Math.max(drag.anchor, drag.current))}
                </div>
              ) : null}

              {laidOut.map(({ event, start, end, lane, lanes }) => {
                // A window that does not draw this hour must not leave a stray card below it.
                if (end <= bounds.start || start >= bounds.end) return null;
                const live = resize && resize.id === event.id ? resize : null;
                const shownStart = live ? live.start : start;
                const shownEnd = live ? live.end : end;
                const top = ((Math.max(shownStart, bounds.start) - bounds.start) / 60) * hourHeight;
                const height = Math.max(18, ((Math.min(shownEnd, bounds.end) - Math.max(shownStart, bounds.start)) / 60) * hourHeight - 2);
                const tone = toneFor(event);
                const width = `calc(${100 / lanes}% - 4px)`;
                const left = `calc(${(lane * 100) / lanes}% + 2px)`;
                const timeLabel = event.startTime ? `${toTime(shownStart)}${event.endTime || live ? `–${toTime(shownEnd)}` : ""}` : "";
                const compactCard = height < 34;
                return (
                  <button
                    key={`${event.id}-${day}`}
                    type="button"
                    data-timeline-event={event.id}
                    /* A18: HTML5 draggable을 끕니다 — 마우스에서 브라우저 기본 드래그가
                       포인터 드래그를 가로채, 시간표 일정을 다른 칸으로 못 옮겼습니다. */
                    onPointerDown={(pointerEvent) => {
                      // Edge handles resize; the middle of the card drags it to another day/time.
                      const box = pointerEvent.currentTarget.getBoundingClientRect();
                      const offset = pointerEvent.clientY - box.top;
                      const edge = onResizeEvent && offset < 7 ? "top" : onResizeEvent && offset > box.height - 7 ? "bottom" : null;
                      if (edge) {
                        pointerEvent.stopPropagation();
                        pointerEvent.preventDefault();
                        moved.current = false;
                        setResize({ id: event.id, edge, start, end, dayIndex });
                        return;
                      }
                      if (!onMoveEvent) return;
                      /* A23: 잡은 곳을 그대로 들고 갑니다 — 같은 높이에서 다른 요일로
                         놓으면 시각이 한 칸도 움직이지 않고 날짜만 바뀝니다. */
                      const grabMinutes = (Math.max(0, offset) / hourHeight) * 60;
                      const startAt = (target: DropTarget, point: { x: number; y: number }) => {
                        const minutes = minutesAtPoint(target, point, bounds.start, hourHeight);
                        if (minutes === null) return null;
                        return toTime(snap(Math.max(0, minutes - grabMinutes)));
                      };
                      dnd.start(
                        pointerEvent,
                        { kind: "event", id: event.id, label: event.title },
                        (target, point) => {
                          if (!target) return;
                          /* A39: 프로젝트 칸에 놓으면 그 프로젝트의 할 일로 바꿉니다. */
                          if (target.zone === "week-task-day" || target.zone === "week-project-row") {
                            onDropEventToTask?.(event.id, target.data.project ?? "inbox", target.data.day ?? null);
                            return;
                          }
                          const nextDay = target.data.day;
                          if (!nextDay) return;
                          // A18: 같은 날 종일 줄에 다시 놓으면 그 날의 종일 일정으로 돌아갑니다.
                          if (target.zone === "allday-day" || target.zone === "allday-bar") {
                            if (onMoveAllDayDate && nextDay === event.date) onMoveAllDayDate(event.id, nextDay);
                            // 다른 날로 옮길 때는 날짜만 바뀝니다 — 정해 둔 시각은 그대로.
                            else onMoveEvent?.(event.id, nextDay, null);
                            return;
                          }
                          onMoveEvent?.(event.id, nextDay, startAt(target, point));
                        },
                        {
                          skipZones: ["allday-bar"],
                          getHint: (target, point) => {
                            if (target.zone === "week-task-day" || target.zone === "week-project-row") {
                              const day = target.data.day ? `${target.data.day.slice(5).replace("-", "/")} ` : "";
                              return `${day}할 일로 옮기기`;
                            }
                            const nextDay = target.data.day;
                            if (!nextDay) return null;
                            const stamp = nextDay.slice(5).replace("-", "/");
                            const keeps = nextDay !== event.date && event.startTime ? ` (${formatClock(event.startTime)} 유지)` : "";
                            if (target.zone === "allday-day" || target.zone === "allday-bar") {
                              if (nextDay === event.date) return onMoveAllDayDate ? `${stamp} 종일로 돌리기` : null;
                              return `${stamp}로 옮기기${keeps}`;
                            }
                            const time = startAt(target, point) ?? event.startTime;
                            return `${stamp}${time ? ` ${time}` : ""}`;
                          },
                        },
                      );
                    }}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      if (moved.current) return;
                      if (onOpenEventDay) {
                        onOpenEventDay(event.id, day);
                        return;
                      }
                      onOpenEvent(event.id);
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded-md border text-left transition hover:brightness-[0.99]",
                      compactCard ? "px-1 py-[1px]" : "px-1.5 py-[3px]",
                      tone.bg,
                      tone.border,
                      event.canceled && "opacity-50",
                      /* A34: 완료한 일정은 할 일처럼 제목에 줄을 긋고 살짝 흐리게. */
                      event.done && "opacity-60",
                    )}
                    style={{ top, height, width, left }}
                    title={onResizeEvent ? "가운데를 누르면 그 날 정리, 위/아래 가장자리를 끌면 시간이 늘어납니다" : undefined}
                  >
                    {timeLabel ? (
                      <span
                        className={cn(
                          "flex items-center gap-1 tabular-nums opacity-85",
                          compactCard ? "text-[calc(12px*var(--fs))] leading-[1.1]" : "text-[calc(12.5px*var(--fs))] leading-[1.15]",
                          tone.text,
                        )}
                      >
                        <span className={cn("flex-none", compactCard && "font-semibold")}>{timeLabel}</span>
                        {compactCard ? (
                          <span className={cn("line-clamp-2 min-w-0 break-words text-[calc(12px*var(--fs))] font-medium leading-[1.1]", (event.canceled || event.done) && "line-through")}>
                            {event.title}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {compactCard && !timeLabel ? (
                      <span className={cn("block truncate text-[calc(12px*var(--fs))] font-medium leading-[1.1]", tone.text, (event.canceled || event.done) && "line-through")}>
                        {event.title}
                      </span>
                    ) : null}
                    {compactCard ? null : (
                      <span
                        className={cn(
                          "mt-0.5 line-clamp-2 block whitespace-normal break-words text-[calc(13px*var(--fs))] font-medium leading-[1.2] md:text-[calc(13.5px*var(--fs))]",
                          tone.text,
                          (event.canceled || event.done) && "line-through",
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
                  className="absolute inset-x-0 bottom-0 hidden items-center justify-center py-0.5 text-[calc(13px*var(--fs))] text-ink-300 hover:text-ink-500 lg:flex"
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
