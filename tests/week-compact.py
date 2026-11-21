"""
주간 보기 압축 검증 — 종일+시간표 한 스크롤, 약 3줄 시간표, 루틴 접기, 오른쪽 패널 한 화면.

    NEXT_DIST_DIR=.next-wk node node_modules/next/dist/bin/next dev -p 3212
    BASE=http://127.0.0.1:3212 CHROME=/workspace/.browsers/chromium/chromium python3 tests/week-compact.py
"""

import json
import os
import re
import sys
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3212")
CHROME = os.environ.get("CHROME")  # 비워 두면 Playwright 기본 Chromium
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
    """A week that looks like the real one: three all-day lanes, timed events, tasks, routines."""
    calendar = [
        # 종일 — 차례로 3 lane
        event("ad-1", "제주도 여행", "2026-11-19", endDate="2026-11-22"),
        event("ad-2", "도서관 책 반납", "2026-11-18"),
        event("ad-3", "치과 예약 확인 전화", "2026-11-18"),
        event("ad-4", "김장 재료 사기", "2026-11-21"),
        # 시간 일정
        event("ev-1", "주간 회의", "2026-11-16", startTime="09:30", endTime="10:30", allDay=False),
        event("ev-2", "성과 리뷰", "2026-11-19", startTime="10:00", endTime="11:00", allDay=False),
        event("ev-3", "치과", TODAY, startTime="14:00", endTime="15:00", allDay=False),
        event("ev-4", "필라테스", "2026-11-20", startTime="19:00", endTime="20:00", allDay=False),
        # 주간 목표 · 메모
        event("goal-1", "포트폴리오 사례 2장 정리", WEEK_START, kind="주간 목표",
              weekKey=WEEK_KEY, baseDate=WEEK_START),
        event("goal-2", "주 3회 걷기", WEEK_START, kind="주간 목표", done=True,
              weekKey=WEEK_KEY, baseDate=WEEK_START),
        event("memo-1", "2026년 11월 21일 주간 메모", WEEK_START, kind="주간 메모",
              weekKey=WEEK_KEY, baseDate=WEEK_START, memo="이번 주는 마감이 몰린 주.\n금요일엔 일찍 잤다."),
    ]
    projects = [
        task("pj-1", "브랜드 포트폴리오", kind="프로젝트", category="업무", date="2026-11-10",
             due="2026-11-30", memo="사례 3개 정리"),
        task("pj-2", "집 정리", kind="프로젝트", category="개인", date="2026-11-01"),
        task("tk-1", "사례 1 정리", category="업무", date="2026-11-18", urgent=True, important=True,
             projectIds=["pj-1"]),
        task("tk-2", "사례 2 정리", category="업무", date="2026-11-20", status="완료",
             doneAt="2026-11-20", projectIds=["pj-1"]),
        task("tk-3", "사례 3 정리", category="업무", date="2026-11-18", favorite=True,
             urgent=True, important=True, projectIds=["pj-1"]),
        task("tk-4", "와이어프레임", category="업무", date="2026-11-18", projectIds=["pj-1"]),
        task("tk-5", "약국 들르기", category="개인", date=TODAY, favorite=True,
             urgent=True, important=True),
        task("tk-6", "옷장 비우기", category="개인", date="2026-11-22", projectIds=["pj-2"]),
        task("tk-7", "오늘 할 일 하나", category="개인", date=TODAY, projectIds=["pj-2"]),
        task("tk-8", "오늘 할 일 둘", category="개인", date=TODAY),
        task("tk-9", "오늘 할 일 셋", category="개인", date=TODAY),
        task("tk-10", "이번 주 꼭: 병원 예약", category="개인", date=TODAY, favorite=True,
             urgent=True, important=True),
    ]
    routines = [
        task("rt-1", "물 마시기", kind="루틴", category="개인", targetCount=4, execCount=0,
             repeatDays=["월", "화", "수", "목", "금", "토", "일"], amount=1, unit="컵",
             date=None, history=False, routineIds=[]),
        task("rt-2", "스쿼트", kind="루틴", category="개인", targetCount=1, execCount=0,
             repeatDays=["월", "화", "수", "목", "금", "토", "일"], amount=30, unit="회",
             date=None, history=False, routineIds=[]),
        task("rt-3", "영어 단어", kind="루틴", category="공부", targetCount=1, execCount=0,
             repeatDays=["월", "화", "수", "목", "금", "토", "일"], amount=10, unit="개",
             date=None, history=False, routineIds=[]),
    ]
    binder = [
        base("bd-1", "조용한 하루", kind="일기", date=TODAY, link="", tags=[], archiveFlag=False,
             body="아침에 창문을 열었다.", photos=[]),
    ]
    archive = []
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


def new_context(browser, width, height, mock):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR")
    page = ctx.new_page()
    page.set_default_timeout(8000)
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=20000)
    page.wait_for_timeout(1200)
    return ctx, page


MEASURE = """() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return {x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, top: r.top}; };
  const scroll = document.querySelector('[data-week-scroll]');
  const allday = document.querySelector('[data-all-day-bar]');
  const header = document.querySelector('[data-week-header]');
  const aside = document.querySelector('aside');
  const timed = [...document.querySelectorAll('[data-timeline-column] button')]
      .find(b => b.textContent.includes('성과 리뷰'));
  const asideSections = ['이번 주 꼭', '이번 주 목표', '주간 메모'].map((label) => {
    const h = [...document.querySelectorAll('aside h3')].find(n => n.textContent.trim() === label);
    return [label, box(h)];
  });
  const miniMonth = document.querySelector('aside') && document.querySelector('aside').querySelector('button[aria-label="이전 달"]');
  const allDayBlock = document.querySelector('[data-all-day-block]');
  return {
    scroll: scroll ? {box: box(scroll), clientH: scroll.clientHeight, scrollH: scroll.scrollHeight,
                      scrollTop: scroll.scrollTop, overflowY: getComputedStyle(scroll).overflowY,
                      allDayH: allDayBlock ? allDayBlock.offsetHeight : 0} : null,
    allday: box(allday), timed: box(timed), header: box(header),
    aside: aside ? {box: box(aside), clientH: aside.clientHeight, scrollH: aside.scrollHeight,
                    overflowY: getComputedStyle(aside).overflowY} : null,
    mini: box(miniMonth),
    sections: asideSections,
    viewport: {w: window.innerWidth, h: window.innerHeight},
    pageScrollH: document.documentElement.scrollHeight,
  };
}"""


def main():
    mock = Mock(build_fixture())
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        ctx, page = new_context(browser, 1440, 900, mock)
        page.get_by_role("button", name="주간", exact=True).click()
        page.wait_for_timeout(900)
        page.screenshot(path=f"{OUT}/week-pc-first.png")

        m = page.evaluate(MEASURE)
        print("MEASURE", json.dumps(m, ensure_ascii=False, indent=1))

        scroll = m["scroll"]
        check("시간표 스크롤 컨테이너가 세로 스크롤", bool(scroll) and scroll["scrollH"] > scroll["clientH"] + 20,
              str(scroll and (scroll["clientH"], scroll["scrollH"])))
        visible_timetable = scroll["clientH"] - scroll["allDayH"] if scroll else 0
        check("보이는 시간표 높이 약 3줄(90~115px)", bool(scroll) and 90 <= visible_timetable <= 115,
              f"window {scroll and scroll['clientH']} - 종일 {scroll and scroll['allDayH']} = {visible_timetable}")
        check("종일+시간표 창이 예전(약 154px)보다 낮음", bool(scroll) and scroll["clientH"] <= 170,
              str(scroll and scroll["clientH"]))
        # 종일 일정이 그 컨테이너 안에 있고, 같은 스크롤에서 함께 움직인다
        check("종일 일정이 스크롤 컨테이너 안에 있음", page.evaluate(
            """() => { const s = document.querySelector('[data-week-scroll]');
                       const a = document.querySelector('[data-all-day-bar]');
                       return !!(s && a && s.contains(a)); }"""))
        before = page.evaluate(MEASURE)
        page.evaluate("() => { const s = document.querySelector('[data-week-scroll]'); s.scrollTop = 60; }")
        page.wait_for_timeout(300)
        after = page.evaluate(MEASURE)
        dal = after["allday"]["y"] - before["allday"]["y"]
        dti = after["timed"]["y"] - before["timed"]["y"]
        dhe = after["header"]["y"] - before["header"]["y"]
        check("스크롤하면 종일이 시간표와 같은 만큼 움직임", abs(dal - dti) < 1 and dal < -10,
              f"allday {dal:.1f} timed {dti:.1f}")
        check("요일 머리글은 그대로 (고정)", abs(dhe) < 1, f"{dhe:.1f}")
        page.evaluate("() => { const s = document.querySelector('[data-week-scroll]'); s.scrollTop = 0; }")
        page.wait_for_timeout(200)

        # 루틴 전체 접기/펴기
        routines_visible = page.locator("text=물 마시기").first
        check("루틴 기본 펼침", routines_visible.is_visible())
        page.get_by_role("button", name="루틴 영역 접기").click()
        page.wait_for_timeout(400)
        check("루틴 영역 접힘", page.locator("text=물 마시기").count() == 0 or not page.locator("text=물 마시기").first.is_visible())
        check("접어도 프로젝트는 남음", page.locator("text=브랜드 포트폴리오").first.is_visible())
        page.screenshot(path=f"{OUT}/week-pc-routines-folded.png")
        page.get_by_role("button", name="루틴 영역 펴기").click()
        page.wait_for_timeout(400)
        check("루틴 다시 펼침", page.locator("text=물 마시기").first.is_visible())

        # 오른쪽 패널이 900 안에 들어오는지
        m = page.evaluate(MEASURE)
        aside = m["aside"]
        check("오른쪽 패널 bottom ≤ 900", bool(aside) and aside["box"]["bottom"] <= 900,
              str(aside and aside["box"]))
        check("오른쪽 패널 내부 스크롤 없음", bool(aside) and aside["scrollH"] <= aside["clientH"] + 1,
              str(aside and (aside["clientH"], aside["scrollH"])))
        check("작은 달력이 첫 화면 안", bool(m["mini"]) and m["mini"]["top"] >= 0 and m["mini"]["bottom"] <= 900,
              str(m["mini"]))
        for label, box in m["sections"]:
            check(f"'{label}'가 첫 화면 안", bool(box) and box["bottom"] <= 900 and box["top"] >= 0,
                  str(box))

        ctx.close()

        # 모바일
        ctx, page = new_context(browser, 402, 874, mock)
        page.get_by_role("button", name="주간", exact=True).click()
        page.wait_for_timeout(900)
        page.screenshot(path=f"{OUT}/week-mobile-first.png")

        def scroll_board(value):
            return page.evaluate("""(target) => {
                const col = document.querySelector('[data-timeline-column]');
                let node = col.parentElement;
                while (node && node.scrollWidth <= node.clientWidth) node = node.parentElement;
                if (!node) return null;
                node.scrollLeft = target;
                return node.scrollLeft;
            }""", value)

        gutter_label = page.locator("text=오전 10").first
        to_left = scroll_board(0)
        page.wait_for_timeout(300)
        g1 = gutter_label.bounding_box()
        moved = scroll_board(140)
        page.wait_for_timeout(300)
        g2 = gutter_label.bounding_box()
        check("모바일 보드가 가로로 움직임", moved is not None and to_left is not None and moved != to_left,
              f"{to_left} -> {moved}")
        check("모바일 가로 이동에도 시간 열 고정", bool(g1 and g2) and abs(g1["x"] - g2["x"]) < 2, f"{g1} {g2}")
        page.screenshot(path=f"{OUT}/week-mobile-scrolled.png")
        # 모바일에서도 종일이 시간표와 한 덩어리
        check("모바일 종일+시간표 한 덩어리", page.evaluate(
            """() => { const s = document.querySelector('[data-week-scroll]');
                       const a = document.querySelector('[data-all-day-bar]');
                       return !!(s && a && s.contains(a)); }"""))
        # 모바일 아코디언 패널도 그대로 열리고 메모 칸이 살아 있는지
        page.get_by_role("button", name=re.compile("이번 주 꼭 · 목표 · 메모")).click()
        page.wait_for_timeout(500)
        memo_box = page.locator('textarea[aria-label="이번 주 메모"]:visible').last
        mb = memo_box.bounding_box()
        check("모바일 패널을 열면 주간 메모 칸이 보임", bool(mb) and mb["height"] >= 50, str(mb))
        page.screenshot(path=f"{OUT}/week-mobile-panel-open.png")
        ctx.close()
        browser.close()

    print("\n===== RESULT =====")
    print(f"passed {len(PASSES)} · failed {len(FAILS)}")
    for f in FAILS:
        print(" -", f)
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
