"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useCategoryOptions } from "@/state/categories";
import { Segmented, TextInput } from "@/components/common/primitives";
import { FloatingPanel } from "@/components/common/FloatingPanel";
import { EditorFooter, ErrorNote, ProjectPicker } from "@/components/editors/shared";
import { ProjectIconPicker } from "@/components/common/ProjectIcon";
import { MemoEditor } from "@/components/editors/MemoField";
import { FieldRow, InlineChoice, MoreOptions, ToggleRow } from "@/components/common/detail";
import { plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { formatTimeKo, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { StarIcon } from "@/components/icons";
import {
  TASK_STATUSES,
  type ItemIcon,
  type ProjectTask,
  type TaskCategory,
  type TaskDraft,
  type TaskKind,
  type TaskStatus,
} from "@/lib/types";

// A30: 초안 타입은 ui 상태와 함께 쓰도록 lib에 있고, 기존 import 경로도 그대로 둡니다.
export type { TaskDraft };

interface FormState {
  title: string;
  kind: TaskKind;
  category: TaskCategory;
  status: TaskStatus;
  date: string;
  /** 시간 지정 — off keeps the new task all-day (the default). */
  timed: boolean;
  startTime: string;
  endTime: string;
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
    timed: !!task.startTime,
    startTime: task.startTime ?? "09:00",
    endTime: task.endTime ?? "",
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
    timed: false,
    startTime: "09:00",
    endTime: "",
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
  const { addCategory } = useSettings();
  const existing = taskId ? data.projects.find((item) => item.id === taskId) ?? null : null;
  const [form, setForm] = useState<FormState>(existing ? formFromTask(existing) : formFromDraft(draft));
  /** A16: 자동 저장은 무엇이 바뀌었는지 비교할 수 있게 처음 상태를 기억합니다. */
  const initialForm = useRef<FormState | null>(null);
  if (initialForm.current === null) initialForm.current = existing ? formFromTask(existing) : formFromDraft(draft);
  const closing = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * A30: 창을 열어 둔 채 다른 곳에서 + new / + 할 일을 다시 눌러도 적던 내용은 지우지 않고,
   * 새로 고른 종류·분류·날짜·프로젝트만 반영합니다.
   */
  const draftRef = useRef<TaskDraft | undefined>(draft);
  useEffect(() => {
    if (draft === draftRef.current) return;
    draftRef.current = draft;
    if (!draft) return;
    setForm((current) => ({
      ...current,
      kind: draft.kind ?? current.kind,
      category: draft.category ?? current.category,
      date: draft.date ?? current.date,
      urgent: draft.urgent ?? current.urgent,
      important: draft.important ?? current.important,
      projectIds: draft.projectId ? [draft.projectId] : current.projectIds,
    }));
  }, [draft]);
  // A6: History projects are not offered for a new task.
  const projects = data.projects.filter((item) => item.kind === "프로젝트" && !item.trash && !item.history && item.id !== existing?.id);
  // A7/A16: 업무·개인·공부 plus every category the user made or a record already has.
  const categories = useCategoryOptions();
  // A11: 분류와 프로젝트는 여기서 바로 새로 만들 수 있습니다.
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const createProject = async (title: string): Promise<string | null> => {
    const created = await create("projects", { title, kind: "프로젝트", category: form.category, status: "미완료", date: todayISO() });
    return created?.id ?? null;
  };

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /** A10: a project has no 대기/긴급/중요 of its own — those belong to its tasks. */
  const isProject = form.kind === "프로젝트";
  const statuses = TASK_STATUSES.filter((status) => status !== "대기 중" || !isProject || form.status === "대기 중");
  const weeklyMust = form.urgent && form.important;
  const statusChip = (status: TaskStatus) => {
    if (status === "대기 중") return "border-amber-300 bg-amber-100 text-amber-800";
    if (status === "취소") return "border-rose-200 bg-rose-50 text-rose-600";
    if (status === "완료") return "border-sage-400 bg-sage-400 text-white";
    return "border-ink-900 bg-ink-900 text-paper-50";
  };

  const addNewCategory = () => {
    const name = (newCategory ?? "").trim();
    setNewCategory(null);
    if (!name) return;
    addCategory(name);
    patch("category", name as TaskCategory);
  };

  const save = async (): Promise<boolean> => {
    if (!form.title.trim()) {
      setError("제목을 입력해 주세요.");
      return false;
    }
    const completed = form.status === "완료";
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      kind: form.kind,
      category: form.category,
      status: form.status,
      date: form.date || null,
      // 시간 지정: a start/end on the day, or the day alone when it is off.
      startTime: form.timed && form.date ? form.startTime || "09:00" : null,
      endTime: form.timed && form.date && form.endTime && form.endTime > (form.startTime || "09:00") ? form.endTime : null,
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
        return false;
      }
    } else {
      const created = await create("projects", payload);
      if (!created) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
    }
    return true;
  };

  /** A16: X · 바깥 클릭 · 뒤로 가기로 닫아도 고친 내용은 저장합니다. */
  const closeWithSave = () => {
    if (closing.current) return;
    closing.current = true;
    const changed = JSON.stringify(form) !== JSON.stringify(initialForm.current);
    void (async () => {
      try {
        if (changed && form.title.trim()) await save();
      } finally {
        onClose();
      }
    })();
  };

  const badges = [
    form.urgent || form.important ? [form.urgent ? "긴급" : "", form.important ? "중요" : ""].filter(Boolean).join("·") : null,
    form.hidden ? "숨김" : null,
    form.history ? "History" : null,
    isProject ? "프로젝트" : null,
  ].filter((badge): badge is string => !!badge);

  return (
    <FloatingPanel
      open
      onClose={closeWithSave}
      label={existing ? "수정" : form.kind}
      title={existing ? (form.kind === "프로젝트" ? "프로젝트 수정" : "할 일 수정") : form.kind === "프로젝트" ? "새 프로젝트" : "새 할 일"}
      footer={
        <EditorFooter
          onClose={closeWithSave}
          onSave={() => void save().then((ok) => ok && onClose())}
          onDelete={existing ? () => void remove("projects", existing.id).then(onClose) : undefined}
          onRestore={existing ? () => void update("projects", existing.id, { trash: false }).then(onClose) : undefined}
          trashed={existing?.trash}
          saveLabel={existing ? "저장" : "추가"}
        />
      }
    >
      <div>
        <TextInput
          autoFocus
          value={form.title}
          onChange={(event) => patch("title", event.target.value)}
          placeholder={form.kind === "프로젝트" ? "프로젝트 이름" : "무엇을 해야 하나요?"}
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[calc(18px*var(--fs))] font-medium focus:ring-0"
        />

        {isProject ? (
          <div className="mt-2">
            <ProjectIconPicker
              value={form.icon}
              onChange={(next) => patch("icon", next)}
              seed={existing?.id ?? form.title ?? "project"}
              category={form.category}
            />
          </div>
        ) : null}

        <div className="mt-2">
          <FieldRow label="상태">
            <div className="flex flex-wrap gap-1">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={form.status === status}
                  onClick={() => patch("status", status)}
                  className={cn(
                    "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
                    form.status === status
                      ? statusChip(status)
                      : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </FieldRow>

          {form.status === "대기 중" && !isProject ? (
            <FieldRow label="대기" align="start">
              <div className="space-y-1.5 pt-[3px]">
                <TextInput
                  value={form.waitFor}
                  onChange={(event) => patch("waitFor", event.target.value)}
                  placeholder="누구·무엇을 기다리는지"
                  aria-label="대기 대상"
                  className="h-9 py-1"
                />
                <TextInput
                  value={form.waitNote}
                  onChange={(event) => patch("waitNote", event.target.value)}
                  placeholder="다음에 할 일"
                  aria-label="대기 내용"
                  className="h-9 py-1"
                />
              </div>
            </FieldRow>
          ) : null}

          {form.status === "취소" ? (
            <FieldRow label="취소 사유">
              <TextInput
                value={form.cancelReason}
                onChange={(event) => patch("cancelReason", event.target.value)}
                placeholder="왜 취소되었나요? (선택)"
                aria-label="취소 사유"
                className="h-9 py-1"
              />
            </FieldRow>
          ) : null}

          <FieldRow label="날짜">
            <input
              type="date"
              aria-label="날짜"
              value={form.date}
              onChange={(event) => patch("date", event.target.value)}
              className="input h-9 w-[10.5rem] py-1"
            />
          </FieldRow>

          {/* 시간 지정 — 기본은 시간 없이(날짜만). 켜면 시작·종료 시간을 함께 저장합니다. */}
          <FieldRow label="시간" align="start">
            <div className="space-y-1.5 pt-[3px]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={form.timed}
                  aria-label={form.timed ? "시간 지정 끄기" : "시간 지정 켜기"}
                  onClick={() => {
                    patch("timed", !form.timed);
                    if (!form.timed && !form.date) patch("date", todayISO());
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
                    form.timed
                      ? "border-ink-900 bg-ink-900 text-paper-50"
                      : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
                  )}
                >
                  시간 지정
                </button>
                <span className="text-[calc(12.5px*var(--fs))] text-ink-400">
                  {form.timed
                    ? `${formatTimeKo(form.startTime)}${form.endTime ? `–${formatTimeKo(form.endTime)}` : ""}`
                    : "날짜만 저장"}
                </span>
              </div>
              {form.timed ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">시작 시간</span>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(event) => patch("startTime", event.target.value)}
                      className="input h-9 py-1"
                    />
                  </label>
                  <label className="block">
                    <span className="label">종료 시간</span>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(event) => patch("endTime", event.target.value)}
                      className="input h-9 py-1"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </FieldRow>

          <FieldRow label="마감일">
            <input
              type="date"
              aria-label="마감일"
              value={form.due}
              onChange={(event) => patch("due", event.target.value)}
              className="input h-9 w-[10.5rem] py-1"
            />
          </FieldRow>

          <FieldRow label="분류">
            <div className="flex flex-wrap items-center gap-1">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={form.category === category}
                  onClick={() => patch("category", category as TaskCategory)}
                  className={cn(
                    "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
                    form.category === category
                      ? "border-ink-900 bg-ink-900 text-paper-50"
                      : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
                  )}
                >
                  {category}
                </button>
              ))}
              {newCategory === null ? (
                <button
                  type="button"
                  onClick={() => setNewCategory("")}
                  aria-label="분류 새로 추가"
                  className="inline-flex h-[26px] items-center gap-0.5 rounded-full border border-dashed border-paper-300 px-2 text-[calc(13px*var(--fs))] text-ink-400 transition hover:border-ink-400 hover:text-ink-700"
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
                      addNewCategory();
                    }
                    if (event.key === "Escape") setNewCategory(null);
                  }}
                  onBlur={addNewCategory}
                  placeholder="새 분류 이름"
                  aria-label="새 분류 이름"
                  className="input h-7 w-[7.5rem] py-0 text-[calc(13.5px*var(--fs))]"
                />
              )}
            </div>
          </FieldRow>

          {!isProject ? (
            <FieldRow label="프로젝트" align="start">
              <div className="pt-[3px]">
                <ProjectPicker projects={projects} value={form.projectIds} onChange={(ids) => patch("projectIds", ids)} onCreate={createProject} />
              </div>
            </FieldRow>
          ) : null}
        </div>

        <div className="mt-3 border-t border-paper-200 pt-2.5">
          <p className="mb-1 text-[calc(13px*var(--fs))] text-ink-400">메모</p>
          <MemoEditor value={form.memo} onChange={(value) => patch("memo", value)} rows={2} hint={false} placeholder="메모 (선택)" />
        </div>

        <MoreOptions badges={badges} className="mt-1">
          <FieldRow label="유형">
            <Segmented<TaskKind>
              value={form.kind}
              onChange={(value) => patch("kind", value)}
              size="sm"
              options={[
                { value: "할 일", label: "할 일" },
                { value: "프로젝트", label: "프로젝트" },
              ]}
            />
          </FieldRow>
          {isProject ? null : (
            <FieldRow label="표시">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  aria-pressed={form.urgent}
                  aria-label={`긴급 ${form.urgent ? "끄기" : "켜기"}`}
                  onClick={() => patch("urgent", !form.urgent)}
                  className={cn(
                    "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
                    form.urgent ? "border-rose-300 bg-rose-50 text-rose-600" : "border-paper-300 bg-white text-ink-400 hover:border-ink-400",
                  )}
                >
                  긴급
                </button>
                <button
                  type="button"
                  aria-pressed={form.important}
                  aria-label={`중요 ${form.important ? "끄기" : "켜기"}`}
                  onClick={() => patch("important", !form.important)}
                  className={cn(
                    "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
                    form.important ? "border-ink-900 bg-ink-900 text-paper-50" : "border-paper-300 bg-white text-ink-400 hover:border-ink-400",
                  )}
                >
                  중요
                </button>
                <button
                  type="button"
                  aria-pressed={weeklyMust}
                  aria-label={`이번 주 꼭 ${weeklyMust ? "끄기" : "켜기"}`}
                  title="이번 주 꼭 — 긴급과 중요를 함께 켭니다"
                  onClick={() => {
                    patch("urgent", !weeklyMust);
                    patch("important", !weeklyMust);
                  }}
                  className={cn(
                    "inline-flex h-[26px] items-center gap-1 rounded-full border px-2 text-[calc(13px*var(--fs))] transition",
                    weeklyMust ? "border-amber-300 bg-amber-50 text-amber-700" : "border-paper-300 bg-white text-ink-400 hover:border-ink-400",
                  )}
                >
                  <StarIcon size={12} filled={weeklyMust} className={weeklyMust ? "text-amber-400" : undefined} />
                  이번 주 꼭
                </button>
              </div>
            </FieldRow>
          )}
          <ToggleRow checked={form.hidden} onChange={(value) => patch("hidden", value)} label="NOW 숨김" description="NOW 화면과 기본 보기에서 감춥니다" />
          <ToggleRow checked={form.history} onChange={(value) => patch("history", value)} label="History" description="끝난 기록으로 옮겨 목록에서 감춥니다" />
        </MoreOptions>

        <ErrorNote message={error} />
      </div>
    </FloatingPanel>
  );
}
