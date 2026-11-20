/**
 * Shared data model for the diary.
 *
 * Every record mirrors one row of a Notion database. Property names live in
 * `notion-map.ts`; this file only describes the shape the UI works with.
 */

export type Resource = "calendar" | "projects" | "routines" | "binder" | "archive";

export type CalendarKind = "일정" | "주간 목표" | "주간 메모" | "월간 메모";
export type CalendarCategory = "개인" | "외부일정" | "성과" | "휴먼네트워크";

export type TaskKind = "프로젝트" | "할 일";
export type TaskCategory = "업무" | "개인" | "공부";
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

export interface BaseItem {
  id: string;
  url: string;
  title: string;
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
  category: "개인" | "공부";
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
export const CALENDAR_CATEGORIES: CalendarCategory[] = ["개인", "외부일정", "성과", "휴먼네트워크"];
export const TASK_KINDS: TaskKind[] = ["프로젝트", "할 일"];
export const TASK_CATEGORIES: TaskCategory[] = ["업무", "개인", "공부"];
export const TASK_STATUSES: TaskStatus[] = ["미완료", "대기 중", "완료", "취소"];
export const ROUTINE_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
export const BINDER_KINDS: BinderKind[] = ["일기", "노트"];
export const ARCHIVE_KINDS: ArchiveKind[] = ["메모", "책", "영화", "레퍼런스", "읽을거리"];

export type ModeFilter = "now" | "all" | "업무" | "개인" | "공부";

export function emptyData(): AllData {
  return { calendar: [], projects: [], routines: [], binder: [], archive: [] };
}
