"""A41 1차 눈검사 — 프로젝트 카드 격자·월간 연결 막대·주간 화면."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
os.makedirs(OUT, exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR", timezone_id="Asia/Seoul")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.click('button[data-tab="projects"]')
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/a41-projects.png", full_page=True)
    page.click('button[data-tab="calendar"]')
    page.wait_for_timeout(600)
    page.click('button:has-text("월간")')
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/a41-month.png", full_page=True)
    page.click('button:has-text("주간")')
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/a41-week.png", full_page=True)
    print("ERRORS:", errors[:10])
    browser.close()
