/**
 * PATCH /api/notion/{resource}/{id} 왕복 검사 — 드래그로 다른 날에 놓았을 때.
 *
 *     PATH=/workspace/work/nodejs/node-v20.19.0-linux-x64/bin:$PATH \
 *       ./node_modules/.bin/sucrase-node tests/event-drag-api.ts
 *
 * Notion API 는 global fetch 를 갈아 끼워 메모리 페이지로 대신합니다. 그래서 실제
 * 라우트·직렬화·되읽기까지 그대로 지나가고, Notion 에 쓰인 `날짜` 속성과 응답
 * 데이터(화면 상태)를 함께 확인할 수 있습니다.
 */

process.env.NOTION_TOKEN = "test-token";
process.env.NOTION_CALENDAR_DB_ID = "41d6ed96-9c5d-81d9-b6e9-c1e1becd2b91";
process.env.NOTION_PROJECTS_DB_ID = "41d6ed96-9c5d-8168-81d2-db94f71eae36";
delete process.env.DIARY_PASSWORD;

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
  const { PATCH } = await import("../src/app/api/notion/[resource]/[id]/route");
  const { NextRequest } = await import("next/server");

  let failed = 0;
  function check(name: string, condition: boolean, detail: unknown = "") {
    if (condition) console.log(`PASS  ${name}`);
    else {
      failed += 1;
      console.log(`FAIL  ${name}`, JSON.stringify(detail));
    }
  }

  const ID = "41f6ed96-9c5d-813c-ad7e-dd642d2d59fc";
  const STAMP = "2026-11-01T00:00:00.000Z";

  /* ── 메모리 Notion ── */
  const pages: Record<string, any> = {};
  let writes: { properties: Record<string, any> }[] = [];

  function calendarPage(date: any) {
    return {
      object: "page",
      id: ID,
      url: "https://www.notion.so/umana/event",
      created_time: STAMP,
      last_edited_time: STAMP,
      properties: {
        제목: { type: "title", title: [{ type: "text", plain_text: "팀 회의", text: { content: "팀 회의" } }] },
        유형: { type: "select", select: { name: "일정" } },
        분류: { type: "select", select: { name: "업무" } },
        날짜: { type: "date", date },
        완료: { type: "checkbox", checkbox: false },
        취소: { type: "checkbox", checkbox: true },
        "취소 사유": { type: "rich_text", rich_text: [{ type: "text", plain_text: "일정 변경", text: { content: "일정 변경" } }] },
        기타: { type: "rich_text", rich_text: [{ type: "text", plain_text: "회의실 3층", text: { content: "회의실 3층" } }] },
      },
    };
  }

  function taskPage(date: any) {
    return {
      object: "page",
      id: ID,
      url: "https://www.notion.so/umana/task",
      created_time: STAMP,
      last_edited_time: STAMP,
      properties: {
        제목: { type: "title", title: [{ type: "text", plain_text: "온담 방문", text: { content: "온담 방문" } }] },
        유형: { type: "select", select: { name: "할 일" } },
        분류: { type: "select", select: { name: "개인" } },
        상태: { type: "status", status: { name: "미완료" } },
        날짜: { type: "date", date },
        긴급: { type: "checkbox", checkbox: true },
        기타: { type: "rich_text", rich_text: [{ type: "text", plain_text: "예약 13시", text: { content: "예약 13시" } }] },
      },
    };
  }

  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const id = url.split("/").pop() ?? "";
    if (method === "PATCH") {
      const body = JSON.parse(init.body ?? "{}");
      writes.push(body);
      const page = pages[id];
      page.properties = { ...page.properties, ...(body.properties ?? {}) };
      page.last_edited_time = "2026-11-21T12:00:00.000Z";
      return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(pages[id]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  async function patch(resource: string, body: Record<string, unknown>) {
    const request = new NextRequest(`http://localhost/api/notion/${resource}/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ ...body, expectedUpdatedAt: STAMP }),
      headers: { "content-type": "application/json" },
    });
    const response = await PATCH(request as never, { params: Promise.resolve({ resource, id: ID }) } as never);
    return { status: response.status, payload: (await response.json()) as any };
  }

  const when = () => writes.at(-1)?.properties?.["날짜"]?.date ?? null;

  /* 1) 월간 달력 드래그 — date·endDate 만 보낸다 */
  pages[ID] = calendarPage({ start: "2026-11-21T09:00:00.000+09:00", end: "2026-11-21T10:00:00.000+09:00" });
  writes = [];
  let result = await patch("calendar", { date: "2026-11-22", endDate: "2026-11-22", allDay: false });
  check(
    "월간 드래그: Notion 날짜에 시작·끝 시간이 남는다",
    when()?.start === "2026-11-22T09:00:00.000+09:00" && when()?.end === "2026-11-22T10:00:00.000+09:00",
    when(),
  );
  check(
    "월간 드래그: 응답(화면 상태)도 시간·분류·메모·취소 그대로",
    result.payload?.data?.date === "2026-11-22" &&
      result.payload?.data?.startTime === "09:00" &&
      result.payload?.data?.endTime === "10:00" &&
      result.payload?.data?.allDay === false &&
      result.payload?.data?.category === "업무" &&
      result.payload?.data?.memo === "회의실 3층" &&
      result.payload?.data?.canceled === true &&
      result.payload?.data?.cancelReason === "일정 변경",
    result.payload?.data,
  );
  check(
    "월간 드래그: 날짜 외 속성은 건드리지 않는다",
    JSON.stringify(Object.keys(writes.at(-1)?.properties ?? {})) === JSON.stringify(["날짜"]),
    Object.keys(writes.at(-1)?.properties ?? {}),
  );

  /* 2) 주간 시간표 — 다른 요일·다른 시각 */
  pages[ID] = calendarPage({ start: "2026-11-21T09:00:00.000+09:00", end: "2026-11-21T10:00:00.000+09:00" });
  writes = [];
  result = await patch("calendar", { date: "2026-11-24", startTime: "14:00", endTime: "15:00", endDate: "2026-11-24", allDay: false });
  check(
    "주간 드래그: 다른 요일·다른 시각으로, 길이는 그대로",
    when()?.start === "2026-11-24T14:00:00.000+09:00" && when()?.end === "2026-11-24T15:00:00.000+09:00",
    when(),
  );
  check(
    "주간 드래그: 다시 읽어도 14:00–15:00 · 종일 아님",
    result.payload?.data?.startTime === "14:00" && result.payload?.data?.endTime === "15:00" && result.payload?.data?.allDay === false,
    result.payload?.data,
  );

  /* 3) 여러 날 일정 — 일수 유지 */
  pages[ID] = calendarPage({ start: "2026-11-20T09:00:00.000+09:00", end: "2026-11-22T18:00:00.000+09:00" });
  writes = [];
  result = await patch("calendar", { date: "2026-11-24", endDate: "2026-11-26", startTime: "09:00", endTime: "18:00", allDay: false });
  check(
    "여러 날 일정: 3일 길이 그대로 다른 주로",
    when()?.start === "2026-11-24T09:00:00.000+09:00" && when()?.end === "2026-11-26T18:00:00.000+09:00",
    when(),
  );

  /* 4) 종일 줄에 놓아 시각이 사라져도 되는 경우(같은 날 종일로 돌리기)는 그대로 비운다 */
  pages[ID] = calendarPage({ start: "2026-11-21T09:00:00.000+09:00", end: "2026-11-21T10:00:00.000+09:00" });
  writes = [];
  result = await patch("calendar", { date: "2026-11-21", endDate: "2026-11-21", startTime: null, endTime: null, allDay: true });
  check("종일로 돌리기: 시각을 비우면 날짜만 남는다", when()?.start === "2026-11-21" && !when()?.end, when());

  /* 5) 할 일 — 날짜만 옮겨도 시간 유지 */
  pages[ID] = taskPage({ start: "2026-11-21T13:00:00.000+09:00", end: "2026-11-21T14:00:00.000+09:00" });
  writes = [];
  result = await patch("projects", { date: "2026-11-23" });
  check(
    "할 일 드래그: 날짜만 바뀌고 13:00–14:00 유지",
    when()?.start === "2026-11-23T13:00:00.000+09:00" && when()?.end === "2026-11-23T14:00:00.000+09:00",
    when(),
  );
  check(
    "할 일 드래그: 응답도 날짜만 변경 · 긴급/메모 그대로",
    result.payload?.data?.date === "2026-11-23" &&
      result.payload?.data?.startTime === "13:00" &&
      result.payload?.data?.endTime === "14:00" &&
      result.payload?.data?.urgent === true &&
      result.payload?.data?.memo === "예약 13시",
    result.payload?.data,
  );

  /* 6) 끝을 끌어 늘이기 — date 없이 시각만 보내도 날짜 유지 */
  pages[ID] = calendarPage({ start: "2026-11-21T09:00:00.000+09:00", end: "2026-11-21T10:00:00.000+09:00" });
  writes = [];
  result = await patch("calendar", { startTime: "09:00", endTime: "12:00" });
  check(
    "끝 늘이기: 시각만 보내도 날짜 그대로",
    when()?.start === "2026-11-21T09:00:00.000+09:00" && when()?.end === "2026-11-21T12:00:00.000+09:00",
    when(),
  );

  console.log(failed === 0 ? "\nALL PASS" : `\nFAILED ${failed}`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
