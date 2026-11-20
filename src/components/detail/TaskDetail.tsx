"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/state/store";
import {
  DetailSection,
  DetailShell,
  EmptyEditable,
  InlineChoice,
  InlineFlags,
  InlineStatus,
  InlineText,
  useCommitOnLeave,
  useDetailDraft,
} from "@/components/common/detail";
import { InlineMemo } from "@/components/editors/MemoField";
import { ProjectPicker } from "@/components/editors/shared";
import { editableMemo, plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { formatShort, todayISO, weekdayKo } from "@/lib/date";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  type ProjectTask,
  type TaskCategory,
  type TaskKind,
  type TaskStatus,
} from "@/lib/types";

interface TaskForm {
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
}

function formFromTask(task: ProjectTask): TaskForm {
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
    memo: editableMemo(task),
    waitFor: task.waitFor,
    waitNote: task.waitNote,
    cancelReason: task.cancelReason,
    projectIds: task.projectIds,
  };
}

function buildPatch(task: ProjectTask, draft: TaskForm, changed: string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const has = (key: string) => changed.includes(key);

  if (has("title")) patch.title = draft.title.trim();
  if (has("kind")) patch.kind = draft.kind;
  if (has("category")) patch.category = draft.category;
  if (has("status")) {
    patch.status = draft.status;
    patch.doneAt = draft.status === "완료" ? task.doneAt ?? todayISO() : null;
    patch.cancelAt = draft.status === "취소" ? task.cancelAt ?? todayISO() : null;
    if (draft.status !== "대기 중") {
      patch.waitFor = "";
      patch.waitNote = "";
    }
    if (draft.status !== "취소") patch.cancelReason = "";
  }
  if (has("date")) patch.date = draft.date || null;
  if (has("due")) patch.due = draft.due || null;
  if (has("urgent")) patch.urgent = draft.urgent;
  if (has("important")) patch.important = draft.important;
  if (has("hidden")) patch.hidden = draft.hidden;
  if (has("history")) patch.history = draft.history;
  if (has("waitFor")) patch.waitFor = draft.waitFor;
  if (has("waitNote")) patch.waitNote = draft.waitNote;
  if (has("cancelReason")) patch.cancelReason = draft.cancelReason;
  if (has("memo")) {
    const spans = spansFromMarkdown(draft.memo);
    patch.memoRich = spans;
    patch.memo = plainOfSpans(spans);
  }
  if (has("projectIds")) patch.projectIds = draft.projectIds;
  return patch;
}

function requiredField(draft: TaskForm): string | null {
  if (!draft.title.trim()) return "title";
  return null;
}

/**
 * A4: a task opens as a readable page. Every shown value edits in place, the status
 * opens its choices on one tap, and only real changes reach Notion.
 */
export function TaskDetail({
  open,
  taskId,
  sideBySide,
  onBack,
  onCloseAll,
  registerFlush,
}: {
  open: boolean;
  taskId: string | null;
  sideBySide?: boolean;
  onBack: () => void;
  onCloseAll: () => void;
  registerFlush?: (flush: (() => Promise<boolean>) | null) => void;
}) {
  const { data } = useData();
  const task = taskId ? data.projects.find((item) => item.id === taskId) ?? null : null;
  if (!open || !task) return null;
  return (
    <TaskDetailInner
      task={task}
      sideBySide={sideBySide}
      onBack={onBack}
      onCloseAll={onCloseAll}
      registerFlush={registerFlush}
    />
  );
}

function TaskDetailInner({
  task,
  sideBySide,
  onBack,
  onCloseAll,
  registerFlush,
}: {
  task: ProjectTask;
  sideBySide?: boolean;
  onBack: () => void;
  onCloseAll: () => void;
  registerFlush?: (flush: (() => Promise<boolean>) | null) => void;
}) {
  const { data, update, remove, fetchBody, saveBody, demo } = useData();
  const { draft, set, markSaved, reset, changedKeys, isDirty } = useDetailDraft(formFromTask(task));
  const [field, setField] = useState<string | null>(null);

  const [bodyText, setBodyText] = useState<string | null>(null);
  const [bodySaved, setBodySaved] = useState("");
  const [preserved, setPreserved] = useState<string[]>([]);
  const [bodyEditing, setBodyEditing] = useState(false);

  /** Switching to another task in the right list swaps the content in place. */
  const loadedId = useRef(task.id);
  useEffect(() => {
    if (loadedId.current === task.id) return;
    loadedId.current = task.id;
    reset(formFromTask(task));
    setField(null);
    setBodyText(null);
  }, [task, reset]);

  useEffect(() => {
    let alive = true;
    void fetchBody("projects", task.id).then((payload) => {
      if (!alive) return;
      setBodyText(payload?.text ?? "");
      setBodySaved(payload?.text ?? "");
      setPreserved(payload?.preserved ?? []);
    });
    return () => {
      alive = false;
    };
  }, [task.id, fetchBody]);

  const bodyDirty = bodyText !== null && bodyText !== bodySaved;
  const invalidField = requiredField(draft);

  const commit = async (): Promise<boolean> => {
    if (isDirty) {
      const patch = buildPatch(task, draft, changedKeys as string[]);
      const ok = await update("projects", task.id, patch);
      if (!ok) return false;
      markSaved();
    }
    if (bodyDirty && bodyText !== null) {
      const ok = await saveBody("projects", task.id, bodyText);
      if (!ok) return false;
      setBodySaved(bodyText);
    }
    return true;
  };

  const run = useCommitOnLeave({
    isDirty: isDirty || bodyDirty,
    invalid: invalidField,
    onInvalid: () => setField(invalidField ?? "title"),
    commit,
  });

  useEffect(() => {
    registerFlush?.(run);
    return () => registerFlush?.(null);
  }, [registerFlush, run]);

  const leave = (action: () => void) => {
    void run().then((ok) => {
      if (ok) action();
    });
  };

  const project = task.projectIds.length > 0 ? data.projects.find((item) => item.id === task.projectIds[0]) ?? null : null;
  const categories = TASK_CATEGORIES;

  return (
    <DetailShell
      open
      onBack={() => leave(onBack)}
      onClose={() => leave(onCloseAll)}
      label={`${task.kind} · ${draft.category}`}
      subtitle={project ? project.title : task.kind === "할 일" ? "받은함" : undefined}
      sideBySide={sideBySide}
      footer={
        <>
          <div className="flex items-center gap-1">
            {task.trash ? (
              <button type="button" onClick={() => void update("projects", task.id, { trash: false })} className="btn-outline btn-xs">
                휴지통에서 복원
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void remove("projects", task.id);
                  onCloseAll();
                }}
                className="btn-ghost btn-xs text-rose-500 hover:bg-rose-50"
              >
                삭제
              </button>
            )}
          </div>
          <span className="text-[0.66rem] text-ink-400">
            {invalidField ? (
              <span className="text-rose-500">필수값을 입력해 주세요</span>
            ) : isDirty || bodyDirty ? (
              "바뀐 값은 자동으로 저장됩니다"
            ) : (
              "변경 없음"
            )}
          </span>
        </>
      }
    >
      <div className="space-y-1">
        <InlineText
          label="제목"
          required
          invalid={invalidField === "title"}
          value={draft.title}
          onChange={(value) => set("title", value)}
          active={field === "title"}
          onActivate={() => setField("title")}
          onDone={() => setField(null)}
          placeholder="제목 없음"
          inputClassName="text-[1rem] font-medium"
          valueClassName="border-none px-0 text-[1.22rem] font-semibold tracking-tight text-ink-900"
        />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <InlineStatus
            value={draft.status}
            options={TASK_STATUSES}
            onChange={(value) => {
              set("status", value);
              setField(null);
            }}
          />
          <span className="text-[0.7rem] text-ink-400">{formatShort(draft.date || task.createdAt.slice(0, 10) || todayISO())}</span>
        </div>

        {draft.status === "대기 중" ? (
          <div className="mt-1 grid gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 sm:grid-cols-2">
            <InlineText
              label="대기 대상"
              value={draft.waitFor}
              onChange={(value) => set("waitFor", value)}
              active={field === "waitFor"}
              onActivate={() => setField("waitFor")}
              onDone={() => setField(null)}
              placeholder="누구·무엇을 기다리는지"
            />
            <InlineText
              label="대기 내용"
              value={draft.waitNote}
              onChange={(value) => set("waitNote", value)}
              active={field === "waitNote"}
              onActivate={() => setField("waitNote")}
              onDone={() => setField(null)}
              placeholder="다음에 할 일"
            />
          </div>
        ) : null}

        {draft.status === "취소" ? (
          <div className="mt-1 rounded-xl border border-paper-300 bg-paper-50/70 px-2.5 py-1.5">
            <InlineText
              label="취소 사유"
              value={draft.cancelReason}
              onChange={(value) => set("cancelReason", value)}
              active={field === "cancelReason"}
              onActivate={() => setField("cancelReason")}
              onDone={() => setField(null)}
              placeholder="왜 접었나요?"
            />
          </div>
        ) : null}

        <DetailSection title="일정">
          <div className="grid gap-2 sm:grid-cols-2">
            <InlineText
              label="날짜"
              type="date"
              value={draft.date}
              onChange={(value) => set("date", value)}
              active={field === "date"}
              onActivate={() => setField("date")}
              onDone={() => setField(null)}
              display={draft.date ? `${formatShort(draft.date)} ${weekdayKo(draft.date)}` : undefined}
              placeholder="날짜 없음"
            />
            <InlineText
              label="마감일"
              type="date"
              value={draft.due}
              onChange={(value) => set("due", value)}
              active={field === "due"}
              onActivate={() => setField("due")}
              onDone={() => setField(null)}
              display={draft.due ? `${formatShort(draft.due)} ${weekdayKo(draft.due)}` : undefined}
              placeholder="마감일 없음"
            />
          </div>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <InlineChoice label="유형" value={draft.kind} options={["할 일", "프로젝트"]} onChange={(value) => set("kind", value)} />
            <InlineChoice label="분류" value={draft.category} options={categories} onChange={(value) => set("category", value)} />
          </div>
        </DetailSection>

        <DetailSection title="기타">
          <InlineMemo
            label="기타"
            value={draft.memo}
            onChange={(value) => set("memo", value)}
            active={field === "memo"}
            onActivate={() => setField("memo")}
            onDone={() => setField(null)}
            showLabel={false}
            placeholder="눌러서 메모·링크·두 줄 메모를 적기"
          />
        </DetailSection>

        <DetailSection
          title="내용 (Notion 페이지 본문)"
          action={
            bodyText === null ? (
              <span className="text-[0.64rem] text-ink-300">불러오는 중…</span>
            ) : bodyEditing ? (
              <button type="button" onClick={() => setBodyEditing(false)} aria-label="내용 입력 마침" className="text-[0.66rem] text-ink-500 hover:text-ink-800">
                입력 마침
              </button>
            ) : null
          }
        >
          {bodyText === null ? (
            <p className="rounded-lg bg-paper-100/60 px-2 py-2 text-[0.76rem] text-ink-400">페이지 본문을 불러오는 중입니다.</p>
          ) : bodyEditing ? (
            <div>
              <textarea
                autoFocus
                value={bodyText}
                onChange={(event) => setBodyText(event.target.value)}
                rows={5}
                aria-label="내용 입력"
                placeholder="페이지 본문에 적을 내용"
                className="input min-h-[110px] resize-y leading-relaxed"
              />
              <p className="mt-1 text-[0.64rem] text-ink-400">
                문단만 바뀌고 토글·목록 같은 다른 블록은 그대로 남습니다.
                {preserved.length > 0 ? ` (보존: ${preserved.slice(0, 3).join(", ")})` : ""}
              </p>
            </div>
          ) : bodyText.trim() ? (
            <button
              type="button"
              onClick={() => setBodyEditing(true)}
              aria-label="내용 수정"
              className="w-full whitespace-pre-wrap rounded-lg border-b border-dashed border-paper-300 px-1 py-1.5 text-left text-[0.84rem] leading-relaxed text-ink-700 transition hover:border-ink-400 hover:bg-paper-100/60"
            >
              {bodyText}
            </button>
          ) : (
            <EmptyEditable
              label="눌러서 내용을 적기"
              hint={demo ? "미리보기에서는 이 브라우저 안에만 남습니다." : "Notion 페이지 본문에 저장됩니다."}
              onClick={() => setBodyEditing(true)}
            />
          )}
        </DetailSection>

        <DetailSection title="연결 프로젝트">
          <ProjectPicker
            projects={data.projects.filter((item) => item.kind === "프로젝트" && !item.trash && item.id !== task.id)}
            value={draft.projectIds}
            onChange={(ids) => set("projectIds", ids)}
          />
        </DetailSection>

        <DetailSection title="표시">
          <InlineFlags
            flags={[
              { key: "urgent", label: "긴급", on: draft.urgent },
              { key: "important", label: "중요", on: draft.important },
              { key: "hidden", label: "숨김", on: draft.hidden },
              { key: "history", label: "History", on: draft.history },
            ]}
            onToggle={(key) => {
              if (key === "urgent") set("urgent", !draft.urgent);
              if (key === "important") set("important", !draft.important);
              if (key === "hidden") set("hidden", !draft.hidden);
              if (key === "history") set("history", !draft.history);
            }}
          />
        </DetailSection>

        <p className="pt-1 text-[0.62rem] text-ink-300">
          이전·바깥 클릭은 한 단계, X는 전체 닫기입니다. 바뀐 값이 없으면 저장하지 않습니다.
        </p>
      </div>
    </DetailShell>
  );
}
