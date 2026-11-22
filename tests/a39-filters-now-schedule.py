"""
A39 — 분류 필터 · 캘린더 NOW 버튼 · 개별 NOW · 주간 일정↔할 일 변환 · 프로젝트 탭 `일정` 카드

    NEXT_DIST_DIR=.next-a39 PORT=3239 tests/run-with-server.sh tests/a39-filters-now-schedule.py

검사 항목
  1. 분류 필터(업무·개인·공부)가 월간·주간 보기의 일정·할 일·프로젝트 행에 실제로 걸린다
  2. 캘린더 탭 상단 NOW 버튼 — 프로젝트 탭과 같은 상태를 켜고 끈다
  3. 주간/3일 보기에서 종일 일정 → 할 일, 할 일 → 종일 일정 / 시간 일정 변환(PC·모바일)
  4. 개별 일정 상세·할 일 상세의 NOW 토글이 그 항목만 숨긴다
  5. 프로젝트 탭 `일정` 카드 — index 바로 옆, 분류 배지, 서랍의 전체/진행/완료 + 분류 필터,
     할 일 → 일정 / 일정 → 할 일 드래그 변환(PC 마우스 · 모바일 손가락)
"""

import importlib.util
import json
import os
import pathlib
import re
import time
import urllib.parse

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("uicheck", HERE / "ui-check.py")
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)

BASE = os.environ.get("BASE", "http://127.0.0.1:3239")
OUT = os.environ.get("OUT", "/workspace/work/wt-a39-shots")
os.makedirs(OUT, exist_ok=True)
TODAY = "2026-11-22"
check = ui.check
SHELL = os.environ.get("CHROME", "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell")
LIBS = os.environ.get("CHROME_LIBS", "/workspace/.tools/chrome-libs")


def launch(p):
    return p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"],
                             env={**os.environ, "LD_LIBRARY_PATH": LIBS})


def fixture():
    calendar = [
        ui.event("ev-all", "팀 회의 준비", TODAY, category="업무"),
        ui.event("ev-all2", "자료 정리 마감", "2026-11-18", category="공부"),
        ui.event("ev-time", "치과 예약", TODAY, category="개인", startTime="14:00", endTime="15:00", allDay=False),
        ui.event("ev-hidden", "혼자만 보는 일정", TODAY, category="개인", hidden=True),
        ui.event("ev-done", "지난 주 마감", "2026-11-19", category="업무", done=True),
    ]
    projects = [
        ui.task("pj-work", "브랜드 포트폴리오", kind="프로젝트", category="업무", date="2026-11-10"),
        ui.task("pj-home", "집 정리", kind="프로젝트", category="개인", date="2026-11-01"),
        ui.task("tk-work", "사례 정리", category="업무", date="2026-11-18", projectIds=["pj-work"]),
        ui.task("tk-free", "약국 들르기", category="개인", date=TODAY),
        ui.task("tk-study", "강의 듣기", category="공부", date="2026-11-20"),
        ui.task("tk-home", "옷장 정리", category="개인", date="2026-11-20", projectIds=["pj-home"]),
    ]
    return dict(calendar=calendar, projects=projects, routines=[], binder=[], archive=[])


class Touch:
    """진짜 손가락 — CDP 로 터치 이벤트를 보냅니다."""

    def __init__(self, page, resolver):
        self.page = page
        self.box = resolver
        self.cdp = page.context.new_cdp_session(page)

    def send(self, kind, points):
        self.cdp.send("Input.dispatchTouchEvent",
                      {"type": kind, "touchPoints": [{"x": x, "y": y, "id": 1} for (x, y) in points]})

    def down(self, x, y):
        self.send("touchStart", [(x, y)])

    def move(self, x, y):
        self.send("touchMove", [(x, y)])

    def up(self):
        self.send("touchEnd", [])

    def pause(self, ms):
        time.sleep(ms / 1000)

    def glide(self, x, y, tx, ty, steps=16, pause=18):
        for step in range(1, steps + 1):
            self.move(x + (tx - x) * step / steps, y + (ty - y) * step / steps)
            self.pause(pause)

    def drag(self, src, dst, hold=260):
        s = self.box(src)
        d = self.box(dst)
        self.down(s[0], s[1])
        self.pause(hold)
        self.glide(s[0], s[1], d[0], d[1])
        self.pause(120)
        self.up()
        time.sleep(2.4)


def open_page(browser, width, height, mock, touch=False):
    kwargs = dict(viewport={"width": width, "height": height}, locale="ko-KR")
    if touch:
        kwargs.update(has_touch=True, is_mobile=True, device_scale_factor=3)
    ctx = browser.new_context(**kwargs)
    page = ctx.new_page()
    page.set_default_timeout(12000)
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=20000)
    page.wait_for_timeout(900)
    return ctx, page, errors


def box_of(page, selector):
    node = page.locator(selector).first
    node.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    b = node.bounding_box()
    return (b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)


def header_bottom(page):
    node = page.locator("[data-week-header]").first
    b = node.bounding_box() if node.count() else None
    return (b["y"] + b["height"]) if b else 70


def point_in(page, selector, frac=0.5):
    """놓을 자리의 한 점 — 세로 위치는 frac(0=맨 위). 화면 밖이면 화면 안으로 당깁니다."""
    node = page.locator(selector).first
    if not node.count():
        return None
    node.scroll_into_view_if_needed()
    page.wait_for_timeout(150)
    b = node.bounding_box()
    if not b:
        return None
    x = b["x"] + b["width"] / 2
    y = b["y"] + b["height"] * frac
    y = max(header_bottom(page) + 24, min(y, 860))
    return (x, y)


def mouse_drag(page, src, dst, steps=16, frac=0.5):
    """카드를 끌어 놓습니다. 먼저 놓을 자리를 화면 안에 두고, 그 다음 잡을 곳을 잽니다."""
    d = point_in(page, dst, frac)
    s = point_in(page, src, 0.5)
    if not s or not d:
        return False
    page.mouse.move(s[0], s[1])
    page.mouse.down()
    page.mouse.move(s[0] + 14, s[1], steps=4)
    page.mouse.move(d[0], d[1], steps=steps)
    page.wait_for_timeout(220)
    page.mouse.up()
    page.wait_for_timeout(1000)
    return True


TABS = {"캘린더": "calendar", "프로젝트": "projects", "바인더": "binder", "아카이브": "archive"}


def goto_tab(page, name):
    page.locator(f"[data-tab='{TABS[name]}']").first.click()
    page.wait_for_timeout(700)


def view(page, name):
    page.screenshot(path=f"{OUT}/_before-view.png")
    page.locator(".seg-track button", has_text=re.compile(f"^{name}$")).first.click()
    page.wait_for_timeout(700)


def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png")


def chip(page, value):
    page.locator(f"[data-mode-chip='{value}']").first.click()
    page.wait_for_timeout(650)


def last_post(mock, resource):
    items = [c for c in mock.calls if c[0] == "POST" and c[1] == resource]
    return items[-1][2] if items else {}


def last_patch(mock, resource, item_id=None):
    items = [c for c in mock.calls if c[0] == "PATCH" and c[1] == resource and (item_id is None or c[2] == item_id)]
    return items[-1][3] if items else {}


def wait_for(page, fn, timeout=9.0, step=150):
    """브라우저 이벤트를 계속 흘려보내며 조건을 기다립니다(time.sleep 은 라우트 응답을 멈춥니다)."""
    waited = 0
    while waited < timeout * 1000:
        page.wait_for_timeout(step)
        waited += step
        if fn():
            return True
    return bool(fn())


def count(page, selector):
    return page.locator(selector).count()


# ─────────────────────────────── 1 · 2 · 3 · 4 : PC ───────────────────────────────

def pc_filters_and_now(browser):
    mock = ui.Mock(fixture())
    ctx, page, errors = open_page(browser, 1440, 900, mock)

    # ── 1. 분류 필터 — 월간 ──
    view(page, "월간")
    shot(page, "pc-month-all")
    chip(page, "cat:업무")
    shot(page, "pc-month-work")
    check("월간 · 업무: 업무 일정만", count(page, "[data-month-item='ev-all']") == 1)
    check("월간 · 업무: 개인 일정은 숨김", count(page, "[data-month-item='ev-time']") == 0)
    check("월간 · 업무: 업무 할 일 보임", count(page, "[data-month-item='tk-work']") == 1)
    check("월간 · 업무: 개인 할 일은 숨김", count(page, "[data-month-item='tk-free']") == 0)

    chip(page, "cat:개인")
    check("월간 · 개인: 개인 일정 보임", count(page, "[data-month-item='ev-time']") == 1)
    check("월간 · 개인: 업무 일정은 숨김", count(page, "[data-month-item='ev-all']") == 0)
    check("월간 · 개인: 개인 할 일 보임", count(page, "[data-month-item='tk-free']") == 1)

    chip(page, "all")
    check("월간 · 전체: 숨긴 일정까지 보임", count(page, "[data-month-item='ev-hidden']") == 1)

    # ── 1b. 분류 필터 — 주간의 프로젝트 행 ──
    view(page, "주간")
    check("주간 · 전체: 개인 프로젝트 행이 있음", count(page, "[data-drop-zone='week-project-row'][data-drop-project='pj-home']") == 1)
    chip(page, "cat:업무")
    check("주간 · 업무: 업무 프로젝트 행만", count(page, "[data-drop-zone='week-project-row'][data-drop-project='pj-work']") == 1
          and count(page, "[data-drop-zone='week-project-row'][data-drop-project='pj-home']") == 0)
    check("주간 · 업무: 업무 할 일 보임", count(page, "[data-week-task='tk-work']") == 1)
    check("주간 · 업무: 개인 할 일은 숨김", count(page, "[data-week-task='tk-free']") == 0)
    chip(page, "all")

    # ── 2. 캘린더 탭 상단 NOW 버튼 ──
    now_button = page.locator("[data-calendar-now]").first
    check("캘린더 상단에 NOW 버튼", now_button.count() == 1)
    now_button.click()
    page.wait_for_timeout(500)
    check("캘린더 NOW 켜짐", now_button.get_attribute("aria-pressed") == "true")
    check("NOW: NOW 숨김 일정이 사라짐", count(page, "[data-all-day-bar='ev-hidden']") == 0)
    view(page, "월간")
    check("NOW 모드에서 NOW 숨김 일정 가림", count(page, "[data-month-item='ev-hidden']") == 0)
    shot(page, "pc-month-now")
    goto_tab(page, "프로젝트")
    projects_now = page.locator("button[aria-label='NOW 숨김만 보기']").first
    check("프로젝트 탭 NOW 도 함께 켜짐", projects_now.get_attribute("aria-pressed") == "true")
    goto_tab(page, "캘린더")
    page.locator("[data-calendar-now]").first.click()
    page.wait_for_timeout(400)
    check("캘린더 NOW 다시 꺼짐", page.locator("[data-calendar-now]").first.get_attribute("aria-pressed") == "false")

    # ── 4. 개별 일정 상세 NOW ──
    view(page, "월간")
    page.locator("[data-month-item='ev-time']").first.click()
    page.wait_for_timeout(700)
    check("일정 상세가 열림", count(page, "[data-event-now]") == 1)
    page.locator("[data-event-now]").first.click()
    page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    page.wait_for_timeout(900)
    body = last_patch(mock, "calendar", "ev-time")
    check("일정 상세 NOW → hidden 저장", body.get("hidden") is True, json.dumps(body, ensure_ascii=False))
    shot(page, "pc-event-now")

    # ── 4a. 새 일정 창의 NOW ──
    goto_tab(page, "캘린더")
    page.get_by_role("button", name="새 일정").first.click()
    page.wait_for_timeout(700)
    check("새 일정 창에 NOW 토글", count(page, "[data-editor-now]") == 1)
    page.locator("[data-editor-now]").first.click()
    page.wait_for_timeout(250)
    check("새 일정 창 NOW 켜짐", page.locator("[data-editor-now]").first.get_attribute("aria-pressed") == "true")
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    # ── 4b. 개별 할 일 상세 NOW ──
    goto_tab(page, "프로젝트")
    page.get_by_role("button", name="+ new").first.click()
    page.wait_for_timeout(700)
    check("새 프로젝트 창에 NOW 토글", count(page, "[data-editor-now]") == 1)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    page.locator("[data-task-drag='tk-free']").first.click()
    page.wait_for_timeout(800)
    check("할 일 상세가 열림", count(page, "[data-task-now]") == 1)
    page.locator("[data-task-now]").first.click()
    page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    page.wait_for_timeout(900)
    body = last_patch(mock, "projects", "tk-free")
    check("할 일 상세 NOW → hidden 저장", body.get("hidden") is True, json.dumps(body, ensure_ascii=False))
    shot(page, "pc-task-now")

    check("PC 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:2]))
    ctx.close()


def pc_week_conversion(browser):
    mock = ui.Mock(fixture())
    ctx, page, errors = open_page(browser, 1440, 900, mock)
    goto_tab(page, "캘린더")

    # ── 종일 일정 → 프로젝트 할 일 ──
    before_p = len([c for c in mock.calls if c[0] == "POST" and c[1] == "projects"])
    mouse_drag(page, "[data-all-day-bar='ev-all']",
               "[data-drop-zone='week-task-day'][data-drop-project='pj-work'][data-drop-day='2026-11-22']")
    posted = last_post(mock, "projects")
    check("종일 일정 → 할 일 생성", len([c for c in mock.calls if c[0] == "POST" and c[1] == "projects"]) == before_p + 1)
    check("종일 일정 → 할 일 제목·날짜", posted.get("title") == "팀 회의 준비" and posted.get("date") == "2026-11-22", json.dumps(posted, ensure_ascii=False))
    check("종일 일정 → 할 일 분류·프로젝트", posted.get("category") == "업무" and posted.get("projectIds") == ["pj-work"], json.dumps(posted, ensure_ascii=False))
    check("종일 일정 → 할 일 종일(시각 없음)", posted.get("startTime") in (None, ""), json.dumps(posted, ensure_ascii=False))
    check("종일 일정 원본은 휴지통", last_patch(mock, "calendar", "ev-all").get("trash") is True)
    shot(page, "pc-week-event-to-task")

    # ── 할 일 → 종일 일정 ──
    mouse_drag(page, "[data-week-task='tk-free']", "[data-drop-zone='allday-day'][data-drop-day='2026-11-19']")
    posted = last_post(mock, "calendar")
    check("할 일 → 종일 일정 생성", posted.get("title") == "약국 들르기" and posted.get("kind") == "일정", json.dumps(posted, ensure_ascii=False))
    check("할 일 → 종일 일정 날짜·시각 없음", posted.get("date") == "2026-11-19" and posted.get("startTime") in (None, ""), json.dumps(posted, ensure_ascii=False))
    check("할 일 원본은 휴지통", last_patch(mock, "projects", "tk-free").get("trash") is True)

    # ── 할 일 → 시간표 칸(시간 일정) ──
    mouse_drag(page, "[data-week-task='tk-study']", "[data-drop-zone='timeline-day'][data-drop-day='2026-11-20']", frac=0.3)
    posted = last_post(mock, "calendar")
    check("할 일 → 시간 일정 생성", posted.get("title") == "강의 듣기" and posted.get("date") == "2026-11-20", json.dumps(posted, ensure_ascii=False))
    check("할 일 → 시간 일정에 시작 시각", bool(posted.get("startTime")), json.dumps(posted, ensure_ascii=False))
    check("할 일 → 시간 일정 원본 정리", last_patch(mock, "projects", "tk-study").get("trash") is True)
    shot(page, "pc-week-task-to-event")

    # ── 놓을 자리 안내 ──
    s = box_of(page, "[data-timeline-event='ev-time']") if count(page, "[data-timeline-event='ev-time']") else None
    hint = ""
    if s:
        target = page.locator("[data-drop-zone='week-task-day'][data-drop-project='pj-work'][data-drop-day='2026-11-18']").first.bounding_box()
        target = (target["x"] + target["width"] / 2, target["y"] + target["height"] / 2)
        page.mouse.move(s[0], s[1])
        page.mouse.down()
        page.mouse.move(s[0] + 14, s[1], steps=4)
        page.mouse.move(target[0], target[1], steps=14)
        page.wait_for_timeout(250)
        hint = page.locator(".dnd-ghost-hint").first.inner_text() if count(page, ".dnd-ghost-hint") else ""
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
    check("끌 때 '할 일로 옮기기' 안내", "할 일로 옮기기" in (hint or ""), hint)

    # ── 시간 일정 → 프로젝트 할 일 (시각 유지) ──
    mouse_drag(page, "[data-timeline-event='ev-time']",
               "[data-drop-zone='week-task-day'][data-drop-project='pj-home'][data-drop-day='2026-11-22']")
    posted = last_post(mock, "projects")
    check("시간 일정 → 할 일 변환", posted.get("title") == "치과 예약" and posted.get("date") == "2026-11-22", json.dumps(posted, ensure_ascii=False))
    check("시간 일정 → 할 일 시각 유지", posted.get("startTime") == "14:00", json.dumps(posted, ensure_ascii=False))
    check("시간 일정 원본 정리", last_patch(mock, "calendar", "ev-time").get("trash") is True)

    check("주간 변환 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:2]))
    ctx.close()


def pc_schedule_card(browser):
    mock = ui.Mock(fixture())
    ctx, page, errors = open_page(browser, 1440, 900, mock)
    goto_tab(page, "프로젝트")

    check("일정 카드가 있음", count(page, "[data-schedule-card]") == 1)
    order = page.evaluate("""() => {
      const index = document.querySelector('[data-index-card]');
      const next = index ? index.nextElementSibling : null;
      return next ? next.getAttribute('data-schedule-card') : null;
    }""")
    check("일정 카드는 index 바로 옆", order == "true", str(order))
    badge = page.locator("[data-schedule-event='ev-all'] [data-schedule-badge]").first.inner_text()
    check("카드에 분류 배지", badge == "업무", badge)
    check("카드에 남은 일정", count(page, "[data-schedule-event]") >= 3)
    shot(page, "pc-projects-schedule-card")

    # ── 서랍: 전체/진행/완료 + 분류 필터 ──
    page.get_by_role("button", name="일정 열기").first.click()
    page.wait_for_timeout(700)
    check("일정 서랍이 열림", count(page, "[data-schedule-drawer]") == 1)
    check("서랍에 전체/진행/완료", page.locator("[data-schedule-drawer]").get_by_role("button", name=re.compile("^(전체|진행|완료) ")).count() == 3)
    check("서랍에 분류 필터", count(page, "[data-schedule-category='업무']") == 1)
    page.locator("[data-schedule-category='업무']").first.click()
    page.wait_for_timeout(500)
    check("서랍 분류 필터 · 업무", count(page, "[data-schedule-drawer-event='ev-all']") == 1
          and count(page, "[data-schedule-drawer-event='ev-time']") == 0)
    shot(page, "pc-schedule-drawer")
    page.keyboard.press("Escape")
    page.wait_for_timeout(700)
    check("서랍 닫힘", count(page, "[data-schedule-drawer]") == 0)

    # ── 할 일 → 일정 카드 ──
    mouse_drag(page, "[data-task-id='tk-work']", "[data-schedule-card]")
    posted = last_post(mock, "calendar")
    check("할 일 → 일정 변환", posted.get("title") == "사례 정리" and posted.get("kind") == "일정", json.dumps(posted, ensure_ascii=False))
    check("할 일 → 일정 원본 정리", last_patch(mock, "projects", "tk-work").get("trash") is True)
    shot(page, "pc-schedule-task-to-event")

    # ── 일정 → 프로젝트 카드 ──
    mouse_drag(page, "[data-schedule-event='ev-all']", "[data-project-card='pj-home']")
    posted = last_post(mock, "projects")
    check("일정 → 프로젝트 할 일 변환", posted.get("title") == "팀 회의 준비" and posted.get("projectIds") == ["pj-home"], json.dumps(posted, ensure_ascii=False))
    check("일정 → 할 일 원본 정리", last_patch(mock, "calendar", "ev-all").get("trash") is True)

    check("프로젝트 탭 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:2]))
    ctx.close()


# ───────────────────────────────── 모바일 ─────────────────────────────────

def mobile_touch(browser):
    mock = ui.Mock(fixture())
    ctx, page, errors = open_page(browser, 390, 844, mock, touch=True)
    touch = Touch(page, lambda selector: box_of(page, selector))
    goto_tab(page, "프로젝트")
    page.wait_for_timeout(500)
    shot(page, "mobile-projects")

    # ── 손가락: index 의 할 일 → 일정 카드 ──
    page.locator("[data-index-card]").first.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    touch.drag("[data-task-drag='tk-free']", "[data-schedule-card]")
    wait_for(page, lambda: last_post(mock, "calendar").get("title") == "약국 들르기")
    posted = last_post(mock, "calendar")
    check("모바일: 할 일 → 일정", posted.get("title") == "약국 들르기", json.dumps(posted, ensure_ascii=False))
    check("모바일: 할 일 원본 정리", last_patch(mock, "projects", "tk-free").get("trash") is True)
    shot(page, "mobile-task-to-event")

    # ── 손가락: 일정 카드의 일정 → index 카드 ──
    page.locator("[data-schedule-card]").first.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    touch.drag("[data-schedule-drag='ev-all']", "[data-index-card]")
    wait_for(page, lambda: last_patch(mock, "calendar", "ev-all").get("trash") is True)
    posted = last_post(mock, "projects")
    check("모바일: 일정 → index 할 일", posted.get("title") == "팀 회의 준비" and posted.get("projectIds") == [], json.dumps(posted, ensure_ascii=False))
    check("모바일: 일정 원본 정리", last_patch(mock, "calendar", "ev-all").get("trash") is True)
    shot(page, "mobile-event-to-task")

    check("모바일: 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:2]))
    ctx.close()


def mobile_week(browser):
    mock = ui.Mock(fixture())
    ctx, page, errors = open_page(browser, 390, 844, mock, touch=True)
    touch = Touch(page, lambda selector: box_of(page, selector))
    goto_tab(page, "캘린더")
    page.wait_for_timeout(600)
    shot(page, "mobile-week")
    check("모바일: 캘린더 NOW 버튼", count(page, "[data-calendar-now]") == 1)

    # 종일 일정 → 프로젝트 칸(손가락)
    page.locator("[data-all-day-bar='ev-all']").first.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    touch.drag("[data-all-day-bar='ev-all']",
               "[data-drop-zone='week-task-day'][data-drop-project='pj-home'][data-drop-day='2026-11-22']", hold=240)
    wait_for(page, lambda: last_patch(mock, "calendar", "ev-all").get("trash") is True)
    posted = last_post(mock, "projects")
    check("모바일: 종일 일정 → 할 일", posted.get("title") == "팀 회의 준비", json.dumps(posted, ensure_ascii=False))
    check("모바일: 원본 일정 정리", last_patch(mock, "calendar", "ev-all").get("trash") is True)
    shot(page, "mobile-week-event-to-task")
    check("모바일 주간 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:2]))
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = launch(p)
        pc_filters_and_now(browser)
        pc_week_conversion(browser)
        pc_schedule_card(browser)
        mobile_touch(browser)
        mobile_week(browser)
        browser.close()

    print()
    print(f"PASS {len(ui.PASSES)} · FAIL {len(ui.FAILS)}")
    for item in ui.FAILS:
        print("  FAIL", item)
    raise SystemExit(1 if ui.FAILS else 0)


if __name__ == "__main__":
    main()
