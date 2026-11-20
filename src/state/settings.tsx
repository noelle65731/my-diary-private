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
  /** 1–6, scales the whole app. */
  fontSize: number;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  weekStartHour: number;
  weekEndHour: number;
  allDayCollapse: number;
  calendarDefaultView: CalendarViewKey;
  calendarShowHidden: boolean;
  projectTaskPreview: number;
  showCompletedTasks: boolean;
  binderPreviewLines: number;
  binderShowSchedule: boolean;
  archiveDefaultCategory: "전체" | ArchiveKind;
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 3,
  weekStartsOn: 1,
  showWeekends: true,
  weekStartHour: 9,
  weekEndHour: 19,
  allDayCollapse: 3,
  calendarDefaultView: "week",
  calendarShowHidden: false,
  projectTaskPreview: 4,
  showCompletedTasks: true,
  binderPreviewLines: 3,
  binderShowSchedule: true,
  archiveDefaultCategory: "전체",
};

const STORAGE_KEY = "my-diary:settings:v1";

interface SettingsContextValue {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Step 3 is the default and equals the `html { font-size: 15px }` baseline in
 * globals.css, so a stored setting never shifts text size on hydration.
 */
function fontSizeToPx(level: number): number {
  const clamped = Math.max(1, Math.min(6, level));
  return 13.2 + (clamped - 1) * 0.9;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {
      /* ignore broken storage */
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeToPx(settings.fontSize)}px`;
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

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ settings, set, reset }), [settings, set, reset]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
