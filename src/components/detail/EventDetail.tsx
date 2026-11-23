"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useCategoryOptions } from "@/state/categories";
import { useEventColors } from "@/state/event-colors";
import { cn } from "@/lib/utils";
import { EVENT_COLORS } from "@/components/common/event-colors";
import {
  DetailSection,
  DetailShell,
  FieldRow,
  InlineChoice,
  InlineStatus,
  InlineText,
  InlineTitle,
  MoreOptions,
  SaveState,
  useCommitOnLeave,
  useDetailDraft,
  type SavePhase,
} from "@/components/common/detail";
import { InlineMemo } from "@/components/editors/MemoField";
import { ProjectPicker } from "@/components/editors/shared";
import { StarIcon } from "@/components/icons";
import { editableMemo, plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { addDaysISO, formatShort, startOfWeekISO, todayISO, weekKeyOf, weekdayKo } from "@/lib/date";
import { notionPageUrl } from "@/lib/utils";
import {
  currentCalendarCategory,
  isLegacyCalendarCategory,
  type CalendarCategory,
  type CalendarEvent,
  type CalendarKind,
} from "@/lib/types";

const KINDS: CalendarKind[] = ["일정", "주간 목표", "주간 메모", "월간 메모"];
/** 일정 상태 — 예정 · 완료 · 취소 (done/canceled 두 값으로 저장됩니다). */
const STATUSES = ["예정", "완료", "취소"] as const;
type EventStatus = (typeof STATUSES)[number];

interface EventForm {
  title: string;
  kind: CalendarKind;
  category: CalendarCategory;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  endDate: string;
  memo: string;
  done: boolean;
  favorite: boolean;
  hidden: boolean;
  canceled: boolean;
  cancelReason: string;
  projectIds: string[];
}

function formFromEvent(event: CalendarEvent): EventForm {
  return {
    title: event.title,
    kind: event.kind,
    // A10: the old 외부일정·성과·휴먼네트워크 value is never offered again — the sheet
    // shows its current equivalent, and saving another value replaces it.
    category: currentCalendarCategory(event.category),
    date: event.date || todayISO(),
    allDay: event.allDay,
    startTime: event.startTime ?? "09:00",
    endTime: event.endTime ?? "",
    endDate: event.endDate ?? "",
    memo: editableMemo(event),
    done: event.done,
    favorite: event.favorite,
    hidden: event.hidden,
    canceled: event.canceled,
    cancelReason: event.cancelReason,
    projectIds: event.projectIds,
  };
}

function statusOf(draft: EventForm): EventStatus {
  if (draft.canceled) return "취소";
  if (draft.done) return "완료";
  return "예정";
}

function buildPatch(
  event: CalendarEvent,
  draft: EventForm,
  changed: string[],
  weekStartsOn: 0 | 1 = 1,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const has = (key: string) => changed.includes(key);

  if (has("title")) patch.title = draft.title.trim();
  if (has("category")) patch.category = draft.category;
  if (has("kind")) patch.kind = draft.kind;

  const touchesWhen =
    has("date") || has("startTime") || has("endTime") || has("endDate") || has("allDay") || has("kind");
  if (touchesWhen) {
    const timed = draft.kind === "일정" && !draft.allDay;
    const multiDay = draft.kind === "일정" && !!draft.endDate && draft.endDate > draft.date;
    patch.date = draft.date;
    patch.startTime = timed ? draft.startTime || "09:00" : null;
    patch.endTime = timed ? draft.endTime || null : null;
    // The end date is kept for a multi-day event; a single day event ends on its own date.
    patch.endDate = draft.kind === "일정" ? (multiDay ? draft.endDate : draft.date) : draft.date;
    const weekStart = startOfWeekISO(draft.date, weekStartsOn);
    patch.weekKey = draft.kind === "일정" ? "" : weekKeyOf(weekStart, weekStartsOn);
    patch.baseDate = draft.kind === "일정" ? null : weekStart;
  }

  if (has("memo")) {
    const spans = spansFromMarkdown(draft.memo);
    patch.memoRich = spans;
    patch.memo = plainOfSpans(spans);
  }
  if (has("done")) patch.done = draft.done;
  if (has("favorite")) patch.favorite = draft.favorite;
  if (has("hidden")) patch.hidden = draft.hidden;
  if (has("canceled")) {
    patch.canceled = draft.canceled;
    patch.cancelAt = draft.canceled ? event.cancelAt ?? todayISO() : null;
  }
  if (has("cancelReason")) patch.cancelReason = draft.cancelReason;
  if (has("projectIds")) patch.projectIds = draft.projectIds;
  return patch;
}

function requiredField(draft: EventForm): string | null {
  if (!draft.title.trim()) return "title";
  if (draft.kind === "일정" && !draft.date) return "date";
  return null;
}

/** A4 for the calendar: readable detail first, every value edits in place. */
export function EventDetail({
  open,
  eventId,
  onBack,
  onCloseDetail,
}: {
  open: boolean;
  eventId: string | null;
  onBack: () => void;
  onCloseDetail: () => void;
}) {
  const { data } = useData();
  const event = eventId ? data.calendar.find((item) => item.id === eventId) ?? null : null;
  if (!open || !event) return null;
  return <EventDetailInner key={event.id} event={event} onBack={onBack} onCloseDetail={onCloseDetail} />;
}

function EventDetailInner({
  event,
  onBack,
  onCloseDetail,
}: {
  event: CalendarEvent;
  onBack: () => void;
  onCloseDetail: () => void;
}) {
  const { data, update, remove } = useData();
  /** A40: 저장할 때 주간 키를 설정의 주 시작에 맞춥니다. */
  const { settings } = useSettings();
  const { colorOf, setColor } = useEventColors();
  const { draft, set, markSaved, changedKeys, isDirty } = useDetailDraft(formFromEvent(event));
  const [field, setField] = useState<string | null>(null);
  const [phase, setPhase] = useState<SavePhase>("idle");
  /** A10/A16: 업무 · 개인 · 공부 and the categories the user added — nothing older. */
  const categoryOptions = useCategoryOptions() as CalendarCategory[];
  const legacyCategory = isLegacyCalendarCategory(event.category) ? event.category : null;

  const invalidField = requiredField(draft);
  const status = statusOf(draft);
  const multiDay = draft.kind === "일정" && !!draft.endDate && draft.endDate > draft.date;
  const endDateLabel = draft.endDate && draft.endDate > draft.date ? `${formatShort(draft.endDate)} ${weekdayKo(draft.endDate)}까지` : undefined;

  const commit = async (): Promise<boolean> => {
    const patch = buildPatch(event, draft, changedKeys as string[], settings.weekStartsOn);
    if (Object.keys(patch).length === 0) return true;
    const ok = await update("calendar", event.id, patch);
    if (ok) markSaved();
    return ok;
  };

  const run = useCommitOnLeave({
    isDirty,
    invalid: invalidField,
    onInvalid: () => setField(invalidField ?? "title"),
    commit,
    onPhase: setPhase,
  });

  const leave = (action: () => void) => {
    void run().then((ok) => {
      if (ok) action();
    });
  };

  /** A44: 시작일을 미룬 뒤에도 `여러 날`이 접히지 않게 종료 날짜를 같이 밀어 줍니다. */
  const setDate = (value: string) => {
    set("date", value);
    if (draft.endDate && value && draft.endDate <= value) set("endDate", addDaysISO(value, 1));
  };

  const setStatus = (next: EventStatus) => {
    set("done", next === "완료");
    set("canceled", next === "취소");
    setField(null);
  };

  /**
   * A44: `여러 날`은 종일/시간 지정과 별개인 토글 — 켜면 종료 날짜 줄이 바로 펼쳐지고,
   * 끄면 하루짜리(종료 날짜 = 시작 날짜)로 접힙니다. 예전처럼 `세부 옵션`에 숨기지 않습니다.
   */
  const toggleMultiDay = () => {
    if (multiDay) {
      set("endDate", "");
      return;
    }
    set("endDate", addDaysISO(draft.date || todayISO(), 1));
  };

  const badges = [
    draft.hidden ? "숨김" : null,
    status === "취소" ? "취소" : null,
    multiDay ? "여러 날" : null,
    draft.kind !== "일정" ? draft.kind : null,
  ].filter((badge): badge is string => !!badge);

  return (
    <DetailShell
      open
      onBack={() => leave(onBack)}
      onClose={() => leave(onCloseDetail)}
      label={`일정`}
      ariaLabel={`${draft.kind} · ${draft.category}`}
      notionUrl={notionPageUrl(event)}
      status={<SaveState dirty={isDirty} saving={phase === "saving"} saved={phase === "saved"} error={invalidField === "title" && field !== "title" ? "제목을 입력해 주세요" : null} />}
      trashed={event.trash}
      onRestore={() => void update("calendar", event.id, { trash: false })}
      onTrash={() => {
        void remove("calendar", event.id);
        onCloseDetail();
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
        />
      </div>

      {/* 상태 — 한 번 눌러 예정 · 완료 · 취소. 오른쪽 별은 이번 주 꼭. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <InlineStatus value={status} options={STATUSES} onChange={setStatus} toneOf={statusTone} />
        <button
          type="button"
          aria-pressed={draft.favorite}
          aria-label={`이번 주 꼭 ${draft.favorite ? "끄기" : "켜기"}`}
          title="이번 주 꼭 — 주간 화면 위쪽에 고정합니다"
          onClick={() => set("favorite", !draft.favorite)}
          className={cn(
            "inline-flex h-[26px] items-center gap-1 rounded-full border px-2 text-[calc(13.5px*var(--fs))] transition",
            draft.favorite
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
          )}
        >
          <StarIcon size={13} filled={draft.favorite} className={draft.favorite ? "text-amber-400" : undefined} />
          이번 주 꼭
        </button>
        {/* A39: 개별 일정도 NOW 숨김을 바로 켜고 끌니다(켜진 NOW 모드에서만 가려집니다). */}
        <button
          type="button"
          data-event-now="true"
          aria-pressed={draft.hidden}
          aria-label={draft.hidden ? "NOW 숨김 해제" : "NOW 숨김"}
          title="NOW 숨김 — 켜면 NOW 모드에서 이 일정을 가립니다"
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

      {draft.canceled ? (
        <div className="mt-1.5">
          <FieldRow label="취소 사유">
            <InlineText
              label="취소 사유"
              bare
              value={draft.cancelReason}
              onChange={(value) => set("cancelReason", value)}
              active={field === "cancelReason"}
              onActivate={() => setField("cancelReason")}
              onDone={() => setField(null)}
              placeholder="왜 취소했는지 (선택)"
            />
          </FieldRow>
        </div>
      ) : null}

      <DetailSection title="일정" className="mt-3">
        <FieldRow label="날짜">
          <InlineText
            label="날짜"
            bare
            type="date"
            required
            invalid={invalidField === "date"}
            value={draft.date}
            onChange={setDate}
            active={field === "date"}
            onActivate={() => setField("date")}
            onDone={() => setField(null)}
            display={draft.date ? `${formatShort(draft.date)} ${weekdayKo(draft.date)}` : undefined}
            placeholder="날짜를 정해 주세요"
          />
        </FieldRow>

        {draft.kind === "일정" ? (
          <>
            <FieldRow label="시간">
              <div className="flex flex-wrap items-center gap-1.5">
                <TimeMode pressed={draft.allDay} onClick={() => set("allDay", true)} label="종일" />
                <TimeMode pressed={!draft.allDay} onClick={() => set("allDay", false)} label="시간 지정" />
                {/* A44: 종일/시간 지정과 별개로 `여러 날`을 켜고 끕니다 — 둘 다 함께 고를 수 있습니다. */}
                <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-paper-300" />
                <TimeMode pressed={multiDay} onClick={toggleMultiDay} label="여러 날" />
                {draft.allDay ? null : (
                  <span className="flex flex-nowrap items-center gap-0.5 text-[calc(13.5px*var(--fs))] text-ink-300">
                    <InlineText
                      label="시작"
                      bare
                      type="time"
                      value={draft.startTime}
                      onChange={(value) => set("startTime", value)}
                      active={field === "startTime"}
                      onActivate={() => setField("startTime")}
                      onDone={() => setField(null)}
                      nowrap
                    />
                    <span className="px-0.5">–</span>
                    <InlineText
                      label="종료"
                      bare
                      type="time"
                      value={draft.endTime}
                      onChange={(value) => set("endTime", value)}
                      active={field === "endTime"}
                      onActivate={() => setField("endTime")}
                      onDone={() => setField(null)}
                      placeholder="종료 시각"
                      nowrap
                    />
                  </span>
                )}
              </div>
            </FieldRow>
            {multiDay ? (
              <FieldRow label="종료 날짜">
                <InlineText
                  label="종료 날짜"
                  bare
                  type="date"
                  value={draft.endDate}
                  onChange={(value) => set("endDate", value)}
                  active={field === "endDate"}
                  onActivate={() => setField("endDate")}
                  onDone={() => setField(null)}
                  display={endDateLabel}
                />
              </FieldRow>
            ) : null}
          </>
        ) : null}

      </DetailSection>

      {/* ③ 분류 — 분류 · 색 · 연결 프로젝트 */}
      <DetailSection title="분류">
        <FieldRow label="분류">
          <InlineChoice
            label="분류"
            bare
            value={draft.category}
            options={categoryOptions}
            onChange={(value) => set("category", value)}
          />
        </FieldRow>

        <FieldRow label="색">
          <div className="flex flex-wrap items-center gap-1.5">
            {EVENT_COLORS.map((choice) => {
              const active = (colorOf(event.id) ?? "default") === choice.key;
              return (
                <button
                  key={choice.key}
                  type="button"
                  data-event-color={choice.key}
                  aria-label={choice.label}
                  aria-pressed={active}
                  title={choice.label}
                  onClick={() => setColor(event.id, choice.key)}
                  className={cn(
                    "h-[18px] w-[18px] rounded-full border border-black/5 transition",
                    choice.swatch,
                    active ? "ring-2 ring-ink-900 ring-offset-1" : "hover:scale-110",
                  )}
                />
              );
            })}
          </div>
        </FieldRow>

        {legacyCategory ? (
          <p className="mt-1 text-[calc(12.5px*var(--fs))] text-ink-400">
            옛 분류 ‘{legacyCategory}’은(는) ‘{currentCalendarCategory(legacyCategory)}’로 보입니다. 다른 분류를 고르면 그 값으로 저장됩니다.
          </p>
        ) : null}

        <FieldRow label="프로젝트" align="start">
          <div className="pt-[3px]">
            <ProjectPicker
              projects={data.projects.filter((item) => item.kind === "프로젝트" && !item.trash)}
              value={draft.projectIds}
              onChange={(ids) => set("projectIds", ids)}
            />
          </div>
        </FieldRow>
      </DetailSection>

      {/* ④ 메모 */}
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

      {/* ⑤ 세부 옵션 — 잘 안 쓰는 것만 (유형 변경). 종료 날짜는 위 `여러 날`이 맡습니다. */}
      <MoreOptions badges={badges}>
        <FieldRow label="유형">
          <InlineChoice label="유형" bare value={draft.kind} options={KINDS} onChange={(value) => set("kind", value)} />
        </FieldRow>
      </MoreOptions>
    </DetailShell>
  );
}

function statusTone(status: EventStatus): string {
  if (status === "취소") return "border-rose-200 bg-rose-50 text-rose-600";
  if (status === "완료") return "border-sage-400 bg-sage-400 text-white";
  return "border-ink-700 bg-white text-ink-800";
}

/** 종일 / 시간 지정 — 두 칩 중 하나가 켜져 있습니다. */
function TimeMode({ pressed, onClick, label }: { pressed: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={pressed ? `${label} (켜짐)` : label}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
        pressed
          ? "border-ink-900 bg-ink-900 text-paper-50"
          : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
      )}
    >
      {label}
    </button>
  );
}
