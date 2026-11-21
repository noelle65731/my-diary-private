"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { spansFromMarkdown, wrapSelection } from "@/lib/richtext";
import { RichText } from "@/components/common/rich";

/**
 * A5: '기타' editor. A plain textarea plus a small toolbar keeps a partial link and
 * bold on the selected characters (`안내문` becomes `[안내문](주소)`), and the preview
 * below shows exactly what Notion will receive.
 */
export function MemoEditor({
  value,
  onChange,
  label = "기타",
  placeholder = "짧은 설명이나 메모",
  rows = 3,
  hint = true,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  hint?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("https://");

  const apply = (kind: "bold" | "italic" | "link", url?: string) => {
    const node = ref.current;
    const start = node?.selectionStart ?? value.length;
    const end = node?.selectionEnd ?? value.length;
    const next = wrapSelection(value, start, end, kind, url);
    onChange(next.text);
    requestAnimationFrame(() => {
      const field = ref.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1 pb-1">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => apply("bold")}
          aria-label="굵게"
          title="선택한 글자를 굵게"
          className="rounded border border-paper-300 px-1.5 py-0.5 text-[14px] font-bold text-ink-700 transition hover:border-ink-400 hover:bg-paper-100"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => apply("italic")}
          aria-label="기울임"
          title="선택한 글자를 기울임"
          className="rounded border border-paper-300 px-1.5 py-0.5 text-[14px] italic text-ink-700 transition hover:border-ink-400 hover:bg-paper-100"
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setLinkOpen((open) => !open)}
          aria-label="부분 링크"
          title="선택한 글자에만 링크 걸기"
          className={cn(
            "rounded border px-1.5 py-0.5 text-[14px] transition",
            linkOpen ? "border-accent-400 bg-accent-100 text-accent-700" : "border-paper-300 text-ink-700 hover:border-ink-400 hover:bg-paper-100",
          )}
        >
          링크
        </button>
        <span className="ml-auto text-[13px] text-ink-300">Enter로 줄바꿈</span>
      </div>

      {linkOpen ? (
        <div className="mb-1 flex items-center gap-1">
          <input
            value={href}
            onChange={(event) => setHref(event.target.value)}
            aria-label="링크 주소"
            placeholder="https://"
            className="input h-8 flex-1 py-1 text-[15px]"
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              apply("link", href.trim() || "https://");
              setLinkOpen(false);
            }}
            className="btn-primary btn-xs"
          >
            넣기
          </button>
        </div>
      ) : null}

      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? `${label} 입력`}
        className="input min-h-[64px] resize-y leading-relaxed"
      />

      {value.trim() ? (
        <div
          aria-label={`${label} 미리보기`}
          className="mt-1 rounded-lg bg-paper-50 px-2 py-1 text-[15px] leading-relaxed text-ink-700"
        >
          <RichText spans={spansFromMarkdown(value)} />
        </div>
      ) : null}

      {hint ? (
        <p className="mt-1 text-[13.5px] text-ink-400">
          글자를 골라 <span className="font-semibold">B</span>·링크를 누르면 그 부분만 서식이 들어갑니다. 줄바꿈도 그대로 저장됩니다.
        </p>
      ) : null}
    </div>
  );
}

/** The same editor, read-first: a click opens it in place (A4). */
export function InlineMemo({
  label,
  value,
  onChange,
  active,
  onActivate,
  onDone,
  placeholder,
  invalid,
  required,
  rows = 3,
  showLabel = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  active: boolean;
  onActivate: () => void;
  onDone: () => void;
  placeholder?: string;
  invalid?: boolean;
  required?: boolean;
  rows?: number;
  /** The detail section already prints the heading, so the caption can be skipped. */
  showLabel?: boolean;
}) {
  if (active) {
    return (
      <div>
        {showLabel ? <p className="mb-0.5 text-[13.5px] text-ink-400">{label}</p> : null}
        <MemoEditor value={value} onChange={onChange} label={label} rows={rows} />
        <div className="mt-1 flex justify-end">
          <button type="button" onClick={onDone} aria-label={`${label} 입력 마침`} className="btn-outline btn-xs">
            입력 마침
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showLabel ? (
        <p className="text-[13.5px] text-ink-400">
          {label}
          {required ? <span className={cn("ml-0.5 text-rose-400", invalid && "font-bold text-rose-500")}>*</span> : null}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onActivate}
        aria-label={`${label} 수정`}
        className={cn(
          "mt-0.5 w-full rounded-lg border-b border-dashed border-paper-300 px-1 py-1.5 text-left text-[15.5px] leading-relaxed text-ink-700 transition hover:border-ink-400 hover:bg-paper-100/60",
          !value.trim() && "text-[15px] text-ink-300",
        )}
      >
        {value.trim() ? <RichText spans={spansFromMarkdown(value)} /> : placeholder ?? "눌러서 쓰기"}
      </button>
    </div>
  );
}
