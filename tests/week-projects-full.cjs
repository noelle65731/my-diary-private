/**
 * A18 검증 — 주간·3일 보기 `프로젝트` 영역의 안쪽 세로 스크롤이 없어지고, 프로젝트가
 * 몇 개든 접기 전까지 전부 펼쳐지는지 / 구역 구분선이 진회색으로 한 단계 부드러워졌는지 /
 * 루틴 NOW 숨김이 프로젝트 탭 카드·캘린더에서 프로젝트와 같이 동작하는지.
 *
 *    PLAYWRIGHT_BROWSERS_PATH=/workspace/.tools/pw-browsers \
 *      node tests/week-projects-full.cjs            # BASE=http://127.0.0.1:3214
 *
 * 환경변수: BASE, OUT, PREFIX, CHROME, PLAYWRIGHT_MODULE
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/workspace/.tools/pw/node_modules/playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://127.0.0.1:3214";
const OUT = process.env.OUT || "/workspace/downloads/diary-a18";
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
const routine = (id, title, extra = {}) => ({
  ...base(id, title),
  kind: "루틴", category: "개인", date: null, repeatDays: ["월", "화", "수", "목", "금", "토", "일"],
  targetCount: 2, execCount: 0, amount: 1, unit: "회", history: false, routineIds: [], ...extra,
});

function fixture(visibleProjects = 6) {
  const names = [
    "브랜드 포트폴리오", "깨끗한나라 지원", "사이드 프로젝트", "집 정리", "겨울 준비", "영어 회화",
    "포트폴리오 리뉴얼", "이력서 정리", "운동 계획", "책 읽기", "가계부", "여행 준비",
  ];
  const projects = Array.from({ length: visibleProjects }, (_, index) =>
    task(`pj-${index + 1}`, names[index] || `프로젝트 ${index + 1}`, {
      kind: "프로젝트",
      category: index < 3 ? "업무" : index < 6 ? "개인" : "공부",
      date: "2026-11-05",
    }),
  );
  projects.push(task("pj-hidden", "NOW 숨긴 프로젝트", { kind: "프로젝트", category: "업무", date: "2026-11-09", hidden: true }));
  const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", TODAY];
  const tasks = [];
  projects.filter((project) => project.kind === "프로젝트" && !project.hidden).forEach((project, index) => {
    days.forEach((day, dayIndex) => {
      tasks.push(
        task(`tk-${index}-${dayIndex}`, `${project.title} 할 일 ${dayIndex + 1}`, {
          category: project.category,
          date: day,
          projectIds: [project.id],
          urgent: index === 0 && dayIndex === 0,
          important: dayIndex === 0,
        }),
      );
    });
  });
  const calendar = [
    event("ad-1", "제주도 여행", "2026-11-19", { endDate: "2026-11-22" }),
    event("ev-1", "주간 회의", "2026-11-16", { startTime: "09:30", endTime: "10:30", allDay: false }),
    event("ev-2", "치과", TODAY, { startTime: "14:00", endTime: "15:00", allDay: false }),
    event("goal-1", "포트폴리오 사례 2장 정리", WEEK_START, { kind: "주간 목표", weekKey: WEEK_KEY, baseDate: WEEK_START }),
  ];
  const routines = [
    routine("rt-1", "물 마시기", { category: "개인", targetCount: 4, checkedAt: null }),
    routine("rt-2", "스쿼트", { category: "개인", targetCount: 1 }),
    routine("rt-3", "영어 단어", { category: "공부", targetCount: 1 }),
    routine("rt-4", "NOW 숨긴 루틴", { category: "공부", hidden: true }),
  ];
  return { calendar, projects: [...projects, ...tasks], routines, binder: [], archive: [] };
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
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  };
  const section = document.querySelector('[data-week-section="projects"]');
  const frame = document.querySelector("[data-week-frame]");
  const board = document.querySelector("[data-week-board-scroll]");
  const scs = section ? getComputedStyle(section) : null;
  const fcs = frame ? getComputedStyle(frame) : null;
  const bcs = board ? getComputedStyle(board) : null;
  const rows = [...document.querySelectorAll('[data-week-section="projects"] [data-drop-zone="week-task-day"]')];
  const projectRows = [...document.querySelectorAll('[data-week-section="projects"] > div > div.grid')];
  const projectLabels = projectRows
    .map((row) => row.querySelector("button[aria-label]")?.getAttribute("aria-label") ?? "")
    .filter((label) => label && label !== "할 일 추가" && label !== "상세 열기");
  const routineRows = [...document.querySelectorAll('[data-week-section="routines"] [data-week-routine-day]')];
  const routineTitles = [...document.querySelectorAll('[data-week-section="routines"] button[title]')]
    .map((n) => (n.getAttribute("title") || "").split(" · ")[0])
    .filter(Boolean);
  return {
    viewport: { w: innerWidth, h: innerHeight },
    section: section
      ? {
          box: box(section),
          overflowY: scs.overflowY,
          maxHeight: scs.maxHeight,
          scrollHeight: section.scrollHeight,
          clientHeight: section.clientHeight,
          innerScroll: section.scrollHeight > section.clientHeight + 1,
        }
      : null,
    frame: frame
      ? { box: box(frame), border: `${fcs.borderTopWidth} ${fcs.borderTopColor}`, overflow: fcs.overflow }
      : null,
    board: board
      ? { box: box(board), overflowY: bcs.overflowY, scrollHeight: board.scrollHeight, clientHeight: board.clientHeight, scrollable: board.scrollHeight > board.clientHeight + 1 }
      : null,
    rowCount: rows.length,
    projectRows: projectRows.length,
    labels: projectLabels,
    /** 마지막 프로젝트 행의 아래쪽이 구역 안에 들어오는가 = 잘리지 않고 전부 보임 */
    lastRow: rows.length ? box(rows[rows.length - 1].parentElement) : null,
    routineTitles,
    routineRows: routineRows.length,
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
  page.setDefaultTimeout(20000);
  await mockRoutes(page, data);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 40000 });
  await page.waitForTimeout(1500);
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

  // ---------- PC 주간: 프로젝트 6개 전부 펼침 ----------
  {
    const { ctx, page } = await open(browser, 1440, 900, data);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(1200);
    await shot(page, "week-projects-full");
    const m = await page.evaluate(MEASURE);
    console.log("PC-WEEK", JSON.stringify(m, null, 1));
    check("PC: 프로젝트 구역이 세로 스크롤 컨테이너가 아님", m.section && !["auto", "scroll"].includes(m.section.overflowY), m.section && m.section.overflowY);
    check("PC: 프로젝트 구역 안쪽 스크롤 없음(scrollHeight=clientHeight)", m.section && !m.section.innerScroll, m.section && `${m.section.scrollHeight}/${m.section.clientHeight}`);
    check("PC: 프로젝트 행 라벨 6개 모두 렌더", m.projectRows === 6 && m.labels.length === 6, JSON.stringify({ rows: m.projectRows, labels: m.labels }));
    check("PC: 마지막 프로젝트 행이 구역 안(잘리지 않음)", !!m.section && !!m.lastRow && m.lastRow.bottom <= m.section.box.bottom + 2, JSON.stringify({ last: m.lastRow, section: m.section && m.section.box }));
    check("PC: 6개는 게시판 한 화면에 다 들어옴", !!m.board, m.board && `${m.board.scrollHeight}/${m.board.clientHeight}`);
    check("PC: 프레임 테두리 2px", !!m.frame && m.frame.border.startsWith("2px"), m.frame && m.frame.border);
    check("PC: 테두리가 진회색(#6b7280)", !!m.frame && m.frame.border.includes("rgb(107, 114, 128)"), m.frame && m.frame.border);

    // 게시판을 끝까지 내리면 루틴 구역까지 보임
    const bottom = await page.evaluate(() => {
      const board = document.querySelector("[data-week-board-scroll]");
      board.scrollTop = board.scrollHeight;
      const el = document.querySelector('[data-week-section="routines"]');
      const r = el.getBoundingClientRect();
      const b = board.getBoundingClientRect();
      return { routineTop: Math.round(r.top), routineBottom: Math.round(r.bottom), boardBottom: Math.round(b.bottom) };
    });
    await page.waitForTimeout(600);
    await shot(page, "week-projects-full-scrolled");
    check("PC: 끝까지 내리면 루틴 구역이 게시판 안에 보임", bottom.routineBottom <= bottom.boardBottom + 2, JSON.stringify(bottom));

    // 3일 보기
    await page.evaluate(() => {
      const board = document.querySelector("[data-week-board-scroll]");
      if (board) board.scrollTop = 0;
    });
    await page.getByRole("button", { name: "3일", exact: true }).click();
    await page.waitForTimeout(1000);
    const m3 = await page.evaluate(MEASURE);
    await shot(page, "three-projects-full");
    check("3일: 프로젝트 구역 안쪽 스크롤 없음", m3.section && !m3.section.innerScroll, m3.section && `${m3.section.scrollHeight}/${m3.section.clientHeight}`);
    check("3일: 프로젝트 행 라벨 6개 모두 렌더", m3.projectRows === 6 && m3.labels.length === 6, JSON.stringify({ rows: m3.projectRows, labels: m3.labels }));

    // NOW 모드 — 숨긴 프로젝트·루틴이 캘린더에서 함께 사라짐
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(600);
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "NOW 숨김만 보기" }).click();
    await page.waitForTimeout(600);
    await page.locator("nav button", { hasText: "캘린더" }).first().click();
    await page.waitForTimeout(1000);
    const nowM = await page.evaluate(MEASURE);
    console.log("NOW-WEEK", JSON.stringify(nowM.routineTitles), JSON.stringify(nowM.labels));
    check("NOW: 숨긴 프로젝트 행이 주간 보기에서 사라짐", !nowM.labels.includes("NOW 숨긴 프로젝트"), JSON.stringify(nowM.labels));
    check("NOW: 숨긴 루틴이 주간 보기에서 사라짐", !nowM.routineTitles.includes("NOW 숨긴 루틴"), JSON.stringify(nowM.routineTitles));
    check("NOW: 보이는 루틴은 남아 있음", nowM.routineTitles.includes("물 마시기"), JSON.stringify(nowM.routineTitles));
    await shot(page, "week-now-routines");

    // 루틴 보기에서도 숨김
    await page.getByRole("button", { name: "루틴 보기", exact: true }).click().catch(async () => {
      await page.locator("button", { hasText: /^루틴$/ }).last().click();
    });
    await page.waitForTimeout(1000);
    const habitText = await page.evaluate(() => document.body.innerText);
    await shot(page, "habit-now-routines");
    check("NOW: 루틴 보기에서도 숨긴 루틴이 사라짐", !habitText.includes("NOW 숨긴 루틴"), "본문에 남아 있음");
    check("NOW: 루틴 보기에 보이는 루틴은 남아 있음", habitText.includes("물 마시기"));

    // NOW 끄기 — 다시 전부 보임
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "NOW 숨김만 보기" }).click();
    await page.waitForTimeout(400);
    await page.locator("nav button", { hasText: "캘린더" }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(1000);
    const offM = await page.evaluate(MEASURE);
    check("NOW 끔: 숨긴 루틴이 다시 보임", offM.routineTitles.includes("NOW 숨긴 루틴"), JSON.stringify(offM.routineTitles));
    await ctx.close();
  }

  // ---------- 프로젝트 탭: 파스텔 농도 · 루틴 카드 NOW ----------
  {
    const { ctx, page } = await open(browser, 1440, 900, data);
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(1200);
    await shot(page, "projects-pastel-soft");
    const pastel = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-project-card]")];
      return cards.slice(0, 6).map((card) => ({
        id: card.getAttribute("data-project-card"),
        bg: getComputedStyle(card).backgroundColor,
        border: getComputedStyle(card).borderTopColor,
      }));
    });
    console.log("PASTEL", JSON.stringify(pastel));
    const lum = (rgb) => {
      const [r, g, b] = rgb.match(/\d+/g).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    check("프로젝트 카드 배경이 아주 옅은 파스텔(밝기 240 이상)", pastel.length > 0 && pastel.every((item) => item.bg.startsWith("rgb") && lum(item.bg) >= 240), JSON.stringify(pastel.map((p) => p.bg)));
    check("프로젝트 카드 10종이 서로 다른 톤", new Set(pastel.map((p) => p.bg)).size >= Math.min(6, pastel.length), JSON.stringify(pastel.map((p) => p.bg)));

    // 루틴 카드의 한 줄 NOW 버튼
    const routineNow = page.locator("[data-routine-now]").first();
    const routineNowCount = await page.locator("[data-routine-now]").count();
    check("프로젝트 탭: 루틴 카드마다 작은 NOW 버튼", routineNowCount >= 3, String(routineNowCount));
    const before = await routineNow.getAttribute("aria-pressed");
    await routineNow.click();
    await page.waitForTimeout(700);
    const after = await page.locator("[data-routine-now]").first().getAttribute("aria-pressed");
    check("루틴 카드 NOW 버튼이 켜짐/꺼짐을 바꿈", before === "false" && after === "true", `${before} -> ${after}`);
    await shot(page, "projects-routine-now-on");

    // 저장된 값을 기억하는지(새로고침)
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1");
    await page.waitForTimeout(1500);
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(1200);
    const persisted = await page.evaluate(() =>
      [...document.querySelectorAll("[data-routine-now]")].map((n) => ({ id: n.getAttribute("data-routine-now"), on: n.getAttribute("aria-pressed") })),
    );
    console.log("ROUTINE-NOW", JSON.stringify(persisted));
    check("루틴 NOW 값이 새로고침 뒤에도 남음", persisted.some((item) => item.on === "true"), JSON.stringify(persisted));

    // 루틴 수정 창에서도 NOW 숨김을 켤 수 있는지
    await page.locator('[data-routine-now]').first().click(); // 먼저 꺼 둡니다
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "물 마시기", exact: true }).first().click();
    await page.waitForTimeout(800);
    const routineDialog = page.locator('[role="dialog"]').first();
    const nowToggle = routineDialog.getByRole("button", { name: /NOW 숨김/ }).first();
    const toggleCount = await routineDialog.getByRole("button", { name: /NOW 숨김/ }).count();
    check("루틴 수정 창에 NOW 숨김 토글이 있음", toggleCount > 0, String(toggleCount));
    if (toggleCount > 0) {
      await nowToggle.click();
      await page.waitForTimeout(300);
      await routineDialog.getByRole("button", { name: "저장", exact: true }).first().click().catch(async () => {
        await routineDialog.getByRole("button", { name: /저장/ }).first().click();
      });
      await page.waitForTimeout(900);
      const saved = await page.evaluate(() => {
        const map = JSON.parse(localStorage.getItem("my-diary:routine-now:v1") || "{}");
        return { map, ons: [...document.querySelectorAll("[data-routine-now]")].map((n) => ({ id: n.getAttribute("data-routine-now"), on: n.getAttribute("aria-pressed") })) };
      });
      console.log("EDITOR-NOW", JSON.stringify(saved));
      check("수정 창에서 켠 NOW 숨김이 저장됨", Object.values(saved.map).some((value) => value === true), JSON.stringify(saved.map));
      check("수정 창에서 켠 값이 카드에 반영됨", saved.ons.some((item) => item.on === "true"), JSON.stringify(saved.ons));
    }
    await shot(page, "projects-routine-editor-now");

    // 켬 → NOW 스위치를 켜면 루틴 카드에서 사라짐
    const hiddenNow = await page.evaluate(() =>
      [...document.querySelectorAll("[data-routine-now]")]
        .filter((n) => n.getAttribute("aria-pressed") === "true")
        .map((n) => n.getAttribute("data-routine-now")),
    );
    await page.getByRole("button", { name: "NOW 숨김만 보기" }).click();
    await page.waitForTimeout(800);
    const nowIds = await page.evaluate(() => [...document.querySelectorAll("[data-routine-now]")].map((n) => n.getAttribute("data-routine-now")));
    check("프로젝트 탭: NOW를 켜면 NOW 숨긴 루틴이 카드에서 사라짐", hiddenNow.length > 0 && !hiddenNow.some((id) => nowIds.includes(id)), JSON.stringify({ hiddenNow, nowIds }));
    await shot(page, "projects-routine-now-hidden");
    await ctx.close();
  }

  // ---------- PC 주간: 프로젝트 12개 — 화면보다 길면 게시판이 대신 움직임 ----------
  {
    const many = fixture(12);
    const { ctx, page } = await open(browser, 1440, 900, many);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(1200);
    await shot(page, "week-projects-many");
    const m = await page.evaluate(MEASURE);
    console.log("PC-WEEK-12", JSON.stringify({ section: m.section, board: m.board, rows: m.projectRows, frame: m.frame }, null, 1));
    check("12개: 프로젝트 구역 안쪽 스크롤 없음", m.section && !m.section.innerScroll, m.section && `${m.section.scrollHeight}/${m.section.clientHeight}`);
    check("12개: 12행 모두 렌더", m.projectRows === 12, String(m.projectRows));
    check("12개: 게시판이 세로로 길어짐(대신 스크롤)", !!m.board && m.board.scrollable, m.board && `${m.board.scrollHeight}/${m.board.clientHeight}`);
    const reach = await page.evaluate(() => {
      const board = document.querySelector("[data-week-board-scroll]");
      const rows = [...document.querySelectorAll('[data-week-section="projects"] > div > div.grid')];
      const last = rows[rows.length - 1].getBoundingClientRect();
      return { lastBottomBefore: Math.round(last.bottom), boardClient: board.clientHeight, boardScroll: board.scrollHeight };
    });
    await page.evaluate(() => {
      const board = document.querySelector("[data-week-board-scroll]");
      const rows = [...document.querySelectorAll('[data-week-section="projects"] > div > div.grid')];
      rows[rows.length - 1].scrollIntoView({ block: "nearest" });
    });
    await page.waitForTimeout(600);
    await shot(page, "week-projects-many-scrolled");
    const after = await page.evaluate(() => {
      const board = document.querySelector("[data-week-board-scroll]");
      const rows = [...document.querySelectorAll('[data-week-section="projects"] > div > div.grid')];
      const last = rows[rows.length - 1].getBoundingClientRect();
      const b = board.getBoundingClientRect();
      return { lastTop: Math.round(last.top), lastBottom: Math.round(last.bottom), boardTop: Math.round(b.top), boardBottom: Math.round(b.bottom), scrollTop: Math.round(board.scrollTop) };
    });
    console.log("REACH", JSON.stringify(reach), JSON.stringify(after));
    check("12개: 끝까지 내리면 마지막 프로젝트 행이 게시판 안에 보임", after.lastBottom <= after.boardBottom + 2 && after.lastTop >= after.boardTop - 2, JSON.stringify(after));
    check("12개: 날짜 머리글은 위에 붙어 있음", await page.locator("[data-week-header]").evaluate((n) => Math.abs(n.getBoundingClientRect().top - document.querySelector("[data-week-board-scroll]").getBoundingClientRect().top) < 6));
    await ctx.close();
  }

  // ---------- 모바일 주간: 프로젝트 전부 펼침 ----------
  {
    const { ctx, page } = await open(browser, 390, 844, data, true);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(1200);
    await shot(page, "week-projects-full-mobile");
    const m = await page.evaluate(MEASURE);
    console.log("MOBILE-WEEK", JSON.stringify(m, null, 1));
    check("모바일: 프로젝트 구역 안쪽 스크롤 없음", m.section && !m.section.innerScroll, m.section && `${m.section.scrollHeight}/${m.section.clientHeight}`);
    check("모바일: 프로젝트 행 라벨 6개 모두 렌더", m.projectRows === 6 && m.labels.length === 6, JSON.stringify({ rows: m.projectRows, labels: m.labels }));
    check("모바일: 게시판 높이가 화면 안에서 정리됨", !!m.board && m.board.clientHeight > 300, m.board && `${m.board.scrollHeight}/${m.board.clientHeight}`);

    // 왼쪽 프로젝트 이름 열은 가로 이동에도 고정
    const setBoard = (value) => page.evaluate((target) => {
      const board = document.querySelector("[data-week-board-scroll]");
      board.scrollLeft = target;
      return board.scrollLeft;
    }, value);
    const labelX = async () => {
      const b = await page.locator('[data-week-section="projects"] button[aria-label="브랜드 포트폴리오"]').first().boundingBox();
      return b && b.x;
    };
    await setBoard(0);
    await page.waitForTimeout(300);
    const x1 = await labelX();
    const moved = await setBoard(150);
    await page.waitForTimeout(400);
    const x2 = await labelX();
    check("모바일: 게시판 가로 스크롤 유지", moved >= 140, String(moved));
    check("모바일: 왼쪽 프로젝트 이름 열 고정", x1 != null && x2 != null && Math.abs(x1 - x2) <= 3, `${x1} vs ${x2}`);
    await page.evaluate(() => {
      const board = document.querySelector("[data-week-board-scroll]");
      board.scrollLeft = 0;
    });

    // 날짜 머리글 고정
    const y1 = (await page.locator("[data-week-header]").boundingBox()).y;
    await page.mouse.move(200, 700);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(700);
    const y2 = (await page.locator("[data-week-header]").boundingBox()).y;
    check("모바일: 세로 스크롤에도 날짜 머리글 고정", Math.abs(y2 - y1) < 2, `${y1} -> ${y2}`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== ${PREFIX || "RESULT"} =====`);
  console.log(`passed ${PASSES.length} · failed ${FAILS.length}`);
  for (const f of FAILS) console.log(" -", f);
  process.exit(FAILS.length ? 1 : 0);
})();
