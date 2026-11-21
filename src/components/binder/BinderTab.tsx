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
import { BookIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon, StarIcon } from "@/components/icons";
import { EmptyState } from "@/components/common/primitives";
import { TagInput } from "@/components/editors/shared";
import { BinderEditor } from "@/components/editors/BinderEditor";
import { BinderDetail } from "@/components/detail/BinderDetail";
import { eventCoversDay, tasksForDay } from "@/components/calendar/calendar-utils";
import type { CalendarEvent } from "@/lib/types";
import { useDnd } from "@/components/common/dnd";

type BinderView = "weekly" | "daily" | "notes";

export function BinderTab() {
  const { data, update, create } = useData();
  const { settings } = useSettings();
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
      lines={settings.binderPreviewLines}
      writing={writingDay === day}
      onStartWriting={() => setWritingDay(day)}
      onStopWriting={() => setWritingDay((current) => (current === day ? null : current))}
      onCreateInline={(body) => createInline(day, body)}
      onSaveInline={(id, patch) => update("binder", id, patch)}
      onMoveEntry={(id, nextDay) => void update("binder", id, { date: nextDay })}
      onOpenEntry={(id) => openEntry(id)}
    />
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[13.5px] text-ink-400">
            {view === "notes"
              ? `노트 ${notes.length}개 · ${formatMonthKo(cursor)}`
              : view === "weekly"
                ? `${weekStart.slice(0, 4)}년 ${isoWeekNumber(weekStart)}주차`
                : `${formatFullKo(cursor)}`}
          </p>
          <h1 className="mt-1.5 text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink-900 md:text-[21px]">
            {view === "notes"
              ? "Notes"
              : view === "weekly"
                ? `${weekStart.slice(0, 4)}년 ${isoWeekNumber(weekStart)}주차`
                : `Daily`}
          </h1>
          {view === "weekly" ? <p className="mt-1 text-[14px] text-ink-400">일기 {diaries.length}편</p> : null}
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
            <button type="button" onClick={() => setCursor(todayISO())} className="px-2 py-1 text-[15px] font-medium text-ink-700 hover:text-ink-900">
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

          <button type="button" onClick={() => setSearchOpen(true)} className="icon-btn bg-paper-200 hover:bg-paper-300/70" aria-label="검색">
            <SearchIcon size={15} />
          </button>
          <button type="button" className="btn-primary btn-xs" onClick={() => openNew(cursor, view === "notes" ? "노트" : "일기")}>
            <PlusIcon size={12} /> {view === "notes" ? "새 노트" : "일기"}
          </button>
        </div>
      </div>

      {view === "daily" ? <div className="mt-2 text-[14px] text-ink-400">{formatFullKo(cursor)}</div> : null}
      {view === "notes" ? <div className="mt-2 text-[14px] text-ink-400">{formatMonthKo(cursor)}</div> : null}

      {view === "weekly" ? (
        <div className="relative mt-3 grid gap-6 lg:grid-cols-2 lg:gap-0">
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
      ) : null}

      {view === "daily" ? (
        <div className="mt-4">
          <DailyView
            day={cursor}
            entry={dayEntry(cursor)}
            diaries={diaries}
            tasks={data.projects}
            events={data.calendar}
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
        onCloseAll={() => {
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
      <span className="text-[15px] font-semibold text-ink-900">{label}</span>
      <span className="ml-auto text-[13px] tabular-nums text-ink-400">
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
  lines,
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
  lines: number;
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
  const preview = entry ? previewText(entry.body, Math.max(1, lines)) : [];

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
      className={cn(
        "group grid border-b border-paper-300 transition-colors",
        isToday && "bg-paper-200/40",
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
            "flex h-9 min-w-9 items-center justify-center rounded-full px-1 text-[26px] font-semibold leading-none tabular-nums tracking-tight",
            isToday ? "bg-ink-900 text-white" : holiday || dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-600" : "text-ink-900",
          )}
        >
          {Number(day.slice(8, 10))}
        </span>
        <span
          className={cn(
            "mt-0.5 text-[15px] font-medium",
            holiday ? "text-red-500" : dow === 6 ? "text-blue-500" : dow === 0 ? "text-red-400" : "text-ink-500",
          )}
        >
          {weekdayKo(day)}
        </span>
        {holiday ? (
          <span className="max-w-[3.4rem] break-keep text-center text-[12px] leading-[1.2] text-red-500" title={holiday}>
            {holiday}
          </span>
        ) : null}
      </button>

      {writing ? (
        <div className="min-w-0 py-2.5 pl-1">
          <textarea
            ref={area}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              const node = event.target;
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
            rows={3}
            autoFocus
            placeholder="바로 적어 보세요"
            className="binder-input min-h-[4.4rem]"
          />
          <div className="mt-1 flex items-center justify-between text-[12px] text-ink-400">
            <span>{saved === "saving" ? "저장 중…" : saved === "saved" ? "저장됨" : "자동 저장 (잠시 멈추면)"}</span>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onStopWriting}
              className="hover:text-ink-800"
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
          className="min-h-[4.7rem] min-w-0 cursor-text overflow-hidden py-2 pl-1 pr-2 text-left outline-none focus-visible:bg-paper-200/40"
        >
          {entry ? (
            <>
              {preview.map((line, index) => (
                <p key={index} className="mt-0.5 line-clamp-1 text-[14px] leading-[1.6] text-ink-600">
                  {truncate(line, 90)}
                </p>
              ))}
              <span className="mt-1 hidden items-center gap-2 text-[12px] text-ink-400 group-hover:flex">
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
            <span className="flex h-full min-h-[3.8rem] items-center text-[13.5px] text-ink-400 opacity-0 transition group-hover:opacity-100">
              + 눌러서 바로 쓰기
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function DailyView({
  day,
  entry,
  diaries,
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
          <p className="mt-3 text-[16px] font-medium text-ink-900">{formatFullKo(day)}</p>
          <p className="mt-1 text-[15px] text-ink-500">{holiday ? `${holiday} · ` : ""}아직 기록이 없습니다.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onCreate(day, "일기")} className="btn-primary btn-xs">
              이 날 일기 쓰기
            </button>
            <button type="button" onClick={() => onWriteNote(day)} className="btn-outline btn-xs">
              노트 남기기
            </button>
          </div>
          {prevEntry ? (
            <button type="button" onClick={() => onOpenEntry(prevEntry.id)} className="mt-5 max-w-sm text-left text-[14px] text-ink-400 hover:text-ink-700">
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
            <span className="rounded-full bg-paper-200 px-2 py-0.5 text-[14px] text-ink-600">{entry.kind}</span>
            <span className="text-[13.5px] text-ink-400">
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
              className={cn("rounded px-1.5 py-0.5 text-[14px]", preview ? "text-ink-900" : "text-ink-400 hover:text-ink-600")}
            >
              {preview ? "편집" : "미리보기"}
            </button>
            <button type="button" onClick={() => setShowMeta((current) => !current)} className="rounded px-1.5 py-0.5 text-[14px] text-ink-400 hover:text-ink-600">
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
            className="w-full border-none bg-transparent px-0 text-[22px] font-semibold tracking-tight text-ink-900 outline-none placeholder:text-ink-300"
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
              <div className="flex flex-wrap gap-1.5 text-[13.5px] text-ink-400">
                <button type="button" onClick={() => void onUpdateField({ archiveFlag: !entry.archiveFlag })} className="chip border border-paper-300">
                  {entry.archiveFlag ? "아카이브 표시 켜짐" : "아카이브에 표시"}
                </button>
                <span>작성 {entry.createdAt.slice(0, 10)}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-2">
            {preview ? (
              <div className="doc-body min-h-[320px] text-[16px] text-ink-700">{renderMarkdown(body)}</div>
            ) : (
              <textarea
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  schedule();
                }}
                onBlur={flush}
                placeholder={"# 오늘\n\n있었던 일을 천천히 적어 보세요.\n\n- 기억하고 싶은 장면\n- 내일의 다짐"}
                // A10: the ruled line sits exactly at the bottom of each 26px text row, so
                // many lines of writing never get covered by it.
                style={{
                  lineHeight: "26px",
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #eef0f3 25px, #eef0f3 26px)",
                  backgroundAttachment: "local",
                  backgroundPosition: "0 1px",
                }}
                className="min-h-[360px] w-full resize-y border-none bg-transparent px-0 py-0 text-[16px] text-ink-800 outline-none placeholder:text-ink-300"
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-paper-300 pt-2 text-[13.5px] text-ink-400">
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
          <h3 className="mb-1.5 text-[14.5px] text-ink-500">이 날의 다른 기록</h3>
          <div className="space-y-1">
            {diaries
              .filter((item) => item.id !== entry.id && item.date === day)
              .map((item) => (
                <button key={item.id} type="button" onClick={() => onOpenEntry(item.id)} className="block w-full truncate text-left text-[15px] text-ink-600 hover:text-ink-900">
                  {item.title}
                </button>
              ))}
            {diaries.filter((item) => item.id !== entry.id && item.date === day).length === 0 ? (
              <p className="text-[14px] text-ink-400">이 날은 이 일기 한 편만 있습니다.</p>
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
        <h3 className="text-[15px] font-semibold text-ink-900">이 날의 일정 · 할 일</h3>
        <span className="text-[13px] tabular-nums text-ink-500">
          일정 {events.length} · 할 일 {tasks.length}
        </span>
      </div>

      {total === 0 ? <p className="mt-1 text-[14px] text-ink-500">예정된 일이 없습니다.</p> : null}

      <div className="mt-1.5 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {events.length > 0 ? (
          <section>
            <p className="mb-1 text-[12.5px] font-medium uppercase tracking-wide text-ink-500">일정</p>
            <ul className="space-y-1">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-1.5 text-[14.5px] leading-snug text-ink-700">
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 flex-none rounded-full",
                      event.allDay ? "bg-sky-500" : "bg-accent-400",
                    )}
                  />
                  <span className="w-[4.6rem] flex-none text-[13.5px] tabular-nums text-ink-600">
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
            <p className="mb-1 text-[12.5px] font-medium uppercase tracking-wide text-ink-500">할 일</p>
            <ul className="space-y-1">
              {[...rest, ...done].map((task) => (
                <li key={task.id} className="flex items-start gap-1.5 text-[14.5px] leading-snug">
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
                    <span className="flex-none rounded bg-amber-100 px-1 text-[12px] text-amber-800">대기</span>
                  ) : null}
                  {task.due && task.due !== task.date ? (
                    <span className="flex-none text-[12.5px] tabular-nums text-ink-500">마감 {formatShort(task.due)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {done.length > 0 ? (
              <p className="mt-1 flex items-center gap-1 text-[12.5px] text-sage-500">
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
}: {
  notes: BinderEntry[];
  month: string;
  onMonth: (month: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onCreateEntry: (title: string, date: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const filtered = notes
    .filter((note) => (month === "all" ? true : (note.date ?? "").slice(0, 7) === month))
    .filter((note) => (query.trim() ? `${note.title} ${note.body}`.toLowerCase().includes(query.trim().toLowerCase()) : true))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(event) => onMonth(event.target.value)} className="input w-auto py-1.5 text-[15px]">
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
          className="input w-auto min-w-[9rem] flex-1 py-1.5 text-[15px] sm:max-w-[16rem]"
        />
        <span className="ml-auto text-[13.5px] text-ink-400">{filtered.length}개</span>
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
              <button
                key={note.id}
                type="button"
                onClick={() => onOpen(note.id)}
                className="flex flex-col rounded-2xl border border-paper-300 px-3.5 py-3 text-left transition hover:border-paper-400"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-[15.5px] font-medium text-ink-900">{note.title}</p>
                  {note.favorite ? <StarIcon size={13} filled className="flex-none text-amber-400" /> : null}
                </div>
                <p className="mt-0.5 text-[13.5px] text-ink-400">
                  {note.date ? `${formatShort(note.date)} ${weekdayKo(note.date)}` : "날짜 없음"}
                  {note.tags.length > 0 ? ` · ${note.tags.map((tag) => `#${tag}`).join(" ")}` : ""}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {lines.length === 0 ? (
                    <p className="text-[14px] text-ink-300">내용 없음</p>
                  ) : (
                    lines.map((line, index) => (
                      <p key={index} className="line-clamp-1 text-[14px] leading-relaxed text-ink-500">
                        {line}
                      </p>
                    ))
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
