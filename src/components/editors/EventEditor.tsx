"use client";

import { useRef, useState } from "react";
import { useData } from "@/state/store";
import { Modal, Segmented, TextInput } from "@/components/common/primitives";
import { EditorFooter, ErrorNote, ProjectPicker } from "@/components/editors/shared";
import { MemoEditor } from "@/components/editors/MemoField";
import { FieldRow, InlineChoice, MoreOptions, ToggleRow } from "@/components/common/detail";
import { plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { EVENT_COLORS, type EventColorKey } from "@/components/common/event-colors";
import { useEventColors } from "@/state/event-colors";
import { useCategoryOptions } from "@/state/categories";
import { addDaysISO, formatShort, memoTitle, startOfWeekISO, todayISO, weekKeyOf, weekdayKo } from "@/lib/date";
import { cn } from "@/lib/utils";
import { type CalendarCategory, type CalendarEvent, type CalendarKind, currentCalendarCategory } from "@/lib/types";

export interface EventDraft {
  date?: string;
  startTime?: string | null;
  /** B5: a dragged empty slot hands over the end of the range as well. */
  endTime?: string | null;
  kind?: CalendarKind;
}

interface FormState {
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
  /** 노션 팔레트에서 고른 일정 색 (이 브라우저에 저장) */
  color: EventColorKey;
}

function formFromEvent(event: CalendarEvent, color: EventColorKey = "default"): FormState {
  return {
    title: event.title,
    kind: event.kind,
    // A10: saving an old record writes the current classification, never the removed one.
    category: currentCalendarCategory(event.category),
    date: event.date || todayISO(),
    allDay: event.allDay,
    startTime: event.startTime ?? "09:00",
    endTime: event.endTime ?? "",
    // A multi-day event keeps its end date; a single day one ends on its own date.
    endDate: event.endDate && event.date && event.endDate > event.date ? event.endDate : "",
    memo: event.memo,
    done: event.done,
    favorite: event.favorite,
    hidden: event.hidden,
    canceled: event.canceled,
    cancelReason: event.cancelReason,
    projectIds: event.projectIds,
    color,
  };
}

function formFromDraft(draft?: EventDraft): FormState {
  const kind = draft?.kind ?? "일정";
  const date = draft?.date ?? todayISO();
  return {
    // A8/A9: a new 주간·월간 메모 is named after the day it is written.
    title: kind === "주간 메모" || kind === "월간 메모" ? memoTitle(todayISO(), kind) : "",
    kind,
    // A10: the old 개인/외부일정/성과/휴먼네트워크 choice is gone from the form; new
    // records keep the single current classification and old values stay untouched.
    category: "개인",
    date,
    allDay: !draft?.startTime,
    startTime: draft?.startTime ?? "09:00",
    endTime: draft?.endTime ?? "",
    endDate: "",
    memo: "",
    done: false,
    favorite: false,
    hidden: false,
    canceled: false,
    cancelReason: "",
    projectIds: [],
    color: "default",
  };
}

export function EventEditor({
  open,
  eventId,
  draft,
  onClose,
}: {
  open: boolean;
  eventId?: string | null;
  draft?: EventDraft;
  onClose: () => void;
}) {
  if (!open) return null;
  return <EventEditorInner key={eventId ?? `new-${draft?.date ?? ""}-${draft?.startTime ?? ""}-${draft?.kind ?? ""}`} eventId={eventId ?? null} draft={draft} onClose={onClose} />;
}

function EventEditorInner({
  eventId,
  draft,
  onClose,
}: {
  eventId: string | null;
  draft?: EventDraft;
  onClose: () => void;
}) {
  const { data, create, update, remove } = useData();
  const existing = eventId ? data.calendar.find((item) => item.id === eventId) ?? null : null;
  const { colorOf, setColor } = useEventColors();
  const categories = useCategoryOptions();
  /** A16: what the window opened with, so closing saves only when something changed. */
  const initialForm = useRef<FormState | null>(null);
  if (initialForm.current === null) {
    initialForm.current = existing ? formFromEvent(existing, colorOf(existing.id) ?? "default") : formFromDraft(draft);
  }
  const [form, setForm] = useState<FormState>(initialForm.current);
  const closing = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** B6: 여러 날을 고르면 '날짜마다'가 기본이고, 저장할 때 '기간'으로 바꿀 수 있습니다. */
  const [multiMode, setMultiMode] = useState<"days" | "range">("days");
  const projects = data.projects.filter((item) => item.kind === "프로젝트" && !item.trash);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const multiDayDraft = form.kind === "일정" && !!form.endDate && form.endDate > form.date;

  /** 저장 본문 — 색만 바뀌었는지 비교하려고 따로 만들어 둡니다. */
  const buildPayload = (state: FormState): Record<string, unknown> => {
    const weekStart = startOfWeekISO(state.date);
    const multi = state.kind === "일정" && !!state.endDate && state.endDate > state.date;
    const spans = spansFromMarkdown(state.memo);
    return {
      title: state.title.trim(),
      kind: state.kind,
      category: state.category,
      date: state.date,
      startTime: state.allDay ? null : state.startTime,
      endTime: state.allDay || state.kind !== "일정" ? null : state.endTime || null,
      // Bug fix: an all-day multi-day event used to lose its end date here.
      endDate: state.kind === "일정" ? (multi && multiMode === "range" ? state.endDate : state.date) : state.date,
      memo: plainOfSpans(spans),
      memoRich: spans,
      done: state.done,
      favorite: state.favorite,
      hidden: state.hidden,
      canceled: state.canceled,
      cancelReason: state.cancelReason,
      cancelAt: state.canceled ? existing?.cancelAt ?? todayISO() : null,
      projectIds: state.projectIds,
      weekKey: state.kind === "일정" ? "" : weekKeyOf(weekStart),
      baseDate: state.kind === "일정" ? null : weekStart,
    };
  };

  const save = async (): Promise<boolean> => {
    if (!form.title.trim()) {
      setError("제목을 입력해 주세요.");
      return false;
    }
    const payload = buildPayload(form);
    /** 바뀐 것이 색뿐이면 노션은 건드리지 않고 이 브라우저에만 색을 남깁니다. */
    const bodyChanged = JSON.stringify(payload) !== JSON.stringify(buildPayload(initialForm.current ?? form));
    const colorKey = form.color;
    if (existing) {
      if (bodyChanged) {
        const ok = await update("calendar", existing.id, payload);
        if (!ok) {
          setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
          return false;
        }
      }
      setColor(existing.id, colorKey);
    } else if (multiDayDraft && multiMode === "days") {
      // B6: '날짜마다' makes one record per day, each with the same time range.
      let cursor = form.date;
      let ok = true;
      while (cursor <= form.endDate) {
        const created = await create("calendar", { ...payload, date: cursor, endDate: cursor });
        if (!created) {
          ok = false;
          break;
        }
        if (created.id) setColor(created.id, colorKey);
        cursor = addDaysISO(cursor, 1);
      }
      if (!ok) {
        setError("일부 날짜를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
    } else {
      const created = await create("calendar", payload);
      if (!created) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
      if (created.id) setColor(created.id, colorKey);
    }
    return true;
  };

  /** A16: X · 바깥 클릭 · 뒤로 가기 · 닫기 all keep what was written. */
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
    form.favorite ? "이번 주 꼭" : null,
    form.done ? "완료" : null,
    form.hidden ? "숨김" : null,
    form.canceled ? "취소" : null,
    multiDayDraft ? "여러 날" : null,
  ].filter((badge): badge is string => !!badge);

  return (
    <Modal
      open
      onClose={closeWithSave}
      title={existing ? "일정 수정" : form.kind === "일정" ? "새 일정" : `${form.kind} 추가`}
      subtitle={form.date ? `${formatShort(form.date)} ${weekdayKo(form.date)}요일` : undefined}
      size="md"
      footer={
        <EditorFooter
          onClose={closeWithSave}
          onSave={() => void save().then((ok) => ok && onClose())}
          onDelete={existing ? () => void remove("calendar", existing.id).then(onClose) : undefined}
          onRestore={existing ? () => void update("calendar", existing.id, { trash: false }).then(onClose) : undefined}
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
          placeholder="무엇을 기록할까요?"
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[calc(18px*var(--fs))] font-medium focus:ring-0"
        />

        {/* A39: 일정 창에서도 NOW 숨김을 바로 정합니다. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-editor-now="true"
            aria-pressed={form.hidden}
            aria-label={form.hidden ? "NOW 숨김 해제" : "NOW 숨김"}
            onClick={() => patch("hidden", !form.hidden)}
            className={cn(
              "inline-flex h-[24px] items-center rounded-full border px-2 text-[calc(13px*var(--fs))] font-semibold transition",
              form.hidden
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-paper-300 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700",
            )}
          >
            NOW
          </button>
          <span className="text-[calc(12.5px*var(--fs))] text-ink-400">NOW 숨김 — 켜면 NOW 모드에서 이 일정을 가립니다</span>
        </div>

        <div className="mt-2">
          <FieldRow label="유형">
            <Segmented<CalendarKind>
              value={form.kind}
              onChange={(value) => patch("kind", value)}
              size="sm"
              options={[
                { value: "일정", label: "일정" },
                { value: "주간 목표", label: "주간 목표" },
                { value: "주간 메모", label: "주간 메모" },
                { value: "월간 메모", label: "월간 메모" },
              ]}
            />
          </FieldRow>

          <FieldRow label="날짜">
            <input
              type="date"
              aria-label="날짜"
              value={form.date}
              onChange={(event) => patch("date", event.target.value)}
              className="input h-9 w-[10.5rem] py-1"
            />
          </FieldRow>

          {form.kind === "일정" ? (
            <>
              <FieldRow label="시간" align="start">
                <div className="space-y-1.5 pt-[3px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      aria-pressed={form.allDay}
                      onClick={() => patch("allDay", true)}
                      className={cn(
                        "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
                        form.allDay ? "border-ink-900 bg-ink-900 text-paper-50" : "border-paper-300 bg-white text-ink-400 hover:border-ink-400",
                      )}
                    >
                      종일
                    </button>
                    <button
                      type="button"
                      aria-pressed={!form.allDay}
                      onClick={() => patch("allDay", false)}
                      className={cn(
                        "rounded-full border px-2.5 py-[3px] text-[calc(13.5px*var(--fs))] leading-5 transition",
                        !form.allDay ? "border-ink-900 bg-ink-900 text-paper-50" : "border-paper-300 bg-white text-ink-400 hover:border-ink-400",
                      )}
                    >
                      시간 지정
                    </button>
                  </div>
                  {form.allDay ? null : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="label">시작 시각</span>
                        <input
                          type="time"
                          value={form.startTime}
                          onChange={(event) => patch("startTime", event.target.value)}
                          className="input h-9 py-1"
                        />
                      </label>
                      <label className="block">
                        <span className="label">종료 시각</span>
                        <input
                          type="time"
                          value={form.endTime}
                          onChange={(event) => patch("endTime", event.target.value)}
                          className="input h-9 py-1"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </FieldRow>

              <FieldRow label="종료 날짜" align="start">
                <div className="space-y-1 pt-[3px]">
                  <input
                    type="date"
                    aria-label="종료 날짜"
                    value={form.endDate}
                    min={form.date}
                    onChange={(event) => patch("endDate", event.target.value)}
                    className="input h-9 w-[10.5rem] py-1"
                  />
                  {multiDayDraft ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { value: "days", label: "날짜마다 따로" },
                          { value: "range", label: "하나로 이어서" },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setMultiMode(option.value)}
                          aria-pressed={multiMode === option.value}
                          className={cn(
                            "rounded-full border px-2 py-[2px] text-[calc(13px*var(--fs))] transition",
                            multiMode === option.value
                              ? "border-ink-900 bg-ink-900 text-paper-50"
                              : "border-paper-300 bg-white text-ink-400 hover:border-ink-400",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[calc(12.5px*var(--fs))] text-ink-400">비우면 하루 일정입니다.</p>
                  )}
                </div>
              </FieldRow>
            </>
          ) : null}

          <FieldRow label="분류">
            <InlineChoice
              label="분류"
              bare
              value={form.category}
              options={categories as CalendarCategory[]}
              onChange={(value) => patch("category", value)}
            />
          </FieldRow>

          {form.kind === "일정" ? (
            <FieldRow label="색">
              <div className="flex flex-wrap items-center gap-1.5">
                {EVENT_COLORS.map((choice) => (
                  <button
                    key={choice.key}
                    type="button"
                    data-event-color={choice.key}
                    aria-pressed={form.color === choice.key}
                    aria-label={choice.label}
                    title={choice.label}
                    onClick={() => patch("color", choice.key)}
                    className={cn(
                      "h-[18px] w-[18px] rounded-full border border-black/5 transition",
                      choice.swatch,
                      form.color === choice.key ? "ring-2 ring-ink-900 ring-offset-1" : "hover:scale-110",
                    )}
                  />
                ))}
              </div>
            </FieldRow>
          ) : null}

          <FieldRow label="프로젝트" align="start">
            <div className="pt-[3px]">
              <ProjectPicker projects={projects} value={form.projectIds} onChange={(ids) => patch("projectIds", ids)} />
            </div>
          </FieldRow>
        </div>

        <div className="mt-3 border-t border-paper-200 pt-2.5">
          <p className="mb-1 text-[calc(13px*var(--fs))] text-ink-400">메모</p>
          <MemoEditor value={form.memo} onChange={(value) => patch("memo", value)} rows={2} hint={false} placeholder="메모 (선택)" />
        </div>

        <MoreOptions badges={badges} className="mt-1">
          <ToggleRow
            checked={form.favorite}
            onChange={(value) => patch("favorite", value)}
            label="이번 주 꼭"
            description="주간 화면 위쪽에 고정합니다"
          />
          <ToggleRow checked={form.done} onChange={(value) => patch("done", value)} label="완료" />
          <ToggleRow
            checked={form.hidden}
            onChange={(value) => patch("hidden", value)}
            label="NOW 숨김"
            description="NOW 화면과 기본 보기에서 감춥니다"
          />
          <ToggleRow checked={form.canceled} onChange={(value) => patch("canceled", value)} label="취소로 표시" />
          {form.canceled ? (
            <div className="px-1 pb-1">
              <TextInput
                value={form.cancelReason}
                onChange={(event) => patch("cancelReason", event.target.value)}
                placeholder="취소 사유 (선택)"
                aria-label="취소 사유"
                className="h-9 py-1"
              />
            </div>
          ) : null}
        </MoreOptions>

        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
