/**
 * Notion database wiring.
 *
 * Values come from environment variables so this repository can be forked and
 * used as a generic kit. The defaults below point at the original workspace.
 */

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

export const DB_IDS = {
  calendar: env("NOTION_CALENDAR_DB_ID", "41d6ed96-9c5d-81d9-b6e9-c1e1becd2b91"),
  projects: env("NOTION_PROJECTS_DB_ID", "41d6ed96-9c5d-8168-81d2-db94f71eae36"),
  routines: env("NOTION_ROUTINE_DB_ID", "41d6ed96-9c5d-81f2-9ffe-c119024e6a0d"),
  binder: env("NOTION_BINDER_DB_ID", "41d6ed96-9c5d-818e-8dd4-ded353ee362f"),
  archive: env("NOTION_ARCHIVE_DB_ID", "41d6ed96-9c5d-81f2-983a-e865c94e692c"),
} as const;

export type ResourceKey = keyof typeof DB_IDS;

export const RESOURCES: ResourceKey[] = ["calendar", "projects", "routines", "binder", "archive"];

export function isResourceKey(value: string): value is ResourceKey {
  return (RESOURCES as string[]).includes(value);
}

export const DB_LABELS: Record<ResourceKey, string> = {
  calendar: "Calendar 기록",
  projects: "프로젝트 · 할 일",
  routines: "루틴 · 체크 기록",
  binder: "일기 · 노트",
  archive: "아카이브",
};

/** Titles used in the setup screen, so a fork knows what to point at. */
export const ENV_KEYS: { key: string; label: string; defaultValue: string }[] = [
  { key: "NOTION_TOKEN", label: "Notion 통합 토큰", defaultValue: "(필수)" },
  { key: "NOTION_CALENDAR_DB_ID", label: "캘린더 DB", defaultValue: DB_IDS.calendar },
  { key: "NOTION_PROJECTS_DB_ID", label: "프로젝트 DB", defaultValue: DB_IDS.projects },
  { key: "NOTION_ROUTINE_DB_ID", label: "루틴 DB", defaultValue: DB_IDS.routines },
  { key: "NOTION_BINDER_DB_ID", label: "일기·노트 DB", defaultValue: DB_IDS.binder },
  { key: "NOTION_ARCHIVE_DB_ID", label: "아카이브 DB", defaultValue: DB_IDS.archive },
  { key: "DIARY_PASSWORD", label: "접속 비밀번호 (선택)", defaultValue: "(없으면 공개)" },
];
