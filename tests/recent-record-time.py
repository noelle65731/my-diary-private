"""A22 검증 — 프로젝트 카드 '최근 기록'에 완료한 할 일의 시간 표시

1) startTime 이 있으면 `11/20 금 13:00` 처럼 시간까지
2) startTime~endTime 이면 `13:00~14:00`
3) 시간이 없으면 예전처럼 날짜만
4) PC·폰에서 카드 글자가 넘치지 않음

    BASE=http://127.0.0.1:3222 OUT=/workspace/work/priority-shots python3 tests/recent-record-time.py
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3222")
OUT = os.environ.get("OUT", "/workspace/work/priority-shots")
CHROME = os.environ.get("CHROME", "/workspace/.browsers/chromium/chromium")
os.makedirs(OUT, exist_ok=True)
STAMP = "2026-11-01T00:00:00.000Z"


def base(id, title, extra=None):
    d = {"id": id, "url": "", "title": title, "hidden": False, "trash": False, "favorite": False,
         "memo": "", "sort": None, "projectIds": [], "createdAt": STAMP, "updatedAt": STAMP}
    d.update(extra or {})
    return d


def task(id, title, extra=None):
    d = base(id, title)
    d.update({"kind": "할 일", "category": "개인", "status": "미완료", "date": None, "due": None,
              "startTime": None, "endTime": None, "doneAt": None, "checkedAt": None,
              "urgent": False, "important": False, "history": False, "waitFor": "", "waitNote": "",
              "cancelReason": "", "cancelAt": None, "repeatGroupId": ""})
    d.update(extra or {})
    return d


def fixture():
    projects = [
        task("pj-1", "온담 프로젝트", {"kind": "프로젝트", "category": "개인"}),
        task("pj-2", "성수 맛집", {"kind": "프로젝트", "category": "개인"}),
    ]
    tasks = [
        task("done-1", "온담 방문", {"status": "완료", "date": "2026-11-20", "doneAt": "2026-11-20",
                                    "startTime": "13:00", "endTime": "14:00", "projectIds": ["pj-1"]}),
        task("done-3", "시간 없는 방문", {"status": "완료", "date": "2026-11-21",
                                          "doneAt": "2026-11-21", "projectIds": ["pj-1"]}),
        task("done-2", "도도한면 2호점(성수) 방문", {"status": "완료", "date": "2026-11-19",
                                                    "doneAt": "2026-11-19", "startTime": "18:30",
                                                    "projectIds": ["pj-2"]}),
        task("open-1", "남은 일 하나", {"date": "2026-11-23", "startTime": "17:30", "projectIds": ["pj-1"]}),
    ]
    return {"calendar": [], "projects": projects + tasks, "routines": [], "binder": [], "archive": []}


PASSES, FAILS = [], []


def check(name, ok, detail=""):
    if ok:
        PASSES.append(name)
        print("PASS ", name)
    else:
        FAILS.append(f"{name} {detail}".strip())
        print("FAIL ", name, detail)


def mock_routes(page, data):
    def handler(route, request):
        path = request.url.split("?")[0]
        if path.endswith("/api/status"):
            return route.fulfill(json={"ok": True, "needsToken": False, "authRequired": False,
                                       "authenticated": True, "dbs": {}})
        if path.endswith("/api/notion/all"):
            return route.fulfill(json={"ok": True, "data": data, "errors": {}})
        if path.endswith("/schema"):
            return route.fulfill(json={"ok": True, "data": []})
        if path.endswith("/blocks"):
            return route.fulfill(json={"ok": True, "data": {"text": "", "preserved": []}})
        return route.fulfill(json={"ok": True, "data": []})
    page.route("**/api/**", handler)


def open_page(browser, width, height, data, mobile=False):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR",
                              device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.set_default_timeout(15000)
    mock_routes(page, data)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=40000)
    page.wait_for_timeout(1200)
    nav = page.locator("nav button", has_text="프로젝트").first
    nav.evaluate("el => el.click()")
    page.wait_for_timeout(800)
    return ctx, page


def main():
    data = fixture()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

        for label, w, h, mobile in [("pc", 1440, 900, False), ("mobile", 402, 874, True)]:
            ctx, page = open_page(browser, w, h, data, mobile)
            card = page.locator('[data-project-card="pj-1"]')
            text = card.inner_text()
            recent = page.locator('[data-project-card="pj-1"]').inner_text().split("최근 기록")[-1] if "최근 기록" in text else ""
            check(f"{label}: 최근 기록 있음", "최근 기록" in text, text)
            check(f"{label}: 시작~종료 시간 표시", "11/20 금 13:00~14:00" in recent, recent)
            check(f"{label}: 시간 없으면 날짜만", "11/21 토" in recent and "11/21 토 " not in recent, recent)
            other = page.locator('[data-project-card="pj-2"]').inner_text().split("최근 기록")[-1]
            check(f"{label}: 시작만 있는 시간 표시", "11/19 목 18:30" in other, other)
            check(f"{label}: 남은 할 일 시간은 그대로", "11/23 월 17:30" in text, text)
            overflow = page.evaluate("() => ({doc: document.documentElement.scrollWidth, win: window.innerWidth})")
            check(f"{label}: 가로 넘침 없음", overflow["doc"] <= overflow["win"] + 1, json.dumps(overflow))
            # 최근 기록 줄이 카드 폭을 넘지 않는지
            box = page.evaluate("""() => {
                const card = document.querySelector('[data-project-card="pj-1"]');
                const rows = [...card.querySelectorAll('li')].map((li) => li.getBoundingClientRect());
                const c = card.getBoundingClientRect();
                return rows.filter((r) => r.right > c.right + 1).length;
            }""")
            check(f"{label}: 최근 기록 줄이 카드 밖으로 넘치지 않음", box == 0, str(box))
            path = os.path.join(OUT, f"{label}-recent-record-time.png")
            page.screenshot(path=path, full_page=True)
            print("shot", path)
            ctx.close()

        browser.close()

    print(f"\n{len(PASSES)} passed, {len(FAILS)} failed")
    if FAILS:
        for f in FAILS:
            print(" -", f)
        sys.exit(1)


main()
