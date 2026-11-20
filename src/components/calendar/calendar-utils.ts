import type { CalendarEvent, ProjectTask, Routine } from "@/lib/types";
import { diffDays, timeToMinutes, weekdayIndexMon, weekdayKo } from "@/lib/date";

export function eventCoversDay(event: CalendarEvent, day: string): boolean {
  if (!event.date) return false;
  const end = event.endDate && event.endDate > event.date ? event.endDate : event.date;
  return day >= event.date && day <= end;
}

export function eventStartMinutes(event: CalendarEvent): number {
  return event.startTime ? timeToMinutes(event.startTime) : 0;
}

export function eventEndMinutes(event: CalendarEvent): number {
  if (event.endTime) return Math.max(timeToMinutes(event.endTime), eventStartMinutes(event) + 15);
  return eventStartMinutes(event) + 60;
}

export interface LaidOutEvent {
  event: CalendarEvent;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

/** Assigns overlapping events into side-by-side lanes (per overlap cluster). */
export function layoutDayEvents(events: CalendarEvent[]): LaidOutEvent[] {
  const sorted = events
    .map((event) => ({ event, start: eventStartMinutes(event), end: eventEndMinutes(event) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const result: LaidOutEvent[] = [];
  let cluster: { event: CalendarEvent; start: number; end: number; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const item of cluster) {
      result.push({ event: item.event, start: item.start, end: item.end, lane: item.lane, lanes });
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

export function timedEventsForDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((event) => event.kind === "일정" && !event.allDay && eventCoversDay(event, day));
}

export function allDayEventsForDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((event) => event.kind === "일정" && event.allDay && eventCoversDay(event, day));
}

export function tasksForDay(tasks: ProjectTask[], day: string): ProjectTask[] {
  return tasks.filter((task) => task.date === day || task.due === day);
}

export function routinesForDay(routines: Routine[], day: string): Routine[] {
  const label = weekdayKo(day);
  return routines.filter(
    (routine) => routine.kind === "루틴" && (routine.repeatDays.length === 0 || routine.repeatDays.includes(label)),
  );
}

export function routineCheckForDay(routines: Routine[], routineId: string, day: string): Routine | undefined {
  return routines.find(
    (item) => item.kind === "날짜별 체크" && item.date === day && item.routineIds.includes(routineId),
  );
}

export function routineCountForDay(routines: Routine[], routine: Routine, day: string): number {
  const check = routineCheckForDay(routines, routine.id, day);
  if (check) return check.execCount ?? 0;
  if (routine.date === day) return routine.execCount ?? 0;
  return 0;
}

export function weekdayInitial(day: string): string {
  return weekdayKo(day);
}

export function weekdayMonIndex(day: string): number {
  return weekdayIndexMon(day);
}

/** Number of days from the start of an event to a given day (for multi-day bars). */
export function dayOffset(event: CalendarEvent, day: string): number {
  return event.date ? diffDays(day, event.date) : 0;
}

export function taskIsOpen(task: ProjectTask): boolean {
  return task.status !== "완료" && task.status !== "취소";
}

export function totalRoutineTarget(routines: Routine[], day: string): { done: number; target: number } {
  let done = 0;
  let target = 0;
  for (const routine of routinesForDay(routines, day)) {
    const count = routineCountForDay(routines, routine, day);
    done += Math.min(count, routine.targetCount ?? 1);
    target += routine.targetCount ?? 1;
  }
  return { done, target };
}
