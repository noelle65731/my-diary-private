"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { Modal, Segmented, TextInput, Toggle } from "@/components/common/primitives";
import { EditorFooter, ErrorNote, ProjectPicker } from "@/components/editors/shared";
import { ProjectIconPicker } from "@/components/common/ProjectIcon";
import { MemoEditor } from "@/components/editors/MemoField";
import { plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  type ItemIcon,
  type ProjectTask,
  type TaskCategory,
  type TaskKind,
  type TaskStatus,
} from "@/lib/types";

export interface TaskDraft {
  kind?: TaskKind;
  category?: TaskCategory;
  date?: string | null;
  projectId?: string;
  urgent?: boolean;
  important?: boolean;
}

interface FormState {
  title: string;
  kind: TaskKind;
  category: TaskCategory;
  status: TaskStatus;
  date: string;
  due: string;
  urgent: boolean;
  important: boolean;
  hidden: boolean;
  history: boolean;
  memo: string;
  waitFor: string;
  waitNote: string;
  cancelReason: string;
  projectIds: string[];
  icon: ItemIcon | null;
}

function formFromTask(task: ProjectTask): FormState {
  return {
    title: task.title,
    kind: task.kind,
    category: task.category,
    status: task.status,
    date: task.date ?? "",
    due: task.due ?? "",
    urgent: task.urgent,
    important: task.important,
    hidden: task.hidden,
    history: task.history,
    memo: task.memo,
    waitFor: task.waitFor,
    waitNote: task.waitNote,
    cancelReason: task.cancelReason,
    projectIds: task.projectIds,
    icon: task.icon ?? null,
  };
}

function formFromDraft(draft?: TaskDraft): FormState {
  return {
    title: "",
    kind: draft?.kind ?? "할 일",
    category: draft?.category ?? "개인",
    status: "미완료",
    date: draft?.date ?? "",
    due: "",
    urgent: draft?.urgent ?? false,
    important: draft?.important ?? false,
    hidden: false,
    history: false,
    memo: "",
    waitFor: "",
    waitNote: "",
    cancelReason: "",
    projectIds: draft?.projectId ? [draft.projectId] : [],
    icon: null,
  };
}

export function TaskEditor({
  open,
  taskId,
  draft,
  onClose,
}: {
  open: boolean;
  taskId?: string | null;
  draft?: TaskDraft;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <TaskEditorInner
      key={taskId ?? `new-${draft?.kind ?? ""}-${draft?.date ?? ""}-${draft?.projectId ?? ""}-${draft?.urgent ? 1 : 0}${draft?.important ? 1 : 0}`}
      taskId={taskId ?? null}
      draft={draft}
      onClose={onClose}
    />
  );
}

function TaskEditorInner({
  taskId,
  draft,
  onClose,
}: {
  taskId: string | null;
  draft?: TaskDraft;
  onClose: () => void;
}) {
  const { data, create, update, remove } = useData();
  const { settings, addCategory } = useSettings();
  const existing = taskId ? data.projects.find((item) => item.id === taskId) ?? null : null;
  const [form, setForm] = useState<FormState>(existing ? formFromTask(existing) : formFromDraft(draft));
  const [error, setError] = useState<string | null>(null);
  // A6: History projects are not offered for a new task.
  const projects = data.projects.filter((item) => item.kind === "프로젝트" && !item.trash && !item.history && item.id !== existing?.id);
  // A7: 업무·개인·공부 plus the categories the user added.
  const categories = [...TASK_CATEGORIES, ...settings.customCategories.filter((item) => !TASK_CATEGORIES.includes(item as never))];
  // A11: 분류와 프로젝트는 여기서 바로 새로 만들 수 있습니다.
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newProject, setNewProject] = useState<string | null>(null);
  const addNewCategory = () => {
    const name = (newCategory ?? "").trim();
    setNewCategory(null);
    if (!name) return;
    addCategory(name);
    patch("category", name as TaskCategory);
  };
  const createProject = async (title: string): Promise<string | null> => {
    const created = await create("projects", { title, kind: "프로젝트", category: form.category, status: "미완료", date: todayISO() });
    return created?.id ?? null;
  };

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /** A10: a project has no 대기/긴급/중요 of its own — those belong to its tasks. */
  const isProject = form.kind === "프로젝트";
  const statuses = TASK_STATUSES.filter((status) => status !== "대기 중" || !isProject || form.status === "대기 중");
  const statusChip = (status: TaskStatus) => {
    if (status === "대기 중") return "border-amber-300 bg-amber-100 text-amber-800";
    if (status === "취소") return "border-rose-200 bg-rose-50 text-rose-600";
    if (status === "완료") return "border-sage-400 bg-sage-400 text-white";
    return "border-ink-900 bg-ink-900 text-paper-50";
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    const completed = form.status === "완료";
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      kind: form.kind,
      category: form.category,
      status: form.status,
      date: form.date || null,
      due: form.due || null,
      doneAt: completed ? existing?.doneAt ?? todayISO() : null,
      urgent: form.urgent,
      important: form.important,
      hidden: form.hidden,
      history: form.history,
      ...(() => {
        const spans = spansFromMarkdown(form.memo);
        return { memo: plainOfSpans(spans), memoRich: spans };
      })(),
      waitFor: form.status === "대기 중" ? form.waitFor : "",
      waitNote: form.status === "대기 중" ? form.waitNote : "",
      cancelReason: form.status === "취소" ? form.cancelReason : "",
      cancelAt: form.status === "취소" ? existing?.cancelAt ?? todayISO() : null,
      projectIds: form.kind === "프로젝트" ? [] : form.projectIds,
      icon: form.kind === "프로젝트" ? form.icon : null,
    };
    if (existing) {
      const ok = await update("projects", existing.id, payload);
      if (!ok) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    } else {
      const created = await create("projects", payload);
      if (!created) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? (form.kind === "프로젝트" ? "프로젝트 수정" : "할 일 수정") : form.kind === "프로젝트" ? "새 프로젝트" : "새 할 일"}
      size="md"
      footer={
        <EditorFooter
          onClose={onClose}
          onSave={() => void save()}
          onDelete={existing ? () => void remove("projects", existing.id).then(onClose) : undefined}
          onRestore={existing ? () => void update("projects", existing.id, { trash: false }).then(onClose) : undefined}
          trashed={existing?.trash}
          saveLabel={existing ? "저장" : "추가"}
        />
      }
    >
      <div className="space-y-3.5">
        <TextInput
          autoFocus
          value={form.title}
          onChange={(event) => patch("title", event.target.value)}
          placeholder={form.kind === "프로젝트" ? "프로젝트 이름" : "무엇을 해야 하나요?"}
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[18px] font-medium focus:ring-0"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Segmented<TaskKind>
            value={form.kind}
            onChange={(value) => patch("kind", value)}
            size="sm"
            options={[
              { value: "할 일", label: "할 일" },
              { value: "프로젝트", label: "프로젝트" },
            ]}
          />
          <Segmented<TaskCategory>
            value={form.category}
            onChange={(value) => patch("category", value)}
            size="sm"
            options={categories.map((category) => ({ value: category as TaskCategory, label: category }))}
          />
          {newCategory === null ? (
            <button
              type="button"
              onClick={() => setNewCategory("")}
              aria-label="분류 새로 추가"
              className="inline-flex h-7 items-center gap-0.5 rounded-full border border-dashed border-paper-400 px-2 text-[14px] text-ink-500 transition hover:border-ink-500 hover:text-ink-900"
            >
              <span className="text-[15px] leading-none">+</span> 분류
            </button>
          ) : (
            <input
              autoFocus
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addNewCategory();
                }
                if (event.key === "Escape") setNewCategory(null);
              }}
              onBlur={addNewCategory}
              placeholder="새 분류 이름"
              aria-label="새 분류 이름"
              className="input h-7 w-[7.5rem] py-0 text-[14px]"
            />
          )}
        </div>

        {isProject ? (
          <div className="rounded-xl border border-paper-300 px-3 py-2">
            <ProjectIconPicker
              value={form.icon}
              onChange={(next) => patch("icon", next)}
              seed={existing?.id ?? form.title ?? "project"}
              category={form.category}
            />
          </div>
        ) : null}

        <div>
          <p className="label">상태</p>
          <div className="flex flex-wrap gap-1.5">
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => patch("status", status)}
                className={cn(
                  "chip border transition",
                  form.status === status ? statusChip(status) : "border-paper-400 bg-white/60 text-ink-600 hover:border-ink-400",
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {form.status === "대기 중" && !isProject ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">대기 대상</span>
              <TextInput value={form.waitFor} onChange={(event) => patch("waitFor", event.target.value)} placeholder="누구·무엇을 기다리는지" />
            </label>
            <label className="block">
              <span className="label">대기 내용</span>
              <TextInput value={form.waitNote} onChange={(event) => patch("waitNote", event.target.value)} placeholder="다음에 할 일" />
            </label>
          </div>
        ) : null}

        {form.status === "취소" ? (
          <label className="block">
            <span className="label">취소 사유</span>
            <TextInput value={form.cancelReason} onChange={(event) => patch("cancelReason", event.target.value)} placeholder="왜 취소되었나요?" />
          </label>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">날짜</span>
            <input type="date" value={form.date} onChange={(event) => patch("date", event.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="label">마감일</span>
            <input type="date" value={form.due} onChange={(event) => patch("due", event.target.value)} className="input" />
          </label>
        </div>

        <div>
          <p className="label">기타</p>
          <MemoEditor value={form.memo} onChange={(value) => patch("memo", value)} rows={3} />
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-paper-300/80 bg-paper-50/60 px-3 py-2">
          {isProject ? null : (
            <>
              <Toggle checked={form.urgent} onChange={(value) => patch("urgent", value)} label="긴급" />
              <Toggle checked={form.important} onChange={(value) => patch("important", value)} label="중요" />
            </>
          )}
          <Toggle checked={form.hidden} onChange={(value) => patch("hidden", value)} label="기본 보기에서 숨김" />
          <Toggle checked={form.history} onChange={(value) => patch("history", value)} label="지난 기록으로 보내기" />
        </div>

        {form.kind === "할 일" ? (
          <div>
            <p className="label">연결 프로젝트</p>
            <ProjectPicker projects={projects} value={form.projectIds} onChange={(ids) => patch("projectIds", ids)} onCreate={createProject} />
          </div>
        ) : null}

        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
