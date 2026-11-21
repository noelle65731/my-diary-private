"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import { cn, matchesMode } from "@/lib/utils";
import { formatShort, startOfWeekISO, todayISO, weekdayKo } from "@/lib/date";
import { type ModeFilter, type ProjectTask, type Routine, type TaskCategory } from "@/lib/types";
import { PRIORITY_TONES, priorityOf, routineTone, taskTone } from "@/components/common/tone";
import { ProjectIcon } from "@/components/common/ProjectIcon";
import { CheckIcon, ChevronRightIcon, InboxIcon, PlusIcon, RepeatIcon, TrashIcon } from "@/components/icons";
import { ModeChips } from "@/components/common/ModeChips";
import { ProjectDrawer } from "@/components/projects/ProjectDrawer";
import { TaskEditor } from "@/components/editors/TaskEditor";
import { TaskDetail } from "@/components/detail/TaskDetail";
import { RoutineEditor } from "@/components/editors/RoutineEditor";
import { routineCountForDay } from "@/components/calendar/calendar-utils";
import { sortProjectTaskList, sortTasksNewestFirst } from "@/lib/order";

type ProjectView = "tracks" | "priority" | "history";

const BASE_CATEGORIES = ["업무", "개인", "공부"];

const WEEKDAY_LETTERS = ["월", "화", "수", "목", "금", "토", "일"];

function dateLabel(date: string | null): string {
  if (!date) return "";
  return `${formatShort(date)} ${weekdayKo(date)}`;
}

export function ProjectsTab() {
  const { data, update, setRoutineCount, create } = useData();
  const { settings, set: setSetting, addCategory } = useSettings();
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
    if (mode !== "now" && mode !== "all" && mode !== "custom") setQuickCategory(mode as TaskCategory);
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
      (task) => task.kind === "프로젝트" && !task.trash && !task.history && matchesMode(mode, task, task.category),
    );
    const done = (task: ProjectTask) => task.status === "완료" || task.status === "취소";
    return [...list].sort((a, b) => {
      if (done(a) !== done(b)) return done(a) ? 1 : -1;
      if (a.sort !== null && b.sort !== null && a.sort !== b.sort) return a.sort - b.sort;
      if (a.sort !== null && b.sort === null) return -1;
      if (a.sort === null && b.sort !== null) return 1;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }, [data.projects, mode]);
  const tasks = useMemo(
    () => data.projects.filter((task) => task.kind === "할 일" && matchesMode(mode, task, task.category)),
    [data.projects, mode],
  );
  const routines = useMemo(
    () => data.routines.filter((routine) => routine.kind === "루틴" && !routine.trash && !routine.history && (mode === "all" || !routine.hidden)),
    [data.routines, mode],
  );

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
          <p className="text-[13.5px] text-ink-400">
            트랙 {projectCount} · 남은 할 일 {openTasks.length}
          </p>
          <h1 className="mt-1.5 text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink-900 md:text-[21px]">프로젝트</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="seg-track">
            {(
              [
                { value: "tracks", label: "트랙" },
                { value: "priority", label: "우선순위" },
                { value: "history", label: "기록" },
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
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[14.5px] text-ink-500 transition hover:bg-paper-200 hover:text-ink-800"
            aria-label="휴지통"
          >
            <TrashIcon size={13} /> 휴지통
          </button>

          <div className="seg-track" aria-label="카드 칸 수">
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
            className="inline-flex items-center gap-2 text-[14.5px] text-ink-500"
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
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ModeChips
          mode={mode}
          onChange={setMode}
          categories={[...BASE_CATEGORIES, ...settings.customCategories.filter((item) => !BASE_CATEGORIES.includes(item))]}
          onAddCategory={addCategory}
        />
        <button
          type="button"
          onClick={() => setTaskDraft({ kind: "프로젝트", category: quickCategory })}
          className="ml-auto rounded-full bg-paper-200 px-3 py-1 text-[15px] font-medium text-ink-700 transition hover:bg-paper-300/70"
        >
          + 트랙
        </button>
      </div>

      {view === "tracks" ? (
        <div className="mt-4 space-y-4">
          <div className="cards-grid" style={{ "--proj-cols": cols } as React.CSSProperties}>
            <article className="flex min-h-[10rem] flex-col rounded-2xl border border-paper-300 px-3.5 py-3">
              <header className="flex items-start gap-2">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-paper-200 text-ink-500">
                  <InboxIcon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold tracking-tight text-ink-900">받은함</p>
                  <p className="truncate text-[14px] text-ink-500">트랙에 넣지 않은 할 일</p>
                </div>
              </header>
              <ul className="mt-2.5 space-y-1.5">
                {inbox.slice(0, 4).map((task) => (
                  <TaskLine key={task.id} task={task} onToggle={() => toggleTask(task)} onOpen={() => void openTask(task.id)} />
                ))}
                {inbox.length === 0 ? <li className="text-[14px] text-ink-300">비어 있습니다.</li> : null}
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
                  className="w-full rounded-lg bg-paper-200/70 px-2 py-1 text-[14px] text-ink-900 placeholder:text-ink-400 focus:bg-paper-200 focus:outline-none"
                />
              </form>
            </article>

            {projects.map((project) => {
              const children = sortProjectTaskList(tasks.filter((task) => !task.trash && task.projectIds.includes(project.id)));
              const open = children.filter((task) => task.status !== "완료" && task.status !== "취소");
              const recent = settings.showCompletedTasks
                ? children
                    .filter((task) => task.status === "완료")
                    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""))
                    .slice(0, settings.projectCompletedPreview)
                : [];
              const orderedOpen = sortTasksNewestFirst(open);
              const last = [...children].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
              const tone = taskTone(project.category);
              return (
                <article
                  key={project.id}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("text/diary-task") || event.dataTransfer.types.includes("text/diary-project")) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    const taskDrag = event.dataTransfer.getData("text/diary-task");
                    if (taskDrag) {
                      event.preventDefault();
                      // B6: only the relation changes; the task's own content is preserved.
                      void update("projects", taskDrag, { projectIds: [project.id], category: project.category });
                      return;
                    }
                    const projectDrag = event.dataTransfer.getData("text/diary-project");
                    if (projectDrag) {
                      event.preventDefault();
                      reorder(projects, projectDrag, project.id);
                    }
                  }}
                  draggable
                  onDragStart={(event) => {
                    if (event.dataTransfer.types.includes("text/diary-task")) return;
                    event.dataTransfer.setData("text/diary-project", project.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="flex min-h-[10rem] flex-col rounded-2xl border border-paper-300 px-3.5 py-3 transition hover:border-paper-400"
                >
                  <header className="flex items-start gap-2">
                    <span className={cn("flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-lg text-[18px]", tone.soft)}>
                      <ProjectIcon icon={project.icon} seed={project.id} category={project.category} className="h-full w-full" />
                    </span>
                    <button type="button" onClick={() => setProjectId(project.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[17px] font-semibold tracking-tight text-ink-900">{project.title}</p>
                      <p className="truncate text-[14px] text-ink-500">
                        {last?.doneAt || last?.date ? `${dateLabel(last.doneAt?.slice(0, 10) ?? last.date)} 기록` : "아직 기록 없음"}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProjectId(project.id)}
                      className="flex-none text-ink-300 transition hover:text-ink-600"
                      aria-label="프로젝트 열기"
                    >
                      <ChevronRightIcon size={15} />
                    </button>
                  </header>

                  <p className="mt-1.5 text-[14px] text-ink-500">남은 할 일 {open.length}</p>
                  <ul className="mt-1 space-y-1.5">
                    {orderedOpen.slice(0, 4).map((task) => (
                      <TaskLine
                        key={task.id}
                        task={task}
                        onToggle={() => toggleTask(task)}
                        onOpen={() => void openTask(task.id)}
                      />
                    ))}
                    {open.length === 0 ? <li className="text-[14px] text-ink-300">남은 할 일이 없습니다.</li> : null}
                  </ul>

                  {recent.length > 0 ? (
                    <div className="mt-2 border-t border-paper-300/70 pt-1.5">
                      <p className="text-[13px] text-ink-400">최근 기록</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {recent.map((task) => (
                          <li key={task.id} className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void openTask(task.id)}
                              className="min-w-0 flex-1 truncate text-left text-[14px] text-ink-500"
                            >
                              {task.title}
                            </button>
                            <span className="flex-none text-[13px] text-ink-400">{dateLabel(task.doneAt?.slice(0, 10) ?? task.date)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setTaskDraft({ kind: "할 일", category: project.category, projectId: project.id })}
                    className="mt-auto pt-1.5 text-left text-[14px] text-ink-400 transition hover:text-ink-700"
                  >
                    + 할 일
                  </button>
                </article>
              );
            })}
          </div>

          {routines.length > 0 ? (
            <div className="cards-grid" style={{ "--proj-cols": cols } as React.CSSProperties}>
              {(["개인", "공부"] as const).map((category) => {
                const items = routines.filter((routine) => routine.category === category);
                if (items.length === 0) return null;
                return (
                  <article key={category} className="rounded-2xl border border-paper-300 px-3 py-3">
                    <header className="flex items-start gap-2">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-paper-200 text-[15px]">
                        <RepeatIcon size={14} className="text-ink-500" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-semibold tracking-tight text-ink-900">루틴</p>
                        <p className="text-[14px] text-ink-500">루틴 · {category} · 이번 주</p>
                      </div>
                    </header>

                    <div className="mt-2 space-y-2">
                      {[...items]
                        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.createdAt.localeCompare(b.createdAt))
                        .slice(0, 3)
                        .map((routine, index) => (
                        <div
                          key={routine.id}
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
                            const ordered = [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.createdAt.localeCompare(b.createdAt));
                            const ids = ordered.map((item) => item.id);
                            const from = ids.indexOf(id);
                            const to = ids.indexOf(routine.id);
                            if (from < 0 || to < 0) return;
                            ids.splice(from, 1);
                            ids.splice(to, 0, id);
                            ids.forEach((routineId, position) => {
                              void update("routines", routineId, { sort: (position + 1) * 10 });
                            });
                          }}
                        >
                          <RoutineWeekRow
                            routine={routine}
                            toneIndex={index}
                            routines={data.routines}
                            onOpen={() => setRoutineId(routine.id)}
                            onCount={(date, count) => void setRoutineCount(routine, date, count)}
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setRoutineId("new")}
                      className="mt-2 text-[14px] text-ink-400 transition hover:text-ink-700"
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
  const done = task.status === "완료";
  const priority = priorityOf(task);
  const tone = taskTone(task.category);
  return (
    <li
      className="flex items-start gap-1.5"
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
          <span className={cn("truncate text-[15.5px] leading-[1.35] text-ink-900", done && "text-ink-400 line-through")}>{task.title}</span>
          {priority !== "기타" ? (
            <span className={cn("flex-none rounded px-1 text-[12.5px] font-medium leading-4", PRIORITY_TONES[priority].badge)}>
              {PRIORITY_TONES[priority].label}
            </span>
          ) : null}
        </span>
      </button>
      <span className="flex-none text-[13px] tabular-nums text-ink-400">{dateLabel(task.due ?? task.date)}</span>
    </li>
  );
}

function RoutineWeekRow({
  routine,
  routines,
  toneIndex,
  onOpen,
  onCount,
}: {
  routine: Routine;
  routines: Routine[];
  toneIndex: number;
  onOpen: () => void;
  onCount: (date: string, count: number) => void;
}) {
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
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-[14.5px] text-ink-700 hover:text-ink-900">
          {routine.title}
        </button>
        <span className="flex-none text-[13.5px] font-medium tabular-nums text-ink-700">
          {doneCount}/{days.length}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        {days.map((day, index) => {
          const label = WEEKDAY_LETTERS[index]!;
          const scheduled = routine.repeatDays.length === 0 || routine.repeatDays.includes(weekdayKo(day));
          const count = routineCountForDay(routines, routine, day);
          const done = count >= target;
          return (
            <button
              key={day}
              type="button"
              disabled={!scheduled}
              onClick={() => onCount(day, done ? 0 : count + 1)}
              className={cn(
                "relative flex h-[18px] w-[18px] items-center justify-center rounded-full text-[12px] leading-none transition",
                done
                  ? cn(tone.solid, "font-semibold text-white")
                  : scheduled
                    ? "bg-paper-200 text-ink-400 hover:bg-paper-300"
                    : "bg-transparent text-ink-300/50",
              )}
            >
              <span>{label}</span>
              {count > 0 && !done ? (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-ink-900 px-[3px] text-[10px] font-semibold leading-[0.7rem] text-white">
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

function PriorityView({
  tasks,
  projects,
  onOpenTask,
  onOpenProject,
  onToggle,
  onCreateTask,
}: {
  tasks: ProjectTask[];
  projects: ProjectTask[];
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onToggle: (task: ProjectTask) => void;
  onCreateTask: (category: TaskCategory, urgent: boolean, important: boolean) => void;
}) {
  const { update } = useData();
  const open = sortTasksNewestFirst(tasks.filter((task) => task.status !== "완료" && task.status !== "취소"));
  const quadrants = [
    { key: "do", label: "긴급·중요", urgent: true, important: true },
    { key: "plan", label: "중요", urgent: false, important: true },
    { key: "delegate", label: "긴급", urgent: true, important: false },
    { key: "later", label: "기타", urgent: false, important: false },
  ] as const;

  const projectOf = (task: ProjectTask) => projects.find((project) => project.id === (task.projectIds[0] ?? "")) ?? null;

  const card = (quadrant: (typeof quadrants)[number]) => {
    const items = open.filter((task) => task.urgent === quadrant.urgent && task.important === quadrant.important);
    return (
      <section
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
          <h3 className={cn("rounded px-1 text-[15px] font-semibold leading-5", PRIORITY_TONES[quadrant.label].badge)}>
            {quadrant.label}
          </h3>
          <span className="text-[14px] text-ink-400">{items.length}</span>
        </header>

        <ul className="mt-1.5 space-y-1.5">
          {items.map((task) => {
            const project = projectOf(task);
            const tone = taskTone(project?.category ?? task.category);
            // A10: a task with neither 긴급 nor 중요 is still unclassified — say so in small,
            // faint letters (기타 사분면 included), whether or not it already has a project.
            const unclassified = !task.urgent && !task.important;
            return (
              <li key={task.id} className="flex items-start gap-1.5">
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
                    <span className="truncate text-[15px] text-ink-800">{task.title}</span>
                    {unclassified ? (
                      <span className="flex-none text-[12px] font-normal leading-4 tracking-tight text-ink-300">분류 전</span>
                    ) : null}
                    {project ? (
                      <span className={cn("flex-none text-[13.5px]", tone.text)}>{project.title}</span>
                    ) : null}
                  </span>
                </button>
                <span className="flex-none text-[13.5px] tabular-nums text-ink-400">{dateLabel(task.due ?? task.date)}</span>
              </li>
            );
          })}
          {items.length === 0 ? <li className="py-2 text-[14px] text-ink-300">비어 있습니다.</li> : null}
        </ul>

        <button
          type="button"
          onClick={() => onCreateTask("개인", quadrant.urgent, quadrant.important)}
          className="mt-1 w-full rounded-lg bg-paper-200/50 px-2 py-1 text-left text-[14px] text-ink-400 transition hover:bg-paper-200 hover:text-ink-700"
        >
          + 할 일
        </button>
      </section>
    );
  };

  return (
    <div className="mt-4 overflow-x-auto">
      <div className="min-w-[42rem]">
        <div className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-2 pb-1.5 text-center text-[14px] text-ink-400">
          <span />
          <span>급함</span>
          <span>안 급함</span>
        </div>
        <div className="grid grid-cols-[2.2rem_1fr_1fr] gap-2">
          <div className="flex items-center justify-center text-[14px] text-ink-400">
            <span className="writing-vertical">중요</span>
          </div>
          {card(quadrants[0])}
          {card(quadrants[1])}
          <div className="flex items-center justify-center text-[14px] text-ink-400">
            <span className="writing-vertical">안 중요</span>
          </div>
          {card(quadrants[2])}
          {card(quadrants[3])}
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
  const finishedProjects = projects.filter((project) => project.status === "완료" || project.status === "취소" || project.history);
  const pastRoutines = routines.filter((routine) => routine.history || routine.trash);
  const doneTasks = tasks.filter((task) => task.status === "완료").slice(0, 40);
  const canceled = tasks.filter((task) => task.status === "취소").slice(0, 20);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 text-[15px] font-semibold text-ink-900">지난 프로젝트</h3>
        {finishedProjects.length === 0 ? (
          <p className="text-[14.5px] text-ink-400">완료했거나 접은 프로젝트가 아직 없습니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/60">
            {finishedProjects.map((project) => {
              const children = tasks.filter((task) => task.projectIds.includes(project.id));
              const done = children.filter((task) => task.status === "완료").length;
              return (
                <li key={project.id} className="flex items-center gap-2 py-1.5">
                  <button type="button" onClick={() => onOpenProject(project.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[15px] text-ink-700">{project.title}</span>
                    <span className="text-[13px] text-ink-400">
                      {project.category} · {project.status} · {done}/{children.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestoreProject(project)}
                    className="rounded px-1.5 py-0.5 text-[13px] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                  >
                    되살리기
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 text-[15px] font-semibold text-ink-900">지난 루틴</h3>
        {pastRoutines.length === 0 ? (
          <p className="text-[14.5px] text-ink-400">기록으로 보낸 루틴이 여기에 모입니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/60">
            {pastRoutines.map((routine) => (
              <li key={routine.id} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => onOpenRoutine(routine.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] text-ink-700">{routine.title}</span>
                  <span className="text-[13px] text-ink-400">
                    {routine.category} · {routine.unit || "루틴"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreRoutine(routine)}
                  className="rounded px-1.5 py-0.5 text-[13px] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                >
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 text-[15px] font-semibold text-ink-900">최근 완료한 할 일</h3>
        {doneTasks.length === 0 ? (
          <p className="text-[14.5px] text-ink-400">완료한 할 일이 아직 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {doneTasks.map((task) => (
              <li key={task.id} className="flex items-center gap-1.5">
                <CheckIcon size={11} className="flex-none text-sage-500" />
                <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 truncate text-left text-[15px] text-ink-600">
                  {task.title}
                </button>
                <button type="button" onClick={() => onRestoreTask(task)} className="text-[13px] text-ink-400 hover:text-ink-700">
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-paper-300 px-3.5 py-3">
        <h3 className="mb-2 text-[15px] font-semibold text-ink-900">접어 둔 할 일</h3>
        {canceled.length === 0 ? (
          <p className="text-[14.5px] text-ink-400">취소한 할 일이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/60">
            {canceled.map((task) => (
              <li key={task.id} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] text-ink-500 line-through">{task.title}</span>
                  {task.cancelReason ? <span className="text-[13px] text-ink-400">{task.cancelReason}</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreTask(task)}
                  className="rounded px-1.5 py-0.5 text-[13px] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                >
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
