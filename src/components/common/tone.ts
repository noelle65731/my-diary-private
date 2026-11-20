import type { ArchiveKind, CalendarCategory, TaskCategory, TaskStatus } from "@/lib/types";

export interface Tone {
  text: string;
  bg: string;
  border: string;
  dot: string;
  soft: string;
}

export const CATEGORY_TONES: Record<CalendarCategory, Tone> = {
  개인: {
    text: "text-sage-500",
    bg: "bg-sage-100",
    border: "border-sage-200",
    dot: "bg-sage-400",
    soft: "bg-sage-50",
  },
  외부일정: {
    text: "text-ink-700",
    bg: "bg-paper-200",
    border: "border-paper-400",
    dot: "bg-ink-500",
    soft: "bg-paper-100",
  },
  성과: {
    text: "text-accent-600",
    bg: "bg-accent-100",
    border: "border-accent-200",
    dot: "bg-accent-400",
    soft: "bg-accent-50",
  },
  휴먼네트워크: {
    text: "text-dusk-500",
    bg: "bg-dusk-100",
    border: "border-dusk-100",
    dot: "bg-dusk-300",
    soft: "bg-dusk-100",
  },
};

export const TASK_TONES: Record<TaskCategory, Tone> = {
  업무: {
    text: "text-accent-600",
    bg: "bg-accent-100",
    border: "border-accent-200",
    dot: "bg-accent-400",
    soft: "bg-accent-50",
  },
  개인: {
    text: "text-sage-500",
    bg: "bg-sage-100",
    border: "border-sage-200",
    dot: "bg-sage-400",
    soft: "bg-sage-50",
  },
  공부: {
    text: "text-dusk-500",
    bg: "bg-dusk-100",
    border: "border-dusk-100",
    dot: "bg-dusk-300",
    soft: "bg-dusk-100",
  },
};

export const STATUS_TONES: Record<TaskStatus, Tone> = {
  미완료: {
    text: "text-ink-600",
    bg: "bg-paper-200",
    border: "border-paper-300",
    dot: "bg-ink-400",
    soft: "bg-paper-100",
  },
  "대기 중": {
    text: "text-amber-700",
    bg: "bg-amber-100",
    border: "border-amber-200",
    dot: "bg-amber-400",
    soft: "bg-amber-50",
  },
  완료: {
    text: "text-sage-500",
    bg: "bg-sage-100",
    border: "border-sage-200",
    dot: "bg-sage-400",
    soft: "bg-sage-50",
  },
  취소: {
    text: "text-ink-400",
    bg: "bg-paper-100",
    border: "border-paper-300",
    dot: "bg-paper-400",
    soft: "bg-paper-50",
  },
};

export const ARCHIVE_TONES: Record<ArchiveKind, Tone> = {
  메모: {
    text: "text-ink-700",
    bg: "bg-paper-200",
    border: "border-paper-400",
    dot: "bg-ink-500",
    soft: "bg-paper-100",
  },
  책: {
    text: "text-accent-600",
    bg: "bg-accent-100",
    border: "border-accent-200",
    dot: "bg-accent-400",
    soft: "bg-accent-50",
  },
  영화: {
    text: "text-dusk-500",
    bg: "bg-dusk-100",
    border: "border-dusk-100",
    dot: "bg-dusk-300",
    soft: "bg-dusk-100",
  },
  레퍼런스: {
    text: "text-sage-500",
    bg: "bg-sage-100",
    border: "border-sage-200",
    dot: "bg-sage-400",
    soft: "bg-sage-50",
  },
  읽을거리: {
    text: "text-amber-700",
    bg: "bg-amber-100",
    border: "border-amber-200",
    dot: "bg-amber-400",
    soft: "bg-amber-50",
  },
};

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
