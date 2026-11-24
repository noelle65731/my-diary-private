import type { CSSProperties } from "react";

/**
 * A45: 속지 배경 — 무지 / 줄노트 / 모눈.
 * 일기 화면과 편집기가 같은 함수를 써서 어디서 봐도 같은 결이 나게 합니다.
 */
export type PaperStyle = "plain" | "ruled" | "grid";

const LINE = "var(--paper-line, #e6e2d8)";

/**
 * A48: 줄 간격은 `--doc-rule`(글자 크기·밀도를 따릅니다) 하나만 씁니다.
 * 글자의 line-height 도 같은 값을 쓰므로, 가로선과 글자 줄이 정확히 1:1로 맞습니다.
 * `background-origin: content-box` 로 안쪽 여백을 건너뛰고 첫 줄부터 그리고,
 * `background-attachment: local` 로 스크롤하는 동안에도 선이 글자와 함께 움직입니다.
 */
export function paperBackground(paper: PaperStyle): CSSProperties | undefined {
  if (paper === "ruled") {
    return {
      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--doc-rule) - 1px), ${LINE} calc(var(--doc-rule) - 1px), ${LINE} var(--doc-rule))`,
      backgroundOrigin: "content-box",
      backgroundClip: "border-box",
      backgroundAttachment: "local",
    };
  }
  if (paper === "grid") {
    return {
      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--doc-grid) - 1px), ${LINE} calc(var(--doc-grid) - 1px), ${LINE} var(--doc-grid)), repeating-linear-gradient(to right, transparent 0, transparent calc(var(--doc-grid) - 1px), ${LINE} calc(var(--doc-grid) - 1px), ${LINE} var(--doc-grid))`,
      backgroundOrigin: "content-box",
      backgroundClip: "border-box",
      backgroundAttachment: "local",
    };
  }
  return undefined;
}

export const PAPER_OPTIONS: { value: PaperStyle; label: string }[] = [
  { value: "plain", label: "무지" },
  { value: "ruled", label: "줄노트" },
  { value: "grid", label: "모눈" },
];
