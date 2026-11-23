"""v19 추가 흐름 — 캘린더 탭 프로젝트 서랍 순차 복귀·하루 목록 시트·월간 헤더 접기·모바일 헤더."""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
os.makedirs(OUT, exist_ok=True)

results = []
errors = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR", timezone_id="Asia/Seoul")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.click('button[data-tab="calendar"]')
    page.wait_for_timeout(800)
    page.click('button:has-text("주간")')
    page.wait_for_timeout(800)

    # 캘린더 주간의 프로젝트 이름 → 서랍 → 할 일 → X → 서랍 유지
    proj = page.evaluate("""() => {
      const row = document.querySelector('[data-week-project-row]');
      if (!row) return null;
      const el = [...row.querySelectorAll('button')].pop();
      const r = el.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2, text: el.innerText.trim()};
    }""")
    print("week project row:", proj)
    if proj:
        page.mouse.click(proj["x"], proj["y"])
        page.wait_for_timeout(700)
        drawer = page.evaluate("""() => !!document.querySelector('[role="dialog"]')""")
        if drawer:
            page.click('[role="dialog"] ul li button >> nth=1')
            page.wait_for_timeout(600)
            detail = page.evaluate("""() => !!document.querySelector('[data-detail-close]')""")
            page.click('[data-detail-close]')
            page.wait_for_timeout(500)
            back = page.evaluate("""() => !!document.querySelector('[role="dialog"]') && !document.querySelector('[data-detail-close]')""")
            check("3-e 캘린더 프로젝트 서랍 → 할 일 상세 → X → 서랍", drawer and detail and back, f"drawer={drawer} detail={detail} back={back}")
            page.screenshot(path=f"{OUT}/v19-flow-calendar-drawer-return.png")
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)

    # 하루 목록 시트 → 일정 상세 → X → 시트 유지
    head = page.evaluate("""() => {
      const el = document.querySelector('[data-week-day-head]');
      const r = el.getBoundingClientRect();
      return {x: r.x + 30, y: r.y + r.height / 2};
    }""")
    page.mouse.click(head["x"], head["y"])
    page.wait_for_timeout(700)
    sheet = page.evaluate("""() => !!document.querySelector('[data-day-list]')""")
    if sheet:
        page.click('[data-day-list] [data-day-list-event] >> nth=0')
        page.wait_for_timeout(600)
        detail2 = page.evaluate("""() => !!document.querySelector('[data-detail-close]')""")
        page.click('[data-detail-close]')
        page.wait_for_timeout(500)
        sheet_back = page.evaluate("""() => !!document.querySelector('[data-day-list]')""")
        check("3-f 하루 목록 → 일정 상세 → X → 목록 유지", sheet and detail2 and sheet_back, f"detail={detail2} sheet_back={sheet_back}")
        page.screenshot(path=f"{OUT}/v19-flow-daysheet-return.png")
        page.click('[data-day-list] button:has-text("닫기") >> nth=0')
        page.wait_for_timeout(400)

    # 월간 보기에서도 헤더 접기/펼치기
    page.click('button:has-text("월간")')
    page.wait_for_timeout(700)
    before = page.evaluate("""() => document.querySelector('main')?.scrollHeight ?? null""")
    page.click('[data-calendar-header-toggle="collapse"]')
    page.wait_for_timeout(600)
    after = page.evaluate("""() => document.querySelector('main')?.scrollHeight ?? null""")
    check("5 월간에서도 헤더 접기", page.evaluate("""() => getComputedStyle(document.querySelector('#calendar-header-rows')).display === 'none'"""), f"scrollHeight {before} → {after}")
    page.screenshot(path=f"{OUT}/v19-flow-month-collapsed.png")
    page.click('[data-calendar-header-toggle="expand"]')
    page.wait_for_timeout(500)

    # 연간 보기에서도 동작(헤더 접기 버튼 존재)
    page.click('button:has-text("연간")')
    page.wait_for_timeout(700)
    check("5 연간에서 토글 존재", page.evaluate("""() => !!document.querySelector('[data-calendar-header-toggle="collapse"]')"""))
    ctx.close()

    # 모바일 — 헤더 접기·패널 손잡이 없음·카드 클릭
    ctx3 = browser.new_context(viewport={"width": 390, "height": 844}, locale="ko-KR", timezone_id="Asia/Seoul", is_mobile=True, has_touch=True)
    page3 = ctx3.new_page()
    page3.on("console", lambda m: errors.append(f"[m] {m.type}: {m.text}") if m.type == "error" else None)
    page3.on("pageerror", lambda e: errors.append(f"[m] pageerror: {e}"))
    page3.goto(BASE, wait_until="networkidle")
    page3.wait_for_timeout(1200)
    page3.click('button[data-tab="calendar"]')
    page3.wait_for_timeout(800)
    page3.screenshot(path=f"{OUT}/v19-mobile-week.png")
    toggle = page3.evaluate("""() => {
      const b = document.querySelector('[data-calendar-header-toggle]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return {x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth};
    }""")
    check("5 모바일 헤더 접기 버튼 보임", bool(toggle) and toggle["x"] + toggle["w"] <= toggle["vw"], json.dumps(toggle))
    if toggle:
        page3.mouse.click(toggle["x"] + toggle["w"] / 2, toggle["y"] + toggle["h"] / 2)
        page3.wait_for_timeout(600)
        check("5 모바일 헤더 접힘", page3.evaluate("""() => getComputedStyle(document.querySelector('#calendar-header-rows')).display === 'none'"""))
        page3.screenshot(path=f"{OUT}/v19-mobile-header-collapsed.png")
        page3.click('[data-calendar-header-toggle="expand"]')
        page3.wait_for_timeout(500)
    check("4 모바일엔 패널 손잡이 안 보임", page3.evaluate("""() => ![...document.querySelectorAll('[data-week-panel-toggle]')].some(b => b.offsetParent !== null)"""))
    ctx3.close()
    browser.close()

print("\nERRORS:", errors[:10])
fails = [r for r in results if not r[1]]
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails or errors else 0)
