"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Portal, useOverlay } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronLeftIcon, XIcon } from "@/components/icons";

/* ─────────────────────────── A4: 상세 보기 껍데기 ─────────────────────────── */

/**
 * Reads as a page first: a back arrow steps one layer back (detail → list/drawer),
 * the X closes every layer that came with it. The backdrop counts as a step back.
 */
export function DetailShell({
  open,
  onBack,
  onClose,
  label,
  subtitle,
  sideBySide = false,
  footer,
  children,
}: {
  open: boolean;
  onBack: () => void;
  onClose: () => void;
  label: ReactNode;
  subtitle?: ReactNode;
  /** On a wide screen the right list stays usable, so the sheet only covers the centre. */
  sideBySide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useOverlay(open, onBack);
  /** A16: 모바일에서 상세 시트를 아래로 끌어내리면 닫힙니다(자동 저장은 onBack이 합니다). */
  const shellRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const onShellTouchStart = (event: React.TouchEvent) => {
    const scroller = shellRef.current?.querySelector<HTMLElement>("[data-sheet-scroll]");
    const atTop = !scroller || scroller.scrollTop <= 0;
    dragStart.current = atTop ? event.touches[0]?.clientY ?? null : null;
  };
  const onShellTouchMove = (event: React.TouchEvent) => {
    const start = dragStart.current;
    const current = event.touches[0]?.clientY;
    if (start === null || current === undefined) return;
    if (current - start > 60) {
      dragStart.current = null;
      onBack();
    }
  };
  if (!open) return null;

  return (
    <Portal>
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6",
          sideBySide && "lg:right-[544px] lg:z-30",
        )}
      >
        <button
          type="button"
          aria-label="바깥 클릭으로 이전"
          onClick={onBack}
          className="absolute inset-0 animate-fade-in bg-ink-900/25 backdrop-blur-[2px]"
        />
        <div
          ref={shellRef}
          role="dialog"
          aria-modal="true"
          aria-label={typeof label === "string" ? label : "상세"}
          className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-paper-300 bg-white shadow-lift animate-slide-up sm:max-w-2xl sm:animate-pop-in sm:rounded-3xl"
        >
          <header
            className="flex items-center gap-1 border-b border-paper-300/80 pl-1.5 pr-3 py-1.5"
            onTouchStart={onShellTouchStart}
            onTouchMove={onShellTouchMove}
            onTouchEnd={() => {
              dragStart.current = null;
            }}
          >
            <button type="button" onClick={onBack} className="icon-btn" aria-label="이전">
              <ChevronLeftIcon size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-ink-700">{label}</p>
              {subtitle ? <p className="truncate text-[13.5px] text-ink-400">{subtitle}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="전체 닫기" title="전체 닫기">
              <XIcon size={18} />
            </button>
          </header>
          <div data-sheet-scroll="true" className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-5">{children}</div>
          {footer ? (
            <div className="flex items-center justify-between gap-2 border-t border-paper-300/80 bg-paper-50/60 px-3 py-2 pb-safe">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

/* ─────────────────────── A4: 값 누르면 그 자리에서 수정 ─────────────────────── */

export function DetailSection({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-paper-300/70 py-2.5 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-medium tracking-[0.02em] text-ink-400">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function RequiredMark({ required, invalid }: { required?: boolean; invalid?: boolean }) {
  if (!required) return null;
  return (
    <span
      aria-label={invalid ? "필수값 누락" : "필수값"}
      className={cn("ml-0.5 align-top text-[0.8em]", invalid ? "font-bold text-rose-500" : "text-rose-400")}
    >
      *
    </span>
  );
}

export function InlineText({
  label,
  value,
  onChange,
  active,
  onActivate,
  onDone,
  placeholder,
  multiline = false,
  rows = 3,
  required,
  invalid,
  invalidMessage = "필수값을 입력해 주세요.",
  hint,
  display,
  type = "text",
  inputClassName,
  valueClassName,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  active: boolean;
  onActivate: () => void;
  onDone: () => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  required?: boolean;
  invalid?: boolean;
  invalidMessage?: string;
  hint?: string;
  display?: ReactNode;
  type?: "text" | "date" | "time";
  inputClassName?: string;
  valueClassName?: string;
  /** A16: 값이 있을 때 옆의 ×로 비웁니다 (마감일 지우기). */
  onClear?: () => void;
}) {
  return (
    <div className="py-0.5">
      <p className="flex items-center text-[13.5px] text-ink-400">
        {label}
        <RequiredMark required={required} invalid={invalid} />
      </p>
      {active ? (
        multiline ? (
          <textarea
            autoFocus
            rows={rows}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onDone}
            onKeyDown={(event) => {
              if (event.key === "Escape") onDone();
            }}
            placeholder={placeholder}
            aria-label={`${label} 입력`}
            className={cn("input mt-0.5 min-h-[62px] resize-y leading-relaxed", invalid && "border-rose-400", inputClassName)}
          />
        ) : (
          <input
            autoFocus
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onDone}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onDone();
              }
              if (event.key === "Escape") onDone();
            }}
            placeholder={placeholder}
            aria-label={`${label} 입력`}
            className={cn("input mt-0.5 h-9 py-1", invalid && "border-rose-400", inputClassName)}
          />
        )
      ) : (
        <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={onActivate}
          aria-label={`${label} 수정`}
          className={cn(
            "min-h-[1.9rem] w-full rounded-lg border-b border-dashed border-paper-300 px-1 py-1 text-left text-[16px] text-ink-800 transition hover:border-ink-400 hover:bg-paper-100/60",
            invalid && "border-rose-300",
            valueClassName,
          )}
        >
          {display ??
            (value.trim() ? (
              <span className="whitespace-pre-wrap break-words">{value}</span>
            ) : (
              <span className="text-[15px] text-ink-300">{placeholder ?? "눌러서 입력"}</span>
            ))}
        </button>
        {onClear && value.trim() ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`${label} 지우기`}
            title={`${label} 지우기`}
            className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-ink-300 transition hover:bg-paper-200 hover:text-rose-500"
          >
            ×
          </button>
        ) : null}
        </span>
      )}
      {invalid ? (
        <p className="mt-0.5 text-[14px] text-rose-500" role="alert">
          <RequiredMark required invalid />
          <span className="ml-0.5">{invalidMessage}</span>
        </p>
      ) : hint ? (
        <p className="mt-0.5 text-[13.5px] text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

const choiceClass = (active: boolean) =>
  cn(
    "chip border transition",
    active ? "border-ink-900 bg-ink-900 text-paper-50" : "border-paper-400 bg-white/60 text-ink-600 hover:border-ink-400",
  );

export function InlineChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  onCreate,
  addLabel = "새로 추가",
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  hint?: string;
  /** Notion select 옵션이 늘어날 수 있는 항목 — 새 값을 바로 적고 고를 수 있습니다. */
  onCreate?: (value: string) => void;
  addLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const name = draft.trim();
    setAdding(false);
    setDraft("");
    if (!name) return;
    if (!options.includes(name as T)) onCreate?.(name);
    onChange(name as T);
  };

  return (
    <div className="py-0.5">
      <p className="text-[13.5px] text-ink-400">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={choiceClass(value === option)}
          >
            {option}
          </button>
        ))}
        {onCreate && !options.includes(value) ? (
          <button type="button" onClick={() => onChange(value)} aria-pressed className={choiceClass(true)}>
            {value}
          </button>
        ) : null}
        {onCreate ? (
          adding ? (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
                if (event.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              onBlur={commit}
              placeholder={`${label} 이름`}
              aria-label={`${label} 새로 추가`}
              className="input h-7 w-[7.5rem] py-0 text-[14px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={`${label} ${addLabel}`}
              className="inline-flex h-[26px] items-center gap-0.5 rounded-full border border-dashed border-paper-400 px-2 text-[14px] text-ink-500 transition hover:border-ink-500 hover:text-ink-900"
            >
              <span className="text-[15px] leading-none">+</span> {addLabel}
            </button>
          )
        ) : null}
      </div>
      {hint ? <p className="mt-0.5 text-[13.5px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

/**
 * A4 → A11: every status choice stays on screen, so one click changes 미완료 · 대기 중 · 완료 · 취소.
 */
export function InlineStatus<T extends string>({
  value,
  options,
  onChange,
  toneOf,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  /** A10: 대기 중 and 취소 wear their own colour, so the state reads at a glance. */
  toneOf?: (value: T) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="상태">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-label={`상태: ${option}`}
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[15px] font-medium transition",
              active
                ? toneOf
                  ? toneOf(option)
                  : "border-ink-900 bg-ink-900 text-paper-50"
                : "border-paper-400 bg-white text-ink-600 hover:border-ink-500 hover:text-ink-900",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function InlineFlags({
  flags,
  onToggle,
}: {
  flags: { key: string; label: string; on: boolean }[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <button
          key={flag.key}
          type="button"
          aria-pressed={flag.on}
          aria-label={`${flag.label} ${flag.on ? "끄기" : "켜기"}`}
          onClick={() => onToggle(flag.key)}
          className={choiceClass(flag.on)}
        >
          {flag.label}
        </button>
      ))}
    </div>
  );
}

/** A5: '기타'와 '내용'은 비어 있어도 눌러서 바로 쓸 수 있는 자리를 둡니다. */
export function EmptyEditable({
  label,
  onClick,
  hint,
}: {
  label: string;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-dashed border-paper-300 px-3 py-2.5 text-left text-[15px] text-ink-400 transition hover:border-ink-300 hover:text-ink-700"
    >
      {label}
      {hint ? <span className="mt-0.5 block text-[13.5px] text-ink-300">{hint}</span> : null}
    </button>
  );
}

/* ─────────────────────────── dirty / save plumbing ─────────────────────────── */

type DraftShape = object;

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

export function useDetailDraft<T extends DraftShape>(initial: T) {
  const [draft, setDraft] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setDraft((current) => ({ ...current, [key]: value }) as T);
  }, []);

  const markSaved = useCallback(() => setSaved(draftRef.current), []);

  /** Switches the sheet to another item without remounting it (keeps one history layer). */
  const reset = useCallback((next: T) => {
    setDraft(next);
    setSaved(next);
  }, []);

  const changedKeys = (Object.keys(draft) as (keyof T)[]).filter((key) => !sameValue(draft[key], saved[key]));

  return { draft, saved, set, markSaved, reset, changedKeys, isDirty: changedKeys.length > 0 };
}

/**
 * A4: saves only when something actually changed — reading and closing never calls
 * the API — and keeps the sheet open when a required value is missing.
 */
export function useCommitOnLeave({
  isDirty,
  invalid,
  onInvalid,
  commit,
  delay = 900,
}: {
  isDirty: boolean;
  invalid: string | null;
  onInvalid: () => void;
  commit: () => Promise<boolean>;
  delay?: number;
}) {
  const busy = useRef(false);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const run = useCallback(async (): Promise<boolean> => {
    if (busy.current) return true;
    if (!isDirty) return true;
    if (invalid) {
      onInvalid();
      return false;
    }
    busy.current = true;
    try {
      return await commitRef.current();
    } finally {
      busy.current = false;
    }
  }, [invalid, isDirty, onInvalid]);

  // Typing pauses save by themselves, so a detail left open still lands in Notion.
  useEffect(() => {
    if (!isDirty || invalid) return;
    const timer = setTimeout(() => {
      void run();
    }, delay);
    return () => clearTimeout(timer);
  }, [isDirty, invalid, run, delay]);

  return run;
}
