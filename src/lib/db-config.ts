/**
 * Notion database wiring.
 *
 * Values come from environment variables only. This kit ships **no** database
 * IDs: an empty variable means that database is not connected, and the app
 * shows setup guidance instead of falling back to somebody else's workspace.
 *
 * Labels, env var names and setup steps live in `db-meta.ts` so client
 * components can read them without touching `process.env`.
 */

import { DB_ENV_KEYS, DB_LABELS } from "./db-meta";
import type { Resource } from "./types";

export { DB_ENV_KEYS, DB_LABELS };

function env(name: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : "";
}

export const DB_IDS: Record<Resource, string> = {
  calendar: env(DB_ENV_KEYS.calendar),
  projects: env(DB_ENV_KEYS.projects),
  routines: env(DB_ENV_KEYS.routines),
  binder: env(DB_ENV_KEYS.binder),
  archive: env(DB_ENV_KEYS.archive),
};

export type ResourceKey = Resource;

export const RESOURCES: ResourceKey[] = ["calendar", "projects", "routines", "binder", "archive"];

export function isResourceKey(value: string): value is ResourceKey {
  return (RESOURCES as string[]).includes(value);
}

/** A database is connected only when its environment variable holds an ID. */
export function isDbConfigured(resource: ResourceKey): boolean {
  return DB_IDS[resource].length > 0;
}

export function unconfiguredResources(): ResourceKey[] {
  return RESOURCES.filter((resource) => !isDbConfigured(resource));
}

/** Message shown in the UI and returned by the API when a DB is missing. */
export function dbSetupMessage(resource: ResourceKey): string {
  const envKey = DB_ENV_KEYS[resource];
  return `${DB_LABELS[resource]} DB가 연결되지 않았습니다. 서버 환경변수 ${envKey} 에 노션 DB ID를 넣고 다시 배포하면 사용할 수 있습니다. (설정 → 연결에서 상태를 확인할 수 있습니다.)`;
}
