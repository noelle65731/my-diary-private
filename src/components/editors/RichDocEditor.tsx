"use client";

/**
 * A45: 서식 있는 본문 편집기 — 일기·노트·아카이브가 함께 씁니다.
 *
 * 블록(문단·인용구·강조 박스·체크리스트)마다 contenteditable 한 칸을 두고, 툴바는 그 칸의
 * 선택 영역에 노션과 같은 서식(굵게·밑줄·취소선·글자색·파스텔 형광펜)을 겁니다. 화면의
 * HTML 은 `doc.ts` 의 스팬으로, 다시 노션 블록으로 저장됩니다. PC·모바일 모두 같은 조작입니다.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { paperBackground, type PaperStyle } from "@/lib/paper";
import {
  HIGHLIGHT_COLORS,
  MOOD_STAMPS,
  TEXT_COLORS,
  TONE_COLORS,
  WEATHER_STAMPS,
  blockText,
  colorNameOf,
  cloneDoc,
  highlightHex,
  newBlockId,
  normalizeDoc,
  normalizeSpans,
  textColorHex,
  toneHex,
  type Doc,
  type DocBlock,
  type DocBlockType,
  type DocColor,
  type DocSpan,
} from "@/lib/doc";

/* ─────────────────────────── HTML ↔ 스팬 ─────────────────────────── */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

export function spansToHtml(spans: DocSpan[]): string {
  return normalizeSpans(spans)
    .map((span) => {
      let html = escapeHtml(span.text).replace(/\n/g, "<br>");
      if (span.href) html = `<a href="${escapeAttr(span.href)}">${html}</a>`;
      const styles: string[] = [];
      const color = textColorHex(span.color);
      if (color) styles.push(`color:${color}`);
      const background = highlightHex(span.background);
      if (background) styles.push(`background-color:${background}`);
      if (styles.length > 0) html = `<span style="${styles.join(";")}">${html}</span>`;
      if (span.strike) html = `<s>${html}</s>`;
      if (span.underline) html = `<u>${html}</u>`;
      if (span.italic) html = `<em>${html}</em>`;
      if (span.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join("");
}

export function spansFromHtml(node: HTMLElement | null): DocSpan[] {
  if (!node) return [];
  const out: DocSpan[] = [];
  const walk = (current: Node, inherited: DocSpan) => {
    if (current.nodeType === 3) {
      const text = (current.nodeValue ?? "").replace(/\u00a0/g, " ");
      if (text) out.push({ ...inherited, text });
      return;
    }
    if (current.nodeType !== 1) return;
    const el = current as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      out.push({ ...inherited, text: "\n" });
      return;
    }
    const next: DocSpan = { ...inherited };
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italic = true;
    if (tag === "u" || tag === "ins") next.underline = true;
    if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
    if (tag === "a") {
      const href = el.getAttribute("href");
      if (href) next.href = href;
    }
    if (tag === "font") {
      const name = colorNameOf(el.getAttribute("color"), TEXT_COLORS);
      if (name && name !== "default") next.color = name;
    }
    const style = el.style;
    if (style && (style.color || style.backgroundColor || style.textDecoration || style.fontWeight || style.fontStyle)) {
      const color = colorNameOf(style.color, TEXT_COLORS);
      if (color && color !== "default") next.color = color;
      const background = colorNameOf(style.backgroundColor, HIGHLIGHT_COLORS);
      if (background && background !== "default") next.background = background;
      const decoration = style.textDecoration || style.textDecorationLine || "";
      if (decoration.includes("underline")) next.underline = true;
      if (decoration.includes("line-through")) next.strike = true;
      const weight = style.fontWeight;
      if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) next.bold = true;
      if (style.fontStyle === "italic") next.italic = true;
    }
    const isBlockChild = tag === "div" || tag === "p";
    if (isBlockChild && out.length > 0) out.push({ ...inherited, text: "\n" });
    el.childNodes.forEach((child) => walk(child, next));
  };
  const root: DocSpan = { text: "" };
  node.childNodes.forEach((child) => walk(child, root));
  return normalizeSpans(out.filter((span) => span.text.length > 0));
}

/** 캐럿 앞 글자 수 — Enter 로 블록을 나눌 때 그 자리에서 나누기 위해. */
function caretOffset(node: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return blockText({ id: "", type: "paragraph", spans: spansFromHtml(node) }).length;
  const range = selection.getRangeAt(0).cloneRange();
  const before = range.cloneRange();
  before.selectNodeContents(node);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().replace(/\u00a0/g, " ").length;
}

function placeCaret(node: HTMLElement | null, offset: number | null) {
  if (!node) return;
  node.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  if (offset === null) {
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let placed = false;
  let textNode = walker.nextNode();
  while (textNode) {
    const length = textNode.nodeValue?.length ?? 0;
    if (remaining <= length) {
      range.setStart(textNode, remaining);
      range.collapse(true);
      placed = true;
      break;
    }
    remaining -= length;
    textNode = walker.nextNode();
  }
  if (!placed) {
    range.selectNodeContents(node);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function splitSpans(spans: DocSpan[], offset: number): { head: DocSpan[]; tail: DocSpan[] } {
  const head: DocSpan[] = [];
  const tail: DocSpan[] = [];
  let index = 0;
  for (const span of spans) {
    const length = span.text.length;
    if (index + length <= offset) {
      head.push({ ...span });
    } else if (index >= offset) {
      tail.push({ ...span });
    } else {
      const cut = offset - index;
      head.push({ ...span, text: span.text.slice(0, cut) });
      tail.push({ ...span, text: span.text.slice(cut) });
    }
    index += length;
  }
  return { head: normalizeSpans(head), tail: normalizeSpans(tail) };
}

/* ─────────────────────────── 편집기 ─────────────────────────── */

const CALLOUT_EMOJIS = ["💡", "📌", "⭐", "✅", "🎵", "☕"];

export function RichDocEditor({
  doc,
  onChange,
  paper = "ruled",
  placeholder = "오늘 있었던 일을 적어 보세요.",
  minHeight = 260,
  className,
  compact = false,
}: {
  doc: Doc;
  onChange: (next: Doc) => void;
  paper?: PaperStyle;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  compact?: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(doc.blocks[0]?.id ?? null);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const nodes = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const pendingCaret = useRef<{ id: string; offset: number | null } | null>(null);

  const blockOfId = (id: string | null) => doc.blocks.find((block) => block.id === id) ?? null;
  const activeBlock = blockOfId(activeId) ?? doc.blocks[0] ?? null;

  const commit = useCallback(
    (next: Doc) => {
      onChange(normalizeDoc(next));
    },
    [onChange],
  );

  const patchBlock = (id: string, patch: Partial<DocBlock>) => {
    commit({ ...doc, blocks: doc.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)) });
  };

  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (!pending) return;
    const node = nodes.current.get(pending.id);
    if (!node) return;
    pendingCaret.current = null;
    placeCaret(node, pending.offset);
  });

  /** 툴바가 선택 영역을 잃지 않도록 누르는 순간 포커스를 뺏지 않습니다. */
  const keepSelection = (event: React.MouseEvent) => event.preventDefault();

  const command = (name: string, value?: string) => {
    setSelectionBusy(true);
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(name, false, value);
    } finally {
      setSelectionBusy(false);
    }
    if (activeId) {
      const node = nodes.current.get(activeId);
      patchBlock(activeId, { spans: spansFromHtml(node ?? null) });
      node?.focus({ preventScroll: true });
    }
  };

  const applyTextColor = (name: DocColor) => {
    command("foreColor", textColorHex(name) ?? TEXT_COLORS[0]!.hex);
  };
  const applyHighlight = (name: DocColor) => {
    const hex = highlightHex(name);
    command("hiliteColor", hex ?? "#fbeea5");
  };
  const clearColor = () => {
    command("foreColor", "#111827");
  };

  const setBlockType = (type: DocBlockType) => {
    if (!activeBlock) return;
    const block = activeBlock;
    const next: DocBlock = {
      ...block,
      type,
      ...(type === "callout" ? { emoji: block.emoji ?? "💡", tone: block.tone ?? ("yellow" as DocColor) } : {}),
      ...(type === "quote" ? { tone: block.tone ?? ("gray" as DocColor) } : {}),
      ...(type === "todo" ? { checked: block.checked ?? false } : {}),
    };
    patchBlock(block.id, next);
    setActiveId(block.id);
  };

  const addBlockAfter = (id: string, tail: DocSpan[] = []) => {
    const index = doc.blocks.findIndex((block) => block.id === id);
    const source = doc.blocks[index];
    const next: DocBlock = {
      id: newBlockId(),
      type: "paragraph",
      spans: tail,
      // 체크리스트 안에서 Enter 를 누르면 다음 줄도 체크리스트로 이어집니다.
      ...(source?.type === "todo" ? { type: "todo" as DocBlockType, checked: false } : {}),
      ...(source?.type === "bullet" ? { type: "bullet" as DocBlockType } : {}),
    };
    const blocks = [...doc.blocks];
    blocks.splice(index + 1, 0, next);
    pendingCaret.current = { id: next.id, offset: 0 };
    setActiveId(next.id);
    commit({ ...doc, blocks });
  };

  const removeBlock = (id: string) => {
    if (doc.blocks.length <= 1) return;
    const index = doc.blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const previous = doc.blocks[index - 1] ?? doc.blocks[index + 1] ?? null;
    const blocks = doc.blocks.filter((block) => block.id !== id);
    if (previous) pendingCaret.current = { id: previous.id, offset: null };
    setActiveId(previous?.id ?? null);
    commit({ ...doc, blocks });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, block: DocBlock) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const node = nodes.current.get(block.id);
      const offset = node ? caretOffset(node) : blockText(block).length;
      const { head, tail } = splitSpans(block.spans, offset);
      if (tail.length > 0) {
        const index = doc.blocks.findIndex((item) => item.id === block.id);
        const next: DocBlock = {
          id: newBlockId(),
          type: block.type === "todo" ? "todo" : block.type === "bullet" ? "bullet" : "paragraph",
          spans: tail,
          ...(block.type === "todo" ? { checked: false } : {}),
        };
        const blocks = [...doc.blocks];
        blocks.splice(index + 1, 0, next);
        blocks[index] = { ...block, spans: head };
        pendingCaret.current = { id: next.id, offset: 0 };
        setActiveId(next.id);
        commit({ ...doc, blocks });
      } else {
        addBlockAfter(block.id);
      }
      return;
    }
    // 빈 줄(줄바꿈만 남은 <br> 포함)에서 Backspace — 그 줄을 지웁니다.
    if (event.key === "Backspace" && blockText(block).replace(/\s/g, "") === "" && doc.blocks.length > 1) {
      event.preventDefault();
      removeBlock(block.id);
      return;
    }
    if (event.key === "Tab") event.preventDefault();
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>, block: DocBlock) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    const node = nodes.current.get(block.id);
    const offset = node ? caretOffset(node) : blockText(block).length;
    const { head, tail } = splitSpans(block.spans, offset);
    const insert = text.replace(/\r\n/g, "\n").split("\n");
    const firstLine: DocSpan[] = insert[0] ? [{ text: insert[0] }] : [];
    const rest = insert.slice(1);
    const merged = normalizeSpans([...head, ...firstLine, ...tail]);
    if (rest.length === 0) {
      patchBlock(block.id, { spans: merged });
      new Promise<void>((resolve) => window.setTimeout(resolve, 0)).then(() => placeCaret(nodes.current.get(block.id) ?? null, head.length + (insert[0]?.length ?? 0)));
      return;
    }
    const index = doc.blocks.findIndex((item) => item.id === block.id);
    const extra: DocBlock[] = rest.map((line) => ({ id: newBlockId(), type: "paragraph", spans: line ? [{ text: line }] : [] }));
    const blocks = [...doc.blocks];
    blocks[index] = { ...block, spans: merged };
    blocks.splice(index + 1, 0, ...extra);
    pendingCaret.current = { id: extra[extra.length - 1]!.id, offset: null };
    setActiveId(extra[extra.length - 1]!.id);
    commit({ ...doc, blocks });
  };

  const setStamp = (kind: "weather" | "mood", value: string) => {
    const current = doc.stamp[kind];
    commit({ ...doc, stamp: { ...doc.stamp, [kind]: current === value ? null : value } });
  };

  const paperStyle = paperBackground(paper);
  return (
    <div className={cn("doc-editor", className)} data-doc-editor data-paper={paper}>
      {/* 스탬프 — 한 번 탭으로 기분·날씨를 찍습니다. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1" data-doc-stamp>
        <div className="flex items-center gap-1">
          <span className="text-[calc(13px*var(--fs))] text-ink-400">날씨</span>
          {WEATHER_STAMPS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              data-stamp-weather={emoji}
              aria-pressed={doc.stamp.weather === emoji}
              aria-label={`날씨 ${emoji}`}
              data-tip={`날씨 ${emoji}`}
              onClick={() => setStamp("weather", emoji)}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[calc(14px*var(--fs))] transition",
                doc.stamp.weather === emoji ? "bg-ink-900/90 ring-1 ring-ink-900" : "bg-paper-200/70 hover:bg-paper-300",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[calc(13px*var(--fs))] text-ink-400">기분</span>
          {MOOD_STAMPS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              data-stamp-mood={emoji}
              aria-pressed={doc.stamp.mood === emoji}
              aria-label={`기분 ${emoji}`}
              data-tip={`기분 ${emoji}`}
              onClick={() => setStamp("mood", emoji)}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[calc(14px*var(--fs))] transition",
                doc.stamp.mood === emoji ? "bg-ink-900/90 ring-1 ring-ink-900" : "bg-paper-200/70 hover:bg-paper-300",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* 툴바 */}
      <div
        data-doc-toolbar
        className="sticky top-0 z-10 mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-paper-300 bg-white/95 px-1.5 py-1 backdrop-blur"
      >
        <div className="flex items-center gap-0.5">
          <ToolButton label="굵게" onClick={() => command("bold")} active={false} bold>
            B
          </ToolButton>
          <ToolButton label="밑줄" onClick={() => command("underline")} active={false} underline>
            U
          </ToolButton>
          <ToolButton label="취소선" onClick={() => command("strikeThrough")} active={false} strike>
            S
          </ToolButton>
          <ToolButton label="서식 지우기" onClick={() => command("removeFormat")} active={false}>
            ⌫
          </ToolButton>
        </div>

        <span className="h-4 w-px bg-paper-300" aria-hidden />

        <div className="flex items-center gap-0.5" data-doc-text-colors>
          <span className="mr-0.5 text-[calc(12px*var(--fs))] text-ink-400">글자</span>
          {TEXT_COLORS.map((item) => (
            <button
              key={item.name}
              type="button"
              onMouseDown={keepSelection}
              onClick={() => (item.name === "default" ? clearColor() : applyTextColor(item.name))}
              aria-label={`글자색 ${item.label}`}
              data-tip={`글자색 ${item.label}`}
              data-text-color={item.name}
              title={`글자색 ${item.label}`}
              className="h-4 w-4 rounded-full border border-black/10 transition hover:scale-110"
              style={{ backgroundColor: item.name === "default" ? "#ffffff" : item.hex }}
            />
          ))}
        </div>

        <span className="h-4 w-px bg-paper-300" aria-hidden />

        <div className="flex items-center gap-0.5" data-doc-highlights>
          <span className="mr-0.5 text-[calc(12px*var(--fs))] text-ink-400">형광펜</span>
          {HIGHLIGHT_COLORS.map((item) => (
            <button
              key={item.name}
              type="button"
              onMouseDown={keepSelection}
              onClick={() => applyHighlight(item.name)}
              aria-label={`형광펜 ${item.label}`}
              data-tip={`형광펜 ${item.label}`}
              data-highlight={item.name}
              title={`형광펜 ${item.label}`}
              className="h-4 w-4 rounded-[4px] border border-black/10 transition hover:scale-110"
              style={{ backgroundColor: item.hex }}
            />
          ))}
        </div>

        <span className="h-4 w-px bg-paper-300" aria-hidden />

        <div className="flex items-center gap-0.5" data-doc-block-types>
          {(
            [
              { type: "paragraph", label: "본문" },
              { type: "quote", label: "인용" },
              { type: "callout", label: "강조" },
              { type: "todo", label: "체크" },
            ] as { type: DocBlockType; label: string }[]
          ).map((item) => (
            <button
              key={item.type}
              type="button"
              onMouseDown={keepSelection}
              onClick={() => setBlockType(item.type)}
              aria-pressed={activeBlock?.type === item.type}
              data-tip={item.label}
              data-block-type={item.type}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[calc(12.5px*var(--fs))] transition",
                activeBlock?.type === item.type ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-paper-200",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {activeBlock && (activeBlock.type === "callout" || activeBlock.type === "quote") ? (
          <>
            <span className="h-4 w-px bg-paper-300" aria-hidden />
            <div className="flex items-center gap-0.5" data-doc-tones>
              <span className="mr-0.5 text-[calc(12px*var(--fs))] text-ink-400">배경</span>
              {TONE_COLORS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onMouseDown={keepSelection}
                  onClick={() => patchBlock(activeBlock.id, { tone: item.name })}
                  aria-label={`배경 ${item.label}`}
                  data-tip={`배경 ${item.label}`}
                  data-tone={item.name}
                  title={`배경 ${item.label}`}
                  className="h-4 w-4 rounded-full border border-black/10 transition hover:scale-110"
                  style={{ backgroundColor: item.hex }}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* 블록 */}
      <div
        className={cn(
          "rounded-xl border border-paper-300 bg-white px-3 py-2.5 transition",
          compact ? "text-[calc(15px*var(--fs))]" : "text-[calc(16px*var(--fs))]",
        )}
        style={{ ...paperStyle, minHeight }}
        data-doc-blocks
      >
        {doc.blocks.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            active={activeBlock?.id === block.id}
            only={doc.blocks.length === 1}
            placeholder={placeholder}
            busy={selectionBusy}
            register={(node) => {
              nodes.current.set(block.id, node);
            }}
            onFocus={() => setActiveId(block.id)}
            onInput={(spans) => patchBlock(block.id, { spans })}
            onKeyDown={(event) => onKeyDown(event, block)}
            onPaste={(event) => onPaste(event, block)}
            onToggle={() => patchBlock(block.id, { checked: !block.checked })}
            onEmoji={() => {
              const index = CALLOUT_EMOJIS.indexOf(block.emoji ?? "💡");
              patchBlock(block.id, { emoji: CALLOUT_EMOJIS[(index + 1) % CALLOUT_EMOJIS.length]! });
            }}
            onRemove={() => removeBlock(block.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  active,
  children,
  bold,
  underline,
  strike,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  children: React.ReactNode;
  bold?: boolean;
  underline?: boolean;
  strike?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      data-doc-command={label}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md text-[calc(13px*var(--fs))] text-ink-600 transition hover:bg-paper-200",
        active && "bg-ink-900 text-white",
        bold && "font-bold",
        underline && "underline",
        strike && "line-through",
      )}
    >
      {children}
    </button>
  );
}

function BlockRow({
  block,
  active,
  only,
  placeholder,
  busy,
  register,
  onFocus,
  onInput,
  onKeyDown,
  onPaste,
  onToggle,
  onEmoji,
  onRemove,
}: {
  block: DocBlock;
  active: boolean;
  only: boolean;
  placeholder: string;
  busy: boolean;
  register: (node: HTMLDivElement | null) => void;
  onFocus: () => void;
  onInput: (spans: DocSpan[]) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  onToggle: () => void;
  onEmoji: () => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const html = spansToHtml(block.spans);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.innerHTML === html) return;
    // 타이핑 중인 칸의 HTML 은 건드리지 않습니다(커서가 튀지 않게).
    if (document.activeElement === node) return;
    node.innerHTML = html || "";
  });

  if (block.type === "divider") {
    return (
      <div className="group relative my-2 flex items-center gap-2">
        <hr className="my-2 flex-1 border-paper-300" />
        <button
          type="button"
          onClick={onRemove}
          aria-label="구분선 지우기"
          className="text-[calc(12px*var(--fs))] text-ink-300 opacity-0 transition group-hover:opacity-100"
        >
          ×
        </button>
      </div>
    );
  }

  const tone = toneHex(block.tone);

  return (
    <div
      data-doc-block={block.type}
      data-doc-block-active={active ? "true" : undefined}
      data-doc-block-checked={block.type === "todo" ? (block.checked ? "true" : "false") : undefined}
      className={cn(
        "group relative flex items-start gap-1.5 rounded-lg px-1",
        block.type === "quote" && "my-1 border-l-[3px] pl-2.5",
        block.type === "quote" && !tone && "border-paper-400",
        block.type === "callout" && "my-1.5 px-2 py-1.5",
        block.type === "heading" && "mt-2",
        active && "ring-1 ring-paper-300",
      )}
      style={
        block.type === "quote" && tone
          ? { borderColor: tone, backgroundColor: `${tone}55` }
          : block.type === "callout"
            ? { backgroundColor: tone ?? "#f8f2dd" }
            : undefined
      }
    >
      {block.type === "todo" ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={block.checked ? "체크 해제" : "체크"}
          aria-pressed={!!block.checked}
          data-on={block.checked ? "true" : undefined}
          className={cn(
            "chk mt-[0.28em] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[4px] border",
            block.checked ? "border-sage-500 bg-sage-500 text-white" : "border-paper-400 hover:border-ink-500",
          )}
        >
          {block.checked ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
          ) : null}
        </button>
      ) : null}

      {block.type === "callout" ? (
        <button
          type="button"
          onClick={onEmoji}
          aria-label="강조 아이콘 바꾸기"
          className="mt-[0.1em] flex h-6 w-6 flex-none items-center justify-center rounded-md text-[calc(15px*var(--fs))] transition hover:bg-black/5"
        >
          {block.emoji || "💡"}
        </button>
      ) : null}

      {block.type === "bullet" ? <span className="mt-[0.45em] h-1.5 w-1.5 flex-none rounded-full bg-ink-400" /> : null}

      <div
        ref={(node) => {
          ref.current = node;
          register(node);
        }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={block.type === "callout" ? "강조 박스 내용" : block.type === "quote" ? "인용구 내용" : "본문"}
        data-doc-input={block.type}
        data-placeholder={placeholder}
        spellCheck={false}
        onFocus={onFocus}
        onInput={() => onInput(spansFromHtml(ref.current))}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className={cn(
          "min-w-0 flex-1 whitespace-pre-wrap break-words py-[3px] leading-[1.75] outline-none",
          "empty:before:pointer-events-none empty:before:text-ink-300 empty:before:content-[attr(data-placeholder)]",
          block.type === "heading" && "font-semibold",
          block.type === "quote" && "text-ink-700",
          block.type === "todo" && block.checked && "text-ink-400 line-through",
        )}
      />

      <button
        type="button"
        onClick={onRemove}
        aria-label="이 줄 지우기"
        tabIndex={-1}
        className={cn(
          "mt-[0.2em] flex-none text-[calc(13px*var(--fs))] text-ink-300 transition hover:text-rose-500",
          only ? "hidden" : "opacity-0 group-hover:opacity-100",
        )}
      >
        ×
      </button>
    </div>
  );
}

/* ─────────────────────────── 읽기 전용 보기 ─────────────────────────── */

/** 저장된 문서를 상세 화면에서 읽습니다(편집기에 들어가기 전 모양). */
export function DocView({ doc, className }: { doc: Doc; className?: string }) {
  if (!doc || doc.blocks.length === 0) return null;
  return (
    <div className={cn("doc-view space-y-0.5", className)} data-doc-view>
      {doc.blocks.map((block) => {
        const spans = block.spans.length > 0 ? spansToHtml(block.spans) : "";
        if (block.type === "divider") return <hr key={block.id} className="my-3 border-paper-300" />;
        const body = spans ? <span dangerouslySetInnerHTML={{ __html: spans }} /> : null;
        if (block.type === "todo") {
          return (
            <div key={block.id} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-[0.3em] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-[4px] border text-[calc(10px*var(--fs))]",
                  block.checked ? "border-sage-500 bg-sage-500 text-white" : "border-paper-400",
                )}
              >
                {block.checked ? "✓" : ""}
              </span>
              <span className={cn("min-w-0 flex-1", block.checked && "text-ink-400 line-through")}>{body}</span>
            </div>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={block.id}
              className="my-1 border-l-[3px] border-paper-400 pl-2.5 text-ink-700"
              style={toneHex(block.tone) ? { borderColor: toneHex(block.tone) ?? undefined } : undefined}
            >
              {body}
            </blockquote>
          );
        }
        if (block.type === "callout") {
          return (
            <div
              key={block.id}
              className="my-1.5 flex items-start gap-2 rounded-lg px-2 py-1.5"
              style={{ backgroundColor: toneHex(block.tone) ?? "#f8f2dd" }}
            >
              <span className="flex-none">{block.emoji || "💡"}</span>
              <span className="min-w-0 flex-1">{body}</span>
            </div>
          );
        }
        if (block.type === "bullet") {
          return (
            <div key={block.id} className="flex items-start gap-2">
              <span className="mt-[0.55em] h-1.5 w-1.5 flex-none rounded-full bg-ink-400" />
              <span className="min-w-0 flex-1">{body}</span>
            </div>
          );
        }
        if (block.type === "heading") {
          return (
            <p key={block.id} className="mt-3 text-[calc(17px*var(--fs))] font-semibold">
              {body}
            </p>
          );
        }
        return (
          <p key={block.id} className="leading-[1.78]">
            {body}
          </p>
        );
      })}
    </div>
  );
}

/** 문서를 복제해 편집기에 넘깁니다 — 화면의 원본을 건드리지 않게. */
export function editableCopy(doc: Doc): Doc {
  return cloneDoc(doc);
}
