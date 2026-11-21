"""
할 일 '시간 지정' + 상세 화면 '노션에서 열기' 검사.

    npm run build
    node node_modules/next/dist/bin/next start -p 3210 &
    CHROME=/workspace/.browsers/chromium/chrome-linux/chrome python3 tests/task-time-and-notion-open.py

모든 /api 호출은 브라우저 안에서 답하므로, 앱이 Notion에 실제로 보내는 값(PATCH/POST 본문)을
그대로 읽어 확인합니다. PC 1440×900 기준.
"""

import json
import os
import re
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3210")
CHROME = os.environ.get("CHROME")
OUT = os.environ.get("OUT", "/workspace/work/diary-shots")
os.makedirs(OUT, exist_ok=True)

TODAY = "2026-11-21"
WEEK_KEY = "2026-W47"
WEEK_START = "2026-11-16"

# 노션 페이지 URL을 따로 받은 기록 / id만 있는 기록(폴백 URL 확인용)
PAGE_ID = "41f6ed96-9c5d-816b-b13d-e0389e874f1c"
EVENT_URL = "https://www.notion.so/umana/0123456789abcdef0123456789abcdef"
TASK_URL = "https://www.notion.so/umana/fedcba9876543210fedcba9876543210"

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
    item.update(dict(kind="할 일", category="개인", status="미완료", date=None,
                     startTime=None, endTime=None, due=None,
                     doneAt=None, checkedAt=None, urgent=False, important=False, history=False,
                     waitFor="", waitNote="", cancelReason="", cancelAt=None, repeatGroupId=""))
    item.update(extra)
    return item


def build_fixture():
    calendar = [
        # url이 이미 있는 기록 → 그 URL 그대로 열려야 함
        event("ev-1", "도서관 반납", TODAY, url=EVENT_URL),
        # id만 있는 기록(예: url 없이 돌아온 페이지) → notion.so/<id> 폴백
        event(PAGE_ID, "치과 예약", TODAY, startTime="14:00", endTime="15:00", allDay=False),
    ]
    projects = [
        task("pj-1", "브랜드 포트폴리오", kind="프로젝트", category="업무", date="2026-11-10",
             due="2026-11-30"),
        # 기본값(시간 없음) 확인용
        task("tk-1", "약국 들르기", category="개인", date=TODAY, projectIds=["pj-1"], url=TASK_URL),
        # 이미 시간이 저장된 할 일 → 다시 열면 그대로 복원되는지
        task("tk-2", "치과에 전화", category="개인", date=TODAY, startTime="10:00", endTime="10:30",
             projectIds=["pj-1"]),
        task("tk-3", "옷장 비우기", category="개인", date="2026-11-22"),
    ]
    return dict(calendar=calendar, projects=projects, routines=[], binder=[], archive=[])


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
            new = dict(task(f"new-{self.seq}", body.get("title", "새 항목")), **body)
            new["id"] = f"new-{self.seq}"
            new["url"] = f"https://www.notion.so/umana/{abs(hash(new['id'])):032x}"[:300]
            self.data[resource].append(new)
            return route.fulfill(json={"ok": True, "data": new})
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)/([^/]+)$", path)
        if m and method == "PATCH":
            res, item_id = m.group(1), m.group(2)
            body = json.loads(request.post_data or "{}")
            body.pop("expectedUpdatedAt", None)
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
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=15000)
    page.wait_for_timeout(800)
    return ctx, page, errors


def goto_tab(page, name):
    page.get_by_role("button", name=re.compile(name)).last.click()
    page.wait_for_timeout(700)


def main():
    mock = Mock(build_fixture())
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        ctx, page, errors = new_context(browser, 1440, 900, mock)
        page.screenshot(path=f"{OUT}/h-notion-link-week.png")

        # ── 1. 일정 상세: 노션에서 열기 ─────────────────────────────────────
        page.get_by_role("button", name=re.compile("도서관 반납")).first.click()
        page.wait_for_timeout(800)
        dialog = page.get_by_role("dialog", name=re.compile("^일정"))
        dialog.wait_for()
        link = dialog.get_by_role("link", name="노션에서 열기")
        check("일정 상세에 '노션에서 열기' 버튼", link.count() == 1, str(link.count()))
        href = link.first.get_attribute("href") if link.count() else ""
        check("일정 상세 링크가 그 기록의 노션 URL", href == EVENT_URL, str(href))
        check("새 탭으로 열림", link.first.get_attribute("target") == "_blank" if link.count() else False)
        page.screenshot(path=f"{OUT}/h-notion-link-event.png")
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)

        # id만 있는 일정 → notion.so/<id> 폴백
        page.get_by_role("button", name=re.compile("치과 예약")).first.click()
        page.wait_for_timeout(800)
        dialog = page.get_by_role("dialog", name=re.compile("^일정"))
        dialog.wait_for()
        fallback = dialog.get_by_role("link", name="노션에서 열기").first.get_attribute("href")
        check("id로 만든 폴백 URL", fallback == "https://www.notion.so/" + PAGE_ID.replace("-", ""), str(fallback))
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)

        # ── 2. 할 일 상세: 노션에서 열기 + 기본은 시간 없음 ────────────────
        goto_tab(page, "프로젝트")
        page.get_by_role("button", name=re.compile("약국 들르기")).first.click()
        page.wait_for_timeout(900)
        detail = page.get_by_role("dialog", name=re.compile("^할 일"))
        detail.wait_for()
        task_link = detail.get_by_role("link", name="노션에서 열기")
        check("할 일 상세에 '노션에서 열기' 버튼", task_link.count() == 1, str(task_link.count()))
        check("할 일 링크가 그 기록의 노션 URL",
              task_link.first.get_attribute("href") == TASK_URL if task_link.count() else False,
              str(task_link.first.get_attribute("href") if task_link.count() else ""))

        toggle = detail.get_by_role("button", name=re.compile("시간 지정"))
        check("시간 지정 버튼이 있음", toggle.count() == 1, str(toggle.count()))
        check("기본값은 시간 없음(꺼짐)", toggle.first.get_attribute("aria-pressed") == "false",
              str(toggle.first.get_attribute("aria-pressed")))
        check("시간 없을 때 시작·종료 입력이 없음",
              detail.get_by_role("button", name="시작 수정").count() == 0)
        page.screenshot(path=f"{OUT}/h-task-time-off.png")

        # 읽기만 하고 닫으면 저장 없음
        before = len(patches(mock, "projects"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(700)
        check("읽기만 하고 닫으면 저장 없음", len(patches(mock, "projects")) == before,
              str(len(patches(mock, "projects")) - before))

        # ── 3. 시간 지정 켜고 저장 ──────────────────────────────────────────
        page.get_by_role("button", name=re.compile("약국 들르기")).first.click()
        page.wait_for_timeout(800)
        detail = page.get_by_role("dialog", name=re.compile("^할 일"))
        before = len(patches(mock, "projects"))
        detail.get_by_role("button", name=re.compile("시간 지정")).first.click()
        page.wait_for_timeout(300)
        start_btn = detail.get_by_role("button", name="시작 수정")
        end_btn = detail.get_by_role("button", name="종료 수정")
        check("켜면 시작 시간 입력이 나타남", start_btn.count() == 1, str(start_btn.count()))
        check("켜면 종료 시간 입력이 나타남", end_btn.count() == 1, str(end_btn.count()))
        start_btn.first.click()
        page.wait_for_timeout(200)
        page.get_by_role("textbox", name="시작 입력").fill("14:00")
        page.keyboard.press("Enter")
        page.wait_for_timeout(200)
        end_btn.first.click()
        page.wait_for_timeout(200)
        page.get_by_role("textbox", name="종료 입력").fill("15:30")
        page.keyboard.press("Enter")
        page.wait_for_timeout(1500)  # 자동 저장 대기
        page.screenshot(path=f"{OUT}/h-task-time-on.png")

        saved = patches(mock, "projects")[before:]
        body = saved[-1][3] if saved else {}
        check("저장 본문에 시작·종료 시간", body.get("startTime") == "14:00" and body.get("endTime") == "15:30",
              json.dumps(body, ensure_ascii=False))
        check("저장 본문의 날짜는 그날", body.get("date") == TODAY, str(body.get("date")))

        # ── 4. 다시 열어도 유지 ────────────────────────────────────────────
        page.keyboard.press("Escape")
        page.wait_for_timeout(700)
        row_text = page.locator("text=14:00~15:30").count()
        page.screenshot(path=f"{OUT}/h-task-row-time.png")
        check("프로젝트 목록 줄에 시간 표시", row_text >= 1, str(row_text))
        page.get_by_role("button", name=re.compile("약국 들르기")).first.click()
        page.wait_for_timeout(700)
        detail = page.get_by_role("dialog", name=re.compile("^할 일"))
        reopened = detail.inner_text()
        check("다시 열면 시간 지정 켜짐",
              detail.get_by_role("button", name=re.compile("시간 지정")).first.get_attribute("aria-pressed") == "true")
        check("다시 열면 시작·종료가 보임", "오후 2시" in reopened and "오후 3:30" in reopened, reopened[:200])
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)

        # ── 5. 시간 지정 끄면 날짜만 ───────────────────────────────────────
        page.get_by_role("button", name=re.compile("약국 들르기")).first.click()
        page.wait_for_timeout(700)
        detail = page.get_by_role("dialog", name=re.compile("^할 일"))
        before = len(patches(mock, "projects"))
        detail.get_by_role("button", name=re.compile("시간 지정")).first.click()
        page.wait_for_timeout(1500)
        saved = patches(mock, "projects")[before:]
        body = saved[-1][3] if saved else {}
        check("끄면 시작·종료를 지워 저장", body.get("startTime") is None and body.get("endTime") is None,
              json.dumps(body, ensure_ascii=False))
        check("끄면 날짜는 남음", body.get("date") == TODAY, str(body.get("date")))
        page.keyboard.press("Escape")
        page.wait_for_timeout(700)
        check("끄면 목록에 시간이 사라짐", page.locator("text=14:00~15:30").count() == 0)
        page.screenshot(path=f"{OUT}/h-task-time-off-again.png")

        # ── 6. 이미 시간이 있는 할 일은 그대로 복원 ────────────────────────
        page.get_by_role("button", name=re.compile("치과에 전화")).first.click()
        page.wait_for_timeout(800)
        detail = page.get_by_role("dialog", name=re.compile("^할 일"))
        text = detail.inner_text()
        check("저장된 시간이 이미 있으면 그대로 보임",
              detail.get_by_role("button", name=re.compile("시간 지정")).first.get_attribute("aria-pressed") == "true"
              and "오전 10시" in text and "오전 10:30" in text, text[:200])
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)

        # ── 7. 새 할 일 편집기에서 시간 지정 ───────────────────────────────
        goto_tab(page, "프로젝트")
        page.get_by_role("button", name="우선순위", exact=True).click()
        page.wait_for_timeout(600)
        page.get_by_role("button", name=re.compile(r"^\+ 할 일$")).first.click()
        page.wait_for_timeout(800)
        modal = page.get_by_role("dialog").last
        check("새 할 일 편집기가 열림", "새 할 일" in modal.inner_text(), modal.inner_text()[:60])
        if "새 할 일" in modal.inner_text():
            modal.get_by_placeholder("무엇을 해야 하나요?").fill("[테스트] 시간 있는 새 할 일")
            timed_btn = modal.get_by_role("button", name=re.compile("시간 지정"))
            check("편집기에서도 기본은 시간 없음", timed_btn.first.get_attribute("aria-pressed") == "false")
            timed_btn.first.click()
            page.wait_for_timeout(300)
            check("편집기에서 시간 지정 켜짐", timed_btn.first.get_attribute("aria-pressed") == "true")
            modal.get_by_label("시작 시간").fill("08:00")
            modal.get_by_label("종료 시간").fill("09:00")
            page.screenshot(path=f"{OUT}/h-new-task-time.png")
            before = len(posts(mock, "projects"))
            modal.get_by_role("button", name="추가", exact=True).first.click()
            page.wait_for_timeout(1500)
            created = posts(mock, "projects")[before:]
            body = created[-1][2] if created else {}
            if not created:
                print("MODAL TEXT", modal.inner_text()[:400])
            check("새 할 일 저장에 시작·종료 시간",
                  body.get("startTime") == "08:00" and body.get("endTime") == "09:00",
                  json.dumps(body, ensure_ascii=False))
            check("새 할 일 날짜는 오늘", body.get("date") == TODAY, str(body.get("date")))

        # ── 8. 주간·월간 표가 시간 때문에 깨지지 않는지 ────────────────────
        goto_tab(page, "캘린더")
        page.get_by_role("button", name="월간", exact=True).click()
        page.wait_for_timeout(700)
        month_text = page.locator("body").inner_text()
        check("월간 셀에 할 일 시간이 보임", "08:00~09:00" in month_text, month_text[:300])
        check("월간 보기에 ISO 문자열(T…)이 새지 않음", "T14:00" not in month_text and "2026-11-21T" not in month_text)
        page.screenshot(path=f"{OUT}/h-month-with-time.png")
        page.get_by_role("button", name=re.compile("^할 일 \\d+$")).first.click()
        page.wait_for_timeout(700)
        day_list = page.get_by_role("dialog").last.inner_text()
        check("월간 날짜 목록에 할 일이 그대로 보임", "약국 들르기" in day_list, day_list[:200])
        check("월간 날짜 목록에 할 일 시간 표시", "10:00~10:30" in day_list, day_list[:300])
        page.screenshot(path=f"{OUT}/h-month-daylist.png")
        page.locator("button[aria-label='닫기']").last.click()
        page.wait_for_timeout(500)

        page.get_by_role("button", name="주간", exact=True).click()
        page.wait_for_timeout(900)
        week_text = page.locator("body").inner_text()
        check("주간 보드에 할 일이 그대로 보임", "약국 들르기" in week_text or "치과에 전화" in week_text)
        check("주간 보드 할 일에 시간 표시", "14:00~15:30" in week_text or "10:00~10:30" in week_text,
              week_text[:300])
        page.screenshot(path=f"{OUT}/h-week-with-time.png")

        page.get_by_role("button", name="일간", exact=True).click()
        page.wait_for_timeout(800)
        page.screenshot(path=f"{OUT}/h-day-with-time.png")

        check("페이지 오류 없음", not errors, str(errors[:2]))

        ctx.close()
        browser.close()

    print()
    print(f"PASS {len(PASSES)} · FAIL {len(FAILS)}")
    for f in FAILS:
        print(" -", f)
    return 1 if FAILS else 0


if __name__ == "__main__":
    raise SystemExit(main())
