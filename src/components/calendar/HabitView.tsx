"use client";

import { useMemo } from "react";
import type { Routine } from "@/lib/types";
import { daysInMonth, formatMonthKo, isSameISO, todayISO, weekdayKo } from "@/lib/date";
import { isRedDay } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { PlusIcon } from "@/components/icons";
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
  const templates = routines.filter((routine) => routine.kind === "루틴" && !routine.trash && (hiddenIncluded || !routine.hidden));

  const todayProgress = templates.reduce(
    (acc, routine) => {
      const target = routine.targetCount ?? 1;
      const count = routineCountForDay(routines, routine, today);
      return { done: acc.done + Math.min(count, target), target: acc.target + target };
    },
    { done: 0, target: 0 },
  );

  const percent = todayProgress.target > 0 ? Math.round((todayProgress.done / todayProgress.target) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card px-4 py-3">
          <p className="section-title">이번 달</p>
          <p className="serif mt-1 text-[1.15rem] text-ink-900">{formatMonthKo(cursor)}</p>
          <p className="mt-0.5 text-[0.7rem] text-ink-400">루틴 {templates.length}개</p>
        </div>
        <div className="card px-4 py-3">
          <p className="section-title">오늘 달성</p>
          <p className="serif mt-1 text-[1.15rem] text-ink-900">
            {todayProgress.done}/{todayProgress.target}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-200">
            <div className="h-full rounded-full bg-sage-400 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="card flex items-center justify-between px-4 py-3">
          <div>
            <p className="section-title">루틴 추가</p>
            <p className="mt-1 text-[0.74rem] text-ink-500">요일과 목표 횟수를 정해요</p>
          </div>
          <button type="button" onClick={onCreateRoutine} className="btn-primary btn-xs">
            <PlusIcon size={13} /> 새 루틴
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-paper-300/80 px-3 py-2">
          <h3 className="section-title">월간 체크</h3>
          <span className="text-[0.66rem] text-ink-400">칸을 누르면 횟수가 올라가고, 목표에 닿으면 다시 0으로 돌아갑니다</span>
        </div>
        {templates.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[0.84rem] text-ink-500">아직 루틴이 없습니다.</p>
            <button type="button" onClick={onCreateRoutine} className="btn-outline btn-xs mt-2">
              첫 루틴 만들기
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.68rem]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[7rem] border-b border-paper-300/60 bg-[#fffdfa] px-2 py-2 text-left font-medium text-ink-500">
                    루틴
                  </th>
                  {days.map((day) => (
                    <th
                      key={day}
                      className={cn(
                        "min-w-[1.55rem] border-b border-paper-300/60 py-1.5 text-center font-normal",
                        isSameISO(day, today) ? "bg-accent-50 text-ink-900" : isRedDay(day) ? "text-accent-400" : "text-ink-400",
                      )}
                    >
                      <span className="block text-[0.6rem]">{Number(day.slice(8, 10))}</span>
                      <span className="block text-[0.5rem] opacity-70">{weekdayKo(day)}</span>
                    </th>
                  ))}
                  <th className="min-w-[3rem] border-b border-paper-300/60 px-1 py-1 text-center font-normal text-ink-400">
                    달성
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((routine) => {
                  const target = routine.targetCount ?? 1;
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
                      <td className="sticky left-0 z-10 border-b border-paper-300/40 bg-[#fffdfa] px-2 py-1.5">
                        <button type="button" onClick={() => onOpenRoutine(routine.id)} className="max-w-[9rem] truncate text-left">
                          <span className="block truncate text-[0.76rem] text-ink-800">{routine.title}</span>
                          <span className="block text-[0.56rem] text-ink-400">
                            {routine.category} · 목표 {target}
                            {routine.unit ? ` ${routine.unit}` : ""}
                          </span>
                        </button>
                      </td>
                      {days.map((day) => {
                        const count = routineCountForDay(routines, routine, day);
                        const ratio = target > 0 ? count / target : 0;
                        const scheduledDay = routine.repeatDays.length === 0 || routine.repeatDays.includes(weekdayKo(day));
                        return (
                          <td key={day} className={cn("border-b border-paper-300/40 p-0.5 text-center", isSameISO(day, today) && "bg-accent-50/40")}>
                            <button
                              type="button"
                              disabled={!scheduledDay}
                              onClick={() => onRoutineCount(routine, day, count >= target ? 0 : count + 1)}
                              className={cn(
                                "mx-auto flex h-5 w-5 items-center justify-center rounded-[5px] text-[0.56rem] transition",
                                !scheduledDay
                                  ? "cursor-default bg-transparent text-transparent"
                                  : count === 0
                                    ? "bg-paper-200/60 text-transparent hover:bg-paper-300"
                                    : ratio >= 1
                                      ? "bg-sage-400 text-white"
                                      : ratio >= 0.5
                                        ? "bg-sage-200 text-sage-500"
                                        : "bg-sage-100 text-sage-400",
                              )}
                              title={`${routine.title} · ${day} · ${count}/${target}`}
                            >
                              {scheduledDay ? count || "" : ""}
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-b border-paper-300/40 px-1 text-center text-[0.62rem] text-ink-500">{rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
