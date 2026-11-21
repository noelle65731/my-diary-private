import type { ArchiveKind, CalendarCategory, TaskCategory, TaskStatus } from "@/lib/types";

export interface Tone {
  text: string;
  bg: string;
  border: string;
  dot: string;
  soft: string;
  /** stronger accent used for checkboxes / heatmap tiles */
  solid: string;
  solidText: string;
}

export const CATEGORY_TONES: Record<CalendarCategory, Tone> = {
  개인: {
    text: "text-accent-600",
    bg: "bg-accent-100",
    border: "border-accent-200",
    dot: "bg-accent-400",
    soft: "bg-accent-50",
    solid: "bg-accent-400",
    solidText: "text-white",
  },
  외부일정: {
    text: "text-sky-600",
    bg: "bg-sky-100",
    border: "border-sky-200",
    dot: "bg-sky-500",
    soft: "bg-sky-50",
    solid: "bg-sky-500",
    solidText: "text-white",
  },
  성과: {
    text: "text-amber-700",
    bg: "bg-amber-100",
    border: "border-amber-200",
    dot: "bg-amber-400",
    soft: "bg-amber-50",
    solid: "bg-amber-400",
    solidText: "text-white",
  },
  휴먼네트워크: {
    text: "text-dusk-600",
    bg: "bg-dusk-100",
    border: "border-dusk-100",
    dot: "bg-dusk-500",
    soft: "bg-dusk-100/60",
    solid: "bg-dusk-500",
    solidText: "text-white",
  },
};

export const TASK_TONES: Record<TaskCategory, Tone> = {
  업무: {
    text: "text-accent-600",
    bg: "bg-accent-100",
    border: "border-accent-200",
    dot: "bg-accent-400",
    soft: "bg-accent-50",
    solid: "bg-accent-400",
    solidText: "text-white",
  },
  개인: {
    text: "text-sage-500",
    bg: "bg-sage-100",
    border: "border-sage-200",
    dot: "bg-sage-400",
    soft: "bg-sage-50",
    solid: "bg-sage-400",
    solidText: "text-white",
  },
  공부: {
    text: "text-dusk-600",
    bg: "bg-dusk-100",
    border: "border-dusk-100",
    dot: "bg-dusk-500",
    soft: "bg-dusk-100/60",
    solid: "bg-dusk-500",
    solidText: "text-white",
  },
};

export const STATUS_TONES: Record<TaskStatus, Tone> = {
  미완료: {
    text: "text-ink-600",
    bg: "bg-paper-200",
    border: "border-paper-300",
    dot: "bg-ink-400",
    soft: "bg-paper-200/60",
    solid: "bg-ink-500",
    solidText: "text-white",
  },
  "대기 중": {
    text: "text-amber-700",
    bg: "bg-amber-100",
    border: "border-amber-200",
    dot: "bg-amber-400",
    soft: "bg-amber-50",
    solid: "bg-amber-400",
    solidText: "text-white",
  },
  완료: {
    text: "text-sage-500",
    bg: "bg-sage-100",
    border: "border-sage-200",
    dot: "bg-sage-400",
    soft: "bg-sage-50",
    solid: "bg-sage-400",
    solidText: "text-white",
  },
  취소: {
    text: "text-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-200",
    dot: "bg-rose-300",
    soft: "bg-rose-50",
    solid: "bg-rose-300",
    solidText: "text-white",
  },
};

export const ARCHIVE_TONES: Record<ArchiveKind, Tone> = {
  메모: {
    text: "text-ink-600",
    bg: "bg-paper-200",
    border: "border-paper-300",
    dot: "bg-ink-500",
    soft: "bg-paper-200/60",
    solid: "bg-ink-500",
    solidText: "text-white",
  },
  책: {
    text: "text-amber-700",
    bg: "bg-amber-100",
    border: "border-amber-200",
    dot: "bg-amber-400",
    soft: "bg-amber-50",
    solid: "bg-amber-400",
    solidText: "text-white",
  },
  영화: {
    text: "text-accent-600",
    bg: "bg-accent-100",
    border: "border-accent-200",
    dot: "bg-accent-400",
    soft: "bg-accent-50",
    solid: "bg-accent-400",
    solidText: "text-white",
  },
  레퍼런스: {
    text: "text-sky-600",
    bg: "bg-sky-100",
    border: "border-sky-200",
    dot: "bg-sky-500",
    soft: "bg-sky-50",
    solid: "bg-sky-500",
    solidText: "text-white",
  },
  읽을거리: {
    text: "text-sage-500",
    bg: "bg-sage-100",
    border: "border-sage-200",
    dot: "bg-sage-400",
    soft: "bg-sage-50",
    solid: "bg-sage-400",
    solidText: "text-white",
  },
};

export type PriorityKey = "긴급·중요" | "중요" | "긴급" | "기타";

export const PRIORITY_TONES: Record<PriorityKey, { badge: string; label: string; accent: string }> = {
  "긴급·중요": { badge: "bg-red-100 text-red-600", label: "긴급·중요", accent: "text-red-600" },
  중요: { badge: "bg-blue-100 text-blue-600", label: "중요", accent: "text-blue-600" },
  긴급: { badge: "bg-amber-100 text-amber-700", label: "긴급", accent: "text-amber-700" },
  기타: { badge: "bg-paper-200 text-ink-500", label: "기타", accent: "text-ink-500" },
};

export function priorityOf(task: { urgent: boolean; important: boolean }): PriorityKey {
  if (task.urgent && task.important) return "긴급·중요";
  if (task.important) return "중요";
  if (task.urgent) return "긴급";
  return "기타";
}

export function categoryTone(category: CalendarCategory): Tone {
  return CATEGORY_TONES[category] ?? CATEGORY_TONES["개인"];
}

export function taskTone(category: TaskCategory): Tone {
  return TASK_TONES[category] ?? TASK_TONES["개인"];
}

export function statusTone(status: TaskStatus): Tone {
  return STATUS_TONES[status] ?? STATUS_TONES["미완료"];
}

export function archiveTone(kind: ArchiveKind): Tone {
  return ARCHIVE_TONES[kind] ?? ARCHIVE_TONES["메모"];
}

/** Rotating accent for routine rows (blue · green · violet · amber · pink). */
export const ROUTINE_TONES: { solid: string; ring: string; soft: string; text: string; dot: string }[] = [
  { solid: "bg-sky-500 border-sky-500", ring: "border-sky-500", soft: "bg-sky-100", text: "text-sky-600", dot: "bg-sky-500" },
  { solid: "bg-sage-400 border-sage-400", ring: "border-sage-400", soft: "bg-sage-100", text: "text-sage-500", dot: "bg-sage-400" },
  { solid: "bg-dusk-500 border-dusk-500", ring: "border-dusk-500", soft: "bg-dusk-100", text: "text-dusk-600", dot: "bg-dusk-500" },
  { solid: "bg-amber-400 border-amber-400", ring: "border-amber-400", soft: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-400" },
  { solid: "bg-accent-400 border-accent-400", ring: "border-accent-400", soft: "bg-accent-100", text: "text-accent-600", dot: "bg-accent-400" },
];

export function routineTone(index: number) {
  return ROUTINE_TONES[index % ROUTINE_TONES.length]!;
}

/** Project colours used inline next to a task title (like the reference). */
export const PROJECT_ICONS = ["🍊", "🎨", "📮", "📚", "🏠", "🧩", "🗂️", "🌱"];

export function projectEmoji(seed: string, category: TaskCategory): string {
  // stable per-project glyph so cards keep their identity between renders
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  const fallback = category === "업무" ? 1 : category === "공부" ? 3 : 0;
  return PROJECT_ICONS[(hash + fallback) % PROJECT_ICONS.length]!;
}
