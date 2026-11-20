import type { ModeFilter, ProjectTask } from "./types";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function byDateThenTime<T extends { sort?: number | null }>(a: T, b: T): number {
  return (a.sort ?? 0) - (b.sort ?? 0);
}

/** `업무` / `개인` / `공부` mode of a task — used by the mode filters. */
export function taskMode(task: ProjectTask): "업무" | "개인" | "공부" {
  return task.category;
}

export function matchesMode(
  mode: ModeFilter,
  item: { hidden: boolean; trash: boolean },
  categoryMode: string,
): boolean {
  if (item.trash) return false;
  // A6: `전체` is the default on every device and shows everything, hidden included.
  if (mode === "all") return true;
  // A6: NOW hides only the items marked with the eye icon (개인 is never auto-hidden).
  if (item.hidden) return false;
  if (mode === "now" || mode === "custom") return true;
  return categoryMode === mode;
}

export function sortByDate<T>(items: T[], get: (item: T) => string | null): T[] {
  return [...items].sort((a, b) => {
    const av = get(a) ?? "9999-12-31";
    const bv = get(b) ?? "9999-12-31";
    return av.localeCompare(bv);
  });
}

export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function softColor(seed: string): string {
  const palette = [
    "bg-accent-100 text-accent-600",
    "bg-sage-100 text-sage-500",
    "bg-dusk-100 text-dusk-500",
    "bg-paper-200 text-ink-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-600",
    "bg-sky-100 text-sky-700",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return palette[hash % palette.length] ?? palette[0]!;
}

export function uid(prefix = "tmp"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
