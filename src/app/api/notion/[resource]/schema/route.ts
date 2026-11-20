import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { hasNotionToken, NotionError, retrieveDatabaseSchema } from "@/lib/notion";
import { DB_IDS, isResourceKey } from "@/lib/db-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * B2: the properties of one database, including ones added in Notion after setup.
 * Read-only: nothing here creates or changes a property.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (!isResourceKey(resource)) {
    return NextResponse.json({ ok: false, error: { message: "알 수 없는 리소스입니다.", code: "bad_resource" } }, { status: 404 });
  }
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: { message: "로그인이 필요합니다.", code: "unauthorized" } }, { status: 401 });
  }
  if (!hasNotionToken()) {
    return NextResponse.json({ ok: true, needsToken: true, data: [] });
  }
  if (!DB_IDS[resource]) {
    return NextResponse.json({ ok: true, data: [], unconfigured: true });
  }
  try {
    const properties = await retrieveDatabaseSchema(DB_IDS[resource]);
    return NextResponse.json({ ok: true, data: properties });
  } catch (error) {
    const message = error instanceof NotionError ? error.message : "속성을 불러오지 못했습니다.";
    return NextResponse.json({ ok: false, error: { message, code: "schema_error" } }, { status: 500 });
  }
}
