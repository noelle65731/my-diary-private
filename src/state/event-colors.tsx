"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CalendarEvent } from "@/lib/types";
import type { Tone } from "@/components/common/tone";
import { categoryTone } from "@/components/common/tone";
import {
  eventColorKeyOf,
  eventColorLabel,
  eventColorTone,
  type EventColorKey,
} from "@/components/common/event-colors";
import { useCategoryColors } from "@/state/category-colors";
import { useData } from "@/state/store";

/**
 * 일정 색은 두 곳에 남습니다.
 * - 노션 Calendar 기록 DB 의 `색` select (A40) — PC·모바일이 같은 색을 봅니다.
 * - 이 브라우저의 localStorage — `색` 속성이 아직 없을 때를 위한 예전 방식과 fallback.
 * 저장된 색이 있으면 분류 기본색보다 먼저 쓰입니다.
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
  toneFor: (event: Pick<CalendarEvent, "id" | "category"> & { color?: string | null }) => Tone;
  /** A40: 노션 `색` select 에 저장할 수 있는 상태인지 (아직 없으면 localStorage 만 씁니다). */
  notionReady: boolean;
}

const EventColorContext = createContext<EventColorContextValue | null>(null);

export function EventColorProvider({ children }: { children: ReactNode }) {
  const { data, update, demo, status } = useData();
  const [colors, setColors] = useState<ColorMap>({});
  const [notionReady, setNotionReady] = useState(false);
  /** A19: 분류에 직접 고른 색이 있으면 분류 기본색 대신 그 색을 씁니다. */
  const categoryColors = useCategoryColors();
  const authenticated = status?.authenticated === true && !demo;

  useEffect(() => {
    setColors(read());
  }, []);

  /**
   * A40: 일정 색을 노션에 남길 수 있는지 한 번 확인합니다. `색` 속성이 없으면 서버가
   * 조용히 만들어 두고, 그것도 안 되면 false 로 남겨 저장 요청을 보내지 않습니다
   * (없는 속성을 보내면 노션이 400 으로 거절합니다).
   */
  useEffect(() => {
    if (!authenticated) return;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/notion/calendar/schema", { cache: "no-store" });
        const body = (await response.json()) as { ok?: boolean; data?: { name?: string }[] };
        if (!alive) return;
        const names = (body.data ?? []).map((property) => property.name ?? "");
        if (names.includes("색")) {
          setNotionReady(true);
          return;
        }
        const made = await fetch("/api/color-schema", { method: "POST" });
        const result = (await made.json()) as { ok?: boolean; exists?: boolean };
        if (alive) setNotionReady(Boolean(result.ok && result.exists));
      } catch {
        /* 색은 이 브라우저에만 남깁니다. */
      }
    })();
    return () => {
      alive = false;
    };
  }, [authenticated]);

  /** 노션에서 읽어 온 색 — 이 브라우저에 저장한 색이 있으면 그쪽이 우선입니다. */
  const fromNotion = useMemo(() => {
    const map = new Map<string, EventColorKey>();
    for (const event of data.calendar) {
      const key = eventColorKeyOf(event.color);
      if (key) map.set(event.id, key);
    }
    return map;
  }, [data.calendar]);

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
      /* A40: 노션에 `색` 이 있으면 함께 저장해 다른 기기에서도 같은 색이 보이게 합니다. */
      if (notionReady) {
        void update("calendar", id, { color: key === "default" ? "" : eventColorLabel(key) });
      }
    },
    [notionReady, update],
  );

  const colorOf = useCallback(
    (id: string) => colors[id] ?? fromNotion.get(id) ?? null,
    [colors, fromNotion],
  );

  const toneFor = useCallback(
    (event: Pick<CalendarEvent, "id" | "category"> & { color?: string | null }) =>
      eventColorTone(colors[event.id] ?? eventColorKeyOf(event.color)) ??
      categoryColors.toneOf(event.category, categoryTone(event.category)),
    [categoryColors, colors],
  );

  const value = useMemo<EventColorContextValue>(
    () => ({ colors, colorOf, setColor, toneFor, notionReady }),
    [colorOf, colors, notionReady, setColor, toneFor],
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
    notionReady: false,
  };
}
