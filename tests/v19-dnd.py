"""v19 끌기 회귀 — 카드 끌기·할 일 끌기가 새 카드 클릭 동작과 부딪히지 않는지."""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
os.makedirs(OUT, exist_ok=True)
results, errors = [], []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def center(page, selector, dx=0, dy=0):
    box = page.evaluate("""(sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; }""", selector)
    if not box:
        return None
    return (box["x"] + box["w"] / 2 + dx, box["y"] + box["h"] / 2 + dy)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR", timezone_id="Asia/Seoul")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.click('button[data-tab="projects"]')
    page.wait_for_timeout(800)

    # 1) 할 일 하나를 다른 프로젝트 카드로 끌기
    first = page.evaluate("""() => {
      const cards = [...document.querySelectorAll('article[data-project-card]')];
      const src = cards[0];
      const dst = cards[1];
      const task = src.querySelector('[data-task-drag]');
      const a = task.getBoundingClientRect(), b = dst.getBoundingClientRect();
      return {taskId: task.getAttribute('data-task-drag'), title: task.innerText.trim(),
              from: {x: a.x + a.width / 2, y: a.y + a.height / 2},
              to: {x: b.x + b.width / 2, y: b.y + 30},
              srcId: src.getAttribute('data-project-card'), dstId: dst.getAttribute('data-project-card')};
    }""")
    page.mouse.move(first["from"]["x"], first["from"]["y"])
    page.mouse.down()
    page.mouse.move(first["from"]["x"] + 30, first["from"]["y"] + 8, steps=6)
    page.mouse.move(first["to"]["x"], first["to"]["y"], steps=18)
    page.wait_for_timeout(200)
    page.mouse.up()
    page.wait_for_timeout(900)
    moved = page.evaluate("""(o) => {
      const dst = document.querySelector(`article[data-project-card="${o.dstId}"]`);
      const src = document.querySelector(`article[data-project-card="${o.srcId}"]`);
      return {inDst: !!dst?.querySelector(`[data-task-drag="${o.taskId}"]`), inSrc: !!src?.querySelector(`[data-task-drag="${o.taskId}"]`),
              dialog: !!document.querySelector('[role="dialog"]')};
    }""", first)
    check("할 일 끌어 다른 카드로 옮기기", moved["inDst"] and not moved["inSrc"] and not moved["dialog"], json.dumps(moved))

    # 2) 카드 자체를 다른 칸으로 끌기 — 끌고 난 뒤 서랍이 열리지 않아야
    cards = page.evaluate("""() => [...document.querySelectorAll('article[data-project-card]')].map(c => {
      const r = c.getBoundingClientRect();
      return {id: c.getAttribute('data-project-card'), x: r.x + r.width / 2, y: r.y + r.height - 30};
    })""")
    if len(cards) >= 2:
        page.mouse.move(cards[0]["x"], cards[0]["y"])
        page.mouse.down()
        page.mouse.move(cards[0]["x"] + 25, cards[0]["y"] - 10, steps=6)
        page.mouse.move(cards[1]["x"], cards[1]["y"], steps=18)
        page.wait_for_timeout(150)
        page.mouse.up()
        page.wait_for_timeout(800)
        after = page.evaluate("""() => ({dialog: !!document.querySelector('[role="dialog"]'), slots: localStorage.getItem('my-diary:project-card-slots:v1')})""")
        check("카드 끌기 후 서랍 안 열림", not after["dialog"] and after["slots"] is not None, json.dumps(after)[:160])
        # 카드 순서가 저장됐는지 (칸 배치)
        order = page.evaluate("""() => [...document.querySelectorAll('[data-card-slot]')].map((s, i) => ({
          slot: s.getAttribute('data-card-slot'), card: s.querySelector('[data-project-card]')?.getAttribute('data-project-card') ?? null}))""")
        print("SLOTS:", json.dumps(order, ensure_ascii=False)[:400])
    ctx.close()
    browser.close()

print("ERRORS:", errors[:8])
print(f"RESULT: {sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) and not errors else 1)
