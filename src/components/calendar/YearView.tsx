"use client";

import { useMemo } from "react";
import type { CalendarEvent, ProjectTask } from "@/lib/types";
import { monthMatrix, todayISO, weekdayKo } from "@/lib/date";
import { holidayName, isRedDay } from "@/lib/holidays";
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

  const quarters = [0, 1, 2, 3];

  return (
    <div className="space-y-4">
      {quarters.map((quarter) => (
        <section key={quarter} className="card px-3 py-3 md:px-4 md:py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="section-title">{year} · {quarter + 1}분기</h3>
            <span className="text-[0.66rem] text-ink-400">{MONTH_NAMES[quarter * 3]} – {MONTH_NAMES[quarter * 3 + 2]}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[quarter * 3, quarter * 3 + 1, quarter * 3 + 2].map((month0) => (
              <MonthMini
                key={month0}
                year={year}
                month0={month0}
                today={today}
                counts={counts}
                onPickDay={onPickDay}
              />
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
    <div className="rounded-xl border border-paper-300/50 bg-paper-50/40 px-2 py-2">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <p className="serif text-[0.86rem] text-ink-800">{MONTH_NAMES[month0]}</p>
        <p className="text-[0.56rem] text-ink-400">{year}</p>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {["월", "화", "수", "목", "금", "토", "일"].map((label, index) => (
          <span
            key={label}
            className={cn("text-[0.5rem]", index === 6 ? "text-accent-400" : index === 5 ? "text-dusk-400" : "text-ink-300")}
          >
            {label}
          </span>
        ))}
        {matrix.flat().map((day) => {
          const inMonth = day.startsWith(monthKey);
          const count = counts.get(day) ?? 0;
          const holiday = holidayName(day);
          const isToday = day === today;
          if (!inMonth) return <span key={day} className="h-5" />;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              className={cn(
                "relative mx-auto flex h-5 w-5 items-center justify-center rounded-[4px] text-[0.58rem] tabular-nums transition hover:bg-paper-200",
                isToday && "bg-ink-900 text-paper-50 hover:bg-ink-800",
                !isToday && isRedDay(day) && "text-accent-500",
                !isToday && !isRedDay(day) && "text-ink-600",
                holiday && !isToday && "font-medium",
              )}
              title={holiday ? `${day} ${holiday}` : day}
            >
              {Number(day.slice(8, 10))}
              {count > 0 && !isToday ? (
                <span
                  className={cn(
                    "absolute bottom-[1px] h-[3px] w-[3px] rounded-full",
                    count >= 3 ? "bg-accent-400" : "bg-sage-400",
                  )}
                />
              ) : null}
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
