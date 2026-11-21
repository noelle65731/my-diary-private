"""
A29 검증 — 주간 캘린더 오른쪽 패널

1) `이번 주 꼭`: 엔터로 더한 항목이 목록에서 사라지지 않고 계속 쌓인다(11개), 8개 제한 없음
   · 저장 응답(favorite)이 돌아온 뒤에도 남는다 · 새로고침 뒤에도 그대로
2) 다른 주를 보고 더하면 그 주에 쌓인다(이번 주 목록에는 들어오지 않는다)
3) `이번 주 목표`: 목표 줄에서 바로 삭제(휴지통) · 제목 인라인 수정 · 새로고침 뒤에도 유지
   · 삭제·상세 버튼은 PC 에서 줄에 마우스를 올리면 보이고, 폰에서는 늘 보인다

    BASE=http://127.0.0.1:3215 OUT=/workspace/work/wk-fav-shots python3 tests/week-favorite-goals.py

모크 API 는 실제 서버 동작을 따라합니다: 사용자의 `프로젝트 · 할 일` DB 에는 `즐겨찾기`
속성이 없으므로, 저장된 할 일의 이번 주 꼭 표시는 `긴급`·`중요` 로만 돌아옵니다.
"""

import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3215")
OUT = os.environ.get("OUT", "/workspace/work/wk-fav-shots")
CHROME = os.environ.get("CHROME", "/workspace/.browsers/chromium/chromium")
os.makedirs(OUT, exist_ok=True)

TODAY = "2026-11-21"
WEEK_START = "2026-11-16"   # 이번 주 (월)
WEEK_KEY = "2026-W47"
NEXT_WEEK_START = "2026-11-23"

FAILS = []
PASSES = []


def check(name, condition, detail=""):
    if condition:
        PASSES.append(name)
        print(f"PASS  {name}")
    else:
        FAILS.append(f"{name} {detail}".strip())
        print(f"FAIL  {name} {detail}")


def stamp(day="2026-11-01"):
    return f"{day}T00:00:00.000Z"


def base_item(id_, title, **extra):
    item = dict(
        id=id_, url="", title=title, hidden=False, trash=False, favorite=False,
        memo="", sort=None, projectIds=[], createdAt=stamp(), updatedAt=stamp(),
    )
    item.update(extra)
    return item


def event(id_, title, date, **extra):
    item = base_item(id_, title, **extra)
    item.update(dict(kind="일정", category="개인", date=date, startTime=None, endDate=None,
                     endTime=None, allDay=True, done=False, canceled=False, cancelReason="",
                     cancelAt=None, weekKey="", baseDate=None))
    item.update(extra)
    return item


def task(id_, title, **extra):
    item = base_item(id_, title, **extra)
    item.update(dict(kind="할 일", category="개인", status="미완료", date=None, due=None,
                     doneAt=None, checkedAt=None, urgent=False, important=False, history=False,
                     waitFor="", waitNote="", cancelReason="", cancelAt=None, repeatGroupId=""))
    item.update(extra)
    return item


def fixture():
    calendar = [
        event("ev-1", "주간 회의", WEEK_START, startTime="09:30", endTime="10:30", allDay=False),
        event("ev-2", "치과", TODAY, startTime="14:00", endTime="15:00", allDay=False),
        event("goal-1", "포트폴리오 사례 2장 정리", WEEK_START, kind="주간 목표",
              weekKey=WEEK_KEY, baseDate=WEEK_START),
        event("goal-2", "주 3회 걷기", WEEK_START, kind="주간 목표", done=True,
              weekKey=WEEK_KEY, baseDate=WEEK_START),
        event("memo-1", "2026년 11월 21일 주간 메모", WEEK_START, kind="주간 메모",
              weekKey=WEEK_KEY, baseDate=WEEK_START, memo="마감이 몰린 주."),
    ]
    projects = [
        task("tk-1", "약국 들르기", date=TODAY, favorite=True, urgent=True, important=True),
        task("tk-2", "와이어프레임", date=TODAY),
        task("tk-3", "사례 정리", date="2026-11-18", favorite=True, urgent=True, important=True),
    ]
    return dict(calendar=calendar, projects=projects, routines=[], binder=[], archive=[])


class Mock:
    """실제 라우트처럼: projects 에는 즐겨찾기 속성이 없으므로 favorite 는 긴급·중요로만 남습니다."""

    def __init__(self, data):
        self.data = data
        self.calls = []
        self.seq = 0

    def handle(self, route, request):
        url = urllib.parse.urlparse(request.url)
        path = url.path
        method = request.method
        if path == "/api/status":
            return route.fulfill(json={
                "ok": True, "needsToken": False, "authRequired": False, "authenticated": True,
                "dbs": {k: {"label": k, "envKey": f"NOTION_{k.upper()}_DB_ID", "configured": True,
                            "ok": True, "message": "연결됨"} for k in self.data},
            })
        if path == "/api/notion/all":
            return route.fulfill(json={"ok": True, "data": self.data, "errors": {}})
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)$", path)
        resource = m.group(1) if m else None
        if resource and path.endswith("/schema"):
            return route.fulfill(json={"ok": True, "data": []})
        if resource and path.endswith("/blocks"):
            return route.fulfill(json={"ok": True, "data": {"text": "", "preserved": []}})
        if path == "/api/upload":
            return route.fulfill(json={"ok": True, "data": {"token": "upload:up-1", "id": "up-1", "name": "photo.jpg"}})
        if resource and method == "POST":
            body = json.loads(request.post_data or "{}")
            self.calls.append(("POST", resource, body))
            self.seq += 1
            body = dict(body)
            body.pop("favorite", None)          # 이 DB 에는 즐겨찾기 속성이 없습니다
            new = dict(base_item(f"new-{self.seq}", body.get("title", "새 항목")), **body)
            new["id"] = f"new-{self.seq}"
            new["favorite"] = bool(body.get("urgent") and body.get("important"))
            now = datetime.now(timezone.utc).isoformat()
            new["createdAt"] = now
            new["updatedAt"] = now
            self.data[resource].append(new)
            return route.fulfill(json={"ok": True, "data": new})
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)/([^/]+)$", path)
        if m and method == "PATCH":
            res, item_id = m.group(1), m.group(2)
            body = json.loads(request.post_data or "{}")
            self.calls.append(("PATCH", res, item_id, body))
            current = next((it for it in self.data[res] if it["id"] == item_id), None)
            body = dict(body)
            body.pop("expectedUpdatedAt", None)
            if current:
                if res == "projects":       # 실제 서버 매핑과 같게
                    body.pop("favorite", None)
                current.update(body)
                if res == "projects":
                    current["favorite"] = bool(current.get("urgent") and current.get("important"))
            return route.fulfill(json={"ok": True, "data": current or {}})
        if m and method == "DELETE":
            return route.fulfill(json={"ok": True, "deleted": True})
        return route.fulfill(json={"ok": True, "data": None})


def open_app(browser, width, height, mock):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR")
    page = ctx.new_page()
    page.set_default_timeout(8000)
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=20000)
    page.wait_for_timeout(1200)
    return ctx, page


def aside(page):
    return page.locator("aside").first


def visible_section(page, heading):
    """PC 오른쪽 패널과 폰 접이식 패널 중 지금 화면에 보이는 쪽."""
    return page.locator("section:visible").filter(has=page.locator("h3", has_text=heading)).last


def favorites_section(page):
    return visible_section(page, "이번 주 꼭")


def goals_section(page):
    return visible_section(page, "이번 주 목표")


def favorite_titles(page):
    rows = page.locator("[data-week-favorites] li:visible")
    return [rows.nth(i).inner_text().strip() for i in range(rows.count())]


def main():
    data = fixture()
    mock = Mock(data)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

        # ───────────── PC ─────────────
        ctx, page = open_app(browser, 1440, 900, mock)

        check("주간 보기 오른쪽 패널이 있다", aside(page).locator("h3", has_text="이번 주 꼭").count() == 1)

        before = favorite_titles(page)
        check("처음 목록: 저장된 이번 주 꼭 2개", len(before) == 2, before)

        # 1) 엔터로 10개 쌓기
        titles = ["병원 예약", "전기요금 내기", "엄마 생신 선물", "치과 예약", "김장 재료 사기",
                  "은행 방문", "차 검사 예약", "책 반납", "세탁 맡기기", "이사 견적"]
        field = favorites_section(page).locator('input[placeholder="+ 이번 주 꼭 (Enter)"]')
        field.click()
        counts = []
        for index, title in enumerate(titles, start=1):
            field.fill(title)
            field.press("Enter")
            page.wait_for_timeout(120)
            listed = page.locator("[data-week-favorites] li:visible", has_text=title)
            listed.first.wait_for(state="visible", timeout=4000)
            counts.append(page.locator("[data-week-favorites] li:visible").count())
        check("엔터마다 목록이 1개씩 늘어난다(사라지지 않음)", counts == list(range(3, 3 + len(titles))), counts)
        check("입력창은 엔터 뒤 비워진다", field.input_value() == "")

        after = favorite_titles(page)
        check("더한 10개가 모두 목록에 있다", all(any(title in row for row in after) for title in titles), after)
        check("8개 제한이 없다 — 12개 모두 DOM 에 있다", len(after) == 12, len(after))
        box = page.locator("[data-week-favorites]:visible").evaluate(
            "(el) => ({ h: el.clientHeight, scroll: el.scrollHeight, overflow: getComputedStyle(el).overflowY })"
        )
        check("목록은 패널 높이를 지키고 안에서 스크롤된다", box["scroll"] > box["h"] and box["overflow"] == "auto", box)
        page.screenshot(path=f"{OUT}/pc-favorites-12.png", full_page=True)

        posts = [c for c in mock.calls if c[0] == "POST" and c[1] == "projects"]
        check("저장 요청 10건", len(posts) == 10, len(posts))
        check("이번 주에 더하면 오늘 날짜로 저장", all(p[2].get("date") == TODAY for p in posts),
              [p[2].get("date") for p in posts])
        check("저장 요청에 긴급·중요가 켜져 있다(이번 주 꼭 표시)",
              all(p[2].get("urgent") and p[2].get("important") for p in posts))

        # 2) 새로고침 뒤에도 그대로
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("h1", timeout=20000)
        page.wait_for_timeout(1500)
        reloaded = favorite_titles(page)
        check("새로고침 뒤에도 12개가 그대로", len(reloaded) == 12, reloaded)
        check("새로고침 뒤에도 제목이 모두 남아 있다",
              all(any(title in row for row in reloaded) for title in titles), reloaded)
        page.screenshot(path=f"{OUT}/pc-favorites-reload.png", full_page=True)

        # 3) 다른 주(다음 주)를 보고 더하면 그 주에 쌓인다
        page.locator('button[aria-label="다음"]').click()
        page.wait_for_timeout(800)
        next_field = favorites_section(page).locator('input[placeholder="+ 이번 주 꼭 (Enter)"]')
        next_field.click()
        next_field.fill("다음 주 준비")
        next_field.press("Enter")
        page.wait_for_timeout(600)
        next_titles = favorite_titles(page)
        check("다음 주에 더한 항목이 다음 주 목록에 보인다", any("다음 주 준비" in row for row in next_titles), next_titles)
        check("이번 주 항목은 다음 주 목록에 없다", not favorite_titles(page).count("병원 예약"), next_titles)
        next_post = [c for c in mock.calls if c[0] == "POST" and c[1] == "projects"][-1][2]
        check("다른 주에 더하면 그 주 월요일 날짜로 저장", next_post.get("date") == NEXT_WEEK_START, next_post.get("date"))
        page.screenshot(path=f"{OUT}/pc-next-week.png", full_page=True)

        page.locator('button[aria-label="이전"]').click()
        page.wait_for_timeout(800)
        back_titles = favorite_titles(page)
        check("이번 주로 돌아오면 다음 주 항목은 빠지고 이번 주 12개가 그대로",
              len(back_titles) == 12 and not any("다음 주 준비" in row for row in back_titles), back_titles)

        # 4) 이번 주 목표 — 삭제 버튼 표시(호버)
        goals = goals_section(page)
        delete_button = goals.locator('button[aria-label="주 3회 걷기 삭제"]')
        check("목표 줄에 삭제 버튼이 있다", delete_button.count() == 1)
        check("PC 에서는 마우스를 올리기 전 삭제 버튼이 숨겨져 있다", delete_button.evaluate("(el) => getComputedStyle(el).opacity") == "0")
        goals.locator("li", has_text="주 3회 걷기").hover()
        page.wait_for_timeout(300)
        check("줄에 마우스를 올리면 삭제 버튼이 보인다", delete_button.evaluate("(el) => getComputedStyle(el).opacity") == "1")
        check("목표 줄에 상세 열기 버튼도 있다", goals.locator('button[aria-label="주 3회 걷기 상세 열기"]').count() == 1)
        page.screenshot(path=f"{OUT}/pc-goal-hover.png")

        # 5) 목표 추가 → 제목 수정 → 새로고침 유지
        goal_field = goals.locator('input[placeholder="+ 목표 추가 (Enter)"]')
        goal_field.click()
        goal_field.fill("새 목표")
        goal_field.press("Enter")
        goals.locator("li", has_text="새 목표").first.wait_for(state="visible", timeout=4000)
        check("엔터로 목표가 추가된다", goals.locator("li", has_text="새 목표").count() == 1)

        goals.locator('button[aria-label="목표 고치기"]', has_text="새 목표").click()
        edit_input = goals.locator('input[aria-label="목표 고치기"]')
        edit_input.fill("고친 목표")
        edit_input.press("Enter")
        page.wait_for_timeout(600)
        check("목표 제목을 그 자리에서 고칠 수 있다", goals.locator("li", has_text="고친 목표").count() == 1)
        title_patch = [c for c in mock.calls if c[0] == "PATCH" and c[1] == "calendar" and c[3].get("title") == "고친 목표"]
        check("고친 제목이 저장된다", len(title_patch) == 1, title_patch)

        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("h1", timeout=20000)
        page.wait_for_timeout(1500)
        goals = goals_section(page)
        check("새로고침 뒤에도 고친 제목이 남아 있다", goals.locator("li", has_text="고친 목표").count() == 1)
        check("고친 제목 뒤에 옛 제목이 남지 않는다", goals.locator("li", has_text="새 목표").count() == 0)

        # 6) 목표 삭제 → 사라짐 → 새로고침 유지
        goals.locator("li", has_text="고친 목표").hover()
        goals.locator('button[aria-label="고친 목표 삭제"]').click()
        page.wait_for_timeout(800)
        check("삭제 버튼을 누르면 목표가 목록에서 사라진다", goals.locator("li", has_text="고친 목표").count() == 0)
        trash_patch = [c for c in mock.calls if c[0] == "PATCH" and c[1] == "calendar" and c[3].get("trash") is True]
        check("삭제는 휴지통으로 보낸다(복원 가능)", len(trash_patch) >= 1, trash_patch)
        page.screenshot(path=f"{OUT}/pc-goal-deleted.png", full_page=True)

        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("h1", timeout=20000)
        page.wait_for_timeout(1500)
        goals = goals_section(page)
        check("새로고침 뒤에도 삭제한 목표는 없다", goals.locator("li", has_text="고친 목표").count() == 0)
        check("다른 목표는 그대로 있다", goals.locator("li", has_text="포트폴리오 사례 2장 정리").count() == 1)

        # 7) 가로 넘침 없음
        overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("PC 가로 넘침 없음", overflow <= 0, overflow)
        page.screenshot(path=f"{OUT}/pc-final.png", full_page=True)
        ctx.close()

        # ───────────── 폰 ─────────────
        data2 = fixture()
        mock2 = Mock(data2)
        ctx2, page2 = open_app(browser, 402, 874, mock2)
        page2.locator("button", has_text="이번 주 꼭 · 목표 · 메모").click()
        page2.wait_for_timeout(500)
        goal_delete = goals_section(page2).locator('button[aria-label="주 3회 걷기 삭제"]')
        check("폰에서 목표 삭제 버튼이 늘 보인다", goal_delete.evaluate("(el) => getComputedStyle(el).opacity") == "1")

        mobile_field = favorites_section(page2).locator('input[placeholder="+ 이번 주 꼭 (Enter)"]')
        mobile_field.click()
        for title in ["폰에서 하나", "폰에서 둘"]:
            mobile_field.fill(title)
            mobile_field.press("Enter")
            page2.wait_for_timeout(250)
        mobile_titles = favorite_titles(page2)
        check("폰에서도 엔터로 쌓인다", len(mobile_titles) == 4, mobile_titles)

        goal_delete.click()
        page2.wait_for_timeout(700)
        goals2 = goals_section(page2)
        check("폰에서도 삭제가 된다", goals2.locator("li", has_text="주 3회 걷기").count() == 0)
        overflow2 = page2.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("폰 가로 넘침 없음", overflow2 <= 0, overflow2)
        page2.screenshot(path=f"{OUT}/mobile-panel.png", full_page=True)
        ctx2.close()
        browser.close()

    print(f"\n{len(PASSES)} PASS · {len(FAILS)} FAIL")
    if FAILS:
        for fail in FAILS:
            print(" -", fail)
        sys.exit(1)


if __name__ == "__main__":
    main()
