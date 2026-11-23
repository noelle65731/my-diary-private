"""A46 추가 검증 — 서랍 드래그로 실제 이동 · index 서랍 · 단일 카드 드래그 이동 · 항목이 많아도 플로팅 입력.

PC(1440x900)와 모바일(390x844)에서 확인하고 대표 스크린샷을 남깁니다.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
os.makedirs(OUT, exist_ok=True)
results, errors = [], []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def boot(browser, width, height, tag):
    ctx = browser.new_context(
        viewport={"width": width, "height": height},
        locale="ko-KR",
        timezone_id="Asia/Seoul",
        is_mobile=width < 640,
        has_touch=width < 640,
    )
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"[{tag}] {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)
    return ctx, page


def tab(page, key):
    page.click(f'[data-tab="{key}"]')
    page.wait_for_timeout(500)


def drag(page, start, end, steps=14):
    page.mouse.move(start["x"], start["y"])
    page.mouse.down()
    page.mouse.move(start["x"] + 12, start["y"] + 12, steps=3)
    page.wait_for_timeout(120)
    page.mouse.move(end["x"], end["y"], steps=steps)
    page.wait_for_timeout(200)
    page.mouse.up()
    page.wait_for_timeout(900)


def run(browser, width, height, tag):
    ctx, page = boot(browser, width, height, tag)
    mobile = width < 640
    suffix = "mobile" if mobile else "pc"

    # ── 서랍에서 다른 프로젝트 카드로 끌어 이동 ───────────────
    tab(page, "projects")
    page.wait_for_timeout(500)
    # 폰에서는 카드가 화면 밖에 있을 수 있어, 놓을 카드를 먼저 화면 가운데로 올립니다.
    page.evaluate("() => { const c = document.querySelectorAll('[data-project-card]')[1]; if (c) c.scrollIntoView({block: 'center'}); }")
    page.wait_for_timeout(400)
    cards = page.evaluate(
        """() => [...document.querySelectorAll('[data-project-card]')].map(c => {
            const r = c.getBoundingClientRect();
            return {id: c.dataset.projectCard, x: r.x + r.width/2, y: r.y + 24, visible: r.top > 40 && r.top < window.innerHeight - 120};
        })"""
    )
    page.evaluate("document.querySelector('[data-project-card]')?.click()")
    page.wait_for_timeout(700)
    row = page.query_selector('[data-task-row] button[class*="min-w-0"]')
    check(f"{tag} 서랍에 할 일 있음", row is not None)
    targets = [c for c in cards[1:] if c["visible"]] or [c for c in cards[1:] if c["y"] < 800]
    if row and targets:
        rb = row.bounding_box()
        target = targets[-1]
        drag(page, {"x": rb["x"] + rb["width"] / 2, "y": rb["y"] + rb["height"] / 2}, {"x": target["x"], "y": target["y"]})
        toast = page.evaluate("() => document.body.innerText.includes('옮겼습니다') || document.body.innerText.includes('옮겻습니다')")
        check(f"{tag} 서랍 밖 카드로 끌어 이동 + 토스트", toast, target["id"])
        hidden_now = page.evaluate("() => document.querySelector('[data-drawer-root]')?.getAttribute('role') ?? 'closed'")
        check(f"{tag} 이동 뒤 서랍 상태 정상", hidden_now in ("dialog", "closed"), str(hidden_now))
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # ── index 서랍에서도 같은 동작 ─────────────────────────────
    page.evaluate("document.querySelector('[data-index-card]')?.click()")
    page.wait_for_timeout(700)
    index_open = page.evaluate("() => !!document.querySelector('[data-index-drawer]')")
    check(f"{tag} index 서랍 열림", index_open)
    if index_open:
        row = page.query_selector('[data-index-drawer] [data-task-row] button[class*="min-w-0"]')
        has_move = page.evaluate("document.querySelectorAll('[data-index-drawer] [data-task-move]').length")
        check(f"{tag} index 서랍 빠른 이동 버튼", has_move > 0, f"{has_move}개")
        if row and targets:
            rb = row.bounding_box()
            target = targets[0]
            drag(page, {"x": rb["x"] + rb["width"] / 2, "y": rb["y"] + rb["height"] / 2}, {"x": target["x"], "y": target["y"]})
            check(
                f"{tag} index 서랍에서 끌어 이동",
                page.evaluate("() => document.body.innerText.includes('옮겼습니다') || document.body.innerText.includes('옮겻습니다')"),
                target["id"],
            )
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

    page.screenshot(path=f"{OUT}/a46-{suffix}-projects.png")

    # ── 아카이브: 단일 카드 드래그로 분류 이동 ────────────────
    tab(page, "archive")
    page.wait_for_timeout(600)
    # 항목을 여러 개 담아 봅니다(플로팅 입력은 그대로 아래에 떠 있어야 합니다).
    for i in range(6):
        page.fill("[data-archive-quick-add] input", f"확인용 메모 {i+1}")
        page.press("[data-archive-quick-add] input", "Enter")
        page.wait_for_timeout(500)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
    count = page.evaluate("document.querySelectorAll('[data-archive-card]').length")
    check(f"{tag} 메모가 쌓여도 플로팅 입력 고정", count >= 8, f"{count}개")
    before_top = page.evaluate("() => Math.round(document.querySelector('[data-archive-quick-add]').getBoundingClientRect().top)")
    page.evaluate("() => { const main = document.querySelector('main'); if (main) main.scrollTop = 400; }")
    page.wait_for_timeout(400)
    after_top = page.evaluate("() => Math.round(document.querySelector('[data-archive-quick-add]').getBoundingClientRect().top)")
    check(f"{tag} 스크롤해도 입력창이 화면 아래에 붙어 있음", abs(before_top - after_top) <= 2, f"{before_top}→{after_top}")

    page.evaluate("() => { const main = document.querySelector('main'); if (main) main.scrollTop = 0; }")
    page.wait_for_timeout(300)
    card = page.evaluate(
        """() => { const c = document.querySelector('[data-archive-card]'); const r = c.getBoundingClientRect();
            return {id: c.dataset.archiveCard, x: r.x + r.width/2, y: r.y + 30, title: c.innerText.split('\\n')[1] || ''}; }"""
    )
    chip = page.evaluate(
        """() => { const el = document.querySelector('[data-archive-kind="영화"]'); const r = el.getBoundingClientRect();
            return {x: r.x + r.width/2, y: r.y + r.height/2}; }"""
    )
    drag(page, {"x": card["x"], "y": card["y"]}, chip)
    moved = page.evaluate(
        """(id) => document.querySelector(`[data-archive-card="${id}"]`)?.innerText.split('\\n')[0]""", card["id"]
    )
    check(f"{tag} 카드 하나를 분류 칩으로 끌어 이동", moved == "영화", str(moved))

    page.screenshot(path=f"{OUT}/a46-{suffix}-archive.png")
    ctx.close()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--force-color-profile=srgb"])
    run(browser, 1440, 900, "PC")
    run(browser, 390, 844, "모바일")
    browser.close()

print()
print(f"통과 {sum(1 for r in results if r[1])} / {len(results)}")
if errors:
    print("콘솔 오류", len(errors))
    for e in errors[:10]:
        print(" ", e)
else:
    print("콘솔 오류 0건")
sys.exit(0 if all(r[1] for r in results) else 1)
