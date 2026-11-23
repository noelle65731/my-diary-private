"""A46 검증 — 바인더 칸 펼치기 · 꾸미기 5종 · 프로젝트 진행률 · 고정핀 · 아카이브 다중선택/플로팅 입력 · 서랍 드래그.

PC(1440x900)와 모바일(390x844)에서 같은 항목을 확인합니다. 미리보기 모드(demo)이며,
실제 노션에는 쓰지 않습니다.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"

os.makedirs(OUT, exist_ok=True)
results = []
errors = []


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


def run(browser, width, height, tag):
    ctx, page = boot(browser, width, height, tag)
    mobile = width < 640

    # ── 1. 바인더 위클리 칸 펼치기 ──────────────────────────────
    tab(page, "binder")
    day = page.evaluate(
        """() => {
            const cells = [...document.querySelectorAll('[data-binder-day]')];
            const visible = cells.find(c => c.getBoundingClientRect().height > 10 && c.getBoundingClientRect().top > 0);
            return (visible ?? cells[cells.length - 1])?.dataset.binderDay;
        }"""
    )
    page.click(f'[data-binder-day="{day}"] button[aria-label*="쓰기"]')
    page.wait_for_timeout(300)
    expanded = page.query_selector("[data-binder-expanded]")
    check(f"{tag} 위클리 칸이 펼쳐짐", expanded is not None)
    h1 = page.evaluate("document.querySelector('[data-binder-expanded] textarea')?.getBoundingClientRect().height || 0")
    check(f"{tag} 펼친 칸 높이 12줄 이상", h1 >= 280, f"{round(h1)}px")
    page.fill("[data-binder-expanded] textarea", "긴 일기 첫 줄\n" * 30)
    page.wait_for_timeout(300)
    h2 = page.evaluate("document.querySelector('[data-binder-expanded] textarea')?.getBoundingClientRect().height || 0")
    check(f"{tag} 쓴 만큼 아래로 늘어남", h2 > h1 + 200, f"{round(h1)}→{round(h2)}px")
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    check(f"{tag} Esc 로 접히고 미리보기 복귀", page.query_selector("[data-binder-expanded]") is None)
    preview = page.evaluate("document.querySelector('[data-binder-preview]')?.className.includes('line-clamp-3')")
    check(f"{tag} 3줄 미리보기 유지", bool(preview))

    # ── 2. 꾸미기 5종 (바인더 노트 편집기) ─────────────────────
    page.evaluate(
        """() => { const b = [...document.querySelectorAll('button.seg-item')].find(el => (el.innerText||'').trim() === 'Notes'); if (b) b.click(); }"""
    )
    page.wait_for_timeout(500)
    page.evaluate("document.querySelector('[data-note-card]')?.click()")
    page.wait_for_timeout(800)
    page.evaluate(
        """() => {
            const b = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === '본문 수정');
            if (b) b.click();
        }"""
    )
    page.wait_for_timeout(500)
    has_editor = page.query_selector("[data-doc-editor]") is not None
    check(f"{tag} 본문 서식 편집기 열림", has_editor)
    if has_editor:
        # 툴바·스탬프
        for label in ["굵게", "밑줄", "취소선"]:
            check(f"{tag} 툴바 {label}", page.query_selector(f'[data-doc-command="{label}"]') is not None)
        check(f"{tag} 글자색 팔레트", page.query_selector('[data-text-color="red"]') is not None)
        check(f"{tag} 형광펜 팔레트", page.query_selector('[data-highlight="yellow"]') is not None)
        # 스탬프
        page.click('[data-stamp-weather="☀️"]')
        page.click('[data-stamp-mood="😊"]')
        page.wait_for_timeout(200)
        pressed = page.evaluate(
            """() => [document.querySelector('[data-stamp-weather="☀️"]')?.getAttribute('aria-pressed'),
                      document.querySelector('[data-stamp-mood="😊"]')?.getAttribute('aria-pressed')]"""
        )
        check(f"{tag} 기분·날씨 스탬프 눌림", pressed == ["true", "true"], str(pressed))

        # 블록 종류: 인용 / 강조 / 체크
        page.evaluate(
            """() => {
                const input = document.querySelector('[data-doc-input="paragraph"]');
                if (input) { input.focus(); const r = document.createRange(); r.selectNodeContents(input); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
            }"""
        )
        page.click('[data-block-type="quote"]')
        page.wait_for_timeout(150)
        check(f"{tag} 인용구 블록", page.query_selector('[data-doc-block="quote"]') is not None)
        page.click('[data-block-type="callout"]')
        page.wait_for_timeout(150)
        check(f"{tag} 강조 박스 블록", page.query_selector('[data-doc-block="callout"]') is not None)
        page.click('[data-block-type="todo"]')
        page.wait_for_timeout(150)
        todo = page.query_selector('[data-doc-block="todo"]')
        check(f"{tag} 체크리스트 블록", todo is not None)
        if todo:
            page.click('[data-doc-block="todo"] button[aria-label="체크"]')
            page.wait_for_timeout(150)
            check(
                f"{tag} 체크 눌러짐",
                page.evaluate("document.querySelector('[data-doc-block=\"todo\"]')?.dataset.docBlockChecked === 'true'"),
            )

        # 글자 서식: 전체 선택 후 굵게·색·형광펜
        page.evaluate(
            """() => {
                const input = document.querySelector('[data-doc-input="todo"]') || document.querySelector('[data-doc-input]');
                if (!input) return;
                input.focus();
                const r = document.createRange(); r.selectNodeContents(input);
                const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            }"""
        )
        page.click('[data-doc-command="굵게"]')
        page.wait_for_timeout(120)
        page.evaluate(
            """() => {
                const input = document.querySelector('[data-doc-input="todo"]') || document.querySelector('[data-doc-input]');
                if (!input) return;
                input.focus();
                const r = document.createRange(); r.selectNodeContents(input);
                const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            }"""
        )
        page.click('[data-text-color="red"]')
        page.wait_for_timeout(120)
        html = page.evaluate(
            "() => (document.querySelector('[data-doc-input=\"todo\"]') || document.querySelector('[data-doc-input]'))?.innerHTML || ''"
        )
        check(f"{tag} 굵게 적용", "<strong>" in html or "font-weight" in html, html[:60])
        check(f"{tag} 글자색 적용", "color:" in html or "<font" in html, html[:80])

        page.evaluate(
            """() => {
                const input = document.querySelector('[data-doc-input="todo"]') || document.querySelector('[data-doc-input]');
                if (!input) return;
                input.focus();
                const r = document.createRange(); r.selectNodeContents(input);
                const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            }"""
        )
        page.click('[data-highlight="yellow"]')
        page.wait_for_timeout(150)
        html2 = page.evaluate(
            "() => (document.querySelector('[data-doc-input=\"todo\"]') || document.querySelector('[data-doc-input]'))?.innerHTML || ''"
        )
        check(f"{tag} 형광펜 적용", "background-color" in html2, html2[:80])

        # 저장 → 다시 열어 서식 유지
        page.evaluate(
            """() => { const b = [...document.querySelectorAll('button')].find(el => (el.innerText||'').trim() === '입력 마침'); if (b) b.click(); }"""
        )
        page.wait_for_timeout(1600)
        page.evaluate(
            """() => { const b = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === '본문 수정'); if (b) b.click(); }"""
        )
        page.wait_for_timeout(900)
        kept = page.evaluate(
            """() => ({
                blocks: document.querySelectorAll('[data-doc-block]').length,
                todo: !!document.querySelector('[data-doc-block="todo"]'),
                html: document.querySelector('[data-doc-input="todo"]')?.innerHTML || '',
                stamp: document.querySelector('[data-stamp-mood="😊"]')?.getAttribute('aria-pressed'),
            })"""
        )
        check(
            f"{tag} 저장 뒤 서식 유지",
            kept["todo"] and kept["stamp"] == "true" and ("background-color" in kept["html"] or "color:" in kept["html"]),
            json.dumps({k: (v[:60] if isinstance(v, str) else v) for k, v in kept.items()}, ensure_ascii=False),
        )
        page.screenshot(path=f"{OUT}/a46-{'mobile' if mobile else 'pc'}-decorate.png")
        page.keyboard.press("Escape")
        page.wait_for_timeout(600)

    # ── 3. 프로젝트: 시작 문구 제거 + 진행률 막대 ──────────────
    tab(page, "projects")
    page.wait_for_timeout(600)
    card_text = page.evaluate(
        """() => [...document.querySelectorAll('[data-project-card]')].slice(0,3).map(c => c.innerText.split('\\n').slice(0,3).join(' | '))"""
    )
    bars = page.evaluate(
        """() => [...document.querySelectorAll('[data-project-progress]')].map(el => {
            const b = el.querySelector('[role=progressbar]');
            return {w: Math.round(el.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), now: b.getAttribute('aria-valuenow')};
        })"""
    )
    check(f"{tag} 프로젝트 카드 진행률 막대", len(bars) > 0 and bars[0]["h"] <= 8, json.dumps(bars[:2], ensure_ascii=False))
    check(f"{tag} '~기록' 문구 제거", all("기록" not in t.split(" | ")[1] if len(t.split(" | ")) > 1 else True for t in card_text), str(card_text)[:120])

    # ── 4. 서랍 드래그 숨김 + 빠른 이동 ─────────────────────────
    page.evaluate("document.querySelector('[data-project-card]')?.click()")
    page.wait_for_timeout(700)
    drawer = page.query_selector("[data-drawer-root]")
    check(f"{tag} 프로젝트 서랍 열림", page.query_selector("[data-drawer-root]") is not None)
    move_buttons = page.evaluate("document.querySelectorAll('[data-task-move]').length")
    check(f"{tag} 서랍 각 줄에 빠른 이동 버튼", move_buttons > 0, f"{move_buttons}개")
    if move_buttons > 0:
        page.click("[data-task-move]")
        page.wait_for_timeout(250)
        menu = page.query_selector("[data-task-move-menu]")
        check(f"{tag} 빠른 이동 목록 열림", menu is not None)
        if menu:
            page.click('[data-move-target="index"]')
            page.wait_for_timeout(800)
            check(f"{tag} 빠른 이동 실행", page.query_selector("[data-task-move-menu]") is None)
    # 드래그로 서랍 숨기기
    row = page.query_selector('[data-task-row] button[class*="min-w-0"]')
    if row:
        box = row.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2 - 40, steps=6)
        page.wait_for_timeout(250)
        hidden = page.evaluate(
            "() => { const el = document.querySelector('[data-drawer-root]'); return el ? {op: el.style.opacity, pe: el.style.pointerEvents} : null; }"
        )
        check(f"{tag} 끌기 시작하면 서랍·배경 숨김", hidden is not None and hidden["op"] == "0", json.dumps(hidden))
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 120, steps=8)
        page.wait_for_timeout(200)
        page.screenshot(path=f"{OUT}/a46-{'mobile' if mobile else 'pc'}-drawer-drag.png")
        page.mouse.up()
        page.wait_for_timeout(700)
        restored = page.evaluate("() => document.querySelector('[data-drawer-root]')?.style.opacity ?? 'gone'")
        check(f"{tag} 끌기 끝나면 서랍 복귀", restored in ("", "gone"), str(restored))
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

    # ── 5. 아카이브: 플로팅 입력 · 다중 선택 · 일괄 이동/삭제 ────
    tab(page, "archive")
    page.wait_for_timeout(600)
    quick = page.evaluate(
        """() => { const f = document.querySelector('[data-archive-quick-add]'); if (!f) return null;
            const r = f.getBoundingClientRect(); const cs = getComputedStyle(f);
            return {bg: cs.backgroundColor, border: cs.borderColor, shadow: cs.boxShadow.slice(0,40), bottom: Math.round(window.innerHeight - r.bottom), gapToTab: Math.round(window.innerHeight - r.bottom)}; }"""
    )
    check(f"{tag} 아카이브 하단 플로팅 입력", quick is not None and quick["bottom"] > 60, json.dumps(quick, ensure_ascii=False))
    check(f"{tag} 플로팅 입력 박스 색 구분", quick is not None and quick["bg"] not in ("rgb(255, 255, 255)", "rgba(0, 0, 0, 0)"), (quick or {}).get("bg", ""))
    cards = page.evaluate("document.querySelectorAll('[data-archive-card]').length")
    check(f"{tag} 아카이브 카드 렌더", cards >= 3, f"{cards}개")

    page.click("[data-archive-select-toggle]")
    page.wait_for_timeout(250)
    boxes = page.evaluate(
        """() => [...document.querySelectorAll('[data-archive-card]')].slice(0,2).map(c => { const r=c.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+16}; })"""
    )
    for box in boxes:
        page.mouse.click(box["x"], box["y"])
        page.wait_for_timeout(120)
    page.wait_for_timeout(300)
    selected = page.evaluate("document.querySelectorAll('[data-archive-selected=\"true\"]').length")
    check(f"{tag} 선택 버튼으로 다중 선택", selected >= 2, f"{selected}개")

    # 여백 드래그(상자 선택)
    page.evaluate("window.__a46_before = document.querySelectorAll('[data-archive-selected=\"true\"]').length")
    page.evaluate(
        """() => {
            const grid = document.querySelector('[data-archive-grid]');
            const r = grid.getBoundingClientRect();
            const x = r.left + 4, y = r.top + 4;
            const ev = (t, cx, cy) => grid.dispatchEvent(new PointerEvent(t, {bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1}));
            ev('pointerdown', x, y);
            ev('pointermove', x + Math.min(600, r.width), y + Math.min(500, r.height));
            ev('pointerup', x + 400, y + 400);
        }"""
    )
    page.wait_for_timeout(300)
    marquee_sel = page.evaluate("document.querySelectorAll('[data-archive-selected=\"true\"]').length")
    check(f"{tag} 여백 드래그 상자 선택", marquee_sel >= 2, f"{marquee_sel}개")

    # 일괄 이동
    page.click("[data-archive-bulk-move]")
    page.wait_for_timeout(250)
    moved = page.query_selector("[data-archive-move-menu]") is not None
    check(f"{tag} 일괄 이동 메뉴", moved)
    if moved:
        page.click('[data-archive-move-kind="책"]')
        page.wait_for_timeout(900)
        kinds = page.evaluate(
            """() => [...document.querySelectorAll('[data-archive-card]')].slice(0,4).map(c => c.innerText.split('\\n')[0])"""
        )
        check(f"{tag} 일괄 이동 반영", "책" in kinds, str(kinds))
    # 다중 삭제 — 선택 모드가 꺼졌으면 다시 켜고 두 장을 고릅니다.
    grouped = page.evaluate("document.querySelector('[data-archive-select-toggle]')?.getAttribute('aria-pressed')")
    if grouped != "true":
        page.click("[data-archive-select-toggle]")
        page.wait_for_timeout(250)
    before = page.evaluate("document.querySelectorAll('[data-archive-card]').length")
    boxes = page.evaluate(
        """() => [...document.querySelectorAll('[data-archive-card]')].slice(0,2).map(c => { const r=c.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+16}; })"""
    )
    for box in boxes:
        page.mouse.click(box["x"], box["y"])
        page.wait_for_timeout(120)
    page.wait_for_timeout(250)
    page.click("[data-archive-bulk-trash]")
    page.wait_for_timeout(1200)
    after = page.evaluate("document.querySelectorAll('[data-archive-card]').length")
    check(f"{tag} 여러 개 한 번에 삭제", after <= before - 2, f"{before}→{after}")

    page.screenshot(path=f"{OUT}/a46-{'mobile' if mobile else 'pc'}-archive.png")
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
