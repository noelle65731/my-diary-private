/**
 * Translation between Notion pages and the app's data model.
 * Property names match the original databases exactly.
 */

import type {
  ArchiveEntry,
  ArchiveKind,
  BinderEntry,
  BinderKind,
  CalendarEvent,
  CalendarCategory,
  CalendarKind,
  ExtraProperty,
  ProjectTask,
  RichTextSpan,
  Routine,
  RoutineKind,
  TaskCategory,
  TaskKind,
  TaskStatus,
} from "./types";
import { coerceSpans, normalizeSpans } from "./richtext";
import type { NotionPage, NotionProperty, NotionRichText } from "./notion";

type Props = Record<string, NotionProperty>;
type Patch = Record<string, unknown>;

/* ────────────────────────────── readers ────────────────────────────── */

function prop(props: Props, name: string): NotionProperty | undefined {
  return props[name];
}

function plainText(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return (items as NotionRichText[])
    .map((item) => item.plain_text ?? item.text?.content ?? "")
    .join("");
}

function readTitle(props: Props, name = "제목"): string {
  return plainText((prop(props, name) as { title?: unknown } | undefined)?.title).trim();
}

function readRichText(props: Props, name: string): string {
  return plainText((prop(props, name) as { rich_text?: unknown } | undefined)?.rich_text);
}

/** A5: keeps Notion's per-span formatting (bold / italic / 부분 링크) and line breaks. */
function readRichSpans(props: Props, name: string): RichTextSpan[] {
  const items = (prop(props, name) as { rich_text?: unknown } | undefined)?.rich_text;
  if (!Array.isArray(items)) return [];
  return normalizeSpans(
    (items as NotionRichText[]).map((item) => ({
      text: item.plain_text ?? item.text?.content ?? "",
      ...(item.annotations?.bold ? { bold: true } : {}),
      ...(item.annotations?.italic ? { italic: true } : {}),
      ...(item.href ?? item.text?.link?.url ? { href: item.href ?? item.text?.link?.url ?? null } : {}),
    })),
  );
}

function readSelect(props: Props, name: string): string | null {
  const value = (prop(props, name) as { select?: { name?: string } | null } | undefined)?.select;
  return value?.name ?? null;
}

function readStatus(props: Props, name: string): string | null {
  const value = (prop(props, name) as { status?: { name?: string } | null } | undefined)?.status;
  return value?.name ?? null;
}

function readMultiSelect(props: Props, name: string): string[] {
  const value = (prop(props, name) as { multi_select?: { name?: string }[] } | undefined)?.multi_select;
  return Array.isArray(value) ? value.map((v) => v.name ?? "").filter(Boolean) : [];
}

function readCheckbox(props: Props, name: string): boolean {
  return Boolean((prop(props, name) as { checkbox?: boolean } | undefined)?.checkbox);
}

function readNumber(props: Props, name: string): number | null {
  const value = (prop(props, name) as { number?: number | null } | undefined)?.number;
  return typeof value === "number" ? value : null;
}

function readUrl(props: Props, name: string): string {
  return ((prop(props, name) as { url?: string | null } | undefined)?.url ?? "") || "";
}

function readRelation(props: Props, name: string): string[] {
  const value = (prop(props, name) as { relation?: { id?: string }[] } | undefined)?.relation;
  return Array.isArray(value) ? value.map((v) => v.id ?? "").filter(Boolean) : [];
}

interface NotionFileEntry {
  name?: string;
  type?: string;
  external?: { url?: string };
  file?: { url?: string };
  file_upload?: { id?: string };
}

function readFileEntries(props: Props, name: string): NotionFileEntry[] {
  const value = (prop(props, name) as { files?: NotionFileEntry[] } | undefined)?.files;
  return Array.isArray(value) ? value : [];
}

function readFiles(props: Props, name: string): string[] {
  // A9 bug fix: the old order returned the file name instead of its URL, so a saved
  // photo opened as an empty link. URL first, name only as a last resort.
  return readFileEntries(props, name)
    .map((f) => f.external?.url ?? f.file?.url ?? f.name ?? "")
    .filter(Boolean);
}

interface DateValue {
  date: string | null;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
}

/** Notion date strings keep their wall clock; `Z` timestamps are converted to KST. */
export function splitNotionDate(value: string | undefined | null): DateValue {
  if (!value) return { date: null, time: null, endDate: null, endTime: null };
  let raw = value;
  if (raw.endsWith("Z") || /[+-]00:00$/.test(raw)) {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) {
      const kst = new Date(ms + 9 * 3600 * 1000);
      raw = kst.toISOString().slice(0, 19);
    }
  }
  const date = raw.slice(0, 10);
  const match = /T(\d{2}):(\d{2})/.exec(raw);
  return { date, time: match ? `${match[1]}:${match[2]}` : null, endDate: null, endTime: null };
}

function readDate(props: Props, name: string): DateValue {
  const value = (prop(props, name) as { date?: { start?: string; end?: string | null } | null } | undefined)?.date;
  if (!value?.start) return { date: null, time: null, endDate: null, endTime: null };
  const start = splitNotionDate(value.start);
  const end = splitNotionDate(value.end ?? null);
  return { date: start.date, time: start.time, endDate: end.date, endTime: end.time };
}

/* ── B2: properties the app was not written against ── */

const KNOWN: Record<string, string[]> = {
  calendar: ["제목", "유형", "분류", "날짜", "완료", "취소", "취소 사유", "취소 시각", "기타", "NOW 숨김", "즐겨찾기", "휴지통", "주간 키", "작성 기준일", "연결 프로젝트", "정렬"],
  projects: ["제목", "유형", "분류", "상태", "날짜", "마감일", "완료일", "확인일", "긴급", "중요", "NOW 숨김", "History", "휴지통", "기타", "대기 대상", "대기 내용", "취소 사유", "취소 시각", "반복 묶음 ID", "연결 프로젝트", "정렬"],
  routines: ["제목", "유형", "분류", "날짜", "반복 요일", "목표 횟수", "실행 횟수", "한 번의 양", "단위", "NOW 숨김", "History", "휴지통", "연결 루틴", "정렬"],
  binder: ["제목", "유형", "날짜", "링크", "태그", "즐겨찾기", "아카이브 표시", "휴지통", "기록 데이터", "사진", "연결 프로젝트", "정렬"],
  archive: ["제목", "유형", "날짜", "작성 기준일", "별점", "링크", "태그", "즐겨찾기", "휴지통", "기록 데이터", "사진", "연결 프로젝트", "정렬"],
};

const EXTRA_TYPES = new Set(["rich_text", "title", "checkbox", "select", "multi_select", "date", "number", "url", "formula", "status"]);

/** Import bookkeeping and Notion's own timestamps are not user-facing fields (see Phase 4 report). */
const INTERNAL = new Set([
  "원본 ID",
  "가져온 시각",
  "가져온 원본",
  "원본 분류",
  "원본 수정시각",
  "재확인 원본",
  "수정일",
  "작성일",
  "기록 데이터",
]);

export function readExtraProperties(resource: keyof typeof KNOWN, props: Props): ExtraProperty[] {
  const known = new Set(KNOWN[resource] ?? []);
  const out: ExtraProperty[] = [];
  for (const [name, raw] of Object.entries(props)) {
    if (known.has(name) || INTERNAL.has(name)) continue;
    const type = typeof raw?.type === "string" ? (raw.type as string) : "other";
    if (!EXTRA_TYPES.has(type)) continue;
    const value = readExtraValue(type, raw);
    if (type === "formula") {
      const formula = (raw as { formula?: { type?: string } }).formula;
      out.push({ name, type: `${type}:${formula?.type ?? "string"}`, readOnly: true, value });
    } else {
      out.push({ name, type, readOnly: false, value });
    }
  }
  return out;
}

function readExtraValue(type: string, raw: NotionProperty): string | number | boolean | string[] | null {
  switch (type) {
    case "title":
      return plainText((raw as { title?: unknown }).title);
    case "rich_text":
      return plainText((raw as { rich_text?: unknown }).rich_text);
    case "checkbox":
      return Boolean((raw as { checkbox?: boolean }).checkbox);
    case "select":
    case "status":
      return ((raw as { select?: { name?: string } | null; status?: { name?: string } | null }).select ??
        (raw as { status?: { name?: string } | null }).status)?.name ?? null;
    case "multi_select":
      return ((raw as { multi_select?: { name?: string }[] }).multi_select ?? []).map((v) => v.name ?? "").filter(Boolean);
    case "date": {
      const date = (raw as { date?: { start?: string; end?: string | null } | null }).date;
      if (!date?.start) return null;
      const start = splitNotionDate(date.start);
      const end = date.end ? splitNotionDate(date.end) : null;
      return end?.date && end.date !== start.date ? `${start.date}~${end.date}` : start.date;
    }
    case "number":
      return typeof (raw as { number?: number | null }).number === "number" ? (raw as { number: number }).number : null;
    case "url":
      return ((raw as { url?: string | null }).url ?? null) as string | null;
    case "formula": {
      const formula = (raw as { formula?: Record<string, unknown> }).formula ?? {};
      const kind = typeof formula.type === "string" ? (formula.type as string) : "string";
      const value = formula[kind];
      if (kind === "number" && typeof value === "number") return value;
      if (kind === "boolean") return Boolean(value);
      if (kind === "date") {
        const date = value as { start?: string } | null;
        return date?.start ? splitNotionDate(date.start).date : null;
      }
      return typeof value === "string" ? value : null;
    }
    default:
      return null;
  }
}

/* ────────────────────────────── writers ────────────────────────────── */

function chunks(text: string): { type: "text"; text: { content: string } }[] {
  if (!text) return [];
  const parts: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < text.length; i += 1900) {
    parts.push({ type: "text", text: { content: text.slice(i, i + 1900) } });
  }
  return parts;
}

const title = (value: string) => ({ title: chunks(value).map((c) => ({ type: "text", text: { content: c.text.content } })) });
const richText = (value: string) => ({ rich_text: chunks(value) });

/**
 * A5: writes the span list back as Notion `rich_text` items, keeping partial links,
 * bold/italic and newlines. Notion caps one item's content at 2000 characters.
 */
const richTextFromSpans = (spans: RichTextSpan[] | undefined) => {
  const items: Record<string, unknown>[] = [];
  for (const span of coerceSpans(spans ?? [])) {
    const annotations = {
      ...(span.bold ? { bold: true } : {}),
      ...(span.italic ? { italic: true } : {}),
    };
    for (let i = 0; i < span.text.length; i += 1900) {
      const content = span.text.slice(i, i + 1900);
      items.push({
        type: "text",
        text: { content, ...(span.href ? { link: { url: span.href } } : {}) },
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      });
    }
  }
  return { rich_text: items };
};
const select = (value: string | null | undefined) => ({ select: value ? { name: value } : null });
const status = (value: string | null | undefined) => ({ status: value ? { name: value } : null });
const multiSelect = (values: string[] | undefined) => ({ multi_select: (values ?? []).filter(Boolean).map((name) => ({ name })) });
const dateValue = (start: string | null | undefined, end?: string | null) => ({
  date: start ? { start, ...(end && end !== start ? { end } : {}) } : null,
});
const checkbox = (value: boolean | undefined) => ({ checkbox: Boolean(value) });
const number = (value: number | null | undefined) => ({ number: typeof value === "number" && Number.isFinite(value) ? value : null });
const relation = (ids: string[] | undefined) => ({ relation: (ids ?? []).filter(Boolean).map((id) => ({ id })) });
const url = (value: string | undefined) => ({ url: value && value.trim() ? value.trim() : null });
/**
 * A10: photos are written as Notion file uploads (`upload:<file_upload id>`) or as
 * external links. `existing` holds the page's current files so a Notion-hosted photo
 * that came back as a signed URL is re-sent as the same file object instead of being
 * turned into a short-lived external link.
 */
const files = (urls: string[], existing: NotionFileEntry[] = []) => ({
  files: urls
    .map((value) => {
      const clean = (value ?? "").trim();
      if (!clean) return null;
      if (clean.startsWith("upload:")) {
        const id = clean.slice("upload:".length).trim();
        return id ? { name: "photo", type: "file_upload", file_upload: { id } } : null;
      }
      if (!/^https?:\/\//i.test(clean)) return null;
      const kept = existing.find((entry) => (entry.external?.url ?? entry.file?.url ?? "") === clean);
      if (kept) return kept;
      return { name: photoName(clean), type: "external", external: { url: clean } };
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .slice(0, 20),
});

function photoName(value: string): string {
  const clean = value.split("?")[0] ?? value;
  const tail = clean.split("/").filter(Boolean).pop() ?? "photo";
  return decodeURIComponent(tail).slice(0, 90) || "photo";
}

function withTime(date: string, time: string | null | undefined): string {
  return time ? `${date}T${time}:00.000+09:00` : date;
}

/** '기타' keeps formatting when the client sends `memoRich`; plain `memo` still works. */
function memoValue(patch: Patch): Record<string, unknown> {
  if (has(patch, "memoRich")) return richTextFromSpans(patch["memoRich"] as RichTextSpan[]);
  return richText(str(patch, "memo"));
}

const has = (patch: Patch, key: string) => Object.prototype.hasOwnProperty.call(patch, key);
const str = (patch: Patch, key: string, fallback = ""): string => {
  const value = patch[key];
  return typeof value === "string" ? value : fallback;
};
const bool = (patch: Patch, key: string): boolean => patch[key] === true;
const numOrNull = (patch: Patch, key: string): number | null => {
  const value = patch[key];
  return typeof value === "number" ? value : null;
};
const strArray = (patch: Patch, key: string): string[] => {
  const value = patch[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
};

/* ────────────────────────────── mappers ────────────────────────────── */

/** B2: writes a value into a property the schema named dynamically. */
function extraPropertyValue(type: string, value: unknown): Record<string, unknown> | null {
  switch (type.split(":")[0]) {
    case "rich_text":
    case "title":
      return type.startsWith("title") ? title(typeof value === "string" ? value : "") : richText(typeof value === "string" ? value : "");
    case "checkbox":
      return checkbox(value === true);
    case "select":
      return select(typeof value === "string" && value ? value : null);
    case "multi_select":
      return multiSelect(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
    case "date": {
      const raw = typeof value === "string" ? value : "";
      if (!raw) return { date: null };
      const [start, end] = raw.split("~");
      return { date: { start: start?.slice(0, 10), ...(end ? { end: end.slice(0, 10) } : {}) } };
    }
    case "number":
      return { number: typeof value === "number" && Number.isFinite(value) ? value : null };
    case "url":
      return { url: typeof value === "string" && value.trim() ? value.trim() : null };
    default:
      return null;
  }
}

/** A14: the page's own icon — an emoji or a picture URL. */
function readIcon(page: NotionPage): { kind: "emoji" | "image"; value: string } | null {
  const raw = page.icon as
    | { type?: string; emoji?: string; external?: { url?: string }; file?: { url?: string }; custom_emoji?: { url?: string } }
    | null
    | undefined;
  if (!raw || !raw.type) return null;
  if (raw.type === "emoji" && raw.emoji) return { kind: "emoji", value: raw.emoji };
  if (raw.type === "external" && raw.external?.url) return { kind: "image", value: raw.external.url };
  if (raw.type === "file" && raw.file?.url) return { kind: "image", value: raw.file.url };
  if (raw.type === "custom_emoji" && raw.custom_emoji?.url) return { kind: "image", value: raw.custom_emoji.url };
  return null;
}

function baseOf(page: NotionPage, props: Props, resource: keyof typeof KNOWN) {
  return {
    id: page.id,
    url: page.url ?? page.id.replace(/-/g, ""),
    title: readTitle(props),
    icon: readIcon(page),
    hidden: readCheckbox(props, "NOW 숨김"),
    trash: readCheckbox(props, "휴지통"),
    favorite: readCheckbox(props, "즐겨찾기"),
    memo: readRichText(props, "기타"),
    memoRich: readRichSpans(props, "기타"),
    sort: readNumber(props, "정렬"),
    projectIds: readRelation(props, "연결 프로젝트"),
    createdAt: page.created_time ?? "",
    updatedAt: page.last_edited_time ?? "",
    extra: readExtraProperties(resource, props),
  };
}

export function mapCalendar(page: NotionPage): CalendarEvent {
  const props = page.properties;
  const when = readDate(props, "날짜");
  const canceled = readCheckbox(props, "취소");
  return {
    ...baseOf(page, props, "calendar"),
    kind: (readSelect(props, "유형") ?? "일정") as CalendarKind,
    category: (readSelect(props, "분류") ?? "개인") as CalendarCategory,
    date: when.date ?? "",
    startTime: when.time,
    endDate: when.endDate,
    endTime: when.endTime,
    allDay: !when.time,
    done: readCheckbox(props, "완료"),
    canceled,
    cancelReason: readRichText(props, "취소 사유"),
    cancelAt: readDate(props, "취소 시각").date,
    weekKey: readRichText(props, "주간 키"),
    baseDate: readDate(props, "작성 기준일").date,
  };
}

export function mapTask(page: NotionPage): ProjectTask {
  const props = page.properties;
  const when = readDate(props, "날짜");
  const due = readDate(props, "마감일");
  return {
    ...baseOf(page, props, "projects"),
    kind: (readSelect(props, "유형") ?? "할 일") as TaskKind,
    category: (readSelect(props, "분류") ?? "개인") as TaskCategory,
    status: (readStatus(props, "상태") ?? "미완료") as TaskStatus,
    date: when.date,
    // 시간 지정: the day sits in `date`, the clock in these two; an end that fell on
    // another day (edited in Notion) is not shown as this day's end time.
    startTime: when.time,
    endTime: when.time && (!when.endDate || when.endDate === when.date) ? when.endTime : null,
    due: due.date,
    doneAt: readDate(props, "완료일").date,
    checkedAt: readDate(props, "확인일").date,
    urgent: readCheckbox(props, "긴급"),
    important: readCheckbox(props, "중요"),
    history: readCheckbox(props, "History"),
    waitFor: readRichText(props, "대기 대상"),
    waitNote: readRichText(props, "대기 내용"),
    cancelReason: readRichText(props, "취소 사유"),
    cancelAt: readDate(props, "취소 시각").date,
    repeatGroupId: readRichText(props, "반복 묶음 ID"),
  };
}

export function mapRoutine(page: NotionPage): Routine {
  const props = page.properties;
  const when = readDate(props, "날짜");
  return {
    ...baseOf(page, props, "routines"),
    kind: (readSelect(props, "유형") ?? "루틴") as RoutineKind,
    // A16: keep whatever 분류 the row holds — 업무·개인·공부 or one the user made.
    category: (readSelect(props, "분류") ?? "개인") as Routine["category"],
    date: when.date,
    repeatDays: readMultiSelect(props, "반복 요일"),
    targetCount: readNumber(props, "목표 횟수"),
    execCount: readNumber(props, "실행 횟수"),
    amount: readNumber(props, "한 번의 양"),
    unit: readRichText(props, "단위"),
    history: readCheckbox(props, "History"),
    routineIds: readRelation(props, "연결 루틴"),
  };
}

export function mapBinder(page: NotionPage): BinderEntry {
  const props = page.properties;
  const when = readDate(props, "날짜");
  return {
    ...baseOf(page, props, "binder"),
    kind: (readSelect(props, "유형") ?? "일기") as BinderKind,
    date: when.date,
    endDate: when.endDate,
    endTime: when.endTime,
    link: readUrl(props, "링크"),
    tags: readMultiSelect(props, "태그"),
    archiveFlag: readCheckbox(props, "아카이브 표시"),
    body: readRichText(props, "기록 데이터"),
    photos: readFiles(props, "사진"),
  };
}

export function mapArchive(page: NotionPage): ArchiveEntry {
  const props = page.properties;
  const when = readDate(props, "날짜");
  return {
    ...baseOf(page, props, "archive"),
    kind: (readSelect(props, "유형") ?? "메모") as ArchiveKind,
    date: when.date ?? readDate(props, "작성 기준일").date,
    endDate: when.endDate,
    endTime: when.endTime,
    baseDate: readDate(props, "작성 기준일").date,
    rating: readNumber(props, "별점"),
    link: readUrl(props, "링크"),
    tags: readMultiSelect(props, "태그"),
    body: readRichText(props, "기록 데이터"),
    photos: readFiles(props, "사진"),
  };
}

export const mappers = {
  calendar: mapCalendar,
  projects: mapTask,
  routines: mapRoutine,
  binder: mapBinder,
  archive: mapArchive,
} as const;

/* ───────────────────────── build write payloads ────────────────────── */

export function buildProperties(resource: keyof typeof mappers, patch: Patch, current?: NotionPage): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const currentPhotos = current ? readFileEntries(current.properties as Props, "사진") : [];

  if (has(patch, "title")) out["제목"] = title(str(patch, "title"));

  if (resource === "calendar") {
    if (has(patch, "kind")) out["유형"] = select(str(patch, "kind", "일정"));
    if (has(patch, "category")) out["분류"] = select(str(patch, "category", "개인"));
    if (has(patch, "date") || has(patch, "startTime") || has(patch, "endDate") || has(patch, "endTime")) {
      const start = str(patch, "date");
      const startTime = typeof patch["startTime"] === "string" ? (patch["startTime"] as string) : null;
      const endDate = typeof patch["endDate"] === "string" ? (patch["endDate"] as string) : start;
      const endTime = typeof patch["endTime"] === "string" ? (patch["endTime"] as string) : null;
      out["날짜"] = start
        ? { date: { start: withTime(start, startTime), ...(endDate && (endDate !== start || endTime) ? { end: withTime(endDate, endTime) } : {}) } }
        : { date: null };
    }
    if (has(patch, "done")) out["완료"] = checkbox(bool(patch, "done"));
    if (has(patch, "canceled")) out["취소"] = checkbox(bool(patch, "canceled"));
    if (has(patch, "cancelReason")) out["취소 사유"] = richText(str(patch, "cancelReason"));
    if (has(patch, "cancelAt")) out["취소 시각"] = dateValue(patch["cancelAt"] as string | null);
    if (has(patch, "memo") || has(patch, "memoRich")) out["기타"] = memoValue(patch);
    if (has(patch, "weekKey")) out["주간 키"] = richText(str(patch, "weekKey"));
    if (has(patch, "baseDate")) out["작성 기준일"] = dateValue(patch["baseDate"] as string | null);
  }

  if (resource === "projects") {
    if (has(patch, "kind")) out["유형"] = select(str(patch, "kind", "할 일"));
    if (has(patch, "category")) out["분류"] = select(str(patch, "category", "개인"));
    if (has(patch, "status")) out["상태"] = status(str(patch, "status", "미완료"));
    if (has(patch, "date") || has(patch, "startTime") || has(patch, "endTime")) {
      // 시간 지정: `2026-11-21T14:00:00.000+09:00` (end `15:30:00.000+09:00`) — the same
      // KST ISO shape the calendar writes. Without a start time the day is saved alone.
      const start = typeof patch["date"] === "string" ? (patch["date"] as string) : null;
      const startTime = typeof patch["startTime"] === "string" && patch["startTime"] ? (patch["startTime"] as string) : null;
      const endTime = typeof patch["endTime"] === "string" && patch["endTime"] ? (patch["endTime"] as string) : null;
      const day = start ? start.slice(0, 10) : "";
      out["날짜"] = start
        ? {
            date: {
              start: withTime(day, startTime),
              ...(startTime && endTime && endTime > startTime ? { end: withTime(day, endTime) } : {}),
            },
          }
        : { date: null };
    }
    if (has(patch, "due")) out["마감일"] = dateValue(patch["due"] as string | null);
    if (has(patch, "doneAt")) out["완료일"] = dateValue(patch["doneAt"] as string | null);
    if (has(patch, "checkedAt")) out["확인일"] = dateValue(patch["checkedAt"] as string | null);
    if (has(patch, "urgent")) out["긴급"] = checkbox(bool(patch, "urgent"));
    if (has(patch, "important")) out["중요"] = checkbox(bool(patch, "important"));
    if (has(patch, "history")) out["History"] = checkbox(bool(patch, "history"));
    if (has(patch, "waitFor")) out["대기 대상"] = richText(str(patch, "waitFor"));
    if (has(patch, "waitNote")) out["대기 내용"] = richText(str(patch, "waitNote"));
    if (has(patch, "cancelReason")) out["취소 사유"] = richText(str(patch, "cancelReason"));
    if (has(patch, "cancelAt")) out["취소 시각"] = dateValue(patch["cancelAt"] as string | null);
    if (has(patch, "repeatGroupId")) out["반복 묶음 ID"] = richText(str(patch, "repeatGroupId"));
  }

  if (resource === "routines") {
    if (has(patch, "kind")) out["유형"] = select(str(patch, "kind", "루틴"));
    if (has(patch, "category")) out["분류"] = select(str(patch, "category", "개인"));
    if (has(patch, "date")) out["날짜"] = dateValue(patch["date"] as string | null);
    if (has(patch, "repeatDays")) out["반복 요일"] = multiSelect(strArray(patch, "repeatDays"));
    if (has(patch, "targetCount")) out["목표 횟수"] = number(numOrNull(patch, "targetCount"));
    if (has(patch, "execCount")) out["실행 횟수"] = number(numOrNull(patch, "execCount"));
    if (has(patch, "amount")) out["한 번의 양"] = number(numOrNull(patch, "amount"));
    if (has(patch, "unit")) out["단위"] = richText(str(patch, "unit"));
    if (has(patch, "history")) out["History"] = checkbox(bool(patch, "history"));
    if (has(patch, "routineIds")) out["연결 루틴"] = relation(strArray(patch, "routineIds"));
  }

  if (resource === "binder") {
    if (has(patch, "kind")) out["유형"] = select(str(patch, "kind", "일기"));
    if (has(patch, "date")) out["날짜"] = dateValue(patch["date"] as string | null);
    if (has(patch, "endDate") || has(patch, "endTime")) {
      const start = str(patch, "date");
      const endDate = typeof patch["endDate"] === "string" ? (patch["endDate"] as string) : null;
      const endTime = typeof patch["endTime"] === "string" ? (patch["endTime"] as string) : null;
      out["날짜"] = start ? { date: { start, ...(endDate && endDate !== start ? { end: withTime(endDate, endTime) } : endTime ? { end: withTime(start, endTime) } : {}) } } : { date: null };
    }
    if (has(patch, "link")) out["링크"] = url(str(patch, "link"));
    if (has(patch, "tags")) out["태그"] = multiSelect(strArray(patch, "tags"));
    if (has(patch, "archiveFlag")) out["아카이브 표시"] = checkbox(bool(patch, "archiveFlag"));
    if (has(patch, "body")) out["기록 데이터"] = richText(str(patch, "body"));
    if (has(patch, "photos")) out["사진"] = files(strArray(patch, "photos"), currentPhotos);
  }

  if (resource === "archive") {
    if (has(patch, "kind")) out["유형"] = select(str(patch, "kind", "메모"));
    if (has(patch, "date") || has(patch, "endDate") || has(patch, "endTime")) {
      const start = str(patch, "date");
      const endDate = typeof patch["endDate"] === "string" ? (patch["endDate"] as string) : null;
      const endTime = typeof patch["endTime"] === "string" ? (patch["endTime"] as string) : null;
      out["날짜"] = start
        ? { date: { start, ...(endDate && endDate !== start ? { end: withTime(endDate, endTime || (patch["endTime"] as string | null)) } : endTime ? { end: withTime(start, endTime) } : {}) } }
        : { date: null };
      if (!has(patch, "baseDate")) out["작성 기준일"] = dateValue(start || null);
    }
    if (has(patch, "baseDate")) out["작성 기준일"] = dateValue(patch["baseDate"] as string | null);
    if (has(patch, "rating")) out["별점"] = number(numOrNull(patch, "rating"));
    if (has(patch, "link")) out["링크"] = url(str(patch, "link"));
    if (has(patch, "tags")) out["태그"] = multiSelect(strArray(patch, "tags"));
    if (has(patch, "body")) out["기록 데이터"] = richText(str(patch, "body"));
    if (has(patch, "photos")) out["사진"] = files(strArray(patch, "photos"), currentPhotos);
  }

  // Shared flags (skipped silently for databases without the property).
  const shared: Record<string, string> = {
    hidden: "NOW 숨김",
    trash: "휴지통",
    favorite: "즐겨찾기",
    memo: "기타",
    sort: "정렬",
    projectIds: "연결 프로젝트",
  };
  const supports: Record<string, string[]> = {
    calendar: ["hidden", "trash", "favorite", "memo", "sort", "projectIds"],
    projects: ["hidden", "trash", "memo", "sort", "projectIds"],
    routines: ["hidden", "trash", "sort"],
    binder: ["trash", "favorite", "sort", "projectIds"],
    archive: ["trash", "favorite", "sort", "projectIds"],
  };
  for (const key of supports[resource] ?? []) {    const propertyName = shared[key];
    if (!propertyName || !has(patch, key)) continue;
    if (key === "hidden" || key === "trash" || key === "favorite") {
      out[propertyName] = checkbox(bool(patch, key));
    } else if (key === "memo") {
      out[propertyName] = memoValue(patch);
    } else if (key === "sort") {
      out[propertyName] = number(numOrNull(patch, "sort"));
    } else if (key === "projectIds") {
      out[propertyName] = relation(strArray(patch, "projectIds"));
    }
  }

  // B2: properties the schema added later (text · checkbox · select · date · number · url).
  if (Array.isArray(patch["extraEntries"])) {
    for (const entry of patch["extraEntries"] as { name?: string; type?: string; value?: unknown }[]) {
      if (!entry?.name || !entry.type) continue;
      const built = extraPropertyValue(entry.type, entry.value);
      if (built) out[entry.name] = built;
    }
  }

  return out;
}

export function defaultPatch(resource: keyof typeof mappers, patch: Patch): Patch {
  const out: Patch = { ...patch };
  if (resource === "calendar") {
    out["kind"] ??= "일정";
    out["category"] ??= "개인";
    out["done"] ??= false;
    out["canceled"] ??= false;
    out["weekKey"] ??= "";
  }
  if (resource === "projects") {
    out["kind"] ??= "할 일";
    out["category"] ??= "개인";
    out["status"] ??= "미완료";
  }
  if (resource === "routines") {
    out["kind"] ??= "루틴";
    out["category"] ??= "개인";
    out["targetCount"] ??= 1;
    out["execCount"] ??= 0;
    out["repeatDays"] ??= [];
  }
  if (resource === "binder") out["kind"] ??= "일기";
  if (resource === "archive") out["kind"] ??= "메모";
  return out;
}
