"""A44 3일 보기 확인 — 하루짜리 종일 막대 · 프로젝트 영역 토글."""
import json
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
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
    page.evaluate("""() => { const b = [...document.querySelectorAll('[data-view-switch] button')].find(x => x.getAttribute('aria-label') === '3일'); b.click(); }""")
    page.wait_for_timeout(800)
    # 27일(주간 장보기, 하루짜리 종일)이 보이도록 다음으로 두 번 이동
    page.evaluate("""() => { [...document.querySelectorAll('[aria-label="다음"]')][0].click(); }""")
    page.wait_for_timeout(600)
    off = page.evaluate("""() => ({
      bars: [...document.querySelectorAll('[data-all-day-bar]')].map(el => ({id: el.getAttribute('data-all-day-bar'), bg: getComputedStyle(el).backgroundColor})),
      cells: document.querySelectorAll('[data-week-project-cell]').length,
      count: document.querySelector('[data-week-task-count]')?.innerText.trim() || null,
      toggle: document.querySelector('[data-week-projects-toggle]')?.innerText.trim() || null,
      list: [...document.querySelectorAll('[data-week-event]')].map(el => el.getAttribute('data-week-event')),
    })""")
    page.screenshot(path="/workspace/downloads/a44-24-pc-three-days.png")
    page.click('[data-calendar-tasks-toggle]')
    page.wait_for_timeout(600)
    on = page.evaluate("""() => ({
      cells: document.querySelectorAll('[data-week-project-cell]').length,
      toggle: document.querySelector('[data-week-projects-toggle]')?.innerText.trim() || null,
    })""")
    print(json.dumps({"off": off, "on": on, "errors": errors[:5]}, ensure_ascii=False, indent=1))
    ctx.close()
    browser.close()
