"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import {
  addDaysISO,
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
import { useDnd, isAfterTarget } from "@/components/common/dnd";
import { applySortValues, reorderSortValues, sortByStoredOrder } from "@/lib/order";
import type { BinderEntry, ProjectTask } from "@/lib/types";
import { previewText, renderMarkdown } from "@/lib/markdown";
import { BookIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon, StarIcon } from "@/components/icons";
import { EmptyState } from "@/components/common/primitives";
import { TagInput } from "@/components/editors/shared";
import { BinderEditor } from "@/components/editors/BinderEditor";
import { BinderDetail } from "@/components/detail/BinderDetail";
import { tasksForDay } from "@/components/calendar/calendar-utils";

type BinderView = "weekly" | "daily" | "notes";

export function BinderTab() {
  const { data, update, create } = useData();
  const { start } = useDnd();
  const { settings } = useSettings();
  const { focus, clearFocus, pendingBinderDate, consumeBinderDate, setSearchOpen } = useUi();

  const [view, setView] = useState<BinderView>("weekly");
  const [cursor, setCursor] = useState(todayISO());
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<{ date?: string; kind?: "일기" | "노트" } | null>(null);

  const diaries = useMemo(() => data.binder.filter((entry) => entry.kind === "일기" && !entry.trash), [data.binder]);
  const notes = useMemo(() => data.binder.filter((entry) => entry.kind === "노트" && !entry.trash), [data.binder]);

  useTabReset("binder", () => {
    setView("weekly");
    setCursor(todayISO());
    setEditorId(null);
    setEditorDraft(null);
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

  /** Diary moved to another day (weekly spread). */
  const handleDiaryDrag = (entry: BinderEntry) => (pointerEvent: React.PointerEvent<HTMLElement>) => {
    start(
      pointerEvent,
      { kind: "binder", id: entry.id, label: entry.title },
      (target) => {
        if (!target || target.zone !== "binder-day") return;
        const date = target.data.date;
        if (!date || date === entry.date) return;
        void update("binder", entry.id, { date });
      },
      {
        getHint: (target) =>
          target.zone === "binder-day" && target.data.date
            ? `${formatShort(target.data.date)} ${weekdayKo(target.data.date)}로 옮기기`
            : null,
      },
    );
  };

  /** Notes reordered by hand. */
  const handleNoteDrag = (note: BinderEntry, list: BinderEntry[]) => (pointerEvent: React.PointerEvent<HTMLElement>) => {
    start(
      pointerEvent,
      { kind: "note", id: note.id, label: note.title },
      (target, point) => {
        if (!target || target.zone !== "binder-note") return;
        const targetId = target.data.id;
        if (!targetId || targetId === note.id) return;
        const index = list.findIndex((item) => item.id === targetId);
        if (index === -1) return;
        const after = Math.abs(point.x - (target.rect.left + target.rect.width / 2)) > Math.abs(point.y - (target.rect.top + target.rect.height / 2))
          ? point.x > target.rect.left + target.rect.width / 2
          : isAfterTarget(target, point.y);
        const insert = index + (after ? 1 : 0);
        applySortValues(update, "binder", list, reorderSortValues(list, note.id, insert));
      },
      { getHint: () => "노트 순서 바꾸기" },
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[0.66rem] text-ink-400">
            {view === "notes"
              ? `노트 ${notes.length}개 · ${formatMonthKo(cursor)}`
              : view === "weekly"
                ? `${weekStart.slice(0, 4)}년 ${isoWeekNumber(weekStart)}주차`
                : `${formatFullKo(cursor)}`}
          </p>
          <h1 className="mt-1.5 text-[1.95rem] font-semibold leading-none tracking-[-0.035em] text-ink-900 md:text-[2.3rem]">
            {view === "notes"
              ? "Notes"
              : view === "weekly"
                ? `${weekStart.slice(0, 4)}년 ${isoWeekNumber(weekStart)}주차`
                : `Daily`}
          </h1>
          {view === "weekly" ? <p className="mt-1 text-[0.72rem] text-ink-400">일기 {diaries.length}편</p> : null}
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
            <button type="button" onClick={() => setCursor(todayISO())} className="px-2 py-1 text-[0.76rem] font-medium text-ink-700 hover:text-ink-900">
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

      {view === "daily" ? <div className="mt-2 text-[0.72rem] text-ink-400">{formatFullKo(cursor)}</div> : null}
      {view === "notes" ? <div className="mt-2 text-[0.72rem] text-ink-400">{formatMonthKo(cursor)}</div> : null}

      {view === "weekly" ? (
        <div className="relative mt-4 grid gap-6 lg:grid-cols-2 lg:gap-0">
          <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-8 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(17,24,39,0.04),transparent)] lg:block" />

          <section className="hidden lg:block lg:pr-8">
            <SpreadHeader label="지난주" start={lastWeekStart} />
            {lastWeekDays.map((day) => (
              <DiaryRow
                key={day}
                day={day}
                entry={dayEntry(day)}
                lines={settings.binderPreviewLines}
                onOpen={() => (dayEntry(day) ? openEntry(dayEntry(day)!.id) : openNew(day))}
                onDrag={dayEntry(day) ? handleDiaryDrag(dayEntry(day)!) : undefined}
              />
            ))}
          </section>

          <section className="lg:pl-8">
            <SpreadHeader label="이번 주" start={weekStart} />
            {days.map((day) => (
              <DiaryRow
                key={day}
                day={day}
                entry={dayEntry(day)}
                lines={settings.binderPreviewLines}
                onOpen={() => (dayEntry(day) ? openEntry(dayEntry(day)!.id) : openNew(day))}
                onDrag={dayEntry(day) ? handleDiaryDrag(dayEntry(day)!) : undefined}
              />
            ))}
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
            onDrag={handleNoteDrag}
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
    <div className="flex items-center gap-2 border-b border-paper-300 pb-2">
      <span className="h-[7px] w-[7px] rounded-full border border-ink-400" />
      <span className="text-[0.8rem] font-medium text-ink-800">{label}</span>
      <span className="ml-auto text-[0.68rem] tabular-nums text-ink-400">
        {formatShort(start)} – {formatShort(addDaysISO(start, 6))}
      </span>
    </div>
  );
}

function DiaryRow({
  day,
  entry,
  lines,
  onOpen,
  onDrag,
}: {
  day: string;
  entry: BinderEntry | null;
  lines: number;
  onOpen: () => void;
  onDrag?: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  const isToday = isSameISO(day, todayISO());
  const holiday = holidayName(day);
  const dow = new Date(`${day}T12:00:00`).getDay();
  const preview = entry ? previewText(entry.body, Math.max(1, lines)) : [];
  const bodyLines = entry ? preview.filter((line) => line !== entry.title).slice(0, Math.max(1, lines - 1)) : [];

  return (
    <div
      data-drop-zone="binder-day"
      data-drop-date={day}
      className="grid border-b border-paper-300/70"
      style={{ gridTemplateColumns: "3.8rem minmax(0,1fr)" }}
    >
      <div className="py-2 text-center">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "mx-auto flex h-11 min-w-11 items-center justify-center rounded-full px-1 text-[1.7rem] font-semibold leading-none tabular-nums transition",
            isToday
              ? "bg-ink-900 text-white"
              : holiday || dow === 0
                ? "text-red-500"
                : dow === 6
                  ? "text-blue-600"
                  : "text-ink-800",
          )}
        >
          {Number(day.slice(8, 10))}
        </button>
        <p className={cn("mt-0.5 text-[0.58rem]", holiday ? "text-red-500" : dow === 6 ? "text-blue-500" : dow === 0 ? "text-red-400" : "text-ink-400")}>
          {weekdayKo(day)}
        </p>
        {holiday ? (
          <p className="mx-auto mt-0.5 max-w-[2.7rem] break-keep text-[0.5rem] leading-[1.15] text-red-500" title={holiday}>
            {holiday}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        data-drag-source={entry ? "binder" : undefined}
        onPointerDown={onDrag}
        onClick={onOpen}
        className={cn("min-h-[5.4rem] min-w-0 overflow-hidden py-2.5 pl-3 text-left", entry && "cursor-grab")}
        style={entry ? { touchAction: "pan-y", WebkitTouchCallout: "none" } : undefined}
      >
        {entry ? (
          <>
            <p className="line-clamp-1 text-[0.86rem] font-medium text-ink-900">{entry.title}</p>
            <div className="mt-1 space-y-0.5">
              {bodyLines.map((line, index) => (
                <p key={index} className="line-clamp-1 text-[0.74rem] leading-[1.4] text-ink-500">
                  {truncate(line, 60)}
                </p>
              ))}
            </div>
          </>
        ) : null}
      </button>
    </div>
  );
}

function DailyView({
  day,
  entry,
  diaries,
  tasks,
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
  const schedules = tasksForDay(tasks.filter((task) => task.kind === "할 일" && !task.trash), day);

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
          <p className="mt-3 text-[1rem] font-medium text-ink-900">{formatFullKo(day)}</p>
          <p className="mt-1 text-[0.76rem] text-ink-500">{holiday ? `${holiday} · ` : ""}아직 기록이 없습니다.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onCreate(day, "일기")} className="btn-primary btn-xs">
              이 날 일기 쓰기
            </button>
            <button type="button" onClick={() => onWriteNote(day)} className="btn-outline btn-xs">
              노트 남기기
            </button>
          </div>
          {prevEntry ? (
            <button type="button" onClick={() => onOpenEntry(prevEntry.id)} className="mt-5 max-w-sm text-left text-[0.72rem] text-ink-400 hover:text-ink-700">
              지난 기록 · {formatShort(prevEntry.date ?? "")} {prevEntry.title}
            </button>
          ) : null}
        </div>
        {showSchedule ? <DaySchedule tasks={schedules} /> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
      <div className="overflow-hidden rounded-2xl border border-paper-300">
        <div className="flex items-center justify-between gap-2 border-b border-paper-300 px-4 py-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-paper-200 px-2 py-0.5 text-[0.68rem] text-ink-600">{entry.kind}</span>
            <span className="text-[0.66rem] text-ink-400">
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
              className={cn("rounded px-1.5 py-0.5 text-[0.68rem]", preview ? "text-ink-900" : "text-ink-400 hover:text-ink-600")}
            >
              {preview ? "편집" : "미리보기"}
            </button>
            <button type="button" onClick={() => setShowMeta((current) => !current)} className="rounded px-1.5 py-0.5 text-[0.68rem] text-ink-400 hover:text-ink-600">
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
            className="w-full border-none bg-transparent px-0 text-[1.24rem] font-semibold tracking-tight text-ink-900 outline-none placeholder:text-ink-300"
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
              <div className="flex flex-wrap gap-1.5 text-[0.66rem] text-ink-400">
                <button type="button" onClick={() => void onUpdateField({ archiveFlag: !entry.archiveFlag })} className="chip border border-paper-300">
                  {entry.archiveFlag ? "아카이브 표시 켜짐" : "아카이브에 표시"}
                </button>
                <span>작성 {entry.createdAt.slice(0, 10)}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-2">
            {preview ? (
              <div className="doc-body min-h-[320px] text-[0.92rem] text-ink-700">{renderMarkdown(body)}</div>
            ) : (
              <textarea
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  schedule();
                }}
                onBlur={flush}
                placeholder={"# 오늘\n\n있었던 일을 천천히 적어 보세요.\n\n- 기억하고 싶은 장면\n- 내일의 다짐"}
                className="min-h-[360px] w-full resize-y border-none bg-transparent px-0 py-1 text-[0.92rem] leading-[1.85] text-ink-800 outline-none placeholder:text-ink-300"
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-paper-300 pt-2 text-[0.64rem] text-ink-400">
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
        {showSchedule ? <DaySchedule tasks={schedules} /> : null}
        <div className="rounded-2xl border border-paper-300 px-4 py-3">
          <h3 className="mb-1.5 text-[0.74rem] text-ink-500">이 날의 다른 기록</h3>
          <div className="space-y-1">
            {diaries
              .filter((item) => item.id !== entry.id && item.date === day)
              .map((item) => (
                <button key={item.id} type="button" onClick={() => onOpenEntry(item.id)} className="block w-full truncate text-left text-[0.76rem] text-ink-600 hover:text-ink-900">
                  {item.title}
                </button>
              ))}
            {diaries.filter((item) => item.id !== entry.id && item.date === day).length === 0 ? (
              <p className="text-[0.72rem] text-ink-400">이 날은 이 일기 한 편만 있습니다.</p>
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

function DaySchedule({ tasks }: { tasks: ProjectTask[] }) {
  const done = tasks.filter((task) => task.status === "완료");
  const rest = tasks.filter((task) => task.status !== "완료" && task.status !== "취소");
  return (
    <div className="rounded-2xl border border-paper-300 px-4 py-3">
      <h3 className="text-[0.76rem] font-medium text-ink-800">이 날의 일정 · 할 일</h3>
      {tasks.length === 0 ? (
        <p className="mt-1 text-[0.72rem] text-ink-400">예정된 일이 없습니다.</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {rest.map((task) => (
            <li key={task.id} className="flex items-start gap-1.5 text-[0.74rem] text-ink-700">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-accent-300" />
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 ? (
        <div className="mt-2 border-t border-paper-300/60 pt-1.5">
          <p className="mb-1 flex items-center gap-1 text-[0.62rem] text-sage-500">
            <CheckIcon size={11} /> 완료 {done.length}
          </p>
          <ul className="space-y-0.5">
            {done.map((task) => (
              <li key={task.id} className="truncate text-[0.72rem] text-ink-400 line-through">
                {task.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NotesView({
  notes,
  month,
  onMonth,
  onOpen,
  onNew,
  onDrag,
}: {
  notes: BinderEntry[];
  month: string;
  onMonth: (month: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDrag: (note: BinderEntry, list: BinderEntry[]) => (event: React.PointerEvent<HTMLElement>) => void;
  onCreateEntry: (title: string, date: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const filtered = sortByStoredOrder(
    notes.filter((note) => (month === "all" ? true : (note.date ?? "").slice(0, 7) === month)),
  )
    .filter((note) => (query.trim() ? `${note.title} ${note.body}`.toLowerCase().includes(query.trim().toLowerCase()) : true))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(event) => onMonth(event.target.value)} className="input w-auto py-1.5 text-[0.78rem]">
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
          className="input w-auto min-w-[9rem] flex-1 py-1.5 text-[0.78rem] sm:max-w-[16rem]"
        />
        <span className="ml-auto text-[0.66rem] text-ink-400">{filtered.length}개</span>
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
                data-drop-zone="binder-note"
                data-drop-id={note.id}
                data-drag-source="note"
                onPointerDown={onDrag(note, filtered)}
                onClick={() => onOpen(note.id)}
                className="flex cursor-grab flex-col rounded-2xl border border-paper-300 px-3.5 py-3 text-left transition hover:border-paper-400"
                style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-[0.86rem] font-medium text-ink-900">{note.title}</p>
                  {note.favorite ? <StarIcon size={13} filled className="flex-none text-amber-400" /> : null}
                </div>
                <p className="mt-0.5 text-[0.64rem] text-ink-400">
                  {note.date ? `${formatShort(note.date)} ${weekdayKo(note.date)}` : "날짜 없음"}
                  {note.tags.length > 0 ? ` · ${note.tags.map((tag) => `#${tag}`).join(" ")}` : ""}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {lines.length === 0 ? (
                    <p className="text-[0.72rem] text-ink-300">내용 없음</p>
                  ) : (
                    lines.map((line, index) => (
                      <p key={index} className="line-clamp-1 text-[0.72rem] leading-relaxed text-ink-500">
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
