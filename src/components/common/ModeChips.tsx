"use client";

import { useEffect, useRef, useState } from "react";
import { cn, categoryModeOf, categoryNameOf } from "@/lib/utils";
import type { ModeFilter } from "@/lib/types";
import { PlusIcon } from "@/components/icons";
import { CATEGORY_COLOR_CHOICES, useCategoryColors } from "@/state/category-colors";

export interface ModeChipsProps {
  mode: ModeFilter;
  onChange: (mode: ModeFilter) => void;
  /** 업무·개인·공부 plus the categories the user added (A7). */
  categories: string[];
  /** 주간 화면 only: shows the 맞춤 chip. */
  showCustom?: boolean;
  onAddCategory?: (name: string) => void;
  /** A16: a long press (or right click) offers 지우기 for that 분류. */
  onRemoveCategory?: (name: string) => void;
}

const BASE = [{ value: "all", label: "전체" }] as const;

/** A6: 전체(all) · NOW · 분류 · 주간 맞춤(custom) chips, shared by both tabs. */
export function ModeChips({ mode, onChange, categories, showCustom, onAddCategory, onRemoveCategory }: ModeChipsProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  /** A16: which 분류 is waiting for a 지우기 confirmation. A19: its 색깔도 여기서 바로 고릅니다. */
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const { colorOf, setColor } = useCategoryColors();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  const startPress = (name: string) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      setRemoveTarget(name);
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const submit = () => {
    const name = draft.trim();
    if (name && onAddCategory) onAddCategory(name);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-mode-chips="true">
      {BASE.map((item) => (
        <button
          key={item.value}
          type="button"
          data-mode-chip={item.value}
          onClick={() => onChange(item.value)}
          aria-label={item.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[calc(15px*var(--fs))] font-medium transition",
            mode === item.value ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
          )}
        >
          {/* A10: NOW is written once — no lowercase duplicate next to it. */}
          {item.label}
        </button>
      ))}
      {categories.map((category) => {
        const value = categoryModeOf(category);
        const active = mode === value;
        if (removeTarget === category) {
          const current = colorOf(category);
          return (
            <span
              key={category}
              data-category-color-panel={category}
              className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-paper-300 bg-white px-2 py-1.5"
            >
              <span className="mr-1 text-[calc(13.5px*var(--fs))] font-medium text-ink-700">{category} 색깔</span>
              {CATEGORY_COLOR_CHOICES.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  data-category-color={`${category}:${choice.key}`}
                  aria-label={`${category} ${choice.label}`}
                  aria-pressed={current === choice.key}
                  title={choice.label}
                  onClick={() => setColor(category, choice.key)}
                  className={cn(
                    "h-5 w-5 rounded-full transition",
                    choice.swatch,
                    current === choice.key ? "ring-2 ring-ink-900 ring-offset-1" : "hover:scale-110",
                  )}
                />
              ))}
              {onRemoveCategory ? (
                <button
                  type="button"
                  onClick={() => {
                    onRemoveCategory(category);
                    setRemoveTarget(null);
                  }}
                  className="ml-1 rounded-full bg-rose-50 px-2 py-0.5 text-[calc(13px*var(--fs))] font-medium text-rose-600 transition hover:bg-rose-100"
                  aria-label={`${category} 분류 지우기`}
                >
                  지우기
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="rounded-full px-1 text-[calc(13px*var(--fs))] text-ink-400 hover:text-ink-700"
                aria-label="지우기 취소"
              >
                닫기
              </button>
            </span>
          );
        }
        return (
          <button
            key={category}
            type="button"
            data-mode-chip={value}
            onClick={() => onChange(value)}
            onPointerDown={() => startPress(category)}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            onContextMenu={(event) => {
              event.preventDefault();
              setRemoveTarget(category);
            }}
            title="길게 누르면 이 분류의 색깔을 고르거나 지울 수 있어요"
            className={cn(
              "rounded-full px-3 py-1 text-[calc(15px*var(--fs))] font-medium transition",
              active ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
            )}
          >
            {category}
          </button>
        );
      })}
      {showCustom ? (
        <button
          type="button"
          onClick={() => onChange("custom")}
          className={cn(
            "rounded-full px-3 py-1 text-[calc(15px*var(--fs))] font-medium transition",
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
              className="w-[6.5rem] bg-transparent text-[calc(14.5px*var(--fs))] outline-none"
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
