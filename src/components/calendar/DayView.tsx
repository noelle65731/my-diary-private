"use client";

import type { CalendarEvent, ProjectTask, Routine } from "@/lib/types";
import { formatFullKo, formatTimeKo, todayISO, weekdayKo } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { categoryTone, taskTone } from "@/components/common/tone";
import { CheckIcon, ClockIcon, FlagIcon, PlusIcon, RepeatIcon } from "@/components/icons";
import {
  allDayEventsForDay,
  routineCountForDay,
  routinesForDay,
  tasksForDay,
  timedEventsForDay,
} from "@/components/calendar/calendar-utils";

interface DayViewProps {
  day: string;
  events: CalendarEvent[];
  tasks: ProjectTask[];
  routines: Routine[];
  hiddenIncluded: boolean;
  onOpenEvent: (id: string) => void;
  onOpenTask: (id: string) => void;
  onCreate: (date: string, time?: string | null) => void;
  onToggleTask: (task: ProjectTask) => void;
  onRoutineCount: (routine: Routine, date: string, count: number) => void;
  onWriteDiary: (date: string) => void;
}

export function DayView({
  day,
  events,
  tasks,
  routines,
  hiddenIncluded,
  onOpenEvent,
  onOpenTask,
  onCreate,
  onToggleTask,
  onRoutineCount,
  onWriteDiary,
}: DayViewProps) {
  const visible = events.filter((event) => !event.trash && (hiddenIncluded || !event.hidden));
  const allDay = allDayEventsForDay(visible, day);
  const timed = timedEventsForDay(visible, day).sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const dayTasks = tasksForDay(
    tasks.filter((task) => !task.trash && (hiddenIncluded || !task.hidden)),
    day,
  ).filter((task) => task.status !== "취소");
  const dueRoutines = routinesForDay(routines, day).filter((routine) => !routine.trash && (hiddenIncluded || !routine.hidden));
  const holiday = holidayName(day);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
      <div className="space-y-3">
        <div className="card px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="serif text-[1.1rem] text-ink-900">{formatFullKo(day)}</p>
              <p className={cn("mt-0.5 text-[0.72rem]", holiday ? "text-accent-500" : "text-ink-400")}>
                {holiday ?? `${weekdayKo(day)}요일`} · 일정 {allDay.length + timed.length}개
              </p>
            </div>
            <button type="button" onClick={() => onCreate(day, "09:00")} className="btn-outline btn-xs">
              <PlusIcon size={13} /> 일정
            </button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-paper-300/70 px-4 py-2">
            <h3 className="section-title">하루 흐름</h3>
            <span className="text-[0.66rem] text-ink-400">눌러서 수정</span>
          </div>
          {allDay.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-b border-paper-300/60 bg-paper-50/50 px-4 py-2">
              <span className="text-[0.64rem] text-ink-400">종일</span>
              {allDay.map((event) => {
                const tone = categoryTone(event.category);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent(event.id)}
                    className={cn("chip border", tone.bg, tone.border, tone.text, event.canceled && "line-through opacity-50")}
                  >
                    {event.title}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="divide-y divide-paper-300/50">
            {timed.length === 0 && allDay.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[0.84rem] text-ink-500">비어 있는 하루입니다.</p>
                <button type="button" onClick={() => onCreate(day, "10:00")} className="btn-outline btn-xs mt-2">
                  <PlusIcon size={13} /> 일정 추가
                </button>
              </div>
            ) : null}
            {timed.map((event) => {
              const tone = categoryTone(event.category);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onOpenEvent(event.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-paper-100/60",
                    event.canceled && "opacity-55",
                  )}
                >
                  <div className="w-[3.6rem] flex-none pt-0.5 text-right">
                    <p className="text-[0.72rem] font-medium tabular-nums text-ink-700">{event.startTime}</p>
                    <p className="text-[0.6rem] tabular-nums text-ink-400">{event.endTime ?? ""}</p>
                  </div>
                  <span className={cn("mt-1 h-8 w-1 flex-none rounded-full", tone.dot)} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[0.88rem] font-medium text-ink-900", event.canceled && "line-through")}>
                      {event.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.66rem] text-ink-500">
                      <span className={cn("chip", tone.bg, tone.text)}>{event.category}</span>
                      {event.favorite ? <FlagIcon size={11} className="text-amber-500" /> : null}
                      {event.done ? (
                        <span className="inline-flex items-center gap-0.5 text-sage-500">
                          <CheckIcon size={11} /> 완료
                        </span>
                      ) : null}
                      {event.memo ? <span className="truncate text-ink-400">{event.memo}</span> : null}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-paper-300/70 px-4 py-2">
            <h3 className="section-title">이 날의 할 일</h3>
            <span className="text-[0.66rem] text-ink-400">{dayTasks.length}개</span>
          </div>
          {dayTasks.length === 0 ? (
            <p className="px-4 py-5 text-center text-[0.78rem] text-ink-400">이 날 예정된 할 일이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-paper-300/40">
              {dayTasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2.5 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => onToggleTask(task)}
                    aria-label="완료 토글"
                    className={cn(
                      "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border transition",
                      task.status === "완료" ? "border-sage-400 bg-sage-400 text-white" : "border-paper-400 hover:border-ink-500",
                    )}
                  >
                    {task.status === "완료" ? <CheckIcon size={10} /> : null}
                  </button>
                  <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                    <span className={cn("block truncate text-[0.84rem] text-ink-800", task.status === "완료" && "text-ink-400 line-through")}>
                      {task.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.62rem] text-ink-400">
                      <span className={cn("chip", taskTone(task.category).bg, taskTone(task.category).text)}>{task.category}</span>
                      {task.due ? <span>마감 {task.due.slice(5)}</span> : null}
                      {task.status === "대기 중" && task.waitFor ? <span>· {task.waitFor} 대기</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="card px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title">루틴</h3>
            <span className="text-[0.64rem] text-ink-400">{dueRoutines.length}개</span>
          </div>
          {dueRoutines.length === 0 ? (
            <p className="text-[0.76rem] text-ink-400">오늘 예정된 루틴이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {dueRoutines.map((routine) => {
                const target = routine.targetCount ?? 1;
                const count = routineCountForDay(routines, routine, day);
                return (
                  <li key={routine.id} className="flex items-center gap-2">
                    <RepeatIcon size={13} className={count >= target ? "text-sage-400" : "text-ink-400"} />
                    <span className="min-w-0 flex-1 truncate text-[0.8rem] text-ink-700">{routine.title}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onRoutineCount(routine, day, Math.max(0, count - 1))}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-paper-200 text-ink-500 hover:bg-paper-300"
                      >
                        −
                      </button>
                      <span className="w-9 text-center text-[0.74rem] tabular-nums text-ink-700">
                        {count}/{target}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRoutineCount(routine, day, Math.min(target, count + 1))}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-paper-200 text-ink-500 hover:bg-paper-300"
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card px-4 py-3">
          <h3 className="section-title mb-2">기록</h3>
          <p className="text-[0.76rem] leading-relaxed text-ink-500">오늘의 일기를 남겨 두면 주간 보기에서 세 줄로 미리 보입니다.</p>
          <button type="button" onClick={() => onWriteDiary(day)} className="btn-primary btn-xs mt-2 w-full">
            이 날 일기 쓰기
          </button>
        </div>

        <div className="card-quiet px-4 py-3">
          <h3 className="section-title mb-1.5">빠른 추가</h3>
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => onCreate(day, "09:00")} className="flex items-center gap-1.5 text-left text-[0.8rem] text-ink-600 hover:text-ink-900">
              <ClockIcon size={13} /> 시간 있는 일정
            </button>
            <button type="button" onClick={() => onCreate(day, null)} className="flex items-center gap-1.5 text-left text-[0.8rem] text-ink-600 hover:text-ink-900">
              <PlusIcon size={13} /> 종일 일정
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatDayTitle(day: string): string {
  return `${formatFullKo(day)}${holidayName(day) ? ` · ${holidayName(day)}` : ""}`;
}

export function timeSummary(event: CalendarEvent): string {
  return event.allDay ? "종일" : `${formatTimeKo(event.startTime)}${event.endTime ? ` – ${formatTimeKo(event.endTime)}` : ""}`;
}
