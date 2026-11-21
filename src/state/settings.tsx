"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ArchiveKind } from "@/lib/types";

export type CalendarViewKey = "year" | "month" | "week" | "three" | "day" | "habit";

export interface Settings {
  /** A18: 1–9단계 — 1~3은 더 작은 쪽에 새로 더한 단계, 6이 기본(15px)입니다. */
  fontSize: number;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  weekStartHour: number;
  weekEndHour: number;
  /** How many items a month cell shows before the rest collapses into a count. */
  monthDayItems: 3 | 4 | 5;
  calendarDefaultView: CalendarViewKey;
  calendarShowHidden: boolean;
  projectTaskPreview: number;
  /** A7: how many recent completions a project card shows (2 or 3). */
  projectCompletedPreview: 2 | 3;
  /** A6/A7: user-made categories shown next to 업무·개인·공부 in the filters. */
  customCategories: string[];
  /** A16: 분류 the user removed — hidden from filters and pickers (records keep their value). */
  hiddenCategories: string[];
  /** A16: NOW 모드 — 켜면 `NOW 숨김` 항목만 화면에서 가립니다 (프로젝트 탭 토글). */
  nowOnly: boolean;
  showCompletedTasks: boolean;
  binderPreviewLines: number;
  binderShowSchedule: boolean;
  archiveDefaultCategory: "전체" | ArchiveKind;
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 6,
  weekStartsOn: 1,
  showWeekends: true,
  weekStartHour: 9,
  weekEndHour: 19,
  monthDayItems: 3,
  calendarDefaultView: "week",
  calendarShowHidden: false,
  projectTaskPreview: 4,
  projectCompletedPreview: 2,
  customCategories: [],
  hiddenCategories: [],
  nowOnly: false,
  showCompletedTasks: true,
  binderPreviewLines: 3,
  binderShowSchedule: true,
  archiveDefaultCategory: "전체",
};

const STORAGE_KEY = "my-diary:settings:v1";

interface SettingsContextValue {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** A7: adds a user-made 분류 (stored in this browser). */
  addCategory: (name: string) => void;
  removeCategory: (name: string) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * A18: 글자 크기 9단계. 1~3은 새로 더한 작은 단계이고, 6단계가 `html { font-size: 15px }`
 * 기본값과 같습니다(예전 3단계를 6단계로 옮겨 적습니다 — 저장된 설정은 한 번 옮겨 줍니다).
 */
const FONT_PX = [11.4, 12, 12.6, 13.2, 14.1, 15, 15.9, 16.8, 17.7];
const FONT_BASE_PX = 15;
const FONT_STEPS = FONT_PX.length;

export function fontSizeToPx(level: number): number {
  const clamped = Math.max(1, Math.min(FONT_STEPS, Math.round(level)));
  return FONT_PX[clamped - 1]!;
}

/** px 글자 크기 클래스들이 곱해서 쓰는 배율(`--fs`). */
export function fontSizeScale(level: number): number {
  return fontSizeToPx(level) / FONT_BASE_PX;
}

export { FONT_STEPS };

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings> & { fontSizeVersion?: number };
        // A18: 예전 6단계 설정(1~6)을 9단계로 옮깁니다 — 같은 크기를 가리키게 3을 더합니다.
        const legacy = parsed.fontSizeVersion !== 2;
        const fontSize =
          legacy && typeof parsed.fontSize === "number"
            ? Math.max(1, Math.min(FONT_STEPS, Math.round(parsed.fontSize) + 3))
            : parsed.fontSize;
        const next = { ...DEFAULT_SETTINGS, ...parsed, fontSize: fontSize ?? DEFAULT_SETTINGS.fontSize, fontSizeVersion: 2 };
        setSettings(next);
        if (legacy) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      /* ignore broken storage */
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeToPx(settings.fontSize)}px`;
    document.documentElement.style.setProperty("--fs", String(fontSizeScale(settings.fontSize)));
    document.documentElement.dataset.fontSize = String(settings.fontSize);
  }, [settings.fontSize]);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const addCategory = useCallback((name: string) => {
    const clean = name.trim().slice(0, 12);
    if (!clean) return;
    setSettings((current) => {
      const next = {
        ...current,
        hiddenCategories: current.hiddenCategories.filter((item) => item !== clean),
        customCategories: current.customCategories.includes(clean) ? current.customCategories : [...current.customCategories, clean],
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /** A16: 지운 분류는 목록에서 사라집니다 — 기본 업무·개인·공부도 지울 수 있습니다. */
  const removeCategory = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setSettings((current) => {
      const next = {
        ...current,
        customCategories: current.customCategories.filter((item) => item !== clean),
        hiddenCategories: current.hiddenCategories.includes(clean) ? current.hiddenCategories : [...current.hiddenCategories, clean],
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ settings, set, addCategory, removeCategory, reset }), [settings, set, addCategory, removeCategory, reset]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
