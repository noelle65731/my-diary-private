import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { hasNotionToken, NotionError, ensureSelectProperty } from "@/lib/notion";
import { DB_IDS } from "@/lib/db-config";
import { EVENT_COLORS } from "@/components/common/event-colors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 색 select 의 선택지 이름 — 앱의 색 팔레트와 같은 열 가지(기본은 비우는 값이라 넣지 않습니다). */
const OPTIONS = EVENT_COLORS.filter((choice) => choice.key !== "default").map((choice) => choice.label);

/**
 * A40: 일정 색을 PC·모바일이 함께 쓰도록 Calendar 기록 DB 에 `색` select 속성을 준비합니다.
 * 이미 있으면 아무 것도 바꾸지 않고, 없으면 선택지까지 만들어 둡니다.
 * 토큰이 없거나 DB 가 미연결이면 조용히 건너뜁니다(앱은 localStorage 색으로 계속 동작).
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: { message: "로그인이 필요합니다.", code: "unauthorized" } }, { status: 401 });
  }
  if (!hasNotionToken()) return NextResponse.json({ ok: true, skipped: "no_token", exists: false });
  const databaseId = DB_IDS.calendar;
  if (!databaseId) return NextResponse.json({ ok: true, skipped: "no_calendar_db", exists: false });

  try {
    const result = await ensureSelectProperty(databaseId, "색", OPTIONS);
    return NextResponse.json({ ok: true, exists: true, created: result === "created" });
  } catch (error) {
    const message = error instanceof NotionError ? error.message : "색 속성을 준비하지 못했습니다.";
    return NextResponse.json({ ok: false, exists: false, error: { message, code: "color_schema_error" } }, { status: 500 });
  }
}
