import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authRequired, isAuthorized } from "@/lib/auth";
import { hasNotionToken, probeDatabase } from "@/lib/notion";
import { DB_ENV_KEYS, DB_IDS, DB_LABELS, RESOURCES, type ResourceKey } from "@/lib/db-config";
import type { DbStatus, Resource } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A DB probe is metadata-only; cache it so repeated status calls stay cheap. */
const PROBE_TTL_MS = 60_000;
let probeCache: { at: number; dbs: Record<ResourceKey, DbStatus> } | null = null;

async function dbStatuses(withProbe: boolean, fresh = false): Promise<Record<ResourceKey, DbStatus>> {
  if (withProbe && !fresh && probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) {
    return probeCache.dbs;
  }

  const entries = await Promise.all(
    RESOURCES.map(async (resource): Promise<[ResourceKey, DbStatus]> => {
      const configured = DB_IDS[resource].length > 0;
      const base = { label: DB_LABELS[resource], envKey: DB_ENV_KEYS[resource], configured };

      if (!configured) {
        return [
          resource,
          {
            ...base,
            ok: false,
            message: `${DB_ENV_KEYS[resource]} 가 비어 있어 이 DB는 미연결 상태입니다.`,
          },
        ];
      }
      if (!withProbe) {
        return [resource, { ...base, ok: true, message: "연결됨" }];
      }

      const probe = await probeDatabase(DB_IDS[resource]);
      return [resource, { ...base, ok: probe.ok, message: probe.message }];
    }),
  );

  const dbs = Object.fromEntries(entries) as Record<ResourceKey, DbStatus>;
  if (withProbe) probeCache = { at: Date.now(), dbs };
  return dbs;
}

/** `?fresh=1` skips the probe cache — the settings screen's refresh button uses it. */
export async function GET(request: NextRequest) {
  const tokenPresent = hasNotionToken();
  const needsPassword = authRequired();
  const authenticated = await isAuthorized(request);
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";

  const dbs = await dbStatuses(tokenPresent, fresh);
  const unconfigured = RESOURCES.filter((resource) => !dbs[resource].configured) as Resource[];

  return NextResponse.json({
    ok: true,
    needsToken: !tokenPresent,
    needs_token: !tokenPresent,
    authRequired: needsPassword,
    authenticated,
    missing: tokenPresent ? [] : ["NOTION_TOKEN"],
    dbs,
    unconfigured,
  });
}
