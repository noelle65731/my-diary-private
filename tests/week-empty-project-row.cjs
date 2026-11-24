/**
 * A48 검증 — NOW가 꺼져 있을 때 이번 주(3일)에 할 일이 하나도 없는 프로젝트도
 * 주간·3일 보기의 프로젝트 목록에 빈 행으로 남는지, NOW를 켜면 예전처럼 사라지는지.
 *
 * 빈 행에서도 ① 프로젝트 이름 클릭 → 서랍 ② 요일 칸 클릭 → 그 날 목록 · 할 일 추가
 * ③ 끌어 놓기(할 일 → 빈 프로젝트 칸) ④ 행 순서 끌기가 그대로 동작하는지 함께 봅니다.
 *
 *    node tests/week-empty-project-row.cjs        # BASE=http://127.0.0.1:3219
 *
 * 환경변수: BASE, OUT, PREFIX, CHROME, PLAYWRIGHT_MODULE
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/workspace/.tools/pw/node_modules/playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://127.0.0.1:3219";
const OUT = process.env.OUT || "/workspace/downloads/diary-a48-empty-project";
const PREFIX = process.env.PREFIX || "";
fs.mkdirSync(OUT, { recursive: true });

/** 앱과 같은 날짜(한국 시간)로 고정합니다 — 픽스처의 '오늘'. */
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const NEXT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 86400000));

const stamp = () => `${TODAY}T00:00:00.000Z`;
const base = (id, title, extra = {}) => ({
  id, url: "", title, hidden: false, trash: false, favorite: false, memo: "", sort: null,
  projectIds: [], createdAt: stamp(), updatedAt: stamp(), ...extra,
});
const project = (id, title, category, extra = {}) => ({
  ...base(id, title),
  kind: "프로젝트", category, status: "진행",
  date: null, startTime: null, endTime: null, due: null, doneAt: null, checkedAt: null,
  urgent: false, important: false, history: false, waitFor: "", waitNote: "",
  cancelReason: "", cancelAt: null, repeatGroupId: "",
  ...extra,
});
const task = (id, title, category, projectIds, extra = {}) => ({
  ...base(id, title, { projectIds }),
  kind: "할 일", category, status: "미완료",
  date: TODAY, startTime: null, endTime: null, due: null, doneAt: null, checkedAt: null,
  urgent: false, important: false, history: false, waitFor: "", waitNote: "",
  cancelReason: "", cancelAt: null, repeatGroupId: "",
  ...extra,
});

/**
 * p-empty  — 할 일이 하나도 없는 새 프로젝트(이번 검증의 대상)
 * p-work   — 이번 주에 할 일이 있는 프로젝트
 * p-study  — 마감일이 이번 주인 할 일만 있는 프로젝트
 */
const EMPTY_TITLE = "새 프로젝트";
const WORK_TITLE = "브랜드 포트폴리오";
const STUDY_TITLE = "자격증 공부";

function fixture() {
  return {
    calendar: [],
    projects: [
      project("p-empty", EMPTY_TITLE, "개인", { createdAt: "2026-11-24T01:00:00.000Z" }),
      project("p-work", WORK_TITLE, "업무"),
      project("p-study", STUDY_TITLE, "공부"),
      task("t-work", "제안서 초안 마무리", "업무", ["p-work"]),
      task("t-study", "기출 1회 풀기", "공부", ["p-study"], { date: null, due: TODAY }),
    ],
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
    if (patchMatch && (method === "PATCH" || method === "POST")) {
      const [, resource, id] = patchMatch;
      const body = request.postDataJSON() ?? {};
      state.patches.push({ resource, id, patch: body });
      const list = state.data[resource] ?? [];
      const current = list.find((item) => item.id === id);
      const merged = { ...current, ...body };
      state.data[resource] = list.map((item) => (item.id === id ? merged : item));
      return route.fulfill({ json: { ok: true, data: merged } });
    }
    return route.fulfill({ json: { ok: true, data: [] } });
  });
}

async function mouseDrag(page, from, to, steps = 18) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 5, from.y + 3, { steps: 2 });
  await page.waitForTimeout(40);
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(450);
}

async function touchDrag(client, page, from, to, steps = 18, hold = 300) {
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(120);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(600);
}

async function center(locator, ratio = 0.5) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box");
  return { x: box.x + box.width / 2, y: box.y + box.height * ratio, box };
}

const rowKeys = (page) =>
  page.evaluate(() => [...document.querySelectorAll("[data-week-project-row]")].map((n) => n.getAttribute("data-week-project-row")));

const shot = async (page, name) => {
  const path = `${OUT}/${PREFIX}${name}.png`;
  await page.screenshot({ path });
  console.log("shot", path);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || "/workspace/.tools/pw-browsers/chromium-1148/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  for (const mode of ["pc", "mobile"]) {
    const mobile = mode === "mobile";
    const errors = [];
    const state = { data: fixture(), patches: [] };
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      locale: "ko-KR", isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    await installMocks(page, state);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1");
    await page.waitForTimeout(1500);

    const press = async (locator) => {
      if (mobile) await locator.tap();
      else await locator.click();
    };
    const drag = async (from, to) => {
      if (mobile) {
        const client = await context.newCDPSession(page);
        await touchDrag(client, page, from, to);
      } else {
        await mouseDrag(page, from, to);
      }
    };

    // 주간 보기 + `할 일` 토글이 켜진 상태(프로젝트 행이 보이는 기본 화면)
    await press(page.getByRole("button", { name: "주간", exact: true }));
    await page.waitForTimeout(900);
    const tasksToggle = page.locator('button[aria-label="할 일 보기"]');
    if (await tasksToggle.count()) {
      await press(tasksToggle.first());
      await page.waitForTimeout(700);
    }

    // ① NOW OFF — 할 일 0개 프로젝트가 빈 행으로 보인다
    const rowsOff = await rowKeys(page);
    console.log(mode, "rows (NOW off, week)", JSON.stringify(rowsOff));
    check(`${mode}: 주간 · NOW OFF에서 할 일 0개 프로젝트 행이 보임`, rowsOff.includes("p-empty"), JSON.stringify(rowsOff));
    check(`${mode}: 주간 · NOW OFF에서 할 일 있는 프로젝트 행도 그대로`, rowsOff.includes("p-work") && rowsOff.includes("p-study"), JSON.stringify(rowsOff));

    const emptyRow = page.locator('[data-week-project-row="p-empty"]').first();
    check(`${mode}: 빈 행이 화면에 보임`, await emptyRow.isVisible());
    const emptyRowTaskCount = await emptyRow.locator("[data-week-task]").count();
    check(`${mode}: 빈 행에는 할 일이 없음`, emptyRowTaskCount === 0, String(emptyRowTaskCount));
    const cells = await page.locator('[data-drop-project="p-empty"][data-drop-zone="week-task-day"]').count();
    check(`${mode}: 빈 행의 요일 칸 7개가 모두 끌어 놓기 자리`, cells === 7, String(cells));
    const grip = page.locator('[data-week-row-grip="p-empty"]');
    check(`${mode}: 빈 행에도 순서 손잡이(끌기)가 있음`, (await grip.count()) === 1);
    const addBtn = page.locator('[data-week-project-row="p-empty"] button[aria-label="할 일 추가"]');
    check(`${mode}: 빈 행 이름 옆에 할 일 추가 버튼이 있음(PC)`, mobile ? true : (await addBtn.count()) === 1);
    const noRowsMsg = await page.getByText("이번 주에 예정된 할 일이 없습니다.").count();
    check(`${mode}: 빈 행이 있으니 '할 일 없음' 안내는 뜨지 않음`, noRowsMsg === 0, String(noRowsMsg));
    await shot(page, `${mode}-week-nowoff`);

    // ② 이름 클릭 → 프로젝트 서랍
    await press(page.locator('[data-week-project-row="p-empty"] button[aria-label="' + EMPTY_TITLE + '"]').first());
    await page.waitForTimeout(700);
    const drawer = page.locator('[data-drawer-root] [role="dialog"]').first();
    const drawerOpen = (await drawer.count()) === 1 && (await drawer.isVisible());
    const drawerText = drawerOpen ? await drawer.innerText() : "";
    check(`${mode}: 빈 행 이름을 누르면 프로젝트 서랍이 열림`, drawerOpen && drawerText.includes(EMPTY_TITLE), drawerText.slice(0, 60));
    await shot(page, `${mode}-week-drawer`);
    if (drawerOpen) {
      await press(drawer.locator('button[aria-label="닫기"]').first());
      await page.waitForTimeout(600);
    }

    // ③ 요일 칸 클릭 → 그 날 목록 → 할 일 추가(프로젝트·날짜 유지)
    await press(page.locator('[data-week-project-cell="' + EMPTY_TITLE + ':' + TODAY + '"]').first());
    await page.waitForTimeout(600);
    const sheet = page.locator("[data-week-cell-sheet]");
    const sheetOpen = (await sheet.count()) === 1;
    check(`${mode}: 빈 행의 요일 칸을 누르면 그 날 목록이 열림`, sheetOpen);
    if (sheetOpen) {
      const sheetText = await sheet.locator('[role="dialog"]').innerText();
      check(`${mode}: 목록 제목에 프로젝트 이름이 나옴`, sheetText.includes(EMPTY_TITLE), sheetText.slice(0, 60));
      await shot(page, `${mode}-week-sheet`);
      await press(sheet.locator('[data-week-cell-add="true"]'));
      await page.waitForTimeout(800);
      const editor = page.locator('[role="dialog"][aria-label="새 할 일"]');
      const editorOpen = (await editor.count()) === 1;
      check(`${mode}: 목록에서 '할 일 추가'를 누르면 새 할 일 창이 열림`, editorOpen);
      if (editorOpen) {
        const dateValue = await editor.locator('input[aria-label="날짜"]').first().inputValue();
        check(`${mode}: 새 할 일 날짜가 누른 칸의 날짜로 채워짐`, dateValue === TODAY, dateValue);
      }
      if (editorOpen) {
        await press(editor.getByRole("button", { name: "닫기", exact: true }).first());
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(700);
      check(`${mode}: 새 할 일 창을 닫고 게시판으로 돌아옴`, (await page.locator('[role="dialog"][aria-label="새 할 일"]').count()) === 0);
    }

    // ④ 행 순서 끌기 — 빈 행을 첫 행 위로
    const orderBefore = await page.evaluate(() => {
      try { return JSON.parse(window.localStorage.getItem("my-diary:week-row-order:v1") || "{}"); } catch { return {}; }
    });
    const gripBox = await center(grip.first());
    const targetBox = await center(page.locator('[data-week-project-row="p-work"]').first(), 0.25);
    await drag({ x: gripBox.x, y: gripBox.y }, { x: targetBox.x, y: targetBox.y });
    await page.waitForTimeout(600);
    const orderAfter = await page.evaluate(() => {
      try { return JSON.parse(window.localStorage.getItem("my-diary:week-row-order:v1") || "{}"); } catch { return {}; }
    });
    const rowsAfterDrag = await rowKeys(page);
    console.log(mode, "order", JSON.stringify(orderBefore), "->", JSON.stringify(orderAfter), "rows", JSON.stringify(rowsAfterDrag));
    check(
      `${mode}: 빈 행도 끌어서 순서를 바꿀 수 있음`,
      Array.isArray(orderAfter.projects) && orderAfter.projects.includes("p-empty") && rowsAfterDrag[0] === "p-empty",
      JSON.stringify({ orderAfter, rowsAfterDrag }),
    );
    await shot(page, `${mode}-week-roworder`);

    // ⑤ 3일 보기 — NOW OFF에서도 빈 행이 보인다
    await press(page.getByRole("button", { name: "3일", exact: true }));
    await page.waitForTimeout(900);
    const rowsThreeOff = await rowKeys(page);
    console.log(mode, "rows (NOW off, three)", JSON.stringify(rowsThreeOff));
    check(`${mode}: 3일 · NOW OFF에서도 빈 프로젝트 행이 보임`, rowsThreeOff.includes("p-empty"), JSON.stringify(rowsThreeOff));
    await shot(page, `${mode}-three-nowoff`);

    // ⑥ NOW ON — 빈 행은 사라지고, 이번 창에 할 일이 있는 행만 남는다
    await press(page.locator('[data-calendar-now="true"]'));
    await page.waitForTimeout(900);
    const rowsThreeOn = await rowKeys(page);
    console.log(mode, "rows (NOW on, three)", JSON.stringify(rowsThreeOn));
    check(`${mode}: 3일 · NOW ON이면 빈 프로젝트 행이 사라짐`, !rowsThreeOn.includes("p-empty"), JSON.stringify(rowsThreeOn));
    check(`${mode}: 3일 · NOW ON에서도 할 일 있는 행은 남음`, rowsThreeOn.includes("p-work"), JSON.stringify(rowsThreeOn));
    await shot(page, `${mode}-three-nowon`);

    await press(page.getByRole("button", { name: "주간", exact: true }));
    await page.waitForTimeout(800);
    const rowsWeekOn = await rowKeys(page);
    console.log(mode, "rows (NOW on, week)", JSON.stringify(rowsWeekOn));
    check(`${mode}: 주간 · NOW ON이면 빈 프로젝트 행이 사라짐`, !rowsWeekOn.includes("p-empty"), JSON.stringify(rowsWeekOn));
    await shot(page, `${mode}-week-nowon`);

    // ⑦ NOW를 다시 끄고, 3일 보기에서 할 일을 빈 프로젝트 칸으로 끌어 놓기
    await press(page.locator('[data-calendar-now="true"]'));
    await page.waitForTimeout(800);
    await press(page.getByRole("button", { name: "3일", exact: true }));
    await page.waitForTimeout(900);
    const rowsThreeBack = await rowKeys(page);
    check(`${mode}: NOW를 다시 끄면 빈 행이 돌아옴`, rowsThreeBack.includes("p-empty"), JSON.stringify(rowsThreeBack));

    state.patches.length = 0;
    const taskNode = page.locator('[data-week-task="t-work"]').first();
    const taskBox = await center(taskNode);
    const emptyCell = page.locator('[data-drop-project="p-empty"][data-drop-zone="week-task-day"][data-drop-day="' + TODAY + '"]').first();
    const emptyCellBox = await center(emptyCell, 0.5);
    await drag({ x: taskBox.x, y: taskBox.y }, { x: emptyCellBox.x, y: emptyCellBox.y });
    await page.waitForTimeout(700);
    const moves = state.patches.filter((entry) => entry.resource === "projects" && entry.id === "t-work");
    const lastMove = moves[moves.length - 1];
    console.log(mode, "task drop patches", JSON.stringify(moves));
    check(
      `${mode}: 빈 행 칸에 할 일을 놓으면 그 프로젝트로 옮겨짐`,
      !!lastMove && Array.isArray(lastMove.patch.projectIds) && lastMove.patch.projectIds.includes("p-empty"),
      JSON.stringify(lastMove?.patch ?? null),
    );
    await shot(page, `${mode}-three-drop`);

    const consoleErrors = errors.filter((text) => !/favicon|Failed to load resource: the server responded with a status of 404/i.test(text));
    check(`${mode}: 콘솔 에러 0건`, consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 4)));

    await context.close();
  }

  await browser.close();
  console.log(`\n===== ${PREFIX || "RESULT"} =====`);
  console.log(`passed ${PASSES.length} · failed ${FAILS.length}`);
  for (const f of FAILS) console.log(" -", f);
  process.exit(FAILS.length ? 1 : 0);
})();
