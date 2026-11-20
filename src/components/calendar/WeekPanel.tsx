"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, ProjectTask } from "@/lib/types";
import { addDaysISO, formatShort, toISO, todayISO, weekKeyOf } from "@/lib/date";
import { cn } from "@/lib/utils";
import { CheckIcon } from "@/components/icons";
import { MiniMonth } from "@/components/calendar/MiniMonth";

interface WeekPanelProps {
  weekStart: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  onCreateGoal: (kind: "주간 목표" | "주간 메모") => void;
  onCreateFavorite: (title: string) => void;
  /** Creates this week's memo (title from the real writing day) and returns its id. */
  onCreateMemo: () => Promise<string | null>;
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

export function WeekPanel({
  weekStart,
  events,
  tasks,
  onCreateGoal,
  onCreateFavorite,
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
  const [memoDraft, setMemoDraft] = useState<string | null>(null);
  const [favoriteDraft, setFavoriteDraft] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);

  useEffect(() => {
    setSelectedMemoId(null);
    setMemoDraft(null);
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
    onCreateFavorite(title);
    setFavoriteDraft("");
  };

  const createMemo = async () => {
    setSavingMemo(true);
    try {
      const id = await onCreateMemo();
      if (id) {
        setSelectedMemoId(id);
        setMemoDraft(null);
      }
    } finally {
      setSavingMemo(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <MiniMonth cursor={todayISO()} weekStart={weekStart} marks={marks} onPick={onPickDay} onMonth={onMonth} />

      <section className="border-t border-paper-300 pt-4">
        <header className="flex items-center justify-between">
          <h3 className="text-[0.92rem] font-semibold text-ink-900">이번 주 꼭</h3>
        </header>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-ink-400">
          제목만 넣으면 <b className="font-semibold text-ink-600">긴급·중요·별표</b>가 함께 켜져요. 받은함으로 옮겨도 이번 주에는 계속
          보입니다.
        </p>

        {favorites.length === 0 ? (
          <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-300">아직 없습니다. 아래에 제목만 적고 Enter를 누르세요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-paper-300/60">
            {favorites.slice(0, 8).map(({ kind, item }) => {
              const done = kind === "event" ? (item as CalendarEvent).done : (item as ProjectTask).status === "완료";
              const date = kind === "event" ? (item as CalendarEvent).date : ((item as ProjectTask).due ?? (item as ProjectTask).date);
              return (
                <li key={`${kind}-${item.id}`} className="flex items-center gap-2 py-[7px]">
                  <button
                    type="button"
                    onClick={() => (kind === "event" ? onToggleEventDone(item as CalendarEvent) : onToggleTask(item as ProjectTask))}
                    aria-label="완료"
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
                      "min-w-0 flex-1 truncate text-left text-[0.76rem] text-ink-700",
                      done && "text-ink-400 line-through",
                    )}
                  >
                    {item.title}
                  </button>
                  {date ? (
                    <span className="flex-none text-[0.66rem] tabular-nums text-ink-400">
                      {formatShort(date)} {["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T12:00:00`).getDay()]}
                    </span>
                  ) : (
                    <span className="flex-none text-[0.62rem] text-ink-300">받은함</span>
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
          className="mt-2"
        >
          <input
            value={favoriteDraft}
            onChange={(event) => setFavoriteDraft(event.target.value)}
            placeholder="+ 이번 주 꼭 (Enter)"
            className="w-full rounded-lg border border-transparent bg-paper-200/70 px-2.5 py-1.5 text-[0.76rem] text-ink-900 placeholder:text-ink-400 focus:border-paper-400 focus:bg-white focus:outline-none"
          />
        </form>
      </section>

      <section className="border-t border-paper-300 pt-4">
        <header className="flex items-center justify-between">
          <h3 className="text-[0.92rem] font-semibold text-ink-900">이번 주 목표</h3>
          <span className="text-[0.66rem] text-ink-400">
            {goals.filter((goal) => goal.done).length}/{goals.length}
          </span>
        </header>
        <ul className="mt-2 space-y-1">
          {goals.map((goal) => (
            <li key={goal.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleEventDone(goal)}
                className={cn(
                  "flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full border transition",
                  goal.done ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 hover:border-ink-500",
                )}
              >
                {goal.done ? <CheckIcon size={9} /> : null}
              </button>
              <button
                type="button"
                onClick={() => onOpenEvent(goal.id)}
                className={cn("min-w-0 flex-1 truncate text-left text-[0.76rem] text-ink-700", goal.done && "text-ink-400 line-through")}
              >
                {goal.title}
              </button>
            </li>
          ))}
          {goals.length === 0 ? <li className="text-[0.7rem] text-ink-400">이번 주 목표를 정해 보세요.</li> : null}
        </ul>
        <button
          type="button"
          onClick={() => onCreateGoal("주간 목표")}
          className="mt-1.5 text-[0.7rem] text-ink-400 transition hover:text-ink-700"
        >
          + 목표 추가
        </button>
      </section>

      <section className="border-t border-paper-300 pt-4">
        <header className="flex items-center justify-between gap-2">
          <h3 className="text-[0.92rem] font-semibold text-ink-900">주간 메모</h3>
          {memos.length > 0 ? <span className="text-[0.64rem] text-ink-400">이전 메모 {memos.length}개</span> : null}
        </header>

        {memos.length > 0 ? (
          <select
            value={activeMemo?.id ?? ""}
            onChange={(event) => {
              setSelectedMemoId(event.target.value || null);
              setMemoDraft(null);
            }}
            aria-label="주간 메모 기록 선택"
            className="mt-2 w-full rounded-lg border border-paper-300 bg-white px-2 py-1.5 text-[0.72rem] text-ink-700 focus:border-paper-400 focus:outline-none"
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

        {activeMemo ? (
          <>
            <textarea
              key={activeMemo.id}
              value={memoDraft ?? activeMemo.memo}
              onChange={(event) => setMemoDraft(event.target.value)}
              onBlur={() => {
                if (memoDraft !== null && memoDraft !== activeMemo.memo) {
                  onUpdateEvent(activeMemo.id, { memo: memoDraft });
                }
                setMemoDraft(null);
              }}
              placeholder="이번 주에 남기고 싶은 생각"
              className="mt-1.5 min-h-[7.5rem] w-full resize-none rounded-xl border border-transparent bg-paper-200/70 px-3 py-2 text-[0.76rem] leading-relaxed text-ink-700 outline-none transition focus:border-paper-400 focus:bg-white"
            />
            <p className="mt-1 text-[0.64rem] text-ink-300">
              {activeMemo.id === currentMemo?.id ? activeMemo.title : `${memoWeekStart(activeMemo)} 주의 기록 · 읽기·수정 가능`}
            </p>
            {!currentMemo ? (
              <button
                type="button"
                onClick={() => void createMemo()}
                disabled={savingMemo}
                className="mt-1 text-[0.68rem] text-ink-400 transition hover:text-ink-700 disabled:opacity-50"
              >
                + 이번 주 메모 쓰기
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={() => void createMemo()}
            disabled={savingMemo}
            className="mt-2 w-full rounded-xl border border-dashed border-paper-300 px-3 py-6 text-left text-[0.72rem] text-ink-400 transition hover:border-ink-300 hover:text-ink-600 disabled:opacity-50"
          >
            + 이번 주 메모 남기기
          </button>
        )}
      </section>
    </div>
  );
}
