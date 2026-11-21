"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/common/primitives";
import { useData } from "@/state/store";
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

/**
 * A10: a freshly uploaded photo is held as `upload:<file_upload id>` until Notion answers
 * with its own URL, so the picture is shown from this in-memory copy in the meantime.
 */
const sessionPreviews = new Map<string, string>();

export function photoSrc(value: string): string {
  if (value.startsWith("upload:")) return sessionPreviews.get(value) ?? "";
  return value;
}

/** A9: photos open in a new tab; an upload that has no URL yet shows its local copy. */
export function PhotoGallery({ photos, className }: { photos: string[]; className?: string }) {
  if (photos.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {photos.map((value, index) => {
        const src = photoSrc(value);
        const linkable = /^https?:\/\//i.test(value);
        const inner = src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-paper-200 text-[0.6rem] text-ink-400">사진</span>
        );
        return linkable ? (
          <a
            key={`${value}-${index}`}
            href={value}
            target="_blank"
            rel="noreferrer"
            className="group relative block h-20 w-20 overflow-hidden rounded-lg border border-paper-300 bg-paper-100"
            title={value}
          >
            {inner}
            <span className="absolute inset-x-0 bottom-0 hidden bg-ink-900/60 px-1 py-0.5 text-center text-[0.55rem] text-white group-hover:block">
              열기
            </span>
          </a>
        ) : (
          <span
            key={`${value}-${index}`}
            className="block h-20 w-20 overflow-hidden rounded-lg border border-paper-300 bg-paper-100"
            title="저장 중인 사진"
          >
            {inner}
          </span>
        );
      })}
    </div>
  );
}

/** Downscales a phone photo in the browser so only a small JPEG reaches Notion (5MB limit). */
async function compressPhoto(file: File): Promise<{ blob: Blob; preview: string; name: string } | null> {
  const name = `${(file.name || "photo").replace(/\.[^.]+$/, "").slice(0, 60)}.jpg`;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1600 / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 4_500_000) {
        return { blob, preview: canvas.toDataURL("image/jpeg", 0.6), name };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function PhotoEditor({ photos, onChange }: { photos: string[]; onChange: (next: string[]) => void }) {
  const { demo } = useData();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const addFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("사진 파일(jpg · png · heic)을 골라 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const packed = await compressPhoto(file);
      if (!packed) {
        setError("사진을 줄이지 못했습니다. 다른 사진으로 시도하거나 주소를 붙여 주세요.");
        return;
      }
      const preview = packed.preview;
      if (demo) {
        // 미리보기 모드: Notion이 연결되지 않아 이 브라우저 안에만 남습니다.
        onChange([...photos, preview]);
        setError("미리보기 모드입니다. Notion을 연결하면 이 사진이 기록에 함께 저장됩니다.");
        return;
      }
      const form = new FormData();
      form.append("file", new File([packed.blob], packed.name, { type: "image/jpeg" }), packed.name);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; data?: { token?: string }; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.ok || !payload.data?.token) {
        setError(payload?.error?.message ?? "사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      sessionPreviews.set(payload.data.token, preview);
      onChange([...photos, payload.data.token]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-outline btn-xs">
          {busy ? "올리는 중…" : "사진 올리기"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void addFile(event.target.files?.[0])}
        />
      </div>
      {error ? <p className={cn("text-[0.68rem]", error.startsWith("미리보기") ? "text-ink-400" : "text-rose-500")}>{error}</p> : null}
      <p className="text-[0.64rem] text-ink-400">
        고른 사진은 화면에서 1600px·JPEG로 줄여 Notion에 업로드되고, 그 기록의 사진으로 남습니다. 다시 열어도 같은 사진이 보입니다.
      </p>
      <PhotoGallery photos={photos} />
      {photos.length > 0 ? (
        <div className="space-y-1">
          {photos.map((photo, index) => (
            <div key={`${photo}-${index}`} className="flex items-center gap-1.5 text-[0.68rem] text-ink-400">
              <span className="min-w-0 flex-1 truncate">
                {photo.startsWith("upload:")
                  ? "방금 올린 사진 (Notion에 저장됨)"
                  : photo.startsWith("data:")
                    ? "첨부한 사진"
                    : photo}
              </span>
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, i) => i !== index))}
                className="text-rose-400 hover:text-rose-600"
              >
                지우기
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
