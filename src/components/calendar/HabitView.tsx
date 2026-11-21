"use client";

import { useMemo } from "react";
import type { Routine } from "@/lib/types";
import { daysInMonth, formatMonthKo, isSameISO, todayISO, weekdayKo } from "@/lib/date";
import { cn } from "@/lib/utils";
import { routineTone } from "@/components/common/tone";
import { routineCountForDay } from "@/components/calendar/calendar-utils";

interface HabitViewProps {
  cursor: string;
  routines: Routine[];
  hiddenIncluded: boolean;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  onOpenRoutine: (id: string) => void;
  onCreateRoutine: () => void;
}

export function HabitView({ cursor, routines, hiddenIncluded, onRoutineCount, onOpenRoutine, onCreateRoutine }: HabitViewProps) {
  const today = todayISO();
  const year = Number(cursor.slice(0, 4));
  const month0 = Number(cursor.slice(5, 7)) - 1;
  const monthKey = cursor.slice(0, 7);
  const total = daysInMonth(year, month0);
  const days = useMemo(
    () => Array.from({ length: total }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`),
    [monthKey, total],
  );
  const visibleRoutines = routines.filter((routine) => routine.kind === "루틴" && !routine.trash && (hiddenIncluded || !routine.hidden));

  const todayProgress = visibleRoutines.reduce(
    (acc, routine) => {
      const target = routine.targetCount ?? 1;
      const count = routineCountForDay(routines, routine, today);
      return { done: acc.done + Math.min(count, target), target: acc.target + target };
    },
    { done: 0, target: 0 },
  );

  const percent = todayProgress.target > 0 ? Math.round((todayProgress.done / todayProgress.target) * 100) : 0;

  let monthDone = 0;
  let monthScheduled = 0;
  for (const routine of visibleRoutines) {
    const target = routine.targetCount ?? 1;
    for (const day of days) {
      if (day > today) continue;
      if (routine.repeatDays.length > 0 && !routine.repeatDays.includes(weekdayKo(day))) continue;
      monthScheduled += 1;
      if (routineCountForDay(routines, routine, day) >= target) monthDone += 1;
    }
  }
  const monthPercent = monthScheduled > 0 ? Math.round((monthDone / monthScheduled) * 100) : 0;

  return (
    <div>
      <div className="grid grid-cols-3 divide-x divide-paper-300 border-b border-paper-300 pb-3">
        <div className="pr-4">
          <p className="text-[calc(14px*var(--fs))] text-ink-400">이번 달</p>
          <p className="mt-1 text-[calc(16px*var(--fs))] font-semibold text-ink-900">{formatMonthKo(cursor)}</p>
          <p className="text-[calc(14px*var(--fs))] text-ink-400">루틴 {visibleRoutines.length}개</p>
        </div>
        <div className="px-4">
          <p className="text-[calc(14px*var(--fs))] text-ink-400">오늘 달성</p>
          <p className="mt-1 text-[calc(16px*var(--fs))] font-semibold text-ink-900">
            {todayProgress.done}
            <span className="text-[calc(14.5px*var(--fs))] font-normal text-ink-400">/{todayProgress.target}</span>
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-200">
            <div className="h-full rounded-full bg-sage-400 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pl-4">
          <div>
            <p className="text-[calc(14px*var(--fs))] text-ink-400">이번 달 달성</p>
            <p className="mt-0.5 text-[calc(16px*var(--fs))] font-semibold text-ink-900">
              {monthScheduled > 0 ? `${monthPercent}%` : "-"}
              <span className="ml-1 text-[calc(13.5px*var(--fs))] font-normal text-ink-400">
                {monthDone}/{monthScheduled}
              </span>
            </p>
            <p className="text-[calc(13.5px*var(--fs))] text-ink-400">칸을 눌러 체크</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">월간 체크</h3>
        <span className="text-[calc(13.5px*var(--fs))] text-ink-400">칸을 누르면 횟수가 올라가고, 목표에 닿으면 0으로 돌아갑니다</span>
      </div>

      {visibleRoutines.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-paper-300 px-4 py-10 text-center">
          <p className="text-[calc(15px*var(--fs))] text-ink-500">아직 루틴이 없습니다.</p>
          <button type="button" onClick={onCreateRoutine} className="btn-outline btn-xs mt-2">
            첫 루틴 만들기
          </button>
        </div>
      ) : (
        <table className="mt-2 w-full border-collapse text-[calc(14px*var(--fs))]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[7rem] border-b border-paper-300 bg-white px-2 py-1.5 text-left font-medium text-ink-500">
                루틴
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  className={cn(
                    "min-w-[1.5rem] border-b border-paper-300 py-1 text-center font-normal",
                    isSameISO(day, today) ? "bg-paper-200 text-ink-900" : "text-ink-400",
                  )}
                >
                  <span className="block text-[calc(13px*var(--fs))] tabular-nums">{Number(day.slice(8, 10))}</span>
                  <span
                    className={cn(
                      "block text-[calc(11px*var(--fs))]",
                      new Date(`${day}T12:00:00`).getDay() === 6 ? "text-blue-500" : new Date(`${day}T12:00:00`).getDay() === 0 ? "text-red-400" : "opacity-70",
                    )}
                  >
                    {weekdayKo(day)}
                  </span>
                </th>
              ))}
              <th className="min-w-[3rem] border-b border-paper-300 px-1 py-1 text-center font-normal text-ink-400">달성</th>
            </tr>
          </thead>
          <tbody>
            {visibleRoutines.map((routine, index) => {
              const target = routine.targetCount ?? 1;
              const tone = routineTone(index);
              let doneDays = 0;
              let scheduled = 0;
              for (const day of days) {
                if (routine.repeatDays.length > 0 && !routine.repeatDays.includes(weekdayKo(day))) continue;
                if (day > today) continue;
                scheduled += 1;
                if (routineCountForDay(routines, routine, day) >= target) doneDays += 1;
              }
              const rate = scheduled > 0 ? Math.round((doneDays / scheduled) * 100) : 0;
              return (
                <tr key={routine.id}>
                  <td className="sticky left-0 z-10 border-b border-paper-300/60 bg-white px-2 py-1">
                    <button type="button" onClick={() => onOpenRoutine(routine.id)} className="max-w-[9rem] truncate text-left">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("h-[5px] w-[5px] flex-none rounded-full", tone.dot)} />
                        <span className="truncate text-[calc(14.5px*var(--fs))] text-ink-800">{routine.title}</span>
                      </span>
                      <span className="block pl-3 text-[calc(12px*var(--fs))] text-ink-400">
                        {routine.category} · 목표 {target}
                        {routine.unit ? ` ${routine.unit}` : ""}
                      </span>
                    </button>
                  </td>
                  {days.map((day) => {
                    const count = routineCountForDay(routines, routine, day);
                    const done = count >= target;
                    const scheduledDay = routine.repeatDays.length === 0 || routine.repeatDays.includes(weekdayKo(day));
                    return (
                      <td key={day} className={cn("border-b border-paper-300/50 p-0.5 text-center", isSameISO(day, today) && "bg-paper-200/50")}>
                        <button
                          type="button"
                          disabled={!scheduledDay}
                          onClick={() => onRoutineCount(routine, day, done ? 0 : count + 1)}
                          className={cn(
                            "mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[calc(11px*var(--fs))] transition",
                            !scheduledDay
                              ? "cursor-default bg-transparent text-transparent"
                              : done
                                ? cn(tone.solid, "font-semibold text-white")
                                : count > 0
                                  ? cn(tone.soft, tone.text)
                                  : "border border-paper-300 bg-white text-ink-500 hover:border-ink-400 hover:bg-paper-200",
                          )}
                          title={`${routine.title} · ${day} · ${count}/${target}`}
                        >
                          {scheduledDay ? count || "" : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b border-paper-300/50 px-1 text-center text-[calc(13px*var(--fs))] tabular-nums text-ink-500">{rate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
