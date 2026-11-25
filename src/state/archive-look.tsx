"use client";

/**
 * A51: 아카이브 분류(유형) 알약 색.
 *
 * 다섯 분류(메모·책·영화·레퍼런스·읽을거리)는 각자 다른 파스텔 색을 씁니다. 색값은
 * `globals.css` 의 `--pastel-*` 변수라 설정의 색감 테마를 바꾸면 다섯 색도 함께
 * 그 테마의 톤으로 바뀌면서도 서로 또렷하게 구분됩니다. 사용자가 분류마다 다른 색을
 * 고르면 그 선택은 이 브라우저에 남습니다(노션 속성을 새로 만들지 않습니다).
 *
 * 카드 배경은 건드리지 않습니다 — 모든 카드는 테마의 기본 카드 바탕을 그대로 씁니다.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ARCHIVE_KINDS, type ArchiveKind } from "@/lib/types";

export type ArchivePastelKey = "rose" | "peach" | "lemon" | "mint" | "sky" | "lavender" | "sage" | "cream" | "aqua" | "lilac";

export interface KindColorStyle {
  /** 알약 바탕 + 글자 */
  pill: string;
  /** 알약 앞의 작은 점 */
  dot: string;
  /** 색 고르기 단추의 동그라미 */
  swatch: string;
  label: string;
}

/** Tailwind 가 글자 그대로 읽도록 클래스 문자열을 표에 적어 둡니다(동적 조합 금지). */
export const KIND_COLOR_STYLES: Record<ArchivePastelKey, KindColorStyle> = {
  rose: { pill: "bg-[var(--pastel-rose-bg)] text-ink-800", dot: "bg-[var(--pastel-rose-dot)]", swatch: "bg-[var(--pastel-rose-dot)]", label: "로즈" },
  peach: { pill: "bg-[var(--pastel-peach-bg)] text-ink-800", dot: "bg-[var(--pastel-peach-dot)]", swatch: "bg-[var(--pastel-peach-dot)]", label: "피치" },
  lemon: { pill: "bg-[var(--pastel-lemon-bg)] text-ink-800", dot: "bg-[var(--pastel-lemon-dot)]", swatch: "bg-[var(--pastel-lemon-dot)]", label: "레몬" },
  mint: { pill: "bg-[var(--pastel-mint-bg)] text-ink-800", dot: "bg-[var(--pastel-mint-dot)]", swatch: "bg-[var(--pastel-mint-dot)]", label: "민트" },
  sky: { pill: "bg-[var(--pastel-sky-bg)] text-ink-800", dot: "bg-[var(--pastel-sky-dot)]", swatch: "bg-[var(--pastel-sky-dot)]", label: "스카이" },
  lavender: { pill: "bg-[var(--pastel-lavender-bg)] text-ink-800", dot: "bg-[var(--pastel-lavender-dot)]", swatch: "bg-[var(--pastel-lavender-dot)]", label: "라벤더" },
  sage: { pill: "bg-[var(--pastel-sage-bg)] text-ink-800", dot: "bg-[var(--pastel-sage-dot)]", swatch: "bg-[var(--pastel-sage-dot)]", label: "세이지" },
  cream: { pill: "bg-[var(--pastel-cream-bg)] text-ink-800", dot: "bg-[var(--pastel-cream-dot)]", swatch: "bg-[var(--pastel-cream-dot)]", label: "크림" },
  aqua: { pill: "bg-[var(--pastel-aqua-bg)] text-ink-800", dot: "bg-[var(--pastel-aqua-dot)]", swatch: "bg-[var(--pastel-aqua-dot)]", label: "아쿠아" },
  lilac: { pill: "bg-[var(--pastel-lilac-bg)] text-ink-800", dot: "bg-[var(--pastel-lilac-dot)]", swatch: "bg-[var(--pastel-lilac-dot)]", label: "라일락" },
};

export const KIND_COLOR_KEYS: ArchivePastelKey[] = Object.keys(KIND_COLOR_STYLES) as ArchivePastelKey[];

/** 기본 배분 — 다섯 분류가 한 화면에서 서로 겹치지 않는 색을 갖습니다. */
export const DEFAULT_KIND_COLORS: Record<ArchiveKind, ArchivePastelKey> = {
  메모: "lavender",
  책: "cream",
  영화: "rose",
  레퍼런스: "sky",
  읽을거리: "sage",
};

const STORAGE_KEY = "my-diary:archive-kinds:v1";

interface ArchiveLookValue {
  kindColor: (kind: ArchiveKind) => ArchivePastelKey;
  styleOf: (kind: ArchiveKind) => KindColorStyle;
  setKindColor: (kind: ArchiveKind, color: ArchivePastelKey) => void;
  resetKindColors: () => void;
}

const LookContext = createContext<ArchiveLookValue | null>(null);

function readStored(): Partial<Record<ArchiveKind, ArchivePastelKey>> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<ArchiveKind, ArchivePastelKey>> = {};
    for (const kind of ARCHIVE_KINDS) {
      const value = parsed?.[kind];
      if (typeof value === "string" && value in KIND_COLOR_STYLES) out[kind] = value as ArchivePastelKey;
    }
    return out;
  } catch {
    return {};
  }
}

export function ArchiveLookProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<Partial<Record<ArchiveKind, ArchivePastelKey>>>({});

  useEffect(() => {
    setCustom(readStored());
  }, []);

  const persist = useCallback((next: Partial<Record<ArchiveKind, ArchivePastelKey>>) => {
    setCustom(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 저장 공간이 막혀도 이번 화면에서는 그대로 보입니다 */
    }
  }, []);

  const kindColor = useCallback((kind: ArchiveKind) => custom[kind] ?? DEFAULT_KIND_COLORS[kind] ?? "lavender", [custom]);

  const setKindColor = useCallback(
    (kind: ArchiveKind, color: ArchivePastelKey) => {
      persist({ ...custom, [kind]: color });
    },
    [custom, persist],
  );

  const resetKindColors = useCallback(() => persist({}), [persist]);

  const value = useMemo<ArchiveLookValue>(
    () => ({
      kindColor,
      styleOf: (kind) => KIND_COLOR_STYLES[kindColor(kind)] ?? KIND_COLOR_STYLES.lavender,
      setKindColor,
      resetKindColors,
    }),
    [kindColor, setKindColor, resetKindColors],
  );

  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

export function useArchiveLook(): ArchiveLookValue {
  const context = useContext(LookContext);
  if (!context) throw new Error("useArchiveLook must be used inside ArchiveLookProvider");
  return context;
}
