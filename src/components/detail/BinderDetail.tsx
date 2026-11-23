"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import {
  DetailSection,
  DetailShell,
  SaveState,
  InlineChoice,
  InlineFlags,
  InlineText,
  useCommitOnLeave,
  useDetailDraft,
} from "@/components/common/detail";
import { TagInput } from "@/components/editors/shared";
import { DocView, RichDocEditor } from "@/components/editors/RichDocEditor";
import { formatFullKo, formatShort, todayISO, weekdayKo } from "@/lib/date";
import { BINDER_KINDS, type BinderEntry, type BinderKind } from "@/lib/types";
import { notionPageUrl } from "@/lib/utils";
import { PhotoEditor, PhotoGallery } from "@/components/common/PhotoField";
import { docFromMarkdown, docToMarkdown, type Doc } from "@/lib/doc";

interface BinderForm {
  title: string;
  kind: BinderKind;
  date: string;
  body: string;
  tags: string[];
  favorite: boolean;
  archiveFlag: boolean;
  photos: string[];
}

function formFromEntry(entry: BinderEntry): BinderForm {
  return {
    title: entry.title,
    kind: entry.kind,
    date: entry.date ?? todayISO(),
    body: entry.body,
    tags: entry.tags,
    favorite: entry.favorite,
    archiveFlag: entry.archiveFlag,
    photos: entry.photos ?? [],
  };
}

function buildPatch(draft: BinderForm, changed: string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const has = (key: string) => changed.includes(key);
  if (has("title")) patch.title = draft.title.trim();
  if (has("kind")) patch.kind = draft.kind;
  if (has("date")) patch.date = draft.date;
  if (has("body")) patch.body = draft.body;
  if (has("tags")) patch.tags = draft.tags;
  if (has("favorite")) patch.favorite = draft.favorite;
  if (has("archiveFlag")) patch.archiveFlag = draft.archiveFlag;
  if (has("photos")) patch.photos = draft.photos;
  return patch;
}

/** A4 for the binder: the record reads first, each value edits in place. */
export function BinderDetail({
  open,
  entryId,
  onBack,
  onCloseDetail,
}: {
  open: boolean;
  entryId: string | null;
  onBack: () => void;
  onCloseDetail: () => void;
}) {
  const { data } = useData();
  const entry = entryId ? data.binder.find((item) => item.id === entryId) ?? null : null;
  if (!open || !entry) return null;
  return <BinderDetailInner key={entry.id} entry={entry} onBack={onBack} onCloseDetail={onCloseDetail} />;
}

function BinderDetailInner({
  entry,
  onBack,
  onCloseDetail,
}: {
  entry: BinderEntry;
  onBack: () => void;
  onCloseDetail: () => void;
}) {
  const { update, remove, fetchBody, saveBody } = useData();
  const { settings } = useSettings();
  const { draft, set, markSaved, changedKeys, isDirty } = useDetailDraft(formFromEntry(entry));
  const [field, setField] = useState<string | null>(null);
  /** A45: 본문 서식 문서 — 처음에는 `기록 데이터` 에서 만들고, 저장된 블록이 있으면 그것을 씁니다. */
  const [doc, setDoc] = useState<Doc>(() => docFromMarkdown(entry.body));
  const docSaved = useRef<string>(docToMarkdown(doc));

  useEffect(() => {
    let alive = true;
    void fetchBody("binder", entry.id).then((payload) => {
      if (!alive || !payload?.doc) return;
      if ((entry.body ?? "").trim() && docToMarkdown(payload.doc) !== (entry.body ?? "").trim()) return;
      setDoc(payload.doc);
      docSaved.current = docToMarkdown(payload.doc);
    });
    return () => {
      alive = false;
    };
  }, [entry.id, entry.body, fetchBody]);

  const invalidField = draft.title.trim() ? null : "title";
  const bodyDirty = docToMarkdown(doc) !== docSaved.current;
  const isProjectDirty = isDirty || bodyDirty;

  const commit = async (): Promise<boolean> => {
    const patch = buildPatch(draft, changedKeys as string[]);
    if (bodyDirty) patch.body = docToMarkdown(doc);
    if (Object.keys(patch).length > 0) {
      const ok = await update("binder", entry.id, patch);
      if (!ok) return false;
      markSaved();
    }
    if (bodyDirty) {
      const ok = await saveBody("binder", entry.id, doc);
      if (!ok) return false;
      docSaved.current = docToMarkdown(doc);
    }
    return true;
  };

  const run = useCommitOnLeave({
    isDirty: isProjectDirty,
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
      onClose={() => leave(onCloseDetail)}
      label={`${draft.kind} · ${formatShort(draft.date)}`}
      subtitle={formatFullKo(draft.date)}
      notionUrl={notionPageUrl(entry)}
      status={
        invalidField ? (
          <span className="text-rose-500">필수값을 입력해 주세요</span>
        ) : (
          <SaveState dirty={isProjectDirty} />
        )
      }
      trashed={entry.trash}
      onRestore={() => void update("binder", entry.id, { trash: false })}
      onTrash={() => {
        void remove("binder", entry.id);
        onCloseDetail();
      }}
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
          <InlineChoice label="종류" value={draft.kind} options={BINDER_KINDS} onChange={(value) => set("kind", value)} />
        </div>

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
          />
          <div>
            <p className="text-[calc(13.5px*var(--fs))] text-ink-400">표시</p>
            <InlineFlags
              flags={[
                { key: "favorite", label: "즐겨찾기", on: draft.favorite },
                { key: "archiveFlag", label: "아카이브 표시", on: draft.archiveFlag },
              ]}
              onToggle={(key) => {
                if (key === "favorite") set("favorite", !draft.favorite);
                if (key === "archiveFlag") set("archiveFlag", !draft.archiveFlag);
              }}
            />
          </div>
        </div>

        <DetailSection
          title="본문"
          action={
            field === "body" ? (
              <button type="button" onClick={() => setField(null)} aria-label="본문 입력 마침" className="text-[calc(13.5px*var(--fs))] text-ink-500 hover:text-ink-800">
                입력 마침
              </button>
            ) : null
          }
        >
          {field === "body" ? (
            <div data-binder-body-editor>
              <RichDocEditor
                doc={doc}
                onChange={setDoc}
                paper={settings.binderPaper}
                minHeight={260}
                placeholder="오늘 있었던 일을 적어 보세요."
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setField("body")}
              aria-label="본문 수정"
              className="w-full rounded-lg border-b border-dashed border-paper-300 px-1 py-1.5 text-left transition hover:border-ink-400 hover:bg-paper-100/50"
            >
              {docToMarkdown(doc).trim() ? (
                <span className="block text-[calc(16px*var(--fs))] text-ink-700">
                  <DocView doc={doc} />
                </span>
              ) : (
                <span className="text-[calc(15px*var(--fs))] text-ink-300">눌러서 본문 쓰기</span>
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
