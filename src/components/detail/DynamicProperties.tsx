"use client";

import { cn } from "@/lib/utils";
import type { ExtraProperty } from "@/lib/types";

export type SchemaMap = Record<string, { type: string; options?: string[] }>;

function pretty(value: ExtraProperty["value"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "켜짐" : "꺼짐";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

/**
 * B2: properties that were added to the Notion database after this app was written.
 * Text · checkbox · select · date · number · URL edit in place; formulas stay read-only.
 */
export function DynamicProperties({
  extra,
  schema,
  onChange,
}: {
  extra: ExtraProperty[];
  schema: SchemaMap;
  onChange: (next: ExtraProperty[]) => void;
}) {
  if (extra.length === 0) return null;

  const update = (name: string, value: ExtraProperty["value"]) =>
    onChange(extra.map((item) => (item.name === name ? { ...item, value } : item)));

  return (
    <div className="space-y-1.5">
      {extra.map((prop) => {
        const options = schema[prop.name]?.options ?? prop.options ?? [];
        const type = prop.type.split(":")[0] ?? prop.type;
        return (
          <div key={prop.name} className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 rounded-lg px-1 py-1 hover:bg-paper-100/60">
            <p className="truncate pt-1 text-[calc(13.5px*var(--fs))] text-ink-400" title={prop.name}>
              {prop.name}
            </p>
            {prop.readOnly || type === "formula" ? (
              <p className={cn("min-h-[1.7rem] break-words rounded bg-paper-100/70 px-2 py-1 text-[calc(15px*var(--fs))] text-ink-500", typeof prop.value === "boolean" && "font-medium")}>
                {pretty(prop.value)}
                <span className="ml-1 text-[calc(13px*var(--fs))] text-ink-300">수식 · 읽기 전용</span>
              </p>
            ) : type === "checkbox" ? (
              <button
                type="button"
                aria-pressed={prop.value === true}
                onClick={() => update(prop.name, !(prop.value === true))}
                className={cn(
                  "justify-self-start rounded-full border px-2.5 py-1 text-[calc(14px*var(--fs))]",
                  prop.value === true ? "border-ink-900 bg-ink-900 text-white" : "border-paper-400 bg-white text-ink-500",
                )}
              >
                {prop.value === true ? "켜짐" : "꺼짐"}
              </button>
            ) : type === "select" ? (
              <div className="flex flex-wrap gap-1">
                {(options.length > 0 ? options : [String(prop.value ?? "")]).filter(Boolean).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => update(prop.name, option)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[calc(14px*var(--fs))]",
                      prop.value === option ? "border-ink-900 bg-ink-900 text-white" : "border-paper-400 bg-white text-ink-500",
                    )}
                  >
                    {option}
                  </button>
                ))}
                {options.length === 0 ? (
                  <input
                    defaultValue={String(prop.value ?? "")}
                    onBlur={(event) => update(prop.name, event.target.value.trim() || null)}
                    placeholder="값 입력"
                    aria-label={`${prop.name} 값`}
                    className="input h-7 w-[9rem] py-0 text-[calc(14.5px*var(--fs))]"
                  />
                ) : null}
              </div>
            ) : type === "multi_select" ? (
              <div className="flex flex-wrap gap-1">
                {(options.length > 0 ? options : []).map((option) => {
                  const list = Array.isArray(prop.value) ? prop.value : [];
                  const on = list.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => update(prop.name, on ? list.filter((item) => item !== option) : [...list, option])}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[calc(14px*var(--fs))]",
                        on ? "border-ink-900 bg-ink-900 text-white" : "border-paper-400 bg-white text-ink-500",
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
                {options.length === 0 ? <span className="text-[calc(14.5px*var(--fs))] text-ink-400">{pretty(prop.value)}</span> : null}
              </div>
            ) : type === "date" ? (
              <input
                type="date"
                value={typeof prop.value === "string" ? prop.value.slice(0, 10) : ""}
                onChange={(event) => update(prop.name, event.target.value || null)}
                aria-label={`${prop.name} 날짜`}
                className="input h-7 w-[10rem] py-0 text-[calc(14.5px*var(--fs))]"
              />
            ) : type === "number" ? (
              <input
                type="number"
                value={typeof prop.value === "number" ? prop.value : ""}
                onChange={(event) => update(prop.name, event.target.value === "" ? null : Number(event.target.value))}
                aria-label={`${prop.name} 숫자`}
                className="input h-7 w-[7rem] py-0 text-[calc(14.5px*var(--fs))]"
              />
            ) : type === "url" ? (
              <div className="flex min-w-0 items-center gap-1">
                <input
                  defaultValue={typeof prop.value === "string" ? prop.value : ""}
                  onBlur={(event) => update(prop.name, event.target.value.trim() || null)}
                  placeholder="https://"
                  aria-label={`${prop.name} 주소`}
                  className="input h-7 min-w-0 flex-1 py-0 text-[calc(14.5px*var(--fs))]"
                />
                {typeof prop.value === "string" && prop.value ? (
                  <a href={prop.value} target="_blank" rel="noreferrer" className="flex-none text-[calc(13.5px*var(--fs))] text-accent-600 hover:underline">
                    열기
                  </a>
                ) : null}
              </div>
            ) : (
              <input
                defaultValue={typeof prop.value === "string" ? prop.value : ""}
                onBlur={(event) => update(prop.name, event.target.value)}
                aria-label={`${prop.name} 값`}
                className="input h-7 py-0 text-[calc(14.5px*var(--fs))]"
              />
            )}
          </div>
        );
      })}
      <p className="px-1 text-[calc(13px*var(--fs))] text-ink-300">
        Notion에 나중에 추가한 속성입니다. 이름·수식 정의는 Notion에서 관리되고, 여기서는 값만 바뀝니다.
      </p>
    </div>
  );
}
