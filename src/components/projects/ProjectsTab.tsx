"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import { cn, matchesMode } from "@/lib/utils";
import { formatShort, todayISO } from "@/lib/date";
import {
  type ModeFilter,
  type ProjectTask,
  type Routine,
  type TaskCategory,
} from "@/lib/types";
import { taskTone } from "@/components/common/tone";
import {
  CheckIcon,
  FlagIcon,
  InboxIcon,
  LayersIcon,
  PlusIcon,
  RepeatIcon,
  StarIcon,
} from "@/components/icons";
import { EmptyState, Segmented } from "@/components/common/primitives";
import { ProjectDrawer } from "@/components/projects/ProjectDrawer";
import { RoutineCard } from "@/components/projects/RoutineCard";
import { TaskRow } from "@/components/projects/TaskRow";
import { TaskEditor } from "@/components/editors/TaskEditor";
import { RoutineEditor } from "@/components/editors/RoutineEditor";

type ProjectView = "tracks" | "priority" | "history";

const MODES: { value: ModeFilter; label: string }[] = [
  { value: "now", label: "NOW" },
  { value: "all", label: "전체" },
  { value: "업무", label: "업무" },
  { value: "개인", label: "개인" },
  { value: "공부", label: "공부" },
];

export function ProjectsTab() {
  const { data, create, update, setRoutineCount } = useData();
  const { settings } = useSettings();
  const { focus, clearFocus, openItem } = useUi();

  const [view, setView] = useState<ProjectView>("tracks");
  const [mode, setMode] = useState<ModeFilter>("now");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<{ kind?: "할 일" | "프로젝트"; category?: TaskCategory; projectId?: string } | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState<TaskCategory>("개인");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!focus) return;
    if (focus.resource === "projects") {
      const item = data.projects.find((task) => task.id === focus.id);
      if (item) {
        if (item.kind === "프로젝트") setProjectId(item.id);
        else setTaskId(item.id);
      }
    }
    if (focus.resource === "routines") setRoutineId(focus.id);
    clearFocus();
  }, [focus, data.projects, clearFocus]);

  useEffect(() => {
    if (mode !== "now" && mode !== "all") setQuickCategory(mode);
  }, [mode]);

  useTabReset("projects", () => {
    setView("tracks");
    setMode("now");
    setProjectId(null);
    setTaskId(null);
    setRoutineId(null);
    setQuickTitle("");
  });

  const projects = useMemo(
    () => data.projects.filter((task) => task.kind === "프로젝트" && matchesMode(mode, task, task.category)),
    [data.projects, mode],
  );
  const tasks = useMemo(
    () => data.projects.filter((task) => task.kind === "할 일" && matchesMode(mode, task, task.category)),
    [data.projects, mode],
  );
  const routines = useMemo(
    () => data.routines.filter((routine) => routine.kind === "루틴" && !routine.trash && (mode === "all" || !routine.hidden)),
    [data.routines, mode],
  );
  const everything = useMemo(() => data.projects.filter((task) => !task.trash), [data.projects]);

  const inbox = tasks.filter((task) => task.projectIds.length === 0 && task.status !== "완료" && task.status !== "취소");

  const toggleTask = (task: ProjectTask) =>
    void update("projects", task.id, {
      status: task.status === "완료" ? "미완료" : "완료",
      doneAt: task.status === "완료" ? null : todayISO(),
    });

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented<ProjectView>
          value={view}
          onChange={setView}
          options={[
            { value: "tracks", label: "Tracks" },
            { value: "priority", label: "Priority" },
            { value: "history", label: "History" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={cn(
                "chip border transition",
                mode === item.value
                  ? "border-ink-900 bg-ink-900 text-paper-50"
                  : "border-paper-400 bg-white/50 text-ink-500 hover:border-ink-400 hover:text-ink-800",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {view === "tracks" ? (
        <div className="space-y-4">
          <div className="card flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addQuick();
              }}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <InboxIcon size={16} className="flex-none text-ink-400" />
              <input
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                placeholder="빠르게 할 일 담기 (받은함)"
                className="min-w-0 flex-1 border-none bg-transparent px-1 py-1 text-[0.86rem] outline-none placeholder:text-ink-400"
              />
              <button type="submit" disabled={!quickTitle.trim() || busy} className="btn-primary btn-xs flex-none">
                추가
              </button>
            </form>
            <div className="flex flex-none items-center gap-1">
              {(["업무", "개인", "공부"] as TaskCategory[]).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setQuickCategory(category)}
                  className={cn(
                    "chip border",
                    quickCategory === category
                      ? cn("border-transparent", taskTone(category).bg, taskTone(category).text)
                      : "border-paper-300 bg-white/50 text-ink-400",
                  )}
                >
                  {category}
                </button>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-paper-300 sm:block" />
              <button
                type="button"
                onClick={() => setTaskDraft({ kind: "프로젝트", category: quickCategory })}
                className="btn-outline btn-xs"
              >
                <LayersIcon size={12} /> 프로젝트
              </button>
              <button type="button" onClick={() => setRoutineId("new")} className="btn-outline btn-xs">
                <RepeatIcon size={12} /> 루틴
              </button>
            </div>
          </div>

          {inbox.length > 0 ? (
            <div className="card px-3.5 py-3">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="section-title">받은함</h3>
                <span className="text-[0.64rem] text-ink-400">{inbox.length}개 · 프로젝트를 골라 주세요</span>
              </div>
              <ul className="divide-y divide-paper-300/40">
                {inbox.slice(0, 6).map((task) => (
                  <TaskRow key={task.id} task={task} onOpen={() => setTaskId(task.id)} onToggle={() => toggleTask(task)} />
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            {(["업무", "개인", "공부"] as TaskCategory[]).map((category) => {
              const column = projects.filter((project) => project.category === category);
              return (
                <section key={category} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="flex items-center gap-1.5 text-[0.82rem] font-semibold text-ink-800">
                      <span className={cn("h-2 w-2 rounded-full", taskTone(category).dot)} />
                      {category}
                      <span className="text-[0.66rem] font-normal text-ink-400">{column.length}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setTaskDraft({ kind: "프로젝트", category })}
                      className="rounded p-0.5 text-ink-400 transition hover:bg-paper-200 hover:text-ink-700"
                      aria-label={`${category} 프로젝트 추가`}
                    >
                      <PlusIcon size={14} />
                    </button>
                  </div>

                  {column.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setTaskDraft({ kind: "프로젝트", category })}
                      className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-paper-300 py-4 text-[0.74rem] text-ink-400 transition hover:border-ink-400 hover:text-ink-600"
                    >
                      <PlusIcon size={13} /> {category} 프로젝트
                    </button>
                  ) : (
                    column.map((project) => {
                      const children = tasks.filter((task) => task.projectIds.includes(project.id));
                      const done = children.filter((task) => task.status === "완료").length;
                      const preview = children
                        .filter((task) => task.status !== "취소")
                        .sort((a, b) => (a.status === "완료" ? 1 : 0) - (b.status === "완료" ? 1 : 0))
                        .slice(0, settings.projectTaskPreview);
                      const progress = children.length > 0 ? Math.round((done / children.length) * 100) : 0;
                      return (
                        <article key={project.id} className="card px-3 py-2.5 transition hover:shadow-lift">
                          <button type="button" onClick={() => setProjectId(project.id)} className="w-full text-left">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[0.86rem] font-medium text-ink-900">{project.title}</p>
                                {project.memo ? <p className="mt-0.5 truncate text-[0.66rem] text-ink-400">{project.memo}</p> : null}
                              </div>
                              <span className="flex-none text-[0.62rem] tabular-nums text-ink-400">
                                {done}/{children.length}
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-200">
                              <div className="h-full rounded-full bg-sage-400 transition-all" style={{ width: `${progress}%` }} />
                            </div>
                          </button>

                          {preview.length > 0 ? (
                            <ul className="mt-1 divide-y divide-paper-300/30">
                              {preview.map((task) => (
                                <TaskRow
                                  key={task.id}
                                  task={task}
                                  compact
                                  onOpen={() => setTaskId(task.id)}
                                  onToggle={() => toggleTask(task)}
                                />
                              ))}
                            </ul>
                          ) : null}

                          <div className="mt-1 flex items-center justify-between">
                            {children.length > preview.length ? (
                              <button
                                type="button"
                                onClick={() => setProjectId(project.id)}
                                className="text-[0.66rem] text-ink-400 hover:text-ink-700"
                              >
                                +{children.length - preview.length}개 더
                              </button>
                            ) : (
                              <span />
                            )}
                            <button
                              type="button"
                              onClick={() => setTaskDraft({ kind: "할 일", category: project.category, projectId: project.id })}
                              className="flex items-center gap-0.5 text-[0.66rem] text-ink-400 hover:text-ink-700"
                            >
                              <PlusIcon size={11} /> 할 일
                            </button>
                          </div>

                          {project.due ? (
                            <p className="mt-1 text-[0.6rem] text-ink-400">마감 {formatShort(project.due)}</p>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                </section>
              );
            })}
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="flex items-center gap-1.5 text-[0.82rem] font-semibold text-ink-800">
                <RepeatIcon size={14} className="text-ink-400" /> 오늘의 루틴
                <span className="text-[0.66rem] font-normal text-ink-400">{routines.length}</span>
              </h3>
              <button type="button" onClick={() => setRoutineId("new")} className="flex items-center gap-0.5 text-[0.7rem] text-ink-400 hover:text-ink-700">
                <PlusIcon size={12} /> 루틴 추가
              </button>
            </div>
            {routines.length === 0 ? (
              <EmptyState
                icon={<RepeatIcon size={20} />}
                title="아직 루틴이 없습니다"
                description="매일 반복하고 싶은 작은 일을 등록해 두면 캘린더의 루틴 보기에서 한 달을 한눈에 볼 수 있습니다."
                action={
                  <button type="button" onClick={() => setRoutineId("new")} className="btn-outline btn-xs">
                    첫 루틴 만들기
                  </button>
                }
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {routines.map((routine) => (
                  <RoutineCard
                    key={routine.id}
                    routine={routine}
                    routines={data.routines}
                    date={todayISO()}
                    onCount={(count) => void setRoutineCount(routine, todayISO(), count)}
                    onOpen={() => setRoutineId(routine.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {view === "priority" ? (
        <PriorityView
          tasks={everything}
          projects={projects}
          onOpenTask={setTaskId}
          onOpenProject={setProjectId}
          onToggle={toggleTask}
        />
      ) : null}

      {view === "history" ? (
        <HistoryView
          projects={data.projects.filter((task) => task.kind === "프로젝트")}
          tasks={data.projects.filter((task) => task.kind === "할 일")}
          routines={data.routines.filter((routine) => routine.kind === "루틴")}
          onOpenTask={setTaskId}
          onOpenProject={setProjectId}
          onOpenRoutine={setRoutineId}
          onRestoreTask={(task) => void update("projects", task.id, { status: "미완료", doneAt: null })}
          onRestoreRoutine={(routine) => void update("routines", routine.id, { history: false })}
          onRestoreProject={(project) => void update("projects", project.id, { status: "미완료" })}
          onOpenItem={openItem}
        />
      ) : null}

      <ProjectDrawer
        projectId={projectId}
        onClose={() => setProjectId(null)}
        onOpenTask={(id) => setTaskId(id)}
        onEditProject={(id) => {
          setProjectId(null);
          setTaskId(id);
        }}
      />

      <TaskEditor
        open={taskId !== null || taskDraft !== null}
        taskId={taskId}
        draft={taskDraft ?? undefined}
        onClose={() => {
          setTaskId(null);
          setTaskDraft(null);
        }}
      />

      <RoutineEditor
        open={routineId !== null}
        routineId={routineId && routineId !== "new" ? routineId : null}
        onClose={() => setRoutineId(null)}
      />
    </div>
  );
}

function PriorityView({
  tasks,
  projects,
  onOpenTask,
  onOpenProject,
  onToggle,
}: {
  tasks: ProjectTask[];
  projects: ProjectTask[];
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onToggle: (task: ProjectTask) => void;
}) {
  const open = tasks.filter((task) => task.kind === "할 일" && task.status !== "완료" && task.status !== "취소");
  const quadrants = [
    { key: "do", title: "지금 해야 할 일", hint: "긴급 · 중요", urgent: true, important: true, tone: "border-rose-200 bg-rose-50/50" },
    { key: "plan", title: "계획할 일", hint: "중요 · 긴급하지 않음", urgent: false, important: true, tone: "border-accent-200 bg-accent-50/50" },
    { key: "delegate", title: "빨리 처리할 일", hint: "긴급 · 중요하지 않음", urgent: true, important: false, tone: "border-amber-200 bg-amber-50/50" },
    { key: "later", title: "언젠가", hint: "둘 다 아님", urgent: false, important: false, tone: "border-paper-300 bg-paper-50/60" },
  ] as const;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {quadrants.map((quadrant) => {
        const items = open.filter((task) => task.urgent === quadrant.urgent && task.important === quadrant.important);
        const projectItems = projects.filter(
          (project) => project.urgent === quadrant.urgent && project.important === quadrant.important,
        );
        return (
          <section key={quadrant.key} className={cn("rounded-2xl border p-3", quadrant.tone)}>
            <header className="mb-2 flex items-baseline justify-between">
              <div>
                <h3 className="text-[0.84rem] font-semibold text-ink-800">{quadrant.title}</h3>
                <p className="text-[0.62rem] text-ink-500">{quadrant.hint}</p>
              </div>
              <span className="text-[0.72rem] tabular-nums text-ink-500">{items.length + projectItems.length}</span>
            </header>

            {projectItems.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpenProject(project.id)}
                className="mb-1 flex w-full items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-left"
              >
                <LayersIcon size={12} className="flex-none text-ink-500" />
                <span className="min-w-0 flex-1 truncate text-[0.78rem] font-medium text-ink-800">{project.title}</span>
                <span className="text-[0.6rem] text-ink-400">프로젝트</span>
              </button>
            ))}

            {items.length === 0 && projectItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-paper-300/80 px-2 py-4 text-center text-[0.7rem] text-ink-400">
                비어 있음
              </p>
            ) : (
              <ul className="space-y-1">
                {items.map((task) => (
                  <li key={task.id} className="flex items-start gap-2 rounded-lg bg-white/70 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onToggle(task)}
                      className="mt-0.5 flex h-3.5 w-3.5 flex-none items-center justify-center rounded-[3px] border border-paper-400 hover:border-ink-600"
                    >
                      {task.status === "완료" ? <CheckIcon size={9} /> : null}
                    </button>
                    <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[0.78rem] text-ink-800">{task.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[0.6rem] text-ink-400">
                        <span className={cn("chip py-0", taskTone(task.category).bg, taskTone(task.category).text)}>
                          {task.category}
                        </span>
                        {task.due ? <span>마감 {formatShort(task.due)}</span> : null}
                        {task.status === "대기 중" ? <span>대기 중</span> : null}
                        {task.urgent ? <FlagIcon size={10} className="text-rose-400" /> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
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
  onOpenItem: (resource: "projects" | "routines", id: string) => void;
}) {
  const finishedProjects = projects.filter((project) => project.status === "완료" || project.status === "취소" || project.history);
  const pastRoutines = routines.filter((routine) => routine.history || routine.trash);
  const doneTasks = tasks.filter((task) => task.status === "완료").slice(0, 30);
  const canceled = tasks.filter((task) => task.status === "취소").slice(0, 20);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card px-3.5 py-3">
        <h3 className="section-title mb-2 flex items-center gap-1">
          <StarIcon size={12} className="text-amber-400" /> 지난 프로젝트
        </h3>
        {finishedProjects.length === 0 ? (
          <p className="text-[0.76rem] text-ink-400">완료했거나 접은 프로젝트가 아직 없습니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/40">
            {finishedProjects.map((project) => {
              const children = tasks.filter((task) => task.projectIds.includes(project.id));
              const done = children.filter((task) => task.status === "완료").length;
              return (
                <li key={project.id} className="flex items-center gap-2 py-1.5">
                  <button type="button" onClick={() => onOpenProject(project.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[0.8rem] text-ink-700">{project.title}</span>
                    <span className="text-[0.62rem] text-ink-400">
                      {project.category} · {project.status} · {done}/{children.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestoreProject(project)}
                    className="rounded px-1.5 py-0.5 text-[0.62rem] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                  >
                    되살리기
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card px-3.5 py-3">
        <h3 className="section-title mb-2 flex items-center gap-1">
          <RepeatIcon size={12} /> 지난 루틴
        </h3>
        {pastRoutines.length === 0 ? (
          <p className="text-[0.76rem] text-ink-400">History로 보낸 루틴이 여기에 모입니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/40">
            {pastRoutines.map((routine) => (
              <li key={routine.id} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => onOpenRoutine(routine.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[0.8rem] text-ink-700">{routine.title}</span>
                  <span className="text-[0.62rem] text-ink-400">
                    {routine.category} · {routine.unit || "루틴"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreRoutine(routine)}
                  className="rounded px-1.5 py-0.5 text-[0.62rem] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
                >
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card px-3.5 py-3">
        <h3 className="section-title mb-2">최근 완료한 할 일</h3>
        {doneTasks.length === 0 ? (
          <p className="text-[0.76rem] text-ink-400">완료한 할 일이 아직 없습니다.</p>
        ) : (
          <ul className="space-y-0.5">
            {doneTasks.map((task) => (
              <TaskRow key={task.id} task={task} compact onOpen={() => onOpenTask(task.id)} onToggle={() => onRestoreTask(task)} />
            ))}
          </ul>
        )}
      </section>

      <section className="card px-3.5 py-3">
        <h3 className="section-title mb-2">접어 둔 할 일</h3>
        {canceled.length === 0 ? (
          <p className="text-[0.76rem] text-ink-400">취소한 할 일이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-paper-300/40">
            {canceled.map((task) => (
              <li key={task.id} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[0.8rem] text-ink-500 line-through">{task.title}</span>
                  {task.cancelReason ? <span className="text-[0.62rem] text-ink-400">{task.cancelReason}</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreTask(task)}
                  className="rounded px-1.5 py-0.5 text-[0.62rem] text-ink-400 hover:bg-paper-200 hover:text-ink-700"
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
