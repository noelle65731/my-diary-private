"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { Modal } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { differingKeys } from "@/lib/diff";

const LABELS: Record<string, string> = {
  title: "제목",
  kind: "유형",
  category: "분류",
  status: "상태",
  date: "날짜",
  due: "마감일",
  memo: "기타",
  body: "본문",
  rating: "별점",
  tags: "태그",
  urgent: "긴급",
  important: "중요",
  hidden: "숨김",
  history: "History",
  projectIds: "연결 프로젝트",
  photos: "사진",
  startTime: "시작",
  endTime: "종료",
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(비어 있음)";
  if (typeof value === "boolean") return value ? "켜짐" : "꺼짐";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(비어 있음)";
  return String(value);
}

/**
 * B3: when Notion already holds a newer edit, both values are shown next to each other
 * and the user picks one. Nothing is overwritten until they choose.
 */
export function ConflictDialog() {
  const { conflict, resolveConflict } = useData();
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  const keys = differingKeys(conflict.local, conflict.current).slice(0, 8);
  // Both sides already hold the same values: nothing to choose, so no sheet.
  if (keys.length === 0) return null;

  const choose = async (keepMine: boolean) => {
    setBusy(true);
    await resolveConflict(keepMine);
    setBusy(false);
  };

  return (
    <Modal open onClose={() => void choose(false)} title="동시 수정" subtitle="다른 곳에서 먼저 바뀐 항목입니다" size="lg">
      <p className="mb-3 text-[0.78rem] leading-relaxed text-ink-600">
        두 값을 나란히 보여 드립니다. 고른 쪽으로 저장되고, 다른 쪽은 사라집니다.
      </p>
      <div className="overflow-hidden rounded-xl border border-paper-300">
        <div className="grid grid-cols-[7rem_1fr_1fr] gap-2 border-b border-paper-300 bg-paper-100/70 px-3 py-1.5 text-[0.68rem] font-medium text-ink-500">
          <span>항목</span>
          <span>내가 고친 값</span>
          <span>Notion의 값</span>
        </div>
        {keys.map((key) => (
          <div key={key} className="grid grid-cols-[7rem_1fr_1fr] gap-2 border-b border-paper-300/70 px-3 py-1.5 text-[0.74rem] last:border-b-0">
            <span className="text-ink-400">{LABELS[key] ?? key}</span>
            <span className="break-words text-ink-900">{show((conflict.local as unknown as Record<string, unknown>)[key])}</span>
            <span className="break-words text-ink-600">{show((conflict.current as unknown as Record<string, unknown>)[key])}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => void choose(false)} className={cn("btn-outline btn-sm")}>
          Notion의 값 사용
        </button>
        <button type="button" disabled={busy} onClick={() => void choose(true)} className="btn-primary btn-sm">
          내 값으로 저장
        </button>
      </div>
    </Modal>
  );
}
