"use client";

import { useData } from "@/state/store";

/**
 * B3: stays out of the way — it appears only while a save is running, while saved
 * edits wait for the network, or when a save failed. No “저장됨” flash.
 */
export function SaveIndicator({ compact = false }: { compact?: boolean }) {
  const { savingCount, saveError, offlinePending } = useData();

  if (saveError) {
    return (
      <span
        title={saveError}
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[calc(14px*var(--fs))] font-medium text-rose-600"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        {compact ? "실패" : "저장 실패"}
      </span>
    );
  }

  if (savingCount > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-200/70 px-2.5 py-1 text-[calc(14px*var(--fs))] font-medium text-ink-600">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
        {compact ? "저장" : "저장 중"}
      </span>
    );
  }

  if (offlinePending > 0) {
    return (
      <span
        title="연결되면 자동으로 한 번만 저장됩니다"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[calc(14px*var(--fs))] font-medium text-amber-700"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        {compact ? `대기 ${offlinePending}` : `오프라인 · ${offlinePending}개 대기`}
      </span>
    );
  }

  return null;
}
