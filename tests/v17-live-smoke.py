"""A41 라이브 스모크 — 로그인 화면·정적 번들·API 확인 (비밀번호 없이)."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("LIVE", "https://my-diary-private.vercel.app")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR", timezone_id="Asia/Seoul")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    resp = page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)
    print("status:", resp.status)
    print("has password field:", page.locator("input[type=password]").count())
    print("chunk:", page.evaluate("() => Array.from(document.scripts).map(s => s.src).find(s => s.includes('/app/page-')) || ''"))
    page.screenshot(path="/workspace/downloads/diary-v17-live-login.png")
    print("errors:", errors[:5])
    b.close()
