"use client";

import { useMemo, useState } from "react";
import type { CalendarEvent, ModeFilter, ProjectTask, Routine } from "@/lib/types";
import {
  addDaysISO,
  daysInMonth,
  formatShort,
  isSameISO,
  monthMatrix,
  todayISO,
  weekdayKo,
  weekdayIndexMon,
} from "@/lib/date";
import { holidayName, isRedDay } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone } from "@/components/common/tone";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { routineCountForDay } from "@/components/calendar/calendar-utils";

interface MonthViewProps {
  cursor: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  routines: Routine[];
  mode: ModeFilter;
  weekStartsOn: 0 | 1;
  onSelectDay: (day: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onCreate: (date: string) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  onOpenRoutine: (id: string) => void;
}

type CellItem =
  | { type: "event"; event: CalendarEvent }
  | { type: "task"; task: ProjectTask };

export function MonthView({
  cursor,
  events,
  tasks,
  routines,
  mode,
  weekStartsOn,
  onSelectDay,
  onOpenEvent,
  onOpenTask,
  onCreate,
  onRoutineCount,
  onOpenRoutine,
}: MonthViewProps) {
  const today = todayISO();
  const year = Number(cursor.slice(0, 4));
  const month0 = Number(cursor.slice(5, 7)) - 1;
  const [popover, setPopover] = useState<string | null>(null);
  const matrix = useMemo(() => monthMatrix(year, month0, weekStartsOn), [year, month0, weekStartsOn]);
  const weekdays = weekStartsOn === 1 ? ["월", "화", "수", "목", "금", "토", "일"] : ["일", "월", "화", "수", "목", "금", "토"];

  const activeEvents = useMemo(
    () => events.filter((event) => event.kind === "일정" && !event.trash && (mode === "all" || !event.hidden)),
    [events, mode],
  );
  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.trash && (mode === "all" || !task.hidden) && task.status !== "취소"),
    [tasks, mode],
  );

  const itemsForDay = (day: string): CellItem[] => {
    const dayEvents: CellItem[] = activeEvents
      .filter((event) => day >= (event.date || "") && day <= (event.endDate || event.date || ""))
      .map((event) => ({ type: "event" as const, event }));
    const dayTasks: CellItem[] = activeTasks
      .filter((task) => task.date === day || task.due === day)
      .map((task) => ({ type: "task" as const, task }));
    return [...dayEvents, ...dayTasks];
  };

  const monthDays = useMemo(() => {
    const count = daysInMonth(year, month0);
    return Array.from({ length: count }, (_, i) => `${year}-${String(month0 + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
  }, [year, month0]);

  const routineTemplates = useMemo(
    () => routines.filter((routine) => routine.kind === "루틴" && !routine.trash && !routine.history && (mode === "all" || !routine.hidden)),
    [routines, mode],
  );

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-paper-300/80 bg-paper-50/50">
          {weekdays.map((label, index) => (
            <div
              key={label}
              className={cn(
                "py-1.5 text-center text-[0.64rem] font-medium",
                index === 0 && weekStartsOn === 0 ? "text-accent-500" : index === 6 ? "text-dusk-500" : "text-ink-500",
              )}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {matrix.map((row, rowIndex) =>
            row.map((day, columnIndex) => {
              const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
              const items = itemsForDay(day);
              const holiday = holidayName(day);
              const isToday = isSameISO(day, today);
              const visible = 2;
              return (
                <div
                  key={day}
                  className={cn(
                    "relative min-h-[4.6rem] border-b border-r border-paper-300/50 p-1 transition hover:bg-paper-100/50 md:min-h-[6.6rem] md:p-1.5",
                    !inMonth && "bg-paper-100/40",
                    columnIndex === 6 && "border-r-0",
                    rowIndex === matrix.length - 1 && "border-b-0",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onSelectDay(day)}
                      className={cn(
                        "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.72rem] font-medium tabular-nums transition",
                        isToday
                          ? "bg-ink-900 text-paper-50"
                          : isRedDay(day)
                            ? "text-accent-500"
                            : inMonth
                              ? "text-ink-700"
                              : "text-ink-300",
                        !isToday && "hover:bg-paper-200",
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </button>
                    <button
                      type="button"
                      onClick={() => onCreate(day)}
                      className="hidden h-4 w-4 items-center justify-center rounded text-ink-300 hover:bg-paper-200 hover:text-ink-600 md:flex"
                      aria-label="일정 추가"
                    >
                      <PlusIcon size={11} />
                    </button>
                  </div>
                  {holiday ? <p className="mt-0.5 truncate text-[0.54rem] text-accent-500">{holiday}</p> : null}

                  <div className="mt-0.5 space-y-0.5">
                    {items.slice(0, visible).map((item) =>
                      item.type === "event" ? (
                        <button
                          key={item.event.id}
                          type="button"
                          onClick={() => onOpenEvent(item.event.id)}
                          className={cn(
                            "flex w-full items-center gap-1 truncate rounded px-1 py-[1px] text-left text-[0.6rem] leading-tight md:text-[0.66rem]",
                            categoryTone(item.event.category).bg,
                            categoryTone(item.event.category).text,
                            item.event.canceled && "opacity-50 line-through",
                            item.event.done && "opacity-70",
                          )}
                        >
                          {item.event.startTime ? <span className="tabular-nums opacity-70">{item.event.startTime}</span> : null}
                          <span className="truncate">{item.event.title}</span>
                        </button>
                      ) : (
                        <button
                          key={item.task.id}
                          type="button"
                          onClick={() => onOpenTask(item.task.id)}
                          className={cn(
                            "flex w-full items-center gap-1 truncate rounded px-1 py-[1px] text-left text-[0.6rem] leading-tight text-ink-600 md:text-[0.66rem]",
                            item.task.status === "완료" && "text-ink-400 line-through",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 flex-none rounded-[2px] border",
                              item.task.status === "완료" ? "border-sage-400 bg-sage-400" : "border-paper-400",
                            )}
                          />
                          <span className="truncate">{item.task.title}</span>
                        </button>
                      ),
                    )}
                    {items.length > visible ? (
                      <button
                        type="button"
                        onClick={() => setPopover(popover === day ? null : day)}
                        className="w-full rounded px-1 text-left text-[0.58rem] font-medium text-ink-400 hover:bg-paper-200 hover:text-ink-600"
                      >
                        +{items.length - visible}
                      </button>
                    ) : null}
                  </div>

                  {popover === day ? (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-20 cursor-default"
                        aria-label="닫기"
                        onClick={() => setPopover(null)}
                      />
                      <div
                        className={cn(
                          "absolute z-30 w-52 animate-pop-in rounded-xl border border-paper-300 bg-[#fffdfa] p-2 shadow-lift",
                          rowIndex >= 4 ? "bottom-full mb-1" : "top-full mt-1",
                          columnIndex >= 5 ? "right-0" : "left-0",
                        )}
                      >
                        <p className="mb-1 px-1 text-[0.66rem] font-medium text-ink-500">{formatShort(day)} {weekdayKo(day)}요일</p>
                        <div className="max-h-52 space-y-0.5 overflow-y-auto">
                          {items.map((item) =>
                            item.type === "event" ? (
                              <button
                                key={item.event.id}
                                type="button"
                                onClick={() => {
                                  setPopover(null);
                                  onOpenEvent(item.event.id);
                                }}
                                className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[0.72rem] hover:bg-paper-100"
                              >
                                <span className={cn("mt-1 h-1.5 w-1.5 flex-none rounded-full", categoryTone(item.event.category).dot)} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-ink-800">{item.event.title}</span>
                                  <span className="block text-[0.6rem] text-ink-400">
                                    {item.event.startTime ? `${item.event.startTime} · ` : "종일 · "}
                                    {item.event.category}
                                  </span>
                                </span>
                              </button>
                            ) : (
                              <button
                                key={item.task.id}
                                type="button"
                                onClick={() => {
                                  setPopover(null);
                                  onOpenTask(item.task.id);
                                }}
                                className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[0.72rem] hover:bg-paper-100"
                              >
                                <span className="mt-1 h-3 w-3 flex-none rounded-[3px] border border-paper-400" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-ink-800">{item.task.title}</span>
                                  <span className="block text-[0.6rem] text-ink-400">할 일 · {item.task.category}</span>
                                </span>
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {routineTemplates.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-paper-300/80 px-3 py-2">
            <h3 className="section-title">이번 달 루틴</h3>
            <p className="text-[0.66rem] text-ink-400">칸을 눌러 체크</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.66rem]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[6rem] border-b border-paper-300/60 bg-[#fffdfa] px-2 py-1.5 text-left font-medium text-ink-500">
                    루틴
                  </th>
                  {monthDays.map((day) => (
                    <th
                      key={day}
                      className={cn(
                        "min-w-[1.4rem] border-b border-paper-300/60 py-1 text-center font-normal",
                        isRedDay(day) ? "text-accent-500" : "text-ink-400",
                      )}
                    >
                      <span className="block">{Number(day.slice(8, 10))}</span>
                      <span className="block text-[0.52rem] opacity-70">{weekdayKo(day)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routineTemplates.map((routine) => {
                  const target = routine.targetCount ?? 1;
                  return (
                    <tr key={routine.id} className="group">
                      <td className="sticky left-0 z-10 border-b border-paper-300/40 bg-[#fffdfa] px-2 py-1">
                        <button
                          type="button"
                          onClick={() => onOpenRoutine(routine.id)}
                          className="max-w-[7.5rem] truncate text-left text-[0.72rem] text-ink-700 hover:text-ink-900"
                        >
                          {routine.title}
                        </button>
                        <span className="ml-1 text-[0.56rem] text-ink-400">{target}회</span>
                      </td>
                      {monthDays.map((day) => {
                        const count = routineCountForDay(routines, routine, day);
                        const ratio = target > 0 ? count / target : 0;
                        return (
                          <td key={day} className="border-b border-paper-300/40 p-0.5 text-center">
                            <button
                              type="button"
                              onClick={() => onRoutineCount(routine, day, count >= target ? 0 : count + 1)}
                              className={cn(
                                "mx-auto flex h-4 w-4 items-center justify-center rounded-[3px] text-[0.5rem] transition",
                                count === 0
                                  ? "bg-paper-200/60 text-transparent hover:bg-paper-300"
                                  : ratio >= 1
                                    ? "bg-sage-400 text-white"
                                    : ratio >= 0.5
                                      ? "bg-sage-200 text-sage-500"
                                      : "bg-sage-100 text-sage-400",
                              )}
                              title={`${routine.title} · ${formatShort(day)} · ${count}/${target}`}
                            >
                              {count > 0 ? count : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
