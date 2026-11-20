"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import {
  addDaysISO,
  addMonthsISO,
  formatFullKo,
  formatMonthKo,
  formatShort,
  isSameISO,
  monthOptions,
  startOfWeekISO,
  todayISO,
  weekDays,
  weekdayKo,
} from "@/lib/date";
import { holidayName, isRedDay } from "@/lib/holidays";
import { cn, truncate } from "@/lib/utils";
import type { BinderEntry, ProjectTask } from "@/lib/types";
import { previewText, renderMarkdown } from "@/lib/markdown";
import {
  BookIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
} from "@/components/icons";
import { EmptyState, Segmented } from "@/components/common/primitives";
import { TagInput } from "@/components/editors/shared";
import { BinderEditor } from "@/components/editors/BinderEditor";
import { tasksForDay } from "@/components/calendar/calendar-utils";

type BinderView = "weekly" | "daily" | "notes";

export function BinderTab() {
  const { data, update, create } = useData();
  const { settings } = useSettings();
  const { focus, clearFocus, pendingBinderDate, consumeBinderDate } = useUi();

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
  const dayEntry = (day: string) => diaries.find((entry) => entry.date === day) ?? null;

  const openNew = (date: string, kind: "일기" | "노트" = "일기") => {
    setEditorDraft({ date, kind });
    setEditorId(null);
  };

  const openEntry = (id: string) => {
    setEditorId(id);
    setEditorDraft(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented<BinderView>
          value={view}
          onChange={setView}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "daily", label: "Daily" },
            { value: "notes", label: "Notes" },
          ]}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="icon-btn h-8 w-8"
            onClick={() => setCursor((current) => (view === "weekly" ? addDaysISO(current, -7) : addDaysISO(current, -1)))}
            aria-label="이전"
          >
            <ChevronLeftIcon size={16} />
          </button>
          <button type="button" className="btn-outline btn-xs" onClick={() => setCursor(todayISO())}>
            오늘
          </button>
          <button
            type="button"
            className="icon-btn h-8 w-8"
            onClick={() => setCursor((current) => (view === "weekly" ? addDaysISO(current, 7) : addDaysISO(current, 1)))}
            aria-label="다음"
          >
            <ChevronRightIcon size={16} />
          </button>
          <button type="button" className="btn-primary btn-xs ml-1" onClick={() => openNew(view === "notes" ? cursor : cursor, view === "notes" ? "노트" : "일기")}>
            <PlusIcon size={13} /> {view === "notes" ? "새 노트" : "일기"}
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between px-0.5">
        <p className="serif text-[0.95rem] text-ink-800">
          {view === "weekly"
            ? `${formatShort(weekStart)} – ${formatShort(addDaysISO(weekStart, 6))}`
            : view === "daily"
              ? formatFullKo(cursor)
              : formatMonthKo(cursor)}
        </p>
        <p className="text-[0.64rem] text-ink-400">
          {view === "notes" ? `노트 ${notes.length}개` : `일기 ${diaries.length}편`}
        </p>
      </div>

      {view === "weekly" ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((day) => {
            const entry = dayEntry(day);
            const lines = entry ? previewText(entry.body, settings.binderPreviewLines) : [];
            const holiday = holidayName(day);
            const isToday = isSameISO(day, todayISO());
            const weekend = isRedDay(day);
            return (
              <div
                key={day}
                className={cn(
                  "flex min-h-[9.5rem] flex-col rounded-2xl border bg-[#fffdfa]/85 px-2.5 py-2 transition hover:shadow-soft",
                  isToday ? "border-accent-300 ring-1 ring-accent-100" : "border-paper-300/80",
                )}
              >
                <button type="button" onClick={() => setCursor(day)} className="flex items-baseline justify-between gap-1 text-left">
                  <span className={cn("text-[0.68rem]", weekend ? "text-accent-500" : "text-ink-400")}>{weekdayKo(day)}</span>
                  <span
                    className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[0.84rem] font-medium tabular-nums",
                      isToday ? "bg-ink-900 text-paper-50" : weekend ? "text-accent-600" : "text-ink-800",
                    )}
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                </button>
                {holiday ? <p className="mt-0.5 truncate text-[0.56rem] text-accent-500">{holiday}</p> : null}

                <button
                  type="button"
                  onClick={() => (entry ? openEntry(entry.id) : openNew(day))}
                  className="mt-1 flex flex-1 flex-col items-start gap-0.5 text-left"
                >
                  {entry ? (
                    <>
                      <p className="w-full truncate text-[0.72rem] font-medium text-ink-800">{entry.title}</p>
                      {lines.length === 0 ? (
                        <p className="text-[0.64rem] text-ink-400">내용 없음</p>
                      ) : (
                        lines.map((line, index) => (
                          <p key={index} className="line-clamp-1 w-full text-[0.64rem] leading-[1.5] text-ink-500">
                            {truncate(line, 46)}
                          </p>
                        ))
                      )}
                      {entry.favorite ? <StarIcon size={11} filled className="mt-0.5 text-amber-400" /> : null}
                    </>
                  ) : (
                    <span className="mt-1 flex items-center gap-1 text-[0.64rem] text-ink-300">
                      <PencilIcon size={11} /> 비어 있음
                    </span>
                  )}
                </button>

                <div className="mt-1 flex items-center justify-between border-t border-paper-300/50 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCursor(day);
                      setView("daily");
                    }}
                    className="text-[0.6rem] text-ink-400 hover:text-ink-700"
                  >
                    하루 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => (entry ? openEntry(entry.id) : openNew(day))}
                    className="text-[0.6rem] text-ink-400 hover:text-ink-700"
                  >
                    {entry ? "고치기" : "쓰기"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "daily" ? (
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
      ) : null}

      {view === "notes" ? (
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
      ) : null}

      <BinderEditor
        open={editorId !== null || editorDraft !== null}
        entryId={editorId}
        draft={editorDraft ?? undefined}
        onClose={() => {
          setEditorId(null);
          setEditorDraft(null);
        }}
      />
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
        <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
          <BookIcon size={30} className="text-ink-300" />
          <p className="serif mt-3 text-[1.05rem] text-ink-800">{formatFullKo(day)}</p>
          <p className="mt-1 text-[0.76rem] text-ink-500">
            {holiday ? `${holiday} · ` : ""}아직 기록이 없습니다.
          </p>
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
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-paper-300/70 px-4 py-2">
          <div className="flex items-center gap-1.5">
            <span className="chip bg-paper-200 text-ink-600">{entry.kind}</span>
            <span className="text-[0.66rem] text-ink-400">{formatFullKo(day)}{holiday ? ` · ${holiday}` : ""}</span>
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
              className={cn("rounded px-1.5 py-0.5 text-[0.66rem]", preview ? "text-accent-600" : "text-ink-400 hover:text-ink-600")}
            >
              {preview ? "편집" : "미리보기"}
            </button>
            <button
              type="button"
              onClick={() => setShowMeta((current) => !current)}
              className="rounded px-1.5 py-0.5 text-[0.66rem] text-ink-400 hover:text-ink-600"
            >
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
            className="serif w-full border-none bg-transparent px-0 text-[1.24rem] font-semibold text-ink-900 outline-none placeholder:text-ink-300"
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

          <div className="flex items-center justify-between border-t border-paper-300/60 pt-2 text-[0.64rem] text-ink-400">
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
        <div className="card px-4 py-3">
          <h3 className="section-title mb-1.5">이 날의 다른 기록</h3>
          <div className="space-y-1">
            {diaries
              .filter((item) => item.id !== entry.id && item.date === day)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenEntry(item.id)}
                  className="block w-full truncate text-left text-[0.76rem] text-ink-600 hover:text-ink-900"
                >
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
  const [open, setOpen] = useState(true);
  const done = tasks.filter((task) => task.status === "완료");
  const rest = tasks.filter((task) => task.status !== "완료" && task.status !== "취소");
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
      >
        <h3 className="section-title">이 날의 일정 · 할 일</h3>
        <ChevronDownIcon size={14} className={cn("text-ink-400 transition", !open && "-rotate-90")} />
      </button>
      {open ? (
        <div className="border-t border-paper-300/60 px-4 py-2">
          {tasks.length === 0 ? (
            <p className="text-[0.74rem] text-ink-400">예정된 일이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {rest.map((task) => (
                <li key={task.id} className="flex items-start gap-1.5 text-[0.74rem] text-ink-700">
                  <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-accent-300" />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  {task.due ? <span className="text-[0.6rem] text-ink-400">마감</span> : null}
                </li>
              ))}
            </ul>
          )}
          {done.length > 0 ? (
            <div className="mt-2 border-t border-paper-300/50 pt-1.5">
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((note) => {
            const lines = previewText(note.body, 3);
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpen(note.id)}
                className="card flex flex-col px-3.5 py-3 text-left transition hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-[0.88rem] font-medium text-ink-900">{note.title}</p>
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
