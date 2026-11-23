"use client";

import { useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useUi } from "@/state/ui";
import { useCategoryOptions } from "@/state/categories";
import { Drawer, EmptyState, Segmented } from "@/components/common/primitives";
import { taskTone } from "@/components/common/tone";
import { useCategoryColors } from "@/state/category-colors";
import { PASTELS } from "@/components/common/pastels";
import { useProjectColors } from "@/state/project-colors";
import { CheckIcon, InboxIcon, MoveIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { cn, matchesMode } from "@/lib/utils";
import { todayISO } from "@/lib/date";
import type { ModeFilter, ProjectTask, TaskCategory } from "@/lib/types";
import { TaskRow } from "@/components/projects/TaskRow";
import { ProjectIcon, ProjectIconPicker } from "@/components/common/ProjectIcon";
import { RichText } from "@/components/common/rich";
import { reorderSameDate, sortProjectTaskList, taskSortDate } from "@/lib/order";
import { useDnd } from "@/components/common/dnd";

type Filter = "all" | "ing" | "done";

/**
 * A38: index 카드도 프로젝트 카드처럼 이 서랍으로 열립니다. 프로젝트 id 와 겹치지 않는 값을
 * 하나 정해 두고, 서랍은 이 값일 때 '분류되지 않은 할 일' 목록을 보여 줍니다.
 */
export const INDEX_DRAWER_ID = "__index__";
/** 서랍에서 새로 담는 index 할 일의 기본 분류 — 카드의 빠른 추가와 같은 '개인'입니다. */
const INDEX_CATEGORY: TaskCategory = "개인";

export function ProjectDrawer({
  projectId,
  mode = "all",
  onClose,
  onOpenTask,
  onEditProject,
  showBackdrop = true,
  onDragHiddenChange,
}: {
  projectId: string | null;
  /** A38: index 서랍은 카드와 같은 목록을 보여 줘야 해서 지금 화면의 분류 필터를 그대로 받습니다. */
  mode?: ModeFilter;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onEditProject: (id: string) => void;
  showBackdrop?: boolean;
  /** A45: 서랍 안에서 끌기가 시작되면 서랍·어두운 배경을 감춥니다(바깥 배경도 같이). */
  onDragHiddenChange?: (hidden: boolean) => void;
}) {
  const { data, create, update, remove } = useData();
  const { settings, addCategory } = useSettings();
  const { notify } = useUi();
  const { pastelOf, chosenOf, setColor } = useProjectColors();
  const categoryColor = useCategoryColors();
  /** A16: 이 화면에서 바로 분류를 바꾸거나 새로 만듭니다. */
  const categories = useCategoryOptions();
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** A45: 끄는 동안 서랍과 배경을 감춥니다 — 뒤의 프로젝트 카드에 놓을 수 있게. */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragHidden, setDragHidden] = useState(false);
  /** A45: 연필 옆 작은 `이동` 버튼이 열어 둔 할 일 id. */
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const dnd = useDnd();

  const isIndex = projectId === INDEX_DRAWER_ID;
  const project = !isIndex && projectId ? data.projects.find((item) => item.id === projectId && item.kind === "프로젝트") ?? null : null;
  /**
   * A38: index 서랍의 목록은 index 카드와 같은 조건 — 분류가 없는(projectIds 가 빈) 할 일 중
   * 히스토리로 보내지 않은 것. 카드와 개수가 어긋나지 않게 지금 화면의 분류 필터와
   * NOW 숨김 설정도 카드와 똑같이 적용합니다.
   */
  const indexTasks = data.projects.filter(
    (task) =>
      task.kind === "할 일" &&
      !task.history &&
      task.projectIds.length === 0 &&
      matchesMode(mode, task, task.category) &&
      (!settings.nowOnly || !task.hidden),
  );
  // A28: 서랍에서도 카드와 같은 날짜 방향을 씁니다 — 완료 기록은 늘 아래에 최근 것부터.
  const tasks = sortProjectTaskList(
    isIndex
      ? indexTasks
      : project
        ? data.projects.filter((task) => task.kind === "할 일" && task.projectIds.includes(project.id) && !task.trash)
        : [],
    settings.projectTaskOrder,
  );
  /** A40: 완료와 취소는 함께 '완료' 영역에 — 취소를 완료로 세지 않고 상태 그대로 남깁니다. */
  const completed = tasks.filter((task) => task.status === "완료").length;
  const done = completed + tasks.filter((task) => task.status === "취소").length;
  const openCount = tasks.filter((task) => task.status !== "완료" && task.status !== "취소").length;
  const progress = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  const filtered = tasks.filter((task) => {
    if (filter === "ing") return task.status !== "완료" && task.status !== "취소";
    if (filter === "done") return task.status === "완료" || task.status === "취소";
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

  const toggle = (task: ProjectTask) => {
    // A40: 취소한 일은 누르면 완료로 바뀌지 않습니다 — 상태 그대로, 되돌리기는 상세에서.
    if (task.status === "취소") return;
    void update("projects", task.id, {
      status: task.status === "완료" ? "미완료" : "완료",
      doneAt: task.status === "완료" ? null : todayISO(),
    });
  };

  /** A45: 끄는 동안 서랍·배경을 즉시 감춥니다(뒤의 프로젝트 카드를 그대로 집도록 인라인 스타일). */
  const hideForDrag = () => {
    setDragHidden(true);
    onDragHiddenChange?.(true);
    const node = rootRef.current;
    if (node) {
      // A46: 서랍 안쪽 패널은 `pointer-events-auto` 라서 부모의 none 만으로는 손끝을 계속
      // 가로챕니다. `visibility` 로 통째로 내려야 뒤의 카드가 그 자리에서 잡힙니다.
      node.style.opacity = "0";
      node.style.pointerEvents = "none";
      node.style.visibility = "hidden";
    }
  };
  const restoreAfterDrag = () => {
    setDragHidden(false);
    onDragHiddenChange?.(false);
    const node = rootRef.current;
    if (node) {
      node.style.opacity = "";
      node.style.pointerEvents = "";
      node.style.visibility = "";
    }
  };

  /** A45: 할 일 하나를 프로젝트(또는 index)로 옴깁니다 — 서랍·카드·빠른 이동 버튼이 함께 씁니다. */
  const moveTaskTo = (task: ProjectTask | undefined, targetId: string | null) => {
    if (!task || task.kind !== "할 일") return;
    const project = targetId ? data.projects.find((item) => item.id === targetId && item.kind === "프로젝트") ?? null : null;
    const nextIds = project ? [project.id] : [];
    const currentIds = task.projectIds ?? [];
    if (currentIds.length === nextIds.length && currentIds.every((id, index) => id === nextIds[index])) return;
    void update(
      "projects",
      task.id,
      { projectIds: nextIds, ...(project ? { category: project.category } : {}) },
      { silent: true },
    ).then((ok) => {
      if (!ok) return;
      notify(
        project ? `‘${task.title}’을(를) ${project.title}로 옮겼습니다` : `‘${task.title}’을(를) index 로 옮겼습니다`,
        "success",
      );
    });
  };

  /**
   * A45: 서랍 안 할 일을 꾸우거나 마우스로 끌기 시작하면 서랍과 어두운 배경이 비켜나고, 뒤의
   * 프로젝트 카드·index 에 놓으면 그리로 옴깁니다. iOS 에서도 끊기지 않도록 dnd.tsx 의
   * 터치·포인터 끌기를 그대로 씁니다(기존 HTML5 draggable 대신).
   */
  const startTaskDrag = (event: React.PointerEvent<HTMLElement>, task: ProjectTask) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dnd.start(
      event,
      { kind: "task", id: task.id, label: task.title },
      (target) => {
        if (!target) return;
        if (target.zone === "project-card") {
          const key = target.data.project;
          moveTaskTo(task, key && key !== "index" ? key : null);
          return;
        }
        if (target.zone === "drawer-task" && target.data.task) moveWithinDate(task.id, target.data.task);
      },
      {
        onStart: hideForDrag,
        onEnd: restoreAfterDrag,
        getHint: (target) => {
          if (target.zone === "project-card") {
            const key = target.data.project;
            if (!key) return null;
            const name = key === "index" ? "index" : data.projects.find((item) => item.id === key)?.title ?? "프로젝트";
            return `${name}로 옮기기`;
          }
          if (target.zone === "drawer-task") return "같은 날짜 안에서 순서 바꾸기";
          return null;
        },
      },
    );
  };

  const addTask = async () => {
    if ((!project && !isIndex) || !draft.trim() || busy) return;
    setBusy(true);
    await create("projects", {
      title: draft.trim(),
      kind: "할 일",
      category: project ? project.category : INDEX_CATEGORY,
      status: "미완료",
      date: todayISO(),
      // A38: index 서랍에서 담은 할 일은 분류 없이 바로 index 에 들어갑니다(카드와 같게).
      projectIds: project ? [project.id] : [],
    });
    setDraft("");
    setBusy(false);
  };

  /** 완료 / 전체 와 진행률 — 프로젝트·index 가 같은 규격으로 씁니다. */
  const progressBlock = (
    <div>
      <div className="mb-1 flex items-center justify-between text-[calc(14px*var(--fs))] text-ink-500">
        <span>
          완료 {done} / 전체 {tasks.length}
        </span>
        <span>{progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-200">
        <div className="h-full rounded-full bg-sage-400 transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );

  /** 필터 탭 — 지난(완료한) 할 일도 여기서 한 번에 봅니다. */
  const filterBlock = (
    <div className="flex items-center justify-between gap-2">
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        size="sm"
        options={[
          { value: "all", label: `전체 ${tasks.length}` },
          { value: "ing", label: `진행 ${openCount}` },
          { value: "done", label: `완료·취소 ${done}` },
        ]}
      />
      {project ? (
        <span className={cn("chip", categoryColor.toneOf(project.category, taskTone(project.category)).bg, categoryColor.toneOf(project.category, taskTone(project.category)).text)}>
          {project.category}
        </span>
      ) : (
        <span className="text-[calc(13.5px*var(--fs))] text-ink-400">분류 없음</span>
      )}
    </div>
  );

  const listBlock =
    filtered.length === 0 ? (
      <EmptyState
        title="아직 할 일이 없습니다"
        description={
          isIndex
            ? "아래 칸에 적고 Enter를 누르면 index 에 바로 담깁니다."
            : "아래 칸에 적고 Enter를 누르면 이 프로젝트에 바로 담깁니다."
        }
        icon={<PlusIcon size={20} />}
      />
    ) : (
      <ul className="divide-y divide-paper-300/40">
        {filtered.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            className={moveFor === task.id ? "z-20 bg-white" : undefined}
            dropAttrs={{ "data-drop-zone": "drawer-task", "data-drop-task": task.id }}
            onPointerDragStart={(event) => startTaskDrag(event, task)}
            onOpen={() => onOpenTask(task.id)}
            onToggle={() => toggle(task)}
            trailing={
              <button
                type="button"
                data-task-move={task.id}
                aria-label={`${task.title} 이동`}
                title="다른 프로젝트·index 로 옮기기"
                onClick={() => setMoveFor((current) => (current === task.id ? null : task.id))}
                className={cn(
                  "flex h-6 flex-none items-center gap-0.5 rounded-full px-1.5 text-[calc(12.5px*var(--fs))] transition",
                  moveFor === task.id ? "bg-ink-900 text-white" : "text-ink-400 hover:bg-paper-200 hover:text-ink-800",
                )}
              >
                <MoveIcon size={11} /> 이동
              </button>
            }
          />
        ))}
      </ul>
    );

  /** A45: 연필 옆 `이동` 이 여는 프로젝트 목록 — 한 번 탭으로 확실하게 옮깁니다. */
  const moveMenu = moveFor ? (
    <div
      data-task-move-menu={moveFor}
      role="menu"
      aria-label="옮길 곳 고르기"
      className="fixed inset-x-3 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-paper-300 bg-white p-1.5 shadow-lift sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-56"
    >
      <p className="px-2 py-1 text-[calc(12.5px*var(--fs))] text-ink-400">옮길 곳</p>
      {[
        { id: null as string | null, label: "index (분류 없음)" },
        ...data.projects
          .filter((item) => item.kind === "프로젝트" && !item.trash)
          .map((item) => ({ id: item.id as string | null, label: item.title })),
      ].map((option) => {
        const task = data.projects.find((item) => item.id === moveFor) ?? null;
        const active = option.id ? (task?.projectIds ?? []).includes(option.id) : (task?.projectIds ?? []).length === 0;
        return (
          <button
            key={option.id ?? "index"}
            type="button"
            role="menuitem"
            data-move-target={option.id ?? "index"}
            onClick={() => {
              moveTaskTo(task ?? undefined, option.id);
              setMoveFor(null);
            }}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[calc(14px*var(--fs))] transition",
              active ? "bg-paper-200 text-ink-900" : "text-ink-700 hover:bg-paper-100",
            )}
          >
            {option.id ? <span className="h-2 w-2 flex-none rounded-full bg-sage-400" /> : <InboxIcon size={12} />}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {active ? <CheckIcon size={11} className="flex-none text-ink-500" /> : null}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setMoveFor(null)}
        className="mt-0.5 w-full rounded-lg px-2 py-1 text-center text-[calc(13px*var(--fs))] text-ink-400 hover:bg-paper-100"
      >
        닫기
      </button>
    </div>
  ) : null;

  const addForm = (
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
        aria-label={isIndex ? "index 에 할 일 추가" : "이 프로젝트에 할 일 추가"}
        className="min-w-0 flex-1 border-none bg-transparent px-1 py-1 text-[calc(15px*var(--fs))] outline-none placeholder:text-ink-400"
      />
      <button type="submit" disabled={!draft.trim() || busy} className="btn-primary btn-xs flex-none whitespace-nowrap">
        추가
      </button>
    </form>
  );

  return (
    <Drawer
      open={!!project || isIndex}
      onClose={onClose}
      rootRef={rootRef}
      hidden={dragHidden}
      title={
        project ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIconOpen((open) => !open)}
              className="flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-lg bg-paper-200 text-[calc(16px*var(--fs))] transition hover:bg-paper-300"
              aria-label="프로젝트 아이콘 바꾸기"
              title="아이콘 바꾸기"
            >
              <ProjectIcon icon={project.icon} seed={project.id} category={project.category} className="h-full w-full" />
            </button>
            <span className="truncate">{project.title}</span>
          </span>
        ) : isIndex ? (
          <span className="flex items-center gap-2" data-index-drawer-title="true">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-paper-200 text-ink-500">
              <InboxIcon size={14} />
            </span>
            <span className="truncate">index</span>
          </span>
        ) : (
          ""
        )
      }
      subtitle={project ? `${project.category} · ${project.status}` : isIndex ? "아직 분류되지 않은 할 일" : ""}
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
              className="trash-btn btn-ghost btn-xs flex items-center gap-1 text-rose-500 hover:bg-rose-50"
            >
              <TrashIcon size={12} /> 삭제
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
        ) : isIndex ? (
          // A38: index 는 프로젝트가 아니라서 삭제·히스토리·수정 없이 닫기만 둡니다.
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="btn-primary btn-xs">
              닫기
            </button>
          </div>
        ) : null
      }
    >
      {project ? (
        <div className="space-y-4">
          {/* 프로젝트 색 — 자동 배정된 파스텔을 직접 바꿀 수 있습니다. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[calc(13.5px*var(--fs))] text-ink-400">색</span>
            {PASTELS.map((pastel) => {
              const active = chosenOf(project.id) === pastel.key;
              return (
                <button
                  key={pastel.key}
                  type="button"
                  data-project-color={pastel.key}
                  onClick={() => setColor(project.id, pastel.key)}
                  aria-label={pastel.label}
                  aria-pressed={active}
                  title={pastel.label}
                  className={cn(
                    "h-6 w-6 rounded-full border border-black/5 transition",
                    pastel.dot,
                    active ? "ring-2 ring-ink-900 ring-offset-1" : "hover:scale-110",
                  )}
                />
              );
            })}
            <button
              type="button"
              onClick={() => setColor(project.id, null)}
              className="ml-1 rounded-full bg-paper-200 px-2 py-[2px] text-[calc(12.5px*var(--fs))] text-ink-500 transition hover:bg-paper-300"
            >
              자동
            </button>
            <span className="text-[calc(12.5px*var(--fs))] text-ink-400">{pastelOf(project.id).label}</span>
          </div>

          {project.memo ? (
            <p className="rounded-xl bg-paper-100/70 px-3 py-2 text-[calc(15px*var(--fs))] leading-relaxed text-ink-600">
              <RichText spans={project.memoRich} value={project.memo} />
            </p>
          ) : null}

          {progressBlock}

          {filterBlock}

          {/* A16: 분류를 이 화면에서 바로 바꾸고, 없으면 새로 만듭니다. */}
          <div className="flex flex-wrap items-center gap-1">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => void update("projects", project.id, { category })}
                className={cn(
                  "rounded-full px-2 py-[2px] text-[calc(13.5px*var(--fs))] font-medium transition",
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
                className="inline-flex h-6 items-center gap-0.5 rounded-full border border-dashed border-paper-400 px-2 text-[calc(13px*var(--fs))] text-ink-500 transition hover:border-ink-500 hover:text-ink-900"
              >
                <span className="text-[calc(14px*var(--fs))] leading-none">+</span> 분류
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
                className="input h-6 w-[7rem] py-0 text-[calc(13.5px*var(--fs))]"
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
              <span className="mr-1 text-[calc(13px*var(--fs))] text-ink-400">상태</span>
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
                    "rounded-full px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium transition",
                    project.status === status ? "bg-ink-900 text-white" : "bg-white text-ink-500 ring-1 ring-paper-300 hover:text-ink-800",
                  )}
                  aria-pressed={project.status === status}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[calc(13px*var(--fs))] text-ink-400">표시</span>
              {/* A41: 긴급·중요는 개별 할 일에만 — 프로젝트 서랍에서는 NOW 숨김·히스토리만 둡니다. */}
              {([
                { key: "hidden", label: "NOW 숨김", on: project.hidden },
                { key: "history", label: "히스토리", on: project.history },
              ] as const).map((flag) => (
                <button
                  key={flag.key}
                  type="button"
                  onClick={() => void update("projects", project.id, { [flag.key]: !flag.on })}
                  className={cn(
                    "rounded-full px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium transition",
                    flag.on ? "bg-ink-900 text-white" : "bg-white text-ink-500 ring-1 ring-paper-300 hover:text-ink-800",
                  )}
                  aria-pressed={flag.on}
                >
                  {flag.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[calc(13px*var(--fs))] text-ink-400">날짜</span>
              <input
                type="date"
                value={project.date ?? ""}
                onChange={(event) => void update("projects", project.id, { date: event.target.value || null })}
                className="input h-7 w-[8.4rem] py-0 text-[calc(13px*var(--fs))]"
                aria-label="프로젝트 날짜"
              />
              <span className="text-[calc(13px*var(--fs))] text-ink-400">마감</span>
              <input
                type="date"
                value={project.due ?? ""}
                onChange={(event) => void update("projects", project.id, { due: event.target.value || null })}
                className="input h-7 w-[8.4rem] py-0 text-[calc(13px*var(--fs))]"
                aria-label="프로젝트 마감일"
              />
            </div>
          </div>

          {listBlock}

          {addForm}

          <div className="flex flex-wrap gap-1.5 text-[calc(13.5px*var(--fs))] text-ink-400">
            {project.due ? <span>마감 {project.due}</span> : null}
            {project.hidden ? <span className="chip bg-paper-200 text-ink-500">숨김</span> : null}
            {project.history ? <span className="chip bg-paper-200 text-ink-500">History</span> : null}
          </div>

          {tasks.length > 0 && tasks.every((task) => task.status === "완료") ? (
            <p className="flex items-center gap-1 text-[calc(14px*var(--fs))] text-sage-500">
              <CheckIcon size={12} /> 모든 할 일을 마쳤습니다.
            </p>
          ) : null}

          {moveMenu}
        </div>
      ) : isIndex ? (
        /* A38: index 서랍 — 분류되지 않은 할 일의 지난 기록까지 한 화면에서 봅니다. */
        <div className="space-y-4" data-index-drawer="true">
          {progressBlock}

          {filterBlock}

          {listBlock}

          {addForm}

          <p className="text-[calc(13.5px*var(--fs))] leading-relaxed text-ink-400">
            여기서 담은 할 일은 프로젝트 없이 index 에 남습니다. 카드로 끌어 프로젝트에 옮길 수 있습니다.
          </p>

          {tasks.length > 0 && tasks.every((task) => task.status === "완료") ? (
            <p className="flex items-center gap-1 text-[calc(14px*var(--fs))] text-sage-500">
              <CheckIcon size={12} /> 모든 할 일을 마쳤습니다.
            </p>
          ) : null}

          {moveMenu}
        </div>
      ) : null}
    </Drawer>
  );
}
