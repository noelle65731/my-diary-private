/**
 * A18 검증 — 설정의 글자 크기가 9단계(더 작은 3단계 포함)가 되었고, 고른 배율이
 * 앱 전체 글자에 반영되며, 새로고침(저장) 뒤에도 유지되는지.
 *
 *    node tests/font-scale.cjs            # BASE=http://127.0.0.1:3214
 *
 * 환경변수: BASE, OUT, PREFIX, CHROME, PLAYWRIGHT_MODULE
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/workspace/.tools/pw/node_modules/playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://127.0.0.1:3214";
const OUT = process.env.OUT || "/workspace/downloads/diary-a18";
const PREFIX = process.env.PREFIX || "";
fs.mkdirSync(OUT, { recursive: true });

const FAILS = [];
const PASSES = [];
const check = (name, ok, detail = "") => {
  if (ok) { PASSES.push(name); console.log("PASS ", name); }
  else { FAILS.push(`${name} ${detail}`.trim()); console.log("FAIL ", name, detail); }
};

const data = { calendar: [], projects: [], routines: [], binder: [], archive: [] };
const mockRoutes = (page) => {
  page.route("**/api/**", (route, request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/status")
      return route.fulfill({ json: { ok: true, needsToken: false, authRequired: false, authenticated: true, dbs: {} } });
    if (path === "/api/notion/all") return route.fulfill({ json: { ok: true, data, errors: {} } });
    return route.fulfill({ json: { ok: true, data: [] } });
  });
};

const MEASURE = () => {
  const pick = (selector) => {
    const el = document.querySelector(selector);
    return el ? getComputedStyle(el).fontSize : null;
  };
  return {
    fs: getComputedStyle(document.documentElement).getPropertyValue("--fs").trim(),
    html: getComputedStyle(document.documentElement).fontSize,
    level: document.documentElement.dataset.fontSize,
    h1: pick("h1"),
    nav: pick("nav button"),
    chip: pick("main button"),
  };
};

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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await mockRoutes(page);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1500);

  // 상단 메뉴를 열고 설정으로 들어갑니다.
  await page.mouse.move(700, 2);
  await page.waitForTimeout(600);
  // 상단 띠가 내려온 뒤 설정 버튼을 누릅니다(띠가 클릭을 가로채지 않게 스크립트로 누름).
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((node) => node.getAttribute("aria-label") === "설정");
    button?.click();
  });
  await page.waitForTimeout(900);
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.waitFor();

  const range = dialog.locator('input[type="range"]').first();
  const min = await range.getAttribute("min");
  const max = await range.getAttribute("max");
  check("설정: 글자 크기 슬라이더 최대 9단계", max === "9", `max=${max}`);
  const label = await dialog.locator("text=/ \\/ \\d+/").first().textContent();
  console.log("label", label);
  check("설정: 단계 표시가 n / 9", !!label && label.includes("/ 9"), String(label));

  const base = await page.evaluate(MEASURE);
  console.log("BASE", JSON.stringify(base));

  const setLevel = async (level) => {
    await range.evaluate((element, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(element, String(value));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, level);
    await page.waitForTimeout(500);
    return page.evaluate(MEASURE);
  };

  const small = await setLevel(1);
  console.log("LEVEL1", JSON.stringify(small));
  await shot(page, "font-scale-1-smallest");
  check("1단계: --fs 배율이 내려감", parseFloat(small.fs) < 0.8, small.fs);
  check("1단계: 앱 글자가 실제로 작아짐(text-[15px] 요소)", !!small.nav && parseFloat(small.nav) < 12.5, small.nav);
  check("1단계: 제목도 함께 작아짐", !!small.h1 && small.h1 === base.h1 ? false : !!small.h1 && parseFloat(small.h1) < parseFloat(base.h1), `${base.h1} -> ${small.h1}`);

  const mid = await setLevel(6);
  console.log("LEVEL6", JSON.stringify(mid));
  check("6단계: 기본 크기(15px 기준)", Math.abs(parseFloat(mid.fs) - 1) < 0.001 && mid.nav === "15px", `${mid.fs} / ${mid.nav}`);
  await shot(page, "font-scale-6-default");

  const big = await setLevel(9);
  console.log("LEVEL9", JSON.stringify(big));
  check("9단계: 배율이 올라감", parseFloat(big.fs) > 1.15, big.fs);
  check("9단계: 앱 글자가 실제로 커짐", !!big.nav && parseFloat(big.nav) > 17, big.nav);
  await shot(page, "font-scale-9-largest");

  // 저장 확인 — 새로고침 뒤에도 9단계
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1600);
  const after = await page.evaluate(MEASURE);
  console.log("AFTER RELOAD", JSON.stringify(after));
  check("새로고침 뒤에도 고른 단계가 유지", after.level === "9" && Math.abs(parseFloat(after.fs) - 1.18) < 0.01, `${after.level} / ${after.fs}`);

  // 예전 6단계 저장값(3)은 같은 크기의 6단계로 옮겨짐
  await page.evaluate(() => {
    window.localStorage.setItem("my-diary:settings:v1", JSON.stringify({ fontSize: 3 }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1600);
  const migrated = await page.evaluate(MEASURE);
  console.log("MIGRATED", JSON.stringify(migrated));
  check("예전 3단계 저장값이 같은 크기(6단계)로 옮겨짐", migrated.level === "6" && Math.abs(parseFloat(migrated.fs) - 1) < 0.001, `${migrated.level} / ${migrated.fs}`);

  await context.close();
  await browser.close();
  console.log(`\n===== ${PREFIX || "RESULT"} =====`);
  console.log(`passed ${PASSES.length} · failed ${FAILS.length}`);
  for (const f of FAILS) console.log(" -", f);
  process.exit(FAILS.length ? 1 : 0);
})();
