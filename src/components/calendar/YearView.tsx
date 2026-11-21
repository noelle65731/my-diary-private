"use client";

import { useMemo } from "react";
import type { CalendarEvent, ProjectTask } from "@/lib/types";
import { monthMatrix, todayISO } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";

interface YearViewProps {
  year: number;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  hiddenIncluded: boolean;
  onPickDay: (day: string) => void;
  /** A21: 월 이름을 누르면 그 달의 월간 보기로 갑니다. */
  onPickMonth?: (monthKey: string) => void;
}

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export function YearView({ year, events, tasks, hiddenIncluded, onPickDay, onPickMonth }: YearViewProps) {
  const today = todayISO();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      if (event.kind !== "일정" || event.trash || (event.hidden && !hiddenIncluded)) continue;
      if (!event.date) continue;
      const end = event.endDate && event.endDate > event.date ? event.endDate : event.date;
      for (let day = event.date; day <= end; day = next(day)) {
        map.set(day, (map.get(day) ?? 0) + 1);
        if (map.size > 8000) break;
      }
    }
    for (const task of tasks) {
      if (task.trash || (task.hidden && !hiddenIncluded)) continue;
      const day = task.date;
      if (!day) continue;
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return map;
  }, [events, tasks, hiddenIncluded]);

  /* A12: all twelve months sit on one screen — four columns on a laptop, no page scroll. */
  return (
    <div className="year-grid grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 xl:grid-cols-4 xl:gap-x-6">
      {Array.from({ length: 12 }, (_, month0) => (
        <MonthMini key={month0} year={year} month0={month0} today={today} counts={counts} onPickDay={onPickDay} onPickMonth={onPickMonth} />
      ))}
    </div>
  );
}

function MonthMini({
  year,
  month0,
  today,
  counts,
  onPickDay,
  onPickMonth,
}: {
  year: number;
  month0: number;
  today: string;
  counts: Map<string, number>;
  onPickDay: (day: string) => void;
  onPickMonth?: (monthKey: string) => void;
}) {
  const matrix = monthMatrix(year, month0, 1);
  const monthKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;

  return (
    <div className="group/month min-w-0">
      <button
        type="button"
        data-year-month={monthKey}
        onClick={() => onPickMonth?.(monthKey)}
        title={`${MONTH_NAMES[month0]} 월간 보기`}
        aria-label={`${MONTH_NAMES[month0]} 월간 보기`}
        className="-mx-1 mb-0.5 flex w-[calc(100%+0.5rem)] items-baseline gap-1 rounded px-1 text-left text-[length:var(--yr-month)] font-semibold leading-none text-ink-900 transition hover:bg-paper-200/70"
      >
        {MONTH_NAMES[month0]}
        <span aria-hidden className="text-[calc(11px*var(--fs))] font-normal text-ink-300 opacity-0 transition group-hover/month:opacity-100">
          월간 ›
        </span>
      </button>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {["월", "화", "수", "목", "금", "토", "일"].map((label, index) => (
          <span
            key={label}
            className={cn(
              "pb-0.5 text-[length:var(--yr-weekday)] font-medium leading-none",
              index === 6 ? "text-red-600" : index === 5 ? "text-blue-700" : "text-ink-600",
            )}
          >
            {label}
          </span>
        ))}
        {matrix.flat().map((day) => {
          const inMonth = day.startsWith(monthKey);
          const count = counts.get(day) ?? 0;
          const holiday = holidayName(day);
          const isToday = day === today;
          const dow = new Date(`${day}T12:00:00`).getDay();
          if (!inMonth) return <span key={day} className="h-[var(--yr-cell)]" />;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              className={cn(
                "relative mx-auto flex h-[var(--yr-cell)] w-[var(--yr-cell)] items-center justify-center rounded-full text-[length:var(--yr-day)] font-medium leading-none tabular-nums transition hover:bg-paper-200",
                isToday && "bg-ink-900 font-semibold text-white hover:bg-ink-800",
                !isToday && (holiday || dow === 0) && "text-red-600",
                !isToday && dow === 6 && "text-blue-700",
                !isToday && !holiday && dow !== 0 && dow !== 6 && "text-ink-800",
              )}
              title={holiday ? `${day} ${holiday}` : day}
            >
              {Number(day.slice(8, 10))}
              {count > 0 && !isToday ? <span className="absolute bottom-[2px] h-[3px] w-[3px] rounded-full bg-sky-500" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function next(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
