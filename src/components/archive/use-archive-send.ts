"use client";

/**
 * A51: 아카이브 메모를 다이어리로 보내기.
 *
 * 카드 메뉴나 상세 화면의 단추 하나로 그 메모를 `프로젝트 · 할 일`의 할 일로, 또는
 * 캘린더의 일정으로 만듭니다. 메모는 그대로 두고 새 항목을 하나 더 만드는 방식이라,
 * 보낸 뒤에도 원래 기록은 아카이브에 남습니다.
 */

import { useCallback } from "react";
import { useData } from "@/state/store";
import { useUi } from "@/state/ui";
import { todayISO } from "@/lib/date";
import { plainBodyText } from "@/lib/archive-card";
import type { ArchiveEntry } from "@/lib/types";

function titleOf(item: ArchiveEntry): string {
  const title = (item.title ?? "").trim();
  if (title) return title;
  const text = plainBodyText(item.body);
  return text ? text.slice(0, 40) : "아카이브 메모";
}

function memoOf(item: ArchiveEntry): string {
  const text = plainBodyText(item.body);
  return text.slice(0, 500);
}

export function useArchiveSend() {
  const { create } = useData();
  const { notify } = useUi();

  const toTask = useCallback(
    async (item: ArchiveEntry) => {
      const created = await create("projects", {
        title: titleOf(item),
        kind: "할 일",
        category: "개인",
        date: item.date ?? todayISO(),
        memo: memoOf(item),
      });
      if (created) notify("할 일로 보냈습니다 · 프로젝트 탭", "success");
    },
    [create, notify],
  );

  const toEvent = useCallback(
    async (item: ArchiveEntry) => {
      const created = await create("calendar", {
        title: titleOf(item),
        kind: "일정",
        category: "개인",
        date: item.date ?? todayISO(),
        memo: memoOf(item),
      });
      if (created) notify("일정으로 보냈습니다 · 캘린더", "success");
    },
    [create, notify],
  );

  return { toTask, toEvent };
}
