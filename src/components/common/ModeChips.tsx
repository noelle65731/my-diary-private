"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ModeFilter } from "@/lib/types";
import { PlusIcon } from "@/components/icons";

export interface ModeChipsProps {
  mode: ModeFilter;
  onChange: (mode: ModeFilter) => void;
  /** 업무·개인·공부 plus the categories the user added (A7). */
  categories: string[];
  /** 주간 화면 only: shows the 맞춤 chip. */
  showCustom?: boolean;
  onAddCategory?: (name: string) => void;
}

const BASE = [{ value: "all", label: "전체" }] as const;

/** A6: 전체(all) · NOW · 분류 · 주간 맞춤(custom) chips, shared by both tabs. */
export function ModeChips({ mode, onChange, categories, showCustom, onAddCategory }: ModeChipsProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const name = draft.trim();
    if (name && onAddCategory) onAddCategory(name);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {BASE.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          aria-label={item.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-medium transition",
            mode === item.value ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
          )}
        >
          {/* A10: NOW is written once — no lowercase duplicate next to it. */}
          {item.label}
        </button>
      ))}
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onChange(category)}
          className={cn(
            "rounded-full px-3 py-1 text-[15px] font-medium transition",
            mode === category ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
          )}
        >
          {category}
        </button>
      ))}
      {showCustom ? (
        <button
          type="button"
          onClick={() => onChange("custom")}
          className={cn(
            "rounded-full px-3 py-1 text-[15px] font-medium transition",
            mode === "custom" ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
          )}
        >
          맞춤
        </button>
      ) : null}
      {onAddCategory ? (
        adding ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 ring-1 ring-paper-400">
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
                if (event.key === "Escape") setAdding(false);
              }}
              onBlur={submit}
              placeholder="분류 이름"
              aria-label="새 분류 이름"
              className="w-[6.5rem] bg-transparent text-[14.5px] outline-none"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition hover:bg-paper-200 hover:text-ink-700"
            aria-label="분류 추가"
            title="분류 추가"
          >
            <PlusIcon size={12} />
          </button>
        )
      ) : null}
    </div>
  );
}
