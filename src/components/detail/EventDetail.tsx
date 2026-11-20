"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import {
  DetailSection,
  DetailShell,
  InlineChoice,
  InlineFlags,
  InlineText,
  useCommitOnLeave,
  useDetailDraft,
} from "@/components/common/detail";
import { InlineMemo } from "@/components/editors/MemoField";
import { ProjectPicker } from "@/components/editors/shared";
import { editableMemo, plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { formatShort, startOfWeekISO, todayISO, weekKeyOf, weekdayKo } from "@/lib/date";
import {
  CALENDAR_CATEGORIES,
  type CalendarCategory,
  type CalendarEvent,
  type CalendarKind,
} from "@/lib/types";

const KINDS: CalendarKind[] = ["일정", "주간 목표", "주간 메모", "월간 메모"];

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
    category: event.category,
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

function buildPatch(event: CalendarEvent, draft: EventForm, changed: string[]): Record<string, unknown> {
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
    const weekStart = startOfWeekISO(draft.date);
    patch.weekKey = draft.kind === "일정" ? "" : weekKeyOf(weekStart);
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
  onCloseAll,
}: {
  open: boolean;
  eventId: string | null;
  onBack: () => void;
  onCloseAll: () => void;
}) {
  const { data } = useData();
  const event = eventId ? data.calendar.find((item) => item.id === eventId) ?? null : null;
  if (!open || !event) return null;
  return <EventDetailInner key={event.id} event={event} onBack={onBack} onCloseAll={onCloseAll} />;
}

function EventDetailInner({
  event,
  onBack,
  onCloseAll,
}: {
  event: CalendarEvent;
  onBack: () => void;
  onCloseAll: () => void;
}) {
  const { data, update, remove } = useData();
  const { draft, set, markSaved, changedKeys, isDirty } = useDetailDraft(formFromEvent(event));
  const [field, setField] = useState<string | null>(null);

  const invalidField = requiredField(draft);

  const commit = async (): Promise<boolean> => {
    const patch = buildPatch(event, draft, changedKeys as string[]);
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
  });

  const leave = (action: () => void) => {
    void run().then((ok) => {
      if (ok) action();
    });
  };

  const endDateLabel = draft.endDate && draft.endDate > draft.date ? `${formatShort(draft.endDate)} ${weekdayKo(draft.endDate)}까지` : undefined;

  return (
    <DetailShell
      open
      onBack={() => leave(onBack)}
      onClose={() => leave(onCloseAll)}
      label={`${draft.kind} · ${draft.category}`}
      subtitle={draft.date ? `${formatShort(draft.date)} ${weekdayKo(draft.date)}` : undefined}
      footer={
        <>
          <div className="flex items-center gap-1">
            {event.trash ? (
              <button type="button" onClick={() => void update("calendar", event.id, { trash: false })} className="btn-outline btn-xs">
                휴지통에서 복원
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void remove("calendar", event.id);
                  onCloseAll();
                }}
                className="btn-ghost btn-xs text-rose-500 hover:bg-rose-50"
              >
                삭제
              </button>
            )}
          </div>
          <span className="text-[0.66rem] text-ink-400">
            {invalidField ? <span className="text-rose-500">필수값을 입력해 주세요</span> : isDirty ? "바뀐 값은 자동으로 저장됩니다" : "변경 없음"}
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
          valueClassName="border-none px-0 text-[1.22rem] font-semibold tracking-tight text-ink-900"
          inputClassName="text-[1rem] font-medium"
        />

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <InlineFlags
            flags={[
              { key: "done", label: event.kind === "일정" ? "완료" : "완료", on: draft.done },
              { key: "favorite", label: "이번 주 꼭", on: draft.favorite },
              { key: "hidden", label: "숨김", on: draft.hidden },
              { key: "canceled", label: "취소", on: draft.canceled },
            ]}
            onToggle={(key) => {
              if (key === "done") set("done", !draft.done);
              if (key === "favorite") set("favorite", !draft.favorite);
              if (key === "hidden") set("hidden", !draft.hidden);
              if (key === "canceled") set("canceled", !draft.canceled);
            }}
          />
        </div>

        {draft.canceled ? (
          <div className="mt-1 rounded-xl border border-paper-300 bg-paper-50/70 px-2.5 py-1.5">
            <InlineText
              label="취소 사유"
              value={draft.cancelReason}
              onChange={(value) => set("cancelReason", value)}
              active={field === "cancelReason"}
              onActivate={() => setField("cancelReason")}
              onDone={() => setField(null)}
              placeholder="취소 사유 (선택)"
            />
          </div>
        ) : null}

        <DetailSection title="일정">
          <div className="grid gap-2 sm:grid-cols-2">
            <InlineText
              label="날짜"
              type="date"
              required
              invalid={invalidField === "date"}
              value={draft.date}
              onChange={(value) => set("date", value)}
              active={field === "date"}
              onActivate={() => setField("date")}
              onDone={() => setField(null)}
              display={draft.date ? `${formatShort(draft.date)} ${weekdayKo(draft.date)}` : undefined}
              placeholder="날짜를 정해 주세요"
            />
            <div>
              <p className="text-[0.64rem] text-ink-400">종일</p>
              <button
                type="button"
                aria-pressed={draft.allDay}
                aria-label={draft.allDay ? "종일 끄기" : "종일 켜기"}
                onClick={() => set("allDay", !draft.allDay)}
                className={
                  draft.allDay
                    ? "mt-0.5 rounded-full border border-ink-900 bg-ink-900 px-3 py-1 text-[0.8rem] text-paper-50"
                    : "mt-0.5 rounded-full border border-paper-400 bg-white px-3 py-1 text-[0.8rem] text-ink-600"
                }
              >
                {draft.allDay ? "종일" : "시간 지정"}
              </button>
            </div>
          </div>

          {draft.kind === "일정" ? (
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {draft.allDay ? null : (
                <>
                  <InlineText
                    label="시작"
                    type="time"
                    value={draft.startTime}
                    onChange={(value) => set("startTime", value)}
                    active={field === "startTime"}
                    onActivate={() => setField("startTime")}
                    onDone={() => setField(null)}
                  />
                  <InlineText
                    label="종료"
                    type="time"
                    value={draft.endTime}
                    onChange={(value) => set("endTime", value)}
                    active={field === "endTime"}
                    onActivate={() => setField("endTime")}
                    onDone={() => setField(null)}
                    placeholder="종료 시각 없음"
                  />
                </>
              )}
              <InlineText
                label="종료 날짜"
                type="date"
                value={draft.endDate}
                onChange={(value) => set("endDate", value)}
                active={field === "endDate"}
                onActivate={() => setField("endDate")}
                onDone={() => setField(null)}
                display={endDateLabel}
                placeholder="여러 날이면 종료 날짜"
                hint="비우면 하루 일정입니다. 여러 날 일정은 종료 날짜가 저장됩니다."
              />
            </div>
          ) : null}

          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <InlineChoice label="유형" value={draft.kind} options={KINDS} onChange={(value) => set("kind", value)} />
            <InlineChoice label="분류" value={draft.category} options={CALENDAR_CATEGORIES} onChange={(value) => set("category", value)} />
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

        <DetailSection title="연결 프로젝트">
          <ProjectPicker
            projects={data.projects.filter((item) => item.kind === "프로젝트" && !item.trash)}
            value={draft.projectIds}
            onChange={(ids) => set("projectIds", ids)}
          />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
