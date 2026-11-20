import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { hasNotionToken, isNotionPageId, NotionError, readPageBody, replacePageBody } from "@/lib/notion";
import { DB_IDS, dbSetupMessage, isResourceKey } from "@/lib/db-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guards a runaway body; Notion itself allows far more than a diary paragraph page. */
const MAX_BODY = 40_000;

function fail(error: unknown) {
  const message = error instanceof NotionError ? error.message : "요청을 처리하지 못했습니다.";
  const code = error instanceof NotionError ? error.code : "server_error";
  const status = error instanceof NotionError && error.status >= 400 ? error.status : 500;
  return NextResponse.json({ ok: false, error: { message, code } }, { status });
}

async function guard(
  request: NextRequest,
  context: { params: Promise<{ resource: string; id: string }> },
): Promise<{ resource: string; id: string } | NextResponse> {
  const { resource, id } = await context.params;
  if (!isResourceKey(resource) || !isNotionPageId(id)) {
    return NextResponse.json({ ok: false, error: { message: "잘못된 대상입니다.", code: "bad_target" } }, { status: 400 });
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
  if (!DB_IDS[resource as keyof typeof DB_IDS]) {
    return NextResponse.json(
      { ok: false, error: { message: dbSetupMessage(resource as keyof typeof DB_IDS), code: "db_not_configured" } },
      { status: 503 },
    );
  }
  return { resource, id };
}

/** A5: the page body ('내용') of one record. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ resource: string; id: string }> },
) {
  const checked = await guard(request, context);
  if (checked instanceof NextResponse) return checked;
  try {
    return NextResponse.json({ ok: true, data: await readPageBody(checked.id) });
  } catch (error) {
    return fail(error);
  }
}

/** A5: replaces the paragraph text of the page body, leaving other blocks intact. */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ resource: string; id: string }> },
) {
  const checked = await guard(request, context);
  if (checked instanceof NextResponse) return checked;

  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: { message: "잘못된 요청입니다.", code: "bad_request" } }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : null;
  if (text === null || text.length > MAX_BODY) {
    return NextResponse.json(
      { ok: false, error: { message: "본문은 문자열이어야 하며 40,000자 이하여야 합니다.", code: "bad_body" } },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ ok: true, data: await replacePageBody(checked.id, text) });
  } catch (error) {
    return fail(error);
  }
}
