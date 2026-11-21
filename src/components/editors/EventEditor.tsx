"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { Modal, Segmented, TextInput, Toggle } from "@/components/common/primitives";
import { EditorFooter, ErrorNote, ProjectPicker } from "@/components/editors/shared";
import { MemoEditor } from "@/components/editors/MemoField";
import { plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { CalendarIcon, StarIcon } from "@/components/icons";
import { addDaysISO, memoTitle, startOfWeekISO, todayISO, weekKeyOf } from "@/lib/date";
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
}

function formFromEvent(event: CalendarEvent): FormState {
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
  const [form, setForm] = useState<FormState>(existing ? formFromEvent(existing) : formFromDraft(draft));
  const [error, setError] = useState<string | null>(null);
  /** B6: 여러 날을 고르면 '날짜마다'가 기본이고, 저장할 때 '기간'으로 바꿀 수 있습니다. */
  const [multiMode, setMultiMode] = useState<"days" | "range">("days");
  const projects = data.projects.filter((item) => item.kind === "프로젝트" && !item.trash);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const multiDayDraft = form.kind === "일정" && !!form.endDate && form.endDate > form.date;

  const save = async () => {
    if (!form.title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    const weekStart = startOfWeekISO(form.date);
    const multiDay = form.kind === "일정" && !!form.endDate && form.endDate > form.date;
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      kind: form.kind,
      category: form.category,
      date: form.date,
      startTime: form.allDay ? null : form.startTime,
      endTime: form.allDay || form.kind !== "일정" ? null : form.endTime || null,
      // Bug fix: an all-day multi-day event used to lose its end date here.
      endDate: form.kind === "일정" ? (multiDay && multiMode === "range" ? form.endDate : form.date) : form.date,
      ...(() => {
        const spans = spansFromMarkdown(form.memo);
        return { memo: plainOfSpans(spans), memoRich: spans };
      })(),
      done: form.done,
      favorite: form.favorite,
      hidden: form.hidden,
      canceled: form.canceled,
      cancelReason: form.cancelReason,
      cancelAt: form.canceled ? existing?.cancelAt ?? todayISO() : null,
      projectIds: form.projectIds,
      weekKey: form.kind === "일정" ? "" : weekKeyOf(weekStart),
      baseDate: form.kind === "일정" ? null : weekStart,
    };
    if (existing) {
      const ok = await update("calendar", existing.id, payload);
      if (!ok) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    } else if (multiDay && multiMode === "days") {
      // B6: '날짜마다' makes one record per day, each with the same time range.
      let cursor = form.date;
      let ok = true;
      while (cursor <= form.endDate) {
        const created = await create("calendar", { ...payload, date: cursor, endDate: cursor });
        if (!created) {
          ok = false;
          break;
        }
        cursor = addDaysISO(cursor, 1);
      }
      if (!ok) {
        setError("일부 날짜를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    } else {
      const created = await create("calendar", payload);
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
      title={existing ? "일정 수정" : form.kind === "일정" ? "새 일정" : `${form.kind} 추가`}
      subtitle={form.date}
      size="md"
      footer={
        <EditorFooter
          onClose={onClose}
          onSave={() => void save()}
          onDelete={existing ? () => void remove("calendar", existing.id).then(onClose) : undefined}
          onRestore={existing ? () => void update("calendar", existing.id, { trash: false }).then(onClose) : undefined}
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
          placeholder="무엇을 기록할까요?"
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[18px] font-medium focus:ring-0"
        />

        <div>
          <p className="label">유형</p>
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">날짜</span>
            <input
              type="date"
              value={form.date}
              onChange={(event) => patch("date", event.target.value)}
              className="input"
            />
          </label>
          {form.kind === "일정" ? (
            <label className="block">
              <span className="label">종료 날짜</span>
              <input
                type="date"
                aria-label="종료 날짜"
                value={form.endDate}
                min={form.date}
                onChange={(event) => patch("endDate", event.target.value)}
                className="input"
              />
              <span className="mt-1 block text-[13.5px] text-ink-400">여러 날이면 종료 날짜를 넣어 주세요.</span>
              {multiDayDraft ? (
                <div className="mt-2">
                  <span className="text-[13.5px] text-ink-400">저장 방식</span>
                  <div className="mt-1 flex gap-1.5">
                    {([
                      { value: "days", label: "날짜마다" },
                      { value: "range", label: "기간" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMultiMode(option.value)}
                        aria-pressed={multiMode === option.value}
                        className={cn(
                          "chip border transition",
                          multiMode === option.value
                            ? "border-ink-900 bg-ink-900 text-paper-50"
                            : "border-paper-400 bg-white/60 text-ink-600 hover:border-ink-400",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <span className="mt-1 block text-[13.5px] text-ink-400">
                    {multiMode === "days" ? "하루씩 따로 저장됩니다." : "하나의 일정으로 이어집니다."}
                  </span>
                </div>
              ) : null}
            </label>
          ) : (
            <div className="flex items-end pb-2 text-[14px] text-ink-400">주간 키에 자동으로 묶입니다</div>
          )}
        </div>

        {form.kind === "일정" ? (
          <div className="flex items-center gap-2">
            <Toggle checked={form.allDay} onChange={(value) => patch("allDay", value)} label="종일" />
          </div>
        ) : null}

        {form.kind === "일정" && !form.allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">시작 시각</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => patch("startTime", event.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="label">종료 시각</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => patch("endTime", event.target.value)}
                className="input"
              />
            </label>
          </div>
        ) : null}

        <div>
          <p className="label">기타</p>
          <MemoEditor value={form.memo} onChange={(value) => patch("memo", value)} rows={3} placeholder="메모 (선택)" />
        </div>

        <div className="rounded-xl border border-paper-300/80 bg-paper-50/60 px-3 py-1">
          <Toggle
            checked={form.favorite}
            onChange={(value) => patch("favorite", value)}
            label={
              <span className="inline-flex items-center gap-1.5">
                <StarIcon size={14} className={form.favorite ? "text-amber-400" : "text-ink-400"} /> 이번 주 꼭
              </span>
            }
            description="주간 화면 상단에 고정됩니다"
          />
          <Toggle checked={form.done} onChange={(value) => patch("done", value)} label="완료" />
          <Toggle checked={form.hidden} onChange={(value) => patch("hidden", value)} label="기본 보기에서 숨김" description="기본 보기에서 감춥니다" />
          <Toggle
            checked={form.canceled}
            onChange={(value) => patch("canceled", value)}
            label="취소"
            tone="accent"
          />
        </div>

        {form.canceled ? (
          <TextInput
            value={form.cancelReason}
            onChange={(event) => patch("cancelReason", event.target.value)}
            placeholder="취소 사유 (선택)"
          />
        ) : null}

        <div>
          <p className="label">연결 프로젝트</p>
          <ProjectPicker projects={projects} value={form.projectIds} onChange={(ids) => patch("projectIds", ids)} />
        </div>

        <ErrorNote message={error} />

        {existing ? (
          <p className="flex items-center gap-1 text-[14px] text-ink-400">
            <CalendarIcon size={12} />
            {existing.weekKey ? `주간 키 ${existing.weekKey}` : "일정"}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
