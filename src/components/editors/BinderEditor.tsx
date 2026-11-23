"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { Modal, Segmented, TextInput, Toggle } from "@/components/common/primitives";
import { EditorFooter, ErrorNote, TagInput } from "@/components/editors/shared";
import { RichDocEditor } from "@/components/editors/RichDocEditor";
import { diaryTitle, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { BINDER_KINDS, type BinderEntry, type BinderKind } from "@/lib/types";
import { docEqual, docFromMarkdown, docToMarkdown, emptyDoc, type Doc } from "@/lib/doc";
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
  const { data, create, update, remove, fetchBody, saveBody } = useData();
  const { settings } = useSettings();
  const existing = entryId ? data.binder.find((item) => item.id === entryId) ?? null : null;
  const initial = (): FormState =>
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
        };

  const [form, setForm] = useState<FormState>(initial);
  const [doc, setDoc] = useState<Doc>(() => docFromMarkdown(existing?.body ?? ""));
  const [error, setError] = useState<string | null>(null);
  /** A16: closing the window saves what was written — compare with the opening state. */
  const initialForm = useRef<FormState | null>(null);
  const initialDoc = useRef<Doc | null>(null);
  if (initialForm.current === null) initialForm.current = initial();
  if (initialDoc.current === null) initialDoc.current = docFromMarkdown(existing?.body ?? "");

  const closing = useRef(false);

  /** A45: 저장된 서식 문서를 먼저 읽어 옵니다 — 없으면 `기록 데이터`(마크다운)에서 만듭니다. */
  useEffect(() => {
    if (!entryId) return;
    let alive = true;
    void fetchBody("binder", entryId).then((payload) => {
      if (!alive || !payload?.doc) return;
      const incoming = payload.doc;
      // 본문 글이 속성과 다르면(주간 칸에서 바로 쓴 경우) 속성 쪽을 따릅니다.
      if (docToMarkdown(incoming) !== (existing?.body ?? "").trim() && (existing?.body ?? "").trim()) return;
      setDoc(incoming);
      initialDoc.current = incoming;
    });
    return () => {
      alive = false;
    };
  }, [entryId, fetchBody, existing?.body]);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<boolean> => {
    const title = form.title.trim() || (form.kind === "일기" ? diaryTitle(form.date) : "제목 없는 노트");
    const markdown = docToMarkdown(doc);
    const payload: Record<string, unknown> = {
      title,
      kind: form.kind,
      date: form.date,
      body: markdown,
      tags: form.tags,
      favorite: form.favorite,
      archiveFlag: form.archiveFlag,
      photos: form.photos,
    };
    let id = existing?.id ?? null;
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
      id = created.id;
    }
    // A45: 서식(글자색·형광펜·인용구·강조 박스·체크리스트)은 노션 페이지 블록으로 저장합니다.
    if (id) {
      const ok = await saveBody("binder", id, doc);
      initialDoc.current = doc;
      if (!ok) {
        setError("본문 서식을 저장하지 못했습니다. 글은 저장되었습니다.");
        return true;
      }
    }
    return true;
  };

  /** A16: X · 바깥 클릭 · 뒤로 가기로 닫아도 쓴 내용은 저장합니다(빈 새 기록은 만들지 않음). */
  const closeWithSave = () => {
    if (closing.current) return;
    closing.current = true;
    const changed =
      JSON.stringify(form) !== JSON.stringify(initialForm.current) || !docEqual(doc, initialDoc.current ?? emptyDoc());
    const hasSomething = Boolean(form.title.trim() || docToMarkdown(doc).trim() || form.photos.length);
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
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[calc(18px*var(--fs))] font-medium focus:ring-0"
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
            className="rounded-lg border border-paper-400 bg-white/70 px-2 py-1 text-[calc(15px*var(--fs))]"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="label mb-0">본문</p>
            <span className="text-[calc(13px*var(--fs))] text-ink-400">서식 · 인용 · 강조 · 체크</span>
          </div>
          <RichDocEditor
            doc={doc}
            onChange={setDoc}
            paper={settings.binderPaper}
            minHeight={240}
            placeholder="오늘 있었던 일을 적어 보세요."
          />
        </div>

        <div>
          <p className="label">사진</p>
          <PhotoEditor photos={form.photos} onChange={(next) => patch("photos", next)} />
        </div>

        <div>
          <p className="label">태그</p>
          <TagInput tags={form.tags} onChange={(tags) => patch("tags", tags)} />
        </div>

        <div className={cn("rounded-xl border border-paper-300/80 bg-paper-50/60 px-3 py-1")}>
          <Toggle checked={form.favorite} onChange={(value) => patch("favorite", value)} label="즐겨찾기 (상단 고정)" />
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
