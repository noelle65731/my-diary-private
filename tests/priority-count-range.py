"""A20 검증 — 프로젝트 > 우선순위 탭

1) 사분면 표시 개수 3~10: 기본 5, −/+ 스텝, 한계에서 비활성, 새로고침 유지(localStorage)
2) 설정 개수를 넘으면 `+N개 더 보기` → 펼침 → `접기`
3) 우선순위 탭 전용 기간(부터~까지): 기간 안 할 일만, 날짜 없는 할 일 제외 안내, `전체 보기` 초기화
4) 진행 탭은 기간 필터의 영향을 받지 않음
5) PC 1440×900 · 폰 402×874 레이아웃(가로 넘침 없음)

    BASE=http://127.0.0.1:3213 OUT=/workspace/work/priority-shots python3 tests/priority-count-range.py
"""
import os
import json
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3213")
OUT = os.environ.get("OUT", "/workspace/work/priority-shots")
CHROME = os.environ.get("CHROME", "/workspace/.browsers/chromium/chromium")
os.makedirs(OUT, exist_ok=True)

STAMP = "2026-11-01T00:00:00.000Z"


def base(id, title, extra=None):
    d = {
        "id": id, "url": "", "title": title, "hidden": False, "trash": False, "favorite": False,
        "memo": "", "sort": None, "projectIds": [], "createdAt": STAMP, "updatedAt": STAMP,
    }
    d.update(extra or {})
    return d


def task(id, title, extra=None):
    d = base(id, title)
    d.update({
        "kind": "할 일", "category": "업무", "status": "미완료", "date": None, "due": None,
        "doneAt": None, "checkedAt": None, "urgent": False, "important": False, "history": False,
        "waitFor": "", "waitNote": "", "cancelReason": "", "cancelAt": None, "repeatGroupId": "",
    })
    d.update(extra or {})
    return d


def fixture():
    projects = [task("pj-1", "브랜드 포트폴리오", {"kind": "프로젝트", "category": "업무"})]
    tasks = []
    do_dates = ["2026-11-10", "2026-11-12", "2026-11-14", "2026-11-16",
                "2026-11-18", "2026-11-20", "2026-11-22", "2026-11-24"]
    for i, date in enumerate(do_dates):
        tasks.append(task(f"do-{i+1}", f"긴급중요 {date[5:].replace('-', '/')}",
                          {"date": date, "urgent": True, "important": True,
                           "projectIds": ["pj-1"], "sort": (i + 1) * 10}))
    tasks.append(task("do-undated", "긴급중요 날짜없음",
                      {"urgent": True, "important": True, "projectIds": ["pj-1"]}))
    for i, date in enumerate(["2026-11-15", "2026-11-17", "2026-11-21", "2026-11-25"]):
        tasks.append(task(f"plan-{i+1}", f"중요 {date[5:].replace('-', '/')}",
                          {"date": date, "important": True, "projectIds": ["pj-1"], "sort": (i + 1) * 10}))
    tasks.append(task("del-1", "긴급 하나", {"date": "2026-11-13", "urgent": True, "projectIds": ["pj-1"]}))
    tasks.append(task("del-2", "긴급 둘", {"date": "2026-11-19", "urgent": True, "projectIds": ["pj-1"]}))
    tasks.append(task("later-1", "기타 하나", {"date": "2026-11-11", "projectIds": ["pj-1"]}))
    tasks.append(task("later-2", "기타 둘", {"date": "2026-11-23", "projectIds": ["pj-1"]}))
    tasks.append(task("later-3", "기타 날짜없음", {"projectIds": ["pj-1"]}))
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


def open_page(browser, width, height, data, mobile=False, storage=None):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR",
                              device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
    if storage:
        js = "".join(f"window.localStorage.setItem({json.dumps(k)}, {json.dumps(v)});" for k, v in storage.items())
        ctx.add_init_script(js)
    page = ctx.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    mock_routes(page, data)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=40000)
    page.wait_for_timeout(1200)
    return ctx, page, errors


def go_priority(page):
    nav = page.locator("nav button", has_text="프로젝트").first
    nav.wait_for(state="attached")
    nav.evaluate("el => el.click()")
    page.wait_for_timeout(600)
    tab = page.get_by_role("button", name="우선순위", exact=True)
    tab.wait_for(state="attached")
    tab.evaluate("el => el.click()")
    page.wait_for_selector("[data-priority-view]", timeout=15000)
    page.wait_for_timeout(400)


def rows(page, key):
    return page.locator(f'[data-quadrant="{key}"] [data-priority-task]').count()


def count_of(page, key):
    return page.locator(f'[data-quadrant-count="{key}"]').inner_text().strip()


def preview(page):
    return page.locator("[data-priority-preview]").inner_text().strip()


def more_text(page, key):
    loc = page.locator(f'[data-priority-more="{key}"]')
    return loc.inner_text().strip() if loc.count() else ""


def shot(page, name):
    path = os.path.join(OUT, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print("shot", path)


def local_preview(page):
    return page.evaluate("""() => {
        try {
          const raw = window.localStorage.getItem('my-diary:settings:v1');
          return raw ? JSON.parse(raw).priorityTaskPreview : null;
        } catch { return null; }
    }""")


def main():
    data = fixture()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

        # ---------- 1) PC: 개수 3~10 · 더 보기 · 유지 ----------
        ctx, page, errors = open_page(browser, 1440, 900, data)
        go_priority(page)
        check("PC: 우선순위 탭 열림", page.locator("[data-priority-view]").is_visible())
        check("PC: 기본 표시 개수 5", preview(page) == "5", preview(page))
        check("PC: 긴급·중요 총 9개", count_of(page, "do") == "9", count_of(page, "do"))
        check("PC: 기본 5줄만 보임", rows(page, "do") == 5, str(rows(page, "do")))
        check("PC: '+4개 더 보기'", more_text(page, "do") == "+4개 더 보기", more_text(page, "do"))
        check("PC: 중요 4개는 전부 보임(5 미만)", rows(page, "plan") == 4, str(rows(page, "plan")))
        check("PC: 중요엔 더 보기 없음", more_text(page, "plan") == "", more_text(page, "plan"))
        shot(page, "pc-priority-default-5")

        page.locator('[data-priority-more="do"]').click()
        page.wait_for_timeout(200)
        check("PC: 더 보기 → 9줄 전부", rows(page, "do") == 9, str(rows(page, "do")))
        check("PC: 펼치면 접기 버튼", page.locator('[data-priority-less="do"]').count() == 1)
        check("PC: 펼치면 더 보기 사라짐", page.locator('[data-priority-more="do"]').count() == 0)
        page.locator('[data-priority-less="do"]').click()
        page.wait_for_timeout(200)
        check("PC: 접기 → 다시 5줄", rows(page, "do") == 5, str(rows(page, "do")))

        page.locator('[data-priority-preview-step="-1"]').click()
        page.locator('[data-priority-preview-step="-1"]').click()
        page.wait_for_timeout(250)
        check("PC: 3까지 내려감", preview(page) == "3", preview(page))
        check("PC: 3줄 표시", rows(page, "do") == 3, str(rows(page, "do")))
        check("PC: 3에서 − 비활성", page.locator('[data-priority-preview-step="-1"]').is_disabled())
        check("PC: 3에서 '+6개 더 보기'", more_text(page, "do") == "+6개 더 보기", more_text(page, "do"))
        check("PC: 저장값 3", local_preview(page) == 3, str(local_preview(page)))
        shot(page, "pc-priority-count-3")

        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("h1", timeout=40000)
        page.wait_for_timeout(1200)
        go_priority(page)
        check("PC: 새로고침 후에도 3 유지", preview(page) == "3", preview(page))
        check("PC: 새로고침 후 3줄", rows(page, "do") == 3, str(rows(page, "do")))

        for _ in range(7):
            page.locator('[data-priority-preview-step="1"]').click()
        page.wait_for_timeout(300)
        check("PC: 10까지 올라감", preview(page) == "10", preview(page))
        check("PC: 10에서 + 비활성", page.locator('[data-priority-preview-step="1"]').is_disabled())
        check("PC: 10이면 더 보기 없음", more_text(page, "do") == "", more_text(page, "do"))
        check("PC: 10이면 9줄 전부", rows(page, "do") == 9, str(rows(page, "do")))
        check("PC: 저장값 10", local_preview(page) == 10, str(local_preview(page)))
        shot(page, "pc-priority-count-10")

        for _ in range(5):
            page.locator('[data-priority-preview-step="-1"]').click()
        page.wait_for_timeout(200)
        check("PC: 5로 복귀", preview(page) == "5", preview(page))
        check("PC: 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:3]))
        ctx.close()

        # ---------- 2) PC: 기간 필터 ----------
        ctx, page, errors = open_page(browser, 1440, 900, data, storage={
            "my-diary:settings:v1": json.dumps({"priorityTaskPreview": 10}),
        })
        go_priority(page)
        check("기간: 초기 시작일 비어 있음", page.locator("[data-priority-from]").input_value() == "")
        check("기간: 초기 전체 보기 비활성", page.locator("[data-priority-range-clear]").is_disabled())
        check("기간: 초기엔 긴급·중요 9개", count_of(page, "do") == "9", count_of(page, "do"))

        page.fill("[data-priority-from]", "2026-11-14")
        page.fill("[data-priority-to]", "2026-11-18")
        page.wait_for_timeout(400)
        check("기간 11/14~11/18: 긴급·중요 3개", count_of(page, "do") == "3", count_of(page, "do"))
        joined = " | ".join(page.locator('[data-quadrant="do"] [data-priority-task]').all_inner_texts())
        check("기간: 11/18·11/16·11/14만", all(d in joined for d in ["11/18", "11/16", "11/14"]), joined)
        check("기간: 11/20 이상은 빠짐",
              not any(d in joined for d in ["11/20", "11/22", "11/24"]), joined)
        check("기간: 날짜 없는 할 일 빠짐", "날짜없음" not in joined, joined)
        check("기간: 중요 2개(11/15·11/17)", count_of(page, "plan") == "2", count_of(page, "plan"))
        check("기간: 기타 0개(11/11·11/23 모두 밖)", count_of(page, "later") == "0", count_of(page, "later"))
        note = page.locator("[data-priority-range-note]").inner_text()
        check("기간: 안내에 빠진 날짜 없는 개수", "날짜 없는 할 일 2개는 빠집니다" in note, note)
        check("기간: 안내에 기간 표시", "11/14" in note and "11/18" in note, note)
        check("기간: 전체 보기 버튼 활성", not page.locator("[data-priority-range-clear]").is_disabled())
        shot(page, "pc-priority-range-11-14-11-18")

        page.get_by_role("button", name="진행", exact=True).evaluate("el => el.click()")
        page.wait_for_timeout(500)
        track_text = page.locator('[data-project-card="pj-1"]').inner_text()
        check("진행 탭: 남은 할 일 18 그대로(기간 영향 없음)", "남은 할 일 18" in track_text,
              " | ".join(track_text.split("\n")[:6]))
        go_priority(page)
        check("우선순위 복귀: 기간 유지", page.locator("[data-priority-from]").input_value() == "2026-11-14",
              page.locator("[data-priority-from]").input_value())
        check("우선순위 복귀: 필터도 그대로 3개", count_of(page, "do") == "3", count_of(page, "do"))

        page.fill("[data-priority-to]", "")
        page.fill("[data-priority-from]", "2026-11-20")
        page.wait_for_timeout(300)
        check("시작일만 11/20: 긴급·중요 3개", count_of(page, "do") == "3", count_of(page, "do"))
        page.fill("[data-priority-to]", "2026-11-15")
        page.wait_for_timeout(300)
        check("시작일>종료일: 시작일을 몰래 고치지 않음",
              page.locator("[data-priority-from]").input_value() == "2026-11-20",
              page.locator("[data-priority-from]").input_value())
        check("시작일>종료일: 안내 문구", page.locator("[data-priority-range-invalid]").count() == 1)
        check("시작일>종료일: 기간을 풀고 전체 표시", count_of(page, "do") == "9", count_of(page, "do"))
        check("시작일>종료일: 기간 안내 문구는 숨김", page.locator("[data-priority-range-note]").count() == 0)

        page.locator("[data-priority-range-clear]").click()
        page.wait_for_timeout(300)
        check("전체 보기: 시작·종료 비움",
              page.locator("[data-priority-from]").input_value() == "" and page.locator("[data-priority-to]").input_value() == "")
        check("전체 보기: 긴급·중요 다시 9개", count_of(page, "do") == "9", count_of(page, "do"))
        check("전체 보기: 안내 사라짐", page.locator("[data-priority-range-note]").count() == 0)
        check("기간: 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:3]))
        ctx.close()

        # ---------- 3) 폰 402×874 ----------
        ctx, page, errors = open_page(browser, 402, 874, data, mobile=True)
        go_priority(page)
        page.wait_for_timeout(500)
        overflow = page.evaluate("() => ({doc: document.documentElement.scrollWidth, win: window.innerWidth, body: document.body.scrollWidth})")
        check("폰: 페이지 가로 넘침 없음",
              overflow["doc"] <= overflow["win"] + 1 and overflow["body"] <= overflow["win"] + 1, json.dumps(overflow))
        box = page.locator("[data-priority-range]").bounding_box()
        check("폰: 기간 도구줄 화면 안",
              bool(box) and box["x"] >= -1 and box["x"] + box["width"] <= overflow["win"] + 1, json.dumps(box))
        step_box = page.locator('[data-priority-preview-step="1"]').bounding_box()
        check("폰: 개수 조절 화면 안",
              bool(step_box) and step_box["x"] + step_box["width"] <= overflow["win"] + 1, json.dumps(step_box))
        check("폰: 개수 조절 보임", page.locator("[data-priority-preview]").is_visible())
        check("폰: 기간 입력 2개 보임",
              page.locator("[data-priority-from]").is_visible() and page.locator("[data-priority-to]").is_visible())
        shot(page, "mobile-402-priority")

        page.fill("[data-priority-from]", "2026-11-14")
        page.fill("[data-priority-to]", "2026-11-18")
        page.wait_for_timeout(400)
        check("폰: 기간 걸러도 가로 넘침 없음",
              page.evaluate("() => document.documentElement.scrollWidth") <= 403)
        check("폰: 기간 필터 동작", count_of(page, "do") == "3", count_of(page, "do"))
        shot(page, "mobile-402-priority-range")
        check("폰: 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:3]))
        ctx.close()

        browser.close()

    print(f"\n{len(PASSES)} passed, {len(FAILS)} failed")
    if FAILS:
        for f in FAILS:
            print(" -", f)
        sys.exit(1)


main()
