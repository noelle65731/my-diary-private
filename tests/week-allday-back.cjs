/**
 * A18 검증 — 종일 일정이 여러 개 있는 날에서 하나를 시간표로 뺐다가, 다시 그 날의
 * 종일 칸으로 끌어 놓으면 종일 일정으로 돌아오는지 (PC 마우스 · 모바일 터치).
 *
 *    node tests/week-allday-back.cjs        # BASE=http://127.0.0.1:3214
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

function fixture() {
  return {
    calendar: [
      // 종일 3개가 같은 날에 겹쳐 있는 날 — 한 개를 빼고 다시 넣는 경우
      event("ad-1", "제주도 여행", TODAY, { endDate: TODAY }),
      event("ad-2", "김장 재료 사기", TODAY),
      event("ad-3", "생일 선물", TODAY),
      event("ev-1", "주간 회의", "2026-11-16", { startTime: "09:30", endTime: "10:30", allDay: false }),
    ],
    projects: [],
    routines: [],
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

async function installMocks(page, state) {
  await page.route("**/api/**", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === "/api/status")
      return route.fulfill({ json: { ok: true, needsToken: false, authRequired: false, authenticated: true, dbs: {} } });
    if (path === "/api/notion/all") return route.fulfill({ json: { ok: true, data: state.data, errors: {} } });
    if (path.endsWith("/schema")) return route.fulfill({ json: { ok: true, data: [] } });
    if (path.endsWith("/blocks")) return route.fulfill({ json: { ok: true, data: { text: "", preserved: [] } } });
    const patchMatch = path.match(/^\/api\/notion\/([^/]+)\/([^/]+)$/);
    if (patchMatch && method === "PATCH") {
      const [, resource, id] = patchMatch;
      const body = request.postDataJSON() ?? {};
      state.patches.push({ resource, id, patch: body });
      const list = state.data[resource] ?? [];
      const current = list.find((item) => item.id === id);
      const merged = { ...current, ...body };
      if (merged.startTime) merged.allDay = false;
      else merged.allDay = true;
      state.data[resource] = list.map((item) => (item.id === id ? merged : item));
      return route.fulfill({ json: { ok: true, data: merged } });
    }
    return route.fulfill({ json: { ok: true, data: [] } });
  });
}

async function center(locator, ratio = 0.5) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box");
  return { x: box.x + box.width / 2, y: box.y + box.height * ratio, box };
}

async function mouseDrag(page, from, to, steps = 16) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 2 });
  await page.waitForTimeout(50);
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function touchDrag(client, page, from, to, steps = 16, hold = 260) {
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(18);
  }
  await page.waitForTimeout(120);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(700);
}

const shot = async (page, name) => {
  const path = `${OUT}/${PREFIX}${name}.png`;
  await page.screenshot({ path });
  console.log("shot", path);
};

const allDayIds = (page) => page.evaluate(() => [...document.querySelectorAll("[data-all-day-bar]")].map((n) => n.getAttribute("data-all-day-bar")));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || "/workspace/.tools/pw-browsers/chromium-1148/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  for (const mode of ["pc", "mobile"]) {
    const mobile = mode === "mobile";
    const state = { data: fixture(), patches: [] };
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      locale: "ko-KR", isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await installMocks(page, state);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1");
    await page.waitForTimeout(1600);
    await page.getByRole("button", { name: "주간", exact: true }).click();
    await page.waitForTimeout(1200);

    const before = await allDayIds(page);
    console.log(mode, "all-day before", JSON.stringify(before));
    check(`${mode}: 종일 3개가 한 줄에 보임`, before.length === 3, JSON.stringify(before));
    await shot(page, `${mode}-allday-3`);

    const client = await context.newCDPSession(page);
    const drag = (from, to) => (mobile ? touchDrag(client, page, from, to) : mouseDrag(page, from, to));

    // ① 종일 하나를 시간표(같은 날)로 뺀다
    const bar = page.locator('[data-all-day-bar="ad-1"]').first();
    const barBox = await center(bar);
    const column = page.locator('[data-drop-zone="timeline-day"][data-drop-day="' + TODAY + '"]').first();
    const columnBox = await column.boundingBox();
    // 시간표는 좁은 창 안에서만 보이므로, 창 안쪽(위에서 40px)에 놓습니다.
    const dropTime = { x: columnBox.x + columnBox.width / 2, y: columnBox.y + 40 };
    await drag({ x: barBox.x, y: barBox.y }, dropTime);
    await page.waitForTimeout(600);
    await shot(page, `${mode}-allday-taken-out`);

    const afterOut = await allDayIds(page);
    const timedBlock = await page.locator('[data-timeline-event="ad-1"]').count();
    console.log(mode, "after out", JSON.stringify(afterOut), "timed blocks", timedBlock);
    check(`${mode}: 시간표로 뺀 종일 일정이 종일 줄에서 빠짐`, !afterOut.includes("ad-1"), JSON.stringify(afterOut));
    check(`${mode}: 빼낸 일정이 시간표 칸에 생김`, timedBlock > 0, String(timedBlock));

    // ② 다시 같은 날의 종일 칸으로 되돌린다
    state.patches.length = 0;
    const timed = page.locator('[data-timeline-event="ad-1"]').first();
    const timedBox = await center(timed);
    const allDayCell = page.locator('[data-drop-zone="allday-day"][data-drop-day="' + TODAY + '"]').first();
    const cellBox = await allDayCell.boundingBox();
    await drag({ x: timedBox.x, y: timedBox.y }, { x: cellBox.x + cellBox.width / 2, y: cellBox.y + Math.min(cellBox.height - 2, 8) });
    await page.waitForTimeout(700);
    await shot(page, `${mode}-allday-back`);

    const afterBack = await allDayIds(page);
    const patches = state.patches.filter((entry) => entry.resource === "calendar" && entry.id === "ad-1");
    console.log(mode, "after back", JSON.stringify(afterBack), "patches", JSON.stringify(patches));
    check(`${mode}: 같은 날 종일 칸으로 되돌아옴`, afterBack.includes("ad-1"), JSON.stringify(afterBack));
    check(`${mode}: 종일 3개로 복귀`, afterBack.length === 3, JSON.stringify(afterBack));
    const backPatch = patches[patches.length - 1];
    check(
      `${mode}: 되돌릴 때 시간을 지워 종일로 저장`,
      !!backPatch && backPatch.patch.startTime === null && backPatch.patch.date === TODAY,
      JSON.stringify(backPatch?.patch ?? null),
    );

    // ③ 다른 날 종일 칸으로도 들어가는지
    state.patches.length = 0;
    const otherDay = "2026-11-22";
    // 모바일은 종일 한 줄만 보이므로, 지금 화면에 보이는 막대를 씁니다.
    const visibleBarId = await page.evaluate(() => {
      const node = [...document.querySelectorAll("[data-all-day-bar]")].find((n) => n.offsetParent !== null && getComputedStyle(n).display !== "none");
      return node ? node.getAttribute("data-all-day-bar") : null;
    });
    const bar2 = page.locator(`[data-all-day-bar="${visibleBarId}"]`).first();
    const bar2Box = await center(bar2);
    const otherCell = page.locator('[data-drop-zone="allday-day"][data-drop-day="' + otherDay + '"]').first();
    const otherBox = await otherCell.boundingBox();
    await drag({ x: bar2Box.x, y: bar2Box.y }, { x: otherBox.x + otherBox.width / 2, y: otherBox.y + Math.min(otherBox.height - 2, 8) });
    await page.waitForTimeout(600);
    const moved = state.patches.filter((entry) => entry.id === visibleBarId);
    check(
      `${mode}: 다른 날 종일 칸으로도 이동(기존 동작 유지)`,
      moved.length > 0 && moved[moved.length - 1].patch.date === otherDay,
      JSON.stringify(moved[moved.length - 1]?.patch ?? null),
    );
    await shot(page, `${mode}-allday-other-day`);

    await context.close();
  }

  await browser.close();
  console.log(`\n===== ${PREFIX || "RESULT"} =====`);
  console.log(`passed ${PASSES.length} · failed ${FAILS.length}`);
  for (const f of FAILS) console.log(" -", f);
  process.exit(FAILS.length ? 1 : 0);
})();
