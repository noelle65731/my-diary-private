"use client";

import { useMemo } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { BASE_CATEGORIES, isLegacyCalendarCategory, currentCalendarCategory, TASK_CATEGORIES } from "@/lib/types";

/**
 * A16: one 분류 list for the whole app — 업무·개인·공부 first, then the ones the user
 * made (in 만들어진 순서), then any 이름 a record already carries. Removed ones stay out.
 */
export function mergeCategories(custom: string[] = [], used: string[] = [], hidden: string[] = []): string[] {
  const out: string[] = [];
  const add = (name: string | null | undefined) => {
    const clean = (name ?? "").trim();
    if (!clean || out.includes(clean) || hidden.includes(clean)) return;
    out.push(clean);
  };
  for (const base of BASE_CATEGORIES) add(base);
  for (const name of custom) add(name);
  for (const name of [...used].sort((a, b) => a.localeCompare(b, "ko"))) add(name);
  return out;
}

/**
 * A16: every 분류 the routine/task/event pickers and the top filters share.
 * Adding one anywhere writes it to the settings store, so all of them update at once.
 */
export function useCategoryOptions(): string[] {
  const { data } = useData();
  const { settings } = useSettings();
  const custom = settings.customCategories;
  const hidden = settings.hiddenCategories;

  return useMemo(() => {
    const used: string[] = [];
    for (const task of data.projects) {
      if (!task.trash && task.category) used.push(task.category);
    }
    for (const routine of data.routines) {
      if (!routine.trash && routine.category) used.push(routine.category);
    }
    for (const event of data.calendar) {
      if (event.trash || !event.category) continue;
      used.push(isLegacyCalendarCategory(event.category) ? currentCalendarCategory(event.category) : event.category);
    }
    return mergeCategories(custom, used, hidden);
  }, [custom, hidden, data.projects, data.routines, data.calendar]);
}

