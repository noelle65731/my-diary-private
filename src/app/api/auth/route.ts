import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authRequired,
  checkPassword,
  isAuthorized,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionValue,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    ok: true,
    authRequired: authRequired(),
    authenticated: await isAuthorized(request),
  });
}

export async function POST(request: NextRequest) {
  let body: { password?: string } = {};
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: { message: "잘못된 요청입니다.", code: "bad_request" } },
      { status: 400 },
    );
  }

  if (!(await checkPassword(body.password ?? ""))) {
    return NextResponse.json(
      { ok: false, error: { message: "비밀번호가 맞지 않습니다.", code: "wrong_password" } },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true, authenticated: true });
  if (authRequired()) {
    response.cookies.set(SESSION_COOKIE, await sessionValue(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  }
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, authenticated: false });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
