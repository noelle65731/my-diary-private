import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { createPage, hasNotionToken, NotionError, queryDatabase } from "@/lib/notion";
import type { NotionPage } from "@/lib/notion";
import { buildProperties, defaultPatch, mappers } from "@/lib/notion-map";
import { DB_ENV_KEYS, DB_IDS, DB_LABELS, dbSetupMessage, isResourceKey, type ResourceKey } from "@/lib/db-config";
import { TASK_CATEGORIES, TASK_STATUSES } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: unknown, status = 500) {
  const message = error instanceof NotionError ? error.message : "요청을 처리하지 못했습니다.";
  const code = error instanceof NotionError ? error.code : "server_error";
  const httpStatus = error instanceof NotionError && error.status >= 400 ? error.status : status;
  return NextResponse.json({ ok: false, error: { message, code } }, { status: httpStatus });
}

/** Notion is never called for a database whose ID is empty. */
function notConfigured(resource: ResourceKey) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        message: dbSetupMessage(resource),
        code: "db_not_configured",
        db: DB_LABELS[resource],
        envKey: DB_ENV_KEYS[resource],
        resource,
      },
    },
    { status: 503 },
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (!isResourceKey(resource)) {
    return NextResponse.json({ ok: false, error: { message: "알 수 없는 리소스입니다.", code: "bad_resource" } }, { status: 404 });
  }
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: { message: "로그인이 필요합니다.", code: "unauthorized" } }, { status: 401 });
  }
  if (!hasNotionToken()) {
    return NextResponse.json({ ok: true, needsToken: true, needs_token: true, data: [] });
  }
  if (!DB_IDS[resource]) return notConfigured(resource);

  try {
    const pages = await queryDatabase(DB_IDS[resource]);
    const map = mappers[resource] as (page: NotionPage) => unknown;
    return NextResponse.json({ ok: true, data: pages.filter((p) => !p.archived).map((p) => map(p)) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (!isResourceKey(resource)) {
    return NextResponse.json({ ok: false, error: { message: "알 수 없는 리소스입니다.", code: "bad_resource" } }, { status: 404 });
  }
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: { message: "로그인이 필요합니다.", code: "unauthorized" } }, { status: 401 });
  }
  if (!hasNotionToken()) {
    return NextResponse.json(
      { ok: false, error: { message: "NOTION_TOKEN 이 설정되지 않았습니다.", code: "missing_token" } },
      { status: 503 },
    );
  }
  if (!DB_IDS[resource]) return notConfigured(resource);

  let patch: Record<string, unknown>;
  try {
    patch = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: { message: "잘못된 요청입니다.", code: "bad_request" } }, { status: 400 });
  }

  const titleValue = typeof patch["title"] === "string" ? patch["title"].trim() : "";
  if (!titleValue) {
    return NextResponse.json({ ok: false, error: { message: "제목을 입력해 주세요.", code: "missing_title" } }, { status: 400 });
  }
  if (resource === "projects") {
    const category = patch["category"];
    if (typeof category === "string" && !TASK_CATEGORIES.includes(category as (typeof TASK_CATEGORIES)[number])) {
      delete patch["category"];
    }
    const status = patch["status"];
    if (typeof status === "string" && !TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
      delete patch["status"];
    }
  }

  try {
    const page = await createPage(DB_IDS[resource], buildProperties(resource, defaultPatch(resource, patch)));
    const map = mappers[resource] as (page: NotionPage) => unknown;
    return NextResponse.json({ ok: true, data: map(page) });
  } catch (error) {
    return fail(error);
  }
}
