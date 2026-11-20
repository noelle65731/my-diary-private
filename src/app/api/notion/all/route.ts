import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { hasNotionToken, NotionError, queryDatabase } from "@/lib/notion";
import { mappers } from "@/lib/notion-map";
import { DB_IDS, RESOURCES, type ResourceKey } from "@/lib/db-config";
import { emptyData } from "@/lib/types";
import type { AllData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One round trip for the whole app — five Notion queries, sequentially. */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: { message: "로그인이 필요합니다.", code: "unauthorized" } }, { status: 401 });
  }

  // Databases without an ID are never queried: they come back as `unconfigured`
  // so the client can show setup guidance instead of a 404 from Notion.
  const unconfigured = RESOURCES.filter((resource) => DB_IDS[resource].length === 0);

  if (!hasNotionToken()) {
    return NextResponse.json({ ok: true, needsToken: true, needs_token: true, data: emptyData(), errors: {}, unconfigured });
  }

  const data: AllData = emptyData();
  const errors: Partial<Record<ResourceKey, string>> = {};
  let fatal: string | null = null;

  for (const resource of RESOURCES) {
    if (!DB_IDS[resource]) continue;
    try {
      const pages = await queryDatabase(DB_IDS[resource]);
      const map = mappers[resource] as (page: import("@/lib/notion").NotionPage) => unknown;
      const items = pages.filter((p) => !p.archived).map((p) => map(p));
      (data[resource] as unknown[]) = items;
    } catch (error) {
      const message = error instanceof NotionError ? error.message : "Notion을 불러오지 못했습니다.";
      errors[resource] = message;
      if (error instanceof NotionError && (error.status === 401 || error.code === "missing_token")) {
        fatal = message;
        break;
      }
    }
  }

  return NextResponse.json({
    ok: !fatal,
    needsToken: false,
    needs_token: false,
    data,
    errors,
    unconfigured,
    error: fatal ? { message: fatal, code: "notion_error" } : undefined,
  });
}
