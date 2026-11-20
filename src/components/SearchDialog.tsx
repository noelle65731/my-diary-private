"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useUi } from "@/state/ui";
import { Modal } from "@/components/common/primitives";
import { SearchIcon } from "@/components/icons";
import { cn, truncate } from "@/lib/utils";
import { formatShort, weekdayKo } from "@/lib/date";
import type { AnyItem, Resource } from "@/lib/types";

interface Result {
  resource: Resource;
  badge: string;
  item: AnyItem;
  date: string | null;
  snippet: string;
}

function dateOf(resource: Resource, item: AnyItem): string | null {
  if (resource === "calendar") return (item as { date?: string }).date ?? null;
  if (resource === "projects") {
    const task = item as { date?: string | null; due?: string | null };
    return task.date ?? task.due ?? null;
  }
  if (resource === "routines") return (item as { date?: string | null }).date ?? null;
  return (item as { date?: string | null }).date ?? null;
}

export function SearchDialog() {
  const { searchOpen, setSearchOpen, openItem } = useUi();
  const { data } = useData();
  const [query, setQuery] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setCursor(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
    setQuery("");
  }, [searchOpen]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];
    const usable = (item: AnyItem) => !item.trash && (includeHidden || !item.hidden);

    const push = (resource: Resource, badge: string, items: AnyItem[]) => {
      for (const item of items) {
        if (!usable(item)) continue;
        if (q && !`${item.title} ${item.memo}`.toLowerCase().includes(q)) continue;
        const body = (item as { body?: string }).body ?? "";
        const text = item.memo || body;
        out.push({
          resource,
          badge,
          item,
          date: dateOf(resource, item),
          snippet: text ? truncate(text, 70) : "",
        });
      }
    };

    push("calendar", "일정", data.calendar.filter((item) => item.kind === "일정"));
    push("calendar", "주간 목표", data.calendar.filter((item) => item.kind === "주간 목표"));
    push("calendar", "주간 메모", data.calendar.filter((item) => item.kind === "주간 메모" || item.kind === "월간 메모"));
    push("projects", "프로젝트", data.projects.filter((item) => item.kind === "프로젝트"));
    push("projects", "할 일", data.projects.filter((item) => item.kind === "할 일"));
    push("routines", "루틴", data.routines.filter((item) => item.kind === "루틴"));
    push("binder", "일기", data.binder.filter((item) => item.kind === "일기"));
    push("binder", "노트", data.binder.filter((item) => item.kind === "노트"));
    push("archive", "아카이브", data.archive);

    if (!q) {
      return out
        .slice()
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .slice(0, 24);
    }
    return out.slice(0, 40);
  }, [data, includeHidden, query]);

  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  const choose = (result: Result | undefined) => {
    if (!result) return;
    openItem(result.resource, result.item.id);
    setSearchOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((current) => Math.min(results.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[cursor]);
    }
  };

  return (
    <Modal
      open={searchOpen}
      onClose={() => setSearchOpen(false)}
      title="검색"
      subtitle="제목과 메모를 함께 찾습니다"
      size="lg"
      bodyClassName="!px-0 !py-0"
    >
      <div className="border-b border-paper-300/70 px-4 py-3">
        <div className="relative">
          <SearchIcon size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="일정, 할 일, 일기, 아카이브…"
            className="input pl-9"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-[0.72rem] text-ink-500">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(event) => setIncludeHidden(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-paper-400 accent-ink-900"
            />
            숨긴 항목까지 검색
          </label>
          <span className="text-[0.68rem] text-ink-400">↑↓ 이동 · Enter 열기</span>
        </div>
      </div>

      <div className="max-h-[52vh] overflow-y-auto py-1">
        {results.length === 0 ? (
          <p className="px-4 py-10 text-center text-[0.82rem] text-ink-500">
            {query.trim() ? "찾는 기록이 없습니다." : "최근 기록이 없습니다."}
          </p>
        ) : (
          results.map((result, index) => (
            <button
              key={`${result.resource}-${result.item.id}`}
              type="button"
              onClick={() => choose(result)}
              onMouseEnter={() => setCursor(index)}
              className={cn(
                "flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition",
                index === cursor ? "bg-paper-200/70" : "hover:bg-paper-100",
              )}
            >
              <span className="mt-0.5 flex-none rounded-md border border-paper-300 bg-white/80 px-1.5 py-0.5 text-[0.62rem] font-medium text-ink-500">
                {result.badge}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.86rem] font-medium text-ink-900">{result.item.title}</span>
                {result.snippet ? <span className="mt-0.5 block truncate text-[0.72rem] text-ink-500">{result.snippet}</span> : null}
              </span>
              {result.date ? (
                <span className="flex-none text-[0.7rem] text-ink-400">
                  {formatShort(result.date)} {weekdayKo(result.date)}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
