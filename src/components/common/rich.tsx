"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { normalizeSpans, spansFromPlain } from "@/lib/richtext";
import type { RichTextSpan } from "@/lib/types";

/**
 * A5: renders a Notion `rich_text` value with its own line breaks, bold/italic and
 * partial links. `links={false}` keeps the styling but drops <a>, for places where the
 * text sits inside a button or a card whose whole surface is clickable.
 */
export function RichText({
  value,
  spans,
  className,
  linkClassName,
  links = true,
}: {
  value?: string;
  spans?: RichTextSpan[];
  className?: string;
  linkClassName?: string;
  links?: boolean;
}) {
  const list = normalizeSpans(spans && spans.length > 0 ? spans : spansFromPlain(value ?? ""));
  if (list.length === 0) return null;

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {list.map((span, index) => {
        const inner = span.bold ? (
          <strong className="font-semibold">{span.text}</strong>
        ) : span.italic ? (
          <em className="italic">{span.text}</em>
        ) : (
          span.text
        );
        if (!span.href) return <Fragment key={index}>{inner}</Fragment>;
        return links ? (
          <a
            key={index}
            href={span.href}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className={cn("text-accent-600 underline decoration-accent-300 underline-offset-2 hover:text-accent-700", linkClassName)}
          >
            {inner}
          </a>
        ) : (
          <span
            key={index}
            className={cn("text-accent-600 underline decoration-accent-300 underline-offset-2", linkClassName)}
          >
            {inner}
          </span>
        );
      })}
    </span>
  );
}
