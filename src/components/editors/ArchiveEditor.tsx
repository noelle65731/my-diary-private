"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { Modal, StarRating, TextArea, TextInput, Toggle } from "@/components/common/primitives";
import { EditorFooter, ErrorNote, TagInput } from "@/components/editors/shared";
import { renderMarkdown } from "@/lib/markdown";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ARCHIVE_KINDS, type ArchiveEntry, type ArchiveKind } from "@/lib/types";

export interface ArchiveDraft {
  kind?: ArchiveKind;
  date?: string;
}

interface FormState {
  title: string;
  kind: ArchiveKind;
  date: string;
  rating: number | null;
  link: string;
  tags: string[];
  body: string;
  favorite: boolean;
}

export function ArchiveEditor({
  open,
  archiveId,
  draft,
  onClose,
}: {
  open: boolean;
  archiveId?: string | null;
  draft?: ArchiveDraft;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <ArchiveEditorInner
      key={archiveId ?? `new-${draft?.kind ?? ""}-${draft?.date ?? ""}`}
      archiveId={archiveId ?? null}
      draft={draft}
      onClose={onClose}
    />
  );
}

function ArchiveEditorInner({
  archiveId,
  draft,
  onClose,
}: {
  archiveId: string | null;
  draft?: ArchiveDraft;
  onClose: () => void;
}) {
  const { data, create, update, remove } = useData();
  const existing = archiveId ? data.archive.find((item) => item.id === archiveId) ?? null : null;
  const [form, setForm] = useState<FormState>(
    existing
      ? {
          title: existing.title,
          kind: existing.kind,
          date: existing.date ?? todayISO(),
          rating: existing.rating,
          link: existing.link,
          tags: existing.tags,
          body: existing.body,
          favorite: existing.favorite,
        }
      : {
          title: "",
          kind: draft?.kind ?? "메모",
          date: draft?.date ?? todayISO(),
          rating: null,
          link: "",
          tags: [],
          body: "",
          favorite: false,
        },
  );
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      kind: form.kind,
      date: form.date,
      baseDate: form.date,
      rating: form.rating,
      link: form.link,
      tags: form.tags,
      body: form.body,
      favorite: form.favorite,
    };
    if (existing) {
      const ok = await update("archive", existing.id, payload);
      if (!ok) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    } else {
      const created = await create("archive", payload);
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
      title={existing ? "아카이브 수정" : "아카이브에 담기"}
      size="md"
      footer={
        <EditorFooter
          onClose={onClose}
          onSave={() => void save()}
          onDelete={existing ? () => void remove("archive", existing.id).then(onClose) : undefined}
          onRestore={existing ? () => void update("archive", existing.id, { trash: false }).then(onClose) : undefined}
          trashed={existing?.trash}
          saveLabel={existing ? "저장" : "담기"}
        />
      }
    >
      <div className="space-y-3.5">
        <TextInput
          autoFocus
          value={form.title}
          onChange={(event) => patch("title", event.target.value)}
          placeholder="제목"
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[1.04rem] font-medium focus:ring-0"
        />

        <div className="flex flex-wrap gap-1.5">
          {ARCHIVE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => patch("kind", kind)}
              className={cn(
                "chip border transition",
                form.kind === kind
                  ? "border-ink-900 bg-ink-900 text-paper-50"
                  : "border-paper-400 bg-white/60 text-ink-600 hover:border-ink-400",
              )}
            >
              {kind}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">날짜</span>
            <input type="date" value={form.date} onChange={(event) => patch("date", event.target.value)} className="input" />
          </label>
          <div>
            <span className="label">별점</span>
            <div className="pt-1">
              <StarRating value={form.rating} onChange={(value) => patch("rating", value)} size={20} />
            </div>
          </div>
        </div>

        <label className="block">
          <span className="label">링크</span>
          <TextInput
            value={form.link}
            onChange={(event) => patch("link", event.target.value)}
            placeholder="https://"
            inputMode="url"
          />
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="label mb-0">메모</p>
            <button
              type="button"
              onClick={() => setPreview((current) => !current)}
              className={cn("text-[0.7rem]", preview ? "text-accent-600" : "text-ink-400 hover:text-ink-600")}
            >
              {preview ? "편집으로" : "미리보기"}
            </button>
          </div>
          {preview ? (
            <div className="doc-body card-quiet max-h-[32vh] overflow-y-auto px-4 py-3 text-[0.86rem] text-ink-700">
              {renderMarkdown(form.body)}
            </div>
          ) : (
            <TextArea
              value={form.body}
              onChange={(event) => patch("body", event.target.value)}
              placeholder="인상 깊었던 점, 다시 볼 이유"
              className="min-h-[120px]"
            />
          )}
        </div>

        <div>
          <p className="label">태그</p>
          <TagInput tags={form.tags} onChange={(tags) => patch("tags", tags)} />
        </div>

        <Toggle checked={form.favorite} onChange={(value) => patch("favorite", value)} label="즐겨찾기 (☆)" />

        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
