/**
 * Shared data model for the diary.
 *
 * Every record mirrors one row of a Notion database. Property names live in
 * `notion-map.ts`; this file only describes the shape the UI works with.
 */

export type Resource = "calendar" | "projects" | "routines" | "binder" | "archive";

export type CalendarKind = "일정" | "주간 목표" | "주간 메모" | "월간 메모";
export type CalendarCategory = "업무" | "개인" | "공부" | "외부일정" | "성과" | "휴먼네트워크";

export type TaskKind = "프로젝트" | "할 일";
/** A16: 업무·개인·공부 plus any 분류 the user made (Notion select keeps the name). */
export type TaskCategory = "업무" | "개인" | "공부" | (string & {});
export type TaskStatus = "미완료" | "대기 중" | "완료" | "취소";

export type RoutineKind = "루틴" | "날짜별 체크";
export type BinderKind = "일기" | "노트";
export type ArchiveKind = "메모" | "책" | "영화" | "레퍼런스" | "읽을거리";

export interface RichTextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** 부분 링크 */
  href?: string | null;
}

/** B2: a Notion property the app did not know when it was written. */
export interface ExtraProperty {
  name: string;
  type: string;
  /** formula · rollup · created_time … are shown read-only. */
  readOnly: boolean;
  value: string | number | boolean | string[] | null;
  options?: string[];
}

/** A project's own icon — an emoji or a picture that fills the cell. */
export interface ItemIcon {
  kind: "emoji" | "image";
  value: string;
}

export interface BaseItem {
  id: string;
  url: string;
  title: string;
  /** Notion page icon (emoji · external URL · uploaded file) */
  icon?: ItemIcon | null;
  /** NOW 숨김 */
  hidden: boolean;
  /** 휴지통 */
  trash: boolean;
  /** 즐겨찾기 */
  favorite: boolean;
  /** 기타 — Notion `rich_text` 속성의 평문 */
  memo: string;
  /** 기타 — 굵게·기울임·부분 링크·줄바꿈을 그대로 담은 서식 구간 */
  memoRich?: RichTextSpan[];
  sort: number | null;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
  /** B2: dynamically added Notion properties (text · checkbox · select · date · number · url · formula). */
  extra?: ExtraProperty[];
}

export interface CalendarEvent extends BaseItem {
  kind: CalendarKind;
  category: CalendarCategory;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM — null when all-day */
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  allDay: boolean;
  done: boolean;
  canceled: boolean;
  cancelReason: string;
  cancelAt: string | null;
  weekKey: string;
  baseDate: string | null;
}

export interface ProjectTask extends BaseItem {
  kind: TaskKind;
  category: TaskCategory;
  status: TaskStatus;
  date: string | null;
  due: string | null;
  doneAt: string | null;
  checkedAt: string | null;
  urgent: boolean;
  important: boolean;
  history: boolean;
  waitFor: string;
  waitNote: string;
  cancelReason: string;
  cancelAt: string | null;
  repeatGroupId: string;
}

export interface Routine extends BaseItem {
  kind: RoutineKind;
  /** A16: the same 분류 as projects — 업무·개인·공부 and user-made ones. */
  category: TaskCategory;
  date: string | null;
  repeatDays: string[];
  targetCount: number | null;
  execCount: number | null;
  amount: number | null;
  unit: string;
  history: boolean;
  routineIds: string[];
}

export interface BinderEntry extends BaseItem {
  kind: BinderKind;
  date: string | null;
  /** A9: optional end of a record (date range). */
  endDate?: string | null;
  endTime?: string | null;
  link: string;
  tags: string[];
  archiveFlag: boolean;
  /** 본문 (기록 데이터) */
  body: string;
  photos: string[];
}

export interface ArchiveEntry extends BaseItem {
  kind: ArchiveKind;
  date: string | null;
  /** A9: optional end of a record (date range · time). */
  endDate?: string | null;
  endTime?: string | null;
  baseDate: string | null;
  rating: number | null;
  link: string;
  tags: string[];
  body: string;
  photos: string[];
}

export type AnyItem = CalendarEvent | ProjectTask | Routine | BinderEntry | ArchiveEntry;

export interface AllData {
  calendar: CalendarEvent[];
  projects: ProjectTask[];
  routines: Routine[];
  binder: BinderEntry[];
  archive: ArchiveEntry[];
}

export interface DbStatus {
  /** Human name of the database, e.g. `Calendar 기록`. */
  label: string;
  /** Environment variable that holds its ID. */
  envKey: string;
  /** True when the environment variable holds an ID. */
  configured: boolean;
  /** True when Notion answered for that ID (only checked while a token exists). */
  ok: boolean;
  /** `연결됨` / setup guidance / the Notion error. */
  message: string;
}

export interface StatusPayload {
  ok: boolean;
  needsToken: boolean;
  authRequired: boolean;
  authenticated: boolean;
  demo?: boolean;
  missing?: string[];
  message?: string;
  /** Connection state of the five databases, keyed by resource. */
  dbs?: Partial<Record<Resource, DbStatus>>;
  /** Resources whose DB ID is empty — they are skipped, never queried. */
  unconfigured?: Resource[];
}

export const CALENDAR_KINDS: CalendarKind[] = ["일정", "주간 목표", "주간 메모", "월간 메모"];
/** A10: the classification the app uses now (the same 업무·개인·공부 as projects). */
export const CALENDAR_CATEGORIES: CalendarCategory[] = ["업무", "개인", "공부"];/** The old Calendar choices — no longer offered anywhere. */
export const CALENDAR_LEGACY_CATEGORIES: CalendarCategory[] = ["외부일정", "성과", "휴먼네트워크"];

/** A record still holding an old value is shown (and saved) as its current equivalent. */
export function currentCalendarCategory(category: string | null | undefined): "업무" | "개인" | "공부" {
  if (category === "업무" || category === "공부" || category === "개인") return category;
  if (category === "외부일정" || category === "성과") return "업무";
  return "개인";
}

export function isLegacyCalendarCategory(category: string | null | undefined): boolean {
  return category === "외부일정" || category === "성과" || category === "휴먼네트워크";
}
export const TASK_KINDS: TaskKind[] = ["프로젝트", "할 일"];
export const TASK_CATEGORIES: TaskCategory[] = ["업무", "개인", "공부"];
/** A16: the built-in 분류 shown first in every picker and filter. */
export const BASE_CATEGORIES: string[] = ["업무", "개인", "공부"];
export const TASK_STATUSES: TaskStatus[] = ["미완료", "대기 중", "완료", "취소"];
export const ROUTINE_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
export const BINDER_KINDS: BinderKind[] = ["일기", "노트"];
export const ARCHIVE_KINDS: ArchiveKind[] = ["메모", "책", "영화", "레퍼런스", "읽을거리"];

/** A6: `all` (기본) · `now` · a built-in or user-made category · `custom` (주간 맞춤). */
export type ModeFilter = "now" | "all" | "custom" | "업무" | "개인" | "공부" | (string & {});

export function emptyData(): AllData {
  return { calendar: [], projects: [], routines: [], binder: [], archive: [] };
}
