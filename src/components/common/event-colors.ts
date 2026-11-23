import type { Tone } from "@/components/common/tone";

/**
 * 노션이 선택지로 주는 색 열 가지를 그대로 옮겼습니다.
 * 일정마다 이 색을 고르면 분류 기본색보다 먼저 적용됩니다.
 */
export type EventColorKey =
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

export interface EventColorChoice {
  key: EventColorKey;
  /** 노션에서 보이는 이름 */
  label: string;
  /** 팔레트 버튼의 동그라미 */
  swatch: string;
  /** 기본은 분류 색을 그대로 쓰므로 비어 있습니다. */
  tone: Tone | null;
}

const tone = (
  text: string,
  bg: string,
  border: string,
  dot: string,
  soft: string,
  solid: string,
): Tone => ({ text, bg, border, dot, soft, solid, solidText: "text-white" });

export const EVENT_COLORS: EventColorChoice[] = [
  { key: "default", label: "기본", swatch: "bg-white border border-ink-300", tone: null },
  {
    key: "gray",
    label: "회색",
    swatch: "bg-[#a3a09a]",
    tone: tone("text-[#57554f]", "bg-[#f1f0ec]", "border-[#e2e0d9]", "bg-[#a3a09a]", "bg-[#f7f6f2]", "bg-[#a3a09a]"),
  },
  {
    key: "brown",
    label: "갈색",
    swatch: "bg-[#9a7561]",
    tone: tone("text-[#7b5a48]", "bg-[#f5efea]", "border-[#e7dad1]", "bg-[#9a7561]", "bg-[#faf5f1]", "bg-[#9a7561]"),
  },
  {
    key: "orange",
    label: "주황",
    swatch: "bg-[#b87a4a]",
    tone: tone("text-[#95603a]", "bg-[#f7ece1]", "border-[#ecd9c5]", "bg-[#b87a4a]", "bg-[#fbf2e9]", "bg-[#b87a4a]"),
  },
  {
    key: "yellow",
    label: "노랑",
    swatch: "bg-[#c2a24e]",
    tone: tone("text-[#836b31]", "bg-[#f8f1da]", "border-[#e9ddb9]", "bg-[#c2a24e]", "bg-[#faf6e8]", "bg-[#c2a24e]"),
  },
  {
    key: "green",
    label: "초록",
    swatch: "bg-[#6f8f74]",
    tone: tone("text-[#486a4e]", "bg-[#eaf0e8]", "border-[#d5e0d3]", "bg-[#6f8f74]", "bg-[#f3f7f2]", "bg-[#6f8f74]"),
  },
  {
    key: "blue",
    label: "파랑",
    swatch: "bg-[#6b8fa6]",
    tone: tone("text-[#416e86]", "bg-[#e8f0f4]", "border-[#d2e0e8]", "bg-[#6b8fa6]", "bg-[#f2f7f9]", "bg-[#6b8fa6]"),
  },
  {
    key: "purple",
    label: "보라",
    swatch: "bg-[#8b7ba1]",
    tone: tone("text-[#655a7d]", "bg-[#f0edf5]", "border-[#e0d9ea]", "bg-[#8b7ba1]", "bg-[#f6f4f9]", "bg-[#8b7ba1]"),
  },
  {
    key: "pink",
    label: "분홍",
    swatch: "bg-[#b07a92]",
    tone: tone("text-[#8e5a72]", "bg-[#f7ecf1]", "border-[#ecd6df]", "bg-[#b07a92]", "bg-[#fbf4f7]", "bg-[#b07a92]"),
  },
  {
    key: "red",
    label: "빨강",
    swatch: "bg-[#b06b66]",
    tone: tone("text-[#8d534e]", "bg-[#f9ecea]", "border-[#eed6d3]", "bg-[#b06b66]", "bg-[#fbf4f3]", "bg-[#b06b66]"),
  },
];

const BY_KEY = new Map(EVENT_COLORS.map((choice) => [choice.key, choice]));
const BY_LABEL = new Map(EVENT_COLORS.map((choice) => [choice.label, choice]));

/** A40: 노션 `색` select 값(회색·파랑 … 또는 key)을 앱의 색 키로 읽습니다. */
export function eventColorKeyOf(value: string | null | undefined): EventColorKey | null {
  if (!value) return null;
  const clean = value.trim();
  if (!clean) return null;
  const byKey = BY_KEY.get(clean as EventColorKey);
  if (byKey) return byKey.key;
  const byLabel = BY_LABEL.get(clean);
  return byLabel ? byLabel.key : null;
}

/** 색 키를 노션 select 선택지 이름으로 — 저장할 때 씁니다. */
export function eventColorLabel(key: EventColorKey | null | undefined): string {
  if (!key) return "";
  return BY_KEY.get(key)?.label ?? "";
}

export function eventColorTone(key: EventColorKey | null | undefined): Tone | null {
  if (!key) return null;
  return BY_KEY.get(key)?.tone ?? null;
}

export const EVENT_COLOR_KEYS = EVENT_COLORS.map((choice) => choice.key);
