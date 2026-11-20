"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/state/store";
import { useSettings, type CalendarViewKey } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import {
  addDaysISO,
  addMonthsISO,
  formatFullKo,
  formatShort,
  startOfWeekISO,
  todayISO,
  weekDays,
  weekKeyOf,
  weekdayKo,
} from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn, matchesMode } from "@/lib/utils";
import type { CalendarEvent, CalendarKind, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, StarIcon } from "@/components/icons";
import { TimeGrid } from "@/components/calendar/TimeGrid";
import { MonthView } from "@/components/calendar/MonthView";
import { YearView } from "@/components/calendar/YearView";
import { DayView } from "@/components/calendar/DayView";
import { HabitView } from "@/components/calendar/HabitView";
import { WeekPanels } from "@/components/calendar/WeekPanels";
import { WeekTable } from "@/components/calendar/WeekTable";
import { EventEditor, type EventDraft } from "@/components/editors/EventEditor";
import { TaskEditor } from "@/components/editors/TaskEditor";
import { RoutineEditor } from "@/components/editors/RoutineEditor";

const VIEWS: { value: CalendarViewKey; label: string }[] = [
  { value: "year", label: "연" },
  { value: "month", label: "월" },
  { value: "week", label: "주" },
  { value: "three", label: "3일" },
  { value: "day", label: "일" },
  { value: "habit", label: "루틴" },
];

const MODES: { value: ModeFilter; label: string }[] = [
  { value: "now", label: "NOW" },
  { value: "all", label: "전체" },
  { value: "업무", label: "업무" },
  { value: "개인", label: "개인" },
  { value: "공부", label: "공부" },
];

function eventMode(event: CalendarEvent): "업무" | "개인" | "공부" {
  if (event.category === "외부일정" || event.category === "성과") return "업무";
  return "개인";
}

export function CalendarTab() {
  const { data, update, setRoutineCount, findItem } = useData();
  const { settings } = useSettings();
  const { focus, clearFocus, openBinderForDate } = useUi();

  const today = todayISO();
  const [view, setView] = useState<CalendarViewKey>(settings.calendarDefaultView);
  const [cursor, setCursor] = useState(today);
  const [mode, setMode] = useState<ModeFilter>("now");
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [eventEditor, setEventEditor] = useState<{ open: boolean; id?: string | null; draft?: EventDraft }>({ open: false });
  const [taskId, setTaskId] = useState<string | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(null);

  useEffect(() => {
    setView(settings.calendarDefaultView);
  }, [settings.calendarDefaultView]);

  useTabReset("calendar", () => {
    setView(settings.calendarDefaultView);
    setCursor(todayISO());
    setMode("now");
    setEventEditor({ open: false });
    setTaskId(null);
    setRoutineId(null);
  });

  useEffect(() => {
    if (!focus || focus.resource !== "calendar") return;
    const item = data.calendar.find((event) => event.id === focus.id);
    if (item) {
      setCursor(item.date || todayISO());
      setEventEditor({ open: true, id: item.id });
    }
    clearFocus();
  }, [focus, data.calendar, clearFocus]);

  const weekStart = startOfWeekISO(cursor, settings.weekStartsOn);
  const weekEnd = addDaysISO(weekStart, 6);
  const threeStart = cursor;
  const hiddenIncluded = mode === "all" || settings.calendarShowHidden;

  const events = useMemo(
    () => data.calendar.filter((event) => matchesMode(mode, event, eventMode(event))),
    [data.calendar, mode],
  );
  const tasks = useMemo(
    () => data.projects.filter((task) => task.kind === "할 일" && matchesMode(mode, task, task.category)),
    [data.projects, mode],
  );
  const routines = useMemo(
    () => data.routines.filter((routine) => !routine.trash && (mode === "all" || !routine.hidden)),
    [data.routines, mode],
  );
  
  const title = useMemo(() => {
    if (view === "year") return `${year}년`;
    if (view === "month" || view === "habit") return `${cursor.slice(0, 4)}년 ${Number(cursor.slice(5, 7))}월`;
    if (view === "week") return `${formatShort(weekStart)} – ${formatShort(weekEnd)}`;
    if (view === "three") return `${formatShort(threeStart)} – ${formatShort(addDaysISO(threeStart, 2))}`;
    return formatFullKo(cursor);
  }, [view, year, cursor, weekStart, weekEnd, threeStart]);

  const step = (direction: number) => {
    if (view === "year") {
      setYear((current) => current + direction);
      return;
    }
    if (view === "month" || view === "habit") {
      setCursor((current) => addMonthsISO(current, direction));
      return;
    }
    if (view === "week") {
      setCursor((current) => addDaysISO(current, direction * 7));
      return;
    }
    if (view === "three") {
      setCursor((current) => addDaysISO(current, direction * 3));
      return;
    }
    setCursor((current) => addDaysISO(current, direction));
  };

  const openEvent = (id: string) => setEventEditor({ open: true, id });
  const openTask = (id: string) => setTaskId(id);
  const createEvent = (date: string, time?: string | null) =>
    setEventEditor({ open: true, draft: { date, startTime: time ?? null } });
  const createWeekly = (kind: CalendarKind) =>
    setEventEditor({ open: true, draft: { date: weekStart, kind } });

  const toggleTask = (task: ProjectTask) => {
    const done = task.status === "완료";
    void update("projects", task.id, {
      status: done ? "미완료" : "완료",
      doneAt: done ? null : todayISO(),
    });
  };

  const toggleEventDone = (event: CalendarEvent) => {
    void update("calendar", event.id, { done: !event.done });
  };

  const moveEvent = (id: string, date: string, time: string | null) => {
    const item = findItem("calendar", id) as CalendarEvent | undefined;
    if (!item) return;
    const duration =
      item.startTime && item.endTime
        ? Math.max(15, minutesOf(item.endTime) - minutesOf(item.startTime))
        : 60;
    const nextStart = time ?? null;
    const nextEnd = nextStart ? minutesToTime(minutesOf(nextStart) + duration) : null;
    void update("calendar", id, {
      date,
      startTime: nextStart,
      endTime: nextEnd,
      endDate: date,
    });
  };

  const currentWeekDays = weekDays(cursor, settings.weekStartsOn);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <button type="button" className="icon-btn h-8 w-8" onClick={() => step(-1)} aria-label="이전">
              <ChevronLeftIcon size={17} />
            </button>
            <button type="button" className="btn-outline btn-xs" onClick={() => setCursor(todayISO())}>
              오늘
            </button>
            <button type="button" className="icon-btn h-8 w-8" onClick={() => step(1)} aria-label="다음">
              <ChevronRightIcon size={17} />
            </button>
            <div className="ml-1 min-w-0">
              <p className="truncate text-[0.95rem] font-medium text-ink-900">{title}</p>
              <p className="text-[0.62rem] text-ink-400">
                {view === "week" ? `${weekKeyOf(weekStart)} · ${weekdayKo(weekStart)}요일 시작` : holidayName(cursor) ?? "나의 기록"}
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-2 overflow-x-auto pb-0.5 md:w-auto">
            <div className="no-scrollbar flex flex-none items-center gap-0.5 rounded-full border border-paper-300 bg-white/60 p-0.5">
              {VIEWS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setView(item.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.74rem] font-medium transition",
                    view === item.value ? "bg-ink-900 text-paper-50" : "text-ink-600 hover:text-ink-900",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => createEvent(cursor, view === "day" ? "09:00" : null)}
              className="btn-primary btn-xs ml-auto flex-none"
            >
              <PlusIcon size={13} /> 새 일정
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={cn(
                "chip border transition",
                mode === item.value
                  ? "border-ink-900 bg-ink-900 text-paper-50"
                  : "border-paper-400 bg-white/50 text-ink-500 hover:border-ink-400 hover:text-ink-800",
              )}
            >
              {item.label}
            </button>
          ))}
          {mode !== "all" && data.calendar.some((event) => event.hidden && !event.trash) ? (
            <span className="ml-1 text-[0.64rem] text-ink-400">숨긴 항목은 '전체'에서 보입니다</span>
          ) : null}
        </div>
      </div>

      {view === "year" ? (
        <>
          <div className="flex items-center gap-1.5">
            {[2026, 2027].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setYear(option)}
                className={cn(
                  "chip border",
                  year === option ? "border-ink-900 bg-ink-900 text-paper-50" : "border-paper-400 bg-white/60 text-ink-600",
                )}
              >
                {option}
              </button>
            ))}
            <span className="ml-auto text-[0.64rem] text-ink-400">날짜를 누르면 하루 보기로 이동합니다</span>
          </div>
          <YearView
            year={year}
            events={events}
            tasks={tasks}
            hiddenIncluded={hiddenIncluded}
            onPickDay={(day) => {
              setCursor(day);
              setView("day");
            }}
          />
        </>
      ) : null}

      {view === "month" ? (
        <MonthView
          cursor={cursor}
          events={data.calendar}
          tasks={data.projects}
          routines={data.routines}
          mode={mode}
          weekStartsOn={settings.weekStartsOn}
          onSelectDay={(day) => {
            setCursor(day);
            setView("day");
          }}
          onOpenEvent={openEvent}
          onOpenTask={openTask}
          onCreate={(date) => createEvent(date, null)}
          onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
          onOpenRoutine={(id) => setRoutineId(id)}
        />
      ) : null}

      {view === "week" || view === "three" ? (
        <div className="space-y-3">
          <TimeGrid
            days={view === "week" ? currentWeekDays : [threeStart, addDaysISO(threeStart, 1), addDaysISO(threeStart, 2)]}
            events={events}
            tasks={tasks}
            routines={data.routines}
            mode={mode}
            showWeekends={view === "week" ? settings.showWeekends : true}
            startHour={settings.weekStartHour}
            endHour={settings.weekEndHour}
            allDayCollapse={settings.allDayCollapse}
            onSelectDay={(day) => {
              setCursor(day);
              setView("day");
            }}
            onOpenEvent={openEvent}
            onOpenTask={openTask}
            onCreate={createEvent}
            onMoveEvent={moveEvent}
            onToggleTask={toggleTask}
            onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
          />
          {view === "week" ? (
            <>
              <WeekPanels
                weekStart={weekStart}
                events={events}
                tasks={tasks}
                hiddenIncluded={hiddenIncluded}
                onCreateWeeklyGoal={createWeekly}
                onOpenEvent={openEvent}
                onOpenTask={openTask}
                onToggleEventDone={toggleEventDone}
                onToggleTask={toggleTask}
                onUpdateEvent={(id, patch) => void update("calendar", id, patch)}
              />
              <WeekTable
                weekStart={weekStart}
                tasks={data.projects}
                routines={data.routines}
                onOpenTask={openTask}
                onOpenRoutine={(id) => setRoutineId(id)}
                onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
                onCreateTaskForProject={(projectId) => setTaskId(`new:${projectId}`)}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {view === "day" ? (
        <DayView
          day={cursor}
          events={events}
          tasks={tasks}
          routines={data.routines}
          hiddenIncluded={hiddenIncluded}
          onOpenEvent={openEvent}
          onOpenTask={openTask}
          onCreate={createEvent}
          onToggleTask={toggleTask}
          onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
          onWriteDiary={openBinderForDate}
        />
      ) : null}

      {view === "habit" ? (
        <HabitView
          cursor={cursor}
          routines={data.routines}
          hiddenIncluded={hiddenIncluded}
          onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
          onOpenRoutine={(id) => setRoutineId(id)}
          onCreateRoutine={() => setRoutineId("new")}
        />
      ) : null}

      {view === "week" && events.length === 0 && tasks.length === 0 ? (
        <p className="flex items-center justify-center gap-1 text-[0.7rem] text-ink-400">
          <StarIcon size={12} /> 이번 주 기록이 비어 있습니다. 표를 눌러 첫 일정을 추가해 보세요.
        </p>
      ) : null}

      <EventEditor
        open={eventEditor.open}
        eventId={eventEditor.id ?? null}
        draft={eventEditor.draft}
        onClose={() => setEventEditor({ open: false })}
      />
      <TaskEditor
        open={taskId !== null}
        taskId={taskId && !taskId.startsWith("new:") ? taskId : null}
        draft={taskId?.startsWith("new:") ? { kind: "할 일", projectId: taskId.slice(4), date: cursor } : undefined}
        onClose={() => setTaskId(null)}
      />
      <RoutineEditor
        open={routineId !== null}
        routineId={routineId && routineId !== "new" ? routineId : null}
        onClose={() => setRoutineId(null)}
      />
    </div>
  );
}

function minutesOf(time: string): number {
  const parts = time.split(":");
  return Number(parts[0] ?? 0) * 60 + Number(parts[1] ?? 0);
}

function minutesToTime(minutes: number): string {
  const value = Math.max(0, Math.min(1440, minutes));
  const h = Math.floor(value / 60) % 24;
  const m = value % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
