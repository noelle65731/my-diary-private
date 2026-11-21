import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { archivePage, hasNotionToken, NotionError, retrievePage, updatePage, isNotionPageId, type NotionIcon } from "@/lib/notion";
import type { NotionPage } from "@/lib/notion";
import { buildProperties, mappers } from "@/lib/notion-map";
import { DB_ENV_KEYS, DB_IDS, DB_LABELS, dbSetupMessage, isResourceKey, type ResourceKey } from "@/lib/db-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: unknown) {
  const message = error instanceof NotionError ? error.message : "요청을 처리하지 못했습니다.";
  const code = error instanceof NotionError ? error.code : "server_error";
  const status = error instanceof NotionError && error.status >= 400 ? error.status : 500;
  return NextResponse.json({ ok: false, error: { message, code } }, { status });
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ resource: string; id: string }> },
) {
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
  if (!DB_IDS[resource]) return notConfigured(resource);

  let patch: Record<string, unknown>;
  try {
    patch = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: { message: "잘못된 요청입니다.", code: "bad_request" } }, { status: 400 });
  }

  try {
    // B3: when the client sends the version it edited, a newer server version is a
    // conflict — the two values are shown side by side instead of silently overwritten.
    const expected = typeof patch["expectedUpdatedAt"] === "string" ? (patch["expectedUpdatedAt"] as string) : "";
    delete patch["expectedUpdatedAt"];
    let currentPage: NotionPage | null = null;
    // A drag move sends only `date`; the page is read as well so the clock the row
    // already had is written back instead of being dropped from `날짜`.
    const touchesDate = ["date", "startTime", "endTime", "endDate"].some((key) =>
      Object.prototype.hasOwnProperty.call(patch, key),
    );
    if (expected || touchesDate || Object.prototype.hasOwnProperty.call(patch, "photos")) {
      currentPage = await retrievePage(id);
    }
    if (expected && currentPage) {
      const stamp = currentPage.last_edited_time ?? "";
      if (stamp && stamp !== expected) {
        const mapConflict = mappers[resource] as (page: NotionPage) => unknown;
        return NextResponse.json(
          {
            ok: false,
            error: { message: "다른 곳에서 먼저 수정되었습니다.", code: "conflict" },
            current: mapConflict(currentPage),
            serverUpdatedAt: stamp,
          },
          { status: 409 },
        );
      }
    }
    // A14: a page icon (emoji or picture) travels with the same PATCH.
    const rawIcon = patch["icon"];
    delete patch["icon"];
    let icon: NotionIcon | undefined;
    if (rawIcon === null) {
      icon = null;
    } else if (rawIcon && typeof rawIcon === "object") {
      const shape = rawIcon as { kind?: unknown; value?: unknown };
      const kind = shape.kind;
      const value = typeof shape.value === "string" ? shape.value.trim() : "";
      if (kind === "emoji" && value) {
        icon = { type: "emoji", emoji: value };
      } else if (kind === "image" && value) {
        if (value.startsWith("upload:")) icon = { type: "file_upload", file_upload: { id: value.slice("upload:".length) } };
        else if (/^https?:\/\//i.test(value)) icon = { type: "external", external: { url: value } };
        else return NextResponse.json({ ok: false, error: { message: "이미지 주소가 올바르지 않습니다.", code: "bad_icon" } }, { status: 400 });
      }
    }

    const page = await updatePage(id, buildProperties(resource, patch, currentPage ?? undefined), icon);
    const map = mappers[resource] as (page: NotionPage) => unknown;
    return NextResponse.json({ ok: true, data: map(page) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ resource: string; id: string }> },
) {
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
  if (!DB_IDS[resource]) return notConfigured(resource);

  const permanent = new URL(request.url).searchParams.get("permanent") === "1";

  try {
    if (permanent) {
      await archivePage(id);
      return NextResponse.json({ ok: true, deleted: true });
    }
    const page = await updatePage(id, buildProperties(resource, { trash: true }));
    const map = mappers[resource] as (page: NotionPage) => unknown;
    return NextResponse.json({ ok: true, data: map(page) });
  } catch (error) {
    return fail(error);
  }
}
