"""Quick visual pass at PC / tablet / mobile widths."""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3210")
CHROME = os.environ.get("CHROME")  # 비워 두면 Playwright 기본 Chromium을 씁니다
OUT = os.environ.get("OUT", "/workspace/work/diary-shots")
VIEWPORTS = [("pc", 1440, 900), ("tablet", 834, 1194), ("mobile", 402, 874)]
os.makedirs(OUT, exist_ok=True)

def shot(page, name):
    path = os.path.join(OUT, f"{name}.png")
    page.screenshot(path=path)
    print("shot", path)

def main():
    with sync_playwright() as p:
        args = ["--no-sandbox", "--disable-dev-shm-usage"]
        browser = p.chromium.launch(executable_path=CHROME, args=args) if CHROME else p.chromium.launch(args=args)
        for label, width, height in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, locale="ko-KR")
            page = ctx.new_page()
            page.goto(BASE, wait_until="networkidle")
            page.wait_for_timeout(1500)
            shot(page, f"{label}-week")
            page.get_by_role("button", name="월간", exact=True).click()
            page.wait_for_timeout(700)
            shot(page, f"{label}-month")
            page.get_by_role("button", name="연간", exact=True).click()
            page.wait_for_timeout(700)
            shot(page, f"{label}-year")
            ctx.close()
        browser.close()

main()
