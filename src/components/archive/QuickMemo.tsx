"use client";

/**
 * A51: 아카이브 하단의 접이식 한 줄 입력 바 (구글 킵의 `메모 작성…`).
 *
 * 평소에는 얇은 한 줄(`메모 작성…` + 체크리스트 + 사진)로 떠 있다가, 누르면 제목·본문·분류가
 * 펼쳐집니다. 바깥을 누르거나 닫기를 누르면 **자동으로 저장**하고(빈 내용이면 저장하지 않음)
 * 다시 한 줄로 접힙니다. 사진은 이 바의 아이콘으로 고르거나, 화면에 붙여넣기(Ctrl+V)·
 * 끌어다 놓기로도 붙습니다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useUi } from "@/state/ui";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/date";
import { ARCHIVE_KINDS, type ArchiveKind } from "@/lib/types";
import { CheckIcon, ImageIcon, XIcon } from "@/components/icons";
import { photoSrc } from "@/components/common/PhotoField";
import { useArchiveLook } from "@/state/archive-look";

export interface QuickMemoBarProps {
  kind: "전체" | ArchiveKind;
  onKindChange: (kind: "전체" | ArchiveKind) => void;
  /** 화면(아카이브 영역)에서 끌어다 놓거나 붙여넣은 사진 */
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  /** 사진을 붙이면 바를 펼칩니다 */
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  /** 사진 고르기 — 올리는 중이면 `busy` */
  onPickPhoto: (files: FileList | File[] | null | undefined) => void;
  busy: boolean;
}

export function QuickMemoBar({
  kind,
  onKindChange,
  photos,
  onPhotosChange,
  expanded,
  onExpandedChange,
  onPickPhoto,
  busy,
}: QuickMemoBarProps) {
  const { create } = useData();
  const { notify } = useUi();
  const look = useArchiveLook();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const hasContent = Boolean(title.trim() || body.trim() || photos.length > 0);
  /** 체크리스트를 누르기만 하고 아무것도 적지 않은 경우(`- [ ] `)는 빈 메모로 봅니다. */
  const hasRealContent = Boolean(
    title.trim() || body.replace(/^[-*]\s+\[[ xX]\]\s*$/gm, "").trim() || photos.length > 0,
  );

  const setOver = (over: boolean) => setDragOver(over);

  /** 내용을 아카이브에 담고 바를 비웁니다. 빈 내용이면 아무것도 만들지 않습니다. */
  const save = useCallback(async () => {
    if (busy) {
      notify("사진을 올리는 중입니다. 잠시만 기다려 주세요.", "error");
      return false;
    }
    if (!hasContent) {
      setTitle("");
      setBody("");
      onPhotosChange([]);
      return true;
    }
    if (!hasRealContent) {
      // 체크리스트 틀만 있고 적은 내용이 없으면 저장하지 않고 조용히 접습니다.
      setTitle("");
      setBody("");
      onPhotosChange([]);
      return true;
    }
    setSaving(true);
    const kindToSave: ArchiveKind = kind === "전체" ? "메모" : kind;
    const firstLine = body.trim().split("\n")[0]?.replace(/^[-*]\s*(\[[ xX]\])?\s*/, "").slice(0, 60) ?? "";
    const created = await create("archive", {
      // 제목을 따로 적지 않았으면 본문 첫 줄이 제목이 됩니다.
      title: title.trim() || firstLine || "메모",
      kind: kindToSave,
      date: todayISO(),
      baseDate: todayISO(),
      body: body.trim(),
      ...(photos.length > 0 ? { photos } : {}),
    });
    setSaving(false);
    if (!created) return false;
    setTitle("");
    setBody("");
    onPhotosChange([]);
    return true;
  }, [body, busy, create, hasContent, hasRealContent, kind, notify, onPhotosChange, photos, title]);

  /** 바깥을 누르면 자동 저장하고 접습니다. */
  useEffect(() => {
    if (!expanded) return;
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      void save().then((ok) => {
        if (ok) onExpandedChange(false);
      });
    };
    window.addEventListener("mousedown", onOutside);
    return () => window.removeEventListener("mousedown", onOutside);
  }, [expanded, onExpandedChange, save]);

  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(() => {
      if (!title && !body) titleRef.current?.focus();
      else bodyRef.current?.focus();
    }, 40);
    return () => clearTimeout(timer);
    // 펼칠 때 한 번만 포커스를 옮깁니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const startChecklist = () => {
    onExpandedChange(true);
    setBody((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n- [ ] ` : "- [ ] "));
    setTimeout(() => bodyRef.current?.focus(), 60);
  };

  /** 체크리스트로 쓰는 중이면 Enter 가 다음 항목의 `- [ ] ` 를 이어 줍니다. */
  const onBodyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    const node = event.currentTarget;
    const caret = node.selectionStart ?? 0;
    const before = node.value.slice(0, caret);
    const line = before.slice(before.lastIndexOf("\n") + 1);
    if (!/^[-*]\s+\[[ xX]\]\s?/.test(line)) return;
    if (!line.replace(/^[-*]\s+\[[ xX]\]\s?/, "").trim()) {
      // 빈 체크 항목에서 Enter — 목록을 끝냅니다.
      event.preventDefault();
      const rest = node.value.slice(caret).replace(/^\n?/, "");
      const next = `${before.slice(0, before.length - line.length)}\n${rest}`;
      setBody(next);
      return;
    }
    event.preventDefault();
    const insert = "\n- [ ] ";
    setBody(`${node.value.slice(0, caret)}${insert}${node.value.slice(caret)}`);
    requestAnimationFrame(() => {
      const at = caret + insert.length;
      node.setSelectionRange(at, at);
    });
  };

  return (
    <div
      ref={rootRef}
      data-quick-memo
      data-quick-memo-expanded={expanded ? "true" : "false"}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.files?.length) return;
        event.preventDefault();
        // 바깥(아카이브 영역)의 같은 처리로 또 붙지 않게 여기서 멈춥니다.
        event.stopPropagation();
        setOver(false);
        onExpandedChange(true);
        onPickPhoto(event.dataTransfer.files);
      }}
      className={cn(
        "pointer-events-auto mx-auto w-full max-w-[46rem] overflow-hidden rounded-2xl border bg-[#fbf6ec] shadow-[0_10px_30px_-12px_rgba(90,70,40,0.35),0_2px_6px_rgba(90,70,40,0.10)] backdrop-blur transition",
        dragOver ? "border-ink-700 ring-2 ring-ink-900/20" : "border-[#d8cbb8]",
      )}
    >
      {expanded ? (
        <div className="px-3 pb-2 pt-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <input
                ref={titleRef}
                data-quick-memo-title
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="제목"
                className="w-full border-none bg-transparent px-0 text-[calc(16px*var(--fs))] font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-[#a89a80]"
              />
              <textarea
                ref={bodyRef}
                data-quick-memo-body
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void save().then((ok) => {
                      if (ok) onExpandedChange(false);
                    });
                    return;
                  }
                  onBodyKeyDown(event);
                }}
                placeholder={busy ? "사진 올리는 중…" : "메모 입력…  바깥을 누르면 저장됩니다"}
                rows={Math.min(8, Math.max(3, body.split("\n").length))}
                className="mt-1 w-full resize-none border-none bg-transparent px-0 text-[calc(15px*var(--fs))] leading-relaxed text-ink-800 outline-none placeholder:text-[#a89a80]"
              />
            </div>
            <button
              type="button"
              data-quick-memo-close
              onClick={() => {
                void save().then((ok) => {
                  if (ok) onExpandedChange(false);
                });
              }}
              aria-label="접기 (저장)"
              className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[#a08a6a] transition hover:bg-[#efe4d2] hover:text-ink-800"
            >
              <XIcon size={13} />
            </button>
          </div>

          {photos.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {photos.map((photo, index) => (
                <span key={`${photo}-${index}`} className="relative block h-14 w-14 overflow-hidden rounded-lg border border-[#d8cbb8] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoSrc(photo)} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="사진 빼기"
                    onClick={() => onPhotosChange(photos.filter((_, position) => position !== index))}
                    className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-ink-900/60 text-white"
                  >
                    <XIcon size={9} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {ARCHIVE_KINDS.map((option) => {
              const style = look.styleOf(option);
              const active = (kind === "전체" ? "메모" : kind) === option;
              return (
                <button
                  key={option}
                  type="button"
                  data-quick-memo-kind={option}
                  aria-pressed={active}
                  onClick={() => onKindChange(option)}
                  className={cn(
                    "rounded-full px-2 py-[1px] text-[calc(12.5px*var(--fs))] font-medium transition",
                    style.pill,
                    active ? "ring-1 ring-ink-900/40" : "opacity-70 hover:opacity-100",
                  )}
                >
                  {option}
                </button>
              );
            })}
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                data-quick-memo-photo
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 rounded-full px-2 py-[2px] text-[calc(13px*var(--fs))] text-[#8a7355] transition hover:bg-[#efe4d2] hover:text-ink-800"
                title="사진 첨부 (또는 Ctrl+V)"
              >
                <ImageIcon size={12} /> 사진
              </button>
              <button type="button" data-quick-memo-save onClick={() => void save()} disabled={saving} className="btn-primary btn-xs flex-none">
                {saving ? "담는 중…" : "담기"}
              </button>
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 px-3 py-1.5">
          <button
            type="button"
            data-quick-memo-open="true"
            onClick={() => onExpandedChange(true)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#c1a882]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[calc(14.5px*var(--fs))] text-[#a89a80]">
              {photos.length > 0 ? `사진 ${photos.length}장 · 메모 작성…` : "메모 작성…"}
            </span>
          </button>
          <button
            type="button"
            data-quick-memo-checklist
            onClick={startChecklist}
            className="flex flex-none items-center gap-1 rounded-full px-2 py-[2px] text-[calc(13px*var(--fs))] text-[#8a7355] transition hover:bg-[#efe4d2] hover:text-ink-800"
            title="체크리스트로 시작"
          >
            <CheckIcon size={12} /> 체크리스트
          </button>
          <button
            type="button"
            data-quick-memo-photo
            onClick={() => fileRef.current?.click()}
            className="flex flex-none items-center gap-1 rounded-full px-2 py-[2px] text-[calc(13px*var(--fs))] text-[#8a7355] transition hover:bg-[#efe4d2] hover:text-ink-800"
            title="사진 첨부"
          >
            <ImageIcon size={12} /> 사진
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onExpandedChange(true);
          onPickPhoto(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
