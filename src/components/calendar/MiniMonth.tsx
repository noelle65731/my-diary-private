"use client";

import { useMemo } from "react";
import { addDaysISO, formatMonthKo, isSameISO, monthMatrix, todayISO } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

interface MiniMonthProps {
  cursor: string;
  weekStart?: string;
  marks?: Record<string, boolean>;
  onPick: (day: string) => void;
  onMonth: (direction: number) => void;
}

export function MiniMonth({ cursor, weekStart, marks, onPick, onMonth }: MiniMonthProps) {
  const today = todayISO();
  const year = Number(cursor.slice(0, 4));
  const month0 = Number(cursor.slice(5, 7)) - 1;
  const matrix = useMemo(() => monthMatrix(year, month0, 1), [year, month0]);
  const weekEnd = weekStart ? addDaysISO(weekStart, 6) : null;

  return (
    <div>
      <div className="flex items-center justify-between px-1">
        <button type="button" onClick={() => onMonth(-1)} className="icon-btn h-5 w-5" aria-label="이전 달">
          <ChevronLeftIcon size={15} />
        </button>
        <p className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">{formatMonthKo(cursor)}</p>
        <button type="button" onClick={() => onMonth(1)} className="icon-btn h-5 w-5" aria-label="다음 달">
          <ChevronRightIcon size={15} />
        </button>
      </div>

      <div className="mt-1 grid grid-cols-7 text-center">
        {["월", "화", "수", "목", "금", "토", "일"].map((label) => (
          <span key={label} className={cn("pb-0.5 text-[calc(13px*var(--fs))]", label === "토" ? "text-blue-500" : label === "일" ? "text-red-400" : "text-ink-400")}>
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {matrix.flatMap((row) =>
          row.map((day) => {
            const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
            const isToday = isSameISO(day, today);
            const inWeek = !!weekStart && !!weekEnd && day >= weekStart && day <= weekEnd;
            const holiday = holidayName(day);
            const dow = new Date(`${day}T12:00:00`).getDay();
            return (
              <button
                key={day}
                type="button"
                onClick={() => onPick(day)}
                className={cn(
                  "relative flex h-[1.35rem] flex-col items-center justify-center text-[calc(14px*var(--fs))] tabular-nums transition",
                  inWeek && "bg-paper-200/80",
                  inWeek && day === weekStart && "rounded-l-lg",
                  inWeek && day === weekEnd && "rounded-r-lg",
                )}
              >
                <span
                  className={cn(
                    "flex h-[1.12rem] min-w-[1.12rem] items-center justify-center rounded-full px-1",
                    isToday
                      ? "bg-ink-900 font-semibold text-white"
                      : !inMonth
                        ? "text-ink-300"
                        : holiday || dow === 0
                          ? "text-red-500"
                          : dow === 6
                            ? "text-blue-600"
                            : "text-ink-700",
                    !isToday && "hover:bg-paper-300/60",
                  )}
                >
                  {Number(day.slice(8, 10))}
                </span>
                {marks?.[day] ? <span className="absolute bottom-0 h-[3px] w-[3px] rounded-full bg-sky-500" /> : null}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
