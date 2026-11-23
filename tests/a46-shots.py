"""A46 화면 확인용 — 네 탭을 PC(1440x900)·모바일(390x844)에서 찍습니다."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--force-color-profile=srgb"])
    for width, height, suffix in [(1440, 900, "pc"), (390, 844, "mobile")]:
        ctx = browser.new_context(
            viewport={"width": width, "height": height},
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            is_mobile=width < 640,
            has_touch=width < 640,
            device_scale_factor=2 if width < 640 else 1,
        )
        page = ctx.new_page()
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1400)
        for key, name in [("calendar", "calendar"), ("projects", "projects"), ("binder", "binder"), ("archive", "archive")]:
            page.click(f'[data-tab="{key}"]')
            page.wait_for_timeout(900)
            page.screenshot(path=f"{OUT}/a46-{suffix}-{name}.png")
        # 바인더: 주간에서 한 칸 펼친 모습
        page.click('[data-tab="binder"]')
        page.wait_for_timeout(500)
        day = page.evaluate(
            """() => { const cells=[...document.querySelectorAll('[data-binder-day]')];
                const v=cells.find(c=>{const r=c.getBoundingClientRect(); return r.height>10 && r.top>0 && r.top<window.innerHeight-60;});
                return v?.dataset.binderDay; }"""
        )
        if day:
            page.evaluate(f"""() => document.querySelector('[data-binder-day="{day}"] button[aria-label*="쓰기"]')?.click()""")
            page.wait_for_timeout(500)
            page.fill("[data-binder-expanded] textarea", "오늘은 아침에 일찍 일어나서\n천천히 커피를 내렸다.\n\n- 창밖은 흐렸고\n- 머리는 맑았다\n\n**기억하고 싶은 문장**")
            page.wait_for_timeout(400)
            page.screenshot(path=f"{OUT}/a46-{suffix}-binder-writing.png")
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
        # 바인더 노트 → 꾸미기 편집기
        page.evaluate("""() => { const b=[...document.querySelectorAll('button.seg-item')].find(el=>(el.innerText||'').trim()==='Notes'); if(b) b.click(); }""")
        page.wait_for_timeout(600)
        page.evaluate("document.querySelector('[data-note-card]')?.click()")
        page.wait_for_timeout(800)
        page.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')==='본문 수정'); if(b) b.click(); }""")
        page.wait_for_timeout(600)
        page.screenshot(path=f"{OUT}/a46-{suffix}-note-editor.png")
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        ctx.close()
    browser.close()
print("shots done")
