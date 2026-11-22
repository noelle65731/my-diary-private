import json, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("BASE", "http://127.0.0.1:3237")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    c = b.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR", timezone_id="Asia/Seoul")
    page = c.new_page()
    errs=[]
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE, wait_until="networkidle"); page.wait_for_timeout(1200)
    page.click('[data-tab="projects"]'); page.wait_for_timeout(900)
    ev = page.locator('[data-schedule-card] [data-schedule-event]').first
    print("ev", ev.get_attribute("data-schedule-event"), ev.inner_text()[:40])
    ev.scroll_into_view_if_needed(); page.wait_for_timeout(300)
    tbl = page.locator('[data-project-card="demo-pj-1"]')
    tbl.scroll_into_view_if_needed(); page.wait_for_timeout(300)
    ev.scroll_into_view_if_needed(); page.wait_for_timeout(200)
    print("boxes", ev.bounding_box(), tbl.bounding_box())
    ev.drag_to(tbl)
    page.wait_for_timeout(1000)
    print("toasts", page.evaluate("() => Array.from(document.querySelectorAll('.pointer-events-auto')).map(e => e.innerText).slice(-3)"))
    print("specific", page.locator('[data-schedule-card] [data-schedule-event="demo-ev-2"]').count(), "all", page.locator('[data-schedule-card] [data-schedule-event]').count(), "pj1 tasks", page.eval_on_selector_all('[data-project-card="demo-pj-1"] [data-task-id]', "els => els.map(e => e.innerText.slice(0,30))"))
    print("errs", errs)
    c.close(); b.close()
