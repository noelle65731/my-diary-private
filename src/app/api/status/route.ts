import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authRequired, isAuthorized } from "@/lib/auth";
import { hasNotionToken } from "@/lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tokenPresent = hasNotionToken();
  const needsPassword = authRequired();
  const authenticated = await isAuthorized(request);

  return NextResponse.json({
    ok: true,
    needsToken: !tokenPresent,
    needs_token: !tokenPresent,
    authRequired: needsPassword,
    authenticated,
    missing: tokenPresent ? [] : ["NOTION_TOKEN"],
  });
}
