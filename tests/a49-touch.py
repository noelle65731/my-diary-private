"""A49 모바일 손가락 확인 — ① 달 넘기기 스와이프가 그대로 ② 날짜 칸에서 꾹 눌러 같은 시각 순서 바꾸기."""
import json
import os
import sys
import time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
results, errors = [], []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


class Touch:
    def __init__(self, page):
        self.cdp = page.context.new_cdp_session(page)

    def send(self, kind, points):
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": 1} for (x, y) in points]})

    def down(self, x, y):
        self.send("touchStart", [(x, y)])

    def move(self, x, y):
        self.send("touchMove", [(x, y)])

    def up(self):
        self.send("touchEnd", [])

    def glide(self, x, y, tx, ty, steps=16, pause=0.02):
        for step in range(1, steps + 1):
            self.move(x + (tx - x) * step / steps, y + (ty - y) * step / steps)
            time.sleep(pause)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    ctx = b.new_context(viewport={"width": 390, "height": 844}, locale="ko-KR", timezone_id="Asia/Seoul", is_mobile=True, has_touch=True, device_scale_factor=2)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-view-switch]", timeout=25000)
    page.evaluate("() => localStorage.removeItem('my-diary:day-order:v1')")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("[data-view-switch]", timeout=25000)
    page.click('[data-view-switch] button[aria-label="월간"]')
    page.wait_for_timeout(600)
    if page.evaluate("() => document.querySelector('[data-calendar-tasks-toggle]')?.getAttribute('aria-pressed')") != "true":
        page.click("[data-calendar-tasks-toggle]")
        page.wait_for_timeout(400)
    title_before = page.inner_text("h1")
    touch = Touch(page)

    # ① 달 넘기기 스와이프 (그리드 위에서 왼쪽으로)
    box = page.evaluate("""() => { const g = document.querySelector('[data-month-row]').parentElement.getBoundingClientRect(); return {x: g.x, y: g.y, w: g.width, h: g.height}; }""")
    sx, sy = box["x"] + box["w"] - 60, box["y"] + box["h"] / 2
    touch.down(sx, sy)
    touch.glide(sx, sy, sx - 160, sy, steps=10, pause=0.02)
    touch.up()
    page.wait_for_timeout(700)
    title_after = page.inner_text("h1")
    check("모바일 — 달 넘기기 스와이프 그대로", title_before != title_after, f"{title_before} → {title_after}")
    # 되돌리기
    touch.down(sx - 160, sy)
    touch.glide(sx - 160, sy, sx, sy, steps=10, pause=0.02)
    touch.up()
    page.wait_for_timeout(700)
    check("모바일 — 되돌아옴", page.inner_text("h1") == title_before, page.inner_text("h1"))

    # ② 날짜 칸에서 꾹 눌러 같은 시각 순서 바꾸기
    page.evaluate("""() => document.querySelector('[data-month-cell="2026-11-24"]').scrollIntoView({block: 'center'})""")
    page.wait_for_timeout(400)
    board = page.evaluate("""() => {
      const a = document.querySelector('[data-month-order-item="e:demo-ev-17"]');
      const t = document.querySelector('[data-month-order-item="e:demo-ev-1"]');
      if (!a || !t) return null;
      const r1 = a.getBoundingClientRect(), r2 = t.getBoundingClientRect();
      return {from: [r1.x + r1.width / 2, r1.y + r1.height / 2], to: [r2.x + r2.width / 2, r2.y + 3]};
    }""")
    if board:
        touch.down(*board["from"])
        time.sleep(0.30)
        touch.glide(board["from"][0], board["from"][1], board["to"][0], board["to"][1], steps=14, pause=0.03)
        touch.up()
        page.wait_for_timeout(800)
        order = page.evaluate("""() => [...document.querySelectorAll('[data-month-cell="2026-11-24"] [data-month-order-item]')].map(e => e.getAttribute('data-month-order-item'))""")
        check("모바일 — 날짜 칸에서 꾹 눌러 같은 시각 순서 바꾸기", order[:2] == ["e:demo-ev-17", "e:demo-ev-1"], json.dumps(order))
        check("모바일 — 꾹 끌기 뒤 달이 넘어가지 않음", page.inner_text("h1") == title_before, page.inner_text("h1"))
    else:
        check("모바일 — 날짜 칸 항목 찾기", False, "칸 안 항목 없음")
    page.screenshot(path="/workspace/downloads/a49-mo-cell-drag.png")
    ctx.close()
    b.close()

print("ERRORS:", errors[:6])
print(f"RESULT: {sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) and not errors else 1)
