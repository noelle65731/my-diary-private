"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, ProjectTask } from "@/lib/types";
import { addDaysISO, formatShort, timeRangeLabel, toISO, todayISO, weekKeyOf } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useAutoHideScrollbar } from "@/lib/use-auto-hide-scroll";
import { ArrowUpRightIcon, CheckIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { MiniMonth } from "@/components/calendar/MiniMonth";

interface WeekPanelProps {
  weekStart: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  /** A10: a goal is written and edited right here — no separate window. */
  onCreateGoal: (title: string) => Promise<void> | void;
  /** A29: 엔터로 더한 항목은 목록에 쌓입니다 — 저장이 끝날 때까지 기다립니다. */
  onCreateFavorite: (title: string) => Promise<void> | void;
  /** A29: 목표 줄에서 바로 휴지통으로 보냅니다(휴지통 보기에서 복원 가능). */
  onDeleteGoal: (goal: CalendarEvent) => void;
  /** Creates this week's memo (title from the real writing day) with its first text. */
  onCreateMemo: (text: string) => Promise<string | null>;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleEventDone: (event: CalendarEvent) => void;
  onToggleTask: (task: ProjectTask) => void;
  onUpdateEvent: (id: string, patch: Record<string, unknown>) => void;
  onPickDay: (day: string) => void;
  onMonth: (direction: number) => void;
}

/** The week a memo belongs to: its `주간 키` / 작성 기준일, else the date it sits on. */
function memoWeekStart(event: CalendarEvent): string {
  if (event.baseDate) return event.baseDate;
  if (event.date) return event.date;
  return "";
}

/**
 * A10: one title that edits where it stands. A click turns the text into an input;
 * leaving the field — Tab, another click, a switch to another tab — keeps the change,
 * and a field that was only read (nothing typed) never writes to Notion.
 */
function InlineTitle({
  value,
  onSave,
  done,
  className,
  editLabel,
}: {
  value: string;
  onSave: (next: string) => void;
  done?: boolean;
  className?: string;
  editLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        aria-label={editLabel}
        className="min-w-0 flex-1 rounded-md border border-paper-400 bg-white px-1.5 py-0.5 text-[calc(15px*var(--fs))] text-ink-800 outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={editLabel}
      title="눌러서 바로 고치기"
      className={cn(
        "group/title flex min-w-0 flex-1 items-center gap-1 text-left text-[calc(15px*var(--fs))] text-ink-700",
        done && "text-ink-400 line-through",
        className,
      )}
    >
      <span className="min-w-0 truncate">{value}</span>
      <PencilIcon size={9} className="flex-none text-ink-200 transition group-hover/title:text-ink-400" />
    </button>
  );
}

/**
 * A10: this week's memo is a field on the week screen itself. Typing and leaving writes
 * once; opening it and leaving without a keystroke writes nothing.
 */
function MemoBox({
  initial,
  placeholder,
  onCommit,
}: {
  initial: string;
  placeholder: string;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(initial);

  useEffect(() => {
    setText(initial);
  }, [initial]);

  return (
    <textarea
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== initial) onCommit(text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setText(initial);
          (event.target as HTMLTextAreaElement).blur();
        }
      }}
      placeholder={placeholder}
      aria-label="이번 주 메모"
      className="mt-1.5 min-h-[4.5rem] w-full flex-1 resize-none rounded-xl border border-transparent bg-paper-200/70 px-2.5 py-1.5 text-[calc(14.5px*var(--fs))] leading-snug text-ink-700 outline-none transition focus:border-paper-400 focus:bg-white"
    />
  );
}

export function WeekPanel({
  weekStart,
  events,
  tasks,
  onCreateGoal,
  onCreateFavorite,
  onDeleteGoal,
  onCreateMemo,
  onOpenEvent,
  onOpenTask,
  onToggleEventDone,
  onToggleTask,
  onUpdateEvent,
  onPickDay,
  onMonth,
}: WeekPanelProps) {
  const weekEnd = addDaysISO(weekStart, 6);
  const weekKey = weekKeyOf(weekStart);
  const inWeek = (date: string | null) => !!date && date >= weekStart && date <= weekEnd;
  const visible = <T extends { hidden: boolean; trash: boolean }>(item: T) => !item.trash && !item.hidden;
  const createdOn = (iso: string) => {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? "" : toISO(parsed);
  };

  const favorites = [
    ...events.filter((event) => event.favorite && visible(event)).map((event) => ({ kind: "event" as const, item: event })),
    ...tasks.filter((task) => task.favorite && visible(task)).map((task) => ({ kind: "task" as const, item: task })),
  ].filter(({ kind, item }) => {
    const date = kind === "event" ? (item as CalendarEvent).date : (item as ProjectTask).date;
    const due = kind === "task" ? (item as ProjectTask).due : null;
    if (inWeek(date) || inWeek(due)) return true;
    // A title-only '이번 주 꼭' has no date yet; it keeps its place in this week after
    // being moved to the inbox, because it was written this week.
    if (kind === "task" && !date && !due) {
      const created = createdOn((item as ProjectTask).createdAt);
      return !!created && created >= weekStart && created <= weekEnd;
    }
    return false;
  });

  const goals = events.filter(
    (event) => event.kind === "주간 목표" && visible(event) && (event.weekKey === weekKey || inWeek(event.date)),
  );

  /** A8: every weekly memo, newest week first — the current week's sits on top. */
  const memos = useMemo(
    () =>
      events
        .filter((event) => event.kind === "주간 메모" && !event.trash && !event.hidden)
        .sort((a, b) => memoWeekStart(b).localeCompare(memoWeekStart(a)) || String(b.createdAt).localeCompare(String(a.createdAt))),
    [events],
  );
  const currentMemo = memos.find((event) => event.weekKey === weekKey || inWeek(event.date)) ?? null;
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [favoriteDraft, setFavoriteDraft] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  /** A29: 같은 제목을 연달아 두 번 보내도 한 번만 저장하도록 저장 중인 제목을 기억합니다. */
  const pendingFavorites = useRef<Set<string>>(new Set());
  /** A29: 항목이 늘어나도 패널 높이는 그대로 — 목록만 스크롤되고 스크롤바는 움직일 때만 보입니다. */
  const favoriteBar = useAutoHideScrollbar();

  useEffect(() => {
    setSelectedMemoId(null);
    setGoalDraft("");
  }, [weekStart]);

  const activeMemo = (selectedMemoId ? memos.find((event) => event.id === selectedMemoId) : null) ?? currentMemo ?? null;

  const marks: Record<string, boolean> = {};
  for (const event of events) {
    if (event.trash) continue;
    if (event.date) marks[event.date] = true;
  }
  for (const task of tasks) {
    if (task.trash) continue;
    if (task.date) marks[task.date] = true;
    if (task.due) marks[task.due] = true;
  }

  const addFavorite = () => {
    const title = favoriteDraft.trim();
    if (!title) return;
    // A29: 저장 중인 같은 제목은 다시 보내지 않습니다(엔터 두 번·연타 방지).
    if (pendingFavorites.current.has(title)) return;
    pendingFavorites.current.add(title);
    setFavoriteDraft("");
    void Promise.resolve(onCreateFavorite(title)).finally(() => pendingFavorites.current.delete(title));
  };

  const addGoal = async () => {
    const title = goalDraft.trim();
    if (!title || goalBusy) return;
    setGoalBusy(true);
    setGoalDraft("");
    try {
      await onCreateGoal(title);
    } finally {
      setGoalBusy(false);
    }
  };

  const commitMemo = async (text: string) => {
    if (activeMemo) {
      onUpdateEvent(activeMemo.id, { memo: text });
      return;
    }
    if (!text.trim()) return;
    setSavingMemo(true);
    try {
      const id = await onCreateMemo(text);
      if (id) setSelectedMemoId(id);
    } finally {
      setSavingMemo(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <MiniMonth cursor={todayISO()} weekStart={weekStart} marks={marks} onPick={onPickDay} onMonth={onMonth} />

      <section className="border-t border-paper-300 pt-2.5">
        <header className="flex items-center justify-between">
          <h3 className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">이번 주 꼭</h3>
        </header>
        <p className="mt-0.5 text-[calc(13px*var(--fs))] leading-snug text-ink-400">
          이번 주에 놓치면 안 되는 일
        </p>

        {favorites.length === 0 ? (
          <p className="mt-1 text-[calc(13.5px*var(--fs))] leading-snug text-ink-300">아직 없습니다.</p>
        ) : (
          <ul
            onScroll={favoriteBar.onScroll}
            className={cn(
              "mt-1.5 max-h-[188px] divide-y divide-paper-300/60 overflow-y-auto overscroll-contain",
              favoriteBar.className,
            )}
            data-week-favorites
          >
            {favorites.map(({ kind, item }) => {
              const done = kind === "event" ? (item as CalendarEvent).done : (item as ProjectTask).status === "완료";
              const date = kind === "event" ? (item as CalendarEvent).date : ((item as ProjectTask).due ?? (item as ProjectTask).date);
              const time =
                kind === "task" && date && date === (item as ProjectTask).date
                  ? timeRangeLabel((item as ProjectTask).startTime, (item as ProjectTask).endTime)
                  : "";
              return (
                <li key={`${kind}-${item.id}`} className="flex items-center gap-2 py-[3px]">
                  <button
                    type="button"
                    onClick={() => (kind === "event" ? onToggleEventDone(item as CalendarEvent) : onToggleTask(item as ProjectTask))}
                    aria-label={done ? "완료 해제" : "완료"}
                    className={cn(
                      "flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full border transition",
                      done ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 hover:border-ink-500",
                    )}
                  >
                    {done ? <CheckIcon size={9} /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => (kind === "event" ? onOpenEvent(item.id) : onOpenTask(item.id))}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-[calc(14.5px*var(--fs))] leading-[1.3] text-ink-700",
                      done && "text-ink-400 line-through",
                    )}
                  >
                    {item.title}
                  </button>
                  {date ? (
                    <span className="flex-none text-[calc(13px*var(--fs))] tabular-nums text-ink-400">
                      {formatShort(date)} {["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T12:00:00`).getDay()]}
                      {time ? ` ${time}` : ""}
                    </span>
                  ) : (
                    <span className="flex-none text-[calc(13px*var(--fs))] text-ink-300">index</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            addFavorite();
          }}
          className="mt-1.5"
        >
          <input
            value={favoriteDraft}
            onChange={(event) => setFavoriteDraft(event.target.value)}
            placeholder="+ 이번 주 꼭 (Enter)"
            className="w-full rounded-lg border border-transparent bg-paper-200/70 px-2.5 py-1 text-[calc(14.5px*var(--fs))] text-ink-900 placeholder:text-ink-400 focus:border-paper-400 focus:bg-white focus:outline-none"
          />
        </form>
      </section>

      <section className="border-t border-paper-300 pt-2.5">
        <header className="flex items-center justify-between">
          <h3 className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">이번 주 목표</h3>
          <span className="text-[calc(13.5px*var(--fs))] text-ink-400">
            {goals.filter((goal) => goal.done).length}/{goals.length}
          </span>
        </header>
        <ul className="mt-1.5 space-y-[3px]">
          {goals.map((goal) => (
            <li key={goal.id} className="group/goal flex items-center gap-2 leading-[1.3]">
              <button
                type="button"
                onClick={() => onToggleEventDone(goal)}
                aria-label={goal.done ? "목표 완료 해제" : "목표 완료"}
                className={cn(
                  "flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full border transition",
                  goal.done ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 hover:border-ink-500",
                )}
              >
                {goal.done ? <CheckIcon size={9} /> : null}
              </button>
              <InlineTitle
                value={goal.title}
                done={goal.done}
                editLabel="목표 고치기"
                onSave={(next) => onUpdateEvent(goal.id, { title: next })}
              />
              <button
                type="button"
                onClick={() => onOpenEvent(goal.id)}
                aria-label={`${goal.title} 상세 열기`}
                title="상세 열기"
                className="flex-none rounded p-[3px] text-ink-400 opacity-100 transition hover:bg-paper-200 hover:text-ink-800 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/goal:opacity-100 sm:focus-visible:opacity-100"
              >
                <ArrowUpRightIcon size={13} />
              </button>
              <button
                type="button"
                onClick={() => onDeleteGoal(goal)}
                aria-label={`${goal.title} 삭제`}
                title="삭제 (휴지통으로 보내기)"
                className="flex-none rounded p-[3px] text-ink-400 opacity-100 transition hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/goal:opacity-100 sm:focus-visible:opacity-100"
              >
                <TrashIcon size={13} />
              </button>
            </li>
          ))}
          {goals.length === 0 ? <li className="text-[calc(14px*var(--fs))] text-ink-400">아직 없습니다.</li> : null}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addGoal();
          }}
          className="mt-1.5"
        >
          <input
            value={goalDraft}
            onChange={(event) => setGoalDraft(event.target.value)}
            onBlur={() => {
              if (goalDraft.trim()) void addGoal();
            }}
            placeholder="+ 목표 추가 (Enter)"
            aria-label="주간 목표 추가"
            disabled={goalBusy}
            className="w-full rounded-lg border border-transparent bg-paper-200/70 px-2.5 py-1 text-[calc(14.5px*var(--fs))] text-ink-900 placeholder:text-ink-400 focus:border-paper-400 focus:bg-white focus:outline-none disabled:opacity-60"
          />
        </form>
      </section>

      <section className="flex min-h-0 flex-1 flex-col border-t border-paper-300 pt-2.5">
        <header className="flex items-center justify-between gap-2">
          <h3 className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">주간 메모</h3>
          {memos.length > 0 ? <span className="text-[calc(13.5px*var(--fs))] text-ink-400">이전 메모 {memos.length}개</span> : null}
        </header>

        {memos.length > 0 ? (
          <select
            value={activeMemo?.id ?? ""}
            onChange={(event) => setSelectedMemoId(event.target.value || null)}
            aria-label="주간 메모 기록 선택"
            className="mt-1.5 w-full rounded-lg border border-paper-300 bg-white px-2 py-1 text-[calc(14px*var(--fs))] text-ink-700 focus:border-paper-400 focus:outline-none"
          >
            {!currentMemo ? <option value="">이번 주 메모 없음</option> : null}
            {memos.map((memo) => (
              <option key={memo.id} value={memo.id}>
                {memo.title || `${memoWeekStart(memo)} 주간 메모`}
                {memo.id === currentMemo?.id ? " (이번 주)" : ""}
              </option>
            ))}
          </select>
        ) : null}

        <MemoBox
          key={`${activeMemo?.id ?? "new"}-${weekKey}`}
          initial={activeMemo?.memo ?? ""}
          placeholder={savingMemo ? "저장 중…" : ""}
          onCommit={(text) => void commitMemo(text)}
        />
      </section>
    </div>
  );
}
