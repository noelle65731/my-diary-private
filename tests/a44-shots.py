"""A44 빠른 화면 확인 — PC(1440x900)·모바일(390x844) 캘린더 상단·일정 창·막대."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
os.makedirs(OUT, exist_ok=True)


def boot(browser, width, height):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR", timezone_id="Asia/Seoul",
                              is_mobile=width < 640, has_touch=width < 640)
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)
    return ctx, page


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"],
                                env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    for w, h, tag in ((1440, 900, "pc"), (390, 844, "mo")):
        ctx, page = boot(browser, w, h)
        page.screenshot(path=f"{OUT}/a44-shot-{tag}-week.png")
        if tag == "pc":
            page.click('button[aria-label="월간"]')
            page.wait_for_timeout(800)
            page.screenshot(path=f"{OUT}/a44-shot-{tag}-month.png")
            page.click('[data-new-event="true"]')
            page.wait_for_timeout(700)
            page.screenshot(path=f"{OUT}/a44-shot-{tag}-editor.png")
            page.click('[data-editor-multi-day="true"]')
            page.wait_for_timeout(500)
            page.screenshot(path=f"{OUT}/a44-shot-{tag}-editor-multi.png")
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
            page.click('button[aria-label="주간"]')
            page.wait_for_timeout(700)
            page.screenshot(path=f"{OUT}/a44-shot-{tag}-week2.png")
        else:
            page.click('button[aria-label="월간"]')
            page.wait_for_timeout(800)
            page.screenshot(path=f"{OUT}/a44-shot-{tag}-month.png")
            page.click('[data-new-event="true"]')
            page.wait_for_timeout(700)
            page.screenshot(path=f"{OUT}/a44-shot-{tag}-editor.png")
        ctx.close()
    browser.close()
print("shots done")
