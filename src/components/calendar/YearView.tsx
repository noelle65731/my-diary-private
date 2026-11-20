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
}

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export function YearView({ year, events, tasks, hiddenIncluded, onPickDay }: YearViewProps) {
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

  return (
    <div>
      {[0, 1, 2, 3].map((quarter) => (
        <section key={quarter} className="border-b border-paper-300 py-3 last:border-b-0">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[0.74rem] text-ink-500">
              {year} · {quarter + 1}분기
            </h3>
            <span className="text-[0.66rem] text-ink-300">
              {MONTH_NAMES[quarter * 3]} – {MONTH_NAMES[quarter * 3 + 2]}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[quarter * 3, quarter * 3 + 1, quarter * 3 + 2].map((month0) => (
              <MonthMini key={month0} year={year} month0={month0} today={today} counts={counts} onPickDay={onPickDay} />
            ))}
          </div>
        </section>
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
}: {
  year: number;
  month0: number;
  today: string;
  counts: Map<string, number>;
  onPickDay: (day: string) => void;
}) {
  const matrix = monthMatrix(year, month0, 1);
  const monthKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;

  return (
    <div>
      <p className="mb-1.5 text-[0.9rem] font-semibold text-ink-900">{MONTH_NAMES[month0]}</p>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {["월", "화", "수", "목", "금", "토", "일"].map((label, index) => (
          <span
            key={label}
            className={cn("text-[0.58rem]", index === 6 ? "text-red-400" : index === 5 ? "text-blue-500" : "text-ink-300")}
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
          if (!inMonth) return <span key={day} className="h-5" />;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              className={cn(
                "relative mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[0.62rem] tabular-nums transition hover:bg-paper-200",
                isToday && "bg-ink-900 font-semibold text-white hover:bg-ink-800",
                !isToday && (holiday || dow === 0) && "text-red-500",
                !isToday && dow === 6 && "text-blue-600",
                !isToday && !holiday && dow !== 0 && dow !== 6 && "text-ink-700",
              )}
              title={holiday ? `${day} ${holiday}` : day}
            >
              {Number(day.slice(8, 10))}
              {count > 0 && !isToday ? <span className="absolute bottom-[1px] h-[3px] w-[3px] rounded-full bg-sky-500" /> : null}
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
