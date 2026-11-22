"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Portal, useOverlay } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { ArrowUpRightIcon, ChevronDownIcon, ChevronLeftIcon, TrashIcon, XIcon } from "@/components/icons";

/* ─────────────────────────── A4: 상세 보기 껍데기 ─────────────────────────── */

/**
 * Reads as a page first: a back arrow steps one layer back (detail → list/drawer),
 * the X closes every layer that came with it. The backdrop counts as a step back.
 *
 * 개편: 머리말은 얇게(무엇을 보고 있는지만), 아래 액션 줄에 `노션에서 열기`와 위험한
 * 삭제를 나눠 둡니다. 저장 상태는 바뀐 값이 있을 때만 작게 나타납니다.
 */
export function DetailShell({
  open,
  onBack,
  onClose,
  label,
  ariaLabel,
  subtitle,
  notionUrl,
  sideBySide = false,
  status,
  trashed,
  onTrash,
  onRestore,
  trashLabel = "삭제",
  footer,
  children,
}: {
  open: boolean;
  onBack: () => void;
  onClose: () => void;
  label: ReactNode;
  /** 화면 낭독기용 이름 — 기본은 label */
  ariaLabel?: string;
  subtitle?: ReactNode;
  /** The record's Notion page — opened in a new tab/app so its own reminder can be turned on. */
  notionUrl?: string | null;
  /** On a wide screen the right list stays usable, so the sheet only covers the centre. */
  sideBySide?: boolean;
  /** 오른쪽 아래 작은 저장 상태 (없으면 아무것도 그리지 않습니다). */
  status?: ReactNode;
  trashed?: boolean;
  onTrash?: () => void;
  onRestore?: () => void;
  trashLabel?: string;
  /** 예전 그대로 쓰는 화면을 위해 남겨 둔 자리 — 있으면 아래 액션 줄 대신 그립니다. */
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

  const actionBar = (
    <div className="flex items-center gap-2">
      {notionUrl ? (
        <a
          href={notionUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="노션에서 열기"
          title="이 항목의 노션 페이지를 새 탭에서 열기"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[calc(13.5px*var(--fs))] font-medium text-ink-500 transition hover:bg-paper-200 hover:text-ink-900"
        >
          <ArrowUpRightIcon size={14} />
          노션에서 열기
        </a>
      ) : null}
      <span className="ml-auto min-w-0 truncate text-right text-[calc(12.5px*var(--fs))] text-ink-400">{status}</span>
      {trashed && onRestore ? (
        <button type="button" onClick={onRestore} className="btn-outline btn-xs flex-none">
          휴지통에서 복원
        </button>
      ) : onTrash ? (
        <button
          type="button"
          onClick={onTrash}
          aria-label={`${trashLabel} (휴지통으로)`}
          className="inline-flex flex-none items-center gap-1 rounded-full px-2 py-1 text-[calc(13.5px*var(--fs))] text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
        >
          <TrashIcon size={14} />
          {trashLabel}
        </button>
      ) : null}
    </div>
  );

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
          aria-label={ariaLabel ?? (typeof label === "string" ? label : "상세")}
          className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-paper-300 bg-white shadow-lift animate-slide-up sm:max-w-2xl sm:animate-pop-in sm:rounded-3xl"
        >
          <header
            className="flex flex-none items-center gap-0.5 py-1 pl-1 pr-2"
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
              <p className="truncate text-[calc(13px*var(--fs))] text-ink-400">{label}</p>
              {subtitle ? <p className="truncate text-[calc(12.5px*var(--fs))] text-ink-300">{subtitle}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="전체 닫기" title="전체 닫기">
              <XIcon size={18} />
            </button>
          </header>

          <div data-sheet-scroll="true" className="min-h-0 overflow-y-auto px-4 pb-6 pt-0.5 sm:px-6">
            <div className="mx-auto w-full max-w-[44rem]">{children}</div>
          </div>

          <div className="flex flex-none items-center border-t border-paper-200 bg-paper-50/70 px-2.5 py-1.5 pb-safe">
            <div className="w-full">{footer ?? actionBar}</div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* ──────────────────────────── 읽기 좋은 칸 나누기 ──────────────────────────── */

/**
 * 개편: 값마다 라벨을 위에 얹으면 화면이 라벨로 가득 찹니다. 라벨은 왼쪽 한 줄,
 * 값은 그 오른쪽에 — 눈이 라벨 줄을 따라 아래로만 내려가면 됩니다.
 */
export function FieldRow({
  label,
  children,
  htmlFor,
  align = "center",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 py-[3px] sm:grid-cols-[5.25rem_minmax(0,1fr)]",
        align === "center" ? "items-center" : "items-start",
        className,
      )}
    >
      <span
        className={cn(
          "text-[calc(13px*var(--fs))] leading-[1.7] text-ink-400",
          align === "start" && "pt-[3px]",
        )}
      >
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** 여러 줄 블록(메모·본문)은 라벨을 위에 두고 넓게 씁니다. */
export function DetailGroup({
  label,
  action,
  children,
  className,
}: {
  label?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("pt-3.5", className)}>
      {label || action ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-[calc(12.5px*var(--fs))] font-semibold tracking-[0.02em] text-ink-500">{label}</h3>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function DetailSection({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-4 border-t border-paper-200 pt-2.5 first:mt-0 first:border-t-0 first:pt-0", className)}>
      {title || action ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-[calc(12.5px*var(--fs))] font-semibold tracking-[0.02em] text-ink-500">{title}</h3>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** 제목 — 상세 맨 위, 크고 깔끔하게. 라벨 없이 값만 보입니다. */
export function InlineTitle({
  value,
  onChange,
  active,
  onActivate,
  onDone,
  invalid,
  placeholder = "제목 없음",
}: {
  value: string;
  onChange: (value: string) => void;
  active: boolean;
  onActivate: () => void;
  onDone: () => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <InlineText
      label="제목"
      required
      bare
      invalid={invalid}
      value={value}
      onChange={onChange}
      active={active}
      onActivate={onActivate}
      onDone={onDone}
      placeholder={placeholder}
      valueClassName="border-none px-0 text-[calc(23px*var(--fs))] font-semibold leading-snug tracking-tight text-ink-900"
      inputClassName="text-[calc(19px*var(--fs))] font-semibold"
    />
  );
}

/**
 * 세부 옵션 — 자주 쓰지 않는 설정은 접어 두고, 안에 켜 둔 값이 있으면
 * 펼치지 않아도 배지로 보이게 합니다.
 */
export function MoreOptions({
  label = "세부 옵션",
  badges = [],
  defaultOpen = false,
  className,
  children,
}: {
  label?: string;
  badges?: string[];
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={cn("mt-4 border-t border-paper-200 pt-1", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-1.5 py-2 text-left"
      >
        <ChevronDownIcon size={15} className={cn("flex-none text-ink-400 transition-transform", open && "rotate-180")} />
        <span className="text-[calc(13.5px*var(--fs))] font-medium text-ink-600">{label}</span>
        {!open && badges.length > 0 ? (
          <span className="flex min-w-0 flex-wrap gap-1">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full bg-paper-200 px-1.5 py-[1px] text-[calc(12px*var(--fs))] leading-4 text-ink-500"
              >
                {badge}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id={id} className="pb-1">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** 세부 옵션 안의 작은 스위치 — 라벨과 설명만 읽히면 됩니다. */
export function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left transition hover:bg-paper-100"
    >
      <span className="min-w-0">
        <span className="block text-[calc(14px*var(--fs))] text-ink-700">{label}</span>
        {description ? <span className="mt-0.5 block text-[calc(12px*var(--fs))] text-ink-400">{description}</span> : null}
      </span>
      <span className={cn("relative h-5 w-9 flex-none rounded-full transition", checked ? "bg-ink-900" : "bg-paper-300")}>
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            checked ? "left-[1.05rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** 오른쪽 아래 저장 상태 — 바뀐 값이 없으면 아무것도 보이지 않습니다. */
export function SaveState({
  dirty,
  saving,
  saved,
  error,
}: {
  dirty: boolean;
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
}) {
  if (error) return <span className="text-rose-500">{error}</span>;
  if (saving) return <span>저장 중…</span>;
  if (saved && !dirty) return <span>저장됨</span>;
  if (dirty) return <span>자동 저장</span>;
  return null;
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

/* ─────────────────────── A4: 값 누르면 그 자리에서 수정 ─────────────────────── */

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
  bare = false,
  nowrap = false,
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
  /** 라벨을 그리지 않고 값만 (FieldRow 안에서 씁니다). */
  bare?: boolean;
  /** 시각처럼 중간에서 줄이 바뀌면 안 되는 값. */
  nowrap?: boolean;
}) {
  const valueClass = bare
    ? "min-h-[1.6rem] rounded-md px-1 py-0.5 text-[calc(15.5px*var(--fs))] text-ink-800 hover:bg-paper-100"
    : "min-h-[1.9rem] rounded-lg border-b border-dashed border-paper-300 px-1 py-1 text-[calc(16px*var(--fs))] text-ink-800 hover:border-ink-400 hover:bg-paper-100/60";
  return (
    <div className={bare ? "min-w-0 shrink-0" : "py-0.5"}>
      {bare ? null : (
        <p className="flex items-center text-[calc(13px*var(--fs))] text-ink-400">
          {label}
          <RequiredMark required={required} invalid={invalid} />
        </p>
      )}
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
            className={cn(
              "input mt-0.5 h-9 py-1",
              bare && "mt-0 h-8 bg-white text-[calc(15.5px*var(--fs))]",
              invalid && "border-rose-400",
              inputClassName,
            )}
          />
        )
      ) : (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={onActivate}
            aria-label={`${label} 수정`}
            className={cn(
              "text-left transition",
              bare ? "-ml-1 max-w-full" : "w-full",
              valueClass,
              valueClassName,
            )}
          >
            {display !== undefined && display !== null ? (
              <span className={cn(nowrap ? "whitespace-nowrap" : "whitespace-pre-wrap break-words")}>{display}</span>
            ) : value.trim() ? (
              <span className={cn(nowrap ? "whitespace-nowrap" : "whitespace-pre-wrap break-words")}>{value}</span>
            ) : (
              <span
                className={cn(
                  "text-ink-300",
                  bare ? "text-[calc(14px*var(--fs))]" : "text-[calc(15px*var(--fs))]",
                  nowrap && "whitespace-nowrap",
                )}
              >
                {placeholder ?? "눌러서 입력"}
              </span>
            )}
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
        <p className="mt-0.5 text-[calc(13.5px*var(--fs))] text-rose-500" role="alert">
          <RequiredMark required invalid />
          <span className="ml-0.5">{invalidMessage}</span>
        </p>
      ) : hint ? (
        <p className="mt-0.5 text-[calc(12.5px*var(--fs))] text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

const choiceClass = (active: boolean) =>
  cn(
    "inline-flex items-center rounded-full border px-2.5 py-[3px] text-[calc(14px*var(--fs))] leading-5 transition",
    active ? "border-ink-900 bg-ink-900 text-paper-50" : "border-paper-300 bg-white text-ink-500 hover:border-ink-400 hover:text-ink-800",
  );

export function InlineChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  onCreate,
  addLabel = "새로 추가",
  bare = false,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  hint?: string;
  /** Notion select 옵션이 늘어날 수 있는 항목 — 새 값을 바로 적고 고를 수 있습니다. */
  onCreate?: (value: string) => void;
  addLabel?: string;
  bare?: boolean;
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
    <div className={bare ? "min-w-0 shrink-0" : "py-0.5"}>
      {bare ? null : <p className="text-[calc(13px*var(--fs))] text-ink-400">{label}</p>}
      <div className={cn("flex flex-wrap items-center gap-1", !bare && "mt-1")}>
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
              className="input h-7 w-[7.5rem] py-0 text-[calc(14px*var(--fs))]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={`${label} ${addLabel}`}
              className="inline-flex h-[26px] items-center gap-0.5 rounded-full border border-dashed border-paper-300 px-2 text-[calc(13.5px*var(--fs))] text-ink-400 transition hover:border-ink-400 hover:text-ink-700"
            >
              <span className="text-[calc(14px*var(--fs))] leading-none">+</span> {addLabel}
            </button>
          )
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-[calc(12.5px*var(--fs))] text-ink-400">{hint}</p> : null}
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
              "rounded-full border px-3 py-[3px] text-[calc(14.5px*var(--fs))] font-medium leading-5 transition",
              active
                ? toneOf
                  ? toneOf(option)
                  : "border-ink-900 bg-ink-900 text-paper-50"
                : "border-paper-300 bg-white text-ink-500 hover:border-ink-400 hover:text-ink-800",
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
  iconOf,
}: {
  flags: { key: string; label: string; on: boolean }[];
  onToggle: (key: string) => void;
  iconOf?: (key: string) => ReactNode;
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
          {iconOf ? iconOf(flag.key) : null}
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
      className="w-full rounded-lg border border-dashed border-paper-300 px-2.5 py-2 text-left text-[calc(14.5px*var(--fs))] text-ink-400 transition hover:border-ink-300 hover:text-ink-700"
    >
      {label}
      {hint ? <span className="mt-0.5 block text-[calc(12.5px*var(--fs))] text-ink-300">{hint}</span> : null}
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

export type SavePhase = "idle" | "saving" | "saved" | "error";

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
  onPhase,
}: {
  isDirty: boolean;
  invalid: string | null;
  onInvalid: () => void;
  commit: () => Promise<boolean>;
  delay?: number;
  /** 개편: 저장 상태를 화면 아래에 작게 보여 주기 위한 알림. */
  onPhase?: (phase: SavePhase) => void;
}) {
  const busy = useRef(false);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const phaseRef = useRef(onPhase);
  phaseRef.current = onPhase;

  const run = useCallback(async (): Promise<boolean> => {
    if (busy.current) return true;
    if (!isDirty) return true;
    if (invalid) {
      onInvalid();
      return false;
    }
    busy.current = true;
    phaseRef.current?.("saving");
    try {
      const ok = await commitRef.current();
      phaseRef.current?.(ok ? "saved" : "error");
      return ok;
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
