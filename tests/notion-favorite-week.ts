/**
 * A29 검증 — 주간 캘린더 오른쪽 '이번 주 꼭'에 엔터로 더한 항목이 저장 뒤에도 남는지.
 *
 *     PATH=/workspace/work/nodejs/node-v20.19.0-linux-x64/bin:$PATH \
 *       ./node_modules/.bin/sucrase-node tests/notion-favorite-week.ts
 *
 * 실제 라우트(POST /api/notion/projects)를 그대로 지나가며, Notion API 는 global fetch 를
 * 갈아 끼운 메모리 페이지로 대신합니다. 사용자의 `프로젝트 · 할 일` DB 에는 `즐겨찾기`
 * 속성이 없으므로(실제 스키마 그대로) 그 경우에도 화면이 이번 주 꼭으로 읽는지 확인합니다.
 */

process.env.NOTION_TOKEN = "test-token";
process.env.NOTION_PROJECTS_DB_ID = "41d6ed96-9c5d-8168-81d2-db94f71eae36";
delete process.env.DIARY_PASSWORD;

export {};

async function main() {
  // `@/…` 는 Next 의 경로 별칭입니다 — 테스트에서는 src 로 풀어 줍니다.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Module = require("module");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodePath = require("path");
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request: string, ...args: unknown[]) {
    const next = request.startsWith("@/") ? nodePath.join(__dirname, "..", "src", request.slice(2)) : request;
    return resolve.call(this, next, ...args);
  };
  const { POST, GET } = await import("../src/app/api/notion/[resource]/route");
  const { NextRequest } = await import("next/server");

  let failed = 0;
  function check(name: string, condition: boolean, detail: unknown = "") {
    if (condition) console.log(`PASS  ${name}`);
    else {
      failed += 1;
      console.log(`FAIL  ${name}`, JSON.stringify(detail));
    }
  }

  const STAMP = "2026-11-01T00:00:00.000Z";

  /* ── 메모리 Notion: 쓰인 속성 값을 그대로 페이지 속성으로 되돌려 줍니다 ── */
  type Stored = { id: string; properties: Record<string, any> };
  const rows: Stored[] = [];
  const writes: { properties: Record<string, any> }[] = [];
  let seq = 0;

  function toPageProperty(value: Record<string, any>) {
    const kind = Object.keys(value)[0] ?? "rich_text";
    return { type: kind, ...value };
  }

  function pageOf(row: Stored) {
    return {
      object: "page",
      id: row.id,
      url: `https://www.notion.so/umana/${row.id.replace(/-/g, "")}`,
      created_time: STAMP,
      last_edited_time: STAMP,
      properties: row.properties,
    };
  }

  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

    if (url.includes("/query")) {
      return json({ results: rows.map(pageOf), has_more: false, next_cursor: null });
    }
    if (method === "POST" && url.endsWith("/v1/pages")) {
      const body = JSON.parse(init.body ?? "{}");
      writes.push({ properties: body.properties ?? {} });
      seq += 1;
      const id = `41f6ed96-9c5d-81aa-0000-00000000000${seq}`;
      const row: Stored = {
        id,
        properties: Object.fromEntries(
          Object.entries(body.properties ?? {}).map(([name, value]) => [name, toPageProperty(value as Record<string, any>)]),
        ),
      };
      rows.unshift(row);
      return json(pageOf(row));
    }
    return json({ results: rows.map(pageOf), has_more: false, next_cursor: null });
  }) as typeof fetch;

  /** CalendarTab 의 addFavorite 가 보내는 것과 같은 patch. */
  const favoritePatch = (title: string, date: string) => ({
    title,
    kind: "할 일",
    category: "개인",
    date,
    status: "미완료",
    urgent: true,
    important: true,
    favorite: true,
  });

  async function createTask(patch: Record<string, unknown>) {
    const request = new NextRequest("http://localhost/api/notion/projects", {
      method: "POST",
      body: JSON.stringify(patch),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request as never, { params: Promise.resolve({ resource: "projects" }) } as never);
    return { status: response.status, payload: (await response.json()) as any };
  }

  async function listProjects() {
    const request = new NextRequest("http://localhost/api/notion/projects", { method: "GET" });
    const response = await GET(request as never, { params: Promise.resolve({ resource: "projects" }) } as never);
    return (await response.json()) as { data: any[] };
  }

  /* 1) 엔터로 더한 첫 항목 — 저장된 뒤에도 favorite(=이번 주 꼭) 로 읽힌다 */
  let result = await createTask(favoritePatch("병원 예약", "2026-11-21"));
  check("POST projects 200", result.status === 200, result.payload);
  check(
    "저장 응답에서 바로 이번 주 꼭(favorite=true) — 목록에서 사라지지 않는다",
    result.payload?.data?.favorite === true,
    result.payload?.data,
  );
  check(
    "긴급·중요가 함께 저장된다(이번 주 꼭 표시의 근거)",
    result.payload?.data?.urgent === true && result.payload?.data?.important === true,
    result.payload?.data,
  );
  check(
    "없는 속성(즐겨찾기)은 노션으로 보내지 않는다 — 400 이 나지 않는다",
    !("즐겨찾기" in (writes.at(-1)?.properties ?? {})),
    Object.keys(writes.at(-1)?.properties ?? {}),
  );

  /* 2) 엔터를 여러 번 — 보낸 만큼 모두 남고, 새로고침(GET) 뒤에도 그대로 */
  const titles = ["전기요금 내기", "엄마 생신 선물", "치과 예약", "김장 재료 사기", "은행 방문",
    "차 검사 예약", "책 반납", "약국 들르기", "세탁 맡기기", "이사 견적"];
  for (const title of titles) await createTask(favoritePatch(title, "2026-11-21"));
  const all = await listProjects();
  const favorites = all.data.filter((item) => item.favorite && !item.trash);
  check("엔터로 더한 11개가 새로고침 뒤에도 모두 이번 주 꼭", favorites.length === 11, favorites.map((i) => i.title));
  check(
    "11개 제목이 하나도 빠지지 않는다",
    [...titles, "병원 예약"].every((title) => favorites.some((item) => item.title === title)),
    favorites.map((i) => i.title),
  );

  /* 3) 긴급·중요가 아닌 할 일은 이번 주 꼭이 아니다 */
  const plain = await createTask({ title: "그냥 할 일", kind: "할 일", category: "개인", date: "2026-11-21", status: "미완료" });
  check("긴급·중요가 아닌 할 일은 이번 주 꼭이 아니다", plain.payload?.data?.favorite === false, plain.payload?.data);

  /* 4) 즐겨찾기 속성이 있는 DB(다른 워크스페이스)라면 별표 값을 그대로 읽는다 */
  rows.push({
    id: "41f6ed96-9c5d-81aa-1111-111111111111",
    properties: {
      제목: { type: "title", title: [{ type: "text", plain_text: "별표만 켠 일", text: { content: "별표만 켠 일" } }] },
      유형: { type: "select", select: { name: "할 일" } },
      상태: { type: "status", status: { name: "미완료" } },
      날짜: { type: "date", date: { start: "2026-11-21", end: null } },
      긴급: { type: "checkbox", checkbox: false },
      중요: { type: "checkbox", checkbox: false },
      즐겨찾기: { type: "checkbox", checkbox: true },
    },
  });
  const withProp = await listProjects();
  const starred = withProp.data.find((item) => item.title === "별표만 켠 일");
  check("즐겨찾기 속성이 있는 DB 는 그 값을 그대로 읽는다", starred?.favorite === true, starred);

  /* 5) 다른 주를 보고 더한 항목은 그 주의 날짜로 저장된다(CalendarTab 이 보내는 날짜) */
  const nextWeek = await createTask(favoritePatch("다음 주 준비", "2026-11-23"));
  check(
    "다른 주에 더하면 그 주의 날짜로 저장된다",
    nextWeek.payload?.data?.date === "2026-11-23",
    nextWeek.payload?.data,
  );

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

void main();
