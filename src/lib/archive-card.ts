/**
 * A51: 아카이브 카드(구글 킵 스타일)가 쓰는 순수 함수들.
 *
 * 카드 한 장은 ① 대표 사진 ② 제목 ③ 본문(체크리스트 포함) ④ 분류 알약 + 수정 일시 로
 * 이루어집니다. 이 파일은 그중 계산이 필요한 것만 담습니다 — 본문을 읽기 좋은 줄로
 * 나누기, 줄마다 체크 표시를 켜고 끄기, 길이에 따라 글자 크기·줄 수를 정하기, 링크에서
 * 도메인 뽑기, 수정 일시를 짧은 말로 적기.
 */

import { addDaysISO, diffDays, formatClock, formatMonthDay, todayISO } from "@/lib/date";
import type { ArchiveEntry } from "@/lib/types";

/* ─────────────────────────── 본문 → 카드 줄 ─────────────────────────── */

export interface CardLine {
  /** 화면에서 행을 구분하는 키 */
  key: string;
  type: "text" | "todo" | "heading" | "quote" | "bullet" | "divider";
  text: string;
  /** 체크리스트 — 본문 안에서 몇 번째 체크 항목인지(토글에 씁니다) */
  todoIndex?: number;
  checked?: boolean;
}

const TODO_LINE = /^[-*]\s+\[( |x|X)\]\s?(.*)$/;
const BULLET_LINE = /^[-*]\s+(.*)$/;

/** 마크다운 표식을 지운 한 줄 — 길이 계산과 미리보기에 씁니다. */
export function plainBodyText(body: string): string {
  return (body ?? "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,3}\s+/, "")
        .replace(/^>\s*/, "")
        .replace(/^[-*]\s+\[[ xX]\]\s?/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/^---+$/, "")
        .replace(/\*\*|__|~~/g, "")
        .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join(" ")
    .trim();
}

/** 본문을 카드에서 그릴 줄로 나눕니다. 연속된 빈 줄은 하나로 접습니다. */
export function cardLines(body: string): CardLine[] {
  const out: CardLine[] = [];
  let todoIndex = 0;
  let previousBlank = false;
  (body ?? "").replace(/\r\n/g, "\n").split("\n").forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) {
      if (!previousBlank && out.length > 0) out.push({ key: `b${index}`, type: "text", text: "" });
      previousBlank = true;
      return;
    }
    previousBlank = false;
    const todo = TODO_LINE.exec(trimmed);
    if (todo) {
      out.push({
        key: `b${index}`,
        type: "todo",
        text: todo[2] ?? "",
        todoIndex: todoIndex++,
        checked: (todo[1] ?? " ").toLowerCase() === "x",
      });
      return;
    }
    if (/^---+$/.test(trimmed)) {
      out.push({ key: `b${index}`, type: "divider", text: "" });
      return;
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(trimmed);
    if (heading) {
      out.push({ key: `b${index}`, type: "heading", text: heading[1] ?? "" });
      return;
    }
    if (trimmed.startsWith(">")) {
      out.push({ key: `b${index}`, type: "quote", text: trimmed.replace(/^>\s*/, "").replace(/^[\p{Extended_Pictographic}\uFE0F]+\s*/u, "") });
      return;
    }
    const bullet = BULLET_LINE.exec(trimmed);
    if (bullet) {
      out.push({ key: `b${index}`, type: "bullet", text: bullet[1] ?? "" });
      return;
    }
    out.push({ key: `b${index}`, type: "text", text: trimmed });
  });
  // 끝의 빈 줄은 카드에서 자리만 차지합니다.
  while (out.length > 0 && out[out.length - 1]!.type === "text" && !out[out.length - 1]!.text) out.pop();
  return out;
}

/** 본문 안에서 `index`번째 체크 항목의 켜짐/꺼짐을 뒤집습니다. */
export function toggleChecklist(body: string, index: number): string {
  let seen = -1;
  return (body ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const match = TODO_LINE.exec(line.trim());
      if (!match) return line;
      seen += 1;
      if (seen !== index) return line;
      const checked = (match[1] ?? " ").toLowerCase() === "x";
      return line.replace(/\[( |x|X)\]/, checked ? "[ ]" : "[x]");
    })
    .join("\n");
}

/** 체크리스트 항목 수 — 카드에서 접었을 때 몇 줄만 보여 줄지 정합니다. */
export function checklistCount(body: string): number {
  return (body ?? "").split("\n").filter((line) => TODO_LINE.test(line.trim())).length;
}

/* ─────────────────────────── 길이에 따른 글자 크기 ─────────────────────────── */

export interface CardTextFit {
  /** 제목 글자 크기(px) — 제목이 없으면 0 */
  titlePx: number;
  /** 본문 글자 크기(px) */
  bodyPx: number;
  /** 본문을 몇 줄까지 보여 줄지 (말줄임) */
  lines: number;
}

/**
 * 제목이 있으면 제목은 볼드로 고정하고 본문만 길이에 따라 줄입니다.
 * 제목이 없으면 본문이 곧 제목이라, 짧을 때는 큼직하게 시작해 길어질수록 단계적으로 줄입니다.
 * 줄 수 상한과 함께라 카드 높이가 10줄(약 240px)을 넘지 않습니다.
 */
export function cardTextFit(item: { title: string; body: string }): CardTextFit {
  const length = plainBodyText(item.body).length;
  const hasTitle = Boolean((item.title ?? "").trim());
  if (!hasTitle) {
    if (length <= 40) return { titlePx: 0, bodyPx: 21, lines: 4 };
    if (length <= 80) return { titlePx: 0, bodyPx: 19.5, lines: 5 };
    if (length <= 140) return { titlePx: 0, bodyPx: 18, lines: 6 };
    if (length <= 240) return { titlePx: 0, bodyPx: 16.5, lines: 7 };
    if (length <= 360) return { titlePx: 0, bodyPx: 15.2, lines: 8 };
    return { titlePx: 0, bodyPx: 14.4, lines: 9 };
  }
  if (length <= 80) return { titlePx: 16.5, bodyPx: 15.5, lines: 3 };
  if (length <= 180) return { titlePx: 16.5, bodyPx: 14.5, lines: 4 };
  if (length <= 320) return { titlePx: 16.5, bodyPx: 13.9, lines: 6 };
  return { titlePx: 16.5, bodyPx: 13.4, lines: 8 };
}

/** 카드에서 실제로 그릴 본문 — 제목과 똑같은 첫 줄은 되풀이하지 않습니다. */
export function cardBodyLines(item: ArchiveEntry): CardLine[] {
  const lines = cardLines(item.body);
  const title = (item.title ?? "").trim();
  if (title && lines[0] && lines[0].type === "text" && lines[0].text.trim() === title) lines.shift();
  return lines;
}

/* ─────────────────────────── 링크 · 날짜 ─────────────────────────── */

/** `https://www.example.com/a?b=1` → `example.com` */
export function linkHost(link: string): string {
  if (!link) return "";
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link.replace(/^https?:\/\//, "").split("/")[0] ?? link;
  }
}

/**
 * 카드 아래에 작게 붙는 수정 일시 — 오늘은 `오늘 14:32`, 어제는 `어제 09:10`,
 * 그 밖에는 `11. 21`(같은 해가 아니면 `2025. 12. 31`).
 */
export function editedLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  // 노션은 UTC(`…Z`)로 주고, 화면은 한국 시간으로 읽습니다.
  const kst = new Date(at.getTime() + 9 * 3600 * 1000);
  const day = kst.toISOString().slice(0, 10);
  const time = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  const today = todayISO();
  if (day === today) return `오늘 ${formatClock(time)}`;
  if (day === addDaysISO(today, -1)) return `어제 ${formatClock(time)}`;
  if (diffDays(day, today) < 7 && diffDays(day, today) > 0) {
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${day}T12:00:00`).getDay()] ?? "";
    return `${weekday}요일 ${formatClock(time)}`;
  }
  if (day.slice(0, 4) === today.slice(0, 4)) return formatMonthDay(day);
  return `${day.slice(0, 4)}. ${Number(day.slice(5, 7))}. ${Number(day.slice(8, 10))}.`;
}

/** 날짜별 아카이브 개수 — 바인더·캘린더의 하루 칸에서 `아카이브 N` 으로 보여 줍니다. */
export function archiveCountsByDate(list: ArchiveEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of list) {
    if (item.trash || !item.date) continue;
    map.set(item.date, (map.get(item.date) ?? 0) + 1);
  }
  return map;
}
