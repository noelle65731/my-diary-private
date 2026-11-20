"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { PlusIcon } from "@/components/icons";
import { FOLDER_EMOJIS, type ArchiveFolder } from "@/lib/folders";

/** A9: '+ 폴더' — a name and an emoji, available next to the types and in the new-record form. */
export function FolderChips({
  folders,
  selected,
  onSelect,
  onCreate,
  compact = false,
}: {
  folders: ArchiveFolder[];
  selected?: string | null;
  onSelect?: (name: string | null) => void;
  onCreate: (name: string, emoji: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");

  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), emoji);
    setName("");
    setEmoji("📁");
    setOpen(false);
  };

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-1.5", compact && "text-[0.7rem]")}>
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            onClick={() => onSelect?.(selected === folder.name ? null : folder.name)}
            aria-pressed={selected === folder.name}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] transition",
              selected === folder.name ? "bg-ink-900 text-white" : "bg-paper-200/80 text-ink-600 hover:bg-paper-300/60",
            )}
          >
            <span>{folder.emoji}</span>
            {folder.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-paper-400 px-2.5 py-1 text-[0.72rem] text-ink-400 transition hover:border-ink-300 hover:text-ink-700"
        >
          <PlusIcon size={11} /> 폴더
        </button>
      </div>

      {open ? (
        <Modal open onClose={() => setOpen(false)} title="폴더 추가" subtitle="이 기기에만 저장됩니다" size="sm">
          <label className="block">
            <span className="label">이름</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="예: 여행 기록"
              className="input"
            />
          </label>
          <div className="mt-3">
            <span className="label">이모지</span>
            <div className="flex flex-wrap gap-1">
              {FOLDER_EMOJIS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setEmoji(item)}
                  aria-pressed={emoji === item}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-[1rem] transition",
                    emoji === item ? "bg-ink-900" : "bg-paper-200/70 hover:bg-paper-300/70",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-outline btn-sm">
              취소
            </button>
            <button type="button" onClick={submit} disabled={!name.trim()} className="btn-primary btn-sm">
              폴더 만들기
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/** A9: photos attach as URLs, show as thumbnails and open in a new tab. */
export function PhotoGallery({ photos, className }: { photos: string[]; className?: string }) {
  if (photos.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {photos.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="group relative block h-20 w-20 overflow-hidden rounded-lg border border-paper-300 bg-paper-100"
          title={url}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute inset-x-0 bottom-0 hidden bg-ink-900/60 px-1 py-0.5 text-center text-[0.55rem] text-white group-hover:block">
            열기
          </span>
        </a>
      ))}
    </div>
  );
}

export function PhotoEditor({ photos, onChange }: { photos: string[]; onChange: (next: string[]) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addUrl = () => {
    const clean = url.trim();
    if (!clean) return;
    try {
      new URL(clean);
    } catch {
      setError("주소 형식이 아닙니다. https:// 로 시작하는 사진 주소를 넣어 주세요.");
      return;
    }
    setError(null);
    onChange([...photos, clean]);
    setUrl("");
  };

  const addFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_500_000) {
      setError("1.5MB 이하 사진만 이 방식으로 넣을 수 있습니다. 큰 사진은 주소를 붙여 주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChange([...photos, reader.result]);
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addUrl();
            }
          }}
          placeholder="사진 주소 (https://…)"
          aria-label="사진 주소"
          className="input h-8 min-w-[10rem] flex-1 py-1 text-[0.78rem]"
        />
        <button type="button" onClick={addUrl} className="btn-outline btn-xs">
          주소 추가
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-outline btn-xs">
          파일 선택
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => addFile(event.target.files?.[0])} />
      </div>
      {error ? <p className="text-[0.68rem] text-rose-500">{error}</p> : null}
      <p className="text-[0.64rem] text-ink-400">파일 선택은 이 화면의 미리보기용입니다. Notion에는 https:// 로 시작하는 사진 주소만 저장됩니다.</p>
      <PhotoGallery photos={photos} />
      {photos.length > 0 ? (
        <div className="space-y-1">
          {photos.map((photo, index) => (
            <div key={`${photo}-${index}`} className="flex items-center gap-1.5 text-[0.68rem] text-ink-400">
              <span className="min-w-0 flex-1 truncate">{photo.startsWith("data:") ? "첨부한 사진" : photo}</span>
              <button type="button" onClick={() => onChange(photos.filter((_, i) => i !== index))} className="text-rose-400 hover:text-rose-600">
                지우기
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
