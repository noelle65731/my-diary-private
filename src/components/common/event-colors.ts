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
    swatch: "bg-[#9b9a97]",
    tone: tone("text-[#5f5e5b]", "bg-[#f1f1ef]", "border-[#e3e2e0]", "bg-[#9b9a97]", "bg-[#f7f7f5]", "bg-[#9b9a97]"),
  },
  {
    key: "brown",
    label: "갈색",
    swatch: "bg-[#9f6b53]",
    tone: tone("text-[#8a5a3b]", "bg-[#f5eeea]", "border-[#e8dad1]", "bg-[#9f6b53]", "bg-[#faf5f1]", "bg-[#9f6b53]"),
  },
  {
    key: "orange",
    label: "주황",
    swatch: "bg-[#d9730d]",
    tone: tone("text-[#b4551f]", "bg-[#faeadd]", "border-[#f2d7c2]", "bg-[#d9730d]", "bg-[#fdf3ea]", "bg-[#d9730d]"),
  },
  {
    key: "yellow",
    label: "노랑",
    swatch: "bg-[#dfab01]",
    tone: tone("text-[#9a7300]", "bg-[#fbf2d9]", "border-[#f0e2b4]", "bg-[#dfab01]", "bg-[#fdf9ea]", "bg-[#dfab01]"),
  },
  {
    key: "green",
    label: "초록",
    swatch: "bg-[#448361]",
    tone: tone("text-[#3f6b3a]", "bg-[#eaf2e9]", "border-[#d5e5d2]", "bg-[#448361]", "bg-[#f3f8f1]", "bg-[#448361]"),
  },
  {
    key: "blue",
    label: "파랑",
    swatch: "bg-[#337ea9]",
    tone: tone("text-[#2f6c9e]", "bg-[#e6f1f8]", "border-[#cde2ef]", "bg-[#337ea9]", "bg-[#f2f8fc]", "bg-[#337ea9]"),
  },
  {
    key: "purple",
    label: "보라",
    swatch: "bg-[#9065b0]",
    tone: tone("text-[#6a4fa3]", "bg-[#f2eef9]", "border-[#e2d9f1]", "bg-[#9065b0]", "bg-[#f8f5fd]", "bg-[#9065b0]"),
  },
  {
    key: "pink",
    label: "분홍",
    swatch: "bg-[#c14c8a]",
    tone: tone("text-[#b0426d]", "bg-[#faeaf1]", "border-[#f2d5e2]", "bg-[#c14c8a]", "bg-[#fdf4f8]", "bg-[#c14c8a]"),
  },
  {
    key: "red",
    label: "빨강",
    swatch: "bg-[#d44c47]",
    tone: tone("text-[#b0392f]", "bg-[#fbe9e7]", "border-[#f3d2ce]", "bg-[#d44c47]", "bg-[#fdf4f3]", "bg-[#d44c47]"),
  },
];

const BY_KEY = new Map(EVENT_COLORS.map((choice) => [choice.key, choice]));

export function eventColorTone(key: EventColorKey | null | undefined): Tone | null {
  if (!key) return null;
  return BY_KEY.get(key)?.tone ?? null;
}

export const EVENT_COLOR_KEYS = EVENT_COLORS.map((choice) => choice.key);
