/** Date helpers — all dates are handled as local `YYYY-MM-DD` strings. */

export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const WEEKDAYS_MON = ["월", "화", "수", "목", "금", "토", "일"] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const parts = iso.slice(0, 10).split("-");
  const y = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function isValidISO(iso: string | null | undefined): iso is string {
  return !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10));
}

export function ensureISO(iso: string | null | undefined, fallback = todayISO()): string {
  return isValidISO(iso) ? iso.slice(0, 10) : fallback;
}

export function addDaysISO(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonthsISO(iso: string, n: number): string {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export function diffDays(aISO: string, bISO: string): number {
  const a = fromISO(aISO).getTime();
  const b = fromISO(bISO).getTime();
  return Math.round((a - b) / 86400000);
}

/** Monday-based week start by default. */
export function startOfWeekISO(iso: string, weekStartsOn: 0 | 1 = 1): string {
  const d = fromISO(iso);
  const day = d.getDay();
  const diff = weekStartsOn === 1 ? (day + 6) % 7 : day;
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

export function endOfWeekISO(iso: string, weekStartsOn: 0 | 1 = 1): string {
  return addDaysISO(startOfWeekISO(iso, weekStartsOn), 6);
}

export function weekDays(iso: string, weekStartsOn: 0 | 1 = 1): string[] {
  const start = startOfWeekISO(iso, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

export function rangeOfDays(startISO: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysISO(startISO, i));
}

export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonthISO(iso: string): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** 6×7 grid of ISO dates for a month, Monday first. */
export function monthMatrix(year: number, month0: number, weekStartsOn: 0 | 1 = 1): string[][] {
  const first = new Date(year, month0, 1, 12);
  const startOffset = weekStartsOn === 1 ? (first.getDay() + 6) % 7 : first.getDay();
  const start = new Date(year, month0, 1 - startOffset, 12);
  const rows: string[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: string[] = [];
    for (let c = 0; c < 7; c++) {
      const d = new Date(start);
      d.setDate(start.getDate() + r * 7 + c);
      row.push(toISO(d));
    }
    rows.push(row);
  }
  return rows;
}

export function isoWeekNumber(iso: string): number {
  const d = fromISO(iso);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const day = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - day + 3);
  const weekYear = t.getFullYear();
  const firstThursday = new Date(weekYear, 0, 4, 12);
  const fday = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - fday + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** `2026-W47` — also the value stored in the Notion `주간 키` property. */
export function weekKeyOf(iso: string): string {
  const d = fromISO(iso);
  const day = (d.getDay() + 6) % 7;
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3, 12);
  return `${thursday.getFullYear()}-W${pad2(isoWeekNumber(iso))}`;
}

export function weekKeyToMonday(key: string): string {
  const [yearStr, weekStr] = key.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  if (!year || !week) return todayISO();
  const jan4 = new Date(year, 0, 4, 12);
  const day = (jan4.getDay() + 6) % 7;
  const mondayOfWeek1 = new Date(year, 0, 4 - day, 12);
  const d = new Date(mondayOfWeek1);
  d.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
  return toISO(d);
}

export function weekdayKo(iso: string): string {
  return WEEKDAYS_KO[fromISO(iso).getDay()] ?? "";
}

export function weekdayIndexMon(iso: string): number {
  return (fromISO(iso).getDay() + 6) % 7;
}

export function isWeekendISO(iso: string): boolean {
  const day = fromISO(iso).getDay();
  return day === 0 || day === 6;
}

export function isSameISO(a: string | null, b: string | null): boolean {
  return !!a && !!b && a.slice(0, 10) === b.slice(0, 10);
}

export function formatMonthDay(iso: string): string {
  const d = fromISO(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatShort(iso: string): string {
  const d = fromISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatFullKo(iso: string): string {
  const d = fromISO(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS_KO[d.getDay()]}요일`;
}

/** `YYYY년 MM월 DD일 주간 메모` / `월간 메모` — the title rule, dated by the day it was written. */
export function memoTitle(iso: string, kind: "주간 메모" | "월간 메모"): string {
  const d = fromISO(iso);
  return `${d.getFullYear()}년 ${pad2(d.getMonth() + 1)}월 ${pad2(d.getDate())}일 ${kind}`;
}

/** A16: the name a diary writes itself — 11월 21일 토요일 바인더 — so only body is typed. */
export function diaryTitle(iso: string): string {
  const d = fromISO(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS_KO[d.getDay()] ?? ""}요일 바인더`;
}

export function formatMonthKo(iso: string): string {
  const d = fromISO(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

/** `오전 9:30` style label from `HH:MM`. */
export function formatTimeKo(time: string | null | undefined): string {
  if (!time) return "";
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${ampm} ${h12}시` : `${ampm} ${h12}:${pad2(m)}`;
}

export function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const parts = time.split(":");
  return Number(parts[0] ?? 0) * 60 + Number(parts[1] ?? 0);
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

export function roundToStep(minutes: number, step = 30): number {
  return Math.round(minutes / step) * step;
}

export function isoDaysBetween(startISO: string, endISO: string): number {
  return Math.max(0, diffDays(endISO, startISO));
}

export function relativeDayLabel(iso: string, today = todayISO()): string {
  const diff = diffDays(iso, today);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === -1) return "어제";
  if (diff > 1 && diff < 7) return `${diff}일 뒤`;
  if (diff < -1 && diff > -7) return `${Math.abs(diff)}일 전`;
  return formatShort(iso);
}

export function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let y = 2026; y <= 2027; y++) {
    for (let m = 1; m <= 12; m++) {
      out.push({ value: `${y}-${pad2(m)}`, label: `${y}년 ${m}월` });
    }
  }
  return out;
}
