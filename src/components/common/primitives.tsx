"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon, StarIcon, XIcon } from "@/components/icons";

/* ─────────────────────────── overlay plumbing ─────────────────────────── */

/**
 * A4: an overlay stack with a single history entry.
 *
 * `이전`/바깥 클릭 move one layer back (the component calls onBack), the X closes
 * every layer, and the browser's back gesture closes exactly one layer.
 */
interface Layer {
  close: () => void;
}

const layers: Layer[] = [];
let scrollLocks = 0;
let listening = false;
let unwinding = false;

const hasLayerState = (): boolean =>
  Boolean(typeof window !== "undefined" && (window.history.state as { diaryLayer?: boolean } | null)?.diaryLayer);

function ensureEscapeListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const top = layers[layers.length - 1];
    if (top) {
      event.preventDefault();
      top.close();
    }
  });

  window.addEventListener("popstate", () => {
    // Our own cleanup step below pops the shared entry; that is not a gesture, so a
    // layer opened in the same commit (search result → detail) must stay open.
    if (unwinding) return;
    if (hasLayerState()) return;
    const top = layers[layers.length - 1];
    if (!top) return;
    // Keep one entry for the layers that stay open after this step back.
    if (layers.length > 1) window.history.pushState({ ...(window.history.state ?? {}), diaryLayer: true }, "");
    top.close();
  });
}

export function useOverlay(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    ensureEscapeListener();

    const layer: Layer = { close: () => closeRef.current() };
    layers.push(layer);
    scrollLocks += 1;
    document.body.style.overflow = "hidden";
    if (!hasLayerState()) window.history.pushState({ ...(window.history.state ?? {}), diaryLayer: true }, "");

    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = "";
      // Only the last layer removes the shared entry; a StrictMode remount lands first.
      window.setTimeout(() => {
        if (unwinding) return;
        if (layers.length === 0 && hasLayerState()) {
          unwinding = true;
          window.history.back();
          window.setTimeout(() => {
            unwinding = false;
            // A layer that opened while that entry was leaving still needs the entry,
            // or the browser's back gesture would not close it.
            if (layers.length > 0 && !hasLayerState()) {
              window.history.pushState({ ...(window.history.state ?? {}), diaryLayer: true }, "");
            }
          }, 80);
        }
      }, 0);
    };
  }, [open]);
}

export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/* ─────────────────────────────── Modal ─────────────────────────────── */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  bodyClassName?: string;
}

const sizeClass = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  bodyClassName,
}: ModalProps) {
  useOverlay(open, onClose);
  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute inset-0 animate-fade-in bg-ink-900/25 backdrop-blur-[2px]"
        />
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "relative z-10 flex max-h-[92vh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl border border-paper-300 bg-white shadow-lift sm:animate-pop-in sm:rounded-3xl",
            sizeClass[size],
          )}
        >
          <div className="flex items-start gap-3 border-b border-paper-300/80 px-5 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              {title ? <h2 className="truncate text-[17px] font-semibold text-ink-900">{title}</h2> : null}
              {subtitle ? <p className="mt-0.5 truncate text-[15px] text-ink-500">{subtitle}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="icon-btn -mr-1 -mt-1" aria-label="닫기">
              <XIcon size={18} />
            </button>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>
          {footer ? <div className="border-t border-paper-300/80 bg-paper-50/60 px-5 py-3">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/* ─────────────────────────────── Drawer ─────────────────────────────── */

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
  /** A4: a detail open beside the list keeps the list clickable, so its dim layer goes away. */
  showBackdrop?: boolean;
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "md", showBackdrop = true }: DrawerProps) {
  useOverlay(open, onClose);
  if (!open) return null;

  return (
    <Portal>
      <div
        className={cn(
          "fixed inset-0 z-40 flex items-end justify-end sm:items-stretch",
          !showBackdrop && "pointer-events-none",
        )}
      >
        {showBackdrop ? (
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="absolute inset-0 animate-fade-in bg-ink-900/20 backdrop-blur-[1px]"
          />
        ) : null}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" && title ? title : "목록"}
          className={cn(
            "pointer-events-auto relative z-10 flex max-h-[90vh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl border border-paper-300 bg-white shadow-lift sm:my-0 sm:max-h-none sm:animate-slide-in-right sm:rounded-none sm:rounded-l-3xl sm:border-y-0 sm:border-r-0",
            width === "lg" ? "sm:w-[520px]" : "sm:w-[420px]",
          )}
        >
          <div className="flex items-start gap-3 border-b border-paper-300/80 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              {title ? <div className="truncate text-[16.5px] font-semibold text-ink-900">{title}</div> : null}
              {subtitle ? <div className="mt-0.5 truncate text-[15px] text-ink-500">{subtitle}</div> : null}
            </div>
            <button type="button" onClick={onClose} className="icon-btn -mr-1" aria-label="닫기">
              <XIcon size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-paper-300/80 bg-paper-50/60 px-5 py-3 pb-safe">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/* ───────────────────────────── form pieces ───────────────────────────── */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label ? <span className="label">{label}</span> : null}
      {children}
      {hint ? <span className="mt-1 block text-[14px] text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={cn("input", className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={cn("input min-h-[92px] resize-y leading-relaxed", className)} />;
}

export function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input appearance-none pr-8"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  tone = "ink",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  tone?: "ink" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left transition hover:bg-paper-100"
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-[15.5px] text-ink-800">{label}</span>
        {description ? <span className="mt-0.5 block text-[14px] text-ink-400">{description}</span> : null}
      </span>
      <span
        className={cn(
          "relative h-6 w-10 flex-none rounded-full transition",
          checked ? (tone === "accent" ? "bg-accent-400" : "bg-ink-900") : "bg-paper-400",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[1.15rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-full border border-paper-300 bg-white/60 p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-full font-medium transition",
            size === "sm" ? "px-2.5 py-1 text-[14px]" : "px-3 py-1.5 text-[15px]",
            value === option.value ? "bg-ink-900 text-paper-50 shadow-sm" : "text-ink-600 hover:text-ink-900",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ChipGroup<T extends string>({
  values,
  options,
  onToggle,
  multi = true,
  className,
}: {
  values: T[];
  options: readonly T[];
  onToggle: (value: T) => void;
  multi?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const active = values.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={cn(
              "chip border transition",
              active
                ? "border-ink-900 bg-ink-900 text-paper-50"
                : "border-paper-400 bg-white/60 text-ink-600 hover:border-ink-400",
            )}
          >
            {multi && active ? <CheckIcon size={11} /> : null}
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function StarRating({
  value,
  onChange,
  size = 16,
}: {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(value === star ? null : star)}
          className={cn("rounded p-0.5 transition", onChange && "hover:scale-110")}
          aria-label={`${star}점`}
        >
          <StarIcon
            size={size}
            filled={(value ?? 0) >= star}
            className={(value ?? 0) >= star ? "text-amber-400" : "text-paper-400"}
          />
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-paper-300 bg-paper-50/50 px-6 py-10 text-center">
      {icon ? <div className="text-ink-400">{icon}</div> : null}
      <p className="text-[16px] font-medium text-ink-700">{title}</p>
      {description ? <p className="max-w-xs text-[15px] leading-relaxed text-ink-500">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-[15.5px] leading-relaxed text-ink-600">{description}</p>
    </Modal>
  );
}

export function SectionHeading({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2", className)}>
      <h3 className="section-title">{title}</h3>
      {action}
    </div>
  );
}

export function Dot({ tone = "ink" }: { tone?: "ink" | "accent" | "sage" | "dusk" }) {
  const color =
    tone === "accent" ? "bg-accent-400" : tone === "sage" ? "bg-sage-400" : tone === "dusk" ? "bg-dusk-300" : "bg-ink-500";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color)} />;
}
