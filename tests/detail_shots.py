"""지금 화면(개편 전/후)을 그대로 찍어 보는 스크립트.

    BASE=... CHROME=... OUT=... python3 tests/detail_shots.py

각 장면마다 새 브라우저 문맥을 열어, 앞 장면의 시트가 남아 클릭을 가로채는 일이 없게 합니다.
"""

import contextlib
import os
import re
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from detail_fixture import Mock, build_fixture  # noqa: E402

BASE = os.environ.get("BASE", "http://127.0.0.1:3231")
CHROME = os.environ.get("CHROME")
OUT = os.environ.get("OUT", "/workspace/work/detail-shots")
os.makedirs(OUT, exist_ok=True)


def launch_args():
    args = ["--no-sandbox", "--disable-dev-shm-usage"]
    return {"executable_path": CHROME, "args": args} if CHROME else {"args": args}


def dialogs(page):
    return [(page.get_by_role("dialog").nth(i).get_attribute("aria-label") or "")
            for i in range(page.get_by_role("dialog").count())]


def detail_open(page, prefix):
    return any(label.startswith(prefix) for label in dialogs(page))


@contextlib.contextmanager
def fresh_page(browser, width, height):
    mock = Mock(build_fixture())
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR")
    page = ctx.new_page()
    page.set_default_timeout(10000)
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=20000)
    page.wait_for_timeout(900)
    try:
        yield page, mock
    finally:
        ctx.close()


def month_view(page):
    page.get_by_role("button", name=re.compile("^월간$")).first.click()
    page.wait_for_timeout(700)


def open_event(page, title):
    month_view(page)
    page.get_by_role("button", name=re.compile(title)).first.click()
    page.wait_for_timeout(800)
    if detail_open(page, "일정"):
        return
    row = page.locator("[data-day-list-event]", has_text=title)
    if row.count():
        row.first.click()
        page.wait_for_timeout(800)


def goto_tab(page, name):
    page.get_by_role("button", name=re.compile(name)).last.click()
    page.wait_for_timeout(700)


def scroll_bottom(page):
    page.evaluate("""() => {
      const all = Array.from(document.querySelectorAll('[data-sheet-scroll], [data-panel-scroll]'));
      const el = all[all.length - 1];
      if (el) el.scrollTop = el.scrollHeight;
    }""")
    page.wait_for_timeout(300)


def open_task(page, title):
    goto_tab(page, "프로젝트")
    page.get_by_role("button", name=re.compile(title)).first.click()
    page.wait_for_timeout(900)


def shot(browser, w, h, name, action, bottom=False):
    with fresh_page(browser, w, h) as (page, _mock):
        action(page)
        page.wait_for_timeout(400)
        if bottom:
            scroll_bottom(page)
        page.screenshot(path=f"{OUT}/{name}.png")


def capture(browser, width, height, tag):
    shot(browser, width, height, f"{tag}-00-home", lambda page: None)
    shot(browser, width, height, f"{tag}-01-event-detail", lambda page: open_event(page, "도서관 반납"))
    shot(browser, width, height, f"{tag}-02-event-detail-bottom", lambda page: open_event(page, "도서관 반납"), bottom=True)
    shot(browser, width, height, f"{tag}-03-event-canceled", lambda page: open_event(page, "동네 모임"))
    shot(browser, width, height, f"{tag}-04-projects", lambda page: goto_tab(page, "프로젝트"))
    shot(browser, width, height, f"{tag}-05-task-detail", lambda page: open_task(page, "약국 들르기"))
    shot(browser, width, height, f"{tag}-06-task-detail-bottom", lambda page: open_task(page, "약국 들르기"), bottom=True)
    shot(browser, width, height, f"{tag}-07-task-waiting", lambda page: open_task(page, "견적 회신 기다리기"))

    def new_event(page):
        goto_tab(page, "캘린더")
        page.wait_for_timeout(400)
        direct = page.get_by_role("button", name=re.compile("새 일정"))
        if direct.count() and direct.first.is_visible():
            direct.first.click()
        else:
            page.get_by_role("button", name="빠른 추가").first.click()
            page.wait_for_timeout(400)
            page.get_by_role("button", name=re.compile("^일정")).first.click()
    shot(browser, width, height, f"{tag}-08-new-event", new_event)

    def new_task(page):
        goto_tab(page, "프로젝트")
        page.get_by_role("button", name=re.compile("새 할 일|\\+ 할 일|할 일 추가|새로 만들기")).first.click()
    shot(browser, width, height, f"{tag}-09-new-task", new_task)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        capture(browser, 1440, 900, "pc")
        capture(browser, 402, 874, "mo")
        browser.close()
    print("done", OUT)


if __name__ == "__main__":
    main()
