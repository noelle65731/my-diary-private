"""A44 추가 화면 — 일간 보기(할 일 OFF)·할 일 창 흐름 확인."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR", timezone_id="Asia/Seoul")
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1400)
    page.evaluate("""() => { const b = [...document.querySelectorAll('[data-view-switch] button')].find(x => x.getAttribute('aria-label') === '일간'); b.click(); }""")
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/a44-19-pc-day-tasks-off.png")
    page.click('[data-calendar-tasks-toggle]')
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/a44-20-pc-day-tasks-on.png")
    page.click('[data-calendar-tasks-toggle]')
    page.wait_for_timeout(500)
    # 할 일 창 (프로젝트 탭 index 카드 항목)
    page.click('button[data-tab="projects"]')
    page.wait_for_timeout(800)
    page.click('article[data-project-card] [data-task-drag]')
    page.wait_for_timeout(600)
    page.screenshot(path=f"{OUT}/a44-21-pc-projects.png")
    print("errors:", errors[:5])
    ctx.close()
    browser.close()
