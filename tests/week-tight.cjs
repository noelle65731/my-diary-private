/**
 * 주간·3일 보기 검증 — 일정/프로젝트/루틴 구역이 여백 없이 붙어 있고, 경계가 2px 검정 실선인지.
 * 모바일에서는 일정 영역이 딱 네 칸(종일 1 + 시간 3)만 보이고, 왼쪽 열·날짜 머리글 고정이 살아 있는지.
 *
 *    PLAYWRIGHT_BROWSERS_PATH=/workspace/.tools/pw-browsers \
 *      node tests/week-tight.cjs            # BASE=http://127.0.0.1:3214
 *
 * 환경변수: BASE, OUT, PREFIX(파일 이름 앞에 붙일 말), CHROME, PLAYWRIGHT_MODULE
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/workspace/.tools/pw/node_modules/playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://127.0.0.1:3214";
const OUT = process.env.OUT || "/workspace/downloads/diary-a17";
const PREFIX = process.env.PREFIX || "";
fs.mkdirSync(OUT, { recursive: true });

const TODAY = "2026-11-21";
const WEEK_START = "2026-11-16";
const WEEK_KEY = "2026-W47";

const stamp = (day = "2026-11-01") => `${day}T00:00:00.000Z`;
const base = (id, title, extra = {}) => ({
  id, url: "", title, hidden: false, trash: false, favorite: false, memo: "", sort: null,
  projectIds: [], createdAt: stamp(), updatedAt: stamp(), ...extra,
});
const event = (id, title, date, extra = {}) => ({
  ...base(id, title),
  kind: "일정", category: "개인", date, startTime: null, endTime: null, endDate: null,
  allDay: true, done: false, canceled: false, cancelReason: "", cancelAt: null,
  weekKey: "", baseDate: null, ...extra,
});
const task = (id, title, extra = {}) => ({
  ...base(id, title),
  kind: "할 일", category: "개인", status: "미완료", date: null, due: null, doneAt: null,
  checkedAt: null, urgent: false, important: false, history: false, waitFor: "", waitNote: "",
  cancelReason: "", cancelAt: null, repeatGroupId: "", ...extra,
});

function fixture() {
  const calendar = [
    // 종일 — 두 줄
    event("ad-1", "제주도 여행", "2026-11-19", { endDate: "2026-11-22" }),
    event("ad-2", "김장 재료 사기", TODAY),
    // 시간 일정 — 오늘 포함
    event("ev-1", "주간 회의", "2026-11-16", { startTime: "09:30", endTime: "10:30", allDay: false }),
    event("ev-2", "성과 리뷰", "2026-11-19", { startTime: "10:00", endTime: "11:00", allDay: false }),
    event("ev-3", "치과", TODAY, { startTime: "14:00", endTime: "15:00", allDay: false }),
    event("ev-4", "저녁 약속", TODAY, { startTime: "18:30", endTime: "20:00", allDay: false }),
    event("ev-5", "필라테스", "2026-11-20", { startTime: "19:00", endTime: "20:00", allDay: false }),
    event("goal-1", "포트폴리오 사례 2장 정리", WEEK_START, {
      kind: "주간 목표", weekKey: WEEK_KEY, baseDate: WEEK_START,
    }),
    event("memo-1", "2026년 11월 21일 주간 메모", WEEK_START, {
      kind: "주간 메모", weekKey: WEEK_KEY, baseDate: WEEK_START, memo: "이번 주는 마감이 몰린 주.",
    }),
  ];
  const projects = [
    task("pj-1", "브랜드 포트폴리오", { kind: "프로젝트", category: "업무", date: "2026-11-10", due: "2026-11-30", memo: "사례 3개 정리" }),
    task("pj-2", "집 정리", { kind: "프로젝트", category: "개인", date: "2026-11-01" }),
    task("tk-1", "사례 1 정리", { category: "업무", date: "2026-11-18", urgent: true, important: true, projectIds: ["pj-1"] }),
    task("tk-2", "사례 2 정리", { category: "업무", date: "2026-11-20", status: "완료", doneAt: "2026-11-20", projectIds: ["pj-1"] }),
    task("tk-3", "와이어프레임", { category: "업무", date: TODAY, projectIds: ["pj-1"] }),
    task("tk-4", "약국 들르기", { category: "개인", date: TODAY, favorite: true, urgent: true }),
    task("tk-5", "옷장 비우기", { category: "개인", date: "2026-11-22", projectIds: ["pj-2"] }),
  ];
  const routines = [
    task("rt-1", "물 마시기", { kind: "루틴", category: "개인", targetCount: 4, repeatDays: ["월", "화", "수", "목", "금", "토", "일"], amount: 1, unit: "컵", routineIds: [] }),
    task("rt-2", "스쿼트", { kind: "루틴", category: "개인", targetCount: 1, repeatDays: ["월", "화", "수", "목", "금", "토", "일"], amount: 30, unit: "회", routineIds: [] }),
    task("rt-3", "영어 단어", { kind: "루틴", category: "공부", targetCount: 1, repeatDays: ["월", "화", "수", "목", "금", "토", "일"], amount: 10, unit: "개", routineIds: [] }),
  ];
  const binder = [];
  return { calendar, projects, routines, binder, archive: [] };
}

const mockRoutes = (page, data) => {
  page.route("**/api/**", (route, request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/status")
      return route.fulfill({ json: { ok: true, needsToken: false, authRequired: false, authenticated: true, dbs: {} } });
    if (path === "/api/notion/all") return route.fulfill({ json: { ok: true, data, errors: {} } });
    if (path.endsWith("/schema")) return route.fulfill({ json: { ok: true, data: [] } });
    if (path.endsWith("/blocks")) return route.fulfill({ json: { ok: true, data: { text: "", preserved: [] } } });
    return route.fulfill({ json: { ok: true, data: [] } });
  });
};

const MEASURE = () => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const frame = document.querySelector("[data-week-frame]");
  const sections = ["schedule", "projects", "routines"].map((name) => {
    const el = document.querySelector(`[data-week-section="${name}"]`);
    const cs = el ? getComputedStyle(el) : null;
    return {
      name,
      box: box(el),
      borderTop: cs ? `${cs.borderTopWidth} ${cs.borderTopColor}` : null,
      borderBottom: cs ? `${cs.borderBottomWidth} ${cs.borderBottomColor}` : null,
      borderLeft: cs ? `${cs.borderLeftWidth} ${cs.borderLeftColor}` : null,
    };
  });
  const fcs = frame ? getComputedStyle(frame) : null;
  const scroll = document.querySelector("[data-week-scroll]");
  const alldayBlock = document.querySelector("[data-all-day-block]");
  const gutterLabel = [...document.querySelectorAll("[data-timeline-column]")]
    .length
    ? document.querySelector("[data-week-scroll] div.sticky")
    : null;
  const hourLabels = [...document.querySelectorAll("[data-week-scroll] div.sticky div")].filter((n) =>
    /^(오전|오후)\s\d+$/.test(n.textContent.trim()),
  );
  return {
    viewport: { w: innerWidth, h: innerHeight },
    frame: frame
      ? {
          box: box(frame),
          border: `${fcs.borderTopWidth} ${fcs.borderTopColor}`,
          radius: fcs.borderTopLeftRadius,
        }
      : null,
    sections,
    gaps: [
      sections[0].box && sections[1].box ? +(sections[1].box.top - sections[0].box.bottom).toFixed(2) : null,
      sections[1].box && sections[2].box ? +(sections[2].box.top - sections[1].box.bottom).toFixed(2) : null,
    ],
    scheduleScroll: scroll
      ? { h: scroll.clientHeight, w: scroll.clientWidth, overflowY: getComputedStyle(scroll).overflowY, overflowX: getComputedStyle(scroll).overflowX }
      : null,
    allDayH: alldayBlock ? alldayBlock.getBoundingClientRect().height : 0,
    allDayBars: document.querySelectorAll("[data-all-day-bar]").length,
    visibleAllDayBars: [...document.querySelectorAll("[data-all-day-bar]")].filter((n) => n.offsetParent !== null && getComputedStyle(n).display !== "none").length,
    hourLabels: hourLabels.map((n) => n.textContent.trim()),
    timelineH: scroll ? (document.querySelector("[data-timeline-column]") || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height : 0,
    gutter: box(gutterLabel),
    header: box(document.querySelector("[data-week-header]")),
    headerPosition: (() => { const el = document.querySelector("[data-week-header]"); return el ? getComputedStyle(el).position : null; })(),
    bodyScrollTop: document.querySelector("[data-week-scroll]") ? document.querySelector("[data-week-scroll]").scrollTop : null,
  };
};

const FAILS = [];
const PASSES = [];
const check = (name, ok, detail = "") => {
  if (ok) { PASSES.push(name); console.log("PASS ", name); }
  else { FAILS.push(`${name} ${detail}`.trim()); console.log("FAIL ", name, detail); }
};

const open = async (browser, width, height, data, mobile = false) => {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: "ko-KR", deviceScaleFactor: 1,
    isMobile: mobile, hasTouch: mobile,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await mockRoutes(page, data);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
};

const shot = async (page, name) => {
  const path = `${OUT}/${PREFIX}${name}.png`;
  await page.screenshot({ path });
  console.log("shot", path);
  return path;
};

(async () => {
  const data = fixture();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || "/workspace/.tools/pw-browsers/chromium-1148/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  // ---------- PC 주간 ----------
  {
    const { ctx, page } = await open(browser, 1440, 900, data);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(900);
    await shot(page, "pc-week-tight");
    const m = await page.evaluate(MEASURE);
    console.log("PC-WEEK", JSON.stringify(m, null, 1));
    check("PC: 세 구역 프레임 존재", !!m.frame);
    check("PC: 프레임 테두리 2px", !!m.frame && m.frame.border.startsWith("2px"), m.frame && m.frame.border);
    check("PC: 프레임 테두리 진한 검정(#111827)", !!m.frame && m.frame.border.includes("rgb(17, 24, 39)"), m.frame && m.frame.border);
    check("PC: 일정↔프로젝트 여백 0", m.gaps[0] === 0, String(m.gaps[0]));
    check("PC: 프로젝트↔루틴 여백 0", m.gaps[1] === 0, String(m.gaps[1]));
    check("PC: 일정 구역 아래 구분선 2px 검정", /^2px rgb\(17, 24, 39\)/.test(m.sections[0].borderBottom || ""), m.sections[0].borderBottom);
    check("PC: 프로젝트 구역 아래 구분선 2px 검정", /^2px rgb\(17, 24, 39\)/.test(m.sections[1].borderBottom || ""), m.sections[1].borderBottom);
    check("PC: 바깥 테두리만 있고 안쪽 구역엔 좌우 테두리 없음", /^0px/.test(m.sections[1].borderLeft || ""), m.sections[1].borderLeft);
    check("PC: 프로젝트·루틴 구역이 화면 안", m.sections[2].box.bottom <= 900 && m.sections[1].box.top < 900, JSON.stringify(m.sections.map((s) => s.box && s.box.bottom)));
    await page.getByRole("button", { name: "3일", exact: true }).click();
    await page.waitForTimeout(800);
    await shot(page, "pc-three-tight");
    const m3 = await page.evaluate(MEASURE);
    check("PC 3일: 일정↔프로젝트 여백 0", m3.gaps[0] === 0, String(m3.gaps[0]));
    check("PC 3일: 프로젝트↔루틴 여백 0", m3.gaps[1] === 0, String(m3.gaps[1]));
    check("PC 3일: 프레임 2px 검정", !!m3.frame && m3.frame.border.startsWith("2px") && m3.frame.border.includes("rgb(17, 24, 39)"), m3.frame && m3.frame.border);
    await ctx.close();
  }

  // ---------- 모바일 주간 ----------
  {
    const { ctx, page } = await open(browser, 390, 844, data, true);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(900);
    await shot(page, "mobile-week-tight");
    const m = await page.evaluate(MEASURE);
    console.log("MOBILE-WEEK", JSON.stringify(m, null, 1));
    check("모바일: 일정↔프로젝트 여백 0", m.gaps[0] === 0, String(m.gaps[0]));
    check("모바일: 프로젝트↔루틴 여백 0", m.gaps[1] === 0, String(m.gaps[1]));
    check("모바일: 프레임 2px 검정", !!m.frame && m.frame.border.startsWith("2px") && m.frame.border.includes("rgb(17, 24, 39)"), m.frame && m.frame.border);
    // 네 칸 = 종일 1 + 시간 3 (한 칸 32px)
    const ROW = 32;
    check("모바일: 종일 줄 한 줄만 보임", m.visibleAllDayBars <= 1, `visible lanes ${m.visibleAllDayBars} (h ${m.allDayH})`);
    check("모바일: 시간표 세 칸만 렌더", m.timelineH >= ROW * 3 - 1 && m.timelineH <= ROW * 3 + 1, `timelineH ${m.timelineH}`);
    check("모바일: 시각 눈금 네 개(3칸 경계)", m.hourLabels.length === 4, JSON.stringify(m.hourLabels));
    check("모바일: 일정 영역 총 높이 네 칸 이내(+구역 머리글)", m.scheduleScroll.h <= ROW * 4 + 8, `scroll h ${m.scheduleScroll && m.scheduleScroll.h}`);
    check("모바일: 일정 영역이 세로 스크롤 컨테이너 아님", !!m.scheduleScroll && m.scheduleScroll.overflowY === "visible", m.scheduleScroll && m.scheduleScroll.overflowY);
    check("모바일: 프로젝트 구역이 첫 화면 안", m.sections[1].box.top < 844, String(m.sections[1].box.top));
    check("모바일: 루틴 구역도 첫 화면 안", m.sections[2].box.bottom <= 844, String(m.sections[2].box.bottom));

    // 왼쪽 시간 열 고정 — 게시판을 가로로 밀어도 시간 이름이 제자리
    const gutterX = async () => {
      const label = page
        .locator("[data-week-scroll] div.sticky div")
        .filter({ hasText: /^(오전|오후) \d+$/ })
        .first();
      const b = await label.boundingBox();
      return b && b.x;
    };
    const setBoard = (value) => page.evaluate((target) => {
      const col = document.querySelector("[data-timeline-column]");
      let node = col.parentElement;
      while (node && node.scrollWidth <= node.clientWidth) node = node.parentElement;
      if (!node) return null;
      node.scrollLeft = target;
      return node.scrollLeft;
    }, value);
    await setBoard(0);
    await page.waitForTimeout(300);
    const g1 = await gutterX();
    const moved = await setBoard(150);
    await page.waitForTimeout(400);
    const g2 = await gutterX();
    await shot(page, "mobile-week-tight-scrolled");
    check("모바일: 게시판 가로 스크롤 됨", moved !== null && moved >= 140, `-> ${moved}`);
    check("모바일: 가로 이동에도 왼쪽 시간 열 고정", g1 != null && g2 != null && Math.abs(g1 - g2) <= 3, `${g1} vs ${g2}`);

    // 아래로 접어도 날짜 머리글 고정
    const y1 = (await page.locator("[data-week-header]").boundingBox()).y;
    await page.mouse.move(200, 700);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(600);
    const y2 = (await page.locator("[data-week-header]").boundingBox()).y;
    check("모바일: 세로 스크롤에도 날짜 머리글 고정", Math.abs(y2 - y1) < 2, `${y1} -> ${y2}`);
    await page.evaluate(() => {
      const col = document.querySelector("[data-timeline-column]");
      let node = col.parentElement;
      while (node && node.scrollWidth <= node.clientWidth) node = node.parentElement;
      if (node) node.scrollLeft = 0;
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // 전체 버튼 — 시간대가 다 펼쳐지는지
    const scheduleSeg = page.locator('[data-week-section="schedule"]');
    await scheduleSeg.getByRole("button", { name: "전체", exact: true }).click();
    await page.waitForTimeout(700);
    await shot(page, "mobile-week-full");
    const full = await page.evaluate(MEASURE);
    check("모바일 전체: 시간표가 세 칸보다 길어짐", full.timelineH > ROW * 3 + 1, `timelineH ${full.timelineH}`);
    await scheduleSeg.getByRole("button", { name: "기본", exact: true }).click();
    await page.waitForTimeout(600);
    const back = await page.evaluate(MEASURE);
    check("모바일: 다시 네 칸", back.scheduleScroll.h <= ROW * 4 + 8, `h ${back.scheduleScroll.h}`);
    await ctx.close();
  }

  // ---------- 모바일 3일 ----------
  {
    const { ctx, page } = await open(browser, 390, 844, data, true);
    await page.getByRole("button", { name: "3일", exact: true }).click();
    await page.waitForTimeout(900);
    await shot(page, "mobile-three-tight");
    const m = await page.evaluate(MEASURE);
    check("모바일 3일: 일정↔프로젝트 여백 0", m.gaps[0] === 0, String(m.gaps[0]));
    check("모바일 3일: 시간표 세 칸", m.timelineH >= 31 * 3 - 1 && m.timelineH <= 33 * 3 + 1, `timelineH ${m.timelineH}`);
    check("모바일 3일: 일정 영역 네 칸 이내", m.scheduleScroll.h <= 32 * 4 + 8, `h ${m.scheduleScroll.h}`);
    await ctx.close();
  }

  // ---------- 프로젝트 탭: index 설명 · 루틴 요일 동그라미 ----------
  const PROJECT_MEASURE = () => {
    const cards = [...document.querySelectorAll("article")]
      .map((card) => {
        const circles = [...card.querySelectorAll("[data-routine-day]")].map((el) => {
          const r = el.getBoundingClientRect();
          return { label: el.dataset.routineDay, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), font: getComputedStyle(el).fontSize };
        });
        if (circles.length === 0) return null;
        const box = card.getBoundingClientRect();
        return {
          circles,
          card: { w: Math.round(box.width), left: Math.round(box.left), right: Math.round(box.right) },
          overflow: Math.round(circles.reduce((max, c) => Math.max(max, c.right), 0) - (box.right - 2)),
        };
      })
      .filter(Boolean);
    return {
      cards,
      indexText: [...document.querySelectorAll("p")].map((p) => p.textContent.trim()).find((t) => t.includes("분류") || t.includes("트랙에 넣지")) || null,
    };
  };
  for (const [label, width, height, mobile] of [["pc", 1440, 900, false], ["mobile", 390, 844, true]]) {
    const { ctx, page } = await open(browser, width, height, data, mobile);
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(900);
    await shot(page, `projects-${label}-routine`);
    const m = await page.evaluate(PROJECT_MEASURE);
    console.log(`PROJECTS-${label}`, JSON.stringify(m.cards.map((c) => ({ card: c.card.w, overflow: c.overflow, w: c.circles[0].w, font: c.circles[0].font }))));
    const biggest = m.cards[0] && m.cards[0].circles[0];
    check(`${label} 프로젝트: 요일 동그라미 28px 이상`, !!biggest && biggest.w >= 28 && biggest.h >= 28, JSON.stringify(biggest));
    check(`${label} 프로젝트: 요일 글자 13px 이상`, !!biggest && parseFloat(biggest.font) >= 13, biggest && biggest.font);
    check(`${label} 프로젝트: 요일 줄이 카드 밖으로 넘치지 않음`, m.cards.length > 0 && m.cards.every((c) => c.overflow <= 0), JSON.stringify(m.cards.map((c) => c.overflow)));
    check(`${label} 프로젝트: index 카드 설명이 '아직 분류되지 않은 할 일'`, m.indexText === "아직 분류되지 않은 할 일", String(m.indexText));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${PREFIX || "RESULT"} =====`);
  console.log(`passed ${PASSES.length} · failed ${FAILS.length}`);
  for (const f of FAILS) console.log(" -", f);
  process.exit(FAILS.length ? 1 : 0);
})();
