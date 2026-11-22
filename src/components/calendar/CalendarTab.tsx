"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings, type CalendarViewKey } from "@/state/settings";
import { useCategoryOptions } from "@/state/categories";
import { useTabReset, useUi } from "@/state/ui";
import {
  addDaysISO,
  diffDays,
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
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import { currentCalendarCategory, isLegacyCalendarCategory } from "@/lib/types";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { ModeChips } from "@/components/common/ModeChips";
import { WeekBoard } from "@/components/calendar/WeekBoard";
import { useAutoHideScrollbar } from "@/lib/use-auto-hide-scroll";
import { WeekPanel } from "@/components/calendar/WeekPanel";
import { MonthView, RoutineHeat } from "@/components/calendar/MonthView";
import { YearView } from "@/components/calendar/YearView";
import { DayView } from "@/components/calendar/DayView";
import { DayListPanel, byAllDayOrder, dayItemsFor } from "@/components/calendar/DayListPanel";
import { eventCoversDay } from "@/components/calendar/calendar-utils";
import { HabitView } from "@/components/calendar/HabitView";
import { EventEditor, type EventDraft } from "@/components/editors/EventEditor";
import { EventDetail } from "@/components/detail/EventDetail";
import { TaskDetail } from "@/components/detail/TaskDetail";
import { RoutineEditor } from "@/components/editors/RoutineEditor";

/** A12: the view switch reads 연간 → 월간 → 주간 → 3일 → 일간; 루틴 sits apart. */
const VIEWS: { value: CalendarViewKey; label: string }[] = [
  { value: "year", label: "연간" },
  { value: "month", label: "월간" },
  { value: "week", label: "주간" },
  { value: "three", label: "3일" },
  { value: "day", label: "일간" },
];

function eventMode(event: CalendarEvent): string {
  // A10: an old value is read as its current equivalent; A16: a user-made 분류 stays as it is.
  return isLegacyCalendarCategory(event.category) ? currentCalendarCategory(event.category) : event.category;
}

export function CalendarTab() {
  /** A20: 주간 보기 오른쪽 패널도 스크롤바가 움직일 때만 보입니다. */
  const weekPanelBar = useAutoHideScrollbar();
  const { data, update, remove, setRoutineCount, findItem, create } = useData();
  const { settings, addCategory, removeCategory } = useSettings();
  // A16: the 분류 filter shares one list with the routine/task pickers.
  const categoryOptions = useCategoryOptions();
  const { focus, clearFocus, openBinderForDate, setSearchOpen, openTrash, views, setView: setTabView, openTaskDraft } = useUi();

  const today = todayISO();
  // A15: the view lives in the shared UI state, so the browser's back button returns to it.
  const view = ((views.calendar || settings.calendarDefaultView) as CalendarViewKey) ?? "week";
  const setView = (next: CalendarViewKey, opts?: { replace?: boolean }) => setTabView("calendar", next, opts);
  const [cursor, setCursor] = useState(today);
  // A6: every device opens on 전체(all).
  const [mode, setMode] = useState<ModeFilter>("all");
  /** A6: 주간 맞춤 — projects and routines hidden one by one, kept on this device. */
  const [customHidden, setCustomHidden] = useState<{ projects: string[]; routines: string[] }>({ projects: [], routines: [] });
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("my-diary:custom-hide:v1");
      if (raw) {
        const parsed = JSON.parse(raw) as { projects?: string[]; routines?: string[] };
        setCustomHidden({ projects: parsed.projects ?? [], routines: parsed.routines ?? [] });
      }
    } catch {
      /* ignore */
    }
  }, []);
  const saveCustom = (next: { projects: string[]; routines: string[] }) => {
    setCustomHidden(next);
    try {
      window.localStorage.setItem("my-diary:custom-hide:v1", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const toggleCustom = (kind: "projects" | "routines", id: string) => {
    const list = customHidden[kind];
    saveCustom({ ...customHidden, [kind]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] });
  };
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [eventEditor, setEventEditor] = useState<{ open: boolean; id?: string | null; draft?: EventDraft }>({ open: false });
  const [taskId, setTaskId] = useState<string | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(null);
  /** A8: the week panel (꼭·목표·메모) folds open inside the week view below xl. */
  const [weekPanelOpen, setWeekPanelOpen] = useState(false);
  /** A4: X closes every layer that came with the detail, including the month day list. */
  const [dayListSignal, setDayListSignal] = useState(0);
  /**
   * A32: 주간 보기의 요일 머리글(예: `토 21`)이나 일정 칸을 누르면 열리는 그 날의 정리 목록.
   * 월간 보기의 하루 목록과 같은 화면(DayListPanel)을 씁니다.
   */
  const [daySummary, setDaySummary] = useState<{ day: string; startTime?: string | null } | null>(null);

  const closeEveryLayer = () => {
    setEventEditor({ open: false });
    setTaskId(null);
    setRoutineId(null);
    setDayListSignal((current) => current + 1);
    setDaySummary(null);
  };

  const firstViewPass = useRef(true);
  useEffect(() => {
    // Only a real settings change moves the view; a back-navigation keeps its own.
    if (firstViewPass.current) {
      firstViewPass.current = false;
      return;
    }
    setTabView("calendar", settings.calendarDefaultView, { replace: true });
  }, [settings.calendarDefaultView, setTabView]);

  useTabReset("calendar", () => {
    setView(settings.calendarDefaultView);
    setCursor(todayISO());
    setMode("all");
    setEventEditor({ open: false });
    setTaskId(null);
    setRoutineId(null);
    setWeekPanelOpen(false);
    setDaySummary(null);
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

  // A16: NOW 모드가 켜져 있으면 NOW 숨김 항목은 모든 보기에서 가립니다.
  const hiddenProjects = useMemo(
    () => data.projects.filter((project) => project.kind === "프로젝트" && project.hidden).map((project) => project.id),
    [data.projects],
  );
  const events = useMemo(
    () => data.calendar.filter((event) => (!settings.nowOnly || !event.hidden) && matchesMode(mode, event, eventMode(event))),
    [data.calendar, mode, settings.nowOnly],
  );
  const tasks = useMemo(
    () =>
      data.projects.filter(
        (task) =>
          task.kind === "할 일" &&
          (!settings.nowOnly || (!task.hidden && !task.projectIds.some((id) => hiddenProjects.includes(id)))) &&
          matchesMode(mode, task, task.category),
      ),
    [data.projects, mode, settings.nowOnly, hiddenProjects],
  );
  // A6: a project sent to History never appears in the week's project rows.
  const projects = useMemo(
    () => data.projects.filter((task) => task.kind === "프로젝트" && !task.trash && !task.history),
    [data.projects],
  );
  // A6: routine rows follow the same mode filter as projects.
  const routines = useMemo(
    () =>
      data.routines.filter(
        (routine) => !routine.trash && (!settings.nowOnly || !routine.hidden) && matchesMode(mode, routine, routine.category),
      ),
    [data.routines, mode, settings.nowOnly],
  );
  /**
   * A18: 프로젝트처럼 루틴도 NOW 스위치를 켜면 캘린더 모든 보기에서 가립니다.
   * `날짜별 체크` 기록은 남겨 두어야 실행 횟수가 그대로 세어집니다.
   */
  const calendarRoutines = useMemo(
    () => (settings.nowOnly ? data.routines.filter((routine) => !routine.hidden) : data.routines),
    [data.routines, settings.nowOnly],
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
  const createEvent = (date: string, time?: string | null, endTime?: string | null) =>
    setEventEditor({ open: true, draft: { date, startTime: time ?? null, endTime: endTime ?? null } });
  /** A10: a weekly goal is written on the week screen itself and saved as a 주간 목표 record. */
  const addWeeklyGoal = async (title: string) => {
    await create("calendar", {
      title,
      kind: "주간 목표",
      category: "개인",
      date: weekStart,
      weekKey: weekKeyOf(weekStart),
      baseDate: weekStart,
    });
  };

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

  /**
   * 다른 날로 끌어 옮기기 — 바뀌는 것은 날짜(와, 시간표 위에 놓았을 때의 시각)뿐입니다.
   * `time` 이 null 이면 원래 시각을 그대로 둡니다(종일 줄·월간 달력에 놓은 경우).
   * 정해 둔 시작·끝 시각과 길이, 여러 날 일정의 일수는 절대 줄이지 않습니다.
   */
  const moveEvent = (id: string, date: string, time: string | null) => {
    const item = findItem("calendar", id) as CalendarEvent | undefined;
    if (!item) return;
    const nextStart = time ?? item.startTime ?? null;
    const duration =
      item.startTime && item.endTime
        ? Math.max(15, minutesOf(item.endTime) - minutesOf(item.startTime))
        : null;
    const nextEnd = nextStart && item.endTime && duration !== null ? minutesToTime(minutesOf(nextStart) + duration) : null;
    const span = item.endDate && item.date ? Math.max(0, diffDays(item.endDate, item.date)) : 0;
    const nextEndDate = span > 0 ? addDaysISO(date, span) : date;
    // A16: an all-day item dropped on the timetable becomes a timed event (same day).
    void update("calendar", id, {
      date,
      startTime: nextStart,
      endTime: nextEnd,
      endDate: nextEndDate,
      allDay: !nextStart,
    });
  };

  /**
   * A18: 종일 칸으로 되돌리면 시간을 지워 다시 종일 일정으로 만듭니다.
   * (시간표로 뺀 일정을 같은 날 종일 칸에 도로 놓는 경우 — 여러 날 일정은 일수를 유지)
   */
  const moveEventToAllDay = (id: string, date: string) => {
    const item = findItem("calendar", id) as CalendarEvent | undefined;
    if (!item) return;
    const span = item.endDate && item.date ? Math.max(0, diffDays(item.endDate, item.date)) : 0;
    void update("calendar", id, {
      date,
      endDate: span > 0 ? addDaysISO(date, span) : date,
      startTime: null,
      endTime: null,
      allDay: true,
    });
  };

  /** A12: a task dropped on another weekday column takes that date (and saves it). */
  const moveTaskToDay = (id: string, date: string, fromDay: string) => {
    const task = findItem("projects", id) as ProjectTask | undefined;
    if (!task) return;
    const patch: Record<string, unknown> = {};
    if (task.date === fromDay) patch.date = date;
    if (task.due === fromDay && task.due !== task.date) patch.due = date;
    if (Object.keys(patch).length === 0) patch.date = date;
    void update("projects", id, patch);
  };

  /**
   * A35: 프로젝트 칸 시트에서 다른 프로젝트 행으로 끌어 놓았을 때 — 날짜와 프로젝트를 함께
   * 바꿉니다. `projectId === null`은 index(프로젝트 없음) 행으로 돌아가는 것입니다.
   * 프로젝트가 바뀌면 그 프로젝트의 분류도 따라가 카드 색·필터가 어긋나지 않습니다.
   */
  const moveTaskToProject = (id: string, projectId: string | null, date: string, fromDay: string) => {
    const task = findItem("projects", id) as ProjectTask | undefined;
    if (!task) return;
    const patch: Record<string, unknown> = {};
    if (date !== fromDay) {
      if (task.date === fromDay) patch.date = date;
      if (task.due === fromDay && task.due !== task.date) patch.due = date;
      if (patch.date === undefined && patch.due === undefined) patch.date = date;
    }
    const targetIds = projectId ? [projectId] : [];
    const currentIds = task.projectIds ?? [];
    if (currentIds.length !== targetIds.length || currentIds.some((value, index) => value !== targetIds[index])) {
      patch.projectIds = targetIds;
      const project = projectId ? projects.find((item) => item.id === projectId) : null;
      if (project) patch.category = project.category;
    }
    if (Object.keys(patch).length > 0) void update("projects", id, patch);
  };

  /**
   * A33: 하루 목록 시트에서 항목을 다른 날짜 칸에 놓았을 때. 일정은 정해 둔 시각·길이·
   * 여러 날 일수를 그대로 두고 날짜만 옮기고(월간 보기의 칩 끌기와 같은 규칙), 할 일은
   * 그 날짜를 바꿉니다. `fromDay`는 그 할 일이 어느 날 칸에서 보이던 것인지입니다.
   */
  const moveItemToDate = (type: "event" | "task", id: string, date: string, fromDay?: string) => {
    if (type === "task") {
      if (fromDay) {
        moveTaskToDay(id, date, fromDay);
        return;
      }
      void update("projects", id, { date });
      return;
    }
    const item = findItem("calendar", id) as CalendarEvent | undefined;
    if (!item) return;
    // B5: moving an event keeps its time and length.
    const span = item.endDate && item.date ? diffDays(item.endDate, item.date) : 0;
    void update("calendar", id, { date, endDate: span > 0 ? addDaysISO(date, span) : date });
  };

  /** B5: dragging an event's edge changes its end (or start) time. */
  const resizeEvent = (id: string, startTime: string, endTime: string) => {
    void update("calendar", id, { startTime, endTime });
  };

  /** A32: 하루 목록에서 종일 일정 순서를 ↑↓로 바꿉니다 — 월간 보기와 같은 규칙(`정렬`). */
  const moveAllDayInDay = (day: string, id: string, direction: -1 | 1) => {
    const list = events
      .filter((event) => event.kind === "일정" && event.allDay && eventCoversDay(event, day))
      .sort(byAllDayOrder);
    const index = list.findIndex((event) => event.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const reordered = [...list];
    const moved = reordered[target]!;
    reordered[target] = reordered[index]!;
    reordered[index] = moved;
    reordered.forEach((event, position) => {
      const value = (position + 1) * 10;
      if (event.sort !== value) void update("calendar", event.id, { sort: value });
    });
  };

  /** B5: all-day bars reorder by drag; the order is kept in `정렬`. */
  const reorderAllDay = (ids: string[]) => {
    ids.forEach((id, index) => {
      const item = findItem("calendar", id) as CalendarEvent | undefined;
      if (item && item.sort !== (index + 1) * 10) void update("calendar", id, { sort: (index + 1) * 10 });
    });
  };

  /**
   * A32: '이번 주 꼭' — 지금 보고 있는 주에 항목이 쌓입니다. 이번 주를 보고 있으면 오늘,
   * 다른 주를 보고 있으면 그 주의 월요일 날짜로 놓여 그 주의 목록에 남습니다.
   */
  const addFavorite = async (titleText: string, targetWeekStart: string) => {
    const today = todayISO();
    const inWeek = today >= targetWeekStart && today <= addDaysISO(targetWeekStart, 6);
    // A8: one creation turns on 긴급 · 중요 · 별표 together, so the title lands in '이번 주 꼭'
    // straight away (and stays there after being moved to the inbox).
    await create("projects", {
      title: titleText,
      kind: "할 일",
      category: "개인",
      date: inWeek ? today : targetWeekStart,
      status: "미완료",
      urgent: true,
      important: true,
      favorite: true,
    });
  };

  /** A8: this week's memo — title follows the real writing day, the record joins the week. */
  const createMemo = async (text: string): Promise<string | null> => {
    const created = await create("calendar", {
      title: memoTitle(todayISO(), "주간 메모"),
      kind: "주간 메모",
      category: "개인",
      date: weekStart,
      weekKey: weekKeyOf(weekStart),
      baseDate: weekStart,
      memo: text,
    });
    return created?.id ?? null;
  };

  const renderWeekPanel = () => (
    <WeekPanel
      weekStart={weekStart}
      events={events}
      tasks={tasks}
      onCreateGoal={addWeeklyGoal}
      onCreateFavorite={(title) => addFavorite(title, weekStart)}
      onDeleteGoal={(goal) => void remove("calendar", goal.id)}
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
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="truncate text-[calc(22px*var(--fs))] font-semibold leading-none tracking-[-0.02em] text-ink-900">
              {title}
            </h1>
            <p className="truncate text-[calc(13px*var(--fs))] tracking-[0.02em] text-ink-500">{meta}</p>
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
            <div className="seg-track">
              <button
                type="button"
                onClick={() => setView("habit")}
                aria-pressed={view === "habit"}
                className={cn("seg-item", view === "habit" && "seg-item-active")}
              >
                루틴
              </button>
            </div>

            <div className="flex items-center gap-0.5 rounded-full bg-paper-200 p-0.5">
              <button type="button" onClick={() => step(-1)} className="icon-btn h-7 w-7" aria-label="이전">
                <ChevronLeftIcon size={14} />
              </button>
              <button type="button" onClick={() => setCursor(todayISO())} className="px-2 py-1 text-[calc(15px*var(--fs))] font-medium text-ink-700 hover:text-ink-900">
                오늘
              </button>
              <button type="button" onClick={() => step(1)} className="icon-btn h-7 w-7" aria-label="다음">
                <ChevronRightIcon size={14} />
              </button>
            </div>

            <button type="button" onClick={() => setSearchOpen(true)} className="icon-btn hidden bg-paper-200 hover:bg-paper-300/70 md:inline-flex" aria-label="검색">
              <SearchIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => openTrash("calendar")}
              className="icon-btn bg-paper-200 hover:bg-paper-300/70"
              aria-label="휴지통"
              title="캘린더 휴지통"
            >
              <TrashIcon size={15} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ModeChips
            mode={mode}
            onChange={setMode}
            categories={categoryOptions}
            showCustom={view === "week" || view === "three"}
            onAddCategory={addCategory}
            onRemoveCategory={removeCategory}
          />
          {mode !== "all" && data.calendar.some((event) => event.hidden && !event.trash) ? (
            <button
              type="button"
              onClick={() => setMode("all")}
              className="ml-1 text-[calc(14px*var(--fs))] text-ink-400 underline-offset-2 hover:text-ink-700 hover:underline"
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
            <span className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">이번 주 꼭 · 목표 · 메모</span>
            <span className="text-[calc(14px*var(--fs))] text-ink-400">{weekPanelOpen ? "접기" : "열기"}</span>
          </button>
          {weekPanelOpen ? <div className="border-t border-paper-300/70 px-3.5 py-3">{renderWeekPanel()}</div> : null}
        </div>
      ) : null}

      {view === "year" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {[2026, 2027].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setYear(option)}
                className={cn(
                  "rounded-full px-3 py-1 text-[calc(15px*var(--fs))] font-medium transition",
                  year === option ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:text-ink-800",
                )}
              >
                {option}
              </button>
            ))}
            <span className="basis-full text-[calc(13.5px*var(--fs))] text-ink-400 sm:ml-auto sm:basis-auto">월 이름을 누르면 월간, 날짜를 누르면 하루 보기로 이동합니다</span>
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
              onPickMonth={(monthKey) => {
                // A21: 연간 → 월간. 그 달 1일로 커서를 두고 월간 보기를 엽니다.
                setYear(Number(monthKey.slice(0, 4)));
                setCursor(`${monthKey}-01`);
                setView("month");
              }}
            />
          </div>
        </>
      ) : null}

      <div className="mt-3 min-h-0">
        <div
          className={cn(
            "min-w-0",
            (view === "month" || view === "week" || view === "three" || view === "day") && "h-[calc(100dvh-11.5rem)] min-h-[26rem]",
          )}
        >
          {view === "month" ? (
            <MonthView
              cursor={cursor}
              events={data.calendar}
              tasks={data.projects}
              routines={calendarRoutines}
              mode={mode}
              weekStartsOn={settings.weekStartsOn}
              showWeekends={settings.showWeekends}
              dayItems={settings.monthDayItems}
              closeDayListSignal={dayListSignal}
              onSelectDay={(day) => {
                setCursor(day);
                setView("day");
              }}
              onSelectWeek={(day) => {
                // A21: 월간 → 주간. 그 주 아무 날이나 커서로 두면 주간 보기가 그 주를 엽니다.
                setCursor(day);
                setView("week");
              }}
              onOpenEvent={openEvent}
              onOpenTask={openTask}
              onToggleTask={toggleTask}
              onUpdateEvent={(id, patch) => void update("calendar", id, patch)}
              onCreate={(date) => createEvent(date, null)}
              onCreateTask={(date) => openTaskDraft({ kind: "할 일", date })}
              onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
              onMoveItem={(type, id, date, fromDay) => moveItemToDate(type, id, date, fromDay)}
            />
          ) : null}

          {view === "week" ? (
            <WeekBoard
              days={weekVisibleDays}
              events={events}
              tasks={tasks}
              projects={projects}
              routines={calendarRoutines}
              startHour={settings.weekStartHour}
              endHour={settings.weekEndHour}
              onSelectDay={(day) => {
                setCursor(day);
                setView("day");
              }}
              onOpenDaySummary={(day, startTime) => setDaySummary({ day, startTime: startTime ?? null })}
              onOpenEvent={openEvent}
              onOpenTask={openTask}
              onOpenRoutine={(id) => setRoutineId(id)}
              onCreate={createEvent}
              onMoveEvent={moveEvent}
              onMoveTask={moveTaskToDay}
              onMoveTaskToProject={moveTaskToProject}
              onMoveAllDayDate={moveEventToAllDay}
              onResizeEvent={resizeEvent}
              onReorderAllDay={reorderAllDay}
              onToggleTask={toggleTask}
              onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
              onCreateTaskForProject={(projectId, date) => openTaskDraft({ kind: "할 일", projectId: projectId || undefined, date: date || undefined })}
              onCreateRoutine={() => setRoutineId("new")}
              mode={mode}
              hiddenProjectIds={customHidden.projects}
              hiddenRoutineIds={customHidden.routines}
              onToggleProjectHidden={(id) => toggleCustom("projects", id)}
              onToggleRoutineHidden={(id) => toggleCustom("routines", id)}
            />
          ) : null}

          {view === "three" ? (
            <WeekBoard
              days={threeDays}
              events={events}
              tasks={tasks}
              projects={projects}
              routines={calendarRoutines}
              startHour={settings.weekStartHour}
              endHour={settings.weekEndHour}
              onSelectDay={(day) => {
                setCursor(day);
                setView("day");
              }}
              onOpenDaySummary={(day, startTime) => setDaySummary({ day, startTime: startTime ?? null })}
              onOpenEvent={openEvent}
              onOpenTask={openTask}
              onOpenRoutine={(id) => setRoutineId(id)}
              onCreate={createEvent}
              onMoveEvent={moveEvent}
              onMoveTask={moveTaskToDay}
              onMoveTaskToProject={moveTaskToProject}
              onMoveAllDayDate={moveEventToAllDay}
              onResizeEvent={resizeEvent}
              onReorderAllDay={reorderAllDay}
              onToggleTask={toggleTask}
              onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
              onCreateTaskForProject={(projectId, date) => openTaskDraft({ kind: "할 일", projectId: projectId || undefined, date: date || undefined })}
              onCreateRoutine={() => setRoutineId("new")}
              mode={mode}
              hiddenProjectIds={customHidden.projects}
              hiddenRoutineIds={customHidden.routines}
              onToggleProjectHidden={(id) => toggleCustom("projects", id)}
              onToggleRoutineHidden={(id) => toggleCustom("routines", id)}
            />
          ) : null}

          {view === "day" ? (
            <DayView
              day={cursor}
              events={events}
              tasks={tasks}
              projects={projects}
              routines={calendarRoutines}
              hiddenIncluded={hiddenIncluded}
              recordCount={data.binder.filter((entry) => entry.date === cursor && !entry.trash).length}
              onOpenEvent={openEvent}
              onOpenTask={openTask}
              onCreate={createEvent}
              onToggleTask={toggleTask}
              onRoutineCount={(routine, date, count) => void setRoutineCount(routine, date, count)}
              onMoveEvent={moveEvent}
              onResizeEvent={resizeEvent}
              onWriteDiary={openBinderForDate}
              onCreateTaskForProject={(projectId) => openTaskDraft({ kind: "할 일", projectId: projectId || undefined })}
            />
          ) : null}

          {view === "habit" ? (
            <HabitView
              cursor={cursor}
              routines={calendarRoutines}
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
        <aside
          onScroll={weekPanelBar.onScroll}
          className={cn(
            "side-panel sticky top-12 hidden h-[calc(100dvh-8rem)] w-[19rem] flex-none overflow-y-auto pb-2 pl-5 xl:block",
            weekPanelBar.className,
          )}
        >
          {renderWeekPanel()}
        </aside>
      ) : null}

      {view === "month" ? (
        <aside className="side-panel sticky top-12 hidden max-h-[calc(100dvh-6.5rem)] w-[19rem] flex-none overflow-y-auto pb-8 pl-5 xl:block">
            <div className="flex items-center justify-between">
              <h3 className="text-[calc(18px*var(--fs))] font-semibold text-ink-900">루틴</h3>
              <span className="text-[calc(13.5px*var(--fs))] text-ink-400">칸을 눌러 체크</span>
            </div>
            <div className="mt-3 space-y-2.5">
              {routineTemplates.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setRoutineId("new")}
                  className="w-full rounded-2xl border border-dashed border-paper-300 px-3 py-8 text-[calc(14px*var(--fs))] text-ink-400 hover:border-ink-300 hover:text-ink-600"
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

      {/*
        A32: 주간 보기에서 고른 날의 정리 목록 — 월간 보기의 하루 목록과 같은 화면입니다.
        상세가 이 위에 열리므로, 상세를 닫으면 다시 이 목록으로 돌아옵니다.
      */}
      {daySummary ? (
        <DayListPanel
          day={daySummary.day}
          startTime={daySummary.startTime ?? null}
          items={dayItemsFor(daySummary.day, events, tasks)}
          onClose={() => setDaySummary(null)}
          onGoDay={() => {
            const day = daySummary.day;
            setDaySummary(null);
            setCursor(day);
            setView("day");
          }}
          onOpenEvent={openEvent}
          onOpenTask={openTask}
          onToggleTask={toggleTask}
          onMoveAllDay={(id, direction) => moveAllDayInDay(daySummary.day, id, direction)}
          onCreateEvent={(time) => createEvent(daySummary.day, time)}
          onCreateTask={() => openTaskDraft({ kind: "할 일", date: daySummary.day })}
          onMoveItem={(type, id, date) => moveItemToDate(type, id, date, daySummary.day)}
        />
      ) : null}

      <EventDetail
        open={eventEditor.open && !!eventEditor.id}
        eventId={eventEditor.id ?? null}
        onBack={() => setEventEditor({ open: false })}
        onCloseAll={closeEveryLayer}
      />
      <EventEditor
        open={eventEditor.open && !eventEditor.id}
        draft={eventEditor.draft}
        onClose={() => setEventEditor({ open: false })}
      />
      <TaskDetail
        open={taskId !== null}
        taskId={taskId}
        onBack={() => setTaskId(null)}
        onCloseAll={closeEveryLayer}
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
