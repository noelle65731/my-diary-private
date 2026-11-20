import type { ReactNode } from "react";
import { Fragment } from "react";

/** Small, dependency-free renderer for the diary's plain-text / Markdown body. */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${index++}`;

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink-900">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-paper-200 px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function renderMarkdown(text: string): ReactNode {
  if (!text.trim()) {
    return <p className="text-ink-400">아직 내용이 없습니다. 오늘을 적어 보세요.</p>;
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: { type: "ul" | "ol"; items: ReactNode[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!listBuffer) return;
    const children = listBuffer.items;
    blocks.push(
      listBuffer.type === "ul" ? (
        <ul key={`b${key++}`} className="my-2 list-disc space-y-1 pl-5">
          {children}
        </ul>
      ) : (
        <ol key={`b${key++}`} className="my-2 list-decimal space-y-1 pl-5">
          {children}
        </ol>
      ),
    );
    listBuffer = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1]?.length ?? 1;
      const content = inline(heading[2] ?? "", `h${key}`);
      const cls =
        level === 1 ? "mt-5 mb-2 text-[1.2rem] font-semibold" : level === 2 ? "mt-4 mb-1.5 text-[1.06rem] font-semibold" : "mt-3 mb-1 text-[0.96rem] font-semibold";
      blocks.push(
        <p key={`b${key++}`} className={cls}>
          {content}
        </p>,
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushList();
      blocks.push(<hr key={`b${key++}`} className="my-4 border-paper-300" />);
      continue;
    }

    if (line.startsWith("> ")) {
      flushList();
      blocks.push(
        <blockquote key={`b${key++}`} className="my-3 border-l-2 border-accent-200 pl-3 text-ink-600">
          {inline(line.slice(2), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    const checkbox = /^[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (checkbox) {
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList();
        listBuffer = { type: "ul", items: [] };
      }
      const checked = checkbox[1] !== " ";
      listBuffer.items.push(
        <li key={`li${key++}`} className="flex list-none items-start gap-2 pl-0">
          <span
            className={
              checked
                ? "mt-[0.2em] flex h-3.5 w-3.5 flex-none items-center justify-center rounded border border-sage-400 bg-sage-400 text-white"
                : "mt-[0.2em] h-3.5 w-3.5 flex-none rounded border border-paper-400"
            }
          >
            {checked ? "✓" : ""}
          </span>
          <span className={checked ? "text-ink-500 line-through decoration-paper-400" : ""}>
            {inline(checkbox[2] ?? "", `c${key}`)}
          </span>
        </li>,
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList();
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer.items.push(<li key={`li${key++}`}>{inline(bullet[1] ?? "", `u${key}`)}</li>);
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList();
        listBuffer = { type: "ol", items: [] };
      }
      listBuffer.items.push(<li key={`li${key++}`}>{inline(ordered[1] ?? "", `o${key}`)}</li>);
      continue;
    }

    flushList();
    blocks.push(
      <p key={`b${key++}`} className="my-2 leading-[1.78]">
        {inline(line, `p${key}`)}
      </p>,
    );
  }

  flushList();
  return <Fragment>{blocks}</Fragment>;
}

/** Plain-text preview for lists (strips the most common markers). */
export function previewText(text: string, maxLines = 3): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^#{1,3}\s+/, "").replace(/^[-*]\s+(\[[ xX]\]\s+)?/, "").replace(/\*\*/g, ""))
    .slice(0, maxLines);
}
