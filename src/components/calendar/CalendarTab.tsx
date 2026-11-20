"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/state/store";
import { useSettings, type CalendarViewKey } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import {
  addDaysISO,
  addMonthsISO,
  formatMonthDay,
  isoWeekNumber,
  memoTitle,
  startOfWeekISO,
  todayISO,
  weekDays,
  weekKeyOf,
  weekdayKo,
} from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn, matchesMode } from "@/lib/utils";
import type { CalendarEvent, CalendarKind, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { WeekBoard } from "@/components/calendar/WeekBoard";
import { WeekPanel } from "@/components/calendar/WeekPanel";
import { MonthView, RoutineHeat } from "@/components/calendar/MonthView";
import { YearView } from "@/components/calendar/YearView";
import { DayView } from "@/components/calendar/DayView";
import { HabitView } from "@/components/calendar/HabitView";
import { EventEditor, type EventDraft } from "@/components/editors/EventEditor";
import { TaskEditor } from "@/components/editors/TaskEditor";
import { RoutineEditor } from "@/components/editors/RoutineEditor";

const VIEWS: { value: CalendarViewKey; label: string }[] = [
  { value: "month", label: "월간" },
  { value: "week", label: "주간" },
  { value: "three", label: "3일" },
  { value: "day", label: "일간" },
  { value: "year", label: "연간" },
  { value: "habit", label: "루틴" },
];

const MODES: { value: ModeFilter; label: string; dot?: string }[] = [
  { value: "now", label: "전체" },
  { value: "업무", label: "업무", dot: "bg-accent-400" },
  { value: "개인", label: "개인", dot: "bg-sage-400" },
  { value: "공부", label: "공부", dot: "bg-dusk-500" },
];

function eventMode(event: CalendarEvent): "업무" | "개인" | "공부" {
  if (event.category === "외부일정" || event.category === "성과") return "업무";
  return "개인";
}

export function CalendarTab() {
  const { data, update, setRoutineCount, findItem, create } = useData();
  const { settings } = useSettings();
  const { focus, clearFocus, openBinderForDate, setSearchOpen } = useUi();

  const today = todayISO();
  const [view, setView] = useState<CalendarViewKey>(settings.calendarDefaultView);
  const [cursor, setCursor] = useState(today);
  const [mode, setMode] = useState<ModeFilter>("now");
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [eventEditor, setEventEditor] = useState<{ open: boolean; id?: string | null; draft?: EventDraft }>({ open: false });
  const [taskId, setTaskId] = useState<string | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(null);
  /** A8: the week panel (꼭·목표·메모) folds open inside the week view below xl. */
  const [weekPanelOpen, setWeekPanelOpen] = useState(false);

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
    setWeekPanelOpen(false);
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
  const projects = useMemo(() => data.projects.filter((task) => task.kind === "프로젝트" && !task.trash), [data.projects]);
  const routines = useMemo(
    () => data.routines.filter((routine) => !routine.trash && (mode === "all" || !routine.hidden)),
    [data.routines, mode],
  );

  const allWeekDays = weekDays(weekStart, settings.weekStartsOn);
  const weekVisibleDays = settings.showWeekends
    ? allWeekDays
    : allWeekDays.filter((day) => {
        const dow = new Date(`${day}T12:00:00`).getDay();
        return (dow !== 0 && dow !== 6) || day === today;
      });
  const threeDays = useMemo(
    () => [threeStart, addDaysISO(threeStart, 1), addDaysISO(threeStart, 2)],
    [threeStart],
  );

  const title = useMemo(() => {
    if (view === "year") return `${year}년`;
    if (view === "month") return `${Number(cursor.slice(5, 7))}월`;
    if (view === "habit") return "루틴";
    if (view === "week") {
      return `${formatMonthDay(weekStart)} – ${Number(addDaysISO(weekStart, 6).slice(8, 10))}일`;
    }
    if (view === "three") return `${formatMonthDay(threeStart)} – ${Number(addDaysISO(threeStart, 2).slice(8, 10))}일`;
    return `${formatMonthDay(cursor)} ${weekdayKo(cursor)}요일`;
  }, [view, year, cursor, weekStart, threeStart]);

  const meta = useMemo(() => {
    if (view === "year") return "연간 보기";
    if (view === "month" || view === "habit") return `${cursor.slice(0, 4)}`;
    if (view === "week") return `${isoWeekNumber(weekStart)}주차 · ${weekStart.slice(0, 4)}`;
    if (view === "three") return `${isoWeekNumber(threeStart)}주차 · ${threeStart.slice(0, 4)}`;
    return `${cursor.slice(0, 4)} · ${holidayName(cursor) ?? "하루 보기"}`;
  }, [view, cursor, weekStart, threeStart]);

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
  const createWeekly = (kind: CalendarKind) => setEventEditor({ open: true, draft: { date: weekStart, kind } });

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

  const addFavorite = async (titleText: string) => {
    // A8: one creation turns on 긴급 · 중요 · 별표 together, so the title lands in '이번 주 꼭'
    // straight away (and stays there after being moved to the inbox).
    await create("projects", {
      title: titleText,
      kind: "할 일",
      category: "개인",
      date: todayISO(),
      status: "미완료",
      urgent: true,
      important: true,
      favorite: true,
    });
  };

  /** A8: this week's memo — title follows the real writing day, the record joins the week. */
  const createMemo = async (): Promise<string | null> => {
    const created = await create("calendar", {
      title: memoTitle(todayISO(), "주간 메모"),
      kind: "주간 메모",
      category: "개인",
      date: weekStart,
      weekKey: weekKeyOf(weekStart),
      baseDate: weekStart,
      memo: "",
    });
    return created?.id ?? null;
  };

  const renderWeekPanel = () => (
    <WeekPanel
      weekStart={weekStart}
      events={events}
      tasks={tasks}
      onCreateGoal={createWeekly}
      onCreateFavorite={(title) => void addFavorite(title)}
      onCreateMemo={createMemo}
      onOpenEvent={openEvent}
      onOpenTask={openTask}
      onToggleEventDone={toggleEventDone}
      onToggleTask={toggleTask}
      onUpdateEvent={(id, patch) => void update("calendar", id, patch)}
      onPickDay={(day) => {
        setCursor(day);
        setView("day");
      }}
      onMonth={(direction) => setCursor((current) => addMonthsISO(current, direction))}
    />
  );

  const routineTemplates = routines.filter((routine) => routine.kind === "루틴" && !routine.history);

  return (
    <div className="flex items-start gap-6 xl:gap-8">
      <div className="min-w-0 flex-1">
      {/* toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-[0.66rem] tracking-[0.02em] text-ink-400">{meta}</p>
            <h1 className="mt-1.5 truncate text-[1.95rem] font-semibold leading-none tracking-[-0.035em] text-ink-900 md:text-[2.3rem]">
              {title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="seg-track">
              {VIEWS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setView(item.value)}
                  className={cn("seg-item", view === item.value && "seg-item-active")}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-0.5 rounded-full bg-paper-200 p-0.5">
              <button type="button" onClick={() => step(-1)} className="icon-btn h-7 w-7" aria-label="이전">
                <ChevronLeftIcon size={14} />
              </button>
              <button type="button" onClick={() => setCursor(todayISO())} className="px-2 py-1 text-[0.76rem] font-medium text-ink-700 hover:text-ink-900">
                오늘
              </button>
              <button type="button" onClick={() => step(1)} className="icon-btn h-7 w-7" aria-label="다음">
                <ChevronRightIcon size={14} />
              </button>
            </div>

            <button type="button" onClick={() => setSearchOpen(true)} className="icon-btn hidden bg-paper-200 hover:bg-paper-300/70 md:inline-flex" aria-label="검색">
              <SearchIcon size={15} />
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
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.76rem] font-medium transition",
                mode === item.value
                  ? "bg-ink-900 text-white"
                  : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
              )}
            >
              {item.dot ? <span className={cn("h-[6px] w-[6px] rounded-full", item.dot, mode === item.value && "bg-white")} /> : null}
              {item.label}
            </button>
          ))}
          {mode !== "all" && data.calendar.some((event) => event.hidden && !event.trash) ? (
            <button
              type="button"
              onClick={() => setMode("all")}
              className="ml-1 text-[0.68rem] text-ink-400 underline-offset-2 hover:text-ink-700 hover:underline"
            >
              숨긴 항목 포함
            </button>
          ) : null}

          <div className={cn("ml-auto hidden items-center gap-1.5 md:flex", (view === "habit" || view === "year") && "md:hidden")}>
            <button type="button" onClick={() => createEvent(cursor, view === "day" ? "09:00" : null)} className="btn-primary btn-xs">
              <PlusIcon size={12} /> 새 일정
            </button>
          </div>
        </div>
      </div>

      {view === "week" ? (
        <div className="mt-3 rounded-2xl border border-paper-300 bg-white/70 xl:hidden">
          <button
            type="button"
            onClick={() => setWeekPanelOpen((open) => !open)}
            aria-expanded={weekPanelOpen}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
          >
            <span className="text-[0.84rem] font-semibold text-ink-900">이번 주 꼭 · 목표 · 메모</span>
            <span className="text-[0.68rem] text-ink-400">{weekPanelOpen ? "접기" : "열기"}</span>
          </button>
          {weekPanelOpen ? <div className="border-t border-paper-300/70 px-3.5 py-3">{renderWeekPanel()}</div> : null}
        </div>
      ) : null}

      {view === "year" ? (
        <>
          <div className="mt-4 flex items-center gap-1.5">
            {[2026, 2027].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setYear(option)}
                className={cn(
                  "rounded-full px-3 py-1 text-[0.76rem] font-medium transition",
                  year === option ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:text-ink-800",
                )}
              >
                {option}
              </button>
            ))}
            <span className="ml-auto text-[0.64rem] text-ink-400">날짜를 누르면 하루 보기로 이동합니다</span>
          </div>
          <div className="mt-3">
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
          </div>
        </>
      ) : null}

      <div className="mt-4">
        <div className="min-w-0">
          {view === "month" ? (
            <MonthView
              cursor={cursor}
              events={data.calendar}
              tasks={data.projects}
              routines={data.routines}
              mode={mode}
              weekStartsOn={settings.weekStartsOn}
              showWeekends={settings.showWeekends}
              dayItems={settings.monthDayItems}
              onSelectDay={(day) => {
                setCursor(day);
                setView("day");
              }}
              onOpenEvent={openEvent}
              onOpenTask={openTask}
              onUpdateEvent={(id, patch) => void update("calendar", id, patch)}
              onCreate={(date) => createEvent(date, null)}
              onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
            />
          ) : null}

          {view === "week" ? (
            <WeekBoard
              days={weekVisibleDays}
              events={events}
              tasks={tasks}
              projects={projects}
              routines={data.routines}
              startHour={settings.weekStartHour}
              endHour={settings.weekEndHour}
              onSelectDay={(day) => {
                setCursor(day);
                setView("day");
              }}
              onOpenEvent={openEvent}
              onOpenTask={openTask}
              onOpenRoutine={(id) => setRoutineId(id)}
              onCreate={createEvent}
              onMoveEvent={moveEvent}
              onToggleTask={toggleTask}
              onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
              onCreateTaskForProject={(projectId) => setTaskId(projectId ? `new:${projectId}` : "new:")}
              onCreateRoutine={() => setRoutineId("new")}
            />
          ) : null}

          {view === "three" ? (
            <WeekBoard
              days={threeDays}
              events={events}
              tasks={tasks}
              projects={projects}
              routines={data.routines}
              startHour={settings.weekStartHour}
              endHour={settings.weekEndHour}
              onSelectDay={(day) => {
                setCursor(day);
                setView("day");
              }}
              onOpenEvent={openEvent}
              onOpenTask={openTask}
              onOpenRoutine={(id) => setRoutineId(id)}
              onCreate={createEvent}
              onMoveEvent={moveEvent}
              onToggleTask={toggleTask}
              onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
              onCreateTaskForProject={(projectId) => setTaskId(projectId ? `new:${projectId}` : "new:")}
              onCreateRoutine={() => setRoutineId("new")}
            />
          ) : null}

          {view === "day" ? (
            <DayView
              day={cursor}
              events={events}
              tasks={tasks}
              projects={projects}
              routines={data.routines}
              hiddenIncluded={hiddenIncluded}
              recordCount={data.binder.filter((entry) => entry.date === cursor && !entry.trash).length}
              onOpenEvent={openEvent}
              onOpenTask={openTask}
              onCreate={createEvent}
              onToggleTask={toggleTask}
              onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
              onWriteDiary={openBinderForDate}
              onCreateTaskForProject={(projectId) => setTaskId(projectId ? `new:${projectId}` : "new:")}
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
        </div>
      </div>
      </div>

      {view === "week" ? (
        <aside className="side-panel sticky top-12 hidden max-h-[calc(100dvh-6.5rem)] w-[19rem] flex-none overflow-y-auto pb-8 pl-5 xl:block">
          {renderWeekPanel()}
        </aside>
      ) : null}

      {view === "month" ? (
        <aside className="side-panel sticky top-12 hidden max-h-[calc(100dvh-6.5rem)] w-[19rem] flex-none overflow-y-auto pb-8 pl-5 xl:block">
            <div className="flex items-center justify-between">
              <h3 className="text-[1.05rem] font-semibold text-ink-900">루틴</h3>
              <span className="text-[0.66rem] text-ink-400">칸을 눌러 체크</span>
            </div>
            <div className="mt-3 space-y-2.5">
              {routineTemplates.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setRoutineId("new")}
                  className="w-full rounded-2xl border border-dashed border-paper-300 px-3 py-8 text-[0.72rem] text-ink-400 hover:border-ink-300 hover:text-ink-600"
                >
                  + 루틴 추가
                </button>
              ) : (
                routineTemplates.map((routine, index) => (
                  <RoutineHeat
                    key={routine.id}
                    routine={routine as Routine}
                    routines={data.routines}
                    days={Array.from({ length: Number(new Date(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 0).getDate()) }, (_, i) =>
                      `${cursor.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
                    )}
                    index={index}
                    onCount={(date, count) => void setRoutineCount(routine, date, count)}
                  />
                ))
              )}
            </div>
        </aside>
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
        draft={taskId?.startsWith("new:") ? { kind: "할 일", projectId: taskId.slice(4) || undefined, date: cursor } : undefined}
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
