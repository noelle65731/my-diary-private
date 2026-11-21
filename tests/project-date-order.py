"""A28 검증 — 프로젝트 날짜 정렬

1) 기본값은 가까운 날짜순(오름차순): 남은 할 일 11/21 → 11/22(09:00) → 11/22(17:30)
   → 11/23 → 11/24 → 12/04 → 날짜 없음
2) 완료한 기록은 어느 방향에서도 목록 맨 아래에 최근 것부터(11/21 → 11/20 → 11/19)
3) 설정 → 프로젝트의 `할 일 날짜 정렬`을 먼 날짜순(내림차순)으로 바꾸면
   카드·서랍·우선순위 사분면이 바로 뒤집히고, 새로고침해도 그대로
4) 다시 가까운 날짜순으로 바꾸면 되돌아오고, 새로고침해도 유지
5) PC 1440×900 · 폰 402×874 모두에서 가로 넘침 없음

    BASE=http://127.0.0.1:3233 OUT=/workspace/work/wt-sort-shots python3 tests/project-date-order.py
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3233")
OUT = os.environ.get("OUT", "/workspace/work/wt-sort-shots")
CHROME = os.environ.get("CHROME", "/workspace/.browsers/chromium/chromium")
os.makedirs(OUT, exist_ok=True)
STAMP = "2026-11-01T00:00:00.000Z"

NEAR = ["o-21", "o-22a", "o-22b", "o-23", "o-24", "o-1204", "o-none"]
FAR = ["o-1204", "o-24", "o-23", "o-22a", "o-22b", "o-21", "o-none"]
DONE = ["d-21", "d-20", "d-19"]


def base(id, title, extra=None):
    d = {"id": id, "url": "", "title": title, "hidden": False, "trash": False, "favorite": False,
         "memo": "", "sort": None, "projectIds": [], "createdAt": STAMP, "updatedAt": STAMP}
    d.update(extra or {})
    return d


def task(id, title, extra=None):
    d = base(id, title)
    d.update({"kind": "할 일", "category": "개인", "status": "미완료", "date": None, "due": None,
              "startTime": None, "endTime": None, "doneAt": None, "checkedAt": None,
              "urgent": True, "important": True, "history": False, "waitFor": "", "waitNote": "",
              "cancelReason": "", "cancelAt": None, "repeatGroupId": ""})
    d.update(extra or {})
    return d


def fixture():
    projects = [
        task("pj-1", "온담 프로젝트", {"kind": "프로젝트", "category": "개인"}),
        task("pj-2", "성수 맛집", {"kind": "프로젝트", "category": "개인"}),
    ]
    tasks = [
        task("o-21", "오늘 할 일", {"date": "2026-11-21", "projectIds": ["pj-1"]}),
        task("o-22a", "11/22 아침", {"date": "2026-11-22", "startTime": "09:00", "projectIds": ["pj-1"]}),
        task("o-22b", "11/22 저녁", {"date": "2026-11-22", "startTime": "17:30", "projectIds": ["pj-1"]}),
        task("o-23", "11/23 일", {"date": "2026-11-23", "projectIds": ["pj-1"]}),
        task("o-24", "11/24 일", {"date": "2026-11-24", "projectIds": ["pj-1"]}),
        task("o-1204", "12/04 일", {"date": "2026-12-04", "projectIds": ["pj-1"]}),
        task("o-none", "날짜 없는 일", {"date": None, "projectIds": ["pj-1"]}),
        task("d-21", "완료 11/21", {"status": "완료", "date": "2026-11-21", "doneAt": "2026-11-21",
                                    "projectIds": ["pj-1"]}),
        task("d-20", "완료 11/20", {"status": "완료", "date": "2026-11-20", "doneAt": "2026-11-20",
                                    "projectIds": ["pj-1"]}),
        task("d-19", "완료 11/19", {"status": "완료", "date": "2026-11-19", "doneAt": "2026-11-19",
                                    "projectIds": ["pj-1"]}),
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
    # 카드·사분면에 모든 항목이 보이도록 표시 개수만 미리 맞춰 둡니다(정렬 설정은 비워
    # 두어 기본값이 가까운 날짜순인지 그대로 확인합니다).
    seed = json.dumps({"projectTaskPreview": 8, "priorityTaskPreview": 10})
    page.add_init_script(
        "try { if (!localStorage.getItem('my-diary:settings:v1')) localStorage.setItem('my-diary:settings:v1', %s); } catch (e) {}" % json.dumps(seed)
    )
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=40000)
    page.wait_for_timeout(1200)
    return ctx, page


def go_projects(page):
    page.locator("nav button", has_text="프로젝트").first.evaluate("el => el.click()")
    page.wait_for_timeout(700)


def card_order(page):
    return page.evaluate("""() => {
        const card = document.querySelector('[data-project-card="pj-1"]');
        if (!card) return null;
        const ul = card.querySelector('ul');
        return [...ul.querySelectorAll('li[data-task-id]')].map((li) => li.getAttribute('data-task-id'));
    }""")


def recent_order(page):
    return page.evaluate("""() => {
        const card = document.querySelector('[data-project-card="pj-1"]');
        const uls = [...card.querySelectorAll('ul')];
        const recent = uls[1];
        if (!recent) return [];
        return [...recent.querySelectorAll('li')].map((li) => (li.querySelector('button') || li).textContent.trim());
    }""")


def drawer_order(page):
    return page.evaluate("""() => {
        const rows = [...document.querySelectorAll('[data-task-row]')];
        return rows.map((row) => row.getAttribute('data-task-row'));
    }""")


def priority_order(page):
    return page.evaluate("""() => {
        const q = document.querySelector('[data-quadrant="do"]');
        if (!q) return null;
        return [...q.querySelectorAll('[data-priority-task]')].map((li) => li.getAttribute('data-priority-task'));
    }""")


def open_settings_projects(page):
    page.locator('button[aria-label="설정"]').first.evaluate("el => el.click()")
    page.wait_for_timeout(400)
    dialog = page.locator('[role="dialog"]', has_text="설정").first
    dialog.locator("button", has_text="프로젝트").first.click()
    page.wait_for_timeout(400)
    return dialog


def close_settings(page):
    page.locator('[role="dialog"] button[aria-label="닫기"]').last.click()
    page.wait_for_timeout(500)


def main():
    data = fixture()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

        for label, w, h, mobile in [("pc", 1440, 900, False), ("mobile", 402, 874, True)]:
            ctx, page = open_page(browser, w, h, data, mobile)
            go_projects(page)

            order = card_order(page)
            check(f"{label}: 기본 카드 순서 = 가까운 날짜순", order == NEAR, str(order))
            recent = recent_order(page)
            check(f"{label}: 최근 기록은 아래에 최근 것부터", recent == ["완료 11/21", "완료 11/20"], str(recent))
            text = page.locator('[data-project-card="pj-1"]').inner_text()
            check(f"{label}: 카드에 남은 할 일 7", "남은 할 일 7" in text, text)

            # 서랍 — 남은 할 일 먼저, 완료 기록은 맨 아래 최근 것부터
            page.locator('[data-project-card="pj-1"] header button').first.click()
            page.wait_for_timeout(700)
            dorder = drawer_order(page)
            check(f"{label}: 서랍 순서 = 남은 할 일 가까운 날짜순 + 완료 기록 최근순", dorder == NEAR + DONE, str(dorder))
            shot = os.path.join(OUT, f"{label}-drawer-near.png")
            page.screenshot(path=shot, full_page=False)
            print("shot", shot)
            page.locator('[role="dialog"] button[aria-label="닫기"]').last.click()
            page.wait_for_timeout(500)

            # 우선순위 사분면
            page.locator("button", has_text="우선순위").first.click()
            page.wait_for_timeout(700)
            porder = priority_order(page)
            check(f"{label}: 사분면 순서 = 가까운 날짜순", porder == NEAR, str(porder))
            page.locator("button", has_text="진행").first.click()
            page.wait_for_timeout(600)

            shot = os.path.join(OUT, f"{label}-card-near.png")
            page.screenshot(path=shot, full_page=True)
            print("shot", shot)

            # 설정에서 먼 날짜순(내림차순)으로
            dialog = open_settings_projects(page)
            region = dialog.locator('[data-project-task-order="true"]')
            near_btn = region.locator("button", has_text="가까운 날짜순")
            far_btn = region.locator("button", has_text="먼 날짜순")
            check(f"{label}: 설정 기본값이 가까운 날짜순", near_btn.get_attribute("aria-pressed") == "true",
                  str(near_btn.get_attribute("aria-pressed")))
            shot = os.path.join(OUT, f"{label}-settings-project-sort.png")
            dialog.screenshot(path=shot)
            print("shot", shot)
            far_btn.click()
            page.wait_for_timeout(400)
            check(f"{label}: 먼 날짜순 선택 표시", far_btn.get_attribute("aria-pressed") == "true")
            close_settings(page)

            order = card_order(page)
            check(f"{label}: 설정을 바꾸면 카드가 바로 먼 날짜순", order == FAR, str(order))
            check(f"{label}: 방향을 바꿔도 완료 기록은 아래 그대로",
                  recent_order(page) == ["완료 11/21", "완료 11/20"], str(recent_order(page)))
            page.locator("button", has_text="우선순위").first.click()
            page.wait_for_timeout(600)
            check(f"{label}: 사분면도 바로 먼 날짜순", priority_order(page) == FAR, str(priority_order(page)))
            page.locator("button", has_text="진행").first.click()
            page.wait_for_timeout(500)
            shot = os.path.join(OUT, f"{label}-card-far.png")
            page.screenshot(path=shot, full_page=True)
            print("shot", shot)

            # 새로고침해도 유지(설정 저장)
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("h1", timeout=40000)
            page.wait_for_timeout(1200)
            go_projects(page)
            check(f"{label}: 새로고침해도 먼 날짜순 유지", card_order(page) == FAR, str(card_order(page)))
            stored = page.evaluate("() => JSON.parse(localStorage.getItem('my-diary:settings:v1') || '{}').projectTaskOrder")
            check(f"{label}: 설정이 저장됨", stored == "far", str(stored))

            # 다시 가까운 날짜순으로 되돌리기
            dialog = open_settings_projects(page)
            dialog.locator('[data-project-task-order="true"] button', has_text="가까운 날짜순").click()
            page.wait_for_timeout(300)
            close_settings(page)
            check(f"{label}: 되돌리면 카드가 다시 가까운 날짜순", card_order(page) == NEAR, str(card_order(page)))
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("h1", timeout=40000)
            page.wait_for_timeout(1200)
            go_projects(page)
            check(f"{label}: 새로고침해도 가까운 날짜순 유지", card_order(page) == NEAR, str(card_order(page)))

            overflow = page.evaluate("() => ({doc: document.documentElement.scrollWidth, win: window.innerWidth})")
            check(f"{label}: 가로 넘침 없음", overflow["doc"] <= overflow["win"] + 1, json.dumps(overflow))

            ctx.close()

        browser.close()

    print(f"\n{len(PASSES)} passed, {len(FAILS)} failed")
    if FAILS:
        for f in FAILS:
            print(" -", f)
        sys.exit(1)


main()
