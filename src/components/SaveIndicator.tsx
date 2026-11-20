"use client";

import { useEffect, useState } from "react";
import { useData } from "@/state/store";
import { cn } from "@/lib/utils";

export function SaveIndicator({ compact = false }: { compact?: boolean }) {
  const { savingCount, saveError, lastSavedAt, demo } = useData();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!lastSavedAt) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [lastSavedAt]);

  if (saveError) {
    return (
      <span
        title={saveError}
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[0.68rem] font-medium text-rose-600"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        {compact ? "실패" : "저장 실패"}
      </span>
    );
  }

  if (savingCount > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-200/70 px-2.5 py-1 text-[0.68rem] font-medium text-ink-600">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
        {compact ? "저장" : "저장 중"}
      </span>
    );
  }

  if (demo) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[0.68rem] font-medium text-amber-700 sm:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        데모
      </span>
    );
  }

  if (flash) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 px-1 text-[0.68rem] font-medium text-ink-500 transition-opacity")}>
        <span className="h-1.5 w-1.5 rounded-full bg-sage-400" />
        저장됨
      </span>
    );
  }

  return null;
}
