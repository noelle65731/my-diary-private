"""A46: 편집기 Enter/Backspace 동작 — 빈 줄이 사라져 커서가 튀지 않는지."""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
results, errors = [], []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox"])
    for width, height, tag in [(1440, 900, "PC"), (390, 844, "모바일")]:
        ctx = browser.new_context(
            viewport={"width": width, "height": height},
            locale="ko-KR",
            is_mobile=width < 640,
            has_touch=width < 640,
        )
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.click('[data-tab="binder"]')
        page.wait_for_timeout(400)
        page.evaluate("() => { const b=[...document.querySelectorAll('button.seg-item')].find(el=>(el.innerText||'').trim()==='Notes'); if(b) b.click(); }")
        page.wait_for_timeout(500)
        page.evaluate("document.querySelector('[data-note-card]')?.click()")
        page.wait_for_timeout(700)
        page.evaluate("() => { const b=[...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')==='본문 수정'); if(b) b.click(); }")
        page.wait_for_timeout(500)

        before = page.evaluate("document.querySelectorAll('[data-doc-block]').length")
        # 첫 블록 끝으로 커서를 두고 Enter
        page.evaluate(
            """() => {
                const input = document.querySelector('[data-doc-input]');
                input.focus();
                const r = document.createRange(); r.selectNodeContents(input); r.collapse(false);
                const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            }"""
        )
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)
        after = page.evaluate("document.querySelectorAll('[data-doc-block]').length")
        check(f"{tag} Enter 로 새 줄", after == before + 1, f"{before}→{after}")
        focused = page.evaluate("document.activeElement?.getAttribute('data-doc-input')")
        check(f"{tag} 새 줄에 커서", focused is not None, str(focused))
        page.keyboard.type("새로 쓴 줄")
        page.wait_for_timeout(300)
        text = page.evaluate("document.activeElement?.innerText")
        check(f"{tag} 새 줄에 글자 입력", (text or "").strip() == "새로 쓴 줄", str(text))
        # 빈 줄 Backspace 로 정리
        page.evaluate(
            """() => {
                const input = document.activeElement;
                const r = document.createRange(); r.selectNodeContents(input); r.collapse(true);
                const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            }"""
        )
        page.keyboard.press("Backspace")  # 글자 지우기
        page.wait_for_timeout(200)
        page.evaluate(
            """() => {
                const input = document.activeElement;
                const r = document.createRange(); r.selectNodeContents(input);
                const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            }"""
        )
        page.keyboard.press("Backspace")  # 내용 전체 지우기
        page.wait_for_timeout(250)
        page.keyboard.press("Backspace")  # 빈 줄 지우기
        page.wait_for_timeout(300)
        final = page.evaluate("document.querySelectorAll('[data-doc-block]').length")
        check(f"{tag} Backspace 로 빈 줄 정리", final == after - 1, f"{after}→{final}")
        ctx.close()
    browser.close()

print()
print(f"통과 {sum(1 for r in results if r[1])} / {len(results)}")
print("콘솔 오류", len(errors) if errors else 0)
sys.exit(0 if all(r[1] for r in results) else 1)
