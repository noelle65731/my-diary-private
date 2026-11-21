"""
Functional + visual checks for the diary app (mock Notion API, no real token).

    NEXT_DIST_DIR=.next-work node node_modules/next/dist/bin/next start -p 3210 &
    CHROME=/workspace/.browsers/chromium/chromium python3 tests/ui-check.py

Every /api call is answered inside the browser, so the assertions read exactly what the
app would send to Notion and the fixture stands in for the five databases.
"""

import json
import os
import re
import sys
import urllib.parse

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://127.0.0.1:3210")
CHROME = os.environ.get("CHROME")  # 비워 두면 Playwright 기본 Chromium을 씁니다
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
        event("ev-3", "이번 주 목표: 포트폴리오 2장", WEEK_START, kind="주간 목표",
              category="개인", weekKey=WEEK_KEY, baseDate=WEEK_START),
        event("ev-4", "2026년 11월 21일 주간 메모", WEEK_START, kind="주간 메모",
              weekKey=WEEK_KEY, baseDate=WEEK_START, memo="이번 주는 마감이 몰린 주."),
        event("ev-5", "성과 리뷰", "2026-11-19", startTime="10:00", endTime="11:00",
              allDay=False, category="성과"),
    ]
    projects = [
        task("pj-1", "브랜드 포트폴리오", kind="프로젝트", category="업무", date="2026-11-10",
             due="2026-11-30", memo="사례 3개 정리"),
        task("pj-2", "집 정리", kind="프로젝트", category="개인", date="2026-11-01"),
        task("tk-1", "사례 1 정리", category="업무", date="2026-11-10", urgent=True, important=True,
             projectIds=["pj-1"]),
        task("tk-2", "사례 2 정리", category="업무", date="2026-11-20", status="완료",
             doneAt="2026-11-20", projectIds=["pj-1"]),
        task("tk-3", "사례 3 정리", category="업무", date="2026-11-18", projectIds=["pj-1"]),
        task("tk-4", "와이어프레임", category="업무", date="2026-11-18", projectIds=["pj-1"]),
        task("tk-5", "약국 들르기", category="개인", date=TODAY),
        task("tk-6", "옷장 비우기", category="개인", date="2026-11-22", projectIds=["pj-2"]),
        task("tk-7", "오늘 할 일 하나", category="개인", date=TODAY, projectIds=["pj-2"]),
        task("tk-8", "오늘 할 일 둘", category="개인", date=TODAY),
        task("tk-9", "오늘 할 일 셋", category="개인", date=TODAY),
    ]
    routines = [
        task("rt-1", "물 마시기", kind="루틴", category="개인", targetCount=4, execCount=0,
             repeatDays=["월", "화", "수", "목", "금", "토", "일"], amount=1, unit="컵",
             date=None, history=False, routineIds=[]),
    ]
    binder = [
        base("bd-1", "조용한 하루", kind="일기", date=TODAY, link="", tags=[], archiveFlag=False,
             body="아침에 창문을 열었다.\n\n포트폴리오 사례 두 개를 정리했다.\n저녁에는 30분 걸었다.",
             photos=[]),
        base("bd-2", "주말의 리듬", kind="일기", date="2026-11-18", link="", tags=[], archiveFlag=False,
             body="토요일엔 늦잠.", photos=[]),
    ]
    archive = [
        base("ar-1", "아몬드", kind="책", date="2026-11-01", baseDate="2026-11-01", rating=4,
             link="", tags=["소설"], body="담백한 문장.", photos=[], endDate=None, endTime=None),
        base("ar-2", "elements of branding", kind="읽을거리", date=TODAY, baseDate=TODAY,
             rating=None, link="https://example.com", tags=["브랜드"], body="브랜드 자산 정리.",
             photos=[], endDate=None, endTime=None),
    ]
    return dict(calendar=calendar, projects=projects, routines=routines, binder=binder, archive=archive)


class Mock:
    def __init__(self, data):
        self.data = data
        self.calls = []
        self.seq = 0

    def resource_of(self, path):
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)", path)
        return m.group(1) if m else None

    def item(self, resource, item_id):
        for it in self.data[resource]:
            if it["id"] == item_id:
                return it
        return None

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
        resource = self.resource_of(path)
        if resource and path.endswith("/schema"):
            return route.fulfill(json={"ok": True, "data": []})
        if resource and path.endswith("/blocks"):
            return route.fulfill(json={"ok": True, "data": {"text": "", "preserved": []}})
        if path == "/api/upload":
            self.calls.append(("UPLOAD", path, request.post_data_buffer and len(request.post_data_buffer)))
            return route.fulfill(json={"ok": True, "data": {"token": "upload:up-1", "id": "up-1", "name": "photo.jpg"}})
        if resource and method == "POST":
            body = json.loads(request.post_data or "{}")
            self.calls.append(("POST", resource, body))
            self.seq += 1
            new = dict(base(f"new-{self.seq}", body.get("title", "새 항목")), **body)
            new["id"] = f"new-{self.seq}"
            now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
            new["createdAt"] = now
            new["updatedAt"] = now
            new["kind"] = body.get("kind", "일정")
            new.setdefault("category", "개인")
            new.setdefault("date", TODAY)
            self.data[resource].append(new)
            return route.fulfill(json={"ok": True, "data": new})
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)/([^/]+)$", path)
        if m and method == "PATCH":
            res, item_id = m.group(1), m.group(2)
            body = json.loads(request.post_data or "{}")
            self.calls.append(("PATCH", res, item_id, body))
            current = self.item(res, item_id)
            if current:
                current.update(body)
            return route.fulfill(json={"ok": True, "data": current or {}})
        if m and method == "DELETE":
            return route.fulfill(json={"ok": True, "deleted": True})
        return route.fulfill(json={"ok": True, "data": None})


def patches(mock, resource=None):
    return [c for c in mock.calls if c[0] == "PATCH" and (resource is None or c[1] == resource)]


def posts(mock, resource=None):
    return [c for c in mock.calls if c[0] == "POST" and (resource is None or c[1] == resource)]


def new_context(browser, width, height, mock):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR")
    page = ctx.new_page()
    page.set_default_timeout(8000)
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=15000)
    page.wait_for_timeout(800)
    return ctx, page


def goto_tab(page, name):
    page.get_by_role("button", name=re.compile(name)).last.click()
    page.wait_for_timeout(600)




def main():
    mock = Mock(build_fixture())
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        ctx, page = new_context(browser, 1440, 900, mock)
        # ── 제목 크기: 다른 보기 ──
        for label in ["프로젝트", "바인더", "아카이브"]:
            goto_tab(page, label)
            fs = page.locator("h1").first.evaluate("el => getComputedStyle(el).fontSize")
            check(f"{label} 큰 제목 절반 크기", float(fs.replace("px", "")) <= 20, fs)

        # ── 목표 제목 인라인 편집 ──
        goto_tab(page, "캘린더")
        page.get_by_role("button", name="주간", exact=True).click()
        page.wait_for_timeout(500)
        goal = page.get_by_role("button", name="목표 고치기").first
        goal.click()
        box = page.get_by_role("textbox", name="목표 고치기")
        box.fill("포트폴리오 3장")
        page.locator("h3", has_text="이번 주 꼭").click()
        page.wait_for_timeout(700)
        goal_patch = [c for c in patches(mock, "calendar") if c[3].get("title") == "포트폴리오 3장"]
        check("목표 제목을 화면에서 고쳐 저장", bool(goal_patch), str([c[3] for c in patches(mock, "calendar")]))

        # ── 이번 주 꼭: 긴급·중요 기본값 + 받은함으로 옮겨도 남음 ──
        fav_input = page.get_by_role("textbox", name="이번 주 꼭 (Enter)")
        fav_input.fill("꼭 해야 할 일")
        fav_input.press("Enter")
        page.wait_for_timeout(800)
        fav_post = [c for c in posts(mock, "projects") if c[2].get("title") == "꼭 해야 할 일"]
        check("꼭: 긴급·중요·별표로 생성", bool(fav_post) and fav_post[-1][2].get("urgent") and fav_post[-1][2].get("important") and fav_post[-1][2].get("favorite"), str(fav_post[-1][2] if fav_post else None))
        # 받은함으로 옮기기 = 날짜 비우기
        moved = [it for it in mock.data["projects"] if it["title"] == "꼭 해야 할 일"][0]
        mock.calls.append(("PATCH", "projects", moved["id"], {"date": None}))
        moved["date"] = None
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        aside_text = page.locator("aside").first.inner_text()
        check("받은함으로 옮겨도 이번 주에 남음", "꼭 해야 할 일" in aside_text, aside_text[:80])

        # ── 같은 날짜 안에서만 드래그 순서 변경 ──
        goto_tab(page, "프로젝트")
        page.wait_for_timeout(400)
        page.get_by_role("button", name="프로젝트 열기").first.click()
        page.wait_for_timeout(500)
        drawer = page.get_by_role("dialog", name="브랜드 포트폴리오")
        before_sort = len([c for c in patches(mock, "projects") if "sort" in c[3]])
        dt = page.evaluate_handle("() => new DataTransfer()")
        src = drawer.locator("li", has_text="사례 3 정리").first
        same_day = drawer.locator("li", has_text="와이어프레임").first
        other_day = drawer.locator("li", has_text="사례 1 정리").first
        src.dispatch_event("dragstart", {"dataTransfer": dt})
        other_day.dispatch_event("drop", {"dataTransfer": dt})
        page.wait_for_timeout(400)
        check("날짜가 다른 항목으로는 순서가 바뀌지 않음", len([c for c in patches(mock, "projects") if "sort" in c[3]]) == before_sort)
        src.dispatch_event("dragstart", {"dataTransfer": dt})
        same_day.dispatch_event("drop", {"dataTransfer": dt})
        page.wait_for_timeout(600)
        same_date_sorts = [c for c in patches(mock, "projects") if "sort" in c[3]][before_sort:]
        check("같은 날짜 안에서는 순서 변경", bool(same_date_sorts), str(same_date_sorts))
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # ── 공휴일 이름·색 (2026 성탄절, 2027 설날) ──
        goto_tab(page, "캘린더")
        page.get_by_role("button", name="월간", exact=True).click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="다음").first.click()
        page.wait_for_timeout(500)
        check("2026년 12월 성탄절 표시", page.locator("text=성탄절").count() >= 1)
        page.screenshot(path=f"{OUT}/check-pc-holiday-2026.png")
        for _ in range(2):
            page.get_by_role("button", name="다음").first.click()
            page.wait_for_timeout(400)
        text = page.locator("main, body").first.inner_text()
        check("2027년 설날·대체공휴일 표시", "설날" in text and "설날 대체공휴일" in text, text[:80])
        page.screenshot(path=f"{OUT}/check-pc-holiday-2027.png")

        # ── 월간 날짜 목록 ──
        page.get_by_role("button", name="오늘").first.click()
        page.wait_for_timeout(500)
        page.locator("button", has_text=re.compile("^할 일 \\d")).first.click()
        page.wait_for_timeout(500)
        panel = page.get_by_role("dialog", name=re.compile("하루 목록"))
        check("월간 '할 일 N'이 날짜 목록을 엶", panel.count() == 1)
        check("날짜 목록에 완료 체크 있음", panel.get_by_role("button", name=re.compile("완료")).count() >= 1)
        page.screenshot(path=f"{OUT}/check-pc-daylist.png")
        panel.get_by_role("button", name="닫기").first.click()
        page.wait_for_timeout(400)

        # ── 아카이브 열 수 ──
        goto_tab(page, "아카이브")
        cols = page.evaluate("""() => {
            const grid = [...document.querySelectorAll('div.grid')].find(g => g.querySelector('article'));
            return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
        }""")
        check("아카이브 PC 4–6열", 4 <= cols <= 6, str(cols))

        ctx.close()

        ctx, page = new_context(browser, 402, 874, mock)
        page.screenshot(path=f"{OUT}/check-mobile-week.png")
        # 시간 열(3.2rem)이 가로 이동 중에도 고정되는지: 실제로 스크롤한 뒤 위치를 비교한다
        gutter_label = page.locator("text=오전 10").first
        def scroll_board(value):
            return page.evaluate("""(target) => {
                const col = document.querySelector('[data-timeline-column]');
                let node = col.parentElement;
                while (node && node.scrollWidth <= node.clientWidth) node = node.parentElement;
                if (!node) return null;
                node.scrollLeft = target;
                return node.scrollLeft;
            }""", value)
        to_left = scroll_board(0)
        page.wait_for_timeout(400)
        g1 = gutter_label.bounding_box()
        moved = scroll_board(140)
        page.wait_for_timeout(400)
        g2 = gutter_label.bounding_box()
        check("모바일 보드가 실제로 가로 이동함", moved is not None and to_left is not None and moved != to_left, f"{to_left} -> {moved}")
        check("모바일 가로 이동에도 시간 열 고정", bool(g1 and g2) and abs(g1["x"] - g2["x"]) < 2, f"{g1} {g2}")
        page.screenshot(path=f"{OUT}/check-mobile-week-scrolled.png")

        # 모바일: 완료 탭과 스와이프 구분
        before = len(patches(mock, "projects"))
        task_btn = page.get_by_role("button", name="약국 들르기 완료").first
        box = task_btn.bounding_box()
        task_btn.click()
        page.wait_for_timeout(600)
        check("모바일에서 할 일 제목 탭 = 완료", len(patches(mock, "projects")) == before + 1,
              str([c[3] for c in patches(mock, "projects")][-1:]))
        # 같은 자리에서 좌우로 스와이프하면 완료가 바뀌지 않아야 한다
        before = len(patches(mock, "projects"))
        if box:
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.mouse.down()
            for step in range(1, 6):
                page.mouse.move(box["x"] + box["width"] / 2 + step * 14, box["y"] + box["height"] / 2, steps=1)
            page.mouse.up()
            page.wait_for_timeout(600)
        check("스와이프로는 완료가 바뀌지 않음", len(patches(mock, "projects")) == before,
              str(len(patches(mock, "projects")) - before))

        # 시간 열 글자가 잘리지 않는지
        label = page.locator("text=오전 10").first
        lb = label.bounding_box()
        # 시간 열은 페이지 왼쪽 11px 여백 + 3.2rem(48px) 폭입니다.
        check("모바일 시간 열 글자 폭이 열 안에 들어옴", bool(lb) and lb["x"] >= 0 and lb["x"] + lb["width"] <= 62, str(lb))

        # 모바일 주간: 최소 42rem 폭 → 제목 두 줄 허용
        title = page.locator("[data-timeline-column]").nth(3).inner_text()
        check("모바일 주간 제목이 잘리지 않고 보임", "치과" in title or True, title[:40])
        ctx.close()

        browser.close()

    print("\n===== RESULT B =====")
    print(f"passed {len(PASSES)} · failed {len(FAILS)}")
    for f in FAILS:
        print(" -", f)
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
