/**
 * A5: Notion's `rich_text` property keeps formatting per span.
 *
 * The app stores both views of '기타':
 *  - `memo`     plain text (lists, search, week board first line)
 *  - `memoRich` spans with bold/italic/href so a partial link survives a round trip.
 *
 * The editor uses a small Markdown dialect (`**굵게**`, `*기울임*`, `[글자](주소)`) so a
 * selection in a plain textarea can carry formatting without a heavyweight editor.
 */

import type { RichTextSpan } from "./types";

const TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;

export function plainOfSpans(spans: RichTextSpan[] | undefined | null): string {
  return (spans ?? []).map((span) => span.text).join("");
}

export function spansFromPlain(text: string): RichTextSpan[] {
  return text ? [{ text }] : [];
}

/** Tolerant reader for a JSON payload: ignores anything that is not a span. */
export function coerceSpans(value: unknown): RichTextSpan[] {
  if (!Array.isArray(value)) return [];
  const spans: RichTextSpan[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const text = typeof item.text === "string" ? item.text : "";
    if (!text) continue;
    const href = typeof item.href === "string" && item.href.trim() ? item.href.trim() : undefined;
    spans.push({
      text,
      ...(item.bold === true ? { bold: true } : {}),
      ...(item.italic === true ? { italic: true } : {}),
      ...(href ? { href } : {}),
    });
  }
  return normalizeSpans(spans);
}

/** Drops empty spans and merges neighbours that carry the same formatting. */
export function normalizeSpans(spans: RichTextSpan[]): RichTextSpan[] {
  const out: RichTextSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const next: RichTextSpan = {
      text: span.text,
      ...(span.bold ? { bold: true } : {}),
      ...(span.italic ? { italic: true } : {}),
      ...(span.href ? { href: span.href } : {}),
    };
    const last = out[out.length - 1];
    if (last && !!last.bold === !!next.bold && !!last.italic === !!next.italic && (last.href ?? "") === (next.href ?? "")) {
      last.text += next.text;
    } else {
      out.push(next);
    }
  }
  return out;
}

/** `**굵게**`, `*기울임*`, `[글자](주소)` — 줄바꿈은 그대로 남깁니다. */
export function spansFromMarkdown(text: string): RichTextSpan[] {
  const out: RichTextSpan[] = [];
  const push = (span: RichTextSpan) => {
    if (span.text) out.push(span);
  };
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) push({ text: text.slice(lastIndex, match.index) });
    const token = match[0];
    if (token.startsWith("**")) {
      push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) push({ text: link[1]!, href: link[2]! });
      else push({ text: token });
    } else {
      push({ text: token.slice(1, -1), italic: true });
    }
    lastIndex = TOKEN.lastIndex;
  }
  if (lastIndex < text.length) push({ text: text.slice(lastIndex) });
  return normalizeSpans(out);
}

export function markdownOfSpans(spans: RichTextSpan[] | undefined | null): string {
  return (spans ?? [])
    .map((span) => {
      let text = span.text;
      if (span.italic && text.trim()) text = `*${text}*`;
      if (span.bold && text.trim()) text = `**${text}**`;
      if (span.href) text = `[${text}](${span.href})`;
      return text;
    })
    .join("");
}

/** The editable form of a '기타' value: formatting expressed as Markdown. */
export function editableMemo(item: { memo: string; memoRich?: RichTextSpan[] }): string {
  if (item.memoRich && item.memoRich.length > 0) return markdownOfSpans(item.memoRich);
  return item.memo;
}

export function spansEqual(a: RichTextSpan[] | undefined, b: RichTextSpan[] | undefined): boolean {
  const left = normalizeSpans(a ?? []);
  const right = normalizeSpans(b ?? []);
  if (left.length !== right.length) return false;
  return left.every((span, index) => {
    const other = right[index]!;
    return (
      span.text === other.text &&
      !!span.bold === !!other.bold &&
      !!span.italic === !!other.italic &&
      (span.href ?? "") === (other.href ?? "")
    );
  });
}

/** Wraps the current selection of a textarea (or inserts a template) for the toolbar. */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  kind: "bold" | "italic" | "link",
  href?: string,
): { text: string; selectionStart: number; selectionEnd: number } {
  const selected = value.slice(start, end);
  const body = selected || (kind === "link" ? "안내문" : "굵게");
  const inserted =
    kind === "bold" ? `**${body}**` : kind === "italic" ? `*${body}*` : `[${body}](${href || "https://"})`;
  return {
    text: value.slice(0, start) + inserted + value.slice(end),
    selectionStart: start,
    selectionEnd: start + inserted.length,
  };
}
