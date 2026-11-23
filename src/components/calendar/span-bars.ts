import type { CalendarEvent } from "@/lib/types";

export interface SpanSegment {
  event: CalendarEvent;
  /** 이 줄(주)에서 막대가 시작하는 칸 */
  startIdx: number;
  /** 이 줄에서 차지하는 칸 수 */
  span: number;
  lane: number;
  /** 일정이 앞 줄에서 이어져 왔는지 / 다음 줄로 이어지는지 — 둥근 모서리와 화살표를 정합니다. */
  cutStart: boolean;
  cutEnd: boolean;
}

/**
 * A41: 여러 날에 걸친 일정을 '한 줄 안에서 하나의 긴 막대'로 놓기 위한 계산입니다.
 * 월간 달력은 주(줄)마다, 주간·3일 보기는 그 창 전체를 `days`로 넘겨 부릅니다.
 * 창 밖으로 이어진 일정은 그 줄 끝에서 잘리고 cutStart/cutEnd 로 이어진다는 것을 표시합니다.
 */
export function spanSegments(
  events: CalendarEvent[],
  days: string[],
  options: { includeSingleDay?: boolean; includeAllDaySingles?: boolean } = {},
): SpanSegment[] {
  if (days.length === 0) return [];
  const first = days[0]!;
  const last = days[days.length - 1]!;
  /** A44: 여러 날 일정은 언제나, 하루짜리 종일 일정은 옵션을 켰을 때(월간·주간·3일) 막대로. */
  const isBarred = (event: CalendarEvent) =>
    !!event.date &&
    ((!!event.endDate && event.endDate > event.date) ||
      (options.includeAllDaySingles === true && event.allDay) ||
      options.includeSingleDay === true);
  const spans = events
    .filter((event) => event.kind === "일정" && !event.trash && isBarred(event))
    .sort((a, b) => {
      const byDay = a.date.localeCompare(b.date);
      if (byDay !== 0) return byDay;
      // 종일 일정이 위, 그다음 사용자가 정한 순서(정렬), 마지막으로 쓴 순서.
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      const left = a.sort ?? Number.MAX_SAFE_INTEGER;
      const right = b.sort ?? Number.MAX_SAFE_INTEGER;
      if (left !== right) return left - right;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

  const laneEnds: number[] = [];
  const out: SpanSegment[] = [];
  for (const event of spans) {
    const start = event.date;
    const end = event.endDate && event.endDate > event.date ? event.endDate : event.date;
    if (end < first || start > last) continue;
    const segStart = start < first ? 0 : days.indexOf(start);
    const segEnd = end > last ? days.length - 1 : days.indexOf(end);
    if (segStart < 0 || segEnd < segStart) continue;
    let lane = laneEnds.findIndex((value) => value <= segStart);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(segEnd + 1);
    } else {
      laneEnds[lane] = segEnd + 1;
    }
    out.push({
      event,
      startIdx: segStart,
      span: segEnd - segStart + 1,
      lane,
      cutStart: start < first,
      cutEnd: end > last,
    });
  }
  return out;
}

/** A41: 이 일정이 여러 날(연결 막대)로 그려지는지 — 날짜 칸 목록에서 빼야 하는지 판단합니다. */
export function isSpanned(event: CalendarEvent): boolean {
  return !!event.endDate && !!event.date && event.endDate > event.date;
}

/** A44: 하루짜리 종일 일정인지 — 종일 막대로 그리므로 날짜 칸 목록에서는 뺍니다. */
export function isAllDaySingle(event: CalendarEvent): boolean {
  return event.allDay === true && !isSpanned(event);
}
