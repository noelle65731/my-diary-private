/**
 * 일정·할 일을 다른 날로 끌어 옮겼을 때 Notion `날짜` 속성이 시간을 잃지 않는지 검사.
 *
 *     PATH=/workspace/work/nodejs/node-v20.19.0-linux-x64/bin:$PATH \
 *       ./node_modules/.bin/sucrase-node tests/event-drag-preserve.ts
 *
 * 드래그 이동은 `date`(그리고 `endDate`)만 바꾸는 부분 패치를 보냅니다. Notion 의
 * date 속성은 통째로 덮어쓰이므로, 패치에 없는 startTime/endTime 은 현재 페이지의
 * 값에서 채워야 시간이 사라지지 않습니다.
 */

import { buildProperties, mapCalendar, mapTask } from "../src/lib/notion-map";

let failed = 0;

function check(name: string, condition: boolean, detail: unknown = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`, JSON.stringify(detail));
  }
}

function page(date: Record<string, unknown> | null) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    url: "https://www.notion.so/umana/abcdef",
    created_time: "2026-11-01T00:00:00.000Z",
    last_edited_time: "2026-11-01T00:00:00.000Z",
    properties: {
      제목: { type: "title", title: [{ plain_text: "팀 회의" }] },
      유형: { type: "select", select: { name: "일정" } },
      분류: { type: "select", select: { name: "업무" } },
      날짜: { type: "date", date },
    },
  } as never;
}

type DateOut = { 날짜?: { date?: { start?: string; end?: string } | null } };
const when = (out: DateOut) => out.날짜?.date ?? null;

/* ── 일정 ── */

const oneDay = page({ start: "2026-11-21T09:00:00.000+09:00", end: "2026-11-21T10:00:00.000+09:00" });

// 1) 월간 달력·종일 줄 드래그: date(와 endDate)만 바꾸는 패치
const monthMove = buildProperties("calendar", { date: "2026-11-22", endDate: "2026-11-22" }, oneDay) as DateOut;
check(
  "일정: 날짜만 바꾼 패치 → 시작·끝 시간 유지",
  when(monthMove)?.start === "2026-11-22T09:00:00.000+09:00" && when(monthMove)?.end === "2026-11-22T10:00:00.000+09:00",
  monthMove,
);

// 2) 여러 날 일정: date 만 바뀌어도 기간 일수 유지
const multi = page({ start: "2026-11-20T09:00:00.000+09:00", end: "2026-11-22T18:00:00.000+09:00" });
const multiMove = buildProperties("calendar", { date: "2026-11-24", endDate: "2026-11-26" }, multi) as DateOut;
check(
  "일정: 여러 날 → 같은 일수만큼 이동",
  when(multiMove)?.start === "2026-11-24T09:00:00.000+09:00" && when(multiMove)?.end === "2026-11-26T18:00:00.000+09:00",
  multiMove,
);
const multiPartial = buildProperties("calendar", { date: "2026-11-24" }, multi) as DateOut;
check(
  "일정: date 만 온 여러 날 패치 → 끝 날짜도 같은 일수만큼",
  when(multiPartial)?.start === "2026-11-24T09:00:00.000+09:00" && when(multiPartial)?.end === "2026-11-26T18:00:00.000+09:00",
  multiPartial,
);

// 3) 시간표 드래그: 날짜+시각을 함께 보내면 그 시각으로 (길이는 그대로)
const timedMove = buildProperties(
  "calendar",
  { date: "2026-11-22", endDate: "2026-11-22", startTime: "14:00", endTime: "15:00", allDay: false },
  oneDay,
) as DateOut;
check(
  "일정: 다른 요일·다른 시각으로 이동",
  when(timedMove)?.start === "2026-11-22T14:00:00.000+09:00" && when(timedMove)?.end === "2026-11-22T15:00:00.000+09:00",
  timedMove,
);

// 4) 종일로 되돌리기처럼 startTime 을 명시적으로 비우면 시간이 지워진다
const cleared = buildProperties(
  "calendar",
  { date: "2026-11-22", endDate: "2026-11-22", startTime: null, endTime: null },
  oneDay,
) as DateOut;
check("일정: 시간을 명시적으로 비우면 날짜만", when(cleared)?.start === "2026-11-22" && !when(cleared)?.end, cleared);

// 5) 끝을 끌어 늘이는 패치(startTime/endTime 만)도 날짜를 잃지 않는다
const resized = buildProperties("calendar", { startTime: "09:00", endTime: "12:00" }, oneDay) as DateOut;
check(
  "일정: 시간만 바꾼 패치 → 날짜 유지",
  when(resized)?.start === "2026-11-21T09:00:00.000+09:00" && when(resized)?.end === "2026-11-21T12:00:00.000+09:00",
  resized,
);

// 6) 다시 읽으면 시간이 그대로 (allDay=false)
const read = mapCalendar(page({ start: "2026-11-22T14:00:00.000+09:00", end: "2026-11-22T15:00:00.000+09:00" }));
check(
  "일정: 저장된 값을 다시 읽으면 시간·allDay 유지",
  read.date === "2026-11-22" && read.startTime === "14:00" && read.endTime === "15:00" && read.allDay === false,
  read,
);

/* ── 할 일 ── */

const taskPage = {
  id: "22222222-3333-4444-5555-666666666666",
  url: "https://www.notion.so/umana/task",
  created_time: "2026-11-01T00:00:00.000Z",
  last_edited_time: "2026-11-01T00:00:00.000Z",
  properties: {
    제목: { type: "title", title: [{ plain_text: "온담 방문" }] },
    유형: { type: "select", select: { name: "할 일" } },
    분류: { type: "select", select: { name: "개인" } },
    상태: { type: "status", status: { name: "미완료" } },
    날짜: { type: "date", date: { start: "2026-11-21T13:00:00.000+09:00", end: "2026-11-21T14:00:00.000+09:00" } },
  },
} as never;

const taskMove = buildProperties("projects", { date: "2026-11-23" }, taskPage) as DateOut;
check(
  "할 일: 날짜만 바꾼 패치 → 시작·끝 시간 유지",
  when(taskMove)?.start === "2026-11-23T13:00:00.000+09:00" && when(taskMove)?.end === "2026-11-23T14:00:00.000+09:00",
  taskMove,
);

const taskRead = mapTask(taskPage);
check("할 일: 다시 읽으면 시간 유지", taskRead.date === "2026-11-21" && taskRead.startTime === "13:00" && taskRead.endTime === "14:00", taskRead);

console.log(failed === 0 ? "\nALL PASS" : `\nFAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
