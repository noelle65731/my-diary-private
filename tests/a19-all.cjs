/**
 * A19 검증 — 한 번에 다음을 확인합니다.
 *  1) 주간·3일 보기 프로젝트 이름(index 포함) 가운데 정렬
 *  2) 현재 시각 빨간 띠(2px #ef4444)가 오늘 열 위에 그려짐 (PC·폰, 기본/전체)
 *  3) 분류 색깔 설정: 캘린더 일정 블록·루틴 분류 배지에 반영 + 새로고침 유지
 *  4) 프로젝트 카드 '완료 보기' ON=완료한 할 일만 / OFF=남은 할 일 + 최근 기록(2개까지)
 *     + 설정한 남은 할 일 개수(3·8) 반영
 *  5) 트랙 → 진행 명칭
 *  6) 폰 주간 보기 프로젝트 칸 탭 → 그 날 할 일 시트
 *  7) PC 월간 빈 여백 클릭 → 하루 목록
 *
 *   node tests/a19-all.cjs        (BASE=http://127.0.0.1:3214)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/workspace/.tools/pw/node_modules/playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://127.0.0.1:3214";
const OUT = process.env.OUT || "/workspace/downloads/diary-a19";
fs.mkdirSync(OUT, { recursive: true });

const TODAY = "2026-11-21";
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
  targetCount: 1, execCount: 0, amount: 1, unit: "회", history: false, routineIds: [], ...extra,
});

function fixture() {
  const projects = [
    task("pj-1", "브랜드 포트폴리오", { kind: "프로젝트", category: "업무" }),
    task("pj-2", "집 정리", { kind: "프로젝트", category: "개인" }),
    task("pj-3", "영어 회화", { kind: "프로젝트", category: "공부" }),
  ];
  const tasks = [];
  // 브랜드 포트폴리오 — today 에 미완료 8개(설정 3·8 비교용) + 완료 3개
  for (let i = 1; i <= 8; i += 1) {
    tasks.push(task(`open-${i}`, `남은 업무 ${i}`, { category: "업무", date: TODAY, projectIds: ["pj-1"], sort: i * 10 }));
  }
  tasks.push(task("done-1", "완료한 업무 하나", { category: "업무", status: "완료", date: TODAY, doneAt: "2026-11-21", projectIds: ["pj-1"], sort: 100 }));
  tasks.push(task("done-2", "완료한 업무 둘", { category: "업무", status: "완료", date: "2026-11-20", doneAt: "2026-11-20", projectIds: ["pj-1"] }));
  tasks.push(task("done-3", "완료한 업무 셋", { category: "업무", status: "완료", date: "2026-11-19", doneAt: "2026-11-19", projectIds: ["pj-1"] }));
  // 집 정리 (개인) — 오늘 하나
  tasks.push(task("home-1", "옷장 정리", { category: "개인", date: TODAY, projectIds: ["pj-2"] }));
  // 영어 회화 (공부) — 오늘 둘
  tasks.push(task("eng-1", "단어 30개", { category: "공부", date: TODAY, projectIds: ["pj-3"] }));
  tasks.push(task("eng-2", "회화 녹음", { category: "공부", date: TODAY, projectIds: ["pj-3"] }));
  // index (분류 없음)
  tasks.push(task("inbox-1", "분류 안 한 할 일", { category: "개인", date: TODAY }));
  const calendar = [
    event("ev-1", "주간 회의", TODAY, { category: "업무", allDay: false, startTime: "14:00", endTime: "15:00" }),
    event("ev-2", "치과", "2026-11-18", { category: "개인", allDay: false, startTime: "10:00", endTime: "11:00" }),
    event("ev-3", "독서 모임", "2026-11-19", { category: "공부", allDay: false, startTime: "19:00", endTime: "21:00" }),
  ];
  const routines = [routine("rt-1", "물 마시기", { category: "개인", targetCount: 4 })];
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

const FAILS = [];
const PASSES = [];
const check = (name, ok, detail = "") => {
  if (ok) { PASSES.push(name); console.log("PASS ", name); }
  else { FAILS.push(`${name} ${detail}`.trim()); console.log("FAIL ", name, detail); }
};

const open = async (browser, width, height, data, mobile = false, storage = null) => {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: "ko-KR", deviceScaleFactor: 1,
    isMobile: mobile, hasTouch: mobile,
  });
  if (storage) await ctx.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
  }, storage);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await mockRoutes(page, data);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 40000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
};

/** 앱 상단 고정 크롬이 겹치는 버튼은 DOM 클릭으로 누릅니다(실제 화면에서는 보이는 버튼). */
const tapBtn = async (locator) => {
  await locator.waitFor({ state: "attached" });
  await locator.evaluate((el) => el.click());
};

const shot = async (page, name) => {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  console.log("shot", path);
  return path;
};

/** 프로젝트 라벨(색 점 포함)이 칸 안에서 가운데인지 px 로 잽니다. */
const LABEL_MEASURE = () => {
  const rows = [...document.querySelectorAll('[data-week-section="projects"] > div > div.grid')];
  return rows.map((row) => {
    const cell = row.firstElementChild;
    const button = cell?.querySelector("button[aria-label]");
    if (!cell || !button) return null;
    const c = cell.getBoundingClientRect();
    const t = button.getBoundingClientRect();
    const dot = cell.querySelector('[aria-hidden="true"]');
    const d = dot ? dot.getBoundingClientRect() : null;
    /* 색 점 + 이름 묶음의 가운데 — 점이 있으면 점의 왼쪽부터 잽니다. */
    const groupLeft = d ? d.left : t.left;
    const groupCenter = Math.round((groupLeft + t.right) / 2);
    return {
      label: button.getAttribute("aria-label"),
      cellCenter: Math.round(c.left + c.width / 2),
      cellMidY: Math.round(c.top + c.height / 2),
      textCenter: Math.round(t.left + t.width / 2),
      groupCenter,
      dot: !!d,
      delta: groupCenter - Math.round(c.left + c.width / 2),
      deltaY: Math.round(t.top + t.height / 2 - (c.top + c.height / 2)),
      textAlign: getComputedStyle(button).textAlign,
    };
  }).filter(Boolean);
};

const NOW_LINE = () => {
  const line = document.querySelector("[data-now-line]");
  if (!line) return null;
  const box = line.getBoundingClientRect();
  const style = getComputedStyle(line);
  return {
    x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height),
    color: style.backgroundColor, inView: box.top > 0 && box.top < window.innerHeight,
  };
};

const ONLY = process.argv.slice(2).map((n) => Number(n)).filter((n) => n > 0);
const want = (n) => ONLY.length === 0 || ONLY.includes(n);

(async () => {
  const data = fixture();
  const browser = await chromium.launch({
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  // ---------- 1) PC 주간: 라벨 가운데 정렬 + 현재 시각 띠 ----------
  if (want(1)) {
    const { ctx, page } = await open(browser, 1440, 900, data);
    await tapBtn(page.getByRole("button", { name: "주간", exact: true }));
    await page.waitForTimeout(1200);
    const labels = await page.evaluate(LABEL_MEASURE);
    console.log("PC-LABELS", JSON.stringify(labels));
    check("PC 주간: 프로젝트 행 라벨 4개(index 포함) 렌더", labels.length === 4, JSON.stringify(labels.map((l) => l.label)));
    check("PC 주간: 모든 라벨(점+이름)이 묶음째 가운데(±2px)", labels.every((l) => Math.abs(l.delta) <= 2), JSON.stringify(labels.map((l) => `${l.label}:${l.delta}`)));
    check("PC 주간: index 라벨도 가운데", labels.some((l) => l.label === "index" && Math.abs(l.delta) <= 2), JSON.stringify(labels.find((l) => l.label === "index")));
    check("PC 주간: 라벨 text-align center", labels.every((l) => l.textAlign === "center"), JSON.stringify(labels.map((l) => l.textAlign)));
    await shot(page, "week-project-center");

    const now = await page.evaluate(NOW_LINE);
    console.log("PC-NOW", JSON.stringify(now));
    check("PC 주간: 현재 시각 빨간 띠 있음", !!now, "없음");
    check("PC 주간: 띠 색 #ef4444", !!now && now.color === "rgb(239, 68, 68)", now && now.color);
    check("PC 주간: 띠 두께 2px", !!now && now.h === 2, now && String(now.h));
    check("PC 주간: 띠가 화면 안에 보임", !!now && now.inView, now && JSON.stringify({ y: now.y, h: now.h }));

    // 전체 모드에서도 같은 띠
    await tapBtn(page.getByRole("button", { name: "전체", exact: true }).first());
    await page.waitForTimeout(800);
    const nowFull = await page.evaluate(NOW_LINE);
    check("PC 주간 전체: 현재 시각 띠 유지", !!nowFull && nowFull.color === "rgb(239, 68, 68)", JSON.stringify(nowFull));
    await shot(page, "week-now-line-pc");

    // 3일 보기
    await tapBtn(page.getByRole("button", { name: "3일", exact: true }));
    await page.waitForTimeout(1000);
    const labels3 = await page.evaluate(LABEL_MEASURE);
    check("3일: 라벨(점+이름)이 묶음째 가운데(±2px)", labels3.length >= 3 && labels3.every((l) => Math.abs(l.delta) <= 2), JSON.stringify(labels3.map((l) => `${l.label}:${l.delta}`)));
    await shot(page, "three-project-center");
    await ctx.close();
  }

  // ---------- 2) 폰 주간: 라벨 가운데 + 현재 시각 띠 + 칸 탭 시트 ----------
  if (want(2)) {
    const { ctx, page } = await open(browser, 390, 844, data, true);
    await tapBtn(page.getByRole("button", { name: "주간", exact: true }));
    await page.waitForTimeout(1400);
    const labels = await page.evaluate(LABEL_MEASURE);
    console.log("MOBILE-LABELS", JSON.stringify(labels));
    check("폰 주간: 라벨(점+이름)이 묶음째 가운데(±2px)", labels.length > 0 && labels.every((l) => Math.abs(l.delta) <= 2), JSON.stringify(labels.map((l) => `${l.label}:${l.delta}`)));
    await shot(page, "week-project-center-mobile");

    const now = await page.evaluate(NOW_LINE);
    check("폰 주간: 현재 시각 빨간 띠 있음", !!now && now.color === "rgb(239, 68, 68)", JSON.stringify(now));
    check("폰 주간: 띠가 화면 안에 보임", !!now && now.inView && now.h === 2, JSON.stringify(now));
    await shot(page, "week-now-line-mobile");

    // 칸 탭 → 그 날 할 일 시트
    await page.locator('[data-week-project-cell="브랜드 포트폴리오:2026-11-21"]').click();
    await page.waitForTimeout(700);
    const sheet = page.locator("[data-week-cell-sheet]");
    const sheetVisible = await sheet.isVisible().catch(() => false);
    const sheetText = sheetVisible ? await sheet.innerText() : "";
    console.log("MOBILE-SHEET", JSON.stringify(sheetText.slice(0, 200)));
    check("폰 주간: 칸 탭 → 할 일 시트 열림", sheetVisible, "안 열림");
    check("폰 주간: 시트 제목이 프로젝트명 · 날짜", /브랜드 포트폴리오/.test(sheetText) && /11월 21일 \(토\)/.test(sheetText), sheetText.slice(0, 80));
    check("폰 주간: 시트에 그 날 할 일들이 보임", /남은 업무 1/.test(sheetText) && /남은 업무 8/.test(sheetText), sheetText.slice(0, 200));
    check("폰 주간: 시트에 + 할 일 추가", await page.locator("[data-week-cell-add]").isVisible().catch(() => false));
    await shot(page, "week-cell-sheet-mobile");

    // 시트에서 체크 토글
    const firstTask = page.locator("[data-week-cell-task]").first();
    const beforeCount = await page.locator('[data-week-cell-sheet] [aria-pressed="true"]').count();
    await firstTask.locator("button").first().click();
    await page.waitForTimeout(500);
    const afterCount = await page.locator('[data-week-cell-sheet] [aria-pressed="true"]').count();
    check("폰 주간: 시트에서 완료 체크가 바뀜", afterCount !== beforeCount, `${beforeCount} → ${afterCount}`);

    // + 할 일 추가 → 그 날짜로 새 할 일 편집기
    await page.locator("[data-week-cell-add]").click();
    await page.waitForTimeout(900);
    const editorText = await page.locator("body").innerText();
    check("폰 주간: + 할 일 추가로 새 할 일 편집기 열림", /할 일/.test(editorText) && !(await page.locator("[data-week-cell-sheet]").isVisible().catch(() => false)), "");
    await shot(page, "week-cell-new-task-mobile");
    await ctx.close();
  }

  // ---------- 3) 분류 색깔 + 프로젝트 카드/명칭 (PC) ----------
  if (want(3)) {
    const { ctx, page } = await open(browser, 1440, 1000, data);
    await tapBtn(page.getByRole("button", { name: "주간", exact: true }));
    await page.waitForTimeout(800);

    // 기준색: 업무(accent) 일정 블록 색
    const beforeTone = await page.evaluate(() => {
      const node = document.querySelector('[data-timeline-event="ev-1"]');
      return node ? getComputedStyle(node).backgroundColor : null;
    });
    console.log("BEFORE-TONE", beforeTone);

    // 설정 → 캘린더 → 분류 색깔 → 업무=보라
    await tapBtn(page.locator('button[aria-label="설정"]'));
    await page.waitForTimeout(600);
    await tapBtn(page.locator('[role="dialog"] button').filter({ hasText: /^캘린더$/ }).first());
    await page.waitForTimeout(400);
    const swatch = page.locator('[data-category-color="업무:purple"]');
    check("설정: 분류 색깔 팔레트 보임", await swatch.first().isVisible().catch(() => false));
    await shot(page, "settings-category-colors");
    await tapBtn(swatch.first());
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);

    const afterTone = await page.evaluate(() => {
      const node = document.querySelector('[data-timeline-event="ev-1"]');
      return node ? getComputedStyle(node).backgroundColor : null;
    });
    console.log("AFTER-TONE", afterTone);
    check("분류 색: 업무 일정 블록이 고른 보라색으로 바뀜", afterTone === "rgb(242, 238, 249)", String(afterTone));
    check("분류 색: 예전 기본색과 다름", afterTone !== beforeTone, `${beforeTone} → ${afterTone}`);

    const badge = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-week-section="routines"] button[title]')];
      const node = nodes.find((n) => (n.getAttribute("title") || "").includes("물 마시기"));
      const span = node?.querySelector("span");
      return span ? getComputedStyle(span).backgroundColor : null;
    });
    console.log("ROUTINE-BADGE", badge);
    await shot(page, "week-category-color");

    // 새로고침 후 유지
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1");
    await page.waitForTimeout(1500);
    await tapBtn(page.getByRole("button", { name: "주간", exact: true }));
    await page.waitForTimeout(900);
    const persisted = await page.evaluate(() => {
      const node = document.querySelector('[data-timeline-event="ev-1"]');
      return node ? getComputedStyle(node).backgroundColor : null;
    });
    check("분류 색: 새로고침해도 유지", persisted === "rgb(242, 238, 249)", String(persisted));

    // 개인 분류를 초록으로 → 루틴 배지 반영
    await tapBtn(page.locator('button[aria-label="설정"]'));
    await page.waitForTimeout(600);
    await tapBtn(page.locator('[role="dialog"] button').filter({ hasText: /^캘린더$/ }).first());
    await page.waitForTimeout(400);
    await tapBtn(page.locator('[data-category-color="개인:green"]').first());
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const badge2 = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-week-section="routines"] button[title]')];
      const node = nodes.find((n) => (n.getAttribute("title") || "").includes("물 마시기"));
      const span = node?.querySelector("span");
      return span ? getComputedStyle(span).backgroundColor : null;
    });
    console.log("ROUTINE-BADGE-GREEN", badge2);
    check("분류 색: 루틴 분류 배지가 고른 초록색", badge2 === "rgb(243, 248, 241)", String(badge2));
    await shot(page, "routine-category-color");

    // ---------- 프로젝트 탭: 명칭·완료 보기·최근 기록·개수 설정 ----------
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(1200);
    const headText = await page.locator("body").innerText();
    check("프로젝트: '진행 N · 남은 할 일 M' 문구", /진행 \d+ · 남은 할 일 \d+/.test(headText), headText.split("\n").slice(0, 6).join(" | "));
    check("프로젝트: '트랙' 문구가 사라짐", !/트랙/.test(headText), "본문에 트랙 남음");
    check("프로젝트: 보기 전환에 '진행'", await page.getByRole("button", { name: "진행", exact: true }).isVisible().catch(() => false));

    const card = page.locator('[data-project-card="pj-1"]');
    const cardText = await card.innerText();
    console.log("CARD-OFF", JSON.stringify(cardText));
    check("카드 기본: '남은 할 일 8'", /남은 할 일 8/.test(cardText), cardText.split("\n").slice(0, 4).join(" | "));
    check("카드 기본: '최근 기록' 늘 보임", /최근 기록/.test(cardText), cardText);
    const recentLines = await card.locator("ul").last().locator("li").count();
    check("카드 기본: 최근 기록은 최대 2개", recentLines <= 2, String(recentLines));
    const openRows = await card.locator("ul").first().locator("li").count();
    check("카드 기본: 기본 6개 보임(+더 보기 줄 포함)", openRows === 7, String(openRows));
    await shot(page, "projects-default-view");

    // 완료 보기 ON
    await page.getByRole("button", { name: /완료 보기/ }).click();
    await page.waitForTimeout(700);
    const cardDone = await card.innerText();
    console.log("CARD-ON", JSON.stringify(cardDone));
    check("완료 보기 ON: '완료한 할 일 3'", /완료한 할 일 3/.test(cardDone), cardDone.split("\n").slice(0, 4).join(" | "));
    check("완료 보기 ON: 완료한 할 일이 보임", /완료한 업무 셋/.test(cardDone), cardDone);
    check("완료 보기 ON: 남은 할 일은 숨김", !/남은 업무 1/.test(cardDone), cardDone);
    await shot(page, "projects-completed-view");

    // 다시 OFF
    await page.getByRole("button", { name: /완료 보기/ }).click();
    await page.waitForTimeout(600);

    // 설정: 남은 할 일 3개 → 8개
    await tapBtn(page.locator('button[aria-label="설정"]'));
    await page.waitForTimeout(500);
    await tapBtn(page.locator('[role="dialog"] button').filter({ hasText: /^프로젝트$/ }).first());
    await page.waitForTimeout(400);
    await shot(page, "settings-project-preview");
    await tapBtn(page.locator('[data-project-preview="true"]').getByRole("button", { name: "3", exact: true }));
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    const three = await card.locator("ul").first().locator("li").count();
    check("설정 3개: 카드에 남은 할 일 3개 + 더 보기", three === 4, String(three));
    await shot(page, "projects-preview-3");

    await tapBtn(page.locator('button[aria-label="설정"]'));
    await page.waitForTimeout(500);
    await tapBtn(page.locator('[role="dialog"] button').filter({ hasText: /^프로젝트$/ }).first());
    await page.waitForTimeout(400);
    await tapBtn(page.locator('[data-project-preview="true"]').getByRole("button", { name: "8", exact: true }));
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    const eight = await card.locator("ul").first().locator("li").count();
    check("설정 8개: 카드에 남은 할 일 8개", eight === 8, String(eight));
    await shot(page, "projects-preview-8");
    await ctx.close();
  }

  // ---------- 4) PC 월간: 빈 여백 클릭 → 하루 목록 ----------
  if (want(4)) {
    const { ctx, page } = await open(browser, 1440, 1000, data);
    await tapBtn(page.getByRole("button", { name: "월간", exact: true }));
    await page.waitForTimeout(1200);

    const blank = async (day, pos = "bottom") => {
      const cell = page.locator(`[data-month-cell="${day}"]`);
      const box = await cell.boundingBox();
      if (!box) return null;
      if (pos === "bottom") await page.mouse.click(box.x + box.width - 8, box.y + box.height - 6);
      else await page.mouse.click(box.x + box.width - 8, box.y + 26);
      await page.waitForTimeout(700);
      return box;
    };
    const dialog = page.locator('[role="dialog"]').filter({ hasText: "이 날짜 전체" });
    const closeDay = async () => {
      const close = dialog.locator('button[aria-label="닫기"]').first();
      if (await close.count()) await tapBtn(close);
      await page.waitForTimeout(400);
    };

    // 여러 개 있는 날 (11/21: 시간 일정 1 + 할 일 여러 개)
    await blank(TODAY);
    const manyOpen = await dialog.isVisible().catch(() => false);
    const manyText = manyOpen ? await dialog.innerText() : "";
    console.log("MONTH-MANY", JSON.stringify(manyText.slice(0, 200)));
    check("PC 월간: 여러 개 있는 날의 빈 여백 → 하루 목록", manyOpen, "안 열림");
    check("PC 월간: 하루 목록에 시간 일정과 할 일이 함께", /시간 일정/.test(manyText) && /할 일/.test(manyText), manyText.slice(0, 120));
    await shot(page, "month-daylist-pc");
    await closeDay();

    // 하나만 있는 날 (11/18: 치과 일정 하나)
    await blank("2026-11-18");
    const oneOpen = await dialog.isVisible().catch(() => false);
    const oneText = oneOpen ? await dialog.innerText() : "";
    console.log("MONTH-ONE", JSON.stringify(oneText.slice(0, 160)));
    check("PC 월간: 항목 1개인 날의 빈 여백도 열림", oneOpen && /치과/.test(oneText), oneText.slice(0, 80));
    await shot(page, "month-daylist-one");
    await closeDay();

    // 아무것도 없는 날 (11/25)
    await blank("2026-11-25");
    const emptyOpen = await dialog.isVisible().catch(() => false);
    check("PC 월간: 일정·할 일이 없는 날도 빈 여백으로 열림", emptyOpen, "안 열림");
    await shot(page, "month-daylist-empty");
    await closeDay();

    // 개별 칩 클릭은 그 항목 상세로
    await page.locator('[data-month-item="ev-3"]').click();
    await page.waitForTimeout(900);
    const stillDayList = await dialog.isVisible().catch(() => false);
    const detailText = await page.locator('[role="dialog"]').first().innerText().catch(() => "");
    check("PC 월간: 칩 클릭은 하루 목록이 아니라 그 항목 상세", !stillDayList, "하루 목록이 열림");
    check("PC 월간: 칩 클릭 → 일정 상세에 제목", /독서 모임/.test(detailText), detailText.slice(0, 80));
    await shot(page, "month-chip-detail");
    await ctx.close();
  }

  // ---------- 5) 월간 할 일 밑줄 = 프로젝트 색 ----------
  if (want(5)) {
    const { ctx, page } = await open(browser, 1440, 1000, data);
    await tapBtn(page.getByRole("button", { name: "월간", exact: true }));
    await page.waitForTimeout(1200);
    const read = () => page.evaluate(() => {
      const chip = document.querySelector('[data-project-underline="pj-1"]');
      const span = chip?.querySelector("span");
      return span ? { color: getComputedStyle(span).borderBottomColor, width: getComputedStyle(span).borderBottomWidth } : null;
    });
    const before = await read();
    console.log("MONTH-UNDERLINE", JSON.stringify(before));
    check("월간: 할 일에 프로젝트 색 밑줄", !!before && before.width === "2px", JSON.stringify(before));
    check("월간: 밑줄이 회색 기본값이 아님", !!before && before.color !== "rgb(229, 231, 235)", JSON.stringify(before));
    await shot(page, "month-task-underline");

    // 프로젝트 색 바꾸기 → 밑줄 색 연동
    await page.locator("nav button", { hasText: "프로젝트" }).first().click();
    await page.waitForTimeout(900);
    await tapBtn(page.locator('[data-project-card="pj-1"] button').first());
    await page.waitForTimeout(900);
    await tapBtn(page.locator('[data-project-color="sky"]').first());
    await page.waitForTimeout(600);
    await shot(page, "project-color-picker");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await tapBtn(page.locator("nav button", { hasText: "캘린더" }).first());
    await page.waitForTimeout(700);
    await tapBtn(page.getByRole("button", { name: "월간", exact: true }));
    await page.waitForTimeout(900);
    const after = await read();
    console.log("MONTH-UNDERLINE-2", JSON.stringify(after));
    check("월간: 프로젝트 색을 바꾸면 밑줄도 바뀜", !!after && after.color !== (before && before.color), `${before && before.color} → ${after && after.color}`);
    check("월간: 스카이(#86b7e4) 밑줄로 바뀜", !!after && after.color === "rgb(134, 183, 228)", JSON.stringify(after));
    await shot(page, "month-task-underline-project-color");
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${PASSES.length} passed, ${FAILS.length} failed`);
  if (FAILS.length) {
    console.log("FAILURES:");
    for (const f of FAILS) console.log(" -", f);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error("TEST-ERROR", error);
  process.exitCode = 2;
});
