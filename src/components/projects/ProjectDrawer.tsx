"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useCategoryOptions } from "@/state/categories";
import { Drawer, EmptyState, Segmented } from "@/components/common/primitives";
import { taskTone } from "@/components/common/tone";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/date";
import type { ProjectTask } from "@/lib/types";
import { TaskRow } from "@/components/projects/TaskRow";
import { ProjectIcon, ProjectIconPicker } from "@/components/common/ProjectIcon";
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
  const { addCategory } = useSettings();
  /** A16: 이 화면에서 바로 분류를 바꾸거나 새로 만듭니다. */
  const categories = useCategoryOptions();
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
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
      title={
        project ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIconOpen((open) => !open)}
              className="flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-lg bg-paper-200 text-[16px] transition hover:bg-paper-300"
              aria-label="프로젝트 아이콘 바꾸기"
              title="아이콘 바꾸기"
            >
              <ProjectIcon icon={project.icon} seed={project.id} category={project.category} className="h-full w-full" />
            </button>
            <span className="truncate">{project.title}</span>
          </span>
        ) : (
          ""
        )
      }
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
              <button
                type="button"
                onClick={() => void update("projects", project.id, { history: !project.history, hidden: false })}
                className={cn("btn-ghost btn-xs", project.history && "text-ink-900")}
                aria-pressed={!!project.history}
              >
                {project.history ? "히스토리에서 꺼내기" : "히스토리로 보내기"}
              </button>
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
            <p className="rounded-xl bg-paper-100/70 px-3 py-2 text-[15px] leading-relaxed text-ink-600">
              <RichText spans={project.memoRich} value={project.memo} />
            </p>
          ) : null}

          <div>
            <div className="mb-1 flex items-center justify-between text-[14px] text-ink-500">
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

          {/* A16: 분류를 이 화면에서 바로 바꾸고, 없으면 새로 만듭니다. */}
          <div className="flex flex-wrap items-center gap-1">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => void update("projects", project.id, { category })}
                className={cn(
                  "rounded-full px-2 py-[2px] text-[13.5px] font-medium transition",
                  project.category === category ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/80 hover:text-ink-800",
                )}
                aria-pressed={project.category === category}
              >
                {category}
              </button>
            ))}
            {newCategory === null ? (
              <button
                type="button"
                onClick={() => setNewCategory("")}
                aria-label="분류 새로 추가"
                className="inline-flex h-6 items-center gap-0.5 rounded-full border border-dashed border-paper-400 px-2 text-[13px] text-ink-500 transition hover:border-ink-500 hover:text-ink-900"
              >
                <span className="text-[14px] leading-none">+</span> 분류
              </button>
            ) : (
              <input
                autoFocus
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const name = newCategory.trim();
                    setNewCategory(null);
                    if (!name) return;
                    addCategory(name);
                    void update("projects", project.id, { category: name });
                  }
                  if (event.key === "Escape") setNewCategory(null);
                }}
                onBlur={() => setNewCategory(null)}
                placeholder="새 분류 이름"
                aria-label="새 분류 이름"
                className="input h-6 w-[7rem] py-0 text-[13.5px]"
              />
            )}
          </div>

          {iconOpen ? (
            <div className="rounded-xl border border-paper-300 px-2 py-1.5">
              <ProjectIconPicker
                value={project.icon ?? null}
                onChange={(next) => void update("projects", project.id, { icon: next })}
                seed={project.id}
                category={project.category}
              />
            </div>
          ) : null}

          {/* A16: 프로젝트 수정 창에 들어가지 않고 바로 바꾸는 속성들 */}
          <div className="space-y-1.5 rounded-xl border border-paper-300/80 bg-paper-50/60 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[13px] text-ink-400">상태</span>
              {(["미완료", "대기 중", "완료", "취소"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() =>
                    void update("projects", project.id, {
                      status,
                      doneAt: status === "완료" ? project.doneAt ?? todayISO() : null,
                    })
                  }
                  className={cn(
                    "rounded-full px-2 py-[2px] text-[13px] font-medium transition",
                    project.status === status ? "bg-ink-900 text-white" : "bg-white text-ink-500 ring-1 ring-paper-300 hover:text-ink-800",
                  )}
                  aria-pressed={project.status === status}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[13px] text-ink-400">표시</span>
              {([
                { key: "urgent", label: "긴급", on: project.urgent },
                { key: "important", label: "중요", on: project.important },
                { key: "hidden", label: "NOW 숨김", on: project.hidden },
                { key: "history", label: "히스토리", on: project.history },
              ] as const).map((flag) => (
                <button
                  key={flag.key}
                  type="button"
                  onClick={() => void update("projects", project.id, { [flag.key]: !flag.on })}
                  className={cn(
                    "rounded-full px-2 py-[2px] text-[13px] font-medium transition",
                    flag.on ? "bg-ink-900 text-white" : "bg-white text-ink-500 ring-1 ring-paper-300 hover:text-ink-800",
                  )}
                  aria-pressed={flag.on}
                >
                  {flag.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] text-ink-400">날짜</span>
              <input
                type="date"
                value={project.date ?? ""}
                onChange={(event) => void update("projects", project.id, { date: event.target.value || null })}
                className="input h-7 w-[8.4rem] py-0 text-[13px]"
                aria-label="프로젝트 날짜"
              />
              <span className="text-[13px] text-ink-400">마감</span>
              <input
                type="date"
                value={project.due ?? ""}
                onChange={(event) => void update("projects", project.id, { due: event.target.value || null })}
                className="input h-7 w-[8.4rem] py-0 text-[13px]"
                aria-label="프로젝트 마감일"
              />
            </div>
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
              className="min-w-0 flex-1 border-none bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-ink-400"
            />
            <button type="submit" disabled={!draft.trim() || busy} className="btn-primary btn-xs flex-none whitespace-nowrap">
              추가
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5 text-[13.5px] text-ink-400">
            {project.due ? <span>마감 {project.due}</span> : null}
            {project.hidden ? <span className="chip bg-paper-200 text-ink-500">숨김</span> : null}
            {project.history ? <span className="chip bg-paper-200 text-ink-500">History</span> : null}
          </div>

          {tasks.length > 0 && tasks.every((task) => task.status === "완료") ? (
            <p className="flex items-center gap-1 text-[14px] text-sage-500">
              <CheckIcon size={12} /> 모든 할 일을 마쳤습니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
