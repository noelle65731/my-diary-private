"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import {
  addDaysISO,
  diaryTitle,
  formatFullKo,
  isoWeekNumber,
  formatMonthKo,
  formatShort,
  isSameISO,
  monthOptions,
  startOfWeekISO,
  todayISO,
  weekDays,
  weekdayKo,
} from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn, truncate } from "@/lib/utils";
import type { BinderEntry, ProjectTask } from "@/lib/types";
import { previewText, renderMarkdown } from "@/lib/markdown";
import { BookIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon, PinIcon, PlusIcon, SearchIcon, StarIcon, XIcon } from "@/components/icons";
import { EmptyState } from "@/components/common/primitives";
import { TagInput } from "@/components/editors/shared";
import { pushToast } from "@/lib/toast-bus";
import { paperBackground, PAPER_OPTIONS, type PaperStyle } from "@/lib/paper";
import { BinderEditor } from "@/components/editors/BinderEditor";
import { BinderDetail } from "@/components/detail/BinderDetail";
import { eventCoversDay, tasksForDay } from "@/components/calendar/calendar-utils";
import type { CalendarEvent } from "@/lib/types";
import { useDnd } from "@/components/common/dnd";

type BinderView = "weekly" | "daily" | "notes";

/** A31: 위클리 날짜 칸에 바로 붙는 한 줄 — 그날 일정과 할 일을 창 없이 보면서 씁니다. */
interface AgendaItem {
  id: string;
  kind: "일정" | "할 일";
  title: string;
  /** "종일", "09:00", 또는 시간이 없으면 빈 문자열 */
  time: string;
  allDay: boolean;
  done: boolean;
  waiting: boolean;
  /** 마감이 이 날이거나 다른 날인 할 일 */
  dueNote: string;
}

export function BinderTab() {
  const { data, update, create } = useData();
  const { settings, set: setSetting } = useSettings();
  const { focus, clearFocus, pendingBinderDate, consumeBinderDate, setSearchOpen, views, setView: setTabView } = useUi();

  // A15: weekly / daily / notes is part of the address so 뒤로 가기 returns here.
  const view = ((views.binder || "weekly") as BinderView);
  const setView = (next: BinderView) => setTabView("binder", next);
  const [cursor, setCursor] = useState(todayISO());
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<{ date?: string; kind?: "일기" | "노트" } | null>(null);
  /** One row at a time writes in place; a click on another day moves the caret there. */
  const [writingDay, setWritingDay] = useState<string | null>(null);
  /** A24: 위클리 화면의 참고 창이 어느 주를 보여 줄지 — 쓰기 시작한 날짜를 따라갑니다. */
  const [scheduleScope, setScheduleScope] = useState<"current" | "last">("current");

  const diaries = useMemo(() => data.binder.filter((entry) => entry.kind === "일기" && !entry.trash), [data.binder]);
  const notes = useMemo(() => data.binder.filter((entry) => entry.kind === "노트" && !entry.trash), [data.binder]);

  useTabReset("binder", () => {
    setView("weekly");
    setCursor(todayISO());
    setEditorId(null);
    setEditorDraft(null);
    setWritingDay(null);
  });

  useEffect(() => {
    if (!focus || focus.resource !== "binder") return;
    const entry = data.binder.find((item) => item.id === focus.id);
    if (entry) {
      setCursor(entry.date ?? todayISO());
      setEditorId(entry.id);
      setView("daily");
    }
    clearFocus();
  }, [focus, data.binder, clearFocus]);

  useEffect(() => {
    if (!pendingBinderDate) return;
    setCursor(pendingBinderDate);
    setView("daily");
    consumeBinderDate();
  }, [pendingBinderDate, consumeBinderDate]);

  const weekStart = startOfWeekISO(cursor, settings.weekStartsOn);
  const days = weekDays(cursor, settings.weekStartsOn);
  const lastWeekStart = addDaysISO(weekStart, -7);
  const lastWeekDays = weekDays(lastWeekStart, settings.weekStartsOn);
  const dayEntry = (day: string) => diaries.find((entry) => entry.date === day) ?? null;

  /** A31: 위클리에서 날짜마다 그날 일정·할 일을 세어 둡니다(14칸 × 전체 훑기라 한 번만 계산). */
  const agendaEvents = useMemo(
    () => data.calendar.filter((event) => event.kind === "일정" && !event.trash && (!settings.nowOnly || !event.hidden)),
    [data.calendar, settings.nowOnly],
  );
  const agendaTasks = useMemo(
    () =>
      data.projects.filter(
        (task) => task.kind === "할 일" && !task.trash && task.status !== "취소" && (!settings.nowOnly || !task.hidden),
      ),
    [data.projects, settings.nowOnly],
  );
  /** A24: 위클리 화면의 일정·할 일 참고 창 — 열어 둔 상태는 설정에 남습니다. */
  const showWeekSchedule = settings.binderWeekSchedule;
  const setShowWeekSchedule = (next: boolean) => setSetting("binderWeekSchedule", next);
  const startWriting = (day: string) => {
    setWritingDay(day);
    if (showWeekSchedule) setScheduleScope(day < weekStart ? "last" : "current");
  };

  const openNew = (date: string, kind: "일기" | "노트" = "일기") => {
    setEditorDraft({ date, kind });
    setEditorId(null);
  };

  const openEntry = (id: string) => {
    setEditorId(id);
    setEditorDraft(null);
  };

  /** Inline writing in the weekly spread — the first keystroke creates the record. */
  const createInline = async (day: string, body: string) => {
    const created = await create("binder", { title: autoTitle(day), kind: "일기", date: day, body });
    return created?.id ?? null;
  };

  const renderRow = (day: string) => (
    <DiaryRow
      key={day}
      day={day}
      entry={dayEntry(day)}
      agenda={agendaForDay(day, agendaEvents, agendaTasks)}
      lines={settings.binderPreviewLines}
      paper={settings.binderPaper}
      writing={writingDay === day}
      onStartWriting={() => startWriting(day)}
      onStopWriting={() => setWritingDay((current) => (current === day ? null : current))}
      onCreateInline={(body) => createInline(day, body)}
      onSaveInline={(id, patch) => update("binder", id, patch)}
      onMoveEntry={(id, nextDay) => void update("binder", id, { date: nextDay })}
      onOpenEntry={(id) => openEntry(id)}
    />
  );

  return (
    /* A41: PC에서도 마지막 줄(토요일 칸 등)이 하단 탭 바에 가리지 않게 넉넉한 아래 여백을 둡니다. */
    <div className="pb-24 md:pb-28">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[calc(13.5px*var(--fs))] text-ink-400">
            {view === "notes"
              ? `노트 ${notes.length}개 · ${formatMonthKo(cursor)}`
              : view === "weekly"
                ? `${weekStart.slice(0, 4)}년 ${isoWeekNumber(weekStart)}주차`
                : `${formatFullKo(cursor)}`}
          </p>
          <h1 className="mt-1.5 text-[calc(20px*var(--fs))] font-semibold leading-none tracking-[-0.02em] text-ink-900 md:text-[calc(21px*var(--fs))]">
            {view === "notes"
              ? "Notes"
              : view === "weekly"
                ? `${weekStart.slice(0, 4)}년 ${isoWeekNumber(weekStart)}주차`
                : `Daily`}
          </h1>
          {view === "weekly" ? <p className="mt-1 text-[calc(14px*var(--fs))] text-ink-400">일기 {diaries.length}편</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="seg-track">
            {(
              [
                { value: "weekly", label: "Weekly" },
                { value: "daily", label: "Daily" },
                { value: "notes", label: "Notes" },
              ] as { value: BinderView; label: string }[]
            ).map((item) => (
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
            <button
              type="button"
              className="icon-btn h-7 w-7"
              onClick={() => setCursor((current) => (view === "weekly" ? addDaysISO(current, -7) : addDaysISO(current, -1)))}
              aria-label="이전"
            >
              <ChevronLeftIcon size={14} />
            </button>
            <button type="button" onClick={() => setCursor(todayISO())} className="px-2 py-1 text-[calc(15px*var(--fs))] font-medium text-ink-700 hover:text-ink-900">
              오늘
            </button>
            <button
              type="button"
              className="icon-btn h-7 w-7"
              onClick={() => setCursor((current) => (view === "weekly" ? addDaysISO(current, 7) : addDaysISO(current, 1)))}
              aria-label="다음"
            >
              <ChevronRightIcon size={14} />
            </button>
          </div>

          {view === "notes" ? null : (
            <div className="seg-track" aria-label="속지 배경">
              {PAPER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSetting("binderPaper", option.value)}
                  aria-pressed={settings.binderPaper === option.value}
                  data-paper-option={option.value}
                  className={cn("seg-item !px-2 !py-0.5 text-[calc(13px*var(--fs))]", settings.binderPaper === option.value && "seg-item-active")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {view === "weekly" ? (
            <button
              type="button"
              onClick={() => setShowWeekSchedule(!showWeekSchedule)}
              className={cn("btn-outline btn-xs", showWeekSchedule && "border-binder-sat/60 bg-white text-binder-sat")}
              aria-expanded={showWeekSchedule}
              aria-controls={showWeekSchedule ? "week-schedule" : undefined}
              data-week-schedule-toggle="true"
            >
              <ListIcon size={12} /> 주간 한눈에
            </button>
          ) : null}
          <button type="button" onClick={() => setSearchOpen(true)} className="icon-btn bg-paper-200 hover:bg-paper-300/70" aria-label="검색">
            <SearchIcon size={15} />
          </button>
          <button type="button" className="btn-primary btn-xs" onClick={() => openNew(cursor, view === "notes" ? "노트" : "일기")}>
            <PlusIcon size={12} /> {view === "notes" ? "새 노트" : "일기"}
          </button>
        </div>
      </div>

      {view === "daily" ? <div className="mt-2 text-[calc(14px*var(--fs))] text-ink-400">{formatFullKo(cursor)}</div> : null}
      {view === "notes" ? <div className="mt-2 text-[calc(14px*var(--fs))] text-ink-400">{formatMonthKo(cursor)}</div> : null}

      {view === "weekly" ? (
        <div
          className={cn(
            "mt-3",
            showWeekSchedule && "lg:grid lg:grid-cols-[minmax(0,1fr)_19.5rem] lg:items-start lg:gap-6",
          )}
          data-week-schedule-layout={showWeekSchedule ? "with-panel" : "spread-only"}
        >
          {showWeekSchedule ? (
            <WeekSchedule
              scope={scheduleScope}
              onScope={setScheduleScope}
              weekStart={weekStart}
              lastWeekStart={lastWeekStart}
              weekStartsOn={settings.weekStartsOn}
              events={settings.nowOnly ? data.calendar.filter((event) => !event.hidden) : data.calendar}
              tasks={settings.nowOnly ? data.projects.filter((task) => !task.hidden) : data.projects}
              onClose={() => setShowWeekSchedule(false)}
              className="mb-5 lg:sticky lg:top-3 lg:order-2 lg:mb-0"
            />
          ) : null}

          <div className="relative grid gap-6 lg:grid-cols-2 lg:gap-0">
            <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-8 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(17,24,39,0.06),transparent)] lg:block" />

            <section className="hidden lg:block lg:pr-8">
              <SpreadHeader label="지난주" start={lastWeekStart} />
              {lastWeekDays.map((day) => renderRow(day))}
            </section>

            <section className="lg:pl-8">
              <SpreadHeader label="이번 주" start={weekStart} />
              {days.map((day) => renderRow(day))}
            </section>
          </div>
        </div>
      ) : null}

      {view === "daily" ? (
        <div className="mt-4">
          <DailyView
            day={cursor}
            entry={dayEntry(cursor)}
            diaries={diaries}
            paper={settings.binderPaper}
            tasks={settings.nowOnly ? data.projects.filter((task) => !task.hidden) : data.projects}
            events={settings.nowOnly ? data.calendar.filter((event) => !event.hidden) : data.calendar}
            showSchedule={settings.binderShowSchedule}
            onOpenEntry={openEntry}
            onCreate={openNew}
            onSave={(id, patch) => update("binder", id, patch)}
            onUpdateField={(patch) => {
              const currentEntry = dayEntry(cursor);
              return currentEntry ? update("binder", currentEntry.id, patch) : undefined;
            }}
            onWriteNote={(date) => openNew(date, "노트")}
          />
        </div>
      ) : null}

      {view === "notes" ? (
        <div className="mt-4">
          <NotesView
            notes={notes}
            month={month}
            onMonth={setMonth}
            onOpen={openEntry}
            onNew={() => openNew(cursor, "노트")}
            onPin={(note) => {
              void update("binder", note.id, { favorite: !note.favorite }, { silent: true }).then((ok) => {
                if (ok) pushToast(note.favorite ? "상단 고정을 해제했습니다" : "맨 위에 고정했습니다");
              });
            }}
            onCreateEntry={async (title, date) => {
              const created = await create("binder", { title, kind: "노트", date, body: "" });
              if (created) openEntry(created.id);
            }}
          />
        </div>
      ) : null}

      <BinderDetail
        open={editorId !== null}
        entryId={editorId}
        onBack={() => setEditorId(null)}
        onCloseDetail={() => {
          setEditorId(null);
          setEditorDraft(null);
        }}
      />

      <BinderEditor
        open={editorDraft !== null}
        draft={editorDraft ?? undefined}
        onClose={() => {
          setEditorId(null);
          setEditorDraft(null);
        }}
      />
    </div>
  );
}

function SpreadHeader({ label, start }: { label: string; start: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-paper-400 pb-2">
      <span className="h-[7px] w-[7px] rounded-full border border-ink-400" />
      <span className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">{label}</span>
      <span className="ml-auto text-[calc(13px*var(--fs))] tabular-nums text-ink-400">
        {formatShort(start)} – {formatShort(addDaysISO(start, 6))}
      </span>
    </div>
  );
}

/** A16: a day's record names itself — 11월 21일 토요일 바인더 — so writing is body-only. */
function autoTitle(day: string): string {
  return diaryTitle(day);
}

/** A title the app wrote itself (or none at all) — safe to replace on the next save. */
function isAutoTitle(title: string | null | undefined, day: string): boolean {
  if (!title) return true;
  return title === `${day} 일기` || title === autoTitle(day);
}

function DiaryRow({
  day,
  entry,
  agenda,
  lines,
  paper,
  writing,
  onStartWriting,
  onStopWriting,
  onCreateInline,
  onSaveInline,
  onMoveEntry,
  onOpenEntry,
}: {
  day: string;
  entry: BinderEntry | null;
  agenda: AgendaItem[];
  lines: number;
  paper: PaperStyle;
  writing: boolean;
  onStartWriting: () => void;
  onStopWriting: () => void;
  onCreateInline: (body: string) => Promise<string | null>;
  onSaveInline: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onMoveEntry: (id: string, nextDay: string) => void;
  onOpenEntry: (id: string) => void;
}) {
  const dnd = useDnd();
  const isToday = isSameISO(day, todayISO());
  const holiday = holidayName(day);
  const dow = new Date(`${day}T12:00:00`).getDay();
  const preview = entry ? previewText(entry.body, Math.max(3, lines)) : [];

  const [text, setText] = useState(entry?.body ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const area = useRef<HTMLTextAreaElement | null>(null);
  const idRef = useRef<string | null>(entry?.id ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  latest.current = text;

  const flush = async (value = latest.current) => {
    const body = value;
    if (!body.trim() && !idRef.current) return;
    setSaved("saving");
    if (!idRef.current) {
      const created = await onCreateInline(body);
      if (created) idRef.current = created;
      setSaved(created ? "saved" : "idle");
      return;
    }
    const patch: Record<string, unknown> = { body };
    // A16: only a title the app wrote is refreshed; one the user typed stays as it is.
    if (isAutoTitle(entry?.title, day)) patch.title = autoTitle(day);
    const ok = await onSaveInline(idRef.current, patch);
    setSaved(ok ? "saved" : "idle");
  };

  /** Another row took the caret: write what is pending before the column changes. */
  useEffect(() => {
    if (writing) {
      setText(entry?.body ?? "");
      idRef.current = entry?.id ?? null;
      const node = area.current;
      if (node) {
        node.focus({ preventScroll: true });
        node.setSelectionRange(node.value.length, node.value.length);
      }
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      void flush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writing]);

  useEffect(() => {
    if (writing) return;
    if (entry?.id === idRef.current) return;
    idRef.current = entry?.id ?? null;
    setText(entry?.body ?? "");
  }, [entry?.id, entry?.body, writing]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const schedule = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush(value);
    }, 900);
  };

  /** A press that becomes a drag moves the record to another day; a plain tap writes. */
  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!entry) return;
    dnd.start(
      event,
      { kind: "binder", id: entry.id, label: entry.title || `${day} 일기` },
      (target) => {
        if (!target || target.zone !== "binder-day") return;
        const nextDay = target.data.day;
        if (!nextDay || nextDay === day) return;
        onMoveEntry(entry.id, nextDay);
      },
      { getHint: (target) => (target.zone === "binder-day" && target.data.day !== day ? `${formatShort(target.data.day ?? day)}로 옮기기` : null) },
    );
  };

  return (
    <div
      data-drop-zone="binder-day"
      data-drop-day={day}
      data-binder-day={day}
      data-binder-weekend={dow === 6 ? "sat" : dow === 0 ? "sun" : undefined}
      /* A42: 토·일 칸은 요일 글자색보다 훨씬 연한 파랑·빨강 틴트로 칠해 주말이 한눈에 보이게. */
      className={cn(
        "group grid border-b border-paper-300 transition-colors",
        dow === 6 && "bg-sky-50/70",
        dow === 0 && "bg-rose-50/70",
        isToday && (dow === 6 ? "bg-sky-100/70" : dow === 0 ? "bg-rose-100/70" : "bg-paper-200/40"),
        writing && "bg-white shadow-[inset_0_0_0_1px_#94a3b8]",
      )}
      style={{ gridTemplateColumns: "3.6rem minmax(0,1fr)" }}
    >
      <button
        type="button"
        onClick={onStartWriting}
        onPointerDown={startDrag}
        className="flex flex-col items-center justify-start gap-0.5 py-2"
        aria-label={`${formatShort(day)} ${weekdayKo(day)}요일 ${entry ? "이어 쓰기" : "쓰기"}`}
        title={entry ? "눌러서 이어 쓰기 · 끌어서 다른 날짜로 옮기기" : "눌러서 바로 쓰기"}
      >
        <span
          className={cn(
            "flex h-9 min-w-9 items-center justify-center rounded-full px-1 text-[calc(26px*var(--fs))] font-semibold leading-none tabular-nums tracking-tight",
            isToday ? "bg-binder-ink text-white" : holiday || dow === 0 ? "text-binder-sun" : dow === 6 ? "text-binder-sat" : "text-binder-ink",
          )}
        >
          {Number(day.slice(8, 10))}
        </span>
        <span
          className={cn(
            "mt-0.5 text-[calc(15px*var(--fs))] font-medium",
            holiday ? "text-binder-sun" : dow === 6 ? "text-binder-sat" : dow === 0 ? "text-binder-sun" : "text-ink-500",
          )}
        >
          {weekdayKo(day)}
        </span>
        {holiday ? (
          <span className="max-w-[3.4rem] break-keep text-center text-[calc(12px*var(--fs))] leading-[1.2] text-binder-sun" title={holiday}>
            {holiday}
          </span>
        ) : null}
      </button>

      <div className="min-w-0 py-1.5 pl-1 pr-2">
        {/* A34: 그날 일정·할 일은 그 칸을 눌러 쓰기 시작했을 때만 입력창 위에 보입니다.
           다른 칸을 누르면 이전 칸은 다시 접고, 바깥을 눌러 포커스를 잃어도 숨깁니다. */}
        {writing ? <DayAgenda day={day} items={agenda} /> : null}

        {writing ? (
          <div className="min-w-0" data-binder-expanded={day}>
            <textarea
              ref={area}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                const node = event.target;
                // A45: 줄 수 제한 없이 쓴 만큼 아래로 계속 늘어납니다.
                node.style.height = "auto";
                node.style.height = `${node.scrollHeight}px`;
                schedule(event.target.value);
              }}
              onBlur={() => {
                if (timer.current) {
                  clearTimeout(timer.current);
                  timer.current = null;
                }
                void flush();
                onStopWriting();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (timer.current) {
                    clearTimeout(timer.current);
                    timer.current = null;
                  }
                  void flush();
                  onStopWriting();
                }
              }}
              rows={15}
              autoFocus
              placeholder="바로 적어 보세요"
              /* A45: 눌러서 쓰는 동안에는 그 칸만 넉넉히(15줄) 펼쳐집니다 — 쓴 만큼 더 늘어나고,
                  닫으면 다시 세 줄 미리보기로 돌아갑니다. */
              style={{ minHeight: "22rem", ...paperBackground(paper) }}
              className="binder-input min-h-[22rem]"
            />
            <div className="mt-1 flex items-center justify-between text-[calc(12px*var(--fs))] text-ink-400">
              <span>{saved === "saving" ? "저장 중…" : saved === "saved" ? "저장됨" : "자동 저장 (잠시 멈추면)"}</span>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onStopWriting}
                className="rounded-full border border-paper-300 px-2 py-0.5 hover:border-ink-400 hover:text-ink-800"
              >
                닫기
              </button>
            </div>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={onStartWriting}
            onPointerDown={startDrag}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onStartWriting();
              }
            }}
            className="min-h-[4.7rem] min-w-0 cursor-text overflow-hidden pb-0.5 pt-1 text-left outline-none focus-visible:bg-paper-200/40"
          >
            {entry ? (
              <>
                {preview.length > 0 ? (
                  <p
                    data-binder-preview
                    className="mt-0.5 line-clamp-3 whitespace-pre-line break-keep text-[calc(14px*var(--fs))] leading-[1.6] text-ink-600"
                  >
                    {truncate(preview.join("\n"), 320)}
                  </p>
                ) : null}
                <span className="mt-1 hidden items-center gap-2 text-[calc(12px*var(--fs))] text-ink-400 group-hover:flex">
                  <span>이어 쓰기</span>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenEntry(entry.id);
                    }}
                    className="underline decoration-paper-400 underline-offset-2 hover:text-ink-800"
                  >
                    자세히
                  </button>
                </span>
              </>
            ) : (
              <span className="flex h-full min-h-[3.8rem] items-center text-[calc(13.5px*var(--fs))] text-ink-400 opacity-0 transition group-hover:opacity-100">
                + 눌러서 바로 쓰기
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A34: 위클리의 한 날짜 칸에 붙는 그날 일정·할 일 줄.
 * 예전에는 모든 칸이 이 줄을 늘 달고 있어서, 주간 스프레드에서 날짜와 쓴 글보다 일정 칩이
 * 먼저 눈에 들어왔습니다. 이제는 그 칸을 눌러 쓰기 시작했을 때만 입력창 위에 붙습니다.
 * 다른 칸을 누르면 그 칸으로 옮겨 가고, 바깥을 눌러 포커스를 잃으면 다시 접힙니다.
 */
function DayAgenda({ day, items }: { day: string; items: AgendaItem[] }) {
  if (items.length === 0) return null;

  return (
    <div data-day-agenda={day} className="mb-1 flex flex-wrap items-center gap-1">
      {items.map((item) => (
        <AgendaChip key={`${item.kind}-${item.id}`} item={item} />
      ))}
    </div>
  );
}

function AgendaChip({ item }: { item: AgendaItem }) {
  const muted = item.done;
  return (
    <span
      data-agenda-item={item.kind}
      title={`${item.kind} · ${item.time ? `${item.time} ` : ""}${item.title}${item.waiting ? " (대기 중)" : ""}${item.dueNote ? ` · ${item.dueNote}` : ""}`}
      className={cn(
        // A31: 이름이 긴 일정도 잘리지 않게 폭을 넉넉히 — 좁은 화면에서는 한 줄을 다 씁니다.
        "flex min-w-0 max-w-full flex-none items-center gap-1 rounded-full border px-1.5 py-px text-[calc(12.5px*var(--fs))] leading-[1.55] sm:max-w-[20rem]",
        item.kind === "일정" ? "border-line-soft bg-white" : "border-paper-200 bg-paper-200/60",
        muted ? "text-ink-400" : "text-ink-700",
      )}
    >
      <span
        className={cn(
          "h-[5px] w-[5px] flex-none rounded-full",
          item.kind === "일정"
            ? item.allDay
              ? "bg-sky-500"
              : "bg-accent-400"
            : item.done
              ? "bg-sage-400"
              : item.waiting
                ? "bg-amber-400"
                : "bg-dusk-500",
        )}
      />
      {item.time ? <span className="flex-none tabular-nums text-ink-500">{item.time}</span> : null}
      <span className={cn("truncate", muted && "line-through")}>{item.title}</span>
      {item.waiting && !item.done ? <span className="flex-none text-amber-700">대기</span> : null}
      {item.dueNote ? <span className="flex-none text-ink-400">{item.dueNote}</span> : null}
    </span>
  );
}

/** A31: 그날의 일정(시각·종일)과 할 일(완료·대기·마감)을 칸에 붙일 순서로 모읍니다. */
function agendaForDay(day: string, events: CalendarEvent[], tasks: ProjectTask[]): AgendaItem[] {
  const dayEvents = events
    .filter((event) => eventCoversDay(event, day))
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        String(a.startTime ?? "99:99").localeCompare(String(b.startTime ?? "99:99")),
    )
    .map<AgendaItem>((event) => ({
      id: event.id,
      kind: "일정",
      title: event.title,
      time: event.allDay ? "종일" : event.startTime ?? "",
      allDay: event.allDay,
      done: event.done || event.canceled,
      waiting: false,
      dueNote: event.canceled ? "취소" : "",
    }));

  const dayTasks = tasksForDay(tasks, day)
    .sort(
      (a, b) =>
        Number(a.status === "완료") - Number(b.status === "완료") ||
        String(a.startTime ?? "99:99").localeCompare(String(b.startTime ?? "99:99")),
    )
    .map<AgendaItem>((task) => ({
      id: task.id,
      kind: "할 일",
      title: task.title,
      time: task.startTime ?? "",
      allDay: false,
      done: task.status === "완료",
      waiting: task.status === "대기 중",
      dueNote: task.date !== day ? "마감" : task.due && task.due !== task.date ? `마감 ${formatShort(task.due)}` : "",
    }));

  return [...dayEvents, ...dayTasks];
}

/**
 * A24: 위클리 바인더를 쓰면서 같은 주의 일정과 할 일을 옆(폰에서는 위)에서 봅니다.
 * 쓰는 칸을 가리지 않도록 화면 위에 띄우지 않고, 접고 펼 수 있는 참고 창으로 둡니다.
 * 날짜마다 일정(시각·종일)과 할 일(완료 여부·대기·마감)을 한눈에 보여 줍니다.
 */
function WeekSchedule({
  scope,
  onScope,
  weekStart,
  lastWeekStart,
  weekStartsOn,
  events,
  tasks,
  onClose,
  className,
}: {
  scope: "current" | "last";
  onScope: (scope: "current" | "last") => void;
  weekStart: string;
  lastWeekStart: string;
  weekStartsOn: 0 | 1;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  onClose: () => void;
  className?: string;
}) {
  const start = scope === "last" ? lastWeekStart : weekStart;
  const days = weekDays(start, weekStartsOn);
  const rows = days.map((day) => ({
    day,
    events: events
      .filter((event) => event.kind === "일정" && !event.trash && eventCoversDay(event, day))
      .sort(
        (a, b) =>
          Number(b.allDay) - Number(a.allDay) ||
          String(a.startTime ?? "99:99").localeCompare(String(b.startTime ?? "99:99")),
      ),
    tasks: tasksForDay(
      tasks.filter((task) => task.kind === "할 일" && !task.trash && task.status !== "취소"),
      day,
    ).sort(
      (a, b) =>
        Number(a.status === "완료") - Number(b.status === "완료") ||
        String(a.startTime ?? "99:99").localeCompare(String(b.startTime ?? "99:99")),
    ),
  }));
  const eventCount = rows.reduce((sum, row) => sum + row.events.length, 0);
  const taskCount = rows.reduce((sum, row) => sum + row.tasks.length, 0);
  const doneCount = rows.reduce((sum, row) => sum + row.tasks.filter((task) => task.status === "완료").length, 0);
  const today = todayISO();

  return (
    <aside
      id="week-schedule"
      aria-label={scope === "last" ? "지난주의 일정과 할 일" : "이번 주의 일정과 할 일"}
      data-week-schedule={scope}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-paper-300 bg-white shadow-soft",
        "max-h-[56vh] lg:max-h-[calc(100dvh-9rem)]",
        className,
      )}
    >
      <div className="flex flex-none items-center gap-2 border-b border-paper-300 px-3.5 py-2">
        <ListIcon size={14} className="flex-none text-ink-500" />
        <p className="text-[calc(14.5px*var(--fs))] font-semibold text-ink-900">일정 · 할 일</p>
        <span className="truncate text-[calc(12.5px*var(--fs))] tabular-nums text-ink-400">
          {formatShort(start)} – {formatShort(addDaysISO(start, 6))}
        </span>
        <button type="button" onClick={onClose} className="icon-btn ml-auto h-6 w-6" aria-label="일정 창 닫기">
          <XIcon size={12} />
        </button>
      </div>

      <div className="flex flex-none flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3.5 py-1.5">
        <div className="seg-track">
          {(
            [
              { value: "current", label: "이번 주" },
              { value: "last", label: "지난주" },
            ] as { value: "current" | "last"; label: string }[]
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onScope(item.value)}
              aria-pressed={scope === item.value}
              data-week-schedule-scope={item.value}
              className={cn("seg-item !px-2 !py-0.5 text-[calc(13px*var(--fs))]", scope === item.value && "seg-item-active")}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="text-[calc(12.5px*var(--fs))] tabular-nums text-ink-500">
          일정 {eventCount} · 할 일 {taskCount}
          {doneCount > 0 ? ` · 완료 ${doneCount}` : ""}
        </span>
      </div>

      <div className="scrollbar-quiet scroll-shadow-y min-h-0 flex-1 overflow-y-auto px-3.5 pb-2">
        {rows.map(({ day, events: dayEvents, tasks: dayTasks }) => {
          const isToday = isSameISO(day, today);
          const dow = new Date(`${day}T12:00:00`).getDay();
          const holiday = holidayName(day);
          const empty = dayEvents.length === 0 && dayTasks.length === 0;
          return (
            <section
              key={day}
              data-week-schedule-day={day}
              className={cn(
                "border-b border-paper-200 py-1.5 last:border-b-0",
                isToday && "-mx-1.5 rounded bg-paper-200/40 px-1.5",
              )}
            >
              <div className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "flex-none text-[calc(13px*var(--fs))] font-semibold tabular-nums",
                    isToday
                      ? "rounded bg-binder-ink px-1 text-white"
                      : holiday || dow === 0
                        ? "text-binder-sun"
                        : dow === 6
                          ? "text-binder-sat"
                          : "text-ink-800",
                  )}
                >
                  {formatShort(day)} {weekdayKo(day)}
                </span>
                {holiday ? <span className="truncate text-[calc(11.5px*var(--fs))] text-binder-sun/80">{holiday}</span> : null}
                {empty ? null : (
                  <span className="ml-auto flex-none text-[calc(11.5px*var(--fs))] tabular-nums text-ink-300">
                    {dayEvents.length > 0 ? `일정 ${dayEvents.length}` : ""}
                    {dayEvents.length > 0 && dayTasks.length > 0 ? " · " : ""}
                    {dayTasks.length > 0 ? `할 일 ${dayTasks.length}` : ""}
                  </span>
                )}
              </div>

              {empty ? <p className="mt-0.5 text-[calc(12.5px*var(--fs))] text-ink-300">예정 없음</p> : null}

              {dayEvents.length > 0 ? (
                <ul className="mt-0.5 space-y-0.5">
                  {dayEvents.map((event) => (
                    <li key={event.id} className="flex items-start gap-1.5 text-[calc(13px*var(--fs))] leading-[1.45]">
                      <span
                        className={cn(
                          "mt-[0.42rem] h-1.5 w-1.5 flex-none rounded-full",
                          event.allDay ? "bg-sky-500" : "bg-accent-400",
                        )}
                      />
                      <span className="w-[2.6rem] flex-none tabular-nums text-ink-500">
                        {event.allDay ? "종일" : event.startTime ?? "—"}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 break-words text-ink-700",
                          (event.canceled || event.done) && "text-ink-400 line-through",
                        )}
                      >
                        {event.title}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {dayTasks.length > 0 ? (
                <ul className="mt-0.5 space-y-0.5">
                  {dayTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-1.5 text-[calc(13px*var(--fs))] leading-[1.45]">
                      <span
                        className={cn(
                          "mt-[0.42rem] h-1.5 w-1.5 flex-none rounded-full",
                          task.status === "완료" ? "bg-sage-400" : task.status === "대기 중" ? "bg-amber-400" : "bg-dusk-500",
                        )}
                      />
                      <span className="w-[2.6rem] flex-none tabular-nums text-ink-500">{task.startTime ?? ""}</span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 break-words text-ink-700",
                          task.status === "완료" && "text-ink-400 line-through",
                        )}
                      >
                        {task.title}
                      </span>
                      {task.status === "대기 중" ? (
                        <span className="flex-none rounded bg-amber-100 px-1 text-[calc(11px*var(--fs))] text-amber-800">대기</span>
                      ) : null}
                      {task.due && task.due !== task.date ? (
                        <span className="flex-none text-[calc(11px*var(--fs))] tabular-nums text-ink-400">마감 {formatShort(task.due)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function DailyView({
  day,
  entry,
  diaries,
  paper,
  tasks,
  events,
  showSchedule,
  onOpenEntry,
  onCreate,
  onSave,
  onUpdateField,
  onWriteNote,
}: {
  day: string;
  entry: BinderEntry | null;
  diaries: BinderEntry[];
  paper: PaperStyle;
  tasks: ProjectTask[];
  events: CalendarEvent[];
  showSchedule: boolean;
  onOpenEntry: (id: string) => void;
  onCreate: (date: string, kind: "일기" | "노트") => void;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onUpdateField: (patch: Record<string, unknown>) => Promise<boolean> | undefined;
  onWriteNote: (date: string) => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [preview, setPreview] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, body, tags });
  const entryId = entry?.id ?? null;
  // A13: the day panel shows every 일정 and 할 일 of that date — nothing is cut at three.
  const dayTasks = tasksForDay(
    tasks.filter((task) => task.kind === "할 일" && !task.trash && task.status !== "취소"),
    day,
  );
  const dayEvents = events
    .filter((event) => event.kind === "일정" && !event.trash && eventCoversDay(event, day))
    .sort((a, b) => (Number(b.allDay) - Number(a.allDay)) || String(a.startTime ?? "99:99").localeCompare(String(b.startTime ?? "99:99")));

  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (loadedId.current === (entry?.id ?? null)) return;
    loadedId.current = entry?.id ?? null;
    setTitle(entry?.title ?? "");
    setBody(entry?.body ?? "");
    setTags(entry?.tags ?? []);
  }, [entry?.id, entry?.title, entry?.body, entry?.tags]);

  useEffect(() => {
    latest.current = { title, body, tags };
  }, [title, body, tags]);

  const flush = () => {
    if (!entryId) return;
    const current = latest.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void onSave(entryId, { title: current.title || `${day} 일기`, body: current.body, tags: current.tags }).then((ok) => {
      if (ok) setSavedAt(Date.now());
    });
  };

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1000);
  };

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [entryId]);

  const prevEntry = diaries.filter((item) => item.date && item.date < day).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
  const holiday = holidayName(day);

  if (!entry) {
    return (
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-paper-300 px-6 py-14 text-center">
          <BookIcon size={26} className="text-ink-300" />
          <p className="mt-3 text-[calc(16px*var(--fs))] font-medium text-ink-900">{formatFullKo(day)}</p>
          <p className="mt-1 text-[calc(15px*var(--fs))] text-ink-500">{holiday ? `${holiday} · ` : ""}아직 기록이 없습니다.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onCreate(day, "일기")} className="btn-primary btn-xs">
              이 날 일기 쓰기
            </button>
            <button type="button" onClick={() => onWriteNote(day)} className="btn-outline btn-xs">
              노트 남기기
            </button>
          </div>
          {prevEntry ? (
            <button type="button" onClick={() => onOpenEntry(prevEntry.id)} className="mt-5 max-w-sm text-left text-[calc(14px*var(--fs))] text-ink-400 hover:text-ink-700">
              지난 기록 · {formatShort(prevEntry.date ?? "")} {prevEntry.title}
            </button>
          ) : null}
        </div>
        {showSchedule ? <DaySchedule events={dayEvents} tasks={dayTasks} /> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
      <div className="overflow-hidden rounded-2xl border border-paper-300">
        <div className="flex items-center justify-between gap-2 border-b border-paper-300 px-4 py-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-paper-200 px-2 py-0.5 text-[calc(14px*var(--fs))] text-ink-600">{entry.kind}</span>
            <span className="text-[calc(13.5px*var(--fs))] text-ink-400">
              {formatFullKo(day)}
              {holiday ? ` · ${holiday}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void onUpdateField({ favorite: !entry.favorite })}
              className={cn("rounded p-1 transition", entry.favorite ? "text-amber-400" : "text-ink-300 hover:text-ink-500")}
              aria-label="즐겨찾기"
            >
              <StarIcon size={15} filled={entry.favorite} />
            </button>
            <button
              type="button"
              onClick={() => setPreview((current) => !current)}
              className={cn("rounded px-1.5 py-0.5 text-[calc(14px*var(--fs))]", preview ? "text-ink-900" : "text-ink-400 hover:text-ink-600")}
            >
              {preview ? "편집" : "미리보기"}
            </button>
            <button type="button" onClick={() => setShowMeta((current) => !current)} className="rounded px-1.5 py-0.5 text-[calc(14px*var(--fs))] text-ink-400 hover:text-ink-600">
              태그
            </button>
          </div>
        </div>

        <div className="px-4 py-3">
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              schedule();
            }}
            onBlur={flush}
            placeholder="오늘의 제목"
            className="w-full border-none bg-transparent px-0 text-[calc(22px*var(--fs))] font-semibold tracking-tight text-ink-900 outline-none placeholder:text-ink-300"
          />

          {showMeta ? (
            <div className="mt-2 space-y-2">
              <TagInput
                tags={tags}
                onChange={(next) => {
                  setTags(next);
                  schedule();
                }}
              />
              <div className="flex flex-wrap gap-1.5 text-[calc(13.5px*var(--fs))] text-ink-400">
                <button type="button" onClick={() => void onUpdateField({ archiveFlag: !entry.archiveFlag })} className="chip border border-paper-300">
                  {entry.archiveFlag ? "아카이브 표시 켜짐" : "아카이브에 표시"}
                </button>
                <span>작성 {entry.createdAt.slice(0, 10)}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-2">
            {preview ? (
              <div className="doc-body min-h-[320px] text-[calc(16px*var(--fs))] text-ink-700">{renderMarkdown(body)}</div>
            ) : (
              <textarea
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  schedule();
                }}
                onBlur={flush}
                placeholder={"# 오늘\n\n있었던 일을 천천히 적어 보세요.\n\n- 기억하고 싶은 장면\n- 내일의 다짐"}
                // A45: 설정한 속지(무지·줄노트·모눈)를 그대로 따릅니다.
                style={{ lineHeight: "28px", ...paperBackground(paper) }}
                className="min-h-[360px] w-full resize-y border-none bg-transparent px-0 py-0 text-[calc(16px*var(--fs))] text-ink-800 outline-none placeholder:text-ink-300"
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-paper-300 pt-2 text-[calc(13.5px*var(--fs))] text-ink-400">
            <span>{body.length.toLocaleString()}자</span>
            <span>
              {savedAt && Date.now() - savedAt < 60_000 ? (
                <span className="inline-flex items-center gap-1 text-sage-500">
                  <CheckIcon size={11} /> 저장됨
                </span>
              ) : (
                "자동 저장 (잠시 멈추면)"
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {showSchedule ? <DaySchedule events={dayEvents} tasks={dayTasks} /> : null}
        <div className="rounded-2xl border border-paper-300 px-4 py-3">
          <h3 className="mb-1.5 text-[calc(14.5px*var(--fs))] text-ink-500">이 날의 다른 기록</h3>
          <div className="space-y-1">
            {diaries
              .filter((item) => item.id !== entry.id && item.date === day)
              .map((item) => (
                <button key={item.id} type="button" onClick={() => onOpenEntry(item.id)} className="block w-full truncate text-left text-[calc(15px*var(--fs))] text-ink-600 hover:text-ink-900">
                  {item.title}
                </button>
              ))}
            {diaries.filter((item) => item.id !== entry.id && item.date === day).length === 0 ? (
              <p className="text-[calc(14px*var(--fs))] text-ink-400">이 날은 이 일기 한 편만 있습니다.</p>
            ) : null}
          </div>
          <button type="button" onClick={() => onWriteNote(day)} className="btn-outline btn-xs mt-2 w-full">
            노트로 남기기
          </button>
        </div>
      </div>
    </div>
  );
}

function DaySchedule({ events, tasks }: { events: CalendarEvent[]; tasks: ProjectTask[] }) {
  const done = tasks.filter((task) => task.status === "완료");
  const rest = tasks.filter((task) => task.status !== "완료" && task.status !== "취소");
  const waiting = rest.filter((task) => task.status === "대기 중");
  const total = events.length + tasks.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-paper-300 px-3.5 py-3">
      <div className="flex flex-none items-baseline justify-between gap-2">
        <h3 className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">이 날의 일정 · 할 일</h3>
        <span className="text-[calc(13px*var(--fs))] tabular-nums text-ink-500">
          일정 {events.length} · 할 일 {tasks.length}
        </span>
      </div>

      {total === 0 ? <p className="mt-1 text-[calc(14px*var(--fs))] text-ink-500">예정된 일이 없습니다.</p> : null}

      <div className="mt-1.5 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {events.length > 0 ? (
          <section>
            <p className="mb-1 text-[calc(12.5px*var(--fs))] font-medium uppercase tracking-wide text-ink-500">일정</p>
            <ul className="space-y-1">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-1.5 text-[calc(14.5px*var(--fs))] leading-snug text-ink-700">
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 flex-none rounded-full",
                      event.allDay ? "bg-sky-500" : "bg-accent-400",
                    )}
                  />
                  <span className="w-[4.6rem] flex-none text-[calc(13.5px*var(--fs))] tabular-nums text-ink-600">
                    {event.allDay ? "종일" : event.startTime ?? "시간 없음"}
                  </span>
                  <span className={cn("min-w-0 flex-1 break-words", (event.canceled || event.done) && "text-ink-400 line-through")}>
                    {event.title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {rest.length + done.length > 0 ? (
          <section>
            <p className="mb-1 text-[calc(12.5px*var(--fs))] font-medium uppercase tracking-wide text-ink-500">할 일</p>
            <ul className="space-y-1">
              {[...rest, ...done].map((task) => (
                <li key={task.id} className="flex items-start gap-1.5 text-[calc(14.5px*var(--fs))] leading-snug">
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 flex-none rounded-full",
                      task.status === "완료" ? "bg-sage-400" : task.status === "대기 중" ? "bg-amber-400" : "bg-dusk-500",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 break-words text-ink-700",
                      task.status === "완료" && "text-ink-400 line-through",
                    )}
                  >
                    {task.title}
                  </span>
                  {task.status === "대기 중" ? (
                    <span className="flex-none rounded bg-amber-100 px-1 text-[calc(12px*var(--fs))] text-amber-800">대기</span>
                  ) : null}
                  {task.due && task.due !== task.date ? (
                    <span className="flex-none text-[calc(12.5px*var(--fs))] tabular-nums text-ink-500">마감 {formatShort(task.due)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {done.length > 0 ? (
              <p className="mt-1 flex items-center gap-1 text-[calc(12.5px*var(--fs))] text-sage-500">
                <CheckIcon size={11} /> 완료 {done.length} · 대기 {waiting.length}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function NotesView({
  notes,
  month,
  onMonth,
  onOpen,
  onNew,
  onPin,
}: {
  notes: BinderEntry[];
  month: string;
  onMonth: (month: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** A45: 상단 고정핀 — 노션 `즐겨찾기` 속성에 저장됩니다. */
  onPin: (note: BinderEntry) => void;
  onCreateEntry: (title: string, date: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const filtered = notes
    .filter((note) => (month === "all" ? true : (note.date ?? "").slice(0, 7) === month))
    .filter((note) => (query.trim() ? `${note.title} ${note.body}`.toLowerCase().includes(query.trim().toLowerCase()) : true))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(event) => onMonth(event.target.value)} className="input w-auto py-1.5 text-[calc(15px*var(--fs))]">
          <option value="all">전체 기간</option>
          {monthOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="노트 검색"
          className="input w-auto min-w-[9rem] flex-1 py-1.5 text-[calc(15px*var(--fs))] sm:max-w-[16rem]"
        />
        <span className="ml-auto text-[calc(13.5px*var(--fs))] text-ink-400">{filtered.length}개</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookIcon size={22} />}
          title="이 달의 노트가 없습니다"
          description="회의 메모, 아이디어, 읽은 것을 짧게 남겨 두세요."
          action={
            <button type="button" onClick={onNew} className="btn-outline btn-xs">
              <PlusIcon size={12} /> 새 노트
            </button>
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((note) => {
            const lines = previewText(note.body, 3);
            return (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                data-note-card={note.id}
                onClick={() => onOpen(note.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(note.id);
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col rounded-2xl border px-3.5 py-3 text-left transition hover:border-paper-400",
                  note.favorite ? "border-ink-900/25 bg-paper-100/60" : "border-paper-300",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-[calc(15.5px*var(--fs))] font-medium text-ink-900">{note.title}</p>
                  <button
                    type="button"
                    data-note-pin={note.id}
                    aria-pressed={note.favorite}
                    aria-label={note.favorite ? `${note.title} 상단 고정 해제` : `${note.title} 상단 고정`}
                    title={note.favorite ? "상단 고정 해제" : "상단 고정"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPin(note);
                    }}
                    className={cn(
                      "flex h-6 w-6 flex-none items-center justify-center rounded-full transition",
                      note.favorite ? "bg-ink-900 text-white" : "text-ink-300 hover:bg-paper-200 hover:text-ink-700",
                    )}
                  >
                    <PinIcon size={12} filled={note.favorite} />
                  </button>
                </div>
                <p className="mt-0.5 text-[calc(13.5px*var(--fs))] text-ink-400">
                  {note.date ? `${formatShort(note.date)} ${weekdayKo(note.date)}` : "날짜 없음"}
                  {note.tags.length > 0 ? ` · ${note.tags.map((tag) => `#${tag}`).join(" ")}` : ""}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {lines.length === 0 ? (
                    <p className="text-[calc(14px*var(--fs))] text-ink-300">내용 없음</p>
                  ) : (
                    lines.map((line, index) => (
                      <p key={index} className="line-clamp-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-500">
                        {line}
                      </p>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
