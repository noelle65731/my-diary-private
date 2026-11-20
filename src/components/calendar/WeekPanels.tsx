"use client";

import { useState } from "react";
import type { CalendarEvent, ProjectTask } from "@/lib/types";
import { addDaysISO, formatShort, weekKeyOf } from "@/lib/date";
import { cn } from "@/lib/utils";
import { categoryTone } from "@/components/common/tone";
import { CheckIcon, PlusIcon, StarIcon } from "@/components/icons";

interface WeekPanelsProps {
  weekStart: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  hiddenIncluded: boolean;
  onCreateWeeklyGoal: (kind: "주간 목표" | "주간 메모") => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleEventDone: (event: CalendarEvent) => void;
  onToggleTask: (task: ProjectTask) => void;
  onUpdateEvent: (id: string, patch: Record<string, unknown>) => void;
}

export function WeekPanels({
  weekStart,
  events,
  tasks,
  hiddenIncluded,
  onCreateWeeklyGoal,
  onOpenEvent,
  onOpenTask,
  onToggleEventDone,
  onToggleTask,
  onUpdateEvent,
}: WeekPanelsProps) {
  const weekEnd = addDaysISO(weekStart, 6);
  const weekKey = weekKeyOf(weekStart);
  const inWeek = (date: string | null) => !!date && date >= weekStart && date <= weekEnd;
  const visible = <T extends { hidden: boolean; trash: boolean }>(item: T) => !item.trash && (hiddenIncluded || !item.hidden);

  const favorites = [
    ...events.filter((event) => event.favorite && visible(event)).map((event) => ({ kind: "event" as const, item: event })),
    ...tasks.filter((task) => task.favorite && visible(task)).map((task) => ({ kind: "task" as const, item: task })),
  ].filter(({ item }) => inWeek((item as CalendarEvent).date ?? (item as ProjectTask).date) || inWeek((item as ProjectTask).due ?? null));

  const goals = events.filter((event) => event.kind === "주간 목표" && visible(event) && (event.weekKey === weekKey || inWeek(event.date)));
  const memos = events.filter((event) => event.kind === "주간 메모" && visible(event) && (event.weekKey === weekKey || inWeek(event.date)));
  const memo = memos[0] ?? null;
  const [memoDraft, setMemoDraft] = useState<string | null>(null);

  const completedGoals = goals.filter((goal) => goal.done).length;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <section className="card px-3.5 py-3">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="section-title flex items-center gap-1">
            <StarIcon size={12} className="text-amber-400" /> 이번 주 꼭
          </h3>
          <span className="text-[0.62rem] text-ink-400">{favorites.length}</span>
        </header>
        {favorites.length === 0 ? (
          <p className="text-[0.72rem] leading-relaxed text-ink-400">일정이나 할 일을 열어 '이번 주 꼭'을 켜 두면 여기에 모입니다.</p>
        ) : (
          <ul className="space-y-1">
            {favorites.slice(0, 5).map(({ kind, item }) =>
              kind === "event" ? (
                <li key={item.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleEventDone(item as CalendarEvent)}
                    className={cn(
                      "flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border",
                      (item as CalendarEvent).done ? "border-sage-400 bg-sage-400 text-white" : "border-paper-400",
                    )}
                  >
                    {(item as CalendarEvent).done ? <CheckIcon size={9} /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEvent(item.id)}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-[0.77rem] text-ink-700",
                      (item as CalendarEvent).done && "text-ink-400 line-through",
                    )}
                  >
                    {item.title}
                  </button>
                  <span className={cn("h-1.5 w-1.5 flex-none rounded-full", categoryTone((item as CalendarEvent).category).dot)} />
                </li>
              ) : (
                <li key={item.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleTask(item as ProjectTask)}
                    className={cn(
                      "flex h-3.5 w-3.5 flex-none items-center justify-center rounded-[3px] border",
                      (item as ProjectTask).status === "완료" ? "border-sage-400 bg-sage-400 text-white" : "border-paper-400",
                    )}
                  >
                    {(item as ProjectTask).status === "완료" ? <CheckIcon size={9} /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenTask(item.id)}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-[0.77rem] text-ink-700",
                      (item as ProjectTask).status === "완료" && "text-ink-400 line-through",
                    )}
                  >
                    {item.title}
                  </button>
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-ink-400" />
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="card px-3.5 py-3">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="section-title">이번 주 목표</h3>
          <span className="text-[0.62rem] text-ink-400">
            {completedGoals}/{goals.length}
          </span>
        </header>
        <ul className="space-y-1">
          {goals.map((goal) => (
            <li key={goal.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onToggleEventDone(goal)}
                className={cn(
                  "flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border",
                  goal.done ? "border-sage-400 bg-sage-400 text-white" : "border-paper-400",
                )}
              >
                {goal.done ? <CheckIcon size={9} /> : null}
              </button>
              <button
                type="button"
                onClick={() => onOpenEvent(goal.id)}
                className={cn("min-w-0 flex-1 truncate text-left text-[0.77rem] text-ink-700", goal.done && "text-ink-400 line-through")}
              >
                {goal.title}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onCreateWeeklyGoal("주간 목표")}
          className="mt-2 flex items-center gap-1 text-[0.7rem] text-ink-400 transition hover:text-ink-700"
        >
          <PlusIcon size={11} /> 목표 추가
        </button>
      </section>

      <section className="card px-3.5 py-3">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="section-title">주간 메모</h3>
          <span className="text-[0.62rem] text-ink-400">{weekKey}</span>
        </header>
        {memo ? (
          <textarea
            value={memoDraft ?? (memo.memo || memo.title)}
            onChange={(event) => setMemoDraft(event.target.value)}
            onBlur={() => {
              if (memoDraft !== null && memoDraft !== (memo.memo || memo.title)) {
                onUpdateEvent(memo.id, { memo: memoDraft });
              }
              setMemoDraft(null);
            }}
            placeholder="이번 주에 남기고 싶은 생각"
            className="min-h-[4.6rem] w-full resize-none rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[0.78rem] leading-relaxed text-ink-700 outline-none transition hover:border-paper-300 focus:border-accent-300 focus:bg-white"
          />
        ) : (
          <div>
            <p className="text-[0.72rem] leading-relaxed text-ink-400">목표와 따로, 이번 주의 느낌을 짧게 남겨 두세요.</p>
            <button
              type="button"
              onClick={() => onCreateWeeklyGoal("주간 메모")}
              className="mt-2 flex items-center gap-1 text-[0.7rem] text-ink-400 transition hover:text-ink-700"
            >
              <PlusIcon size={11} /> 메모 추가
            </button>
          </div>
        )}
        {memo ? (
          <div className="mt-1 flex justify-end">
            <button type="button" onClick={() => onOpenEvent(memo.id)} className="text-[0.62rem] text-ink-400 hover:text-ink-700">
              자세히
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function weekRangeLabel(weekStart: string): string {
  return `${formatShort(weekStart)} – ${formatShort(addDaysISO(weekStart, 6))}`;
}
