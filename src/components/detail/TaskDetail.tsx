"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/state/store";
import {
  DetailSection,
  DetailShell,
  EmptyEditable,
  FieldRow,
  InlineChoice,
  InlineFlags,
  InlineStatus,
  InlineText,
  InlineTitle,
  MoreOptions,
  SaveState,
  ToggleRow,
  useCommitOnLeave,
  useDetailDraft,
  type SavePhase,
} from "@/components/common/detail";
import { InlineMemo } from "@/components/editors/MemoField";
import { ProjectPicker } from "@/components/editors/shared";
import { editableMemo, plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { addDaysISO, formatShort, formatTimeKo, todayISO, weekdayKo } from "@/lib/date";
import {
  TASK_STATUSES,
  type ExtraProperty,
  type ItemIcon,
  type ProjectTask,
  type TaskCategory,
  type TaskKind,
  type TaskStatus,
} from "@/lib/types";
import { DynamicProperties, type SchemaMap } from "@/components/detail/DynamicProperties";
import { ProjectIconPicker } from "@/components/common/ProjectIcon";
import { cn, notionPageUrl } from "@/lib/utils";
import { useSettings } from "@/state/settings";
import { useCategoryOptions } from "@/state/categories";
import { StarIcon } from "@/components/icons";

interface TaskForm {
  title: string;
  kind: TaskKind;
  category: TaskCategory;
  status: TaskStatus;
  date: string;
  /** 시간 지정 — off keeps the task all-day (the day is saved without a clock). */
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
  checkedAt: string;
  cancelReason: string;
  projectIds: string[];
  icon: ItemIcon | null;
  /** B2: properties added to the Notion DB later. */
  extra: ExtraProperty[];
}

function formFromTask(task: ProjectTask): TaskForm {
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
    memo: editableMemo(task),
    waitFor: task.waitFor,
    waitNote: task.waitNote,
    checkedAt: task.checkedAt ?? "",
    cancelReason: task.cancelReason,
    projectIds: task.projectIds,
    icon: task.icon ?? null,
    extra: task.extra ?? [],
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
  if (has("date") || has("timed") || has("startTime") || has("endTime")) {
    // 시간 지정: `date` stays the day, the clock goes to Notion as start/end of that day.
    // Turning 시간 지정 off writes the day alone again.
    const day = draft.date;
    const timed = draft.timed && !!day;
    const start = timed ? draft.startTime || "09:00" : null;
    const end = timed && draft.endTime && draft.endTime > (draft.startTime || "09:00") ? draft.endTime : null;
    patch.date = day || null;
    patch.startTime = start;
    patch.endTime = end;
  }
  if (has("due")) patch.due = draft.due || null;
  if (has("urgent")) patch.urgent = draft.urgent;
  if (has("important")) patch.important = draft.important;
  if (has("hidden")) patch.hidden = draft.hidden;
  if (has("history")) patch.history = draft.history;
  if (has("waitFor")) patch.waitFor = draft.waitFor;
  if (has("waitNote")) patch.waitNote = draft.waitNote;
  if (has("cancelReason")) patch.cancelReason = draft.cancelReason;
  if (has("checkedAt")) patch.checkedAt = draft.checkedAt || null;
  if (has("extra")) {
    // B2: only writable properties are sent; formulas are read-only in Notion.
    patch.extraEntries = draft.extra
      .filter((prop) => !prop.readOnly && !prop.type.startsWith("formula"))
      .map((prop) => ({ name: prop.name, type: prop.type, value: prop.value }));
  }
  if (has("memo")) {
    const spans = spansFromMarkdown(draft.memo);
    patch.memoRich = spans;
    patch.memo = plainOfSpans(spans);
  }
  if (has("projectIds")) patch.projectIds = draft.projectIds;
  if (has("icon")) patch.icon = draft.icon;
  return patch;
}

function requiredField(draft: TaskForm): string | null {
  if (!draft.title.trim()) return "title";
  return null;
}

/** A10: waiting is amber, canceled is rose, done is sage — three distinct pills. */
function statusPill(status: TaskStatus): string {
  if (status === "대기 중") return "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (status === "취소") return "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-50";
  if (status === "완료") return "border-sage-400 bg-sage-400 text-white hover:bg-sage-400";
  return "border-ink-700 bg-white text-ink-800 hover:bg-paper-100";
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
  const { data, update, remove, fetchBody, saveBody, fetchSchema, demo, create } = useData();
  const { addCategory } = useSettings();
  // A16: the same 분류 list as the top filters and the routine window.
  const categoryOptions = useCategoryOptions();
  const [schema, setSchema] = useState<SchemaMap>({});
  const { draft, set, markSaved, reset, changedKeys, isDirty } = useDetailDraft(formFromTask(task));
  const [field, setField] = useState<string | null>(null);
  const [phase, setPhase] = useState<SavePhase>("idle");

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
    void fetchSchema("projects").then((map) => {
      if (alive) setSchema(map);
    });
    return () => {
      alive = false;
    };
  }, [fetchSchema]);

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
    onPhase: setPhase,
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
  const categories = categoryOptions;
  /** 새 프로젝트를 만들고 이 할 일에 바로 연결합니다 (Notion DB에 생성). */
  const createProject = async (title: string): Promise<string | null> => {
    const created = await create("projects", {
      title,
      kind: "프로젝트",
      category: draft.category,
      status: "미완료",
      date: todayISO(),
    });
    if (!created) return null;
    return created.id;
  };
  /** A10: a project itself carries no 대기/긴급/중요 — only its tasks do. */
  const isProject = draft.kind === "프로젝트";
  const statusOptions = isProject ? TASK_STATUSES.filter((status) => status !== "대기 중") : TASK_STATUSES;
  /** A29: 할 일의 `이번 주 꼭` 은 긴급·중요를 함께 켠 표시입니다. */
  const weeklyMust = draft.urgent && draft.important;

  const badges = [
    /* A41: 프로젝트 자체에는 긴급·중요가 없습니다 — 배지도 개별 할 일에만 붙입니다. */
    !isProject && (draft.urgent || draft.important)
      ? [draft.urgent ? "긴급" : "", draft.important ? "중요" : ""].filter(Boolean).join("·")
      : null,
    draft.hidden ? "숨김" : null,
    draft.history ? "History" : null,
    draft.extra.length > 0 ? `추가 속성 ${draft.extra.length}` : null,
    isProject ? "프로젝트" : null,
  ].filter((badge): badge is string => !!badge);

  return (
    <DetailShell
      open
      onBack={() => leave(onBack)}
      onClose={() => leave(onCloseAll)}
      label={isProject ? "프로젝트" : "할 일"}
      ariaLabel={`${task.kind} · ${draft.category}`}
      subtitle={project ? project.title : undefined}
      notionUrl={notionPageUrl(task)}
      sideBySide={sideBySide}
      status={
        <SaveState
          dirty={isDirty || bodyDirty}
          saving={phase === "saving"}
          saved={phase === "saved"}
          error={invalidField === "title" && field !== "title" ? "제목을 입력해 주세요" : null}
        />
      }
      trashed={task.trash}
      onRestore={() => void update("projects", task.id, { trash: false })}
      onTrash={() => {
        void remove("projects", task.id);
        onCloseAll();
      }}
    >
      <div className="pt-1">
        <InlineTitle
          value={draft.title}
          onChange={(value) => set("title", value)}
          active={field === "title"}
          onActivate={() => setField("title")}
          onDone={() => setField(null)}
          invalid={invalidField === "title"}
          placeholder={isProject ? "프로젝트 이름" : "제목 없음"}
        />
      </div>

      {isProject ? (
        <div className="mt-1">
          <ProjectIconPicker
            value={draft.icon}
            onChange={(next) => set("icon", next)}
            seed={task.id}
            category={draft.category}
          />
        </div>
      ) : null}

      {/* 상태 — 한 번 눌러 바꿉니다. 대기 중이면 기다리는 내용이 바로 아래에 붙습니다. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <InlineStatus
          value={draft.status}
          options={statusOptions}
          toneOf={statusPill}
          onChange={(value) => {
            set("status", value);
            setField(null);
          }}
        />
        {/* A39: 개별 할 일·프로젝트도 NOW 숨김을 바로 켜고 끌니다. */}
        <button
          type="button"
          data-task-now="true"
          aria-pressed={draft.hidden}
          aria-label={draft.hidden ? "NOW 숨김 해제" : "NOW 숨김"}
          title="NOW 숨김 — 켜면 NOW 모드에서 이 항목을 가립니다"
          onClick={() => set("hidden", !draft.hidden)}
          className={cn(
            "inline-flex h-[26px] items-center gap-1 rounded-full border px-2 text-[calc(13.5px*var(--fs))] font-semibold transition",
            draft.hidden
              ? "border-ink-900 bg-ink-900 text-white"
              : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
          )}
        >
          NOW
        </button>
      </div>

      {!isProject ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <InlineFlags
            flags={[
              { key: "urgent", label: "긴급", on: draft.urgent },
              { key: "important", label: "중요", on: draft.important },
            ]}
            onToggle={(key) => {
              if (key === "urgent") set("urgent", !draft.urgent);
              if (key === "important") set("important", !draft.important);
            }}
          />
          <button
            type="button"
            aria-pressed={weeklyMust}
            aria-label={`이번 주 꼭 ${weeklyMust ? "끄기" : "켜기"}`}
            title="이번 주 꼭 — 긴급과 중요를 함께 켭니다. 주간 화면 위쪽에 고정됩니다."
            onClick={() => {
              set("urgent", !weeklyMust);
              set("important", !weeklyMust);
            }}
            className={cn(
              "inline-flex h-[26px] items-center gap-1 rounded-full border px-2 text-[calc(13.5px*var(--fs))] transition",
              weeklyMust
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
            )}
          >
            <StarIcon size={13} filled={weeklyMust} className={weeklyMust ? "text-amber-400" : undefined} />
            이번 주 꼭
          </button>
        </div>
      ) : null}

      {draft.status === "대기 중" && !isProject ? (
        <DetailSection
          title={
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              기다리는 중
            </span>
          }
        >
          <FieldRow label="대기 대상">
            <InlineText
              label="대기 대상"
              bare
              value={draft.waitFor}
              onChange={(value) => set("waitFor", value)}
              active={field === "waitFor"}
              onActivate={() => setField("waitFor")}
              onDone={() => setField(null)}
              placeholder="누구·무엇을 기다리는지"
            />
          </FieldRow>
          <FieldRow label="대기 내용">
            <InlineText
              label="대기 내용"
              bare
              value={draft.waitNote}
              onChange={(value) => set("waitNote", value)}
              active={field === "waitNote"}
              onActivate={() => setField("waitNote")}
              onDone={() => setField(null)}
              placeholder="다음에 할 일"
            />
          </FieldRow>
          <FieldRow label="확인일">
            <div className="flex flex-wrap items-center gap-1">
              <InlineText
                label="확인일"
                bare
                type="date"
                value={draft.checkedAt}
                onChange={(value) => set("checkedAt", value)}
                active={field === "checkedAt"}
                onActivate={() => setField("checkedAt")}
                onDone={() => setField(null)}
                display={draft.checkedAt ? `${formatShort(draft.checkedAt)} ${weekdayKo(draft.checkedAt)}` : undefined}
                placeholder="확인일 없음"
              />
              <button type="button" onClick={() => set("checkedAt", addDaysISO(todayISO(), 3))} className="btn-outline btn-xs">
                3일 뒤
              </button>
              <button type="button" onClick={() => set("checkedAt", addDaysISO(todayISO(), 7))} className="btn-outline btn-xs">
                1주 뒤
              </button>
              {draft.checkedAt ? (
                <button type="button" onClick={() => set("checkedAt", "")} className="btn-ghost btn-xs">
                  지우기
                </button>
              ) : null}
            </div>
          </FieldRow>
        </DetailSection>
      ) : null}

      {draft.status === "취소" ? (
        <DetailSection title="취소 사유">
          <InlineText
            label="취소 사유"
            bare
            value={draft.cancelReason}
            onChange={(value) => set("cancelReason", value)}
            active={field === "cancelReason"}
            onActivate={() => setField("cancelReason")}
            onDone={() => setField(null)}
            placeholder="왜 취소되었나요? (선택)"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {["일정 변경", "필요 없어짐", "다른 일 우선", "외부 사정"].map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => set("cancelReason", reason)}
                className={cn(
                  "rounded-full border px-2 py-[2px] text-[calc(13px*var(--fs))] transition",
                  draft.cancelReason === reason
                    ? "border-ink-900 bg-ink-900 text-paper-50"
                    : "border-paper-300 bg-white text-ink-400 hover:border-ink-400",
                )}
              >
                {reason}
              </button>
            ))}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title="일정" className="mt-3">
        <FieldRow label="날짜">
          <InlineText
            label="날짜"
            bare
            type="date"
            value={draft.date}
            onChange={(value) => set("date", value)}
            active={field === "date"}
            onActivate={() => setField("date")}
            onDone={() => setField(null)}
            display={draft.date ? `${formatShort(draft.date)} ${weekdayKo(draft.date)}` : undefined}
            placeholder="날짜 없음"
            onClear={() => set("date", "")}
          />
        </FieldRow>

        {/* 시간 지정 — off (the default) saves the day alone; on adds 시작 · 종료 시간. */}
        <FieldRow label="시간">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={draft.timed}
              aria-label={draft.timed ? "시간 지정 끄기" : "시간 지정 켜기"}
              onClick={() => {
                set("timed", !draft.timed);
                if (!draft.timed && !draft.date) set("date", todayISO());
              }}
              className={cn(
                "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
                draft.timed
                  ? "border-ink-900 bg-ink-900 text-paper-50"
                  : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
              )}
            >
              시간 지정
            </button>
            {draft.timed ? (
              <span className="flex flex-nowrap items-center gap-0.5">
                <InlineText
                  label="시작"
                  bare
                  type="time"
                  value={draft.startTime}
                  onChange={(value) => set("startTime", value)}
                  active={field === "startTime"}
                  onActivate={() => setField("startTime")}
                  onDone={() => setField(null)}
                  display={formatTimeKo(draft.startTime)}
                  nowrap
                />
                <span className="px-0.5 text-[calc(13.5px*var(--fs))] text-ink-300">–</span>
                <InlineText
                  label="종료"
                  bare
                  type="time"
                  value={draft.endTime}
                  onChange={(value) => set("endTime", value)}
                  active={field === "endTime"}
                  onActivate={() => setField("endTime")}
                  onDone={() => setField(null)}
                  display={draft.endTime ? formatTimeKo(draft.endTime) : undefined}
                  placeholder="종료"
                  nowrap
                />
              </span>
            ) : (
              <span className="text-[calc(12.5px*var(--fs))] text-ink-300">하루 종일</span>
            )}
          </div>
        </FieldRow>

        <FieldRow label="마감일">
          <InlineText
            label="마감일"
            bare
            type="date"
            value={draft.due}
            onChange={(value) => set("due", value)}
            active={field === "due"}
            onActivate={() => setField("due")}
            onDone={() => setField(null)}
            display={draft.due ? `${formatShort(draft.due)} ${weekdayKo(draft.due)}` : undefined}
            placeholder="없음"
            onClear={() => set("due", "")}
          />
        </FieldRow>

        <FieldRow label="분류">
          <InlineChoice<string>
            label="분류"
            bare
            value={draft.category}
            options={categories}
            onChange={(value) => set("category", value as TaskCategory)}
            onCreate={(name) => addCategory(name)}
          />
        </FieldRow>
      </DetailSection>

      {!isProject ? (
        <DetailSection title="프로젝트">
          <ProjectPicker
            projects={data.projects.filter((item) => item.kind === "프로젝트" && !item.trash && item.id !== task.id)}
            value={draft.projectIds}
            onChange={(ids) => set("projectIds", ids)}
            onCreate={createProject}
          />
        </DetailSection>
      ) : null}

      <DetailSection
        title="내용"
        action={
          bodyText === null ? (
            <span className="text-[calc(12.5px*var(--fs))] text-ink-300">불러오는 중…</span>
          ) : bodyEditing ? (
            <button
              type="button"
              onClick={() => setBodyEditing(false)}
              aria-label="내용 입력 마침"
              className="text-[calc(12.5px*var(--fs))] text-ink-500 hover:text-ink-800"
            >
              입력 마침
            </button>
          ) : null
        }
      >
        {bodyText === null ? (
          <p className="py-1 text-[calc(14px*var(--fs))] text-ink-300">페이지 본문을 불러오는 중입니다.</p>
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
            <p className="mt-1 text-[calc(12.5px*var(--fs))] text-ink-400">
              문단만 바뀌고 토글·목록 같은 다른 블록은 그대로 남습니다.
              {preserved.length > 0 ? ` (보존: ${preserved.slice(0, 3).join(", ")})` : ""}
            </p>
          </div>
        ) : bodyText.trim() ? (
          <button
            type="button"
            onClick={() => setBodyEditing(true)}
            aria-label="내용 수정"
            className="w-full whitespace-pre-wrap rounded-lg px-1 py-1 text-left text-[calc(14.5px*var(--fs))] leading-relaxed text-ink-700 transition hover:bg-paper-100"
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

      <DetailSection title="메모">
        <InlineMemo
          label="메모"
          value={draft.memo}
          onChange={(value) => set("memo", value)}
          active={field === "memo"}
          onActivate={() => setField("memo")}
          onDone={() => setField(null)}
          showLabel={false}
          placeholder="눌러서 메모 · 링크 적기"
        />
      </DetailSection>

      {/* 자주 쓰지 않는 설정 — 기본은 접힘, 켜 둔 값은 배지로 보입니다. */}
      <MoreOptions badges={badges}>
        <FieldRow label="유형">
          <InlineChoice label="유형" bare value={draft.kind} options={["할 일", "프로젝트"]} onChange={(value) => set("kind", value)} />
        </FieldRow>
        <ToggleRow
          checked={draft.hidden}
          onChange={(value) => set("hidden", value)}
          label="NOW 숨김"
          description="NOW 화면과 기본 보기에서 감춥니다"
        />
        <ToggleRow
          checked={draft.history}
          onChange={(value) => set("history", value)}
          label="History"
          description="끝난 기록으로 옮겨 목록에서 감춥니다"
        />
        {draft.extra.length > 0 ? (
          <div className="pt-1.5">
            <p className="mb-1 text-[calc(13px*var(--fs))] text-ink-400">추가 속성 (Notion)</p>
            <DynamicProperties extra={draft.extra} schema={schema} onChange={(next) => set("extra", next)} />
          </div>
        ) : null}
      </MoreOptions>
    </DetailShell>
  );
}
