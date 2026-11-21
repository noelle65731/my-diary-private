"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useProjectColors } from "@/state/project-colors";
import { PASTELS } from "@/components/common/pastels";
import { useSettings } from "@/state/settings";
import { useCategoryOptions } from "@/state/categories";
import { useTabReset, useUi } from "@/state/ui";
import { cn, categoryNameOf, matchesMode } from "@/lib/utils";
import { formatShort, startOfWeekISO, timeRangeLabel, todayISO, weekdayKo } from "@/lib/date";
import { type ModeFilter, type ProjectTask, type Routine, type TaskCategory } from "@/lib/types";
import { PRIORITY_TONES, priorityOf, routineTone, taskTone } from "@/components/common/tone";
import { useCategoryColors } from "@/state/category-colors";
import { ProjectIcon } from "@/components/common/ProjectIcon";
import { CheckIcon, ChevronRightIcon, EyeIcon, InboxIcon, PlusIcon, RepeatIcon, TrashIcon } from "@/components/icons";
import { ModeChips } from "@/components/common/ModeChips";
import { ProjectDrawer } from "@/components/projects/ProjectDrawer";
import { TaskEditor } from "@/components/editors/TaskEditor";
import { TaskDetail } from "@/components/detail/TaskDetail";
import { RoutineEditor } from "@/components/editors/RoutineEditor";
import { routineCountForDay } from "@/components/calendar/calendar-utils";
import { writeRoutineNow } from "@/lib/routine-now";
import { sortProjectTaskList, sortTasksByDate } from "@/lib/order";

type ProjectView = "tracks" | "priority" | "history" | "journal";
/** A card keeps five open tasks in view — fewer than four hid the work that was left. */
const CARD_OPEN_PREVIEW = 5;
/** A19: 기본 보기의 '최근 기록'은 최근 완료한 할 일 두 개까지. */
const RECENT_LOG_MAX = 2;

const WEEKDAY_LETTERS = ["월", "화", "수", "목", "금", "토", "일"];
/** A27: 루틴 카드 한 장에 들어가는 루틴 수. */
const ROUTINES_PER_CARD = 3;

function dateLabel(date: string | null): string {
  if (!date) return "";
  return `${formatShort(date)} ${weekdayKo(date)}`;
}

/** A26: 완료한 할 일의 기록 줄 — 끝낸 날(없으면 잡아 둔 날)에 시간이 있으면 시간까지 붙입니다. */
function recordDateLabel(task: ProjectTask): string {
  const day = dateLabel(task.doneAt?.slice(0, 10) ?? task.date);
  const time = timeRangeLabel(task.startTime, task.endTime);
  return time ? `${day} ${time}` : day;
}

/** The date a task row shows, plus its 시작~종료 when that date is the task's own day. */
function taskDateLabel(task: ProjectTask): string {
  const shown = task.due ?? task.date;
  if (!shown) return "";
  const day = dateLabel(shown);
  const time = shown === task.date ? timeRangeLabel(task.startTime, task.endTime) : "";
  return time ? `${day} ${time}` : day;
}

export function ProjectsTab() {
  const { data, update, setRoutineCount, create } = useData();
  const { settings, set: setSetting, addCategory, removeCategory } = useSettings();
  // A16: filters and pickers share one 분류 list, so a new one shows up everywhere.
  const categoryOptions = useCategoryOptions();
  const { focus, clearFocus, openTrash, views, setView: setTabView } = useUi();

  // A15: tracks / priority / history is kept in the shared UI state for 뒤로 가기.
  const view = ((views.projects || "tracks") as ProjectView);
  const setView = (next: ProjectView) => setTabView("projects", next);
  /** A12: 3~4 cards per row — the user picks how wide each card reads. */
  const [cols, setCols] = useState<3 | 4>(() => {
    if (typeof window === "undefined") return 4;
    return window.localStorage.getItem("my-diary:project-cols:v1") === "3" ? 3 : 4;
  });
  const pickCols = (next: 3 | 4) => {
    setCols(next);
    try {
      window.localStorage.setItem("my-diary:project-cols:v1", String(next));
    } catch {
      /* ignore */
    }
  };
  // A6: 전체(all) is the default filter on every device.
  const [mode, setMode] = useState<ModeFilter>("all");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<{
    kind?: "할 일" | "프로젝트";
    category?: TaskCategory;
    projectId?: string;
    urgent?: boolean;
    important?: boolean;
  } | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(null);
  /** A24: 우선순위 탭에만 걸리는 기간 — 다른 보기를 다녀와도 이 화면에서만 유지됩니다. */
  const [priorityRange, setPriorityRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState<TaskCategory>("개인");
  const [busy, setBusy] = useState(false);
  /**
   * A4: the open detail registers its save-and-validate step here, so tapping another
   * task in the right list stores what changed before the centre swaps.
   */
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const registerFlush = (flush: (() => Promise<boolean>) | null) => {
    flushRef.current = flush;
  };

  const openTask = async (id: string) => {
    if (id === taskId) return;
    if (flushRef.current) {
      const ok = await flushRef.current();
      if (!ok) return;
    }
    setTaskDraft(null);
    setTaskId(id);
  };

  useEffect(() => {
    if (!focus) return;
    if (focus.resource === "projects") {
      const item = data.projects.find((task) => task.id === focus.id);
      if (item) {
        if (item.kind === "프로젝트") setProjectId(item.id);
        else void openTask(item.id);
      }
    }
    if (focus.resource === "routines") setRoutineId(focus.id);
    clearFocus();
  }, [focus, data.projects, clearFocus]);

  useEffect(() => {
    if (mode !== "now" && mode !== "all" && mode !== "custom") setQuickCategory(categoryNameOf(mode) as TaskCategory);
  }, [mode]);

  useTabReset("projects", () => {
    setView("tracks");
    setMode("all");
    setProjectId(null);
    setTaskId(null);
    setRoutineId(null);
    setQuickTitle("");
  });

  /**
   * A6/A7: projects in History leave the working list, NOW and the new-task choices.
   * A7: 미완료 묶음 → 완료 묶음, oldest first inside each group; `sort` wins when set.
   */
  const projects = useMemo(() => {
    const list = data.projects.filter(
      (task) =>
        task.kind === "프로젝트" &&
        !task.trash &&
        !task.history &&
        (!settings.nowOnly || !task.hidden) &&
        matchesMode(mode, task, task.category),
    );
    const done = (task: ProjectTask) => task.status === "완료" || task.status === "취소";
    return [...list].sort((a, b) => {
      if (done(a) !== done(b)) return done(a) ? 1 : -1;
      if (a.sort !== null && b.sort !== null && a.sort !== b.sort) return a.sort - b.sort;
      if (a.sort !== null && b.sort === null) return -1;
      if (a.sort === null && b.sort !== null) return 1;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }, [data.projects, mode, settings.nowOnly]);
  const hiddenProjectIds = useMemo(
    () => data.projects.filter((project) => project.kind === "프로젝트" && project.hidden).map((project) => project.id),
    [data.projects],
  );
  const tasks = useMemo(
    () =>
      data.projects.filter(
        (task) =>
          task.kind === "할 일" &&
          (!settings.nowOnly || (!task.hidden && !task.projectIds.some((id) => hiddenProjectIds.includes(id)))) &&
          matchesMode(mode, task, task.category),
      ),
    [data.projects, mode, settings.nowOnly, hiddenProjectIds],
  );
  const routines = useMemo(
    () =>
      data.routines.filter(
        (routine) =>
          routine.kind === "루틴" &&
          !routine.history &&
          (!settings.nowOnly || !routine.hidden) &&
          matchesMode(mode, routine, routine.category),
      ),
    [data.routines, mode, settings.nowOnly],
  );

  /**
   * A27: 루틴은 분류별로 카드를 나누지 않고, 지금 필터를 통과한 전체 목록을 순서대로
   * 세 개씩 묶어 카드로 보여 줍니다 — 네 번째 루틴부터 잘려 보이지 않게.
   */
  const orderedRoutines = useMemo(
    () =>
      [...routines].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.createdAt.localeCompare(b.createdAt),
      ),
    [routines],
  );
  const routineChunks = useMemo(() => {
    const chunks: Routine[][] = [];
    for (let i = 0; i < orderedRoutines.length; i += ROUTINES_PER_CARD) {
      chunks.push(orderedRoutines.slice(i, i + ROUTINES_PER_CARD));
    }
    return chunks;
  }, [orderedRoutines]);

  const openTasks = tasks.filter((task) => !task.trash && task.status !== "완료" && task.status !== "취소" && !task.history);
  const inbox = openTasks.filter((task) => task.projectIds.length === 0);
  const projectCount = data.projects.filter((task) => task.kind === "프로젝트" && !task.trash && task.status !== "완료" && task.status !== "취소").length;

  const toggleTask = (task: ProjectTask) =>
    void update("projects", task.id, {
      status: task.status === "완료" ? "미완료" : "완료",
      doneAt: task.status === "완료" ? null : todayISO(),
    });

  /** A7/B7: dragging a card or a routine row rewrites `sort`, so the order survives a reload. */
  const reorder = (list: ProjectTask[], dragId: string, targetId: string) => {
    if (!dragId || !targetId || dragId === targetId) return;
    const ids = list.map((item) => item.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    next.forEach((id, index) => {
      const item = list.find((entry) => entry.id === id);
      if (item && item.sort !== (index + 1) * 10) {
        void update("projects", id, { sort: (index + 1) * 10 });
      }
    });
  };

  /**
   * A25: 카드 사이로 할 일을 끌어 옮깁니다 — 드롭한 카드의 프로젝트로 바로 바뀌고,
   * index 카드에 놓으면 분류 없음(projectIds 빈 값)으로 돌아갑니다.
   * store 의 update 가 먼저 화면을 바꾸고 PATCH 하며, 실패하면 원래 값으로 되돌리고 알립니다.
   */
  const moveTaskToCard = (taskId: string, project: ProjectTask | null) => {
    const task = data.projects.find((item) => item.id === taskId);
    if (!task || task.kind !== "할 일") return;
    const targetIds = project ? [project.id] : [];
    const currentIds = task.projectIds ?? [];
    if (currentIds.length === targetIds.length && currentIds.every((id, index) => id === targetIds[index])) return;
    void update("projects", taskId, {
      projectIds: targetIds,
      // 프로젝트의 분류를 따라가면 카드 색·필터가 어긋나지 않습니다(index 로 뺄 때는 그대로).
      ...(project ? { category: project.category } : {}),
    });
  };

  /** 드롭 대상 카드 강조 — 카드 안 자식 사이를 오갈 때 깜빡이지 않게 깊이를 셉니다. */
  const dragDepth = useRef(0);
  const [dropCard, setDropCard] = useState<string | null>(null);
  const clearDrop = () => {
    dragDepth.current = 0;
    setDropCard(null);
  };
  const dropProps = (key: string, taskDrop: (taskId: string) => void, projectDrop?: (event: React.DragEvent<HTMLElement>) => void) => ({
    onDragEnter: (event: React.DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes("text/diary-task")) return;
      dragDepth.current += 1;
      setDropCard(key);
    },
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      const types = event.dataTransfer.types;
      // preventDefault 없이는 브라우저가 drop 을 보내지 않습니다(프로젝트 순서 변경 드롭도 여기로).
      if (!types.includes("text/diary-task") && !types.includes("text/diary-project")) return;
      event.preventDefault();
      if (!types.includes("text/diary-task")) return;
      event.dataTransfer.dropEffect = "move";
      if (dropCard !== key) setDropCard(key);
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes("text/diary-task")) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropCard((current) => (current === key ? null : current));
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      const taskId = event.dataTransfer.getData("text/diary-task");
      clearDrop();
      if (taskId) {
        event.preventDefault();
        event.stopPropagation();
        taskDrop(taskId);
        return;
      }
      projectDrop?.(event);
    },
    onDragEnd: clearDrop,
  });

  /** A27: 루틴 순서 변경도 카드 경계를 넘어 전체 목록 기준으로 `sort` 를 다시 적습니다. */
  const reorderRoutines = (dragId: string, targetId: string) => {
    if (!dragId || !targetId || dragId === targetId) return;
    const ids = orderedRoutines.map((routine) => routine.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    ids.forEach((routineId, position) => {
      const routine = orderedRoutines.find((item) => item.id === routineId);
      if (routine && routine.sort !== (position + 1) * 10) {
        void update("routines", routineId, { sort: (position + 1) * 10 });
      }
    });
  };

  const addQuick = async () => {
    if (!quickTitle.trim() || busy) return;
    setBusy(true);
    await create("projects", {
      title: quickTitle.trim(),
      kind: "할 일",
      category: quickCategory,
      status: "미완료",
      date: todayISO(),
    });
    setQuickTitle("");
    setBusy(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[calc(13.5px*var(--fs))] text-ink-400">
            진행 {projectCount} · 남은 할 일 {openTasks.length}
          </p>
          <h1 className="mt-1.5 text-[calc(20px*var(--fs))] font-semibold leading-none tracking-[-0.02em] text-ink-900 md:text-[calc(21px*var(--fs))]">프로젝트</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="seg-track">
            {(
              [
                { value: "tracks", label: "진행" },
                { value: "priority", label: "우선순위" },
                { value: "history", label: "기록" },
                { value: "journal", label: "히스토리" },
              ] as { value: ProjectView; label: string }[]
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setView(item.value)}
                className={cn("seg-item", view === item.value && "seg-item-active")}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openTrash("projects")}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[calc(14.5px*var(--fs))] text-ink-500 transition hover:bg-paper-200 hover:text-ink-800"
            aria-label="휴지통"
          >
            <TrashIcon size={13} /> 휴지통
          </button>

          <div className="seg-track hidden sm:inline-flex" aria-label="카드 칸 수">
            {([3, 4] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => pickCols(option)}
                aria-pressed={cols === option}
                className={cn("seg-item", cols === option && "seg-item-active")}
              >
                {option}칸
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSetting("showCompletedTasks", !settings.showCompletedTasks)}
            className="inline-flex items-center gap-2 text-[calc(14.5px*var(--fs))] text-ink-500"
          >
            완료 보기
            <span
              className={cn(
                "relative h-[18px] w-8 rounded-full transition",
                settings.showCompletedTasks ? "bg-ink-900" : "bg-paper-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all",
                  settings.showCompletedTasks ? "left-[16px]" : "left-[2px]",
                )}
              />
            </span>
          </button>

          {/* A16: NOW 전용 토글 — 켜면 NOW 숨김 항목만 가립니다. */}
          <button
            type="button"
            onClick={() => setSetting("nowOnly", !settings.nowOnly)}
            aria-pressed={settings.nowOnly}
            aria-label="NOW 숨김만 보기"
            title="켜면 NOW 숨김으로 표시한 프로젝트·할 일·일정만 가립니다"
            className="inline-flex items-center gap-2 text-[calc(14.5px*var(--fs))] text-ink-500"
          >
            NOW
            <span
              className={cn(
                "relative h-[18px] w-8 rounded-full transition",
                settings.nowOnly ? "bg-ink-900" : "bg-paper-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all",
                  settings.nowOnly ? "left-[16px]" : "left-[2px]",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ModeChips
          mode={mode}
          onChange={setMode}
          categories={categoryOptions}
          onAddCategory={addCategory}
          onRemoveCategory={removeCategory}
        />
        <button
          type="button"
          onClick={() => setTaskDraft({ kind: "프로젝트", category: quickCategory })}
          className="ml-auto rounded-full bg-paper-200 px-3 py-1 text-[calc(15px*var(--fs))] font-medium text-ink-700 transition hover:bg-paper-300/70"
        >
          + new
        </button>
      </div>

      {view === "tracks" ? (
        <div className="mt-4 space-y-4">
          <div className="cards-grid" style={{ "--proj-cols": cols } as React.CSSProperties}>
            <article
              data-drop-card="index"
              {...dropProps("index", (taskId) => moveTaskToCard(taskId, null))}
              className={cn(
                "flex min-h-[10rem] flex-col rounded-2xl border px-3.5 py-3 transition",
                dropCard === "index" ? "border-ink-300 bg-paper-200/60 ring-2 ring-ink-200" : "border-paper-300",
              )}
            >
              <header className="flex items-start gap-2">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-paper-200 text-ink-500">
                  <InboxIcon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[calc(17px*var(--fs))] font-semibold tracking-tight text-ink-900">index</p>
                  <p className="truncate text-[calc(14px*var(--fs))] text-ink-500">아직 분류되지 않은 할 일</p>
                </div>
              </header>
              <ul className="mt-2.5 space-y-1.5">
                {inbox.slice(0, CARD_OPEN_PREVIEW).map((task) => (
                  <TaskLine key={task.id} task={task} onToggle={() => toggleTask(task)} onOpen={() => void openTask(task.id)} />
                ))}
                {inbox.length === 0 ? <li className="text-[calc(14px*var(--fs))] text-ink-300">비어 있습니다.</li> : null}
                {inbox.length > CARD_OPEN_PREVIEW ? (
                  <li className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-400">+{inbox.length - CARD_OPEN_PREVIEW}개 더</li>
                ) : null}
              </ul>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void addQuick();
                }}
                className="mt-auto pt-2"
              >
                <input
                  value={quickTitle}
                  onChange={(event) => setQuickTitle(event.target.value)}
                  placeholder="+ 할 일"
                  className="w-full rounded-lg bg-paper-200/70 px-2 py-1 text-[calc(14px*var(--fs))] text-ink-900 placeholder:text-ink-400 focus:bg-paper-200 focus:outline-none"
                />
              </form>
            </article>

            {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  tasks={tasks}
                  onOpenProject={setProjectId}
                  onOpenTask={(id) => void openTask(id)}
                  onToggleTask={toggleTask}
                  onCreateTask={(target) =>
                    setTaskDraft({ kind: "할 일", category: target.category, projectId: target.id })
                  }
                  drag={{
                    draggable: true,
                    highlight: dropCard === project.id,
                    ...dropProps(
                      project.id,
                      (taskId) => moveTaskToCard(taskId, project),
                      (event) => {
                        const projectDrag = event.dataTransfer.getData("text/diary-project");
                        if (!projectDrag) return;
                        event.preventDefault();
                        reorder(projects, projectDrag, project.id);
                      },
                    ),
                    onDragStart: (event) => {
                      if (event.dataTransfer.types.includes("text/diary-task")) return;
                      event.dataTransfer.setData("text/diary-project", project.id);
                      event.dataTransfer.effectAllowed = "move";
                    },
                  }}
                />
            ))}
          </div>

          {routines.length > 0 ? (
            <div className="cards-grid" style={{ "--proj-cols": cols } as React.CSSProperties}>
              {routineChunks.map((chunk, chunkIndex) => {
                const first = chunkIndex * ROUTINES_PER_CARD + 1;
                const last = first + chunk.length - 1;
                return (
                  <article
                    key={`routines-${chunkIndex}`}
                    data-routine-card={chunkIndex}
                    className="rounded-2xl border border-paper-300 px-3 py-3"
                  >
                    <header className="flex items-start gap-2">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-paper-200 text-[calc(15px*var(--fs))]">
                        <RepeatIcon size={14} className="text-ink-500" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[calc(17px*var(--fs))] font-semibold tracking-tight text-ink-900">루틴</p>
                        {/* A27: 분류별로 나누지 않고 전체 목록을 순서대로 세 개씩 — 어디까지 보이는지 적습니다. */}
                        <p data-routine-card-range={chunkIndex} className="truncate text-[calc(14px*var(--fs))] text-ink-500">
                          {routineChunks.length === 1
                            ? `전체 · ${orderedRoutines.length}개`
                            : `${first}~${last} · ${orderedRoutines.length}개`}
                        </p>
                      </div>
                    </header>

                    <div className="mt-2 space-y-2">
                      {chunk.map((routine, index) => (
                        <div
                          key={routine.id}
                          data-routine-row={routine.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/diary-routine", routine.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(event) => {
                            if (event.dataTransfer.types.includes("text/diary-routine")) event.preventDefault();
                          }}
                          onDrop={(event) => {
                            const id = event.dataTransfer.getData("text/diary-routine");
                            if (!id || id === routine.id) return;
                            event.preventDefault();
                            // A27: 카드가 갈라져 있어도 전체 루틴 목록 기준으로 순서를 다시 적습니다.
                            reorderRoutines(id, routine.id);
                          }}
                        >
                          <RoutineWeekRow
                            routine={routine}
                            toneIndex={index}
                            routines={data.routines}
                            showCategory
                            onOpen={() => setRoutineId(routine.id)}
                            onCount={(date, count) => void setRoutineCount(routine, date, count)}
                            onToggleNow={() => {
                              // A18: 프로젝트 카드와 같은 방식 — 루틴도 카드에서 바로 NOW 숨김을 켜고 끕니다.
                              writeRoutineNow(routine.id, !routine.hidden);
                              void update("routines", routine.id, { hidden: !routine.hidden });
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setRoutineId("new")}
                      className="mt-2 text-[calc(14px*var(--fs))] text-ink-400 transition hover:text-ink-700"
                    >
                      + 루틴
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "priority" ? (
        <PriorityView
          tasks={data.projects.filter((task) => task.kind === "할 일" && !task.trash && matchesMode(mode, task, task.category))}
          projects={data.projects}
          previewCount={settings.priorityTaskPreview}
          onPreviewCount={(next) => setSetting("priorityTaskPreview", next)}
          range={priorityRange}
          onRange={setPriorityRange}
          onOpenTask={(id) => void openTask(id)}
          onOpenProject={setProjectId}
          onToggle={toggleTask}
          onCreateTask={(category, urgent, important) => {
            setTaskDraft({ kind: "할 일", category, urgent, important });
          }}
        />
      ) : null}

      {view === "history" ? (
        <HistoryView
          projects={data.projects.filter((task) => task.kind === "프로젝트")}
          tasks={data.projects.filter((task) => task.kind === "할 일")}
          routines={data.routines.filter((routine) => routine.kind === "루틴")}
          onOpenTask={(id) => void openTask(id)}
          onOpenProject={setProjectId}
          onOpenRoutine={setRoutineId}
          onRestoreTask={(task) => void update("projects", task.id, { status: "미완료", doneAt: null })}
          onRestoreRoutine={(routine) => void update("routines", routine.id, { history: false })}
          onRestoreProject={(project) => void update("projects", project.id, { status: "미완료", history: false })}
        />
      ) : null}

      {view === "journal" ? (
        <HistorySpace
          projects={data.projects.filter((task) => task.kind === "프로젝트")}
          tasks={data.projects.filter((task) => task.kind === "할 일")}
          routines={data.routines.filter((routine) => routine.kind === "루틴")}
          onOpenProject={setProjectId}
          onOpenTask={(id) => void openTask(id)}
          onOpenRoutine={setRoutineId}
          onToggleHidden={(project) => void update("projects", project.id, { hidden: !project.hidden })}
          onRestoreProject={(project) => void update("projects", project.id, { status: "미완료", history: false, hidden: false })}
          onRestoreTask={(task) => void update("projects", task.id, { status: "미완료", history: false, hidden: false })}
          onRestoreRoutine={(routine) => void update("routines", routine.id, { history: false, hidden: false })}
        />
      ) : null}

      <ProjectDrawer
        projectId={projectId}
        showBackdrop={taskId === null}
        onClose={() => setProjectId(null)}
        onOpenTask={(id) => void openTask(id)}
        onEditProject={(id) => {
          setProjectId(null);
          void openTask(id);
        }}
      />

      <TaskDetail
        open={taskId !== null}
        taskId={taskId}
        sideBySide={projectId !== null}
        onBack={() => setTaskId(null)}
        onCloseAll={() => {
          setTaskId(null);
          setProjectId(null);
        }}
        registerFlush={registerFlush}
      />

      <TaskEditor open={taskDraft !== null} draft={taskDraft ?? undefined} onClose={() => setTaskDraft(null)} />

      <RoutineEditor
        open={routineId !== null}
        routineId={routineId && routineId !== "new" ? routineId : null}
        onClose={() => setRoutineId(null)}
      />
    </div>
  );
}

/**
 * 프로젝트 카드 — 진행과 히스토리가 같은 규격으로 씁니다.
 * 배경은 프로젝트마다 자동으로 돌아가는 아주 옅은 파스텔입니다.
 */
function ProjectCard({
  project,
  tasks,
  mode = "track",
  onOpenProject,
  onOpenTask,
  onToggleTask,
  onCreateTask,
  onRestore,
  restoreLabel = "되살리기",
  drag,
}: {
  project: ProjectTask;
  tasks: ProjectTask[];
  mode?: "track" | "history";
  onOpenProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleTask: (task: ProjectTask) => void;
  onCreateTask?: (project: ProjectTask) => void;
  onRestore?: (project: ProjectTask) => void;
  /** 되살리기 / 보이기 — 히스토리에서 어떤 동작인지 */
  restoreLabel?: string;
  drag?: {
    draggable?: boolean;
    /** A25: 할 일을 이 카드 위로 끌어 왔을 때의 은은한 강조 */
    highlight?: boolean;
    onDragStart?: (event: React.DragEvent<HTMLElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLElement>) => void;
    onDragLeave?: (event: React.DragEvent<HTMLElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLElement>) => void;
    onDragEnd?: (event: React.DragEvent<HTMLElement>) => void;
  };
}) {
  const { update } = useData();
  const { highlight, ...dragProps } = drag ?? {};
  const { settings } = useSettings();
  const { pastelOf } = useProjectColors();
  const categoryColor = useCategoryColors();
  const pastel = pastelOf(project.id);
  const tone = categoryColor.toneOf(project.category, taskTone(project.category));
  // A28: 남은 할 일은 설정에서 고른 날짜 방향(기본 가까운 날짜순)으로, 완료 기록은 늘 아래에 최근 것부터.
  const children = sortProjectTaskList(
    tasks.filter((task) => !task.trash && task.projectIds.includes(project.id)),
    settings.projectTaskOrder,
  );
  const open = children.filter((task) => task.status !== "완료" && task.status !== "취소");
  const orderedOpen = open;
  /** A19: 완료한 할 일 — 최근에 끝낸 순서. */
  const completed = children
    .filter((task) => task.status === "완료")
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  /** A19: '완료 보기'를 켜면 카드가 완료한 할 일만 보여 줍니다(히스토리 카드도 같은 규격). */
  const doneOnly = mode === "history" || (mode === "track" && settings.showCompletedTasks);
  /** 카드 한 장에 보여 줄 개수 — 설정(3~8)을 따릅니다. */
  const previewCount = Math.max(1, settings.projectTaskPreview);
  const previewList = doneOnly ? completed : orderedOpen;
  /** 기본 보기 아래 '최근 기록'은 토글과 상관없이 늘 보이고, 최근 두 개까지만 보여 줍니다. */
  const recent = doneOnly ? [] : completed.slice(0, RECENT_LOG_MAX);
  const last = [...children].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];

  return (
    <article
      data-project-card={project.id}
      data-drop-card={mode === "track" ? project.id : undefined}
      {...dragProps}
      className={cn(
        "flex min-h-[10rem] flex-col rounded-2xl border px-3.5 py-3 transition",
        pastel.bg,
        pastel.border,
        mode === "track" ? "hover:border-paper-400" : "opacity-95",
        highlight && "border-ink-400 ring-2 ring-ink-200 ring-offset-1",
      )}
    >
      <header className="flex items-start gap-2">
        <span className={cn("flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-lg text-[calc(18px*var(--fs))]", pastel.bg)}>
          <ProjectIcon icon={project.icon} seed={project.id} category={project.category} className="h-full w-full" />
        </span>
        <button type="button" onClick={() => onOpenProject(project.id)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[calc(17px*var(--fs))] font-semibold tracking-tight text-ink-900">{project.title}</p>
          <p className="truncate text-[calc(14px*var(--fs))] text-ink-500">
            {mode === "history"
              ? `${project.category} · ${project.history ? "History" : project.status}`
              : last?.doneAt || last?.date
                ? `${dateLabel(last.doneAt?.slice(0, 10) ?? last.date)} 기록`
                : "아직 기록 없음"}
          </p>
        </button>
        {mode === "track" ? (
          <button
            type="button"
            onClick={(event) => {
              // A16: 카드에서 바로 NOW 숨김 켜기/끄기 — 카드가 열리지 않게 합니다.
              event.stopPropagation();
              void update("projects", project.id, { hidden: !project.hidden });
            }}
            className={cn(
              "flex-none rounded-full px-1.5 py-[1px] text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] transition",
              project.hidden ? "bg-ink-900 text-white" : "bg-white/70 text-ink-400 hover:bg-paper-200 hover:text-ink-700",
            )}
            aria-label={project.hidden ? `${project.title} NOW 숨김 해제` : `${project.title} NOW 숨기기`}
            aria-pressed={!!project.hidden}
            title={project.hidden ? "NOW 숨김 켜짐 — 누르면 다시 보입니다" : "NOW 숨김 켜기"}
          >
            NOW
          </button>
        ) : (
          <span className="flex-none rounded-full bg-white/70 px-1.5 py-[1px] text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] text-ink-500">
            {project.category}
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpenProject(project.id)}
          className="flex-none text-ink-300 transition hover:text-ink-600"
          aria-label="프로젝트 열기"
        >
          <ChevronRightIcon size={15} />
        </button>
      </header>

      <p className="mt-1.5 text-[calc(14px*var(--fs))] text-ink-500">
        {doneOnly ? `완료한 할 일 ${completed.length}` : `남은 할 일 ${open.length}`}
      </p>
      <ul className="mt-1 space-y-1.5">
        {previewList.slice(0, previewCount).map((task) => (
          <TaskLine key={task.id} task={task} onToggle={() => onToggleTask(task)} onOpen={() => onOpenTask(task.id)} />
        ))}
        {previewList.length === 0 ? (
          <li className="text-[calc(14px*var(--fs))] text-ink-400">
            {doneOnly ? "완료한 할 일이 없습니다." : "남은 할 일이 없습니다."}
          </li>
        ) : null}
        {previewList.length > previewCount ? (
          <li>
            <button
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-500 transition hover:text-ink-700"
            >
              +{previewList.length - previewCount}개 더 보기
            </button>
          </li>
        ) : null}
      </ul>

      {recent.length > 0 ? (
        <div className="mt-2 border-t border-black/[0.06] pt-1.5">
          <p className="text-[calc(13px*var(--fs))] text-ink-400">최근 기록</p>
          <ul className="mt-0.5 space-y-0.5">
            {recent.map((task) => (
              <li key={task.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="min-w-0 flex-1 truncate text-left text-[calc(14px*var(--fs))] text-ink-500"
                >
                  {task.title}
                </button>
                <span className="flex-none whitespace-nowrap text-[calc(13px*var(--fs))] tabular-nums text-ink-400">{recordDateLabel(task)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === "history" ? (
        <button
          type="button"
          onClick={() => onRestore?.(project)}
          className="mt-auto pt-2 text-left text-[calc(14px*var(--fs))] text-ink-500 transition hover:text-ink-800"
        >
          {restoreLabel}
        </button>
      ) : (
        onCreateTask ? (
          <button
            type="button"
            onClick={() => onCreateTask(project)}
            className="mt-auto pt-1.5 text-left text-[calc(14px*var(--fs))] text-ink-400 transition hover:text-ink-700"
          >
            + 할 일
          </button>
        ) : null
      )}
    </article>
  );
}

function TaskLine({
  task,
  onToggle,
  onOpen,
}: {
  task: ProjectTask;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { update } = useData();
  const categoryColor = useCategoryColors();
  const done = task.status === "완료";
  const priority = priorityOf(task);
  const tone = categoryColor.toneOf(task.category, taskTone(task.category));
  return (
    <li
      data-task-id={task.id}
      className="flex cursor-grab items-start gap-1.5 active:cursor-grabbing"
      draggable
      onDragStart={(event) => {
        // B6: dragging an inbox task only carries its id — the text, 기타 and body stay intact.
        event.dataTransfer.setData("text/diary-task", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      title="끌어서 프로젝트나 사분면으로 옮기기"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? "완료 취소" : "완료"}
        className={cn(
          "mt-[3px] flex h-[16px] w-[16px] flex-none items-center justify-center rounded-[4px] border transition",
          done ? cn(tone.solid, "border-transparent text-white") : "border-paper-400 hover:border-ink-500",
        )}
      >
        {done ? <CheckIcon size={9} /> : null}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1">
          <span className={cn("truncate text-[calc(15.5px*var(--fs))] leading-[1.35] text-ink-900", done && "text-ink-400 line-through")}>{task.title}</span>
          {priority !== "기타" ? (
            <span className={cn("flex-none rounded px-1 text-[calc(12.5px*var(--fs))] font-medium leading-4", PRIORITY_TONES[priority].badge)}>
              {PRIORITY_TONES[priority].label}
            </span>
          ) : null}
        </span>
      </button>
      <span className="flex-none text-[calc(13px*var(--fs))] tabular-nums text-ink-400">{taskDateLabel(task)}</span>
    </li>
  );
}

function RoutineWeekRow({
  routine,
  routines,
  toneIndex,
  showCategory = false,
  onOpen,
  onCount,
  onToggleNow,
}: {
  routine: Routine;
  routines: Routine[];
  toneIndex: number;
  /** A27: 전체 루틴을 한 카드에 모아 보여 줄 때 어느 분류인지 작은 배지로 알려 줍니다. */
  showCategory?: boolean;
  onOpen: () => void;
  onCount: (date: string, count: number) => void;
  onToggleNow: () => void;
}) {
  const categoryColor = useCategoryColors();
  const weekStart = startOfWeekISO(todayISO());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const target = routine.targetCount ?? 1;
  const doneCount = days.filter((day) => routineCountForDay(routines, routine, day) >= target).length;
  const tone = routineTone(toneIndex);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {showCategory ? (
          <span
            data-routine-category={routine.category}
            className={cn(
              "flex-none rounded bg-white/70 px-1 text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] tracking-tight",
              categoryColor.toneOf(routine.category, taskTone(routine.category)).text,
            )}
          >
            {routine.category}
          </span>
        ) : null}
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-[calc(14.5px*var(--fs))] text-ink-700 hover:text-ink-900">
          {routine.title}
        </button>
        <span className="flex-none text-[calc(13.5px*var(--fs))] font-medium tabular-nums text-ink-700">
          {doneCount}/{days.length}
        </span>
        {/* A18: 한 줄짜리 NOW 토글 — 행을 열지 않고 바로 켜고 끕니다. */}
        <button
          type="button"
          data-routine-now={routine.id}
          onClick={(event) => {
            event.stopPropagation();
            onToggleNow();
          }}
          aria-pressed={!!routine.hidden}
          aria-label={routine.hidden ? `${routine.title} NOW 숨김 해제` : `${routine.title} NOW 숨기기`}
          title={routine.hidden ? "NOW 숨김 켜짐 — 누르면 다시 보입니다" : "NOW 숨김 켜기"}
          className={cn(
            "flex-none rounded-full px-1.5 py-[1px] text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] transition",
            routine.hidden ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-400 hover:bg-paper-300/70 hover:text-ink-700",
          )}
        >
          NOW
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        {days.map((day, index) => {
          const label = WEEKDAY_LETTERS[index]!;
          const scheduled = routine.repeatDays.length === 0 || routine.repeatDays.includes(weekdayKo(day));
          const count = routineCountForDay(routines, routine, day);
          const done = count >= target;
          return (
            <button
              key={day}
              type="button"
              data-routine-day={label}
              disabled={!scheduled}
              onClick={() => onCount(day, done ? 0 : count + 1)}
              /* 요일 동그라미는 손끝으로도 짚을 수 있게 키웁니다 — 카드 폭(4단 227px)에 일곱 개가 들어가는 한도 */
              className={cn(
                "relative flex h-[28px] w-[28px] touch-manipulation items-center justify-center rounded-full text-[calc(13.5px*var(--fs))] leading-none transition",
                done
                  ? cn(tone.solid, "font-semibold text-white")
                  : scheduled
                    ? "bg-paper-200 text-ink-500 hover:bg-paper-300"
                    : "bg-transparent text-ink-300/50",
              )}
            >
              <span>{label}</span>
              {count > 0 && !done ? (
                <span className="absolute -right-[3px] -top-[3px] rounded-full bg-ink-900 px-[3px] text-[calc(10.5px*var(--fs))] font-semibold leading-[0.8rem] text-white">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 설정된 개수를 넘는 할 일은 `+N개 더 보기`로 펼칩니다 — 3~10개 사이에서 고릅니다. */
const PRIORITY_PREVIEW_MIN = 3;
const PRIORITY_PREVIEW_MAX = 10;

/**
 * A24: 우선순위 탭 — 사분면마다 기본으로 보여 줄 할 일 수(3~10)와 이 탭에만 걸리는
 * 기간(부터 ~ 까지)을 사용자가 고릅니다. 둘 다 이 화면 안에서만 쓰므로 진행·기록·히스토리
 * 탭의 목록은 그대로입니다.
 */
function PriorityView({
  tasks,
  projects,
  previewCount,
  onPreviewCount,
  range,
  onRange,
  onOpenTask,
  onOpenProject,
  onToggle,
  onCreateTask,
}: {
  tasks: ProjectTask[];
  projects: ProjectTask[];
  /** 사분면 하나에 기본으로 보여 줄 할 일 수 (3~10) — 설정에 저장돼 새로고침해도 남습니다. */
  previewCount: number;
  onPreviewCount: (next: number) => void;
  /** 우선순위 탭 전용 기간 — 비어 있으면 전체입니다. */
  range: { from: string; to: string };
  onRange: (next: { from: string; to: string }) => void;
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onToggle: (task: ProjectTask) => void;
  onCreateTask: (category: TaskCategory, urgent: boolean, important: boolean) => void;
}) {
  const { update } = useData();
  const { settings } = useSettings();
  const categoryColor = useCategoryColors();
  // A28: 사분면 안에서도 남은 할 일이 같은 날짜 방향을 따릅니다.
  const open = sortTasksByDate(
    tasks.filter((task) => task.status !== "완료" && task.status !== "취소"),
    settings.projectTaskOrder,
  );

  const { from, to } = range;
  /** 펼쳐 둔 사분면 key 목록 */
  const [expanded, setExpanded] = useState<string[]>([]);
  /**
   * A24: 날짜를 한 글자씩 치는 동안 반대쪽 칸을 몰래 고치지 않습니다 — 시작일이 종료일보다
   * 늦으면 기간을 잠시 풀고 아래에 다시 골라 달라고 적습니다.
   */
  const rangeInvalid = Boolean(from && to && from > to);
  const rangeActive = Boolean(from || to) && !rangeInvalid;
  const clearRange = () => {
    onRange({ from: "", to: "" });
    setExpanded([]);
  };

  /** 기간 비교에 쓰는 하루 — 화면에 보이는 날짜(마감일 우선)와 같습니다. */
  const dayOf = (task: ProjectTask) => (task.due ?? task.date ?? "").slice(0, 10);
  const inRange = (task: ProjectTask) => {
    if (!rangeActive) return true;
    const day = dayOf(task);
    // 날짜가 없는 할 일은 기간을 고르면 빠집니다 — 몇 개가 빠졌는지 아래에 적어 둡니다.
    if (!day) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };
  const shown = open.filter(inRange);
  const undated = rangeActive ? open.filter((task) => !dayOf(task)).length : 0;

  const preview = Math.max(PRIORITY_PREVIEW_MIN, Math.min(PRIORITY_PREVIEW_MAX, Math.round(previewCount)));
  const stepPreview = (delta: number) =>
    onPreviewCount(Math.max(PRIORITY_PREVIEW_MIN, Math.min(PRIORITY_PREVIEW_MAX, preview + delta)));

  const quadrants = [
    { key: "do", label: "긴급·중요", urgent: true, important: true },
    { key: "plan", label: "중요", urgent: false, important: true },
    { key: "delegate", label: "긴급", urgent: true, important: false },
    { key: "later", label: "기타", urgent: false, important: false },
  ] as const;

  const projectOf = (task: ProjectTask) => projects.find((project) => project.id === (task.projectIds[0] ?? "")) ?? null;

  const card = (quadrant: (typeof quadrants)[number]) => {
    const items = shown.filter((task) => task.urgent === quadrant.urgent && task.important === quadrant.important);
    const isExpanded = expanded.includes(quadrant.key);
    const visible = isExpanded ? items : items.slice(0, preview);
    const hidden = items.length - visible.length;
    return (
      <section
        data-quadrant={quadrant.key}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/diary-task")) event.preventDefault();
        }}
        onDrop={(event) => {
          const id = event.dataTransfer.getData("text/diary-task");
          if (!id) return;
          event.preventDefault();
          // B6: a quadrant drop changes 긴급·중요 only.
          void update("projects", id, { urgent: quadrant.urgent, important: quadrant.important });
        }}
        className="min-h-[10.5rem] rounded-xl border border-paper-300 px-3 py-2.5"
      >
        <header className="flex items-baseline gap-1.5">
          <h3 className={cn("rounded px-1 text-[calc(15px*var(--fs))] font-semibold leading-5", PRIORITY_TONES[quadrant.label].badge)}>
            {quadrant.label}
          </h3>
          <span data-quadrant-count={quadrant.key} className="text-[calc(14px*var(--fs))] text-ink-400">
            {items.length}
          </span>
        </header>

        <ul className="mt-1.5 space-y-1.5">
          {visible.map((task) => {
            const project = projectOf(task);
            const tone = categoryColor.toneOf(project?.category ?? task.category, taskTone(project?.category ?? task.category));
            // A10: a task with neither 긴급 nor 중요 is still unclassified — say so in small,
            // faint letters (기타 사분면 included), whether or not it already has a project.
            const unclassified = !task.urgent && !task.important;
            return (
              <li key={task.id} data-priority-task={task.id} className="flex items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggle(task)}
                  aria-label="완료"
                  className="mt-[2px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full border border-paper-400 hover:border-ink-500"
                >
                  {task.status === "완료" ? <CheckIcon size={9} /> : null}
                </button>
                <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-baseline gap-1.5">
                    <span className="truncate text-[calc(15px*var(--fs))] text-ink-800">{task.title}</span>
                    {unclassified ? (
                      <span className="flex-none text-[calc(12px*var(--fs))] font-normal leading-4 tracking-tight text-ink-300">분류 전</span>
                    ) : null}
                    {project ? (
                      <span className={cn("flex-none text-[calc(13.5px*var(--fs))]", tone.text)}>{project.title}</span>
                    ) : null}
                  </span>
                </button>
                <span className="flex-none text-[calc(13.5px*var(--fs))] tabular-nums text-ink-400">{taskDateLabel(task)}</span>
              </li>
            );
          })}
          {items.length === 0 ? (
            <li className="py-2 text-[calc(14px*var(--fs))] text-ink-300">
              {rangeActive ? "이 기간에 해당하는 할 일이 없습니다." : "비어 있습니다."}
            </li>
          ) : null}
          {hidden > 0 ? (
            <li>
              <button
                type="button"
                data-priority-more={quadrant.key}
                aria-expanded={false}
                onClick={() => setExpanded((current) => [...current, quadrant.key])}
                className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-400 transition hover:text-ink-700"
              >
                +{hidden}개 더 보기
              </button>
            </li>
          ) : null}
          {isExpanded && items.length > preview ? (
            <li>
              <button
                type="button"
                data-priority-less={quadrant.key}
                aria-expanded
                onClick={() => setExpanded((current) => current.filter((key) => key !== quadrant.key))}
                className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-400 transition hover:text-ink-700"
              >
                접기
              </button>
            </li>
          ) : null}
        </ul>

        <button
          type="button"
          onClick={() => onCreateTask("개인", quadrant.urgent, quadrant.important)}
          className="mt-1 w-full rounded-lg bg-paper-200/50 px-2 py-1 text-left text-[calc(14px*var(--fs))] text-ink-400 transition hover:bg-paper-200 hover:text-ink-700"
        >
          + 할 일
        </button>
      </section>
    );
  };

  return (
    <div className="mt-4" data-priority-view="true">
      {/* A24: 우선순위 탭 전용 도구줄 — 기간(부터~까지)과 사분면 표시 개수(3~10). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:flex-1" data-priority-range="true">
          <span className="hidden text-[calc(14px*var(--fs))] text-ink-500 sm:inline">기간</span>
          <input
            type="date"
            aria-label="시작일"
            data-priority-from="true"
            value={from}
            onChange={(event) => onRange({ from: event.target.value, to })}
            className="rounded-lg bg-paper-200 px-2 py-1 text-[calc(14px*var(--fs))] tabular-nums text-ink-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-paper-200"
          />
          <span className="text-[calc(14px*var(--fs))] text-ink-300">~</span>
          <input
            type="date"
            aria-label="종료일"
            data-priority-to="true"
            value={to}
            onChange={(event) => onRange({ from, to: event.target.value })}
            className="rounded-lg bg-paper-200 px-2 py-1 text-[calc(14px*var(--fs))] tabular-nums text-ink-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-paper-200"
          />
          <button
            type="button"
            data-priority-range-clear="true"
            onClick={clearRange}
            disabled={!from && !to}
            className={cn(
              "rounded-full px-2 py-1 text-[calc(13.5px*var(--fs))] transition",
              from || to ? "bg-paper-200 text-ink-600 hover:bg-paper-300/70 hover:text-ink-900" : "text-ink-300",
            )}
          >
            전체 보기
          </button>
        </div>

        <div
          className="ml-auto flex items-center gap-1.5 text-[calc(14px*var(--fs))] text-ink-500"
          data-priority-count-control="true"
          title="우선순위 사분면마다 처음에 보여 줄 할 일 개수입니다"
        >
          <span>표시</span>
          <div className="inline-flex items-center gap-0.5 rounded-full border border-paper-300 bg-paper-200 p-0.5">
            <button
              type="button"
              aria-label="표시 개수 줄이기"
              data-priority-preview-step="-1"
              onClick={() => stepPreview(-1)}
              disabled={preview <= PRIORITY_PREVIEW_MIN}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[calc(15px*var(--fs))] leading-none transition",
                preview <= PRIORITY_PREVIEW_MIN ? "text-ink-300" : "text-ink-600 hover:bg-white hover:text-ink-900",
              )}
            >
              −
            </button>
            <span data-priority-preview={preview} className="w-6 text-center text-[calc(14.5px*var(--fs))] font-semibold tabular-nums text-ink-800">
              {preview}
            </span>
            <button
              type="button"
              aria-label="표시 개수 늘리기"
              data-priority-preview-step="1"
              onClick={() => stepPreview(1)}
              disabled={preview >= PRIORITY_PREVIEW_MAX}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[calc(15px*var(--fs))] leading-none transition",
                preview >= PRIORITY_PREVIEW_MAX ? "text-ink-300" : "text-ink-600 hover:bg-white hover:text-ink-900",
              )}
            >
              +
            </button>
          </div>
          <span className="text-ink-400">개씩</span>
        </div>
      </div>

      {rangeInvalid ? (
        <p data-priority-range-invalid="true" className="mt-1.5 text-[calc(13.5px*var(--fs))] leading-relaxed text-rose-600">
          시작일이 종료일보다 늦습니다. 기간을 다시 골라 주세요 — 지금은 전체를 보여 줍니다.
        </p>
      ) : null}

      {rangeActive ? (
        <p data-priority-range-note="true" className="mt-1.5 text-[calc(13.5px*var(--fs))] leading-relaxed text-ink-400">
          {from ? formatShort(from) : "처음"} ~ {to ? formatShort(to) : "끝"} 기간의 할 일만 보는 중
          {undated > 0 ? ` · 날짜 없는 할 일 ${undated}개는 빠집니다` : ""}
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-2 pb-1.5 text-center text-[calc(14px*var(--fs))] text-ink-400">
            <span />
            <span>급함</span>
            <span>안 급함</span>
          </div>
          <div className="grid grid-cols-[2.2rem_1fr_1fr] gap-2">
            <div className="flex items-center justify-center text-[calc(14px*var(--fs))] text-ink-400">
              <span className="writing-vertical">중요</span>
            </div>
            {card(quadrants[0])}
            {card(quadrants[1])}
            <div className="flex items-center justify-center text-[calc(14px*var(--fs))] text-ink-400">
              <span className="writing-vertical">안 중요</span>
            </div>
            {card(quadrants[2])}
            {card(quadrants[3])}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryView({
  projects,
  tasks,
  routines,
  onOpenTask,
  onOpenProject,
  onOpenRoutine,
  onRestoreTask,
  onRestoreRoutine,
  onRestoreProject,
}: {
  projects: ProjectTask[];
  tasks: ProjectTask[];
  routines: Routine[];
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onOpenRoutine: (id: string) => void;
  onRestoreTask: (task: ProjectTask) => void;
  onRestoreRoutine: (routine: Routine) => void;
  onRestoreProject: (project: ProjectTask) => void;
}) {
  /** 완료·취소·History·숨김까지 모두 카드로 보여 줍니다 (진행과 같은 규격). */
  const finishedProjects = projects.filter(
    (project) => !project.trash && (project.status === "완료" || project.status === "취소" || project.history || project.hidden),
  );
  const pastRoutines = routines.filter((routine) => routine.history || routine.trash);
  const doneTasks = tasks.filter((task) => task.status === "완료").slice(0, 40);
  const canceled = tasks.filter((task) => task.status === "취소").slice(0, 20);

  return (
    <div className="mt-4 space-y-4">
      <section>
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">지난 프로젝트</h3>
        {finishedProjects.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">완료했거나 접은 프로젝트가 아직 없습니다.</p>
        ) : (
          <div className="cards-grid" style={{ "--proj-cols": 3 } as React.CSSProperties}>
            {finishedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={tasks}
                mode="history"
                onOpenProject={onOpenProject}
                onOpenTask={onOpenTask}
                onToggleTask={(task) => onRestoreTask(task)}
                onRestore={onRestoreProject}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">지난 루틴</h3>
        {pastRoutines.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">기록으로 보낸 루틴이 여기에 모입니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/60">
            {pastRoutines.map((routine) => (
              <li key={routine.id} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => onOpenRoutine(routine.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[calc(15px*var(--fs))] text-ink-700">{routine.title}</span>
                  <span className="text-[calc(13px*var(--fs))] text-ink-400">
                    {routine.category} · {routine.unit || "루틴"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreRoutine(routine)}
                  className="rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                >
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">최근 완료한 할 일</h3>
        {doneTasks.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">완료한 할 일이 아직 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {doneTasks.map((task) => (
              <li key={task.id} className="flex items-center gap-1.5">
                <CheckIcon size={11} className="flex-none text-sage-500" />
                <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 truncate text-left text-[calc(15px*var(--fs))] text-ink-600">
                  {task.title}
                </button>
                <button type="button" onClick={() => onRestoreTask(task)} className="text-[calc(13px*var(--fs))] text-ink-400 hover:text-ink-700">
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">접어 둔 할 일</h3>
        {canceled.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">취소한 할 일이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/60">
            {canceled.map((task) => (
              <li key={task.id} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[calc(15px*var(--fs))] text-ink-500 line-through">{task.title}</span>
                  {task.cancelReason ? <span className="text-[calc(13px*var(--fs))] text-ink-400">{task.cancelReason}</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreTask(task)}
                  className="rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                >
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

/* ───────────────────────── A16: 히스토리 전용 화면 ───────────────────────── */

/** 숨긴 프로젝트 · 완료한 프로젝트 · History로 보낸 항목을 한 화면에 모읍니다. */
function HistorySpace({
  projects,
  tasks,
  routines,
  onOpenProject,
  onOpenTask,
  onOpenRoutine,
  onToggleHidden,
  onRestoreProject,
  onRestoreTask,
  onRestoreRoutine,
}: {
  projects: ProjectTask[];
  tasks: ProjectTask[];
  routines: Routine[];
  onOpenProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onOpenRoutine: (id: string) => void;
  onToggleHidden: (project: ProjectTask) => void;
  onRestoreProject: (project: ProjectTask) => void;
  onRestoreTask: (task: ProjectTask) => void;
  onRestoreRoutine: (routine: Routine) => void;
}) {
  const alive = projects.filter((project) => !project.trash);
  const hiddenProjects = alive.filter((project) => project.hidden && !project.history);
  const doneProjects = alive.filter(
    (project) => !project.hidden && (project.history || project.status === "완료" || project.status === "취소"),
  );
  const sentTasks = tasks.filter((task) => !task.trash && task.history);
  const sentRoutines = routines.filter((routine) => !routine.trash && routine.history);

  const Row = ({
    title,
    meta,
    onOpen,
    children,
  }: {
    title: string;
    meta: string;
    onOpen: () => void;
    children?: React.ReactNode;
  }) => (
    <li className="flex items-center gap-2 py-1.5">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[calc(15px*var(--fs))] text-ink-700">{title}</span>
        <span className="text-[calc(13px*var(--fs))] text-ink-400">{meta}</span>
      </button>
      {children}
    </li>
  );

  return (
    <div className="mt-4 space-y-4">
      <section>
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">숨긴 프로젝트</h3>
        {hiddenProjects.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">숨긴 프로젝트가 없습니다.</p>
        ) : (
          <div className="cards-grid" style={{ "--proj-cols": 3 } as React.CSSProperties}>
            {hiddenProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={tasks}
                mode="history"
                restoreLabel="보이기"
                onOpenProject={onOpenProject}
                onOpenTask={onOpenTask}
                onToggleTask={(task) => onRestoreTask(task)}
                onRestore={onToggleHidden}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">완료한 프로젝트</h3>
        {doneProjects.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">완료했거나 접은 프로젝트가 없습니다.</p>
        ) : (
          <div className="cards-grid" style={{ "--proj-cols": 3 } as React.CSSProperties}>
            {doneProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={tasks}
                mode="history"
                onOpenProject={onOpenProject}
                onOpenTask={onOpenTask}
                onToggleTask={(task) => onRestoreTask(task)}
                onRestore={onRestoreProject}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 text-[calc(15px*var(--fs))] font-semibold text-ink-900">History로 보낸 항목</h3>
        {sentTasks.length + sentRoutines.length === 0 ? (
          <p className="text-[calc(14.5px*var(--fs))] text-ink-400">History로 보낸 항목이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/60">
            {sentTasks.map((task) => (
              <Row key={task.id} title={task.title} meta={`${task.kind} · ${task.category}`} onOpen={() => onOpenTask(task.id)}>
                <button type="button" onClick={() => onRestoreTask(task)} className="rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-400 hover:bg-paper-200 hover:text-ink-700">
                  되살리기
                </button>
              </Row>
            ))}
            {sentRoutines.map((routine) => (
              <Row key={routine.id} title={routine.title} meta={`루틴 · ${routine.category}`} onOpen={() => onOpenRoutine(routine.id)}>
                <button type="button" onClick={() => onRestoreRoutine(routine)} className="rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-400 hover:bg-paper-200 hover:text-ink-700">
                  되살리기
                </button>
              </Row>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}
