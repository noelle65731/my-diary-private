"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { projectEmoji } from "@/components/common/tone";
import { compressPhoto, photoSrc, rememberUpload } from "@/components/common/PhotoField";
import type { ItemIcon, TaskCategory } from "@/lib/types";
import { useData } from "@/state/store";

/** Hand-picked, tidy emoji set — the user can also type any emoji or paste an image. */
export const ICON_PALETTE = [
  "📁", "🗂️", "💼", "📊", "✏️", "📚", "🧠", "💡",
  "🎯", "🚀", "🧩", "🛠️", "🏃", "🧘", "🎨", "🎧",
  "🍳", "🌱", "💰", "🩺", "✈️", "🎬", "🕹️", "🌙",
];

/** The project's own icon when it has one, otherwise the stable auto glyph. */
export function ProjectIcon({
  icon,
  seed,
  category,
  className,
  textClassName,
}: {
  icon?: ItemIcon | null;
  seed: string;
  category: TaskCategory;
  className?: string;
  textClassName?: string;
}) {
  if (icon?.kind === "image") {
    const src = photoSrc(icon.value);
    return (
      <span className={cn("relative block overflow-hidden rounded-[inherit]", className)}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className={cn("flex h-full w-full items-center justify-center", textClassName)}>
            {projectEmoji(seed, category)}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className={cn("flex items-center justify-center", className, textClassName)}>
      {icon?.kind === "emoji" && icon.value ? icon.value : projectEmoji(seed, category)}
    </span>
  );
}

/**
 * A14: the icon cell of a project — emoji, typed emoji, image URL or an uploaded picture.
 * The value is saved on the Notion page itself (`icon`), so other devices see it too.
 */
export function ProjectIconPicker({
  value,
  onChange,
  seed,
  category,
}: {
  value: ItemIcon | null;
  onChange: (next: ItemIcon | null) => void;
  seed: string;
  category: TaskCategory;
}) {
  const { demo } = useData();
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState(value?.kind === "emoji" ? value.value : "");
  const [url, setUrl] = useState(value?.kind === "image" && /^https?:/i.test(value.value) ? value.value : "");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEmoji(value?.kind === "emoji" ? value.value : "");
    setUrl(value?.kind === "image" && /^https?:/i.test(value.value) ? value.value : "");
  }, [value]);

  const applyEmoji = (next: string) => {
    const clean = next.trim().slice(0, 8);
    if (!clean) return;
    setEmoji(clean);
    onChange({ kind: "emoji", value: clean });
    setNote(null);
  };

  const applyUrl = () => {
    const clean = url.trim();
    if (!clean) return;
    try {
      new URL(clean);
    } catch {
      setNote("주소 형식이 아닙니다. https:// 로 시작하는 이미지 주소를 넣어 주세요.");
      return;
    }
    setNote(null);
    onChange({ kind: "image", value: clean });
  };

  const applyFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNote("이미지 파일(jpg · png)을 골라 주세요.");
      return;
    }
    setNote(null);
    setBusy(true);
    try {
      const packed = await compressPhoto(file);
      if (!packed) {
        setNote("이미지를 줄이지 못했습니다. 다른 파일로 시도해 주세요.");
        return;
      }
      if (demo) {
        onChange({ kind: "image", value: packed.preview });
        setNote("미리보기 모드입니다. Notion을 연결하면 페이지 아이콘으로 저장됩니다.");
        return;
      }
      const form = new FormData();
      form.append("file", new File([packed.blob], packed.name, { type: "image/jpeg" }), packed.name);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; data?: { token?: string }; error?: { message?: string } }
        | null;
      const token = payload?.data?.token;
      if (!response.ok || !payload?.ok || !token) {
        setNote(payload?.error?.message ?? "이미지를 저장하지 못했습니다.");
        return;
      }
      rememberUpload(token, packed.preview);
      onChange({ kind: "image", value: token });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label="프로젝트 아이콘 바꾸기"
          aria-expanded={open}
          className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-xl border border-paper-300 bg-white text-[calc(26px*var(--fs))] leading-none transition hover:border-ink-400"
        >
          <ProjectIcon icon={value} seed={seed} category={category} className="h-full w-full" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[calc(14px*var(--fs))] font-medium text-ink-800">아이콘</p>
          <p className="text-[calc(13px*var(--fs))] text-ink-500">이모지·그림을 눌러 바꾸거나 지울 수 있어요.</p>
        </div>
        <button type="button" onClick={() => setOpen((current) => !current)} className="btn-outline btn-xs flex-none">
          {open ? "닫기" : "바꾸기"}
        </button>
      </div>

      {open ? (
        <div className="mt-2 space-y-2 rounded-xl border border-paper-300 bg-white p-2.5">
          <div>
            <p className="mb-1 text-[calc(13px*var(--fs))] text-ink-500">이모지</p>
            <div className="grid grid-cols-8 gap-1">
              {ICON_PALETTE.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => applyEmoji(item)}
                  className="flex h-8 items-center justify-center rounded-lg border border-transparent text-[calc(19px*var(--fs))] leading-none transition hover:border-paper-400 hover:bg-paper-200"
                  aria-label={`이모지 ${item}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyEmoji(emoji);
                }
              }}
              placeholder="직접 입력 (예: 🌿)"
              aria-label="이모지 직접 입력"
              className="input h-8 w-[7.5rem] py-0 text-[calc(14px*var(--fs))]"
            />
            <button type="button" onClick={() => applyEmoji(emoji)} className="btn-outline btn-xs">
              적용
            </button>
            <button type="button" onClick={() => onChange(null)} className="btn-ghost btn-xs text-ink-500">
              기본으로
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyUrl();
                }
              }}
              placeholder="이미지 주소 https://…"
              aria-label="아이콘 이미지 주소"
              className="input h-8 min-w-0 flex-1 py-0 text-[calc(14px*var(--fs))]"
            />
            <button type="button" onClick={applyUrl} className="btn-outline btn-xs flex-none">
              이미지 넣기
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void applyFile(event.target.files?.[0])}
            />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-outline btn-xs">
              {busy ? "올리는 중…" : "파일 올리기"}
            </button>
            <span className="text-[calc(12.5px*var(--fs))] text-ink-500">정사각형으로 잘려 칸을 채웁니다.</span>
          </div>

          {note ? <p className="text-[calc(13px*var(--fs))] text-ink-600">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
