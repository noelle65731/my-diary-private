"use client";

import type { ProjectTask } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatShort, todayISO, weekdayKo } from "@/lib/date";
import { taskTone } from "@/components/common/tone";
import { CheckIcon, FlagIcon } from "@/components/icons";
import { RichText } from "@/components/common/rich";

export function TaskRow({
  task,
  onOpen,
  onToggle,
  compact = false,
  showProjectName,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  task: ProjectTask;
  onOpen: () => void;
  onToggle: () => void;
  compact?: boolean;
  showProjectName?: string | null;
  /** A10: same-date manual ordering inside a project's task list. */
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
}) {
  const done = task.status === "완료";
  const overdue = task.due && task.due < todayISO() && !done && task.status !== "취소";
  return (
    <li
      className={cn("group flex items-start gap-2", compact ? "py-1" : "py-1.5")}
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              event.dataTransfer.setData("text/diary-task-order", task.id);
              event.dataTransfer.effectAllowed = "move";
              onDragStart?.();
            }
          : undefined
      }
      onDragOver={
        draggable
          ? (event) => {
              if (!event.dataTransfer.types.includes("text/diary-task-order")) return;
              event.preventDefault();
              onDragOver?.();
            }
          : undefined
      }
      onDrop={
        draggable
          ? (event) => {
              if (!event.dataTransfer.types.includes("text/diary-task-order")) return;
              event.preventDefault();
              onDrop?.();
            }
          : undefined
      }
      title={draggable ? "같은 날짜 안에서 끌어 순서 바꾸기" : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? "완료 취소" : "완료"}
        className={cn(
          "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border transition",
          done ? "border-sage-400 bg-sage-400 text-white" : "border-paper-400 hover:border-ink-600",
        )}
      >
        {done ? <CheckIcon size={10} /> : null}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn("flex items-center gap-1 truncate text-[15px] text-ink-800", done && "text-ink-400 line-through")}>
          {task.urgent ? <FlagIcon size={11} className="flex-none text-rose-400" /> : null}
          <span className="truncate">{task.title}</span>
        </span>
        {/* A5: '기타' keeps its own line breaks and partial links in the project list. */}
        {!compact && task.memo ? (
          <RichText
            spans={task.memoRich}
            value={task.memo}
            links={false}
            className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-ink-400"
          />
        ) : null}
        {!compact ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-400">
            <span className={cn("chip py-0", taskTone(task.category).bg, taskTone(task.category).text)}>{task.category}</span>
            {showProjectName ? <span className="truncate">{showProjectName}</span> : null}
            {task.date ? <span>{formatShort(task.date)} {weekdayKo(task.date)}</span> : null}
            {task.due ? (
              <span className={cn(overdue && "font-medium text-rose-500")}>
                마감 {formatShort(task.due)}
              </span>
            ) : null}
            {task.status === "대기 중" ? (
              <span className="chip bg-amber-100 text-amber-700">{task.waitFor ? `${task.waitFor} 대기` : "대기 중"}</span>
            ) : null}
            {task.status === "취소" ? <span className="text-ink-300">취소됨</span> : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}
