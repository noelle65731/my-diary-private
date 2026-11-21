import type { AnyItem } from "./types";

/** Bookkeeping fields that differ on every save and say nothing about the values. */
const SKIP = new Set(["updatedAt", "createdAt", "url", "id"]);

/**
 * The keys whose two versions really differ. A version pair that differs only in
 * timestamps has nothing to show, so the conflict sheet stays shut.
 */
export function differingKeys(local: AnyItem, server: AnyItem): string[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(server)]);
  const out: string[] = [];
  for (const key of keys) {
    if (SKIP.has(key)) continue;
    const a = (local as unknown as Record<string, unknown>)[key];
    const b = (server as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(key);
  }
  return out;
}
