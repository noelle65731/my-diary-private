import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { hasNotionToken, NotionError, uploadFileToNotion } from "@/lib/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A10: a chosen photo file is sent here, forwarded to Notion's File Upload API and
 * answered with a `file_upload` id. The record's 사진 property stores
 * `upload:<id>`; on the next read Notion returns a fresh signed URL, so the photo
 * survives a reload and stays linked to the Notion record.
 *
 * The browser compresses the picture first, so only a small JPEG reaches this route.
 */
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: { message: "로그인이 필요합니다.", code: "unauthorized" } }, { status: 401 });
  }
  if (!hasNotionToken()) {
    return NextResponse.json(
      { ok: false, error: { message: "Notion 연결이 없어 사진을 저장할 수 없습니다. 미리보기 모드에서는 사진이 저장되지 않습니다.", code: "missing_token" } },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: { message: "사진을 읽지 못했습니다.", code: "bad_form" } }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: { message: "사진 파일이 없습니다.", code: "no_file" } }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: { message: "5MB 이하 사진만 저장할 수 있습니다. 더 큰 사진은 화면에서 자동으로 줄여 다시 시도해 주세요.", code: "too_large" } },
      { status: 413 },
    );
  }

  const name = (file.name || "photo.jpg").slice(0, 120);
  const type = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
  try {
    const uploaded = await uploadFileToNotion(name, type, await file.arrayBuffer());
    return NextResponse.json({ ok: true, data: { token: `upload:${uploaded.id}`, id: uploaded.id, name } });
  } catch (error) {
    const message = error instanceof NotionError ? error.message : "사진을 저장하지 못했습니다.";
    const status = error instanceof NotionError && error.status >= 400 ? error.status : 500;
    return NextResponse.json({ ok: false, error: { message, code: "upload_failed" } }, { status });
  }
}
