/* A16 checks — run with:
 *   NEXT_DIST_DIR=.next-v17 node node_modules/next/dist/bin/next start -p 3220 &
 *   NODE_PATH=/workspace/.tools/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/workspace/.tools/pw-browsers \
 *     node tests/sync-check.cjs
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://127.0.0.1:3220";
const OUT = process.env.OUT || "/workspace/work/diary-shots-a16";
fs.mkdirSync(OUT, { recursive: true });

const TODAY = "2026-11-21";
const WEEK_KEY = "2026-W47";
const WEEK_START = "2026-11-16";

const PASSES = [];
const FAILS = [];
function check(name, ok, detail = "") {
  if (ok) { PASSES.push(name); console.log("PASS  " + name); }
  else { FAILS.push(name + " " + detail); console.log("FAIL  " + name + " " + detail); }
}
const stamp = (d = "2026-11-01") => `${d}T00:00:00.000Z`;
function base(id, title, extra = {}) {
  return Object.assign({ id, url: "", title, hidden: false, trash: false, favorite: false, memo: "", sort: null, projectIds: [], createdAt: stamp(), updatedAt: stamp() }, extra);
}
function event(id, title, date, extra = {}) {
  return Object.assign(base(id, title), { kind: "일정", category: "개인", date, startTime: null, endDate: null, endTime: null, allDay: true, done: false, canceled: false, cancelReason: "", cancelAt: null, weekKey: "", baseDate: null }, extra);
}
function task(id, title, extra = {}) {
  return Object.assign(base(id, title), { kind: "할 일", category: "개인", status: "미완료", date: null, due: null, doneAt: null, checkedAt: null, urgent: false, important: false, history: false, waitFor: "", waitNote: "", cancelReason: "", cancelAt: null, repeatGroupId: "" }, extra);
}
function routine(id, title, category, extra = {}) {
  return Object.assign(task(id, title, { kind: "루틴", category, date: null, targetCount: 1, execCount: 0, repeatDays: ["월", "화", "수", "목", "금", "토", "일"], amount: null, unit: "회", routineIds: [], history: false }), extra);
}

function fixture() {
  return {
    calendar: [
      event("ev-1", "도서관 반납", TODAY),
      event("ev-2", "치과 예약", TODAY, { startTime: "14:00", endTime: "15:00", allDay: false }),
      event("ad-1", "아침 산책", TODAY, { sort: 10 }),
      event("ad-2", "장보기", TODAY, { sort: 20 }),
      event("ad-3", "저녁 약속", TODAY, { sort: 30 }),
      event("ev-3", "이번 주 목표: 포트폴리오 2장", WEEK_START, { kind: "주간 목표", weekKey: WEEK_KEY, baseDate: WEEK_START }),
      event("ev-4", "주간 메모", WEEK_START, { kind: "주간 메모", weekKey: WEEK_KEY, baseDate: WEEK_START, memo: "메모" }),
    ],
    projects: [
      task("pj-1", "브랜드 포트폴리오", { kind: "프로젝트", category: "업무", date: "2026-11-10" }),
      task("pj-2", "집 정리", { kind: "프로젝트", category: "개인", date: "2026-11-01" }),
      task("pj-3", "가을 캠페인", { kind: "프로젝트", category: "마케팅", date: "2026-11-05" }),
      task("tk-1", "사례 1 정리", { category: "업무", date: "2026-11-18", projectIds: ["pj-1"] }),
      task("tk-2", "약국 들르기", { category: "개인", date: TODAY }),
      task("pj-4", "now 실험", { kind: "프로젝트", category: "now", date: "2026-11-04" }),
      task("tk-3", "now 할 일", { category: "now", date: TODAY }),
    ],
    routines: [
      routine("rt-1", "물 마시기", "개인"),
      routine("rt-2", "영어 단어", "공부"),
      routine("rt-3", "메일 정리", "업무"),
      routine("rt-4", "지원서 체크", "마케팅"),
    ],
    binder: [base("bd-1", "11월 18일 수요일 바인더", { kind: "일기", date: "2026-11-18", link: "", tags: [], archiveFlag: false, body: "수요일 기록 본문입니다.", photos: [] })],
    archive: [],
  };
}

function makeMock(data) {
  const mock = { data, calls: [], seq: 0 };
  mock.item = (res, id) => data[res].find((it) => it.id === id);
  mock.handle = async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === "/api/status") {
      const dbs = {};
      for (const k of Object.keys(data)) dbs[k] = { label: k, envKey: `NOTION_${k.toUpperCase()}_DB_ID`, configured: true, ok: true, message: "연결됨" };
      return route.fulfill({ json: { ok: true, needsToken: false, authRequired: false, authenticated: true, dbs } });
    }
    if (path === "/api/notion/all") return route.fulfill({ json: { ok: true, data, errors: {} } });
    const resMatch = path.match(/^\/api\/notion\/(calendar|projects|routines|binder|archive)/);
    const resource = resMatch ? resMatch[1] : null;
    if (resource && path.endsWith("/schema")) return route.fulfill({ json: { ok: true, data: [] } });
    if (resource && path.endsWith("/blocks")) return route.fulfill({ json: { ok: true, data: { text: "", preserved: [] } } });
    if (path === "/api/upload") return route.fulfill({ json: { ok: true, data: { token: "upload:up-1", id: "up-1", name: "photo.jpg" } } });
    if (resource && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      mock.calls.push({ method: "POST", resource, body });
      mock.seq += 1;
      const created = Object.assign(base(`new-${mock.seq}`, body.title || "새 항목"), body, { id: `new-${mock.seq}`, createdAt: stamp(TODAY), updatedAt: stamp(TODAY) });
      data[resource].push(created);
      return route.fulfill({ json: { ok: true, data: created } });
    }
    const one = path.match(/^\/api\/notion\/(calendar|projects|routines|binder|archive)\/([^/]+)$/);
    if (one && method === "PATCH") {
      const body = JSON.parse(request.postData() || "{}");
      mock.calls.push({ method: "PATCH", resource: one[1], id: one[2], body });
      const current = mock.item(one[1], one[2]);
      if (current) Object.assign(current, body);
      return route.fulfill({ json: { ok: true, data: current || {} } });
    }
    if (one && method === "DELETE") return route.fulfill({ json: { ok: true, deleted: true } });
    return route.fulfill({ json: { ok: true, data: null } });
  };
  return mock;
}

async function openPage(browser, width, height, mock, mobile = false) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "ko-KR", isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.setDefaultTimeout(9000);
  await page.route("**/api/**", (route, request) => mock.handle(route, request));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 25000 });
  await page.waitForTimeout(1000);
  return { ctx, page };
}
async function gotoTab(page, name) {
  await page.getByRole("button", { name: new RegExp(name) }).last().click();
  await page.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  /* ── PC: 주간 보기 세 영역 ── */
  const mock = makeMock(fixture());
  const { page } = await openPage(browser, 1440, 950, mock);
  await page.screenshot({ path: `${OUT}/pc-week.png` });

  const sections = page.locator("section.rounded-xl");
  check("주간 보기 영역 박스 3개", (await sections.count()) === 3, String(await sections.count()));
  for (let i = 0; i < 3; i += 1) {
    const label = ["일정", "프로젝트", "루틴"][i];
    const sec = sections.nth(i);
    const style = await sec.evaluate((el) => { const s = getComputedStyle(el); return { r: s.borderTopLeftRadius, w: s.borderTopWidth }; });
    check(`${label} 영역 둥근 테두리`, style.r !== "0px" && style.w !== "0px", JSON.stringify(style));
    check(`${label} 영역 헤더 포함`, (await sec.innerText()).includes(label));
  }

  async function labelX(text) {
    const box = await page.locator("section.rounded-xl span", { hasText: new RegExp(`^${text}`) }).first().boundingBox();
    return box ? box.x : null;
  }
  const xs = {};
  for (const t of ["일정", "프로젝트", "루틴"]) xs[t] = await labelX(t);
  const xvals = Object.values(xs);
  check("펼친 상태 헤더 왼쪽 정렬", xvals.every((v) => v !== null) && Math.max(...xvals) - Math.min(...xvals) < 1, JSON.stringify(xs));

  const routineSection = sections.nth(2);
  const routineText = await routineSection.innerText();
  for (const [title, cat] of [["물 마시기", "개인"], ["영어 단어", "공부"], ["메일 정리", "업무"], ["지원서 체크", "마케팅"]]) {
    const row = routineSection.locator("div.grid", { hasText: title }).first();
    const text = (await row.innerText()).trim();
    check(`루틴 '${title}' 행에 ${cat} 배지`, text.startsWith(cat), text.slice(0, 40));
  }
  check("+ 루틴 버튼 하나", (await page.getByRole("button", { name: "+ 루틴", exact: true }).count()) === 1);

  const more = page.locator("[data-allday-more='2026-11-21']");
  check("토요일 종일 +N 버튼", (await more.count()) === 1, String(await more.count()));
  if (await more.count()) {
    const sat = await page.locator("[data-week-header='true'] button").nth(5).boundingBox();
    const box = await more.first().boundingBox();
    check("+N 이 토요일 열 안", !!sat && !!box && Math.abs(box.x + box.width / 2 - (sat.x + sat.width / 2)) < 5, JSON.stringify({ sat, box }));
    await page.screenshot({ path: `${OUT}/pc-week-allday.png` });
    await more.first().click();
    await page.waitForTimeout(350);
    const hidden = page.locator("[data-all-day-bar='ad-3']");
    check("+N 누르면 숨은 종일 일정 펼쳐짐", (await hidden.count()) === 1 && (await hidden.first().isVisible()));
    await page.screenshot({ path: `${OUT}/pc-week-allday-open.png` });
  }

  for (const name of ["일정 영역", "프로젝트 영역", "루틴 영역"]) {
    const btn = page.getByRole("button", { name: new RegExp(`${name} (펴기|접기)`) }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(250); }
  }
  const collapsed = [];
  for (const t of ["일정", "프로젝트", "루틴"]) collapsed.push(await labelX(t));
  check("접은 상태 헤더 왼쪽 정렬", collapsed.every((v) => v !== null) && Math.max(...collapsed) - Math.min(...collapsed) < 1, JSON.stringify(collapsed));
  await page.screenshot({ path: `${OUT}/pc-week-collapsed.png` });
  for (const name of ["일정 영역", "프로젝트 영역", "루틴 영역"]) {
    const btn = page.getByRole("button", { name: new RegExp(`${name} (펴기|접기)`) }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(200); }
  }

  /* ── 루틴 편집: 분류 목록 + 새 분류 동기화 ── */
  await routineSection.getByRole("button", { name: /물 마시기/ }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.waitFor();
  for (const cat of ["업무", "개인", "공부", "마케팅"]) {
    check(`루틴 편집기에 '${cat}' 선택지`, (await dialog.getByRole("button", { name: cat, exact: true }).count()) === 1);
  }
  await page.screenshot({ path: `${OUT}/pc-routine-editor.png` });
  await dialog.getByRole("button", { name: "분류 새로 추가" }).click();
  const field = dialog.getByRole("textbox", { name: "새 분류 이름" });
  await field.fill("운동");
  await field.press("Enter");
  await page.waitForTimeout(350);
  check("루틴에서 만든 분류가 그 창에 생김", (await dialog.getByRole("button", { name: "운동", exact: true }).count()) === 1);
  await dialog.getByRole("button", { name: "닫기" }).last().click();
  await page.waitForTimeout(600);
  check("상단 분류 필터에도 '운동'", (await page.getByRole("button", { name: "운동", exact: true }).count()) >= 1, String(await page.getByRole("button", { name: "운동", exact: true }).count()));
  await page.screenshot({ path: `${OUT}/pc-week-new-category.png` });

  await gotoTab(page, "프로젝트");
  await page.getByRole("button", { name: "+ new", exact: true }).first().click();
  let ed = page.getByRole("dialog");
  await ed.waitFor();
  await ed.getByRole("button", { name: "분류 새로 추가" }).click();
  const f2 = ed.getByRole("textbox", { name: "새 분류 이름" });
  await f2.fill("취미");
  await f2.press("Enter");
  await page.waitForTimeout(250);
  await ed.getByRole("button", { name: "닫기" }).last().click();
  await page.waitForTimeout(500);
  await gotoTab(page, "캘린더");
  await page.waitForTimeout(500);
  await page.locator("section.rounded-xl").nth(2).getByRole("button", { name: /영어 단어/ }).first().click();
  const d2 = page.getByRole("dialog");
  await d2.waitFor();
  check("일정 창에서 만든 분류가 루틴 창에도", (await d2.getByRole("button", { name: "취미", exact: true }).count()) === 1);
  await d2.getByRole("button", { name: "닫기" }).last().click();
  await page.waitForTimeout(300);

  /* ── 프로젝트 탭: 루틴 카드 부제 ── */
  await gotoTab(page, "프로젝트");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/pc-projects.png` });
  const articles = await page.locator("article", { hasText: "루틴" }).allInnerTexts();
  const joined = articles.join("\n---\n");
  check("프로젝트 탭 루틴 카드 존재", articles.length >= 1, String(articles.length));
  check("루틴 부제에 '이번 주' 없음", !joined.includes("이번 주"), joined.slice(0, 200));
  check("루틴 부제에 '루틴 · ' 없음", !joined.includes("루틴 ·"), joined.slice(0, 200));
  for (const cat of ["운동", "공부", "업무", "마케팅"]) {
    check(`프로젝트 탭 ${cat} 루틴 카드`, joined.split("\n").map((s) => s.trim()).includes(cat), joined.slice(0, 300));
  }
  const html = await page.content();
  check("받은함 → index", html.includes("index") && !html.includes("받은함"));

  /* ── 커스텀 분류 'now' 필터가 전체처럼 동작하지 않는지 ── */
  await page.getByRole("button", { name: "now", exact: true }).first().click();
  await page.waitForTimeout(700);
  const nowCards = page.locator("article", { hasText: "now 실험" });
  const otherCards = page.locator("article", { hasText: "브랜드 포트폴리오" });
  check("'now' 분류 필터: 해당 카드만", (await nowCards.count()) >= 1 && (await otherCards.count()) === 0,
        `now=${await nowCards.count()} other=${await otherCards.count()}`);
  await page.screenshot({ path: `${OUT}/pc-now-filter.png` });

  /* ── 분류 삭제(길게 누르기) ── */
  const nowChip = page.getByRole("button", { name: "now", exact: true }).first();
  const chipBox = await nowChip.boundingBox();
  if (chipBox) {
    await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  const removeBtn = page.getByRole("button", { name: "now 분류 지우기" });
  check("길게 누르면 삭제 확인", (await removeBtn.count()) === 1);
  if (await removeBtn.count()) {
    await removeBtn.first().click();
    await page.waitForTimeout(600);
    check("삭제한 분류가 필터에서 사라짐", (await page.getByRole("button", { name: "now", exact: true }).count()) === 0,
          String(await page.getByRole("button", { name: "now", exact: true }).count()));
  }

  /* ── 히스토리 보기 + 카드 숨김 ── */
  await page.getByRole("button", { name: "전체", exact: true }).first().click();
  await page.waitForTimeout(400);
  const eye = page.getByRole("button", { name: /가을 캠페인 NOW 숨기기/ }).first();
  check("카드에 숨김 버튼", (await eye.count()) === 1);
  if (await eye.count()) {
    await eye.click();
    await page.waitForTimeout(900);
    const patch = mock.calls.filter((c) => c.method === "PATCH" && c.resource === "projects" && c.body.hidden === true);
    check("카드에서 한 번에 숨김 저장", patch.length >= 1, JSON.stringify(patch.length));
  }
  // 메인 NOW 토글: 켜면 NOW 숨김 카드가 트랙에서 사라지고, 끄면 다시 보임
  await page.getByRole("button", { name: "NOW 숨김만 보기" }).first().click();
  await page.waitForTimeout(700);
  const visibleHidden = await page.locator("article", { hasText: "가을 캠페인" }).count();
  check("NOW 토글 ON → NOW 숨김 카드 가려짐", visibleHidden === 0, String(visibleHidden));
  check("NOW 토글 ON → 나머지 카드는 유지", (await page.locator("article", { hasText: "브랜드 포트폴리오" }).count()) >= 1);
  await page.screenshot({ path: `${OUT}/pc-now-on.png` });
  await page.getByRole("button", { name: "NOW 숨김만 보기" }).first().click();
  await page.waitForTimeout(600);
  check("NOW 토글 OFF → 다시 보임", (await page.locator("article", { hasText: "가을 캠페인" }).count()) >= 1);
  check("+ new 버튼", (await page.getByRole("button", { name: "+ new", exact: true }).count()) === 1);

  await page.getByRole("button", { name: "히스토리", exact: true }).first().click();
  await page.waitForTimeout(700);
  const histText = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
  check("히스토리 보기: 숨긴 프로젝트 구역", histText.includes("숨긴 프로젝트") && histText.includes("가을 캠페인"), histText.slice(0, 160));
  check("히스토리 보기: 완료한 프로젝트 구역", histText.includes("완료한 프로젝트"));
  await page.screenshot({ path: `${OUT}/pc-history-view.png` });
  const showBtn = page.getByRole("button", { name: /가을 캠페인 숨김 해제|보이기/ }).first();
  check("히스토리에서 숨김 해제 버튼", (await showBtn.count()) === 1);
  if (await showBtn.count()) {
    await showBtn.click();
    await page.waitForTimeout(800);
    const un = mock.calls.filter((c) => c.method === "PATCH" && c.resource === "projects" && c.body.hidden === false);
    check("히스토리에서 한 번에 숨김 해제", un.length >= 1, JSON.stringify(un.length));
  }
  await page.close();

  /* ── 모바일 월간 → 하루 목록 → 수정 → 자동 저장 ── */
  const mock2 = makeMock(fixture());
  const { page: page2 } = await openPage(browser, 390, 844, mock2, true);
  await gotoTab(page2, "캘린더");
  await page2.getByRole("button", { name: "월간" }).click();
  await page2.waitForTimeout(800);
  await page2.screenshot({ path: `${OUT}/mobile-month.png` });
  await page2.getByRole("button", { name: "21", exact: true }).first().click();
  await page2.waitForTimeout(700);
  const dayList = page2.getByRole("dialog", { name: /하루 목록/ });
  check("모바일: 날짜 칸 클릭 → 하루 목록 먼저", (await dayList.count()) === 1);
  await page2.screenshot({ path: `${OUT}/mobile-month-daylist.png` });
  if (await dayList.count()) {
    await dayList.getByRole("button", { name: "치과 예약" }).first().click();
    await page2.waitForTimeout(700);
    const second = page2.locator("[role='dialog']").nth(1);
    check("목록에서 일정 → 일정 상세/수정 화면", (await second.innerText()).includes("치과 예약"), (await second.innerText()).slice(0, 40));
    await page2.screenshot({ path: `${OUT}/mobile-editor.png` });
    // 제목을 고치고 바깥을 눌러 나가면 자동 저장
    await second.getByRole("button", { name: "제목 수정" }).first().click();
    const input = second.getByRole("textbox", { name: "제목 입력" }).first();
    await input.fill("치과 예약 (변경)");
    const before = mock2.calls.filter((c) => c.method === "PATCH" && c.resource === "calendar").length;
    await page2.locator("[role='dialog']").first().locator("button[aria-label='바깥 클릭으로 이전']").first().click({ force: true }).catch(async () => {
      await page2.keyboard.press("Escape");
    });
    await page2.waitForTimeout(1400);
    const after = mock2.calls.filter((c) => c.method === "PATCH" && c.resource === "calendar");
    check("닫기만 해도 일정이 저장됨", after.length > before && String(after[after.length - 1].body.title || "").includes("변경"),
      JSON.stringify(after[after.length - 1] && after[after.length - 1].body));
  }
  await page2.close();

  /* ── 모바일 상단 헤더 스와이프 ── */
  const { page: page3 } = await openPage(browser, 390, 844, makeMock(fixture()), true);
  await page3.getByRole("button", { name: "상단 메뉴 열기" }).click();
  await page3.waitForTimeout(500);
  check("상단 헤더 열림", (await page3.getByRole("button", { name: "상단 메뉴 닫기" }).count()) === 1);
  await page3.screenshot({ path: `${OUT}/mobile-chrome-open.png` });
  const barBox = await page3.getByText("나의 다이어리").first().boundingBox();
  if (barBox) {
    const x = barBox.x + 10;
    const y = barBox.y + barBox.height / 2;
    await page3.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      const mk = (type, cy) => {
        const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: cy });
        el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      };
      mk("touchstart", y + 60);
      mk("touchmove", y - 20);
      mk("touchend", y - 20);
    }, { x, y });
    await page3.waitForTimeout(600);
  }
  check("위로 스와이프하면 상단 헤더 닫힘", (await page3.getByRole("button", { name: "상단 메뉴 열기" }).count()) === 1, String(await page3.getByRole("button", { name: "상단 메뉴 닫기" }).count()));
  await page3.screenshot({ path: `${OUT}/mobile-chrome-after-swipe.png` });
  await page3.close();

  /* ── 바인더 주간: 본문만 + 자동 제목 ── */
  const mock4 = makeMock(fixture());
  const { page: page4 } = await openPage(browser, 1440, 950, mock4);
  await gotoTab(page4, "바인더");
  await page4.waitForTimeout(800);
  await page4.screenshot({ path: `${OUT}/pc-binder-week.png` });
  const row = page4.locator("[data-binder-day='2026-11-21']");
  check("주간 바인더 21일 칸", (await row.count()) === 1);
  await row.locator("button").first().click();
  await page4.waitForTimeout(500);
  const area = row.locator("textarea");
  check("클릭하면 본문 입력창", (await area.count()) === 1);
  await area.fill("오늘은 천천히 걸었다.\n두 번째 줄.");
  await page4.locator("h1").first().click();
  await page4.waitForTimeout(1600);
  const created = mock4.calls.filter((c) => c.method === "POST" && c.resource === "binder");
  check("바인더 저장", created.length === 1, JSON.stringify(created.length));
  if (created.length) {
    const body = created[0].body;
    check("본문 전체가 그대로 저장", body.body === "오늘은 천천히 걸었다.\n두 번째 줄.", String(body.body).slice(0, 60));
    check("제목 자동 '11월 21일 토요일 바인더'", body.title === "11월 21일 토요일 바인더", String(body.title));
  }
  await page4.waitForTimeout(400);
  const cellText = await page4.locator("[data-binder-day='2026-11-21']").innerText();
  check("주간 칸에 본문만 보임", cellText.includes("천천히 걸었다") && !cellText.includes("바인더"), cellText.slice(0, 80));
  await page4.screenshot({ path: `${OUT}/pc-binder-after.png` });
  await page4.close();

  await browser.close();
  console.log(`\n== PASS ${PASSES.length} FAIL ${FAILS.length}`);
  FAILS.forEach((f) => console.log(" - " + f));
  process.exit(FAILS.length ? 1 : 0);
})();
