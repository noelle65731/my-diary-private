"use client";

import type { Routine } from "@/lib/types";
import { cn } from "@/lib/utils";
import { weekdayKo } from "@/lib/date";
import { CheckIcon, PlusIcon, RepeatIcon } from "@/components/icons";
import { routineCountForDay } from "@/components/calendar/calendar-utils";

export function RoutineCard({
  routine,
  routines,
  date,
  onCount,
  onOpen,
  compact = false,
}: {
  routine: Routine;
  routines: Routine[];
  date: string;
  onCount: (count: number) => void;
  onOpen: () => void;
  compact?: boolean;
}) {
  const target = routine.targetCount ?? 1;
  const count = routineCountForDay(routines, routine, date);
  const complete = count >= target;
  const ratio = target > 0 ? Math.min(1, count / target) : 0;
  const daysLabel =
    routine.repeatDays.length === 0
      ? "매일"
      : routine.repeatDays.length === 7
        ? "매일"
        : routine.repeatDays.join("·");

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-paper-300/70 bg-white/60 px-2.5 py-1.5">
        <RepeatIcon size={13} className={complete ? "text-sage-400" : "text-ink-400"} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-[0.78rem] text-ink-700">
          {routine.title}
        </button>
        <button
          type="button"
          onClick={() => onCount(count >= target ? 0 : count + 1)}
          className={cn(
            "flex h-6 items-center gap-0.5 rounded-full px-2 text-[0.64rem] font-medium tabular-nums transition",
            complete ? "bg-sage-400 text-white" : "bg-paper-200 text-ink-600 hover:bg-paper-300",
          )}
        >
          {complete ? <CheckIcon size={10} /> : <PlusIcon size={10} />}
          {count}/{target}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("card px-3.5 py-3 transition", complete && "border-sage-200 bg-sage-50/40")}>
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-1.5 truncate text-[0.86rem] font-medium text-ink-900">
            <RepeatIcon size={13} className={complete ? "text-sage-500" : "text-ink-400"} />
            {routine.title}
          </p>
          <p className="mt-0.5 text-[0.64rem] text-ink-400">
            {routine.category} · {daysLabel} · 목표 {target}
            {routine.unit ? ` ${routine.unit}` : ""}
          </p>
        </button>
        <span className="text-[0.66rem] tabular-nums text-ink-500">
          {weekdayKo(date)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-200">
          <div className={cn("h-full rounded-full transition-all", complete ? "bg-sage-400" : "bg-accent-300")} style={{ width: `${ratio * 100}%` }} />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCount(Math.max(0, count - 1))}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-paper-200 text-[0.8rem] text-ink-500 transition hover:bg-paper-300"
          >
            −
          </button>
          <span className={cn("w-9 text-center text-[0.72rem] font-medium tabular-nums", complete ? "text-sage-500" : "text-ink-700")}>
            {count}/{target}
          </span>
          <button
            type="button"
            onClick={() => onCount(count >= target ? 0 : count + 1)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full transition",
              complete ? "bg-sage-400 text-white" : "bg-ink-900 text-paper-50 hover:bg-ink-800",
            )}
          >
            {complete ? <CheckIcon size={11} /> : <PlusIcon size={11} />}
          </button>
        </div>
      </div>
    </div>
  );
}
