"""
A21 검증 — 연간 → 월간 → 주간 → 일간 계층 이동.

    PATH=/workspace/work/nodejs/node-v20.19.0-linux-x64/bin:$PATH \
    NEXT_DIST_DIR=.next-nav node node_modules/next/dist/bin/next start -p 3215 &
    BASE=http://127.0.0.1:3215 CHROME=/workspace/.browsers/chromium/chromium \
      python3 tests/calendar-nav.py

모든 /api 호출은 브라우저 안에서 가짜 응답으로 답합니다.
"""

import json
import os
import re
import sys
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3215")
CHROME = os.environ.get("CHROME")
OUT = os.environ.get("OUT", "/workspace/work/diary-shots")
os.makedirs(OUT, exist_ok=True)

TODAY = "2026-11-21"
WEEK_KEY = "2026-W47"
WEEK_START = "2026-11-16"

FAILS = []
PASSES = []


def check(name, condition, detail=""):
    if condition:
        PASSES.append(name)
        print(f"PASS  {name}")
    else:
        FAILS.append(f"{name} {detail}".strip())
        print(f"FAIL  {name} {detail}")


def launch_args():
    args = ["--no-sandbox", "--disable-dev-shm-usage"]
    return {"executable_path": CHROME, "args": args} if CHROME else {"args": args}


def stamp(day="2026-11-01"):
    return f"{day}T00:00:00.000Z"


def base(id_, title, **extra):
    item = dict(
        id=id_, url="", title=title, hidden=False, trash=False, favorite=False,
        memo="", sort=None, projectIds=[], createdAt=stamp(), updatedAt=stamp(),
    )
    item.update(extra)
    return item


def event(id_, title, date, **extra):
    item = base(id_, title, **extra)
    item.update(dict(kind="일정", category="개인", date=date, startTime=None, endDate=None,
                     endTime=None, allDay=True, done=False, canceled=False, cancelReason="",
                     cancelAt=None, weekKey="", baseDate=None))
    item.update(extra)
    return item


def task(id_, title, **extra):
    item = base(id_, title, **extra)
    item.update(dict(kind="할 일", category="개인", status="미완료", date=None, due=None,
                     doneAt=None, checkedAt=None, urgent=False, important=False, history=False,
                     waitFor="", waitNote="", cancelReason="", cancelAt=None, repeatGroupId=""))
    item.update(extra)
    return item


def build_fixture():
    calendar = [
        event("ev-1", "도서관 반납", TODAY, category="개인"),
        event("ev-2", "치과 예약", TODAY, startTime="14:00", endTime="15:00", allDay=False),
        event("ev-5", "성과 리뷰", "2026-11-19", startTime="10:00", endTime="11:00",
              allDay=False, category="성과"),
    ]
    projects = [
        task("pj-1", "브랜드 포트폴리오", kind="프로젝트", category="업무", date="2026-11-10",
             due="2026-11-30", memo="사례 3개 정리"),
        task("tk-1", "사례 1 정리", category="업무", date="2026-11-10", urgent=True,
             important=True, projectIds=["pj-1"]),
        task("tk-3", "사례 3 정리", category="업무", date="2026-11-18", projectIds=["pj-1"]),
        task("tk-9", "오늘 할 일", category="개인", date=TODAY),
    ]
    routines = [
        task("rt-1", "물 마시기", kind="루틴", category="개인", targetCount=4, execCount=0,
             repeatDays=["월", "화", "수", "목", "금", "토", "일"], amount=1, unit="컵",
             date=None, history=False, routineIds=[]),
    ]
    binder = []
    archive = []
    return dict(calendar=calendar, projects=projects, routines=routines, binder=binder, archive=archive)


class Mock:
    def __init__(self, data):
        self.data = data
        self.calls = []

    def handle(self, route, request):
        path = urllib.parse.urlparse(request.url).path
        if path == "/api/status":
            return route.fulfill(json={
                "ok": True, "needsToken": False, "authRequired": False, "authenticated": True,
                "dbs": {k: {"label": k, "envKey": f"NOTION_{k.upper()}_DB_ID", "configured": True,
                            "ok": True, "message": "연결됨"} for k in self.data},
            })
        if path == "/api/notion/all":
            return route.fulfill(json={"ok": True, "data": self.data, "errors": {}})
        if path.endswith("/schema"):
            return route.fulfill(json={"ok": True, "data": []})
        if path.endswith("/blocks"):
            return route.fulfill(json={"ok": True, "data": {"text": "", "preserved": []}})
        if request.method in ("POST", "PATCH", "DELETE"):
            self.calls.append((request.method, path))
            if request.method == "DELETE":
                return route.fulfill(json={"ok": True, "deleted": True})
            body = json.loads(request.post_data or "{}")
            m = re.match(r"^/api/notion/[a-z]+/([^/]+)$", path)
            if m and request.method == "PATCH":
                for items in self.data.values():
                    for item in items:
                        if item["id"] == m.group(1):
                            item.update(body)
                            return route.fulfill(json={"ok": True, "data": item})
                return route.fulfill(json={"ok": True, "data": {}})
            new = dict(base("new-1", body.get("title", "새 항목")), **body)
            return route.fulfill(json={"ok": True, "data": new})
        return route.fulfill(json={"ok": True, "data": None})


def open_app(browser, width, height, mock):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR")
    page = ctx.new_page()
    page.set_default_timeout(8000)
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=20000)
    page.wait_for_timeout(900)
    return ctx, page


def go(page, label):
    page.get_by_role("button", name=label, exact=True).first.click()
    page.wait_for_timeout(500)


def h1(page):
    return page.locator("h1").first.inner_text().strip()


def active_view(page):
    return page.locator(".seg-item-active").first.inner_text().strip()


def main():
    mock = Mock(build_fixture())
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())

        # ── PC ────────────────────────────────────────────────────────────────
        ctx, page = open_app(browser, 1440, 900, mock)

        # 1) 연간 → 월간 (월 이름 클릭)
        go(page, "연간")
        page.screenshot(path=f"{OUT}/nav-pc-year.png")
        month_link = page.locator('[data-year-month="2026-03"]').first
        check("연간: 3월 이름이 버튼", month_link.count() == 1)
        month_link.click()
        page.wait_for_timeout(600)
        check("연간 3월 클릭 → 월간 보기", active_view(page) == "월간", active_view(page))
        check("연간 3월 클릭 → 3월 제목", h1(page) == "3월", h1(page))
        page.screenshot(path=f"{OUT}/nav-pc-year-to-month.png")

        # 2) 연간 날짜 클릭은 그대로 일간
        go(page, "연간")
        page.wait_for_timeout(400)
        page.locator("button[title^='2026-11-21']").first.click()
        page.wait_for_timeout(600)
        check("연간 날짜 클릭 → 일간 보기", active_view(page) == "일간", active_view(page))

        # 3) 월간 → 주간 (주 줄 빈 공간 클릭 + hover 하이라이트)
        go(page, "월간")
        page.wait_for_timeout(400)
        row = page.locator('[data-month-row="2026-11-16"]').first
        check("월간: 주 줄이 표시됨", row.count() == 1)
        before = row.evaluate("el => getComputedStyle(el).backgroundColor")
        row.hover()
        page.wait_for_timeout(350)
        after = row.evaluate("el => getComputedStyle(el).backgroundColor")
        badge = page.locator('[data-week-link-wide="2026-11-16"]').first
        check("주 줄 hover 시 배경 하이라이트", before != after, f"{before} → {after}")
        check("주 줄 hover 시 '이 주 보기' 뱃지 보임",
              badge.evaluate("el => parseFloat(getComputedStyle(el).opacity)") > 0.9,
              badge.evaluate("el => getComputedStyle(el).opacity"))
        page.screenshot(path=f"{OUT}/nav-pc-month-row-hover.png")

        # 줄 빈 공간 클릭 (일정 없는 칸의 아래쪽)
        cell = page.locator('[data-month-cell="2026-11-17"]').first
        box = cell.bounding_box()
        page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] - 10)
        page.wait_for_timeout(700)
        check("주 줄 클릭 → 주간 보기", active_view(page) == "주간", active_view(page))
        check("주 줄 클릭 → 그 주 제목", h1(page).startswith("11월 16일"), h1(page))
        page.screenshot(path=f"{OUT}/nav-pc-month-to-week.png")

        # 뱃지 버튼으로도 이동 (다른 주)
        go(page, "월간")
        page.wait_for_timeout(400)
        page.locator('[data-week-link-wide="2026-11-02"]').first.click(force=True)
        page.wait_for_timeout(700)
        check("'이 주 보기' 뱃지 → 주간 보기", active_view(page) == "주간", active_view(page))
        check("뱃지 → 11월 2일 주", h1(page).startswith("11월 2일") or h1(page).startswith("11월 1일"), h1(page))

        # 4) 월간 → 일간 (날짜 숫자 클릭)
        go(page, "월간")
        page.wait_for_timeout(400)
        page.locator('[data-day-num="2026-11-21"]').first.click()
        page.wait_for_timeout(700)
        check("월간 날짜 숫자 클릭 → 일간 보기", active_view(page) == "일간", active_view(page))
        check("월간 날짜 숫자 클릭 → 11월 21일", "11월 21일" in h1(page), h1(page))
        page.screenshot(path=f"{OUT}/nav-pc-month-to-day.png")

        # 5) 월간 일정 칩은 그대로 상세를 연다 (보기 이동 없음)
        go(page, "월간")
        page.wait_for_timeout(400)
        page.locator('[data-month-item="ev-1"]').first.click()
        page.wait_for_timeout(700)
        dialog = page.get_by_role("dialog").first
        check("월간 일정 칩 클릭 → 상세 열림", dialog.count() > 0 and dialog.is_visible(), str(dialog.count()))
        check("칩 클릭 뒤에도 월간 보기 유지", active_view(page) == "월간", active_view(page))
        if dialog.count():
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
            if page.get_by_role("button", name="닫기").count():
                page.get_by_role("button", name="닫기").first.click()
                page.wait_for_timeout(400)

        # 6) 주간 → 일간 (요일 헤더 클릭 + hover 표시)
        go(page, "주간")
        page.wait_for_timeout(600)
        head = page.locator('[data-week-day-head="2026-11-18"]').first
        check("주간: 요일 헤더가 버튼", head.count() == 1)
        date_span = head.locator("span").nth(1)
        before_head = date_span.evaluate("el => getComputedStyle(el).backgroundColor")
        head.hover()
        page.wait_for_timeout(350)
        after_head = date_span.evaluate("el => getComputedStyle(el).backgroundColor")
        check("주간 헤더 hover 시 날짜 강조", before_head != after_head, f"{before_head} → {after_head}")
        page.screenshot(path=f"{OUT}/nav-pc-week-head-hover.png")
        head.click()
        page.wait_for_timeout(700)
        # A32: 요일 머리글은 이제 그 날의 정리 목록을 먼저 열고, 일간 보기는 그 안의 버튼으로 갑니다.
        check("주간 헤더 클릭 → 그 날 정리 목록", page.locator("[data-day-list]").count() == 1, "")
        page.screenshot(path=f"{OUT}/nav-pc-week-to-day.png")
        page.get_by_role("button", name="이 날짜로 이동").first.click()
        page.wait_for_timeout(700)
        check("정리 목록의 '이 날짜로 이동' → 일간 보기", active_view(page) == "일간", active_view(page))
        check("주간 헤더 → 11월 18일 일간", "11월 18일" in h1(page), h1(page))

        ctx.close()

        # ── 모바일 ────────────────────────────────────────────────────────────
        mock2 = Mock(build_fixture())
        ctx, page = open_app(browser, 390, 844, mock2)
        go(page, "월간")
        page.wait_for_timeout(600)
        page.screenshot(path=f"{OUT}/nav-mobile-month.png")
        badge = page.locator('[data-week-link="2026-11-16"]').first
        check("모바일: 주 줄 '주' 버튼 항상 보임",
              badge.count() == 1 and badge.evaluate("el => parseFloat(getComputedStyle(el).opacity)") > 0.9,
              badge.evaluate("el => getComputedStyle(el).opacity") if badge.count() else "none")
        badge.click()
        page.wait_for_timeout(700)
        check("모바일 주 버튼 → 주간 보기", active_view(page) == "주간", active_view(page))
        page.screenshot(path=f"{OUT}/nav-mobile-week.png")

        go(page, "월간")
        page.wait_for_timeout(600)
        page.locator('[data-day-num="2026-11-19"]').first.click()
        page.wait_for_timeout(700)
        check("모바일 날짜 숫자 → 일간 보기", active_view(page) == "일간", active_view(page))
        check("모바일 날짜 숫자 → 11월 19일", "11월 19일" in h1(page), h1(page))
        page.screenshot(path=f"{OUT}/nav-mobile-day.png")
        ctx.close()

        browser.close()

    print()
    print(f"PASSED {len(PASSES)} / FAILED {len(FAILS)}")
    for item in FAILS:
        print("  ✗", item)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
