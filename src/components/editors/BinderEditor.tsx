"use client";

import { useRef, useState } from "react";
import { useData } from "@/state/store";
import { Modal, Segmented, TextArea, TextInput, Toggle } from "@/components/common/primitives";
import { EditorFooter, ErrorNote, TagInput } from "@/components/editors/shared";
import { renderMarkdown } from "@/lib/markdown";
import { diaryTitle, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { BINDER_KINDS, type BinderEntry, type BinderKind } from "@/lib/types";
import { PhotoEditor } from "@/components/common/PhotoField";

export interface BinderDraft {
  date?: string;
  kind?: BinderKind;
}

interface FormState {
  title: string;
  kind: BinderKind;
  date: string;
  body: string;
  tags: string[];
  favorite: boolean;
  archiveFlag: boolean;
  photos: string[];
}

export function BinderEditor({
  open,
  entryId,
  draft,
  onClose,
}: {
  open: boolean;
  entryId?: string | null;
  draft?: BinderDraft;
  onClose: () => void;
}) {
  if (!open) return null;
  return <BinderEditorInner key={entryId ?? `new-${draft?.date ?? ""}-${draft?.kind ?? ""}`} entryId={entryId ?? null} draft={draft} onClose={onClose} />;
}

function BinderEditorInner({
  entryId,
  draft,
  onClose,
}: {
  entryId: string | null;
  draft?: BinderDraft;
  onClose: () => void;
}) {
  const { data, create, update, remove } = useData();
  const existing = entryId ? data.binder.find((item) => item.id === entryId) ?? null : null;
  const [form, setForm] = useState<FormState>(
    existing
      ? {
          title: existing.title,
          kind: existing.kind,
          date: existing.date ?? todayISO(),
          body: existing.body,
          tags: existing.tags,
          favorite: existing.favorite,
          archiveFlag: existing.archiveFlag,
          photos: existing.photos ?? [],
        }
      : {
          title: "",
          kind: draft?.kind ?? "일기",
          date: draft?.date ?? todayISO(),
          body: "",
          tags: [],
          favorite: false,
          archiveFlag: false,
          photos: [],
        },
  );
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A16: closing the window saves what was written — compare with the opening state. */
  const initialForm = useRef<FormState | null>(null);
  if (initialForm.current === null) {
    initialForm.current = existing
      ? {
          title: existing.title,
          kind: existing.kind,
          date: existing.date ?? todayISO(),
          body: existing.body,
          tags: existing.tags,
          favorite: existing.favorite,
          archiveFlag: existing.archiveFlag,
          photos: existing.photos ?? [],
        }
      : {
          title: "",
          kind: draft?.kind ?? "일기",
          date: draft?.date ?? todayISO(),
          body: "",
          tags: [],
          favorite: false,
          archiveFlag: false,
          photos: [],
        };
  }
  const closing = useRef(false);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<boolean> => {
    const title = form.title.trim() || (form.kind === "일기" ? diaryTitle(form.date) : "제목 없는 노트");
    const payload: Record<string, unknown> = {
      title,
      kind: form.kind,
      date: form.date,
      body: form.body,
      tags: form.tags,
      favorite: form.favorite,
      archiveFlag: form.archiveFlag,
      photos: form.photos,
    };
    if (existing) {
      const ok = await update("binder", existing.id, payload);
      if (!ok) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
    } else {
      const created = await create("binder", payload);
      if (!created) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
    }
    return true;
  };

  /** A16: X · 바깥 클릭 · 뒤로 가기로 닫아도 쓴 내용은 저장합니다(빈 새 기록은 만들지 않음). */
  const closeWithSave = () => {
    if (closing.current) return;
    closing.current = true;
    const changed = JSON.stringify(form) !== JSON.stringify(initialForm.current);
    const hasSomething = Boolean(form.title.trim() || form.body.trim() || form.photos.length);
    void (async () => {
      try {
        if (changed && hasSomething) await save();
      } finally {
        onClose();
      }
    })();
  };

  return (
    <Modal
      open
      onClose={closeWithSave}
      title={existing ? "기록 수정" : form.kind === "일기" ? "새 일기" : "새 노트"}
      subtitle={`${form.date} · ${form.kind}`}
      size="lg"
      footer={
        <EditorFooter
          onClose={closeWithSave}
          onSave={() => void save().then((ok) => ok && onClose())}
          onDelete={existing ? () => void remove("binder", existing.id).then(onClose) : undefined}
          onRestore={existing ? () => void update("binder", existing.id, { trash: false }).then(onClose) : undefined}
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
          placeholder={form.kind === "일기" ? "오늘의 제목" : "노트 제목"}
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[18px] font-medium focus:ring-0"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Segmented<BinderKind>
            value={form.kind}
            onChange={(value) => patch("kind", value)}
            size="sm"
            options={BINDER_KINDS.map((kind) => ({ value: kind, label: kind }))}
          />
          <input
            type="date"
            value={form.date}
            onChange={(event) => patch("date", event.target.value)}
            className="rounded-lg border border-paper-400 bg-white/70 px-2 py-1 text-[15px]"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="label mb-0">본문</p>
            <button
              type="button"
              onClick={() => setPreview((current) => !current)}
              className={cn("text-[14px]", preview ? "text-accent-600" : "text-ink-400 hover:text-ink-600")}
            >
              {preview ? "편집으로" : "미리보기"}
            </button>
          </div>
          {preview ? (
            <div className="doc-body card-quiet max-h-[42vh] overflow-y-auto px-4 py-3 text-[15.5px] text-ink-700">
              {renderMarkdown(form.body)}
            </div>
          ) : (
            <TextArea
              value={form.body}
              onChange={(event) => patch("body", event.target.value)}
              placeholder={"# 오늘\n\n- 있었던 일\n- 느낀 점\n\n**기억하고 싶은 문장**"}
              className="min-h-[240px] font-[0.9rem] leading-[1.75]"
            />
          )}
          <p className="mt-1 text-[13.5px] text-ink-400">
            Markdown 지원: # 제목 · - 목록 · - [ ] 체크 · **굵게** · &gt; 인용
          </p>
        </div>

        <div>
          <p className="label">사진</p>
          <PhotoEditor photos={form.photos} onChange={(next) => patch("photos", next)} />
        </div>

        <div>
          <p className="label">태그</p>
          <TagInput tags={form.tags} onChange={(tags) => patch("tags", tags)} />
        </div>

        <div className="rounded-xl border border-paper-300/80 bg-paper-50/60 px-3 py-1">
          <Toggle checked={form.favorite} onChange={(value) => patch("favorite", value)} label="즐겨찾기" />
          <Toggle
            checked={form.archiveFlag}
            onChange={(value) => patch("archiveFlag", value)}
            label="아카이브에 표시"
            description="나중에 다시 꺼내 볼 기록"
          />
        </div>

        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
