"use client";

import { pushToast } from "@/lib/toast-bus";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Tone } from "@/components/common/tone";
import { EVENT_COLORS, eventColorTone, type EventColorKey } from "@/components/common/event-colors";

/**
 * 분류(업무·개인·공부·사용자가 더한 분류)마다 기본 색을 직접 고를 수 있게 합니다.
 * 노션 Calendar DB에는 분류 색 속성이 없어 이 브라우저(localStorage)에 저장합니다.
 * 일정 하나에 따로 고른 색이 있으면 그 색이 먼저 쓰입니다.
 */
const STORAGE_KEY = "my-diary:category-colors:v1";

export type CategoryColorMap = Record<string, EventColorKey>;

function read(): CategoryColorMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: CategoryColorMap = {};
    for (const [category, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[category] = value as EventColorKey;
    }
    return out;
  } catch {
    return {};
  }
}

interface CategoryColorContextValue {
  colors: CategoryColorMap;
  /** 고른 색 (없으면 "default") */
  colorOf: (category: string) => EventColorKey;
  setColor: (category: string, key: EventColorKey) => void;
  resetAll: () => void;
  /** 고른 색의 톤 — 고른 색이 없으면 `base`(분류 기본색)를 그대로 돌려줍니다. */
  toneOf: (category: string, base: Tone) => Tone;
}

const CategoryColorContext = createContext<CategoryColorContextValue | null>(null);

export function CategoryColorProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<CategoryColorMap>({});

  useEffect(() => {
    setColors(read());
  }, []);

  const write = useCallback((next: CategoryColorMap) => {
    setColors(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 저장 공간이 없으면 이번 화면에서만 유지됩니다. */
    }
  }, []);

  const setColor = useCallback(
    (category: string, key: EventColorKey) => {
      /* A41: 분류 색 변경도 바로 알립니다. */
      pushToast(`${category} 분류 색을 바꿨습니다`);
      setColors((current) => {
        const next = { ...current };
        if (!key || key === "default") delete next[category];
        else next[category] = key;
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    },
    [],
  );

  const resetAll = useCallback(() => {
    pushToast("분류 색을 모두 기본색으로 되돌렸습니다");
    write({});
  }, [write]);

  const colorOf = useCallback((category: string) => colors[category] ?? "default", [colors]);

  const toneOf = useCallback(
    (category: string, base: Tone) => eventColorTone(colors[category]) ?? base,
    [colors],
  );

  const value = useMemo<CategoryColorContextValue>(
    () => ({ colors, colorOf, setColor, resetAll, toneOf }),
    [colorOf, colors, resetAll, setColor, toneOf],
  );

  return <CategoryColorContext.Provider value={value}>{children}</CategoryColorContext.Provider>;
}

/** Provider 밖(공개 키트 미리보기 등)에서는 분류 기본색으로 그대로 동작합니다. */
export function useCategoryColors(): CategoryColorContextValue {
  const value = useContext(CategoryColorContext);
  if (value) return value;
  return {
    colors: {},
    colorOf: () => "default",
    setColor: () => {},
    resetAll: () => {},
    toneOf: (_category, base) => base,
  };
}

/** 분류 색 고르기 팔레트 — 노션 10색(기본 포함). */
export const CATEGORY_COLOR_CHOICES = EVENT_COLORS;
