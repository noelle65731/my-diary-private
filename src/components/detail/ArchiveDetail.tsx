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
import { TagInput } from "@/components/editors/shared";
import { StarRating } from "@/components/common/primitives";
import { renderMarkdown } from "@/lib/markdown";
import { editableMemo, plainOfSpans, spansFromMarkdown } from "@/lib/richtext";
import { formatFullKo, formatShort, todayISO, weekdayKo } from "@/lib/date";
import { ARCHIVE_KINDS, type ArchiveEntry, type ArchiveKind } from "@/lib/types";
import { notionPageUrl } from "@/lib/utils";
import { PhotoEditor, PhotoGallery } from "@/components/common/PhotoField";

interface ArchiveForm {
  title: string;
  kind: ArchiveKind;
  date: string;
  rating: number | null;
  link: string;
  tags: string[];
  body: string;
  favorite: boolean;
  memo: string;
  photos: string[];
  endDate: string;
  endTime: string;
}

function formFromEntry(entry: ArchiveEntry): ArchiveForm {
  return {
    title: entry.title,
    kind: entry.kind,
    date: entry.date ?? todayISO(),
    rating: entry.rating,
    link: entry.link,
    tags: entry.tags,
    body: entry.body,
    favorite: entry.favorite,
    memo: editableMemo(entry),
    photos: entry.photos ?? [],
    endDate: entry.endDate ?? "",
    endTime: entry.endTime ?? "",
  };
}

function buildPatch(draft: ArchiveForm, changed: string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const has = (key: string) => changed.includes(key);
  if (has("title")) patch.title = draft.title.trim();
  if (has("kind")) patch.kind = draft.kind;
  if (has("date")) patch.date = draft.date;
  if (has("rating")) patch.rating = draft.rating;
  if (has("link")) patch.link = draft.link;
  if (has("tags")) patch.tags = draft.tags;
  if (has("body")) patch.body = draft.body;
  if (has("favorite")) patch.favorite = draft.favorite;
  if (has("photos")) patch.photos = draft.photos;
  if (has("endDate")) patch.endDate = draft.endDate || null;
  if (has("endTime")) patch.endTime = draft.endTime || null;
  if (has("memo")) {
    const spans = spansFromMarkdown(draft.memo);
    patch.memoRich = spans;
    patch.memo = plainOfSpans(spans);
  }
  return patch;
}

/** A4 for the archive: a saved record opens as a page, values edit in place. */
export function ArchiveDetail({
  open,
  archiveId,
  onBack,
  onCloseAll,
}: {
  open: boolean;
  archiveId: string | null;
  onBack: () => void;
  onCloseAll: () => void;
}) {
  const { data } = useData();
  const entry = archiveId ? data.archive.find((item) => item.id === archiveId) ?? null : null;
  if (!open || !entry) return null;
  return <ArchiveDetailInner key={entry.id} entry={entry} onBack={onBack} onCloseAll={onCloseAll} />;
}

function ArchiveDetailInner({
  entry,
  onBack,
  onCloseAll,
}: {
  entry: ArchiveEntry;
  onBack: () => void;
  onCloseAll: () => void;
}) {
  const { update, remove } = useData();
  const { draft, set, markSaved, changedKeys, isDirty } = useDetailDraft(formFromEntry(entry));
  const [field, setField] = useState<string | null>(null);

  const invalidField = draft.title.trim() ? null : "title";

  const commit = async (): Promise<boolean> => {
    const patch = buildPatch(draft, changedKeys as string[]);
    if (Object.keys(patch).length === 0) return true;
    const ok = await update("archive", entry.id, patch);
    if (ok) markSaved();
    return ok;
  };

  const run = useCommitOnLeave({
    isDirty,
    invalid: invalidField,
    onInvalid: () => setField("title"),
    commit,
  });

  const leave = (action: () => void) => {
    void run().then((ok) => {
      if (ok) action();
    });
  };

  return (
    <DetailShell
      open
      onBack={() => leave(onBack)}
      onClose={() => leave(onCloseAll)}
      label={`${draft.kind} · ${draft.date ? formatShort(draft.date) : "날짜 없음"}`}
      subtitle={draft.date ? formatFullKo(draft.date) : undefined}
      notionUrl={notionPageUrl(entry)}
      footer={
        <>
          <div className="flex items-center gap-1">
            {entry.trash ? (
              <button type="button" onClick={() => void update("archive", entry.id, { trash: false })} className="btn-outline btn-xs">
                휴지통에서 복원
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void remove("archive", entry.id);
                  onCloseAll();
                }}
                className="btn-ghost btn-xs text-rose-500 hover:bg-rose-50"
              >
                삭제
              </button>
            )}
          </div>
          <span className="text-[calc(13.5px*var(--fs))] text-ink-400">
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
          valueClassName="border-none px-0 text-[calc(20px*var(--fs))] font-semibold tracking-tight text-ink-900"
          inputClassName="text-[calc(16px*var(--fs))] font-medium"
        />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <InlineChoice label="종류" value={draft.kind} options={ARCHIVE_KINDS} onChange={(value) => set("kind", value)} />
          <InlineFlags
            flags={[{ key: "favorite", label: "즐겨찾기", on: draft.favorite }]}
            onToggle={() => set("favorite", !draft.favorite)}
          />
        </div>

        <DetailSection title="기록 정보">
          <div className="grid gap-2 sm:grid-cols-2">
            <InlineText
              label="날짜"
              type="date"
              value={draft.date}
              onChange={(value) => set("date", value)}
              active={field === "date"}
              onActivate={() => setField("date")}
              onDone={() => setField(null)}
              display={draft.date ? formatFullKo(draft.date) : undefined}
            />
            {draft.endDate || draft.endTime ? (
              <div className="grid grid-cols-2 gap-2">
                <InlineText
                  label="종료일"
                  type="date"
                  value={draft.endDate}
                  onChange={(value) => set("endDate", value)}
                  active={field === "endDate"}
                  onActivate={() => setField("endDate")}
                  onDone={() => setField(null)}
                  display={draft.endDate ? formatFullKo(draft.endDate) : undefined}
                  placeholder="종료일 없음"
                />
                <InlineText
                  label="종료 시간"
                  type="time"
                  value={draft.endTime}
                  onChange={(value) => set("endTime", value)}
                  active={field === "endTime"}
                  onActivate={() => setField("endTime")}
                  onDone={() => setField(null)}
                  placeholder="종료 시간 없음"
                />
              </div>
            ) : null}
            <div>
              <p className="text-[calc(13.5px*var(--fs))] text-ink-400">별점</p>
              <div className="pt-0.5">
                <StarRating value={draft.rating} onChange={(value) => set("rating", value)} size={20} />
              </div>
            </div>
          </div>
          <InlineText
            label="링크"
            value={draft.link}
            onChange={(value) => set("link", value)}
            active={field === "link"}
            onActivate={() => setField("link")}
            onDone={() => setField(null)}
            placeholder="https://"
          />
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
            placeholder="눌러서 짧은 설명·링크 적기"
          />
        </DetailSection>

        <DetailSection
          title="메모"
          action={
            field === "body" ? (
              <button type="button" onClick={() => setField(null)} aria-label="메모 입력 마침" className="text-[calc(13.5px*var(--fs))] text-ink-500 hover:text-ink-800">
                입력 마침
              </button>
            ) : null
          }
        >
          {field === "body" ? (
            <textarea
              autoFocus
              rows={6}
              value={draft.body}
              onChange={(event) => set("body", event.target.value)}
              aria-label="메모 입력"
              placeholder="인상 깊었던 점, 다시 볼 이유"
              className="input min-h-[130px] resize-y leading-relaxed"
            />
          ) : (
            <button
              type="button"
              onClick={() => setField("body")}
              aria-label="메모 수정"
              className="w-full rounded-lg border-b border-dashed border-paper-300 px-1 py-1.5 text-left transition hover:border-ink-400 hover:bg-paper-100/50"
            >
              {draft.body.trim() ? (
                <span className="doc-body block text-[calc(15.5px*var(--fs))] text-ink-700">{renderMarkdown(draft.body)}</span>
              ) : (
                <span className="text-[calc(15px*var(--fs))] text-ink-300">눌러서 메모 쓰기</span>
              )}
            </button>
          )}
        </DetailSection>

        <DetailSection title="사진">
          <PhotoGallery photos={draft.photos} className="mb-2" />
          <PhotoEditor photos={draft.photos} onChange={(next) => set("photos", next)} />
        </DetailSection>

        <DetailSection title="태그">
          <TagInput tags={draft.tags} onChange={(tags) => set("tags", tags)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
