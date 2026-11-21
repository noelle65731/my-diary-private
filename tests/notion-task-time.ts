/**
 * 할 일 '시간 지정'의 Notion `날짜` 속성 왕복 검사 (프로젝트 · 할 일 DB).
 *
 *     PATH=/workspace/work/nodejs/node-v20.19.0-linux-x64/bin:$PATH \
 *       ./node_modules/.bin/sucrase-node tests/notion-task-time.ts
 *
 * 앱이 보내는 값(startTime/endTime)이 `2026-11-22T14:00:00.000+09:00` 형태의
 * 시작·종료로 저장되고, 다시 읽으면 같은 시각으로 복원되는지 확인합니다.
 */

import { buildProperties, mapTask } from "../src/lib/notion-map";

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
      제목: { type: "title", title: [{ plain_text: "테스트" }] },
      유형: { type: "select", select: { name: "할 일" } },
      분류: { type: "select", select: { name: "개인" } },
      상태: { type: "status", status: { name: "미완료" } },
      날짜: { type: "date", date },
    },
  } as never;
}

const timed = buildProperties("projects", { date: "2026-11-22", startTime: "14:00", endTime: "15:30" }) as {
  날짜?: { date?: { start?: string; end?: string } };
};
check(
  "시간 지정 → 날짜에 시작·종료(KST ISO)",
  timed.날짜?.date?.start === "2026-11-22T14:00:00.000+09:00" && timed.날짜?.date?.end === "2026-11-22T15:30:00.000+09:00",
  timed,
);

const allDay = buildProperties("projects", { date: "2026-11-22", startTime: null, endTime: null }) as {
  날짜?: { date?: { start?: string; end?: string } };
};
check("시간 없음 → 날짜만", allDay.날짜?.date?.start === "2026-11-22" && !allDay.날짜?.date?.end, allDay);

const startOnly = buildProperties("projects", { date: "2026-11-22", startTime: "09:00", endTime: null }) as {
  날짜?: { date?: { start?: string; end?: string } };
};
check("시작만 → 시작만 저장", startOnly.날짜?.date?.start === "2026-11-22T09:00:00.000+09:00" && !startOnly.날짜?.date?.end, startOnly);

const cleared = buildProperties("projects", { date: null, startTime: null, endTime: null }) as { 날짜?: unknown };
check("날짜 없음 → 빈 날짜", JSON.stringify(cleared.날짜) === JSON.stringify({ date: null }), cleared);

const read = mapTask(page({ start: "2026-11-22T14:00:00.000+09:00", end: "2026-11-22T15:30:00.000+09:00" }));
check("다시 읽으면 날짜+시작+종료", read.date === "2026-11-22" && read.startTime === "14:00" && read.endTime === "15:30", read);

const readDay = mapTask(page({ start: "2026-11-22" }));
check("날짜만 저장된 기록은 시간 없음", readDay.date === "2026-11-22" && readDay.startTime === null && readDay.endTime === null, readDay);

const readZ = mapTask(page({ start: "2026-11-22T05:00:00.000Z" }));
check("UTC(Z) 시각은 KST로 읽음", readZ.date === "2026-11-22" && readZ.startTime === "14:00", readZ);

const readCross = mapTask(page({ start: "2026-11-22T14:00:00.000+09:00", end: "2026-11-23T10:00:00.000+09:00" }));
check("다른 날에 끝나는 기록은 그날 종료로 쓰지 않음", readCross.startTime === "14:00" && readCross.endTime === null, readCross);

console.log(failed === 0 ? "\nALL PASS" : `\nFAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
