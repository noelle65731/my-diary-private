/**
 * A45: 일기·노트·아카이브 본문의 서식 문서.
 *
 * 본문은 노션 페이지의 **블록**(문단·인용구·강조 박스·체크리스트)과 각 블록 안의
 * **리치텍스트 주석**(굵게·밑줄·취소선·글자색·파스텔 형광펜)으로 저장됩니다. 이 파일은
 * 그 문서를 앱 안에서 다루는 한 가지 모양(`Doc`)과, 노션 블록·마크다운 사이를 오가는
 * 변환을 담습니다. 브라우저와 서버가 함께 쓰는 순수 함수만 둡니다.
 */

export type DocColor =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export type DocBlockType = "paragraph" | "heading" | "quote" | "callout" | "todo" | "bullet" | "divider";

export interface DocSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** 노션 글자색 이름 */
  color?: DocColor | null;
  /** 노션 형광펜(배경색) 이름 — 저장할 때 `_background` 가 붙습니다. */
  background?: DocColor | null;
  href?: string | null;
}

export interface DocBlock {
  /** 화면에서 행을 구분하는 키. 노션에서 읽은 블록은 노션 블록 id 입니다. */
  id: string;
  type: DocBlockType;
  spans: DocSpan[];
  /** 체크리스트 */
  checked?: boolean;
  /** 강조 박스 아이콘 */
  emoji?: string;
  /** 인용구·강조 박스의 파스텔 배경 이름 */
  tone?: DocColor | null;
}

export interface DocStamp {
  weather: string | null;
  mood: string | null;
}

export interface Doc {
  stamp: DocStamp;
  blocks: DocBlock[];
}

/* ─────────────────────────── 색 팔레트 ─────────────────────────── */

export interface ColorChoice {
  name: DocColor;
  label: string;
  hex: string;
}

/** 글자색 — 노션의 기본 색과 같은 계열. */
export const TEXT_COLORS: ColorChoice[] = [
  { name: "default", label: "기본", hex: "#1f1d1a" },
  { name: "red", label: "빨강", hex: "#a05a54" },
  { name: "orange", label: "주황", hex: "#a9743f" },
  { name: "yellow", label: "노랑", hex: "#9a7f33" },
  { name: "green", label: "초록", hex: "#4f7057" },
  { name: "blue", label: "파랑", hex: "#4a6f87" },
  { name: "purple", label: "보라", hex: "#7a6690" },
  { name: "pink", label: "분홍", hex: "#9c6080" },
  { name: "gray", label: "회색", hex: "#6e685e" },
];

/** 파스텔 형광펜 — 배경색. */
export const HIGHLIGHT_COLORS: ColorChoice[] = [
  { name: "yellow", label: "노랑", hex: "#f7eda6" },
  { name: "green", label: "초록", hex: "#dfeed6" },
  { name: "blue", label: "파랑", hex: "#dbe9f1" },
  { name: "pink", label: "분홍", hex: "#f7e0e5" },
  { name: "purple", label: "보라", hex: "#e9e2f1" },
  { name: "orange", label: "주황", hex: "#f8e6d3" },
];

/** 인용구·강조 박스에 쓰는 파스텔 배경. */
export const TONE_COLORS: ColorChoice[] = [
  { name: "gray", label: "회색", hex: "#f2f1ec" },
  { name: "yellow", label: "노랑", hex: "#f8f2dd" },
  { name: "blue", label: "파랑", hex: "#eaf1f5" },
  { name: "green", label: "초록", hex: "#eef2e8" },
  { name: "pink", label: "분홍", hex: "#f8eef2" },
  { name: "purple", label: "보라", hex: "#f1edf7" },
];

const TEXT_BY_NAME = new Map(TEXT_COLORS.map((item) => [item.name, item.hex]));
const TONE_BY_NAME = new Map(TONE_COLORS.map((item) => [item.name, item.hex]));

export function textColorHex(name: DocColor | null | undefined): string | null {
  if (!name || name === "default") return null;
  return TEXT_BY_NAME.get(name) ?? null;
}

export function highlightHex(name: DocColor | null | undefined): string | null {
  if (!name || name === "default") return null;
  const pastel = HIGHLIGHT_COLORS.find((item) => item.name === name);
  return pastel?.hex ?? null;
}

export function toneHex(name: DocColor | null | undefined): string | null {
  if (!name || name === "default") return null;
  return TONE_BY_NAME.get(name) ?? null;
}

/** `#rrggbb`(또는 `rgb(r,g,b)`)를 팔레트 이름으로 되돌립니다 — 서식 해제 판별에도 씁니다. */
export function colorNameOf(css: string | null | undefined, palette: ColorChoice[]): DocColor | null {
  if (!css) return null;
  const value = css.trim().toLowerCase();
  const hex = value.startsWith("rgb")
    ? (() => {
        const numbers = value.replace(/[^0-9,]/g, "").split(",").map((part) => Number(part));
        if (numbers.length < 3 || numbers.some((part) => !Number.isFinite(part))) return "";
        return `#${numbers
          .slice(0, 3)
          .map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0"))
          .join("")}`;
      })()
    : value;
  const found = palette.find((item) => item.hex.toLowerCase() === hex);
  return found?.name ?? null;
}

/* ─────────────────────────── 스탬프 ─────────────────────────── */

export const WEATHER_STAMPS = ["☀️", "⛅", "🌧️", "❄️", "🌈", "🌤️", "☁️", "🌙"];
export const MOOD_STAMPS = ["😊", "🥰", "😴", "😢", "🔥", "😌", "🤍", "😤"];

const STAMP_SET = new Set([...WEATHER_STAMPS, ...MOOD_STAMPS]);

/** 이모지를 한 글자씩 — `☀️` 는 두 코드포인트라 단순 분해로는 세트와 맞지 않습니다. */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment: (value: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter("en", { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((part) => part.segment);
  }
  return [...text];
}

export function stampLine(stamp: DocStamp): string {
  return [stamp.weather, stamp.mood].filter(Boolean).join(" ");
}

/** 첫 줄이 스탬프 이모지로만 되어 있으면 스탬프로 읽습니다. */
export function parseStampLine(text: string): DocStamp | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const parts = graphemes(clean);
  const found = parts.filter((part) => part.trim() && STAMP_SET.has(part));
  if (found.length === 0) return null;
  const leftover = parts.filter((part) => part.trim() && !STAMP_SET.has(part)).join("");
  if (leftover.trim()) return null;
  return {
    weather: found.find((part) => WEATHER_STAMPS.includes(part)) ?? null,
    mood: found.find((part) => MOOD_STAMPS.includes(part)) ?? null,
  };
}

export function hasStamp(stamp: DocStamp | null | undefined): boolean {
  return Boolean(stamp && (stamp.weather || stamp.mood));
}

/* ─────────────────────────── 기본값 / 복사 ─────────────────────────── */

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}`;
}

export function emptyDoc(): Doc {
  return { stamp: { weather: null, mood: null }, blocks: [{ id: newBlockId(), type: "paragraph", spans: [] }] };
}

export function blockOf(type: DocBlockType, text = ""): DocBlock {
  const spans: DocSpan[] = text ? [{ text }] : [];
  return {
    id: newBlockId(),
    type,
    spans,
    ...(type === "todo" ? { checked: false } : {}),
    ...(type === "callout" ? { emoji: "💡", tone: "yellow" as DocColor } : {}),
    ...(type === "quote" ? { tone: "gray" as DocColor } : {}),
  };
}

export function cloneDoc(doc: Doc): Doc {
  return {
    stamp: { ...doc.stamp },
    blocks: doc.blocks.map((block) => ({ ...block, spans: block.spans.map((span) => ({ ...span })) })),
  };
}

export function isEmptyDoc(doc: Doc): boolean {
  return !hasStamp(doc.stamp) && doc.blocks.every((block) => !blockText(block).trim());
}

export function docEqual(a: Doc, b: Doc): boolean {
  return JSON.stringify(normalizeDoc(a)) === JSON.stringify(normalizeDoc(b));
}

/** 모양만 다듬습니다 — 빈 문단도 그대로 둡니다(Enter 로 만든 빈 줄이 사라지면 커서가 튀기 때문). */
export function normalizeDoc(doc: Doc): Doc {
  const blocks = doc.blocks.map((block) => ({
    ...block,
    spans: normalizeSpans(block.spans),
    ...(block.type === "todo" ? { checked: !!block.checked } : {}),
    ...(block.type === "callout" ? { emoji: block.emoji || "💡" } : {}),
  }));
  return { stamp: { ...doc.stamp }, blocks: blocks.length > 0 ? blocks : [{ id: newBlockId(), type: "paragraph", spans: [] }] };
}

/** 저장 직전에 끝의 빈 문단 하나는 덜어 냅니다 — 노션에 빈 줄만 남지 않게. */
export function trimDoc(doc: Doc): Doc {
  const blocks = [...doc.blocks];
  while (blocks.length > 1 && blocks[blocks.length - 1]!.type === "paragraph" && blocks[blocks.length - 1]!.spans.length === 0) {
    blocks.pop();
  }
  return { stamp: { ...doc.stamp }, blocks };
}

/* ─────────────────────────── 스팬 helpers ─────────────────────────── */

export function blockText(block: DocBlock): string {
  return block.spans.map((span) => span.text).join("");
}

export function spansPlain(spans: DocSpan[] | null | undefined): string {
  return (spans ?? []).map((span) => span.text).join("");
}

export function normalizeSpans(spans: DocSpan[]): DocSpan[] {
  const out: DocSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const next: DocSpan = {
      text: span.text,
      ...(span.bold ? { bold: true } : {}),
      ...(span.italic ? { italic: true } : {}),
      ...(span.underline ? { underline: true } : {}),
      ...(span.strike ? { strike: true } : {}),
      ...(span.color && span.color !== "default" ? { color: span.color } : {}),
      ...(span.background && span.background !== "default" ? { background: span.background } : {}),
      ...(span.href ? { href: span.href } : {}),
    };
    const last = out[out.length - 1];
    if (
      last &&
      !!last.bold === !!next.bold &&
      !!last.italic === !!next.italic &&
      !!last.underline === !!next.underline &&
      !!last.strike === !!next.strike &&
      (last.color ?? "") === (next.color ?? "") &&
      (last.background ?? "") === (next.background ?? "") &&
      (last.href ?? "") === (next.href ?? "")
    ) {
      last.text += next.text;
    } else {
      out.push(next);
    }
  }
  return out;
}

/* ─────────────────────── 노션 블록 → 문서 ─────────────────────── */

interface NotionSpanLike {
  plain_text?: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    color?: string;
  };
  text?: { content?: string; link?: { url?: string } | null };
}

interface NotionBlockLike {
  id?: string;
  type?: string;
  [key: string]: unknown;
}

function spansOfRichText(items: unknown): DocSpan[] {
  if (!Array.isArray(items)) return [];
  const spans: DocSpan[] = [];
  for (const raw of items as NotionSpanLike[]) {
    const text = raw?.plain_text ?? raw?.text?.content ?? "";
    if (!text) continue;
    const color = raw.annotations?.color ?? "default";
    const background = color.endsWith("_background") ? (color.slice(0, -"_background".length) as DocColor) : null;
    const foreground = background ? null : (color as DocColor);
    spans.push({
      text,
      ...(raw.annotations?.bold ? { bold: true } : {}),
      ...(raw.annotations?.italic ? { italic: true } : {}),
      ...(raw.annotations?.underline ? { underline: true } : {}),
      ...(raw.annotations?.strikethrough ? { strike: true } : {}),
      ...(foreground && foreground !== "default" ? { color: foreground } : {}),
      ...(background ? { background } : {}),
      ...(raw.href ?? raw.text?.link?.url ? { href: (raw.href ?? raw.text?.link?.url) as string } : {}),
    });
  }
  return normalizeSpans(spans);
}

function toneOf(color: unknown): DocColor | null {
  if (typeof color !== "string" || !color) return null;
  const name = (color.endsWith("_background") ? color.slice(0, -"_background".length) : color) as DocColor;
  return name;
}

/** 노션에서 읽은 블록 하나를 문서 블록으로. 다루지 않는 종류는 null. */
export function blockFromNotion(raw: NotionBlockLike): DocBlock | null {
  const type = typeof raw.type === "string" ? raw.type : "";
  const payloadOf = (key: string) => (raw[key] ?? {}) as { rich_text?: unknown; checked?: boolean; color?: string; icon?: { emoji?: string } };
  const id = typeof raw.id === "string" && raw.id ? raw.id : newBlockId();

  switch (type) {
    case "paragraph":
      return { id, type: "paragraph", spans: (() => {
        const payload = payloadOf("paragraph");
        return spansOfRichText(payload.rich_text);
      })() };
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return { id, type: "heading", spans: spansOfRichText(payloadOf(type).rich_text) };
    case "quote": {
      const payload = payloadOf("quote");
      return { id, type: "quote", spans: spansOfRichText(payload.rich_text), tone: toneOf(payload.color) };
    }
    case "callout": {
      const payload = payloadOf("callout");
      return {
        id,
        type: "callout",
        spans: spansOfRichText(payload.rich_text),
        emoji: payload.icon?.emoji ?? "💡",
        tone: toneOf(payload.color) ?? "yellow",
      };
    }
    case "to_do": {
      const payload = payloadOf("to_do");
      return { id, type: "todo", spans: spansOfRichText(payload.rich_text), checked: !!payload.checked };
    }
    case "bulleted_list_item":
      return { id, type: "bullet", spans: spansOfRichText(payloadOf("bulleted_list_item").rich_text) };
    case "divider":
      return { id, type: "divider", spans: [] };
    default:
      return null;
  }
}

/** 본문 문서로 다루는 블록 종류 — 이 종류만 다시 쓰고, 나머지(이미지·토글…)는 건드리지 않습니다. */
export const MANAGED_BLOCK_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "quote",
  "callout",
  "to_do",
  "bulleted_list_item",
  "numbered_list_item",
  "divider",
]);

export function docFromBlocks(blocks: NotionBlockLike[]): Doc {
  const parsed = blocks.map(blockFromNotion).filter((block): block is DocBlock => block !== null);
  const first = parsed[0];
  let stamp: DocStamp = { weather: null, mood: null };
  if (first && first.type === "paragraph") {
    const found = parseStampLine(blockText(first));
    if (found) {
      stamp = found;
      parsed.shift();
    }
  }
  if (parsed.length === 0) parsed.push({ id: newBlockId(), type: "paragraph", spans: [] });
  return { stamp, blocks: parsed };
}

/* ─────────────────────── 문서 → 노션 블록 ─────────────────────── */

type NotionPayload = Record<string, unknown>;

function notionSpans(spans: DocSpan[]): NotionPayload[] {
  const items: NotionPayload[] = [];
  for (const span of normalizeSpans(spans)) {
    const color = span.background ? `${span.background}_background` : span.color ?? "default";
    // 노션 한 항목의 글자 수 상한(2000)에 맞춰 나눠 보냅니다.
    for (let index = 0; index < span.text.length; index += 1800) {
      const content = span.text.slice(index, index + 1800);
      items.push({
        type: "text",
        text: { content, ...(span.href ? { link: { url: span.href } } : {}) },
        annotations: {
          bold: !!span.bold,
          italic: !!span.italic,
          underline: !!span.underline,
          strikethrough: !!span.strike,
          color,
        },
      });
    }
  }
  return items;
}

/** 스탬프는 본문 맨 위 문단 하나로 저장됩니다(이모지만 있는 줄이라 노션에서도 그대로 보입니다). */
export function stampBlock(doc: Doc): DocBlock | null {
  const stamped = stampLine(doc.stamp);
  return stamped ? { id: "__stamp__", type: "paragraph", spans: [{ text: stamped }] } : null;
}

/** 문서 블록 하나 → 노션에 보낼 블록 본문. */
export function blockPayload(block: DocBlock): NotionPayload {
  const rich = notionSpans(block.spans);
  switch (block.type) {
    case "heading":
      return { object: "block", type: "heading_2", heading_2: { rich_text: rich } };
    case "quote":
      return { object: "block", type: "quote", quote: { rich_text: rich, color: `${block.tone ?? "gray"}_background` } };
    case "callout":
      return {
        object: "block",
        type: "callout",
        callout: {
          rich_text: rich,
          icon: { type: "emoji", emoji: block.emoji || "💡" },
          color: `${block.tone ?? "yellow"}_background`,
        },
      };
    case "todo":
      return { object: "block", type: "to_do", to_do: { rich_text: rich, checked: !!block.checked } };
    case "bullet":
      return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich } };
    case "divider":
      return { object: "block", type: "divider", divider: {} };
    default:
      return { object: "block", type: "paragraph", paragraph: { rich_text: rich } };
  }
}

/** 문서 블록 하나가 노션에서 어떤 종류가 되는지 — 같은 모양인지 비교할 때 씁니다. */
export function notionTypeOf(block: DocBlock): string {
  switch (block.type) {
    case "heading":
      return "heading_2";
    case "quote":
      return "quote";
    case "callout":
      return "callout";
    case "todo":
      return "to_do";
    case "bullet":
      return "bulleted_list_item";
    case "divider":
      return "divider";
    default:
      return "paragraph";
  }
}

export function blocksFromDoc(doc: Doc): NotionPayload[] {
  const stamp = stampBlock(doc);
  return [...(stamp ? [stamp] : []), ...doc.blocks].map(blockPayload);
}

/** 같은 내용인지 비교하는 서명 — 노션에서 읽은 블록과 보낼 블록을 같은 잣대로 봅니다. */
export function blockSignature(block: DocBlock): string {
  return JSON.stringify({
    type: block.type,
    spans: normalizeSpans(block.spans),
    checked: block.type === "todo" ? !!block.checked : null,
    emoji: block.type === "callout" ? block.emoji || "💡" : null,
    tone: block.type === "quote" || block.type === "callout" ? block.tone ?? null : null,
  });
}

/* ─────────────────────── 마크다운 ↔ 문서 ─────────────────────── */

function escapeMarkdown(text: string): string {
  return text.replace(/(\*\*|__|~~)/g, (match) => `\\${match}`);
}

export function spansToMarkdown(spans: DocSpan[]): string {
  return normalizeSpans(spans)
    .map((span) => {
      if (span.href) {
        let linked = `[${span.text}](${span.href})`;
        if (span.strike) linked = `~~${linked}~~`;
        if (span.underline) linked = `__${linked}__`;
        if (span.italic) linked = `*${linked}*`;
        if (span.bold) linked = `**${linked}**`;
        return linked;
      }
      // 앞뒤 공백은 표식 밖에 두어야 `글**굵게**` 처럼 붙어도 다시 읽힙니다.
      const lead = /^\s*/.exec(span.text)?.[0] ?? "";
      const tail = /\s*$/.exec(span.text)?.[0] ?? "";
      const core = span.text.slice(lead.length, span.text.length - tail.length);
      if (!core) return span.text;
      let marked = escapeMarkdown(core);
      if (span.strike) marked = `~~${marked}~~`;
      if (span.underline) marked = `__${marked}__`;
      if (span.italic) marked = `*${marked}*`;
      if (span.bold) marked = `**${marked}**`;
      return `${lead}${marked}${tail}`;
    })
    .join("");
}

export function docToMarkdown(doc: Doc): string {
  const lines: string[] = [];
  const stamped = stampLine(doc.stamp);
  if (stamped) lines.push(stamped);
  for (const block of doc.blocks) {
    const text = spansToMarkdown(block.spans);
    switch (block.type) {
      case "heading":
        lines.push(`## ${text}`.trim());
        break;
      case "quote":
        lines.push(`> ${text}`.trimEnd());
        break;
      case "callout":
        lines.push(`> ${block.emoji || "💡"} ${text}`.trimEnd());
        break;
      case "todo":
        lines.push(`- [${block.checked ? "x" : " "}] ${text}`.trimEnd());
        break;
      case "bullet":
        lines.push(`- ${text}`.trimEnd());
        break;
      case "divider":
        lines.push("---");
        break;
      default:
        lines.push(text);
    }
  }
  return lines.join("\n").replace(/\n+$/, "");
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;

function spansFromInline(text: string): DocSpan[] {
  const out: DocSpan[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    const token = match[0];
    if (token.startsWith("**")) out.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith("__")) out.push({ text: token.slice(2, -2), underline: true });
    else if (token.startsWith("~~")) out.push({ text: token.slice(2, -2), strike: true });
    else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) out.push({ text: link[1]!, href: link[2]! });
      else out.push({ text: token });
    } else out.push({ text: token.slice(1, -1), italic: true });
    last = INLINE.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return normalizeSpans(out);
}

function unescapeMarkdown(text: string): DocSpan[] {
  return spansFromInline(text.replace(/\\(\*\*|__|~~)/g, "$1"));
}

/** 예전에 `기록 데이터` 에 마크다운으로 적어 둔 본문을 문서로. */
export function docFromMarkdown(text: string): Doc {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let stamp: DocStamp = { weather: null, mood: null };
  let index = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (index === 0) {
      const found = parseStampLine(line);
      if (found) {
        stamp = found;
        index += 1;
        continue;
      }
    }
    index += 1;
    if (!line.trim()) {
      blocks.push({ id: newBlockId(), type: "paragraph", spans: [] });
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ id: newBlockId(), type: "divider", spans: [] });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ id: newBlockId(), type: "heading", spans: unescapeMarkdown(heading[2] ?? "") });
      continue;
    }
    if (line.startsWith("> ")) {
      const body = line.slice(2);
      const icon = /^([\p{Extended_Pictographic}]\uFE0F?)\s+/u.exec(body);
      if (icon) {
        blocks.push({ id: newBlockId(), type: "callout", spans: unescapeMarkdown(body.slice(icon[0].length)), emoji: icon[1]!, tone: "yellow" });
      } else {
        blocks.push({ id: newBlockId(), type: "quote", spans: unescapeMarkdown(body), tone: "gray" });
      }
      continue;
    }
    const todo = /^[-*]\s+\[( |x|X)\]\s?(.*)$/.exec(line);
    if (todo) {
      blocks.push({ id: newBlockId(), type: "todo", spans: unescapeMarkdown(todo[2] ?? ""), checked: todo[1] !== " " });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({ id: newBlockId(), type: "bullet", spans: unescapeMarkdown(bullet[1] ?? "") });
      continue;
    }
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      blocks.push({ id: newBlockId(), type: "bullet", spans: unescapeMarkdown(ordered[1] ?? "") });
      continue;
    }
    blocks.push({ id: newBlockId(), type: "paragraph", spans: unescapeMarkdown(line) });
  }

  if (blocks.length === 0) blocks.push({ id: newBlockId(), type: "paragraph", spans: [] });
  return { stamp, blocks };
}

/** 목록·검색에 쓰는 한 줄 미리보기 — 마크다운 표식을 지웁니다. */
export function plainLine(text: string): string {
  return text
    .replace(/^#{1,3}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*]\s+(\[[ xX]\]\s*)?/, "")
    .replace(/^---+$/, "")
    .replace(/\*\*|__|~~/g, "")
    .trim();
}
