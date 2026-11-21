"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CalendarEvent } from "@/lib/types";
import type { Tone } from "@/components/common/tone";
import { categoryTone } from "@/components/common/tone";
import { eventColorTone, type EventColorKey } from "@/components/common/event-colors";

/**
 * 일정 색은 노션 Calendar DB에 색 속성이 없어 이 브라우저에 저장합니다.
 * 저장한 색이 있으면 분류 기본색보다 먼저 쓰입니다.
 */
const STORAGE_KEY = "my-diary:event-colors:v1";

type ColorMap = Record<string, EventColorKey>;

function read(): ColorMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ColorMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[id] = value as EventColorKey;
    }
    return out;
  } catch {
    return {};
  }
}

interface EventColorContextValue {
  colors: ColorMap;
  /** 저장된 색 (없으면 null) */
  colorOf: (id: string) => EventColorKey | null;
  setColor: (id: string, key: EventColorKey) => void;
  /** 저장된 색 → 분류 기본색 순서로 고른 톤 */
  toneFor: (event: Pick<CalendarEvent, "id" | "category">) => Tone;
}

const EventColorContext = createContext<EventColorContextValue | null>(null);

export function EventColorProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<ColorMap>({});

  useEffect(() => {
    setColors(read());
  }, []);

  const write = useCallback((next: ColorMap) => {
    setColors(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 저장 공간이 없으면 이번 화면에서만 색이 유지됩니다. */
    }
  }, []);

  const setColor = useCallback(
    (id: string, key: EventColorKey) => {
      setColors((current) => {
        const next = { ...current };
        if (key === "default") delete next[id];
        else next[id] = key;
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

  const colorOf = useCallback((id: string) => colors[id] ?? null, [colors]);

  const toneFor = useCallback(
    (event: Pick<CalendarEvent, "id" | "category">) => eventColorTone(colors[event.id]) ?? categoryTone(event.category),
    [colors],
  );

  const value = useMemo<EventColorContextValue>(
    () => ({ colors, colorOf, setColor, toneFor }),
    [colorOf, colors, setColor, toneFor],
  );

  return <EventColorContext.Provider value={value}>{children}</EventColorContext.Provider>;
}

export function useEventColors(): EventColorContextValue {
  const value = useContext(EventColorContext);
  if (value) return value;
  /* Provider 밖(공개 키트 미리보기 등)에서도 색 없이 그대로 동작합니다. */
  return {
    colors: {},
    colorOf: () => null,
    setColor: () => {},
    toneFor: (event) => categoryTone(event.category),
  };
}
