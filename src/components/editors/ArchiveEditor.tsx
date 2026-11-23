"use client";

import { useRef, useState, useEffect } from "react";
import { useData } from "@/state/store";
import { Modal, StarRating, TextInput, Toggle } from "@/components/common/primitives";
import { EditorFooter, ErrorNote, TagInput } from "@/components/editors/shared";
import { RichDocEditor } from "@/components/editors/RichDocEditor";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ARCHIVE_KINDS, type ArchiveEntry, type ArchiveKind } from "@/lib/types";
import { FolderChips, PhotoEditor } from "@/components/common/PhotoField";
import { useArchiveFolders } from "@/lib/folders";
import { docEqual, docFromMarkdown, docToMarkdown, emptyDoc, type Doc } from "@/lib/doc";

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
  favorite: boolean;
  photos: string[];
  endDate: string;
  endTime: string;
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
  const { data, create, update, remove, fetchBody, saveBody } = useData();
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
          favorite: existing.favorite,
          photos: existing.photos ?? [],
          endDate: existing.endDate ?? "",
          endTime: existing.endTime ?? "",
        }
      : {
          title: "",
          kind: draft?.kind ?? "메모",
          date: draft?.date ?? todayISO(),
          rating: null,
          link: "",
          tags: [],
          favorite: false,
          photos: [],
          endDate: "",
          endTime: "",
        },
  );
  /** A45: 본문 서식 문서 — 저장된 블록이 있으면 그것을, 없으면 `기록 데이터` 에서 만듭니다. */
  const [doc, setDoc] = useState<Doc>(() => docFromMarkdown(existing?.body ?? ""));
  const initialDoc = useRef<Doc>(docFromMarkdown(existing?.body ?? ""));
  const [error, setError] = useState<string | null>(null);
  /** A16: closing the window saves what was written — compare with the opening state. */
  const initialForm = useRef<FormState | null>(null);
  if (initialForm.current === null) {
    initialForm.current = existing
      ? {
          title: existing.title,
          kind: existing.kind,
          date: existing.date ?? todayISO(),
          rating: existing.rating ?? null,
          link: existing.link,
          tags: existing.tags,
          favorite: existing.favorite,
          photos: existing.photos ?? [],
          endDate: existing.endDate ?? "",
          endTime: existing.endTime ?? "",
        }
      : {
          title: "",
          kind: draft?.kind ?? "메모",
          date: draft?.date ?? todayISO(),
          rating: null,
          link: "",
          tags: [],
          favorite: false,
          photos: [],
          endDate: "",
          endTime: "",
        };
  }
  const closing = useRef(false);  const [showEnd, setShowEnd] = useState(Boolean(existing?.endDate || existing?.endTime));
  const [folder, setFolder] = useState<string | null>(null);
  const { folders, add: addFolder } = useArchiveFolders();

  /** A45: 저장된 서식 문서가 있으면 그것을 씁니다(없으면 `기록 데이터` 마크다운). */
  useEffect(() => {
    if (!archiveId) return;
    let alive = true;
    void fetchBody("archive", archiveId).then((payload) => {
      if (!alive || !payload?.doc) return;
      if ((existing?.body ?? "").trim() && docToMarkdown(payload.doc) !== (existing?.body ?? "").trim()) return;
      setDoc(payload.doc);
      initialDoc.current = payload.doc;
    });
    return () => {
      alive = false;
    };
  }, [archiveId, fetchBody, existing?.body]);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<boolean> => {
    if (!form.title.trim()) {
      setError("제목을 입력해 주세요.");
      return false;
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      kind: form.kind,
      date: form.date,
      baseDate: form.date,
      rating: form.rating,
      link: form.link,
      body: docToMarkdown(doc).replace(/\r\n/g, "\n"),
      favorite: form.favorite,
      photos: form.photos,
      endDate: showEnd ? form.endDate || null : null,
      endTime: showEnd ? form.endTime || null : null,
      tags: folder && !form.tags.includes(folder) ? [...form.tags, folder] : form.tags,
    };
    let id = existing?.id ?? null;
    if (existing) {
      const ok = await update("archive", existing.id, payload);
      if (!ok) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
    } else {
      const created = await create("archive", payload);
      if (!created) {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
      id = created.id;
    }
    if (id) {
      const ok = await saveBody("archive", id, doc);
      initialDoc.current = doc;
      if (!ok) {
        setError("메모 서식을 저장하지 못했습니다. 글은 저장되었습니다.");
        return true;
      }
    }
    return true;
  };

  /** A16: X · 바깥 클릭 · 뒤로 가기로 닫아도 고친 내용은 저장합니다. */
  const closeWithSave = () => {
    if (closing.current) return;
    closing.current = true;
    const changed = JSON.stringify(form) !== JSON.stringify(initialForm.current) || !docEqual(doc, initialDoc.current);
    void (async () => {
      try {
        if (changed && form.title.trim()) await save();
      } finally {
        onClose();
      }
    })();
  };

  return (
    <Modal
      open
      onClose={closeWithSave}
      title={existing ? "아카이브 수정" : "아카이브에 담기"}
      size="md"
      footer={
        <EditorFooter
          onClose={closeWithSave}
          onSave={() => void save().then((ok) => ok && onClose())}
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
          className="border-0 border-b border-paper-300 bg-transparent px-0 text-[calc(18px*var(--fs))] font-medium focus:ring-0"
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

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[calc(14px*var(--fs))] text-ink-400">폴더</span>
          <FolderChips folders={folders} selected={folder} onSelect={setFolder} onCreate={(name, emoji) => addFolder(name, emoji)} compact />
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

        <div className="rounded-xl border border-paper-300/70 bg-paper-50/50 px-3 py-2">
          <Toggle
            checked={showEnd}
            onChange={setShowEnd}
            label="종료일·시간 선택"
            description="여러 날에 걸친 기록이면 종료일을 켜 주세요"
          />
          {showEnd ? (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">종료일</span>
                <input type="date" value={form.endDate} min={form.date} onChange={(event) => patch("endDate", event.target.value)} className="input" />
              </label>
              <label className="block">
                <span className="label">종료 시간</span>
                <input type="time" value={form.endTime} onChange={(event) => patch("endTime", event.target.value)} className="input" />
              </label>
            </div>
          ) : null}
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
            <span className="text-[calc(13px*var(--fs))] text-ink-400">서식 · 인용 · 강조 · 체크</span>
          </div>
          <RichDocEditor
            doc={doc}
            onChange={setDoc}
            paper="plain"
            minHeight={140}
            compact
            placeholder="인상 깊었던 점, 다시 볼 이유"
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

        <Toggle checked={form.favorite} onChange={(value) => patch("favorite", value)} label="즐겨찾기 (☆)" />

        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
