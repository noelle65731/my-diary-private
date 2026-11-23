"use client";

import type { ProjectTask } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatShort, timeRangeLabel, todayISO, weekdayKo } from "@/lib/date";
import { taskTone } from "@/components/common/tone";
import { useCategoryColors } from "@/state/category-colors";
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
  onPointerDragStart,
  trailing,
  className,
  dropAttrs,
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
  /** A45: 서래에서 손끝·마우스로 꾸울어 다른 프로젝트로 보내는 끌기. */
  onPointerDragStart?: (event: React.PointerEvent<HTMLElement>) => void;
  /** A45: 줄 오른쪽에 붙는 버튼(빠른 `이동`). */
  trailing?: React.ReactNode;
  className?: string;
  /** A45: 드롭 자리 표시(`data-drop-*`)를 줄 자체에 붙입니다. */
  dropAttrs?: Record<string, string>;
}) {
  const categoryColor = useCategoryColors();
  const done = task.status === "완료";
  const overdue = task.due && task.due < todayISO() && !done && task.status !== "취소";
  return (
    <li
      data-task-row={task.id}
      {...dropAttrs}
      className={cn("group relative flex items-start gap-2", compact ? "py-1" : "py-1.5", className)}
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
        data-on={done ? "true" : undefined}
        className={cn(
          "chk mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border",
          done ? "border-sage-400 bg-sage-400 text-white" : "border-paper-400 hover:border-ink-600",
        )}
      >
        {done ? <CheckIcon size={10} /> : null}
      </button>
      <button type="button" onClick={onOpen} onPointerDown={onPointerDragStart} className="min-w-0 flex-1 text-left">
        <span className={cn("flex items-center gap-1 truncate text-[calc(15px*var(--fs))] text-ink-800", (done || task.status === "취소") && "text-ink-400 line-through")}>
          {task.urgent ? <FlagIcon size={11} className="flex-none text-rose-400" /> : null}
          <span className="truncate">{task.title}</span>
        </span>
        {/* A5: '기타' keeps its own line breaks and partial links in the project list. */}
        {!compact && task.memo ? (
          <RichText
            spans={task.memoRich}
            value={task.memo}
            links={false}
            className="mt-0.5 line-clamp-2 block text-[calc(14px*var(--fs))] leading-snug text-ink-400"
          />
        ) : null}
        {!compact ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[calc(13px*var(--fs))] text-ink-400">
            <span className={cn("chip py-0", categoryColor.toneOf(task.category, taskTone(task.category)).bg, categoryColor.toneOf(task.category, taskTone(task.category)).text)}>{task.category}</span>
            {showProjectName ? <span className="truncate">{showProjectName}</span> : null}
            {task.date ? (
              <span>
                {formatShort(task.date)} {weekdayKo(task.date)}
                {task.startTime ? ` ${timeRangeLabel(task.startTime, task.endTime)}` : ""}
              </span>
            ) : null}
            {task.due ? (
              <span className={cn(overdue && "font-medium text-rose-500")}>
                마감 {formatShort(task.due)}
              </span>
            ) : null}
            {task.status === "대기 중" ? (
              <span className="chip bg-amber-100 text-amber-700">{task.waitFor ? `${task.waitFor} 대기` : "대기 중"}</span>
            ) : null}
            {task.status === "취소" ? (
              <span data-cancel-badge="true" className="rounded bg-ink-900/[0.12] px-1 text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] tracking-tight text-ink-800">
                취소
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      {trailing}
    </li>
  );
}
