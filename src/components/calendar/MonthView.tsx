"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calendarEventMode, type CalendarEvent, type ModeFilter, type ProjectTask, type Routine } from "@/lib/types";
import { addDaysISO, daysInMonth, diffDays, formatClock, formatShort, isSameISO, monthMatrix, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn, matchesMode } from "@/lib/utils";
import { routineTone, taskTone } from "@/components/common/tone";
import { useEventColors } from "@/state/event-colors";
import { useCategoryColors } from "@/state/category-colors";
import { useProjectColors } from "@/state/project-colors";
import { CheckIcon } from "@/components/icons";
import { routineCountForDay } from "@/components/calendar/calendar-utils";
import { DayListPanel, type DayListItem } from "@/components/calendar/DayListPanel";
import { spanSegments, isSpanned } from "@/components/calendar/span-bars";
import { useDnd } from "@/components/common/dnd";
import {
  applyGroupOrder,
  buildDayItems,
  dayItemGroup,
  dayItemKey,
  dayItemTitle,
  groupOf,
  moveWithinGroup,
  shiftWithinGroup,
  useDayOrder,
  type DayOrderItem,
} from "@/lib/day-order";
import { pushToast } from "@/lib/toast-bus";

interface MonthViewProps {
  cursor: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  routines: Routine[];
  mode: ModeFilter;
  /** A39: NOW 모드가 켜져 있을 때는 NOW 숨김 항목까지 가립니다. */
  nowOnly?: boolean;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  /** A3: titles shown per day before the rest folds into `할 일 N` / `+N 더`. */
  dayItems: 3 | 4 | 5;
  /** A44: 고정 줄의 `할 일` 토글 — 끄면 칸에는 일정만, 할 일은 `할 일 N개`로만 보입니다. */
  showTasks?: boolean;
  /** Bumped by the calendar tab when an opened detail's X closes every layer. */
  closeDayListSignal?: number;
  onSelectDay: (day: string) => void;
  /** A21: 한 주 줄(빈 공간)을 누르면 그 주의 주간 보기로 — `day`는 그 주 아무 날이나 됩니다. */
  onSelectWeek?: (day: string) => void;
  /** A40: 좌우 스와이프(터치·트랙패드·마우스 끌기)로 이전/다음 달 — 1은 다음 달. */
  onMonthShift?: (direction: number) => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  /** A10: a tap on the month checkbox completes the task, a second tap clears it. */
  onToggleTask?: (task: ProjectTask) => void;
  onUpdateEvent: (id: string, patch: Record<string, unknown>) => void;
  /** A49: 시간 없는 할 일도 `정렬`을 다시 매겨 순서를 바꿉니다. */
  onUpdateTask?: (id: string, patch: Record<string, unknown>) => void;
  onCreate: (date: string) => void;
  /** A32: 그 날짜로 새 할 일을 더합니다. */
  onCreateTask: (date: string) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  /** B5: dragging a chip onto another date moves the 일정/할 일 there. */
  onMoveItem?: (type: "event" | "task", id: string, date: string, fromDay?: string) => void;
  /** A41: 연결 막대를 끌어 옮기기 — 날짜만 바뀌고 기간·시간은 그대로입니다. */
  onMoveSpan?: (id: string, date: string) => void;
  /** A41: 연결 막대 양끝을 끌어 기간 늘리기/줄이기. */
  onResizeSpan?: (id: string, side: "start" | "end", day: string) => void;
  /** A41: 하루 목록의 `이 주간으로 이동` — 그 날이 속한 주의 주간 보기로 갑니다. */
  onGoWeek?: (day: string) => void;
}

type CellItem = DayListItem;

/** A41: 연결 막대 한 줄의 높이와 줄 사이 간격 */
const BAR_HEIGHT = 18;
const BAR_GAP = 2;

export function MonthView({
  cursor,
  events,
  tasks,
  routines,
  mode,
  nowOnly = false,
  weekStartsOn,
  showWeekends,
  dayItems,
  showTasks = true,
  closeDayListSignal = 0,
  onSelectDay,
  onSelectWeek,
  onMonthShift,
  onOpenEvent,
  onOpenTask,
  onToggleTask,
  onUpdateEvent,
  onUpdateTask,
  onRoutineCount,
  onMoveItem,
  onMoveSpan,
  onResizeSpan,
  onGoWeek,
  onCreate,
  onCreateTask,
}: MonthViewProps) {
  const today = todayISO();
  const { toneFor } = useEventColors();
  /** A19: 분류에 직접 고른 색이 있으면 할 일 점·배지에 그 색을 씁니다. */
  const categoryColor = useCategoryColors();
  /** A19: 할 일 밑줄은 그 할 일이 속한 프로젝트의 색을 그대로 씁니다. */
  const { pastelOf } = useProjectColors();
  const dnd = useDnd();
  /** A41: 폰(좁은 화면)에서는 날짜 숫자를 눌러도 하루 목록이 먼저 열립니다. */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
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

  useEffect(() => {
    if (closeDayListSignal === 0) return;
    setOpenDay(null);
  }, [closeDayListSignal]);

  /* ── A40: 좌우로 넘겨 이전/다음 달 — 손가락·트랙패드·마우스 끌기 모두 같은 자리에서 합니다.
     항목 끌기(HTML5 drag)와 누르기는 그대로 두기 위해, 마우스 끌기는 빈칸·날짜에서만 시작합니다. ── */
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const mouseSwipe = useRef<{ x: number; y: number } | null>(null);
  /** A49: 항목을 끄는 동안에는 달 넘기기(스와이프)를 잠깁니다 — 손을 떼는 순간 달이 넘어가지 않게. */
  const swipeBlockUntil = useRef(0);
  const wheelDelta = useRef(0);
  const wheelLock = useRef(0);
  const suppressClick = useRef(0);
  const [swipeShift, setSwipeShift] = useState(0);

  const shiftMonth = (direction: number) => {
    if (!onMonthShift) return;
    // 스와이프 직후의 클릭은 무시합니다 — 달이 넘어가며 다른 날의 목록이 열리지 않게.
    suppressClick.current = performance.now() + 450;
    setSwipeShift(0);
    onMonthShift(direction);
  };

  const onTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) {
      swipeStart.current = null;
      return;
    }
    const touch = event.touches[0];
    swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (performance.now() < swipeBlockUntil.current) {
      swipeStart.current = null;
      setSwipeShift(0);
      return;
    }
    const start = swipeStart.current;
    swipeStart.current = null;
    setSwipeShift(0);
    if (!start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.3) shiftMonth(dx < 0 ? 1 : -1);
  };

  const onPointerDownGrid = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    // 날짜 숫자·항목·+N·막대는 자기 동작을 합니다(끌기 시작으로 오인하지 않게).
    if (target?.closest("[data-month-item], [data-day-num], [data-month-more], [data-month-span], button, a")) return;
    mouseSwipe.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMoveGrid = (event: React.PointerEvent<HTMLElement>) => {
    const start = mouseSwipe.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) {
      mouseSwipe.current = null;
      setSwipeShift(0);
      return;
    }
    if (Math.abs(dx) > 20) setSwipeShift(Math.max(-28, Math.min(28, dx * 0.25)));
  };

  const endMouseSwipe = (event: React.PointerEvent<HTMLElement>) => {
    const start = mouseSwipe.current;
    mouseSwipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    setSwipeShift(0);
    if (Math.abs(dx) > 60) shiftMonth(dx < 0 ? 1 : -1);
  };

  const onWheelGrid = (event: React.WheelEvent<HTMLElement>) => {
    if (Math.abs(event.deltaX) < 12 || Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.15) return;
    const now = performance.now();
    if (now < wheelLock.current) return;
    wheelDelta.current += event.deltaX;
    if (Math.abs(wheelDelta.current) > 70) {
      const direction = wheelDelta.current > 0 ? 1 : -1;
      wheelDelta.current = 0;
      wheelLock.current = now + 650;
      shiftMonth(direction);
    }
  };

  /**
   * A39: 고른 분류(업무·개인·공부·사용자 분류)가 일정·할 일·루틴 모두에 똑같이 걸립니다.
   * 예전에는 `hidden` 만 보아 어떤 분류를 눌러도 같은 내용이 나왔습니다.
   */
  const activeEvents = events.filter(
    (event) => event.kind === "일정" && matchesMode(mode, event, calendarEventMode(event.category)) && !(nowOnly && event.hidden),
  );
  const activeTasks = tasks.filter(
    (task) => matchesMode(mode, task, task.category) && task.status !== "취소" && !(nowOnly && task.hidden),
  );
  const routineTemplates = useMemo(
    () =>
      routines.filter(
        (routine) => routine.kind === "루틴" && !routine.history && matchesMode(mode, routine, routine.category) && !(nowOnly && routine.hidden),
      ),
    [routines, mode, nowOnly],
  );

  /** A49: 하루 안의 순서 — 같은 층·같은 시각 안에서만 바뀝니다. */
  const dayOrder = useDayOrder();
  /** A49: 이 날의 일정·할 일을 3층으로 — 종일 → 시간 지정(일정+할 일 시각 순) → 시간 없음. */
  const itemsForDay = (day: string): CellItem[] => buildDayItems(activeEvents, activeTasks, day, dayOrder);
  /**
   * 날짜 칸은 종일 일정(위의 색 막대)과 여러 날 일정(연결 막대)을 빼고, 시간 지정·시간 없는
   * 항목만 보여 줍니다. `할 일` 토글이 꺼져 있으면 일정만.
   * A41: 여러 날 일정은 위의 연결 막대로 그립니다.
   * A44: 하루짜리 종일 일정도 같은 색 막대로 그리므로 목록에서는 뺍니다.
   */
  const cellItemsForDay = (day: string): CellItem[] =>
    itemsForDay(day)
      .filter((item) => showTasks || item.type === "event")
      .filter((item) => !(item.type === "event" && (item.event.allDay || isSpanned(item.event))));

  /** A49: 한 묶음(같은 층·같은 시각) 안에서 한 칸 위/아래로 옮깁니다. */
  const reorderItem = (day: string, item: DayOrderItem, direction: -1 | 1) => {
    const group = groupOf(itemsForDay(day), dayItemGroup(item));
    applyGroupOrder(day, group, shiftWithinGroup(group, dayItemKey(item), direction), {
      updateEvent: onUpdateEvent,
      updateTask: (id, patch) => onUpdateTask?.(id, patch),
    });
  };

  /** A49: 같은 날 두 항목 사이로 끌어 놓았을 때 — 같은 묶음일 때만 순서를 바꿉니다. */
  const reorderDrop = (day: string, item: DayOrderItem, targetKey: string, after: boolean): boolean => {
    const group = groupOf(itemsForDay(day), dayItemGroup(item));
    if (!group.some((entry) => dayItemKey(entry) === targetKey)) {
      pushToast("시작 시각이 다르면 시간순이 먼저라 순서를 바꿀 수 없습니다");
      return false;
    }
    return applyGroupOrder(day, group, moveWithinGroup(group, dayItemKey(item), targetKey, after), {
      updateEvent: onUpdateEvent,
      updateTask: (id, patch) => onUpdateTask?.(id, patch),
    });
  };

  /**
   * A49: 날짜 칸의 한 칩을 끕니다 — 같은 날 같은 층·같은 시각의 칩 위에 놓으면 그 자리로 순서가
   * 바뀌고, 다른 날짜 칸·다른 날의 칩에 놓으면 그 날짜로 옮겨집니다(PC·손가락 모두 같은 동작).
   */
  const startItemDrag = (pointerEvent: React.PointerEvent<HTMLElement>, item: DayOrderItem, day: string) => {
    if (!onMoveItem && !onUpdateTask) return;
    const type = item.type === "event" ? "event" : "task";
    const id = item.type === "event" ? item.event.id : item.task.id;
    const group = dayItemGroup(item);
    dnd.start(
      pointerEvent,
      { kind: type, id, label: dayItemTitle(item) },
      (target, point) => {
        if (!target) return;
        const targetKey = target.data.key;
        const targetDay = target.data.day ?? day;
        /* 같은 날 같은 묶음 위 — 그 자리로 순서 바꾸기 */
        if (target.zone === "month-order" && targetKey && targetDay === day) {
          if (target.data.group && target.data.group !== group) {
            pushToast("시작 시각이 다르면 시간순이 먼저라 순서를 바꿀 수 없습니다");
            return;
          }
          reorderDrop(day, item, targetKey, point.y > target.rect.top + target.rect.height / 2);
          return;
        }
        /* 다른 날 — 그 날짜로 옮기기 */
        if (target.data.day && target.data.day !== day) onMoveItem?.(type, id, target.data.day, day);
      },
      {
        onStart: () => {
          swipeBlockUntil.current = performance.now() + 60000;
        },
        onEnd: () => {
          swipeBlockUntil.current = performance.now() + 500;
        },
        getHint: (target, point) => {
          const targetKey = target.data.key;
          const targetDay = target.data.day ?? day;
          if (target.zone === "month-order" && targetKey && targetDay === day) {
            if (target.data.group && target.data.group !== group) return "시간이 달라 순서를 바꿀 수 없음";
            return point.y > target.rect.top + target.rect.height / 2 ? "아래로 순서 바꾸기" : "위로 순서 바꾸기";
          }
          if (target.data.day && target.data.day !== day) return `${formatShort(target.data.day)}로 옮기기`;
          return null;
        },
      },
    );
  };

  /** 한 칩이 차지하는 높이(px) — 설정한 개수만큼은 잘리지 않고 보이도록 행 최소 높이를 잡습니다. */
  const chipRow = 22;
  const cellMinHeight = 28 + dayItems * chipRow + (dayItems - 1) * 2 + 6;

  const openDayDate = openDay;
  const openDayItems = openDayDate ? itemsForDay(openDayDate) : [];

  /** A41: 연결 막대를 끌어 옮깁니다 — 날짜만 바뀌고 기간·시각은 그대로입니다. */
  const startSpanDrag = (pointerEvent: React.PointerEvent<HTMLElement>, segment: ReturnType<typeof spanSegments>[number], cells: string[]) => {
    if (!onMoveSpan) return;
    if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
    const fromDay = cells[segment.startIdx] ?? segment.event.date;
    dnd.start(
      pointerEvent,
      { kind: "event", id: segment.event.id, label: segment.event.title },
      (target) => {
        if (!target?.data.day) return;
        const delta = diffDays(target.data.day, fromDay);
        if (delta === 0) return;
        onMoveSpan(segment.event.id, addDaysISO(segment.event.date, delta));
      },
      {
        getHint: (target) => {
          if (!target.data.day) return null;
          const delta = diffDays(target.data.day, fromDay);
          if (delta === 0) return null;
          return `${formatShort(addDaysISO(segment.event.date, delta))}로 옮기기`;
        },
      },
    );
  };

  /** A41: 막대 양끝을 끌어 기간을 늘리거나 줄입니다. */
  const startSpanResize = (
    pointerEvent: React.PointerEvent<HTMLElement>,
    segment: ReturnType<typeof spanSegments>[number],
    side: "start" | "end",
  ) => {
    if (!onResizeSpan) return;
    pointerEvent.stopPropagation();
    if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
    dnd.start(
      pointerEvent,
      { kind: "event", id: segment.event.id, label: segment.event.title },
      (target) => {
        if (!target?.data.day) return;
        onResizeSpan(segment.event.id, side, target.data.day);
      },
      {
        getHint: (target) => {
          if (!target.data.day) return null;
          return side === "end" ? `${formatShort(target.data.day)}까지 늘리기` : `${formatShort(target.data.day)}부터 시작`;
        },
      },
    );
  };

  const openCell = (day: string) => setOpenDay(day);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="grid flex-none grid-cols-7 border-b border-paper-300">
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

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          swipeStart.current = null;
          setSwipeShift(0);
        }}
        onPointerDown={onPointerDownGrid}
        onPointerMove={onPointerMoveGrid}
        onPointerUp={endMouseSwipe}
        onPointerCancel={() => {
          mouseSwipe.current = null;
          setSwipeShift(0);
        }}
        onPointerLeave={() => {
          mouseSwipe.current = null;
          setSwipeShift(0);
        }}
        onWheel={onWheelGrid}
        onClickCapture={(event) => {
          if (performance.now() < suppressClick.current) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col transition-transform duration-150" style={{ transform: `translateX(${swipeShift}px)` }}>
          {matrix.map((row, rowIndex) => {
            const cells = showWeekends
              ? row
              : row.filter((_, index) => {
                  const dow = new Date(`${row[index]}T12:00:00`).getDay();
                  return dow !== 0 && dow !== 6;
                });
            const weekStartDay = row[0] ?? cells[0] ?? cursor;
            const columnStyle = { gridTemplateColumns: `repeat(${cells.length}, minmax(0,1fr))` } as React.CSSProperties;
            /** A41: 이 줄에서 이어지는 여러 날 일정 — 날짜 칸 위에 긴 막대로 놓입니다.
             *  A44: 하루짜리 종일 일정도 같은 막대(형광펜 바)로 놓습니다. */
            const segments = spanSegments(activeEvents, cells, { includeAllDaySingles: true });
            const lanes = segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
            const barsHeight = lanes > 0 ? lanes * BAR_HEIGHT + (lanes - 1) * BAR_GAP + 2 : 0;
            return (
              <div
                key={rowIndex}
                data-month-row={weekStartDay}
                onClick={(event) => {
                  // A21: 한 주 전체가 '주간 보기'로 가는 줄입니다. 날짜·일정·할 일·더보기는
                  // 각자 할 일을 하도록 그대로 두고, 줄의 빈 공간만 주간 이동으로 씁니다.
                  const target = event.target as HTMLElement;
                  if (!onSelectWeek) return;
                  if (target.closest("[data-month-cell]")) return;
                  if (target.closest("[data-month-head]")) return;
                  if (target.closest("[data-month-item]") || target.closest("[data-day-num]") || target.closest("[data-month-more]")) return;
                  onSelectWeek(weekStartDay);
                }}
                className="group/row relative flex min-h-0 flex-1 flex-col border-b border-paper-300 transition-colors last:border-b-0 hover:bg-[#eef1f6]/70"
                style={{ minHeight: cellMinHeight + barsHeight }}
              >
                {/* 날짜 숫자 줄 — 폰에서는 여기를 눌러도 그 날 목록이 먼저 열립니다. */}
                <div className="grid flex-none" style={columnStyle}>
                  {cells.map((day) => {
                    const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
                    const holiday = holidayName(day);
                    const isToday = isSameISO(day, today);
                    const dow = new Date(`${day}T12:00:00`).getDay();
                    return (
                      <div
                        key={day}
                        data-month-head={day}
                        onClick={() => openCell(day)}
                        className={cn(
                          "flex min-w-0 items-center justify-between gap-1 px-0.5 pt-1 md:px-2",
                          !inMonth && "bg-paper-200/25",
                        )}
                      >
                        <button
                          type="button"
                          data-day-num={day}
                          title={narrow ? `${formatShort(day)} ${weekdayKo(day)}요일 · 그 날 목록` : `${formatShort(day)} ${weekdayKo(day)}요일 · 하루 보기`}
                          aria-label={narrow ? `${formatShort(day)} 그 날 목록` : `${formatShort(day)} 하루 보기`}
                          onClick={(event) => {
                            // A21: 넓은 화면에서는 날짜 숫자가 그 날의 일간 보기로 갑니다.
                            // A41: 폰에서는 어느 것을 눌러도 그 날의 일정·할 일 목록이 먼저 열립니다.
                            event.stopPropagation();
                            if (narrow) openCell(day);
                            else onSelectDay(day);
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
                        {holiday ? (
                          <span className="min-w-0 truncate text-right text-[calc(12px*var(--fs))] text-red-500">{holiday}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* A41: 여러 날 일정 — 이 줄에서는 하루씩 끊지 않고 하나의 긴 막대로. */}
                {lanes > 0 ? (
                  <div data-month-bars={weekStartDay} className="relative flex-none" style={{ height: barsHeight }}>
                    {segments.map((segment) => {
                      const tone = toneFor(segment.event);
                      const left = `calc(${(segment.startIdx * 100) / cells.length}% + 1px)`;
                      const width = `calc(${(segment.span * 100) / cells.length}% - 2px)`;
                      return (
                        <button
                          key={`${segment.event.id}-${segment.startIdx}`}
                          type="button"
                          data-month-span={segment.event.id}
                          data-month-span-start={segment.startIdx}
                          data-month-span-end={segment.startIdx + segment.span - 1}
                          onPointerDown={(pointerEvent) => startSpanDrag(pointerEvent, segment, cells)}
                          onClick={(event) => {
                            event.stopPropagation();
                            const box = event.currentTarget.getBoundingClientRect();
                            const ratio = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
                            const offset = Math.max(0, Math.min(segment.span - 1, Math.floor(ratio * segment.span)));
                            openCell(cells[segment.startIdx + offset] ?? segment.event.date);
                          }}
                          title={`${segment.event.title} · ${formatShort(segment.event.date)}${segment.event.endDate ? `–${formatShort(segment.event.endDate)}` : ""}`}
                          className={cn(
                            "absolute flex items-center gap-1 overflow-hidden border px-1.5 text-left text-[calc(12.5px*var(--fs))] font-medium leading-[16px] transition",
                            segment.cutStart ? "rounded-l-none border-l-0" : "rounded-l-md",
                            segment.cutEnd ? "rounded-r-none border-r-0" : "rounded-r-md",
                            tone.bg,
                            tone.border,
                            tone.text,
                            segment.event.canceled && "line-through opacity-50",
                            segment.event.done && "line-through opacity-60",
                          )}
                          style={{ left, width, top: segment.lane * (BAR_HEIGHT + BAR_GAP), height: BAR_HEIGHT }}
                        >
                          {onResizeSpan ? (
                            <span
                              role="separator"
                              aria-label={`${segment.event.title} 시작일 늘리기`}
                              data-month-span-handle="start"
                              onPointerDown={(pointerEvent) => startSpanResize(pointerEvent, segment, "start")}
                              onClick={(event) => event.stopPropagation()}
                              className="absolute inset-y-0 left-0 w-[9px] cursor-ew-resize rounded-l-md bg-black/[0.06] opacity-60 transition hover:opacity-100"
                            />
                          ) : null}
                          <span className={cn("min-w-0 flex-1 truncate", onResizeSpan && "pl-1.5")}>
                            {segment.event.startTime ? <span className="mr-1 hidden tabular-nums opacity-80 md:inline">{formatClock(segment.event.startTime)}</span> : null}
                            {segment.event.title}
                          </span>
                          {segment.cutEnd ? <span className="flex-none opacity-70">›</span> : null}
                          {onResizeSpan ? (
                            <span
                              role="separator"
                              aria-label={`${segment.event.title} 끝날 늘리기`}
                              data-month-span-handle="end"
                              onPointerDown={(pointerEvent) => startSpanResize(pointerEvent, segment, "end")}
                              onClick={(event) => event.stopPropagation()}
                              className="absolute inset-y-0 right-0 w-[9px] cursor-ew-resize rounded-r-md bg-black/[0.06] opacity-60 transition hover:opacity-100"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* 그 날의 일정 칩·할 일 */}
                <div className="grid min-h-0 flex-1" style={columnStyle}>
                  {cells.map((day) => {
                    const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
                    const items = cellItemsForDay(day);
                    const visibleItems = items.slice(0, dayItems);
                    const rest = items.slice(dayItems);
                    const restTasks = rest.filter((item) => item.type === "task").length;
                    const restEvents = rest.length - restTasks;
                    /* A44: `할 일` 토글이 꺼져 있어도 그 날 할 일이 있는지는 연한 회색으로 보입니다. */
                    const hiddenTaskCount = showTasks ? 0 : activeTasks.filter((task) => task.date === day || task.due === day).length;
                    return (
                      <div
                        key={day}
                        data-month-cell={day}
                        /* A33: 하루 목록 시트에서 끌어온 항목을 이 날짜로 놓을 수 있습니다. */
                        data-drop-zone="month-day"
                        data-drop-day={day}
                        onClick={() => openCell(day)}
                        className={cn(
                          "group relative min-h-0 overflow-hidden border-r border-paper-300 px-0.5 pb-1 last:border-r-0 md:px-2 md:pb-1",
                          !inMonth && "bg-paper-200/25",
                        )}
                      >
                        <div className="space-y-[2px]">
                          {visibleItems.map((item) => {
                            if (item.type === "event") {
                              const tone = toneFor(item.event);
                              return (
                                <button
                                  key={item.event.id}
                                  data-month-item={item.event.id}
                                  type="button"
                                  /* A49: 같은 시간대 안에서 끌어 순서를 바꾸고, 다른 날짜 칸에 놓으면 옮깁니다. */
                                  data-month-order-item={dayItemKey(item)}
                                  data-drop-zone="month-order"
                                  data-drop-key={dayItemKey(item)}
                                  data-drop-group={dayItemGroup(item)}
                                  data-drop-day={day}
                                  onPointerDown={(pointerEvent) => startItemDrag(pointerEvent, item, day)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openCell(day);
                                  }}
                                  className={cn(
                                    "flex w-full items-start gap-1 rounded px-0.5 py-[1px] text-left text-[calc(13px*var(--fs))] leading-[1.3] md:px-1 md:text-[calc(14px*var(--fs))] md:leading-[1.35]",
                                    tone.text,
                                    item.event.canceled && "line-through opacity-50",
                                    /* A34: 완료한 일정도 할 일처럼 제목에 줄을 긋습니다. */
                                    item.event.done && "line-through opacity-60",
                                  )}
                                >
                                  {item.event.startTime ? <span className="hidden flex-none tabular-nums opacity-80 md:inline">{formatClock(item.event.startTime)}</span> : null}
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
                                data-month-order-item={dayItemKey(item)}
                                data-drop-zone="month-order"
                                data-drop-key={dayItemKey(item)}
                                data-drop-group={dayItemGroup(item)}
                                data-drop-day={day}
                                onPointerDown={(pointerEvent) => startItemDrag(pointerEvent, item, day)}
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
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openCell(day);
                                  }}
                                  className={cn(
                                    "min-w-0 flex-1 truncate text-left text-[calc(13px*var(--fs))] leading-[1.35] text-ink-500 md:text-[calc(14px*var(--fs))] md:leading-[1.45]",
                                    taskDone && "text-ink-300 line-through",
                                  )}
                                  data-project-underline={owner ? owner.id : "none"}
                                >
                                  <span className="border-b-2 pb-[0.5px]" style={{ borderColor: underline }}>
                                    {item.task.startTime ? (
                                      <span className="mr-1 hidden tabular-nums opacity-80 md:inline">
                                        {formatClock(item.task.startTime)}
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
                                openCell(day);
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
                                openCell(day);
                              }}
                              className="block w-full px-0.5 text-left text-[calc(13px*var(--fs))] text-ink-400 hover:text-ink-700 md:px-1 md:text-[calc(13.5px*var(--fs))]"
                            >
                              +{restEvents} 더
                            </button>
                          ) : null}
                          {hiddenTaskCount > 0 ? (
                            <button
                              type="button"
                              data-month-task-count={day}
                              onClick={(event) => {
                                event.stopPropagation();
                                openCell(day);
                              }}
                              aria-label={`${formatShort(day)} 할 일 ${hiddenTaskCount}개 — 눌러서 그 날 목록 열기`}
                              className="block w-full truncate whitespace-nowrap px-0.5 text-left text-[calc(11.5px*var(--fs))] leading-tight text-ink-300 hover:text-ink-500 md:px-1 md:text-[calc(13px*var(--fs))]"
                            >
                              할 일 {hiddenTaskCount}개
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {onSelectWeek ? (
                  /* 넓은 화면: 그 주 줄에 마우스를 올릴 때만 나타나는 '이 주 보기'.
                     A41: 폰에서는 오른쪽 '주간 보기' 기둥을 없앴습니다(위의 연간·월간·주간 버튼으로 갑니다). */
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
                ) : null}
              </div>
            );
          })}
        </div>
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
          onGoWeek={
            onGoWeek
              ? () => {
                  setOpenDay(null);
                  onGoWeek(openDayDate);
                }
              : undefined
          }
          onCreateEvent={() => onCreate(openDayDate)}
          onCreateTask={() => onCreateTask(openDayDate)}
          onOpenEvent={onOpenEvent}
          onOpenTask={onOpenTask}
          onToggleTask={onToggleTask}
          onReorder={(item, direction) => reorderItem(openDayDate, item, direction)}
          onMoveItem={(type, id, date) => onMoveItem?.(type, id, date, openDayDate)}
        />
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
