"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { Drawer, EmptyState, Segmented } from "@/components/common/primitives";
import { taskTone } from "@/components/common/tone";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/date";
import type { ProjectTask } from "@/lib/types";
import { TaskRow } from "@/components/projects/TaskRow";
import { RichText } from "@/components/common/rich";
import { reorderSameDate, sortProjectTaskList, taskSortDate } from "@/lib/order";

type Filter = "all" | "ing" | "done";

export function ProjectDrawer({
  projectId,
  onClose,
  onOpenTask,
  onEditProject,
  showBackdrop = true,
}: {
  projectId: string | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onEditProject: (id: string) => void;
  showBackdrop?: boolean;
}) {
  const { data, create, update, remove } = useData();
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const project = projectId ? data.projects.find((item) => item.id === projectId && item.kind === "프로젝트") ?? null : null;
  const tasks = sortProjectTaskList(
    project ? data.projects.filter((task) => task.kind === "할 일" && task.projectIds.includes(project.id) && !task.trash) : [],
  );
  const done = tasks.filter((task) => task.status === "완료").length;
  const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const filtered = tasks.filter((task) => {
    if (filter === "ing") return task.status !== "완료" && task.status !== "취소";
    if (filter === "done") return task.status === "완료";
    return true;
  });

  /** A10: a drag may reorder only items that share a date, so the date order never breaks. */
  const moveWithinDate = (movedId: string, targetId: string) => {
    if (movedId === targetId) return;
    const moved = tasks.find((task) => task.id === movedId);
    const target = tasks.find((task) => task.id === targetId);
    if (!moved || !target) return;
    if (taskSortDate(moved) !== taskSortDate(target)) return;
    const group = tasks.filter((task) => taskSortDate(task) === taskSortDate(moved));
    for (const change of reorderSameDate(group, movedId, targetId)) {
      const current = group.find((task) => task.id === change.id);
      if (current && current.sort !== change.sort) void update("projects", change.id, { sort: change.sort });
    }
  };

  const toggle = (task: ProjectTask) =>
    void update("projects", task.id, {
      status: task.status === "완료" ? "미완료" : "완료",
      doneAt: task.status === "완료" ? null : todayISO(),
    });

  const addTask = async () => {
    if (!project || !draft.trim() || busy) return;
    setBusy(true);
    await create("projects", {
      title: draft.trim(),
      kind: "할 일",
      category: project.category,
      status: "미완료",
      date: todayISO(),
      projectIds: [project.id],
    });
    setDraft("");
    setBusy(false);
  };

  return (
    <Drawer
      open={!!project}
      onClose={onClose}
      title={project?.title ?? ""}
      subtitle={project ? `${project.category} · ${project.status}` : ""}
      width="lg"
      showBackdrop={showBackdrop}
      footer={
        project ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                void remove("projects", project.id);
                onClose();
              }}
              className="btn-ghost btn-xs text-rose-500 hover:bg-rose-50"
            >
              삭제
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => onEditProject(project.id)} className="btn-outline btn-xs">
                프로젝트 수정
              </button>
              <button type="button" onClick={onClose} className="btn-primary btn-xs">
                닫기
              </button>
            </div>
          </div>
        ) : null
      }
    >
      {project ? (
        <div className="space-y-4">
          {project.memo ? (
            <p className="rounded-xl bg-paper-100/70 px-3 py-2 text-[0.8rem] leading-relaxed text-ink-600">
              <RichText spans={project.memoRich} value={project.memo} />
            </p>
          ) : null}

          <div>
            <div className="mb-1 flex items-center justify-between text-[0.68rem] text-ink-500">
              <span>
                완료 {done} / 전체 {tasks.length}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-paper-200">
              <div className="h-full rounded-full bg-sage-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              size="sm"
              options={[
                { value: "all", label: `전체 ${tasks.length}` },
                { value: "ing", label: `진행 ${tasks.filter((task) => task.status !== "완료" && task.status !== "취소").length}` },
                { value: "done", label: `완료 ${done}` },
              ]}
            />
            <span className={cn("chip", taskTone(project.category).bg, taskTone(project.category).text)}>
              {project.category}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="아직 할 일이 없습니다"
              description="아래 칸에 적고 Enter를 누르면 이 프로젝트에 바로 담깁니다."
              icon={<PlusIcon size={20} />}
            />
          ) : (
            <ul className="divide-y divide-paper-300/40">
              {filtered.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  draggable
                  onDragStart={() => setDragId(task.id)}
                  onDrop={() => {
                    if (dragId) moveWithinDate(dragId, task.id);
                    setDragId(null);
                  }}
                  onOpen={() => onOpenTask(task.id)}
                  onToggle={() => toggle(task)}
                />
              ))}
            </ul>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addTask();
            }}
            className="flex items-center gap-2 rounded-xl border border-paper-300 bg-paper-50/60 px-2 py-0.5"
          >
            <PlusIcon size={13} className="flex-none text-ink-400" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="할 일을 적고 Enter"
              className="min-w-0 flex-1 border-none bg-transparent px-1 py-1 text-[0.78rem] outline-none placeholder:text-ink-400"
            />
            <button type="submit" disabled={!draft.trim() || busy} className="btn-primary btn-xs flex-none whitespace-nowrap">
              추가
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5 text-[0.64rem] text-ink-400">
            {project.due ? <span>마감 {project.due}</span> : null}
            {project.hidden ? <span className="chip bg-paper-200 text-ink-500">숨김</span> : null}
            {project.history ? <span className="chip bg-paper-200 text-ink-500">History</span> : null}
          </div>

          {tasks.length > 0 && tasks.every((task) => task.status === "완료") ? (
            <p className="flex items-center gap-1 text-[0.7rem] text-sage-500">
              <CheckIcon size={12} /> 모든 할 일을 마쳤습니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
