"use client";

import { useMemo, useState } from "react";
import { useData } from "@/state/store";
import { useUi } from "@/state/ui";
import { ConfirmDialog, EmptyState, Modal } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { formatShort, weekdayKo } from "@/lib/date";
import type { AnyItem, Resource } from "@/lib/types";
import { TrashIcon } from "@/components/icons";

/**
 * P0-1: 웹 휴지통 — 캘린더 일정, 프로젝트 할 일, 루틴, 바인더, 아카이브에서 삭제한
 * 기록을 한곳에서 보고 바로 복원하거나 완전 삭제합니다. 복원은 `휴지통=false` 저장이라
 * 새로고침 없이 목록에 바로 되돌아옵니다.
 */

const FILTERS: { key: Resource | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "calendar", label: "일정" },
  { key: "projects", label: "할 일" },
  { key: "routines", label: "루틴" },
  { key: "binder", label: "바인더" },
  { key: "archive", label: "아카이브" },
];

function badgeOf(resource: Resource, item: AnyItem): string {
  if (resource === "calendar") return (item as { kind?: string }).kind ?? "일정";
  if (resource === "projects") return (item as { kind?: string }).kind ?? "할 일";
  if (resource === "routines") return "루틴";
  if (resource === "binder") return (item as { kind?: string }).kind ?? "일기";
  return (item as { kind?: string }).kind ?? "메모";
}

function dateOf(resource: Resource, item: AnyItem): string | null {
  if (resource === "projects") {
    const task = item as { date?: string | null; due?: string | null; doneAt?: string | null };
    return task.date ?? task.due ?? null;
  }
  return (item as { date?: string | null }).date ?? null;
}

export function TrashDialog() {
  const { data, update, destroy } = useData();
  const { trashFilter, closeTrash, openTrash, notify } = useUi();
  const [confirm, setConfirm] = useState<{ resource: Resource; item: AnyItem } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => {
    const out: { resource: Resource; item: AnyItem }[] = [];
    for (const resource of ["calendar", "projects", "routines", "binder", "archive"] as Resource[]) {
      if (trashFilter && trashFilter !== "all" && trashFilter !== resource) continue;
      for (const item of data[resource] as AnyItem[]) {
        if (item.trash === true) out.push({ resource, item });
      }
    }
    return out.sort((a, b) => (dateOf(b.resource, b.item) ?? "").localeCompare(dateOf(a.resource, a.item) ?? ""));
  }, [data, trashFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: 0 };
    for (const resource of ["calendar", "projects", "routines", "binder", "archive"] as Resource[]) {
      const n = (data[resource] as AnyItem[]).filter((item) => item.trash === true).length;
      map[resource] = n;
      map.all = (map.all ?? 0) + n;
    }
    return map;
  }, [data]);

  if (!trashFilter) return null;

  const restore = async (resource: Resource, item: AnyItem) => {
    setBusy(`${resource}:${item.id}`);
    const ok = await update(resource, item.id, { trash: false });
    setBusy(null);
    if (ok) notify(`‘${item.title}’을(를) 복원했습니다.`, "success");
  };

  const remove = async (resource: Resource, item: AnyItem) => {
    setBusy(`${resource}:${item.id}`);
    await destroy(resource, item.id);
    setBusy(null);
    notify(`‘${item.title}’을(를) 완전히 삭제했습니다.`, "success");
  };

  return (
    <>
      <Modal
        open
        onClose={closeTrash}
        title="휴지통"
        subtitle="삭제한 기록은 여기서 바로 되살릴 수 있습니다"
        size="lg"
        bodyClassName="!px-0 !py-0"
      >
        <div className="flex flex-wrap items-center gap-1.5 border-b border-paper-300/70 px-4 py-2.5">
          {FILTERS.map((filter) => {
            const active = (trashFilter ?? "all") === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => openTrash(filter.key)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.74rem] font-medium transition",
                  active ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
                )}
              >
                {filter.label}
                {counts[filter.key] ? (
                  <span className={cn("text-[0.64rem]", active ? "text-white/70" : "text-ink-400")}>{counts[filter.key]}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="max-h-[56vh] overflow-y-auto">
          {groups.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={<TrashIcon size={22} />}
                title="휴지통이 비어 있습니다"
                description="일정·할 일·루틴·바인더·아카이브에서 삭제한 항목이 여기에 모입니다."
              />
            </div>
          ) : (
            <ul className="divide-y divide-paper-300/60">
              {groups.map(({ resource, item }) => {
                const busyRow = busy === `${resource}:${item.id}`;
                const date = dateOf(resource, item);
                return (
                  <li key={`${resource}-${item.id}`} className="flex items-center gap-2.5 px-4 py-2.5">
                    <span className="flex-none rounded-md border border-paper-300 bg-white/80 px-1.5 py-0.5 text-[0.62rem] font-medium text-ink-500">
                      {badgeOf(resource, item)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.86rem] font-medium text-ink-900">{item.title}</span>
                      {date ? (
                        <span className="block text-[0.68rem] text-ink-400">
                          {formatShort(date)} {weekdayKo(date)}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      disabled={busyRow}
                      onClick={() => void restore(resource, item)}
                      className="flex-none rounded-full bg-ink-900 px-2.5 py-1 text-[0.72rem] font-medium text-white transition hover:bg-ink-800 disabled:opacity-50"
                    >
                      복원
                    </button>
                    <button
                      type="button"
                      disabled={busyRow}
                      onClick={() => setConfirm({ resource, item })}
                      className="flex-none rounded-full border border-paper-300 px-2.5 py-1 text-[0.72rem] text-ink-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                    >
                      완전 삭제
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="border-t border-paper-300/70 px-4 py-2 text-[0.68rem] text-ink-400">
          복원한 항목은 원래 화면과 Notion에 바로 되돌아갑니다. ‘완전 삭제’는 Notion 페이지까지 지웁니다.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="완전 삭제할까요?"
        description={confirm ? `‘${confirm.item.title}’을(를) Notion에서도 완전히 지웁니다. 되돌릴 수 없습니다.` : ""}
        confirmLabel="완전 삭제"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (target) void remove(target.resource, target.item);
        }}
      />
    </>
  );
}
