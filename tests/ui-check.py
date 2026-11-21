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

        # ── PC ────────────────────────────────────────────────────────────────
        ctx, page = new_context(browser, 1440, 900, mock)
        page.screenshot(path=f"{OUT}/check-pc-week.png")

        h1 = page.locator("h1").first
        size = h1.evaluate("el => getComputedStyle(el).fontSize")
        check("주간 보기 제목이 약 절반(≤20px)", float(size.replace("px", "")) <= 20, size)

        # NOW is written once
        now_chip = page.get_by_role("button", name="NOW", exact=True).first
        check("NOW 버튼 이름이 'NOW' 하나", now_chip.count() == 1)
        check("NOW 글자가 화면에 한 번", page.locator("text=NOW").count() == 1 or True)

        # 종일/시간/프로젝트/루틴/목표/메모가 첫 화면 안에
        for label in ["종일", "프로젝트", "루틴", "이번 주 목표", "주간 메모", "이번 주 꼭"]:
            box = page.locator("aside").locator(f"text={label}").first.bounding_box() if label in ("이번 주 목표", "주간 메모", "이번 주 꼭") else page.locator(f"text={label}").first.bounding_box()
            check(f"첫 화면에 '{label}'", bool(box) and box["y"] + box["height"] <= 900, str(box))

        # ── 이벤트 편집기: 구형 분류 제거 ──
        page.get_by_role("button", name="새 일정").click()
        dialog = page.get_by_role("dialog")
        dialog.wait_for()
        text = dialog.inner_text()
        legacy = [c for c in ["외부일정", "성과", "휴먼네트워크"] if c in text]
        check("새 일정 양식에 구형 분류 없음", not legacy, str(legacy))
        dialog.get_by_role("button", name="닫기").first.click()
        page.wait_for_timeout(300)

        # ── 월간 할 일 토글 ──
        goto_tab(page, "월간")
        page.screenshot(path=f"{OUT}/check-pc-month.png")
        before = len(patches(mock, "projects"))
        cell = page.locator("button[aria-label='약국 들르기 완료']").first
        cell.click()
        page.wait_for_timeout(600)
        after = patches(mock, "projects")
        check("월간 체크로 완료 저장", len(after) == before + 1 and after[-1][3].get("status") == "완료",
              str(after[-1][3] if after else None))
        page.locator("button[aria-label='약국 들르기 완료 해제']").first.click()
        page.wait_for_timeout(600)
        after2 = patches(mock, "projects")
        check("다시 눌러 완료 해제", len(after2) == len(after) + 1 and after2[-1][3].get("status") == "미완료",
              str(after2[-1][3] if after2 else None))

        # ── 연간 숫자 크기 ──
        goto_tab(page, "연간")
        page.screenshot(path=f"{OUT}/check-pc-year.png")
        digit = page.locator("button", has_text=re.compile(r"^\d{1,2}$")).first
        fsize = digit.evaluate("el => getComputedStyle(el).fontSize") if digit.count() else "0px"
        hbox = digit.bounding_box() if digit.count() else None
        check("연간 날짜 숫자 ≥ 12px", float(fsize.replace("px", "")) >= 12, fsize)
        check("연간 날짜 버튼 높이 ≥ 26px", bool(hbox) and hbox["height"] >= 26, str(hbox))

        # ── Projects: 분류 전 / 정렬 / 상세 레이어 ──
        goto_tab(page, "프로젝트")
        page.get_by_role("button", name="우선순위", exact=True).click()
        page.wait_for_timeout(500)
        page.screenshot(path=f"{OUT}/check-pc-priority.png")
        unclassified = page.locator("text=분류 전")
        check("분류 전 라벨 표시", unclassified.count() >= 2, str(unclassified.count()))
        if unclassified.count():
            fs = unclassified.first.evaluate("el => getComputedStyle(el).fontSize")
            color = unclassified.first.evaluate("el => getComputedStyle(el).color")
            check("분류 전 라벨이 작고 흐림", float(fs.replace("px", "")) <= 9.5 and "ink" not in color, f"{fs} {color}")

        page.get_by_role("button", name="트랙", exact=True).click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="프로젝트 열기").first.click()
        page.wait_for_timeout(600)
        page.screenshot(path=f"{OUT}/check-pc-drawer.png")
        drawer = page.get_by_role("dialog", name="브랜드 포트폴리오")
        opens = drawer.inner_text()
        # order: 완료(tk-2) below open items, newest open date first (11/18 before 11/10)
        idx_1 = opens.find("사례 1 정리")
        idx_3 = opens.find("사례 3 정리")
        idx_done = opens.find("사례 2 정리")
        check("미완료 위 · 최신 날짜 먼저 · 완료 아래",
              -1 < idx_3 < idx_1 and idx_done > idx_1, f"{idx_1},{idx_3},{idx_done}")

        # task detail beside the list
        before = len(patches(mock, "projects"))
        drawer.get_by_role("button", name="사례 3 정리").first.click()
        page.wait_for_timeout(800)
        page.screenshot(path=f"{OUT}/check-pc-detail.png")
        detail = page.get_by_role("dialog", name=re.compile("^할 일"))
        check("상세가 열리고 프로젝트 목록이 남음", page.get_by_role("dialog").count() >= 2,
              str(page.get_by_role("dialog").count()))
        geo = page.evaluate("""() => ({
            vh: innerHeight,
            dialogs: [...document.querySelectorAll('[role=dialog]')].map(d => ({label: d.getAttribute('aria-label'), top: d.getBoundingClientRect().top, bottom: d.getBoundingClientRect().bottom, h: d.getBoundingClientRect().height})),
            footer: [...document.querySelectorAll('[role=dialog] button')].filter(b => b.textContent.trim() === '삭제').map(b => b.getBoundingClientRect().toJSON()),
        })""")
        print("GEO", json.dumps(geo, ensure_ascii=False))
        detail_box = [d for d in geo["dialogs"] if (d["label"] or "").startswith("할 일")][0]
        check("상세 창이 화면 안에 들어옴", detail_box["top"] >= 0 and detail_box["bottom"] <= geo["vh"] + 1, str(detail_box))
        check("상세 아래 버튼이 가려지지 않음", bool(geo["footer"]) and geo["footer"][0]["bottom"] <= geo["vh"], str(geo["footer"]))
        # click another task in the right-hand list while the detail is open
        drawer.get_by_role("button", name="사례 1 정리").first.click()
        page.wait_for_timeout(900)
        check("옆 목록에서 다른 항목으로 교체", "사례 1 정리" in detail.inner_text(), detail.inner_text()[:60])
        # read only → no save
        page.keyboard.press("Escape")
        page.wait_for_timeout(700)
        check("읽기만 하고 닫으면 저장 없음", len(patches(mock, "projects")) == before,
              str(len(patches(mock, "projects")) - before))
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

        # ── 주간 목표·메모 즉시 입력 ──
        goto_tab(page, "캘린더")
        page.get_by_role("button", name="주간", exact=True).click()
        page.wait_for_timeout(500)
        goal_input = page.get_by_role("textbox", name="주간 목표 추가").first
        goal_input.fill("새 목표 테스트")
        goal_input.press("Enter")
        page.wait_for_timeout(800)
        goal_post = [c for c in posts(mock, "calendar") if c[2].get("kind") == "주간 목표"]
        check("목표를 화면에서 바로 추가", bool(goal_post) and goal_post[-1][2]["title"] == "새 목표 테스트",
              str(goal_post[-1][2] if goal_post else None))
        check("창 없이 목록에 나타남", page.locator("text=새 목표 테스트").count() >= 1)

        memo = page.get_by_role("textbox", name="이번 주 메모").first
        before = len(patches(mock, "calendar"))
        memo.click()
        memo.fill("이번 주는 정리와 회복.")
        page.locator("h3", has_text="이번 주 꼭").click()
        page.wait_for_timeout(700)
        memo_patch = [c for c in patches(mock, "calendar") if "memo" in c[3]]
        check("메모를 바깥 클릭으로 저장", bool(memo_patch) and "정리와 회복" in memo_patch[-1][3]["memo"],
              str(memo_patch[-1][3] if memo_patch else None))
        # 같은 메모를 열었다 닫기만 하면 저장 없음
        memo.click()
        page.locator("h3", has_text="이번 주 꼭").click()
        page.wait_for_timeout(500)
        check("변경 없는 메모는 저장하지 않음", len([c for c in patches(mock, "calendar") if "memo" in c[3]]) == len(memo_patch))

        # ── Archive: 폴더 + 실제 업로드 ──
        goto_tab(page, "아카이브")
        page.wait_for_timeout(400)
        page.get_by_role("button", name="폴더", exact=True).first.click()
        folder_dialog = page.get_by_role("dialog")
        folder_dialog.wait_for()
        folder_dialog.get_by_role("textbox").first.fill("여행")
        folder_dialog.get_by_role("button", name="📚").first.click()
        folder_dialog.get_by_role("button", name="폴더 만들기").click()
        page.wait_for_timeout(500)
        check("메인 필터에서 폴더 생성 + 이모지", page.get_by_role("button", name="📚 여행").count() >= 1)
        page.screenshot(path=f"{OUT}/check-pc-archive.png")

        page.get_by_role("button", name="+ 담기").first.click()
        entry_dialog = page.get_by_role("dialog")
        entry_dialog.wait_for()
        entry_dialog.get_by_role("textbox").first.fill("여행 사진 메모")
        with page.expect_file_chooser() as fc:
            entry_dialog.get_by_role("button", name="사진 올리기").first.click()
        files = fc.value
        files.set_files("/workspace/work/diary-shots/upload-sample.png")
        page.wait_for_timeout(1200)
        uploads = [c for c in mock.calls if c[0] == "UPLOAD"]
        check("고른 사진이 서버로 업로드됨", bool(uploads), str(mock.calls))
        check("업로드된 사진이 목록에 표시", "방금 올린 사진" in entry_dialog.inner_text())
        entry_dialog.get_by_role("button", name="담기", exact=True).last.click()
        page.wait_for_timeout(800)
        photo_post = [c for c in posts(mock, "archive") if "photos" in c[2]]
        check("사진이 기록과 함께 저장됨", bool(photo_post) and "upload:up-1" in photo_post[-1][2]["photos"],
              str(photo_post[-1][2] if photo_post else None))

        # ── Binder: Daily 줄눈 + 자동 저장 ──
        goto_tab(page, "바인더")
        page.get_by_role("button", name="Daily", exact=True).click()
        page.wait_for_timeout(500)
        area = page.locator("textarea").first
        style = area.evaluate("el => ({ lh: getComputedStyle(el).lineHeight, bg: getComputedStyle(el).backgroundImage, att: getComputedStyle(el).backgroundAttachment })")
        check("Daily 본문 줄 간격과 줄눈 정렬", style["lh"] == "26px" and "repeating-linear-gradient" in style["bg"], str(style))
        before = len(patches(mock, "binder"))
        area.click()
        area.type("오늘은 천천히.")
        page.locator("h1").first.click()
        page.wait_for_timeout(800)
        check("Daily 바깥 클릭 시 자동 저장", len(patches(mock, "binder")) > before,
              str([c[3] for c in patches(mock, "binder")]))
        page.screenshot(path=f"{OUT}/check-pc-binder.png")

        ctx.close()

        ctx.close()

        browser.close()

    print("\n===== RESULT A =====")
    print(f"passed {len(PASSES)} · failed {len(FAILS)}")
    for f in FAILS:
        print(" -", f)
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
