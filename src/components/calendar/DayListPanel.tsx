"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarEvent, ProjectTask } from "@/lib/types";
import { formatClock, formatShort, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { taskTone } from "@/components/common/tone";
import { useEventColors } from "@/state/event-colors";
import { useCategoryColors } from "@/state/category-colors";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from "@/components/icons";
import { useDnd } from "@/components/common/dnd";
import { dayItemGroup, dayItemKey, dayItemLevel, type DayOrderItem } from "@/lib/day-order";

/**
 * A3 · A32: 한 날짜의 정리 목록.
 *
 * 월간 달력과 주간 달력이 같은 화면을 씁니다 — 종일 일정 · 시간 일정 · 할 일을 한눈에
 * 보여 주고, 항목을 누르면 그 기록의 상세로 들어갑니다. 아래에서 새 일정·새 할 일을
 * 그 날짜로 바로 더할 수 있고, `이 날짜로 이동`은 그 날의 일간 보기를 엽니다.
 *
 * A49: 하루 목록은 세 층입니다 — ① 종일 일정 ② 시작 시각이 있는 일정과 할 일을 시각 순으로
 * 섞어서(할 일은 체크박스로 구분) ③ 시간이 없는 할 일. 같은 층·같은 시각끼리는 ↑↓로
 * 순서를 바꾸며, 바뀐 순서는 `my-diary:day-order:v1` 에 남아 새로고침해도 그대로입니다.
 *
 * A33: 목록 안의 일정·할 일을 꾹 눌러(마우스는 조금 끌어) 뒤의 달력 칸으로 끌어다 놓으면
 * 그 날짜로 옮겨집니다. 끄는 동안에는 이 시트와 어두운 배경을 잠시 감춰 뒤의 날짜 칸이
 * 그대로 보이게 하고, 손을 떼면 원래대로 돌아옵니다.
 */
export type DayListItem = DayOrderItem;

export function DayListPanel({
  day,
  items,
  onClose,
  onGoDay,
  onGoWeek,
  onOpenEvent,
  onOpenTask,
  onToggleTask,
  onReorder,
  onCreateEvent,
  onCreateTask,
  onMoveItem,
  startTime,
}: {
  day: string;
  items: DayListItem[];
  onClose: () => void;
  onGoDay: () => void;
  /** A41: `이 주간으로 이동` — 이 날이 속한 주의 주간 보기를 엽니다. */
  onGoWeek?: () => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleTask?: (task: ProjectTask) => void;
  /** A49: 같은 층·같은 시각 안에서 한 칸 위/아래로 — 손가락으로도 확실한 방식입니다. */
  onReorder?: (item: DayOrderItem, direction: -1 | 1) => void;
  /** A33: 목록의 항목을 다른 날짜 칸에 놓았을 때 — 그 날짜(`YYYY-MM-DD`)로 옮깁니다. */
  onMoveItem?: (type: "event" | "task", id: string, date: string) => void;
  /** A16: the day list can start a new record without leaving the view. */
  onCreateEvent?: (time: string | null) => void;
  /** A32: 새 할 일도 그 날짜로 바로 더합니다. */
  onCreateTask?: () => void;
  /** A32: 시간표 빈칸에서 열었으면 그 시각이 새 일정의 시작 시각이 됩니다. */
  startTime?: string | null;
}) {
  const { toneFor } = useEventColors();
  const categoryColor = useCategoryColors();
  const dnd = useDnd();
  const sheet = useRef<HTMLDivElement | null>(null);
  /** A33: 끄는 동안 이 시트를 감춰 뒤의 달력 칸이 보이게 합니다. */
  const [dragging, setDragging] = useState(false);
  const holiday = holidayName(day);

  /**
   * A33: 드래그가 시작되면 시트와 어두운 배경을 즉시 감춥니다. 상태 갱신을 기다리지 않고
   * 인라인 스타일로 먼저 가려야, 첫 번째 pointermove에서 아래 달력 칸을 그대로 집을 수 있습니다.
   */
  const hideSheet = () => {
    setDragging(true);
    const node = sheet.current;
    if (!node) return;
    node.style.opacity = "0";
    node.style.pointerEvents = "none";
  };
  const restoreSheet = () => {
    setDragging(false);
    const node = sheet.current;
    if (!node) return;
    node.style.opacity = "";
    node.style.pointerEvents = "";
  };

  /** 마우스는 7px, 터치는 짧게 눌렀다 끌면 시작 — 기존 드래그(`dnd.tsx`)와 같은 규칙입니다. */
  const startDrag = (event: ReactPointerEvent<HTMLElement>, type: "event" | "task", item: CalendarEvent | ProjectTask) => {
    if (!onMoveItem) return;
    dnd.start(
      event,
      { kind: type, id: item.id, label: item.title || "옮길 항목" },
      (target) => {
        if (!target) return;
        const nextDay = target.data.day;
        if (!nextDay || nextDay === day) return;
        onMoveItem(type, item.id, nextDay);
      },
      {
        onStart: hideSheet,
        onEnd: restoreSheet,
        getHint: (target) => {
          const next = target.data.day;
          if (!next || next === day) return null;
          return `${formatShort(next)}로 옮기기`;
        },
      },
    );
  };

  /** A49: 층별 묶음과 그 안에서의 자리 — 첫/마지막 항목은 그쪽 화살표를 끕니다. */
  const groups = useMemo(() => {
    const map = new Map<string, DayOrderItem[]>();
    for (const item of items) {
      const key = dayItemGroup(item);
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items]);

  const placeOf = (item: DayOrderItem) => {
    const list = groups.get(dayItemGroup(item)) ?? [];
    const index = list.findIndex((entry) => dayItemKey(entry) === dayItemKey(item));
    return { canUp: index > 0, canDown: index >= 0 && index < list.length - 1, many: list.length > 1 };
  };

  const allDay = items.filter((item) => item.type === "event" && dayItemLevel(item) === 1) as {
    type: "event";
    event: CalendarEvent;
  }[];
  const timed = items.filter((item) => dayItemLevel(item) === 2);
  const untimed = items.filter((item) => item.type === "task" && dayItemLevel(item) === 3) as {
    type: "task";
    task: ProjectTask;
  }[];

  /** A49: ↑↓ 한 쌍 — 좁은 화면에서도 손가락으로 누를 수 있는 크기(24px)로 둡니다. */
  const OrderButtons = ({ item }: { item: DayOrderItem }) => {
    const { canUp, canDown, many } = placeOf(item);
    if (!onReorder || !many) return null;
    return (
      <span className="flex flex-none items-center gap-0.5" data-day-order-controls={dayItemKey(item)}>
        <button
          type="button"
          data-day-order-up={dayItemKey(item)}
          onClick={(event) => {
            event.stopPropagation();
            onReorder(item, -1);
          }}
          disabled={!canUp}
          aria-label={`${item.type === "event" ? item.event.title : item.task.title} 위로`}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-500 transition hover:bg-paper-200 hover:text-ink-900 disabled:opacity-20"
        >
          <ChevronLeftIcon size={12} className="rotate-90" />
        </button>
        <button
          type="button"
          data-day-order-down={dayItemKey(item)}
          onClick={(event) => {
            event.stopPropagation();
            onReorder(item, 1);
          }}
          disabled={!canDown}
          aria-label={`${item.type === "event" ? item.event.title : item.task.title} 아래로`}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-500 transition hover:bg-paper-200 hover:text-ink-900 disabled:opacity-20"
        >
          <ChevronRightIcon size={12} className="rotate-90" />
        </button>
      </span>
    );
  };

  return (
    <div
      ref={sheet}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:justify-end"
      data-day-list={day}
      data-sheet-dragging={dragging ? "true" : undefined}
    >
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-ink-900/10" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${formatShort(day)} 하루 목록`}
        className="relative z-10 flex max-h-[72dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-paper-300 bg-white pb-[env(safe-area-inset-bottom)] shadow-lift animate-slide-up sm:mt-20 sm:mr-6 sm:max-h-[calc(100dvh-8rem)] sm:w-[22rem] sm:animate-pop-in sm:rounded-2xl sm:pb-0"
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

        <div data-sheet-scroll="true" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <p className="rounded-xl bg-paper-200/50 px-3 py-6 text-center text-[calc(14.5px*var(--fs))] text-ink-400">
              이 날짜에는 일정도 할 일도 없습니다.
            </p>
          ) : null}

          {/* 1층 — 종일 일정 */}
          {allDay.length > 0 ? (
            <section className="mb-3" data-day-layer="allday">
              <p className="mb-1 flex items-baseline justify-between text-[calc(13.5px*var(--fs))] text-ink-400">
                <span>종일 일정 {allDay.length}</span>
                {allDay.length > 1 ? <span className="text-[calc(13px*var(--fs))] text-ink-300">↑↓ 로 순서 바꾸기</span> : null}
              </p>
              <ul className="space-y-1">
                {allDay.map(({ event }) => {
                  const tone = toneFor(event);
                  return (
                    <li
                      key={event.id}
                      data-day-order-item={dayItemKey({ type: "event", event })}
                      className={cn("flex items-center gap-1 rounded-lg border px-2 py-1.5", tone.bg, tone.border)}
                    >
                      <button
                        type="button"
                        data-day-list-event={event.id}
                        onPointerDown={(pointerEvent) => startDrag(pointerEvent, "event", event)}
                        onClick={() => onOpenEvent(event.id)}
                        title={onMoveItem ? "끌어서 다른 날짜로 옮기기" : undefined}
                        className={cn(
                          "min-w-0 flex-1 select-none truncate text-left text-[calc(15px*var(--fs))]",
                          tone.text,
                          event.canceled && "line-through opacity-50",
                          /* A34: 완료한 일정도 할 일처럼 제목에 줄을 긋습니다. */
                          event.done && "line-through opacity-60",
                        )}
                      >
                        {event.title}
                      </button>
                      <OrderButtons item={{ type: "event", event }} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* 2층 — 시간이 있는 일정 + 할 일을 시각 순으로 섞어서 */}
          {timed.length > 0 ? (
            <section className="mb-3" data-day-layer="timed">
              <p className="mb-1 flex items-baseline justify-between text-[calc(13.5px*var(--fs))] text-ink-400">
                <span>시간 지정 {timed.length}</span>
                {timed.length > 1 ? <span className="text-[calc(13px*var(--fs))] text-ink-300">↑↓ 로 순서 바꾸기</span> : null}
              </p>
              <ul className="space-y-1">
                {timed.map((item) => {
                  if (item.type === "event") {
                    const event = item.event;
                    const tone = toneFor(event);
                    return (
                      <li key={`e-${event.id}`} data-day-order-item={dayItemKey(item)} className="flex items-start gap-2">
                        <span className={cn("w-[5.3rem] flex-none whitespace-nowrap pt-[1px] text-[calc(14px*var(--fs))] tabular-nums", tone.text)}>
                          {formatClock(event.startTime)}
                          {event.endTime ? `–${event.endTime}` : ""}
                        </span>
                        <button
                          type="button"
                          data-day-list-event={event.id}
                          onPointerDown={(pointerEvent) => startDrag(pointerEvent, "event", event)}
                          onClick={() => onOpenEvent(event.id)}
                          title={onMoveItem ? "끌어서 다른 날짜로 옮기기" : undefined}
                          className={cn(
                            "min-w-0 flex-1 select-none text-left text-[calc(15px*var(--fs))] leading-snug text-ink-700",
                            event.canceled && "line-through opacity-50",
                            event.done && "line-through opacity-60",
                          )}
                        >
                          {event.title}
                        </button>
                        <OrderButtons item={item} />
                      </li>
                    );
                  }
                  const task = item.task;
                  const tone = categoryColor.toneOf(task.category, taskTone(task.category));
                  const waiting = task.status === "대기 중";
                  return (
                    <li key={`t-${task.id}`} data-day-order-item={dayItemKey(item)} className="flex items-start gap-2">
                      <span className="w-[5.3rem] flex-none whitespace-nowrap pt-[2px] text-[calc(14px*var(--fs))] tabular-nums text-ink-400">
                        {formatClock(task.startTime)}
                        {task.endTime && task.endTime > (task.startTime ?? "") ? `–${task.endTime}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleTask?.(task)}
                        aria-label={task.status === "완료" ? `${task.title} 완료 해제` : `${task.title} 완료`}
                        aria-pressed={task.status === "완료"}
                        className={cn(
                          "mt-[5px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-[4px] border transition",
                          task.status === "완료" ? cn(tone.solid, "border-transparent text-white") : "border-ink-300 hover:border-ink-500",
                        )}
                      >
                        {task.status === "완료" ? <CheckIcon size={9} /> : null}
                      </button>
                      <button
                        type="button"
                        data-day-list-task={task.id}
                        onPointerDown={(pointerEvent) => startDrag(pointerEvent, "task", task)}
                        onClick={() => onOpenTask(task.id)}
                        title={onMoveItem ? "끌어서 다른 날짜로 옮기기" : undefined}
                        className={cn(
                          "min-w-0 flex-1 select-none text-left text-[calc(15px*var(--fs))] leading-snug text-ink-700",
                          task.status === "완료" && "text-ink-300 line-through",
                        )}
                      >
                        {task.title}
                      </button>
                      {waiting ? <span className="mt-[3px] flex-none rounded bg-paper-200 px-1 text-[calc(12.5px*var(--fs))] text-ink-500">대기</span> : null}
                      <OrderButtons item={item} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* 3층 — 시간이 없는 할 일 */}
          {untimed.length > 0 ? (
            <section className="mb-3" data-day-layer="untimed">
              <p className="mb-1 flex items-baseline justify-between text-[calc(13.5px*var(--fs))] text-ink-400">
                <span>할 일 {untimed.length}</span>
                {untimed.length > 1 ? <span className="text-[calc(13px*var(--fs))] text-ink-300">↑↓ 로 순서 바꾸기</span> : null}
              </p>
              <ul className="space-y-0.5">
                {untimed.map(({ task }) => {
                  const tone = categoryColor.toneOf(task.category, taskTone(task.category));
                  const waiting = task.status === "대기 중";
                  return (
                    <li key={task.id} data-day-order-item={dayItemKey({ type: "task", task })} className="flex items-start gap-2">
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
                        data-day-list-task={task.id}
                        onPointerDown={(pointerEvent) => startDrag(pointerEvent, "task", task)}
                        onClick={() => onOpenTask(task.id)}
                        title={onMoveItem ? "끌어서 다른 날짜로 옮기기" : undefined}
                        className={cn(
                          "min-w-0 flex-1 select-none text-left text-[calc(15px*var(--fs))] leading-snug text-ink-700",
                          task.status === "완료" && "text-ink-300 line-through",
                        )}
                      >
                        {task.title}
                      </button>
                      {waiting ? <span className="mt-[1px] flex-none rounded bg-paper-200 px-1 text-[calc(12.5px*var(--fs))] text-ink-500">대기</span> : null}
                      <OrderButtons item={{ type: "task", task }} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-1.5 border-t border-paper-300/80 bg-paper-50/60 px-3 py-2.5 sm:px-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-xs flex-none whitespace-nowrap px-2">
            닫기
          </button>
          {/* A42: 버튼 이름을 `일간 보기`·`주간 보기`로 줄이고, 좁은 화면에서도 두 줄로
              줄바꿈되지 않게 한 줄에 붙여 둡니다(넘치면 이 줄 안에서만 가로로 스크롤). */}
          <div className="flex min-w-0 flex-nowrap items-center justify-end gap-1 overflow-x-auto">
            {onCreateEvent ? (
              <button
                type="button"
                data-day-list-add-event="true"
                onClick={() => onCreateEvent(startTime ?? null)}
                className="btn-outline btn-xs flex-none whitespace-nowrap px-1.5"
              >
                + 일정{startTime ? ` ${formatClock(startTime)}` : ""}
              </button>
            ) : null}
            {onCreateTask ? (
              <button type="button" data-day-list-add-task="true" onClick={onCreateTask} className="btn-outline btn-xs flex-none whitespace-nowrap px-1.5">
                + 할 일
              </button>
            ) : null}
            <button type="button" onClick={onGoDay} className="btn-primary btn-xs flex-none whitespace-nowrap px-2">
              일간 보기
            </button>
            {onGoWeek ? (
              <button type="button" data-day-list-go-week="true" onClick={onGoWeek} className="btn-outline btn-xs flex-none whitespace-nowrap px-2">
                주간 보기
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
