/**
 * 월간 캘린더 하루 표시 개수 + 일정 색(노션 팔레트) 검증.
 *
 *    BASE=http://127.0.0.1:3214 PLAYWRIGHT_BROWSERS_PATH=/workspace/.tools/pw-browsers \
 *      node tests/month-color.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/workspace/.tools/pw/node_modules/playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://127.0.0.1:3214";
const OUT = process.env.OUT || "/workspace/downloads/diary-a17";
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
  allDay: true, done: false, canceled: false, cancelReason: "", cancelAt: null, weekKey: "", baseDate: null, ...extra,
});
const task = (id, title, extra = {}) => ({
  ...base(id, title),
  kind: "할 일", category: "개인", status: "미완료", date: null, due: null, doneAt: null, checkedAt: null,
  urgent: false, important: false, history: false, waitFor: "", waitNote: "", cancelReason: "", cancelAt: null,
  repeatGroupId: "", ...extra,
});

function fixture() {
  return {
    calendar: [
      event("ad-1", "제주도 여행", "2026-11-19", { endDate: "2026-11-22" }),
      event("ad-2", "김장 재료 사기", TODAY),
      event("ev-3", "치과", TODAY, { startTime: "14:00", endTime: "15:00", allDay: false }),
      event("ev-4", "저녁 약속", TODAY, { startTime: "18:30", endTime: "20:00", allDay: false }),
      event("ev-1", "주간 회의", "2026-11-16", { startTime: "09:30", endTime: "10:30", allDay: false }),
      event("ev-2", "성과 리뷰", "2026-11-19", { startTime: "10:00", endTime: "11:00", allDay: false }),
      event("ev-5", "필라테스", "2026-11-20", { startTime: "19:00", endTime: "20:00", allDay: false }),
      event("goal-1", "포트폴리오 사례 2장 정리", WEEK_START, { kind: "주간 목표", weekKey: WEEK_KEY, baseDate: WEEK_START }),
    ],
    projects: [
      task("pj-1", "브랜드 포트폴리오", { kind: "프로젝트", category: "업무", date: "2026-11-10", due: "2026-11-30", memo: "사례 3개 정리" }),
      task("pj-2", "집 정리", { kind: "프로젝트", category: "개인", date: "2026-11-01" }),
      task("pj-3", "겨울 준비", { kind: "프로젝트", category: "개인", date: "2026-10-20", status: "완료", doneAt: "2026-11-02" }),
      task("pj-4", "뉴스레터 정리", { kind: "프로젝트", category: "업무", date: "2026-10-01", history: true }),
      task("tk-6", "이불 정리", { category: "개인", date: "2026-11-02", status: "완료", doneAt: "2026-11-02", projectIds: ["pj-3"] }),
      task("tk-1", "사례 1 정리", { category: "업무", date: "2026-11-18", urgent: true, important: true, projectIds: ["pj-1"] }),
      task("tk-3", "와이어프레임", { category: "업무", date: TODAY, projectIds: ["pj-1"] }),
      task("tk-30", "포트폴리오 사례 정리와 브랜드 가이드 점검", { category: "업무", date: TODAY, memo: "레퍼런스 40장", projectIds: ["pj-1"] }),
      task("tk-4", "약국 들르기", { category: "개인", date: TODAY, favorite: true, urgent: true }),
      task("tk-5", "옷장 비우기", { category: "개인", date: "2026-11-22", projectIds: ["pj-2"] }),
    ],
    routines: [
      task("rt-1", "물 마시기", { kind: "루틴", category: "개인", targetCount: 4, repeatDays: ["월", "화", "수", "목", "금", "토", "일"], amount: 1, unit: "컵", routineIds: [] }),
      task("rt-2", "스쿼트", { kind: "루틴", category: "개인", targetCount: 1, repeatDays: ["월", "화", "수", "목", "금", "토", "일"], amount: 30, unit: "회", routineIds: [] }),
      task("rt-3", "영어 단어", { kind: "루틴", category: "공부", targetCount: 1, repeatDays: ["월", "화", "수", "목", "금", "토", "일"], amount: 10, unit: "개", routineIds: [] }),
    ],
    binder: [],
    archive: [],
  };
}

const FAILS = [];
const PASSES = [];
const check = (name, ok, detail = "") => {
  if (ok) { PASSES.push(name); console.log("PASS ", name); }
  else { FAILS.push(`${name} ${detail}`.trim()); console.log("FAIL ", name, detail); }
};

const mockRoutes = (page, data) =>
  page.route("**/api/**", (route, request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/status")
      return route.fulfill({ json: { ok: true, needsToken: false, authRequired: false, authenticated: true, dbs: {} } });
    if (path === "/api/notion/all") return route.fulfill({ json: { ok: true, data, errors: {} } });
    if (path.endsWith("/schema")) return route.fulfill({ json: { ok: true, data: [] } });
    if (path.endsWith("/blocks")) return route.fulfill({ json: { ok: true, data: { text: "", preserved: [] } } });
    if (request.method() === "PATCH" || request.method() === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      return route.fulfill({ json: { ok: true, data: { ...data.calendar[0], ...body, id: data.calendar[0].id } } });
    }
    return route.fulfill({ json: { ok: true, data: [] } });
  });

const CELLS = () => {
  const cells = [...document.querySelectorAll("[class*='group relative']")];
  const pick = cells.filter((cell) => cell.querySelector("[data-month-item], button"));
  return pick.slice(0, 0);
};

const MEASURE = () => {
  const out = [];
  for (const cell of document.querySelectorAll("div.group.relative")) {
    const box = cell.getBoundingClientRect();
    const dayButton = cell.querySelector("button");
    const day = dayButton ? Number(dayButton.textContent.trim()) : null;
    const items = [...cell.querySelectorAll("[data-month-item]")].map((el) => {
      const r = el.getBoundingClientRect();
      const fully = r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      return { id: el.getAttribute("data-month-item"), h: Math.round(r.height), fully };
    });
    out.push({ day, cellH: Math.round(box.height), items, shown: items.filter((i) => i.fully).length });
  }
  return out;
};

async function openMonth(browser, width, height, dayItems, mobile = false) {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: "ko-KR", deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.addInitScript((count) => {
    window.localStorage.setItem(
      "my-diary:settings:v1",
      JSON.stringify({ monthDayItems: count, calendarDefaultView: "month", fontSize: 3 }),
    );
  }, dayItems);
  await mockRoutes(page, fixture());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || "/workspace/.tools/pw-browsers/chromium-1148/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  // ---------- 월간: 설정한 개수만큼 실제로 보이는지 ----------
  for (const dayItems of [3, 5]) {
    const { ctx, page } = await openMonth(browser, 1440, 900, dayItems);
    await page.getByRole("button", { name: "월간", exact: true }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/month-${dayItems}.png` });
    const cells = await page.evaluate(MEASURE);
    const today = cells.find((c) => c.day === 21);
    console.log(`MONTH-${dayItems} today`, JSON.stringify(today));
    const busiest = cells.reduce((max, c) => (c.items.length > (max?.items.length ?? 0) ? c : max), null);
    console.log(`MONTH-${dayItems} busiest`, JSON.stringify(busiest));
    check(
      `월간 ${dayItems}개: 설정한 만큼 보임 (오늘 ${today && today.items.length}개 중 ${today && today.shown}개)`,
      !!today && today.shown >= Math.min(dayItems, today.items.length),
      JSON.stringify(today),
    );
    check(`월간 ${dayItems}개: 어떤 칸도 설정보다 적게 보이지 않음`, cells.every((c) => c.shown >= Math.min(dayItems, c.items.length)), JSON.stringify(cells.filter((c) => c.shown < Math.min(dayItems, c.items.length))));
    await ctx.close();
  }

  // ---------- 일정 색 ----------
  {
    const { ctx, page } = await openMonth(browser, 1440, 900, 3);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(900);
    // 시간 일정을 눌러 상세를 열고 팔레트에서 파랑 선택
    await page.locator('[data-timeline-column] button').filter({ hasText: "치과" }).first().click();
    await page.waitForTimeout(900);
    const palette = await page.evaluate(() => document.querySelectorAll("[data-event-color]").length);
    check("색: 상세 화면에 노션 팔레트 10색", palette === 10, String(palette));
    await page.locator('[data-event-color="blue"]').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/color-detail.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    const week = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-timeline-column] button')].find((b) => b.textContent.includes("치과"));
      if (!el) return null;
      const cs = getComputedStyle(el);
      const title = [...el.querySelectorAll("span")].find((n) => n.textContent.includes("치과"));
      return {
        bg: cs.backgroundColor,
        color: cs.color,
        titleColor: title ? getComputedStyle(title).color : null,
        stored: window.localStorage.getItem("my-diary:event-colors:v1"),
      };
    });
    console.log("COLOR-WEEK", JSON.stringify(week));
    check("색: 주간 일정 블록 배경이 파랑", !!week && week.bg === "rgb(230, 241, 248)", JSON.stringify(week));
    check("색: 주간 일정 블록 글자도 파랑", !!week && week.titleColor === "rgb(47, 108, 158)", JSON.stringify(week));
    check("색: 브라우저에 저장됨", !!week && !!week.stored && week.stored.includes("ev-3"), week && week.stored);
    await page.screenshot({ path: `${OUT}/color-week.png` });

    // 월간 칩에도 같은 색
    await page.getByRole("button", { name: "월간", exact: true }).click();
    await page.waitForTimeout(900);
    const month = await page.evaluate(() => {
      const el = document.querySelector('[data-month-item="ev-3"]');
      return el ? getComputedStyle(el).color : null;
    });
    check("색: 월간 칩 글자색에도 반영", month === "rgb(47, 108, 158)", String(month));
    await page.screenshot({ path: `${OUT}/color-month.png` });

    // 새로 고침해도 유지 (기본 보기=월간)
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1");
    await page.waitForTimeout(1800);
    const reloaded = await page.evaluate(() => {
      const el = document.querySelector('[data-month-item="ev-3"]');
      return el ? getComputedStyle(el).color : null;
    });
    check("색: 새로 고침 후에도 유지", reloaded === "rgb(47, 108, 158)", String(reloaded));

    // 수정 창(새 일정)에도 팔레트가 있는지
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "새 일정", exact: true }).click();
    await page.waitForTimeout(700);
    const editorPalette = await page.evaluate(() => document.querySelectorAll("[data-event-color]").length);
    check("색: 새 일정 창에도 팔레트 10색", editorPalette === 10, String(editorPalette));
    await page.keyboard.press("Escape");
    await ctx.close();
  }

  // ---------- 프로젝트 파스텔 ----------
  {
    const { ctx, page } = await openMonth(browser, 1440, 900, 3);
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/projects-pastel.png` });
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll("[data-project-card]")].map((el) => ({
        id: el.getAttribute("data-project-card"),
        bg: getComputedStyle(el).backgroundColor,
      })),
    );
    console.log("PASTEL-CARDS", JSON.stringify(cards));
    check("파스텔: 프로젝트 카드마다 배경이 다름", cards.length >= 2 && new Set(cards.map((c) => c.bg)).size >= 2, JSON.stringify(cards));
    check("파스텔: 흰 배경이 아닌 옅은 톤", cards.every((c) => c.bg !== "rgb(255, 255, 255)"), JSON.stringify(cards));

    // 주간 보기 프로젝트 행 라벨도 같은 톤
    await page.locator("nav button", { hasText: "캘린더" }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(900);
    const labels = await page.evaluate(() =>
      ["브랜드 포트폴리오", "집 정리"].map((title) => {
        const btn = [...document.querySelectorAll("button[aria-label]")].find((b) => b.getAttribute("aria-label") === title);
        return btn ? { title, bg: getComputedStyle(btn.parentElement).backgroundColor } : { title, bg: null };
      }),
    );
    console.log("PASTEL-WEEK", JSON.stringify(labels));
    check(
      "파스텔: 주간 프로젝트 행 라벨도 옅은 톤으로 구분",
      labels.every((l) => l.bg && l.bg !== "rgb(255, 255, 255)") && labels[0].bg !== labels[1].bg,
      JSON.stringify(labels),
    );
    await page.screenshot({ path: `${OUT}/week-pastel.png` });

    // 프로젝트 상세에서 색 바꾸기
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(800);
    await page.locator("[data-project-card]").first().getByRole("button", { name: "프로젝트 열기" }).click();
    await page.waitForTimeout(700);
    const drawerPalette = await page.evaluate(() => document.querySelectorAll("[data-project-color]").length);
    check("파스텔: 프로젝트 상세에 팔레트 10색", drawerPalette === 10, String(drawerPalette));
    await page.locator('[data-project-color="mint"]').click();
    await page.waitForTimeout(400);
    const applied = await page.evaluate(() => {
      const el = document.querySelector("[data-project-card]");
      return { card: el ? getComputedStyle(el).backgroundColor : null, stored: window.localStorage.getItem("my-diary:project-colors:v1") };
    });
    console.log("PASTEL-CHOSEN", JSON.stringify(applied));
    check("파스텔: 고른 민트가 카드에 적용", applied.card === "rgb(238, 250, 244)", String(applied.card));
    check("파스텔: 브라우저에 저장됨", !!applied.stored && applied.stored.includes("mint"), applied.stored);

    // 히스토리 — 트랙과 같은 카드
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "히스토리", exact: true }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/history-cards.png` });
    const history = await page.evaluate(() => ({
      cards: document.querySelectorAll("[data-project-card]").length,
      restore: [...document.querySelectorAll("[data-project-card] button")].filter((b) => b.textContent.trim() === "되살리기").length,
      firstBg: document.querySelector("[data-project-card]") ? getComputedStyle(document.querySelector("[data-project-card]")).backgroundColor : null,
    }));
    console.log("HISTORY", JSON.stringify(history));
    check("히스토리: 지난 프로젝트가 카드로 보임", history.cards >= 2, JSON.stringify(history));
    check("히스토리: 카드마다 되살리기 버튼", history.restore >= 2, JSON.stringify(history));
    check("히스토리: 카드도 파스텔 톤", !!history.firstBg && history.firstBg !== "rgb(255, 255, 255)", String(history.firstBg));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== RESULT =====\npassed ${PASSES.length} · failed ${FAILS.length}`);
  for (const f of FAILS) console.log(" -", f);
  process.exit(FAILS.length ? 1 : 0);
})();
