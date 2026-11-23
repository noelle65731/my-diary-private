import type { CSSProperties } from "react";

/**
 * A45: 속지 배경 — 무지 / 줄노트 / 모눈.
 * 일기 화면과 편집기가 같은 함수를 써서 어디서 봐도 같은 결이 나게 합니다.
 */
export type PaperStyle = "plain" | "ruled" | "grid";

const LINE = "#eeeae2";

export function paperBackground(paper: PaperStyle): CSSProperties | undefined {
  if (paper === "ruled") {
    return {
      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 27px, ${LINE} 27px, ${LINE} 28px)`,
      backgroundPosition: "0 2px",
    };
  }
  if (paper === "grid") {
    return {
      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 23px, ${LINE} 23px, ${LINE} 24px), repeating-linear-gradient(to right, transparent 0, transparent 23px, ${LINE} 23px, ${LINE} 24px)`,
    };
  }
  return undefined;
}

export const PAPER_OPTIONS: { value: PaperStyle; label: string }[] = [
  { value: "plain", label: "무지" },
  { value: "ruled", label: "줄노트" },
  { value: "grid", label: "모눈" },
];
