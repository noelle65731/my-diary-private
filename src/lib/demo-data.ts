/**
 * Demo dataset used when NOTION_TOKEN is not configured.
 * Everything is generated around today's date so the preview feels alive.
 * Nothing is ever written back to Notion in this mode.
 */

import { addDaysISO, memoTitle, todayISO, weekKeyOf, startOfWeekISO, isoWeekNumber } from "./date";
import type {
  AllData,
  ArchiveEntry,
  BinderEntry,
  CalendarEvent,
  ProjectTask,
  Routine,
} from "./types";

const stamp = () => new Date().toISOString();

export function buildDemoData(): AllData {
  const today = todayISO();
  const monday = startOfWeekISO(today);
  const wk = weekKeyOf(today);
  const created = stamp();

  const base = {
    url: "",
    hidden: false,
    trash: false,
    favorite: false,
    memo: "",
    sort: null as number | null,
    projectIds: [] as string[],
    createdAt: created,
    updatedAt: created,
  };

  const event = (id: string, title: string, date: string, opts: Partial<CalendarEvent> = {}): CalendarEvent => ({
    ...base,
    id,
    title,
    kind: "일정",
    category: "개인",
    date,
    startTime: null,
    endDate: null,
    endTime: null,
    allDay: true,
    done: false,
    canceled: false,
    cancelReason: "",
    cancelAt: null,
    weekKey: "",
    baseDate: null,
    ...opts,
  });

  const calendar: CalendarEvent[] = [
    event("demo-ev-1", "아침 요가", today, { startTime: "08:30", endTime: "09:20", allDay: false, category: "개인", favorite: true }),
    event("demo-ev-2", "브랜드팀 인터뷰 준비", addDaysISO(today, -1), { startTime: "10:00", endTime: "12:00", allDay: false, category: "성과" }),
    event("demo-ev-3", "포트폴리오 사이트 수정", addDaysISO(today, 1), { startTime: "14:00", endTime: "17:00", allDay: false, category: "성과" }),
    event("demo-ev-4", "친구와 저녁", addDaysISO(today, 2), { startTime: "19:00", endTime: "21:00", allDay: false, category: "휴먼네트워크" }),
    event("demo-ev-5", "치과 예약", addDaysISO(today, 3), { startTime: "11:30", endTime: "12:00", allDay: false, category: "개인" }),
    event("demo-ev-6", "주간 장보기", addDaysISO(today, 4), { category: "개인" }),
    event("demo-ev-7", "도서관 반납", addDaysISO(today, -2), { category: "개인", done: true }),
    event("demo-ev-8", "전시 관람", addDaysISO(today, 6), { startTime: "15:00", endTime: "17:30", allDay: false, category: "휴먼네트워크" }),
    event("demo-ev-9", "온라인 클래스", addDaysISO(today, 8), { startTime: "20:00", endTime: "21:30", allDay: false, category: "성과" }),
    event("demo-ev-10", "정기 점검 (취소)", addDaysISO(today, -3), {
      startTime: "13:00",
      endTime: "14:00",
      allDay: false,
      category: "외부일정",
      canceled: true,
      cancelReason: "상대 일정 변경",
    }),
    event("demo-ev-11", "주간 목표: 포트폴리오 2장 완성", monday, {
      kind: "주간 목표",
      weekKey: wk,
      baseDate: monday,
      category: "성과",
    }),
    event("demo-ev-12", "주간 목표: 30분씩 걷기", monday, {
      kind: "주간 목표",
      weekKey: wk,
      baseDate: monday,
      category: "개인",
    }),
    event("demo-ev-13", memoTitle(today, "주간 메모"), monday, {
      kind: "주간 메모",
      weekKey: wk,
      baseDate: monday,
      memo: "이번 주는 마감이 몰린 주. 저녁 약속은 하나만.",
    }),
    event("demo-ev-16", memoTitle(addDaysISO(today, -7), "주간 메모"), addDaysISO(monday, -7), {
      kind: "주간 메모",
      weekKey: weekKeyOf(addDaysISO(monday, -7)),
      baseDate: addDaysISO(monday, -7),
      memo: "지난주: 지원서 3곳 마감, 운동은 2번. 다음 주엔 저녁 약속 줄이기.",
    }),
    event("demo-ev-14", "11월은 지원서 정리와 루틴 회복의 달", `${today.slice(0, 7)}-01`, {
      kind: "월간 메모",
    }),
    event("demo-ev-15", "숨김 처리한 백업 일정", addDaysISO(today, 1), { hidden: true }),
  ];

  const projectIds = { work: "demo-pj-1", home: "demo-pj-2", study: "demo-pj-3" };

  const task = (id: string, title: string, opts: Partial<ProjectTask> = {}): ProjectTask => ({
    ...base,
    id,
    title,
    kind: "할 일",
    category: "개인",
    status: "미완료",
    date: null,
    startTime: null,
    endTime: null,
    due: null,
    doneAt: null,
    checkedAt: null,
    urgent: false,
    important: false,
    history: false,
    waitFor: "",
    waitNote: "",
    cancelReason: "",
    cancelAt: null,
    repeatGroupId: "",
    ...opts,
  });

  const projects: ProjectTask[] = [
    task("demo-pj-1", "브랜드 마케팅 포트폴리오", {
      kind: "프로젝트",
      category: "업무",
      status: "미완료",
      date: monday,
      due: addDaysISO(today, 9),
      important: true,
      memo: "지원용 · 사례 3개 정리",
      projectIds: [],
    }),
    task("demo-pj-2", "집 정리 프로젝트", {
      kind: "프로젝트",
      category: "개인",
      status: "미완료",
      date: addDaysISO(today, -5),
      due: addDaysISO(today, 20),
      memo: "주말마다 한 구역씩",
      projectIds: [],
    }),
    task("demo-pj-4", "도자기 만들기", {
      kind: "프로젝트",
      category: "개인",
      status: "완료",
      history: true,
      date: addDaysISO(today, -60),
      memo: "4회차까지 마침 · History에 보관",
      projectIds: [],
    }),
    task("demo-pj-3", "Next.js 다시 익히기", {
      kind: "프로젝트",
      category: "공부",
      status: "미완료",
      date: addDaysISO(today, -10),
      memo: "App Router 중심",
      projectIds: [],
    }),

    task("demo-tk-1", "사례 1·2 스토리라인 정리", { category: "업무", date: addDaysISO(today, -1), due: addDaysISO(today, 2), urgent: true, important: true, projectIds: [projectIds.work] }),
    task("demo-tk-2", "포트폴리오 상세 페이지 와이어프레임", {
      category: "업무",
      date: today,
      due: addDaysISO(today, 4),
      important: true,
      projectIds: [projectIds.work],
      // B2: properties added to the Notion DB after setup show up here.
      extra: [
        { name: "담당", type: "rich_text", readOnly: false, value: "선옥" },
        { name: "검토 완료", type: "checkbox", readOnly: false, value: false },
        { name: "우선순위", type: "select", readOnly: false, value: "보통", options: ["낮음", "보통", "높음"] },
        { name: "배포일", type: "date", readOnly: false, value: addDaysISO(today, 6) },
        { name: "예상 시간(분)", type: "number", readOnly: false, value: 90 },
        { name: "참고 링크", type: "url", readOnly: false, value: "https://example.com/wireframe" },
        { name: "남은 일수", type: "formula:number", readOnly: true, value: 4 },
      ],
    }),
    task("demo-tk-3", "지원 회사 3곳 리스트업", { category: "업무", date: addDaysISO(today, 1), status: "대기 중", waitFor: "지인 추천", waitNote: "링크 받기로 함", projectIds: [projectIds.work] }),
    task("demo-tk-4", "자기소개 문장 다듬기", { category: "업무", status: "완료", date: addDaysISO(today, -2), doneAt: addDaysISO(today, -2), projectIds: [projectIds.work] }),
    task("demo-tk-5", "케이스 스터디 초안", { category: "업무", status: "완료", date: addDaysISO(today, -4), doneAt: addDaysISO(today, -3), projectIds: [projectIds.work] }),

    task("demo-tk-6", "옷장 비우기", { category: "개인", date: addDaysISO(today, 2), projectIds: [projectIds.home] }),
    task("demo-tk-7", "주방 서랍 정리", { category: "개인", status: "완료", date: addDaysISO(today, -3), doneAt: addDaysISO(today, -3), projectIds: [projectIds.home] }),
    task("demo-tk-8", "안 쓰는 충전기 처분", { category: "개인", projectIds: [projectIds.home], hidden: true }),

    task("demo-tk-9", "Route Handler 복습", { category: "공부", date: today, projectIds: [projectIds.study] }),
    task("demo-tk-10", "Tailwind 레이아웃 연습", { category: "공부", status: "완료", date: addDaysISO(today, -2), doneAt: addDaysISO(today, -2), projectIds: [projectIds.study] }),

    task("demo-tk-11", "약국 들르기", { category: "개인", date: today }),
    task("demo-tk-12", "중고 거래 글 올리기", { category: "개인", date: addDaysISO(today, 1), urgent: true }),
    task("demo-tk-13", "생일 선물 고르기", { category: "개인", due: addDaysISO(today, 6), important: true }),
    task("demo-tk-14", "지난달 지출 정리", { category: "개인", status: "취소", cancelReason: "다음 달로 미룸" }),
    task("demo-tk-15", "도자기 1회차 · 흙 반죽", { category: "개인", status: "완료", doneAt: addDaysISO(today, -58), projectIds: ["demo-pj-4"] }),
    task("demo-tk-16", "도자기 2회차 · 물레", { category: "개인", status: "완료", doneAt: addDaysISO(today, -51), projectIds: ["demo-pj-4"] }),
    task("demo-tk-17", "도자기 3회차 · 유약", { category: "개인", status: "완료", doneAt: addDaysISO(today, -44), projectIds: ["demo-pj-4"] }),
    task("demo-tk-18", "도자기 4회차 · 소성", { category: "개인", status: "완료", doneAt: addDaysISO(today, -37), projectIds: ["demo-pj-4"] }),
  ];

  const routine = (id: string, title: string, opts: Partial<Routine>): Routine => ({
    ...base,
    id,
    title,
    kind: "루틴",
    category: "개인",
    date: null,
    repeatDays: ["월", "화", "수", "목", "금", "토", "일"],
    targetCount: 1,
    execCount: 0,
    amount: null,
    unit: "",
    history: false,
    routineIds: [],
    ...opts,
  });

  const routines: Routine[] = [
    routine("demo-rt-1", "물 마시기", { targetCount: 4, unit: "컵", amount: 1, repeatDays: ["월", "화", "수", "목", "금", "토", "일"] }),
    routine("demo-rt-2", "스트레칭", { targetCount: 1, unit: "회", amount: 10, repeatDays: ["월", "화", "수", "목", "금"] }),
    routine("demo-rt-3", "독서", { targetCount: 20, unit: "쪽", amount: 5, repeatDays: ["월", "수", "금", "일"], category: "공부" }),
    routine("demo-rt-4", "영단어", { targetCount: 10, unit: "개", amount: 2, repeatDays: ["화", "목", "토"], category: "공부" }),
  ];

  const dayIdx: Record<string, number> = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 };
  for (let back = 0; back < 14; back++) {
    const date = addDaysISO(today, -back);
    const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T12:00:00`).getDay()] ?? "월";
    for (const r of routines) {
      if (!r.repeatDays.includes(dow)) continue;
      const seed = (back * 7 + (dayIdx[dow] ?? 0) + r.title.length) % 5;
      const done = back === 0 ? Math.max(0, (r.targetCount ?? 1) - 2) : Math.min(r.targetCount ?? 1, Math.floor(((r.targetCount ?? 1) * seed) / 4));
      if (done <= 0) continue;
      routines.push(
        routine(`demo-rc-${r.id}-${date}`, r.title, {
          kind: "날짜별 체크",
          category: r.category,
          date,
          targetCount: r.targetCount,
          execCount: done,
          amount: r.amount,
          unit: r.unit,
          routineIds: [r.id],
          repeatDays: [],
        }),
      );
    }
  }

  const binder = (id: string, title: string, date: string | null, body: string, opts: Partial<BinderEntry> = {}): BinderEntry => ({
    ...base,
    id,
    title,
    kind: "일기",
    date,
    link: "",
    tags: [],
    archiveFlag: false,
    body,
    photos: [],
    ...opts,
  });

  const binderEntries: BinderEntry[] = [
    binder(
      "demo-bd-1",
      "조용한 하루",
      today,
      `아침에 창문을 열었더니 공기가 생각보다 차가웠다.\n\n포트폴리오 사례 두 개를 정리했다. 쓰고 나니 생각보다 내가 한 일이 많았다는 걸 알았다.\n\n저녁에는 30분 걸었다. 오늘의 작은 성공.`,
      { favorite: true, tags: ["기록", "루틴"] },
    ),
    binder(
      "demo-bd-2",
      "인터뷰 준비 메모",
      addDaysISO(today, -1),
      `# 준비할 것\n- 브랜드 캠페인 사례 2개\n- 숫자로 말할 수 있는 성과 정리\n- 역질문 3개\n\n면접관이 궁금해할 지점은 결국 "왜 이 브랜드인가"였다.`,
      { tags: ["취업"] },
    ),
    binder(
      "demo-bd-3",
      "주말의 리듬",
      addDaysISO(today, -3),
      `토요일엔 늦잠, 일요일엔 정리.\n\n옷장을 절반 비웠다. 비우고 나니 무엇을 좋아하는지 더 잘 보였다.`,
    ),
    binder("demo-bd-4", "짧은 기록", addDaysISO(today, -6), `비 오는 날. 우산을 두고 나와서 편의점 우산을 샀다.`),
    binder(
      "demo-nt-1",
      "Next.js Route Handler 정리",
      addDaysISO(today, -2),
      `- route.ts 에서 GET/POST 내보내기\n- params 는 Promise 라 await 필요\n- 토큰은 서버에서만\n- revalidate 대신 cache: 'no-store'`,
      { kind: "노트", tags: ["공부", "Next.js"] },
    ),
    binder(
      "demo-nt-2",
      "면접에서 자주 나온 질문",
      addDaysISO(today, -8),
      `1. 실패한 프로젝트와 배운 점\n2. 협업에서 갈등을 푼 방식\n3. 데이터로 판단한 경험\n4. 이 직무에서 1년 뒤 모습`,
      { kind: "노트", tags: ["취업"] },
    ),
  ];

  const archive: ArchiveEntry[] = [
    {
      ...base,
      id: "demo-ar-1",
      title: "아몬드",
      kind: "책",
      date: addDaysISO(today, -20),
      baseDate: addDaysISO(today, -20),
      rating: 4,
      link: "",
      tags: ["소설"],
      body: "감정을 잘 느끼지 못하는 아이의 성장. 문장이 담백해서 오래 남았다.",
      photos: [],
      favorite: true,
    },
    {
      ...base,
      id: "demo-ar-2",
      title: "elements of branding",
      kind: "읽을거리",
      date: today,
      baseDate: today,
      rating: null,
      link: "https://example.com",
      tags: ["브랜드", "레퍼런스"],
      body: "브랜드 자산 정리 아티클. 포트폴리오 서두에 인용할 만하다.",
      photos: [],
    },
    {
      ...base,
      id: "demo-ar-3",
      title: "패스트 라이브즈",
      kind: "영화",
      date: addDaysISO(today, -12),
      baseDate: addDaysISO(today, -12),
      rating: 5,
      link: "",
      tags: ["영화"],
      body: "오랜 시간을 건너뛴 두 사람의 대화. 마지막 장면이 오래 남는다.",
      photos: [],
    },
    {
      ...base,
      id: "demo-ar-4",
      title: "국물 떡볶이 황금비율",
      kind: "메모",
      date: addDaysISO(today, -5),
      baseDate: addDaysISO(today, -5),
      rating: null,
      link: "",
      tags: ["요리"],
      body: "고추장 2 : 간장 1 : 설탕 1.5, 물 400ml. 어묵은 마지막에.",
      photos: [],
    },
  ];

  void isoWeekNumber(monday);
  return { calendar, projects, routines, binder: binderEntries, archive };
}
