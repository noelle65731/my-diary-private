"use client";

import { useCallback } from "react";
import { useData } from "@/state/store";
import { useUi } from "@/state/ui";
import { todayISO } from "@/lib/date";
import {
  currentCalendarCategory,
  type CalendarCategory,
  type CalendarEvent,
  type ProjectTask,
  type TaskStatus,
} from "@/lib/types";

/**
 * A39: 일정(`Calendar` DB)과 할 일(`Projects` DB)은 서로 다른 DB 라서 한쪽 행의 `유형`만
 * 바꿔서는 옮길 수 없습니다. 그래서 **새 DB 에 먼저 만들고, 그게 만들어졌을 때만 원래 항목을
 * 휴지통으로** 보냅니다. 만들기가 실패하면 아무것도 지우지 않으므로 원래 자리에 그대로 남고,
 * 원래 항목을 정리하지 못하면 방금 만든 쪽을 지워 되돌립니다.
 *
 * 옮길 때 지키는 값: 제목 · 분류 · 날짜(와 시각) · 메모(서식 포함) · 완료/취소 상태(사유·시각) ·
 * NOW 숨김 · 즐겨찾기 · 연결 프로젝트.
 */

export interface EventToTaskOptions {
  /** 놓은 프로젝트. `null` 이면 index(프로젝트 없음)로 갑니다. 생략하면 일정의 연결 프로젝트. */
  projectId?: string | null;
  /** 놓은 날짜. 생략하면 일정의 날짜. */
  date?: string | null;
}

export interface TaskToEventOptions {
  /** 놓은 날짜. 생략하면 할 일의 날짜(없으면 오늘). */
  date?: string | null;
  /** 종일 칸에 놓으면 true, 시간표 칸에 놓으면 false + 시각. */
  allDay?: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ConvertApi {
  eventToTask: (eventId: string, options?: EventToTaskOptions) => Promise<ProjectTask | null>;
  taskToEvent: (taskId: string, options?: TaskToEventOptions) => Promise<CalendarEvent | null>;
}

/** 할 일의 상태를 일정의 완료·취소로 바꿉니다. */
function eventStatus(event: CalendarEvent): TaskStatus {
  if (event.canceled) return "취소";
  return event.done ? "완료" : "미완료";
}

function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":");
  const hours = Number(h ?? 0);
  const mins = Number(m ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

function addMinutes(time: string, minutes: number): string {
  const base = minutesOf(time) ?? 9 * 60;
  const value = Math.max(0, Math.min(24 * 60 - 15, base + minutes));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function useConvert(): ConvertApi {
  const { create, update, destroy, findItem } = useData();
  const { notify } = useUi();

  const rollback = useCallback(
    async (resource: "calendar" | "projects", id: string) => {
      await destroy(resource, id);
    },
    [destroy],
  );

  const eventToTask = useCallback<ConvertApi["eventToTask"]>(
    async (eventId, options = {}) => {
      const event = findItem("calendar", eventId) as CalendarEvent | undefined;
      if (!event || event.trash) return null;
      if (event.kind !== "일정") {
        notify("일정만 할 일로 옮길 수 있습니다.", "error");
        return null;
      }
      const date = options.date ?? event.date ?? todayISO();
      const projectId = options.projectId === undefined ? event.projectIds[0] ?? null : options.projectId;
      const status = eventStatus(event);
      const created = await create("projects", {
        title: event.title,
        kind: "할 일",
        category: currentCalendarCategory(event.category),
        status,
        date,
        startTime: event.allDay ? null : event.startTime,
        endTime: event.allDay ? null : event.endTime,
        due: null,
        doneAt: status === "완료" ? todayISO() : null,
        cancelReason: event.cancelReason ?? "",
        hidden: event.hidden,
        favorite: event.favorite,
        memo: event.memo,
        ...(event.memoRich ? { memoRich: event.memoRich } : {}),
        projectIds: projectId ? [projectId] : [],
      });
      if (!created) return null;
      const trashed = await update("calendar", event.id, { trash: true });
      if (!trashed) {
        await rollback("projects", created.id);
        notify("할 일로 옮기지 못했습니다. 원래대로 두었습니다.", "error");
        return null;
      }
      notify("일정을 할 일로 옮겼습니다.");
      return created as ProjectTask;
    },
    [create, findItem, notify, rollback, update],
  );

  const taskToEvent = useCallback<ConvertApi["taskToEvent"]>(
    async (taskId, options = {}) => {
      const task = findItem("projects", taskId) as ProjectTask | undefined;
      if (!task || task.trash) return null;
      if (task.kind !== "할 일") {
        notify("할 일만 일정으로 옮길 수 있습니다.", "error");
        return null;
      }
      const date = options.date ?? task.date ?? todayISO();
      const allDay = options.allDay ?? !task.startTime;
      const startTime = allDay ? null : options.startTime ?? task.startTime ?? "09:00";
      // 시간표에 놓을 때: 원래 정해 둔 길이를 지키고, 없으면 한 시간으로 잡습니다.
      const kept = minutesOf(task.startTime);
      const keptEnd = minutesOf(task.endTime);
      const duration = kept !== null && keptEnd !== null ? Math.max(15, keptEnd - kept) : 60;
      const endTime = allDay
        ? null
        : options.endTime ?? (startTime ? addMinutes(startTime, duration) : null);
      const canceled = task.status === "취소";
      const done = task.status === "완료";
      const created = await create("calendar", {
        title: task.title,
        kind: "일정" as const,
        // 사용자가 만든 분류도 이름 그대로 옮깁니다(Notion select 가 그 이름을 받습니다).
        category: task.category as CalendarCategory,
        date,
        allDay,
        startTime,
        endTime,
        endDate: date,
        done,
        canceled,
        cancelReason: task.cancelReason ?? "",
        cancelAt: canceled ? task.cancelAt ?? todayISO() : null,
        weekKey: "",
        baseDate: null,
        hidden: task.hidden,
        favorite: task.favorite,
        memo: task.memo,
        ...(task.memoRich ? { memoRich: task.memoRich } : {}),
        projectIds: task.projectIds ?? [],
      });
      if (!created) return null;
      const trashed = await update("projects", task.id, { trash: true });
      if (!trashed) {
        await rollback("calendar", created.id);
        notify("일정으로 옮기지 못했습니다. 원래대로 두었습니다.", "error");
        return null;
      }
      notify("할 일을 일정으로 옮겼습니다.");
      return created as CalendarEvent;
    },
    [create, findItem, notify, rollback, update],
  );

  return { eventToTask, taskToEvent };
}
