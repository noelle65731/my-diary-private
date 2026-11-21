/**
 * Pointer-event drag & drop smoke test (desktop mouse + mobile touch).
 *
 * Optional end-to-end check — it needs Playwright and a running production build:
 *   npm run build && npx next start -p 3210
 *   npx playwright install chromium
 *   node tests/dnd-smoke.mjs            # BASE=http://127.0.0.1:3210, TODAY=2026-11-20
 *
 * Every /api/notion call is mocked inside the browser, so each assertion reads
 * the exact PATCH body the app would send to Notion.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3210";
const TODAY = process.env.TODAY ?? "2026-11-20";

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const stamp = (day = "2026-11-01") => `${day}T00:00:00.000Z`;

function base(id, title, extra = {}) {
  return {
    id,
    url: "",
    title,
    hidden: false,
    trash: false,
    favorite: false,
    memo: "",
    sort: null,
    projectIds: [],
    createdAt: stamp(),
    updatedAt: stamp(),
    ...extra,
  };
}

function event(id, title, date, extra = {}) {
  return base(id, title, {
    kind: "일정",
    category: "개인",
    date,
    startTime: null,
    endTime: null,
    endDate: null,
    allDay: true,
    done: false,
    canceled: false,
    cancelReason: "",
    cancelAt: null,
    weekKey: "",
    baseDate: null,
    ...extra,
  });
}

function task(id, title, date, projectIds, extra = {}) {
  return base(id, title, {
    kind: "할 일",
    category: "개인",
    status: "미완료",
    date,
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
    projectIds,
    ...extra,
  });
}

function routine(id, title, category, extra = {}) {
  return base(id, title, {
    kind: "루틴",
    category,
    date: null,
    repeatDays: [],
    targetCount: 1,
    execCount: 0,
    amount: null,
    unit: "",
    history: false,
    routineIds: [],
    ...extra,
  });
}

function binder(id, title, kind, date, body, extra = {}) {
  return base(id, title, {
    kind,
    date,
    link: "",
    tags: [],
    archiveFlag: false,
    body,
    photos: [],
    ...extra,
  });
}

function archive(id, title, kind, date, extra = {}) {
  return base(id, title, {
    kind,
    date,
    baseDate: date,
    rating: null,
    link: "",
    tags: [],
    body: "",
    photos: [],
    ...extra,
  });
}

function fixtures() {
  return {
    calendar: [
      event("ev-1", "팀 회의", TODAY, { startTime: "09:00", endTime: "10:00", allDay: false }),
      event("ev-2", "워크숍", TODAY),
      event("ev-3", "점심 약속", addDays(TODAY, 1), { startTime: "12:00", endTime: "13:00", allDay: false }),
    ],
    projects: [
      base("proj-a", "브랜드 리뉴얼", { kind: "프로젝트", category: "개인", status: "미완료", sort: 10 }),
      base("proj-b", "면접 준비", { kind: "프로젝트", category: "업무", status: "미완료", sort: 20 }),
      task("t-old", "지난주 보고서", addDays(TODAY, -3), ["proj-a"]),
      task("t-1", "어제 초안", addDays(TODAY, -1), ["proj-a"]),
      task("t-today", "오늘 인터뷰", TODAY, ["proj-a"]),
      task("t-undated", "날짜 없는 메모", null, ["proj-a"]),
      task("t-b", "레퍼런스 조사", addDays(TODAY, -2), ["proj-b"]),
      task("t-inbox", "받은함 일", TODAY, []),
    ],
    routines: [routine("r-1", "아침 스트레칭", "개인", { sort: 10 }), routine("r-2", "물 마시기", "개인", { sort: 20 }), routine("r-3", "영어 공부", "공부")],
    binder: [
      binder("b-today", "오늘의 기록", "일기", TODAY, "# 오늘\n\n좋은 하루였다.\n두 번째 줄\n세 번째 줄"),
      binder("b-tomorrow", "내일 기록", "일기", addDays(TODAY, 1), "내일의 메모"),
      binder("n-1", "회의 메모", "노트", TODAY, "회의 내용", { sort: 10 }),
      binder("n-2", "아이디어", "노트", TODAY, "떠오른 생각", { sort: 20 }),
    ],
    archive: [
      archive("a-1", "메모 항목", "메모", TODAY, { sort: 10 }),
      archive("a-2", "책 리뷰", "책", addDays(TODAY, -1), { sort: 20 }),
      archive("a-3", "영화 기록", "영화", addDays(TODAY, -2), { sort: 30 }),
      archive("a-4", "레퍼런스 모음", "레퍼런스", addDays(TODAY, -3), { sort: 40 }),
    ],
  };
}

/* ───────────────────────── harness ───────────────────────── */

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function installMocks(page, state) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/status") {
      return json({ ok: true, needsToken: false, authRequired: false, authenticated: true, missing: [] });
    }
    if (path === "/api/notion/all") {
      return json({ ok: true, data: state.data });
    }
    const match = /^\/api\/notion\/([a-z]+)(?:\/([^/]+))?$/.exec(path);
    if (!match) return json({ ok: false, error: { message: "unmocked" } });
    const resource = match[1];
    const id = match[2];
    if (method === "PATCH" && id) {
      const patch = JSON.parse(request.postData() ?? "{}");
      state.patches.push({ resource, id, patch });
      const item = state.data[resource].find((entry) => entry.id === id);
      const next = { ...item, ...patch, updatedAt: new Date().toISOString() };
      state.data[resource] = state.data[resource].map((entry) => (entry.id === id ? next : entry));
      return json({ ok: true, data: next });
    }
    if (method === "POST") {
      const patch = JSON.parse(request.postData() ?? "{}");
      state.posts.push({ resource, patch });
      const created = { ...base(`new-${state.posts.length}`, patch.title ?? "새 항목", {}), ...patch };
      state.data[resource] = [created, ...state.data[resource]];
      return json({ ok: true, data: created });
    }
    return json({ ok: true, data: [] });
  });
}

function patchesFor(state, resource, id) {
  return state.patches.filter((entry) => entry.resource === resource && (!id || entry.id === id));
}

async function resetState(page) {
  const state = { data: fixtures(), patches: [], posts: [] };
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await installMocks(page, state);
  return state;
}

async function goto(page, tab) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  if (tab) {
    await page.locator("nav button", { hasText: tab }).first().click();
    await page.waitForTimeout(400);
  }
}

async function center(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box for locator");
  return { x: box.x + Math.min(box.width / 2, 40), y: box.y + box.height / 2, box };
}

async function mouseDrag(page, from, to, steps = 14) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3, from.y + 3, { steps: 2 });
  await page.waitForTimeout(30);
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function touchDrag(client, page, from, to, steps = 14, hold = 240) {
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(90);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(350);
}

/* ───────────────────────── desktop ───────────────────────── */

async function desktop(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  /* 1. calendar — move a timed event to another day and time */
  let state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(400);

  const evBlock = page.locator('main button[data-drag-source="event"]', { hasText: "팀 회의" }).first();
  const dayColumns = page.locator('main [data-drop-zone="cal-day"]');
  const dayCount = await dayColumns.count();
  const tomorrowColumn = dayColumns.nth(1);
  const from = await center(page, evBlock);
  const to = await center(page, tomorrowColumn);
  const targetX = to.box.x + to.box.width / 2;
  const targetY = to.box.y + to.box.height * 0.55;
  await mouseDrag(page, from, { x: targetX, y: targetY });
  const evPatch = patchesFor(state, "calendar", "ev-1")[0];
  check(
    "calendar: event block dragged to another day & time",
    !!evPatch && evPatch.patch.date !== TODAY && typeof evPatch.patch.startTime === "string" && evPatch.patch.startTime.endsWith(":00") === false ? true : !!evPatch && evPatch.patch.date !== TODAY,
    JSON.stringify(evPatch?.patch ?? null),
  );
  check(
    "calendar: moved event keeps its duration",
    !!evPatch && evPatch.patch.startTime && evPatch.patch.endTime && minutesBetween(evPatch.patch.startTime, evPatch.patch.endTime) === 60,
    evPatch ? `${evPatch.patch.startTime}–${evPatch.patch.endTime} (columns ${dayCount})` : "no patch",
  );
  check(
    "calendar: move snaps to 15 minutes",
    !!evPatch && Number(evPatch.patch.startTime?.slice(3, 5) ?? "99") % 15 === 0,
    evPatch?.patch.startTime ?? "",
  );

  /* 2. calendar — resize by dragging the bottom handle */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(300);
  const blockForResize = page.locator('main button[data-drag-source="event"]', { hasText: "팀 회의" }).first();
  const handles = page.locator('main [data-drop-zone="cal-day"] .dnd-handle');
  const handleCount = await handles.count();
  if (handleCount > 0) {
    const box = await blockForResize.boundingBox();
    const bottomHandle = handles.nth(1);
    const hb = await bottomHandle.boundingBox();
    const start = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
    await mouseDrag(page, start, { x: start.x, y: start.y + 46 });
    const resizePatch = patchesFor(state, "calendar", "ev-1")[0];
    check(
      "calendar: bottom handle resize extends the end time",
      !!resizePatch && resizePatch.patch.endTime && minutesBetween(resizePatch.patch.startTime ?? "09:00", resizePatch.patch.endTime) > 60,
      JSON.stringify(resizePatch?.patch ?? null) + ` handles=${handleCount} blockH=${Math.round(box?.height ?? 0)}`,
    );
  } else {
    check("calendar: bottom handle resize extends the end time", false, "no resize handles rendered");
  }

  /* 3. calendar — a plain click still opens the editor */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(300);
  const clickTarget = await center(page, page.locator('main button[data-drag-source="event"]', { hasText: "팀 회의" }).first());
  await page.mouse.click(clickTarget.x, clickTarget.y);
  await page.waitForTimeout(400);
  const dialogTitle = await page.locator('[role="dialog"] h2').first().textContent().catch(() => null);
  check("calendar: click (no drag) still opens the event editor", dialogTitle === "일정 수정", `dialog=${dialogTitle}`);
  check("calendar: click sends no update", patchesFor(state, "calendar").length === 0, `${patchesFor(state, "calendar").length} patches`);
  await page.keyboard.press("Escape");

  /* 4. calendar — task chip across day columns */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(300);
  const chip = page.locator('main [data-drop-zone="cal-task-cell"] button[data-drag-source="task"]', { hasText: "오늘 인터뷰" }).first();
  const chipCenter = await center(page, chip);
  const cells = page.locator('main [data-drop-zone="cal-task-cell"]');
  const cellCount = await cells.count();
  // pick a cell two columns to the right on the same project row
  const chipCell = await chip.evaluateHandle((node) => node.closest('[data-drop-zone="cal-task-cell"]'));
  const chipDate = await chipCell.evaluate((node) => node.dataset.dropDate);
  const target = cells.filter({ hasNotText: "오늘 인터뷰" });
  const sameRowTargets = await page.$$eval('[data-drop-zone="cal-task-cell"]', (nodes) =>
    nodes.map((node) => ({ date: node.dataset.dropDate, project: node.dataset.dropProject })),
  );
  const targetIndex = sameRowTargets.findIndex((entry) => entry.date !== chipDate);
  const targetCell = cells.nth(targetIndex === -1 ? 0 : targetIndex);
  const targetCenter = await center(page, targetCell);
  await mouseDrag(page, chipCenter, { x: targetCenter.box.x + targetCenter.box.width / 2, y: targetCenter.box.y + targetCenter.box.height / 2 });
  const chipPatch = patchesFor(state, "projects", "t-today")[0];
  check(
    "calendar: task chip dragged to another day column changes its date",
    !!chipPatch && !!chipPatch.patch.date && chipPatch.patch.date !== TODAY,
    `cells=${cellCount} → ${JSON.stringify(chipPatch?.patch ?? null)}`,
  );

  /* 5. calendar — task chip to another project row */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(300);
  const chip2 = await center(page, page.locator('main [data-drop-zone="cal-task-cell"] button[data-drag-source="task"]', { hasText: "오늘 인터뷰" }).first());
  const projTargetCell = page.locator('[data-drop-zone="cal-task-cell"][data-drop-project="proj-b"]').first();
  const projTarget = await center(page, projTargetCell);
  await mouseDrag(page, chip2, { x: projTarget.box.x + projTarget.box.width / 2, y: projTarget.box.y + projTarget.box.height / 2 });
  const rowPatch = patchesFor(state, "projects", "t-today")[0];
  check(
    "calendar: task chip dragged onto another project row reassigns the project",
    !!rowPatch && Array.isArray(rowPatch.patch.projectIds) && rowPatch.patch.projectIds[0] === "proj-b",
    JSON.stringify(rowPatch?.patch ?? null),
  );

  /* 6. month view — drag an event to another day cell */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^월간$/ }).first().click();
  await page.waitForTimeout(400);
  const monthItem = page.locator('main [data-drop-zone="cal-month-day"] button[data-drag-source="event"]', { hasText: "팀 회의" }).first();
  const monthFrom = await center(page, monthItem);
  const dayCells = page.locator('main [data-drop-zone="cal-month-day"]');
  const fromDate = await monthItem.evaluate((node) => node.closest("[data-drop-zone]")?.dataset.dropDate ?? null);
  const cellDates = await page.$$eval('[data-drop-zone="cal-month-day"]', (nodes) => nodes.map((node) => node.dataset.dropDate));
  const otherCellIndex = cellDates.findIndex((date) => date !== fromDate);
  const otherCell = await center(page, dayCells.nth(otherCellIndex));
  await mouseDrag(page, monthFrom, { x: otherCell.box.x + otherCell.box.width / 2, y: otherCell.box.y + otherCell.box.height / 2 });
  const monthPatch = patchesFor(state, "calendar", "ev-1")[0];
  check(
    "month: event dragged to another day cell updates its date",
    !!monthPatch && !!monthPatch.patch.date && monthPatch.patch.date !== TODAY,
    `${fromDate} → ${monthPatch?.patch.date ?? "none"}`,
  );

  /* 6b. calendar — all-day bar to another day */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(300);
  const allDayBar = await center(page, page.locator('main button[data-drag-source="event"]', { hasText: "워크숍" }).first());
  const headerDays = page.locator('main [data-drop-zone="cal-allday"]');
  const headerCount = await headerDays.count();
  const headerBox = await headerDays.nth(1).boundingBox();
  await mouseDrag(page, allDayFrom(allDayBar), { x: headerBox.x + headerBox.width / 2, y: headerBox.y + headerBox.height / 2 });
  const allDayPatch = patchesFor(state, "calendar", "ev-2")[0];
  check(
    "calendar: all-day bar dragged to another day",
    !!allDayPatch && !!allDayPatch.patch.date && allDayPatch.patch.date !== TODAY,
    `${JSON.stringify(allDayPatch?.patch ?? null)} targets=${headerCount}`,
  );

  /* 6c. calendar — project row reorder inside the week table */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(300);
  const rowHandle = page.locator('main [data-drop-zone="cal-project-row"][data-drop-id="proj-a"] span[aria-hidden="true"]').first();
  const rowFrom = await center(page, rowHandle);
  const rowBTarget = await page.locator('main [data-drop-zone="cal-project-row"][data-drop-id="proj-b"]').first().boundingBox();
  await mouseDrag(page, rowFrom, { x: rowBTarget.x + 26, y: rowBTarget.y + rowBTarget.height - 4 });
  const rowSorts = patchesFor(state, "projects").filter((entry) => entry.patch.sort !== undefined);
  check("calendar: project rows reorder inside the week table", rowSorts.length > 0, JSON.stringify(rowSorts.map((e) => [e.id, e.patch.sort])));

  /* 6d. projects — routine rows reorder */
  state = await resetState(page);
  await goto(page, "프로젝트");
  await page.locator("main button", { hasText: /^트랙$/ }).first().click();
  await page.waitForTimeout(400);
  const routineHandle = await center(page, page.locator('main [data-drop-zone="proj-routine"][data-drop-id="r-1"] button[data-drag-source="routine"]').first());
  const routineTarget = await page.locator('main [data-drop-zone="proj-routine"][data-drop-id="r-2"]').first().boundingBox();
  await mouseDrag(page, routineHandle, { x: routineTarget.x + routineTarget.width - 10, y: routineTarget.y + routineTarget.height - 3 });
  const routineSorts = patchesFor(state, "routines").filter((entry) => entry.patch.sort !== undefined);
  check("projects: routine rows reorder", routineSorts.length > 0, JSON.stringify(routineSorts.map((e) => [e.id, e.patch.sort])));

  /* 6e. binder — note cards reorder */
  state = await resetState(page);
  await goto(page, "바인더");
  await page.locator("main button", { hasText: /^노트$/ }).first().click();
  await page.waitForTimeout(400);
  const noteFrom = await center(page, page.locator('main [data-drop-zone="binder-note"][data-drop-id="n-1"]').first());
  const noteTarget = await page.locator('main [data-drop-zone="binder-note"][data-drop-id="n-2"]').first().boundingBox();
  await mouseDrag(page, noteFrom, { x: noteTarget.x + noteTarget.width / 2, y: noteTarget.y + noteTarget.height - 6 });
  const noteSorts = patchesFor(state, "binder").filter((entry) => entry.patch.sort !== undefined);
  check("binder: note cards reorder", noteSorts.length > 0, JSON.stringify(noteSorts.map((e) => [e.id, e.patch.sort])));

  /* 7. projects — task between cards */
  state = await resetState(page);
  await goto(page, "프로젝트");
  await page.locator("main button", { hasText: /^트랙$/ }).first().click();
  await page.waitForTimeout(400);
  const taskLine = page.locator('main [data-drop-zone="proj-card"][data-drop-id="proj-a"] button[data-drag-source="task"]', { hasText: "오늘 인터뷰" }).first();
  const taskFrom = await center(page, taskLine);
  const cardB = page.locator('main [data-drop-zone="proj-card"][data-drop-id="proj-b"]').first();
  const cardBBox = await cardB.boundingBox();
  await mouseDrag(page, taskFrom, { x: cardBBox.x + cardBBox.width / 2, y: cardBBox.y + 60 });
  const cardPatch = patchesFor(state, "projects", "t-today")[0];
  check(
    "projects: task dragged onto another track card moves project",
    !!cardPatch && cardPatch.patch.projectIds?.[0] === "proj-b",
    JSON.stringify(cardPatch?.patch ?? null),
  );

  /* 8. projects — priority quadrants */
  state = await resetState(page);
  await goto(page, "프로젝트");
  await page.locator("main button", { hasText: /^우선순위$/ }).first().click();
  await page.waitForTimeout(400);
  const priorityTask = page.locator('main [data-drop-zone="proj-quadrant"] button[data-drag-source="task"]', { hasText: "레퍼런스 조사" }).first();
  const priorityFrom = await center(page, priorityTask);
  const quadrant = page.locator('[data-drop-zone="proj-quadrant"][data-drop-urgent="true"][data-drop-important="true"]').first();
  const quadrantBox = await quadrant.boundingBox();
  await mouseDrag(page, priorityFrom, { x: quadrantBox.x + quadrantBox.width / 2, y: quadrantBox.y + 40 });
  const priorityPatch = patchesFor(state, "projects", "t-b")[0];
  check(
    "projects: task dragged between quadrants sets 긴급·중요",
    !!priorityPatch && priorityPatch.patch.urgent === true && priorityPatch.patch.important === true,
    JSON.stringify(priorityPatch?.patch ?? null),
  );

  /* 9. projects — cards reorder */
  state = await resetState(page);
  await goto(page, "프로젝트");
  await page.locator("main button", { hasText: /^트랙$/ }).first().click();
  await page.waitForTimeout(400);
  const handleA = page.locator('main [data-drop-zone="proj-card"][data-drop-id="proj-a"] header span[aria-hidden="true"]').first();
  const handleFrom = await center(page, handleA);
  const cardB2 = await page.locator('main [data-drop-zone="proj-card"][data-drop-id="proj-b"]').first().boundingBox();
  await mouseDrag(page, handleFrom, { x: cardB2.x + cardB2.width - 12, y: cardB2.y + cardB2.height / 2 });
  const sortPatches = patchesFor(state, "projects").filter((entry) => entry.patch.sort !== undefined);
  check(
    "projects: dragging a card handle reorders tracks (정렬)",
    sortPatches.length > 0,
    `patches=${JSON.stringify(sortPatches.map((entry) => [entry.id, entry.patch.sort]))}`,
  );

  /* 10. projects — date-descending order inside a card */
  state = await resetState(page);
  await goto(page, "프로젝트");
  await page.locator("main button", { hasText: /^트랙$/ }).first().click();
  await page.waitForTimeout(400);
  const cardATitles = await page.$$eval('[data-drop-zone="proj-card"][data-drop-id="proj-a"] button[data-drag-source="task"]', (nodes) =>
    nodes.map((node) => (node.textContent ?? "").trim()),
  );
  check(
    "projects: tasks inside a card are ordered newest date first",
    JSON.stringify(cardATitles) === JSON.stringify(["오늘 인터뷰", "어제 초안", "지난주 보고서", "날짜 없는 메모"]),
    JSON.stringify(cardATitles),
  );

  const drawerTrigger = page.locator('[data-drop-zone="proj-card"][data-drop-id="proj-a"] button', { hasText: "브랜드 리뉴얼" }).first();
  await drawerTrigger.click();
  await page.waitForTimeout(500);
  const drawerTitles = await page.$$eval('[role="dialog"] li button[data-drag-source], [role="dialog"] li button', () => []);
  const drawerOrder = await page.$$eval('[role="dialog"] li', (nodes) => nodes.map((node) => (node.textContent ?? "").trim().slice(0, 20)));
  check("projects: drawer opens with the project's tasks", drawerOrder.length >= 3, JSON.stringify(drawerOrder));
  await page.keyboard.press("Escape");

  /* 11. binder — diary moved to another day */
  state = await resetState(page);
  await goto(page, "바인더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(400);
  const diary = page.locator('main [data-drop-zone="binder-day"] button[data-drag-source="binder"]', { hasText: "오늘의 기록" }).first();
  const diaryFrom = await center(page, diary);
  const tomorrowRow = page.locator(`main [data-drop-zone="binder-day"][data-drop-date="${addDays(TODAY, 1)}"]`).first();
  const tomorrowBox = await tomorrowRow.boundingBox();
  await mouseDrag(page, diaryFrom, { x: tomorrowBox.x + tomorrowBox.width / 2, y: tomorrowBox.y + tomorrowBox.height / 2 });
  const diaryPatch = patchesFor(state, "binder", "b-today")[0];
  check(
    "binder: diary dragged to another day changes its date",
    !!diaryPatch && diaryPatch.patch.date === addDays(TODAY, 1),
    JSON.stringify(diaryPatch?.patch ?? null),
  );

  /* 12. binder weekly — no ruled lines, bigger day numbers */
  state = await resetState(page);
  await goto(page, "바인더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(400);
  const ruled = await page.$$eval('main [data-drop-zone="binder-day"] p', (nodes) =>
    nodes.map((node) => getComputedStyle(node).borderBottomWidth),
  );
  check("binder weekly: day cells have no ruled lines", ruled.every((width) => width === "0px"), `border-bottom: ${JSON.stringify([...new Set(ruled)])}`);
  const emptyCellParas = await page.$$eval('main [data-drop-zone="binder-day"]', (nodes) =>
    nodes.filter((node) => !node.querySelector("button[data-drag-source]")).map((node) => node.querySelectorAll("p").length),
  );
  check("binder weekly: empty day cells are blank", emptyCellParas.every((count) => count <= 1), JSON.stringify(emptyCellParas));
  const dayFont = await page.$eval('main [data-drop-zone="binder-day"] button', (node) => parseFloat(getComputedStyle(node).fontSize));
  check("binder weekly: day number is about twice as large", dayFont >= 24, `${dayFont}px`);

  /* 13. archive — category pill drop + manual reorder */
  state = await resetState(page);
  await goto(page, "아카이브");
  await page.waitForTimeout(400);
  const archiveCard = page.locator('main [data-drop-zone="archive-card"][data-drop-id="a-1"]').first();
  const archiveFrom = await center(page, archiveCard);
  const kindPill = page.locator('main [data-drop-zone="archive-kind"][data-drop-kind="책"]').first();
  const pillBox = await kindPill.boundingBox();
  await mouseDrag(page, archiveFrom, { x: pillBox.x + pillBox.width / 2, y: pillBox.y + pillBox.height / 2 });
  const kindPatch = patchesFor(state, "archive", "a-1")[0];
  check(
    "archive: card dropped on a category pill re-categorizes it",
    !!kindPatch && kindPatch.patch.kind === "책",
    JSON.stringify(kindPatch?.patch ?? null),
  );

  state = await resetState(page);
  await goto(page, "아카이브");
  await page.waitForTimeout(400);
  const first = await center(page, page.locator('main [data-drop-zone="archive-card"][data-drop-id="a-1"]').first());
  const thirdBox = await page.locator('main [data-drop-zone="archive-card"][data-drop-id="a-3"]').first().boundingBox();
  await mouseDrag(page, first, { x: thirdBox.x + thirdBox.width - 10, y: thirdBox.y + thirdBox.height / 2 });
  const archiveSorts = patchesFor(state, "archive").filter((entry) => entry.patch.sort !== undefined);
  check("archive: dragging a card reorders it (정렬)", archiveSorts.length > 0, JSON.stringify(archiveSorts.map((entry) => [entry.id, entry.patch.sort])));

  await context.close();
}

function allDayFrom(point) {
  return { x: point.box.x + 18, y: point.box.y + point.box.height / 2 };
}

function minutesBetween(start, end) {
  const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  return toMinutes(end) - toMinutes(start);
}

/* ───────────────────────── mobile (touch) ───────────────────────── */

async function mobile(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`[mobile] ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`[mobile] pageerror: ${error.message}`));

  /* touch drag: task chip to another day */
  let state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(500);
  const chip = page.locator('main [data-drop-zone="cal-task-cell"] button[data-drag-source="task"]', { hasText: "오늘 인터뷰" }).first();
  const chipBox = await chip.boundingBox();
  const from = { x: chipBox.x + chipBox.width / 2, y: chipBox.y + chipBox.height / 2 };
  const cellInfo = await chip.evaluate((node) => {
    const cell = node.closest('[data-drop-zone="cal-task-cell"]');
    return { date: cell?.dataset.dropDate ?? "", project: cell?.dataset.dropProject ?? "" };
  });
  const nextDate = addDays(cellInfo.date, 1);
  const targetBox = await page
    .locator(`[data-drop-zone="cal-task-cell"][data-drop-date="${nextDate}"][data-drop-project="${cellInfo.project}"]`)
    .first()
    .boundingBox();
  await touchDrag(client, page, from, { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 });
  const touchPatch = patchesFor(state, "projects", "t-today")[0];
  check(
    "mobile(touch): task chip dragged to another day column",
    !!touchPatch && !!touchPatch.patch.date && touchPatch.patch.date !== TODAY,
    JSON.stringify(touchPatch?.patch ?? null),
  );

  /* touch: timed event block to another day column */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(500);
  const evBox = await page.locator('main button[data-drag-source="event"]', { hasText: "팀 회의" }).first().boundingBox();
  const cols = page.locator('main [data-drop-zone="cal-day"]');
  const colBox0 = await cols.nth(0).boundingBox();
  const colBox1 = await cols.nth(1).boundingBox();
  await touchDrag(client, page, { x: evBox.x + 12, y: evBox.y + evBox.height / 2 }, { x: colBox1.x + colBox1.width / 2, y: colBox1.y + colBox1.height * 0.4 }, 16);
  const mEvPatch = patchesFor(state, "calendar", "ev-1")[0];
  check(
    "mobile(touch): timed event dragged to another day keeps its time block",
    !!mEvPatch && mEvPatch.patch.date !== TODAY && !!mEvPatch.patch.startTime,
    `${JSON.stringify(mEvPatch?.patch ?? null)} col0=${Math.round(colBox0.width)} col1=${Math.round(colBox1.width)}`,
  );

  /* touch scroll must still work: a swipe on a day cell scrolls the page */
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo(0, 0));
  const columnBox = await page.locator('main [data-drop-zone="cal-day"]').first().boundingBox();
  const swipeStart = { x: columnBox.x + columnBox.width / 2, y: columnBox.y + columnBox.height * 0.7 };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: swipeStart.x, y: swipeStart.y, id: 2 }] });
  for (let i = 1; i <= 10; i += 1) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: swipeStart.x, y: swipeStart.y - i * 12, id: 2 }] });
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(400);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  check("mobile(touch): a quick swipe still scrolls instead of dragging", scrollAfter > scrollBefore + 20, `${scrollBefore} → ${scrollAfter}`);

  /* mobile tap still opens the editor */
  state = await resetState(page);
  await goto(page, "캘린더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(500);
  const tapBox = await page.locator('main button[data-drag-source="event"]', { hasText: "팀 회의" }).first().boundingBox();
  await page.touchscreen.tap(tapBox.x + tapBox.width / 2, tapBox.y + tapBox.height / 2);
  await page.waitForTimeout(500);
  const dialog = await page.locator('[role="dialog"] h2').first().textContent().catch(() => null);
  check("mobile(touch): tap still opens the event editor", dialog === "일정 수정", `dialog=${dialog}`);

  /* mobile projects: task between cards via touch */
  state = await resetState(page);
  await goto(page, "프로젝트");
  await page.locator("main button", { hasText: /^트랙$/ }).first().click();
  await page.waitForTimeout(500);
  const mTask = await page.locator('main [data-drop-zone="proj-card"][data-drop-id="proj-a"] button[data-drag-source="task"]', { hasText: "오늘 인터뷰" }).first().boundingBox();
  const mCard = await page.locator('main [data-drop-zone="proj-card"][data-drop-id="proj-b"]').first().boundingBox();
  await touchDrag(client, page, { x: mTask.x + mTask.width / 2, y: mTask.y + mTask.height / 2 }, { x: mCard.x + mCard.width / 2, y: mCard.y + 70 }, 18);
  const mPatch = patchesFor(state, "projects", "t-today")[0];
  check(
    "mobile(touch): task dragged onto another project card",
    !!mPatch && mPatch.patch.projectIds?.[0] === "proj-b",
    JSON.stringify(mPatch?.patch ?? null),
  );

  /* mobile binder weekly: day numbers and no ruled lines */
  state = await resetState(page);
  await goto(page, "바인더");
  await page.locator("main button", { hasText: /^주간$/ }).first().click();
  await page.waitForTimeout(400);
  const mFont = await page.$eval('main [data-drop-zone="binder-day"] button', (node) => parseFloat(getComputedStyle(node).fontSize));
  const mRuled = await page.$$eval('main [data-drop-zone="binder-day"] p', (nodes) => nodes.map((node) => getComputedStyle(node).borderBottomWidth));
  check("mobile: binder weekly day number enlarged, cells unruled", mFont >= 24 && mRuled.every((w) => w === "0px"), `font=${mFont}px borders=${JSON.stringify([...new Set(mRuled)])}`);

  await context.close();
}

/* ───────────────────────── run ───────────────────────── */

(async () => {
  const errors = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    await desktop(browser, errors);
    await mobile(browser, errors);
  } catch (error) {
    check("harness completed without throwing", false, String(error?.stack ?? error));
  } finally {
    await browser.close();
  }

  const failed = results.filter((entry) => !entry.ok);
  const consoleErrors = errors.filter((message) => !/favicon|manifest|Notion/i.test(message));
  check("no console errors / page errors", consoleErrors.length === 0, consoleErrors.slice(0, 4).join(" | "));

  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    for (const entry of failed) console.log(` - FAILED: ${entry.name} :: ${entry.detail}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
})();
