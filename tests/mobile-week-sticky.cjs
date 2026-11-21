const { chromium } = require("playwright");
const data = {
  calendar: [
    { id:"ev-2", url:"", title:"치과 예약", hidden:false, trash:false, favorite:false, memo:"", sort:null, projectIds:[], createdAt:"2026-11-01T00:00:00.000Z", updatedAt:"2026-11-01T00:00:00.000Z", kind:"일정", category:"개인", date:"2026-11-21", startTime:"14:00", endTime:"15:00", endDate:null, allDay:false, done:false, canceled:false, cancelReason:"", cancelAt:null, weekKey:"", baseDate:null },
  ],
  projects: Array.from({length: 12}, (_, i) => ({ id:`pj-${i}`, url:"", title:`프로젝트 ${i}`, hidden:false, trash:false, favorite:false, memo:"", sort:i*10, projectIds:[], createdAt:"2026-11-01T00:00:00.000Z", updatedAt:"2026-11-01T00:00:00.000Z", kind:"프로젝트", category:"업무", status:"미완료", date:"2026-11-18", due:null, doneAt:null, checkedAt:null, urgent:false, important:false, history:false, waitFor:"", waitNote:"", cancelReason:"", cancelAt:null, repeatGroupId:"" })),
  routines: [
    { id:"rt-1", url:"", title:"물 마시기", hidden:false, trash:false, favorite:false, memo:"", sort:null, projectIds:[], createdAt:"2026-11-01T00:00:00.000Z", updatedAt:"2026-11-01T00:00:00.000Z", kind:"루틴", category:"개인", date:null, repeatDays:["월","화","수","목","금","토","일"], targetCount:1, execCount:0, amount:null, unit:"회", history:false, routineIds:[] },
  ],
  binder: [], archive: [],
};
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ["--no-sandbox","--disable-dev-shm-usage"] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route("**/api/**", async (route, request) => {
    const p = new URL(request.url()).pathname;
    if (p === "/api/status") return route.fulfill({ json: { ok:true, needsToken:false, authRequired:false, authenticated:true, dbs:{} } });
    if (p === "/api/notion/all") return route.fulfill({ json: { ok:true, data, errors:{} } });
    return route.fulfill({ json: { ok:true, data: [] } });
  });
  await page.goto("http://127.0.0.1:3222", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1"); await page.waitForTimeout(1200);
  const header = page.locator("[data-week-header='true']");
  const before = await header.boundingBox();
  await page.mouse.move(200, 600); await page.mouse.wheel(0, 400); await page.waitForTimeout(700);
  const after = await header.boundingBox();
  console.log("header before", before && before.y, "after", after && after.y);
  console.log("sticky:", before && after && Math.abs(after.y - 0) < 60);
  await page.screenshot({ path: "/workspace/work/diary-shots-a16/mobile-week-scrolled.png" });
  await b.close();
})();
