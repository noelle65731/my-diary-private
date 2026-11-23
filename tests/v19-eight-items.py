"""v19 8건 통합 검증 (PC 1440x900 + 모바일 390x844).

1) 일정 서랍 정렬 — 미완료 먼저, 완료·취소는 아래
2) 일정 카드 표시 스위치 — 트랙/손잡이 기하 (글자 크기 1·6·9단계)
3) 서랍 → 세부내역 → X 순차 복귀 (프로젝트·index·일정 서랍)
4) 오른쪽 패널 `>`/`<` 손잡이
5) 주간 헤더 `^`/`v` 접기 + 상태 저장
6) 카드 클릭 → 서랍, 연필 → 바로 수정
7) 바인더 주말 글자색·연한 틴트
8) 하루 목록 시트 버튼 이름·한 줄
"""
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
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def boot(browser, width, height, tag, font=None):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR", timezone_id="Asia/Seoul",
                              is_mobile=width < 640, has_touch=width < 640)
    if font is not None:
        ctx.add_init_script(f"window.localStorage.setItem('my-diary:settings:v1', JSON.stringify({{fontSize:{font}, fontSizeVersion:2}}))")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"[{tag}] {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)
    return ctx, page


def dialogs(page):
    return page.evaluate("""() => [...document.querySelectorAll('[role="dialog"]')].map(d => d.getAttribute('aria-label') || d.innerText.slice(0, 24))""")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})

    # ───────────────────────── PC ─────────────────────────
    ctx, page = boot(browser, 1440, 900, "pc")

    # 2) 스위치 기하 — 일정 서랍 안
    nested = page.evaluate("() => document.querySelectorAll('button button').length")
    check("버튼 안에 버튼 없음(중첩 금지)", nested == 0, f"nested={nested}")
    page.click('button[data-tab="projects"]')
    page.wait_for_timeout(700)
    page.click('button[aria-label="일정 열기"]')
    page.wait_for_timeout(500)
    geo = page.evaluate("""() => {
      const btn = document.querySelector('div[data-schedule-drawer-toggle="true"] button[role="switch"]');
      if (!btn) return null;
      const knob = btn.querySelector('[data-switch-knob]');
      const t = btn.getBoundingClientRect(), k = knob.getBoundingClientRect();
      return {tw: t.width, th: t.height, kw: k.width, kh: k.height,
              inside: k.left >= t.left - 0.5 && k.right <= t.right + 0.5 && k.top >= t.top - 0.5 && k.bottom <= t.bottom + 0.5,
              round: getComputedStyle(btn).borderRadius, knobRound: getComputedStyle(knob).borderRadius,
              checked: btn.getAttribute('aria-checked')};
    }""")
    check("2 일정 카드 표시 스위치 기하", geo and abs(geo["tw"] - 36) < 1 and abs(geo["th"] - 20) < 1 and abs(geo["kw"] - 14) < 1 and geo["inside"], json.dumps(geo, ensure_ascii=False))
    # 켜고 끄기 동작
    page.click('div[data-schedule-drawer-toggle="true"] button[role="switch"]')
    page.wait_for_timeout(400)
    off = page.evaluate("""() => document.querySelector('div[data-schedule-drawer-toggle="true"] button[role="switch"]')?.getAttribute('aria-checked')""")
    card_gone = page.evaluate("""() => !document.querySelector('article[data-schedule-card="true"]')""")
    page.click('div[data-schedule-drawer-toggle="true"] button[role="switch"]')
    page.wait_for_timeout(400)
    on = page.evaluate("""() => document.querySelector('div[data-schedule-drawer-toggle="true"] button[role="switch"]')?.getAttribute('aria-checked')""")
    check("2 스위치 끄면 일정 카드 사라짐", off == "false" and card_gone and on == "true", f"off={off} card_gone={card_gone} on={on}")

    # 1) 서랍 정렬
    order = page.evaluate("""() => [...document.querySelectorAll('[data-schedule-drawer-event]')].map(li => ({
      id: li.getAttribute('data-schedule-drawer-event'),
      struck: !!li.querySelector('.line-through'),
      text: li.innerText.replace(/\\n/g, ' ')
    }))""")
    first_closed = next((i for i, e in enumerate(order) if e["struck"]), len(order))
    open_after = [e for e in order[first_closed:] if not e["struck"]]
    check("1 일정 서랍 — 미완료 먼저·완료/취소 아래", first_closed > 0 and not open_after, f"closed_start={first_closed} open_after={len(open_after)} n={len(order)}")
    page.screenshot(path=f"{OUT}/v19-check-schedule-drawer.png")

    # 3) 일정 서랍 → 일정 상세 → X → 서랍 유지
    page.click('[data-schedule-drawer-event] button >> nth=1')
    page.wait_for_timeout(600)
    detail_open = page.evaluate("""() => !!document.querySelector('[data-detail-close]')""")
    drawer_behind = page.evaluate("""() => !!document.querySelector('[data-schedule-drawer="true"]')""")
    page.click('[data-detail-close]')
    page.wait_for_timeout(500)
    drawer_after = page.evaluate("""() => !!document.querySelector('[data-schedule-drawer="true"]')""")
    detail_after = page.evaluate("""() => !!document.querySelector('[data-detail-close]')""")
    check("3 일정 서랍 → 상세 → X → 서랍 유지", detail_open and drawer_after and not detail_after, f"open={detail_open} behind={drawer_behind} after={drawer_after}")
    # 서랍 X → 목록
    page.click('[data-schedule-drawer="true"] ~ * button[aria-label="닫기"]') if False else None
    page.click('div[aria-label="일정"] button[aria-label="닫기"]') if page.query_selector('div[aria-label="일정"]') else page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    check("3-b 일정 서랍 X → 목록", not page.evaluate("""() => !!document.querySelector('[data-schedule-drawer="true"]')"""))

    # 6) 프로젝트 카드 — 빈칸 클릭 → 서랍
    card = page.evaluate("""() => {
      const c = document.querySelector('article[data-project-card]');
      const r = c.getBoundingClientRect();
      return {id: c.getAttribute('data-project-card'), x: r.x, y: r.y, w: r.width, h: r.height};
    }""")
    page.mouse.click(card["x"] + card["w"] / 2, card["y"] + card["h"] - 45)
    page.wait_for_timeout(600)
    check("6a 카드 빈칸 클릭 → 프로젝트 서랍", page.evaluate("""() => !!document.querySelector('[role="dialog"]')"""))
    # 서랍 → 할 일 줄 클릭 → 상세
    page.click('[role="dialog"] ul li button[aria-label="완료"], [role="dialog"] ul li button:not([aria-label])')
    page.wait_for_timeout(200)
    page.click('[role="dialog"] ul li >> nth=0')
    page.wait_for_timeout(200)
    row_open = page.evaluate("""() => !!document.querySelector('[data-detail-close]')""")
    if not row_open:
        page.click('[role="dialog"] ul li button >> nth=1')
        page.wait_for_timeout(500)
    # 3) 서랍 → 할 일 상세 → X → 서랍 유지
    page.click('[data-detail-close]')
    page.wait_for_timeout(500)
    check("3-c 프로젝트 서랍 → 할 일 상세 → X → 서랍 유지", page.evaluate("""() => !!document.querySelector('[data-index-drawer], [role="dialog"] [aria-label="닫기"]')""") and not page.evaluate("""() => !!document.querySelector('[data-detail-close]')"""))
    # 프로젝트 수정 → X → 서랍 유지
    if page.query_selector('button:has-text("프로젝트 수정")'):
        page.click('button:has-text("프로젝트 수정")')
        page.wait_for_timeout(600)
        edit_open = page.evaluate("""() => !!document.querySelector('[data-detail-close]')""")
        page.click('[data-detail-close]')
        page.wait_for_timeout(500)
        check("3-d 서랍 → 프로젝트 수정 → X → 서랍 유지", edit_open and page.evaluate("""() => !!document.querySelector('[role="dialog"]')"""))
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # 6) 카드의 할 일 제목 클릭 → 서랍 (상세 아님)
    task_btn = page.evaluate("""() => {
      const card = document.querySelector('article[data-project-card]');
      const b = card.querySelector('[data-task-drag]');
      const r = b.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2, id: b.getAttribute('data-task-drag')};
    }""")
    page.mouse.click(task_btn["x"], task_btn["y"])
    page.wait_for_timeout(600)
    check("6b 카드의 할 일 제목 클릭 → 서랍", page.evaluate("""() => !!document.querySelector('[role="dialog"]')""") and not page.evaluate("""() => !!document.querySelector('[data-detail-close]')"""))
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # 6) 연필 → 바로 수정, X → 목록(서랍 없음)
    pencil = page.evaluate("""() => {
      const card = document.querySelector('article[data-project-card]');
      const b = card.querySelector('[data-task-edit]');
      const r = b.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2, id: b.getAttribute('data-task-edit')};
    }""")
    page.mouse.click(pencil["x"], pencil["y"])
    page.wait_for_timeout(700)
    direct = page.evaluate("""() => ({detail: !!document.querySelector('[data-detail-close]'), drawer: !!document.querySelector('[role="dialog"]:not([aria-label*="할 일"]):not([aria-label*="프로젝트"])')})""")
    page.screenshot(path=f"{OUT}/v19-check-pencil-direct.png")
    page.click('[data-detail-close]')
    page.wait_for_timeout(500)
    check("6c 연필 → 바로 수정, X → 목록", direct["detail"] and not page.evaluate("""() => !!document.querySelector('[data-detail-close]')"""))
    # 6) 일정 카드 연필
    page.click('article[data-schedule-card="true"] [data-schedule-edit]')
    page.wait_for_timeout(600)
    check("6d 일정 카드 연필 → 일정 상세", page.evaluate("""() => !!document.querySelector('[data-detail-close]')"""))
    page.click('[data-detail-close]')
    page.wait_for_timeout(400)
    # 6) index 카드 항목 클릭 → index 서랍
    page.click('article[data-index-card] [data-task-drag]')
    page.wait_for_timeout(600)
    check("6e index 카드 항목 클릭 → index 서랍", page.evaluate("""() => !!document.querySelector('[data-index-drawer]')"""))
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/v19-check-projects.png")

    # 4·5) 캘린더
    page.click('button[data-tab="calendar"]')
    page.wait_for_timeout(700)
    page.click('button:has-text("주간")')
    page.wait_for_timeout(700)
    txt = page.evaluate("""() => document.body.innerText.includes('패널 접기')""")
    handle = page.evaluate("""() => {
      const b = document.querySelector('[data-week-panel-toggle]');
      const a = document.querySelector('aside.side-panel');
      if (!b || !a) return null;
      const r = b.getBoundingClientRect(), ar = a.getBoundingClientRect();
      return {w: r.width, h: r.height, gapToPanel: ar.x - (r.x + r.width), chevronOnly: b.innerText.trim(), x: r.x};
    }""")
    check("4 글자 버튼 제거", not txt)
    check("4 패널 경계 손잡이", handle and abs(handle["gapToPanel"]) < 1.5 and handle["chevronOnly"] == "", json.dumps(handle, ensure_ascii=False))
    page.click('[data-week-panel-toggle]')
    page.wait_for_timeout(500)
    collapsed = page.evaluate("""() => {
      const b = document.querySelector('[data-week-panel-toggle]');
      const r = b.getBoundingClientRect();
      return {aside: !!document.querySelector('aside.side-panel'), right: r.x + r.width, vw: window.innerWidth, label: b.getAttribute('aria-label')};
    }""")
    check("4 접으면 오른쪽 끝 `<` 손잡이", not collapsed["aside"] and abs(collapsed["right"] - collapsed["vw"]) < 1, json.dumps(collapsed, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/v19-check-panel-collapsed.png")
    page.click('[data-week-panel-toggle]')
    page.wait_for_timeout(400)

    # 5) 헤더 접기
    h_before = page.evaluate("""() => document.querySelector('[data-week-board-scroll]')?.getBoundingClientRect().height""")
    page.click('[data-calendar-header-toggle="collapse"]')
    page.wait_for_timeout(600)
    h_after = page.evaluate("""() => document.querySelector('[data-week-board-scroll]')?.getBoundingClientRect().height""")
    hidden = page.evaluate("""() => getComputedStyle(document.querySelector('#calendar-header-rows')).display === 'none'""")
    check("5 헤더 접기 — 높이 증가", hidden and h_after > h_before + 40, f"{h_before} → {h_after}")
    page.screenshot(path=f"{OUT}/v19-check-header-collapsed.png")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)
    stored = page.evaluate("""() => document.querySelector('[data-calendar-header]')?.getAttribute('data-header-collapsed')""")
    check("5 접힘 상태 저장", stored == "true")
    page.click('[data-calendar-header-toggle="expand"]')
    page.wait_for_timeout(500)
    check("5 v로 다시 펼침", page.evaluate("""() => getComputedStyle(document.querySelector('#calendar-header-rows')).display !== 'none'"""))

    # 8) 하루 목록 시트 — 주간 요일 머리글 클릭
    page.click('[data-week-board] >> nth=0') if False else None
    day_head = page.evaluate("""() => {
      const el = document.querySelector('[data-week-day-head]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {x: r.x + 30, y: r.y + r.height / 2};
    }""")
    if day_head:
        page.mouse.click(day_head["x"], day_head["y"])
        page.wait_for_timeout(600)
    sheet = page.evaluate("""() => {
      const s = document.querySelector('[data-day-list]');
      if (!s) return null;
      const btns = [...s.querySelectorAll('button')].filter(b => b.offsetParent);
      const go = btns.find(b => b.innerText.trim() === '일간 보기');
      const wk = btns.find(b => b.innerText.trim() === '주간 보기');
      const box = (b) => b ? {w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height} : null;
      return {go: !!go, week: !!wk, goBox: box(go), weekBox: box(wk), texts: btns.map(b => b.innerText.trim()).filter(Boolean)};
    }""")
    check("8 하루 목록 버튼 이름", bool(sheet) and sheet["go"], json.dumps(sheet, ensure_ascii=False)[:220])
    fit = page.evaluate("""() => {
      const s = document.querySelector('[data-day-list]');
      if (!s) return null;
      const row = s.querySelector('.flex-nowrap');
      return row ? {scroll: row.scrollWidth, client: row.clientWidth} : null;
    }""")
    check("8 하루 목록 버튼 줄 넘칩 없음", bool(fit) and fit["scroll"] <= fit["client"] + 1, json.dumps(fit))
    if sheet:
        page.screenshot(path=f"{OUT}/v19-check-daylsheet.png")
        page.click('[data-day-list] button:has-text("닫기") >> nth=0')
        page.wait_for_timeout(400)

    # 7) 바인더 주말
    page.click('button[data-tab="binder"]')
    page.wait_for_timeout(800)
    page.click('button:has-text("Weekly")')
    page.wait_for_timeout(800)
    weekend = page.evaluate("""() => {
      const rows = [...document.querySelectorAll('[data-binder-weekend]')];
      const out = {};
      for (const row of rows.slice(0, 6)) {
        const kind = row.getAttribute('data-binder-weekend');
        const letter = row.querySelectorAll('span')[1];
        const cs = getComputedStyle(row);
        out[kind + ':' + (row.getAttribute('data-binder-day') || '')] = {bg: cs.backgroundColor, letter: letter ? getComputedStyle(letter).color : null, text: letter ? letter.innerText : null};
      }
      return out;
    }""")
    sat = [v for k, v in weekend.items() if k.startswith("sat:")]
    sun = [v for k, v in weekend.items() if k.startswith("sun:")]
    def bluish(c):
        return c.startswith("rgb(") and int(c[4:c.index(',')]) < 230
    check("7 바인더 주말 틴트·글자색", bool(sat) and bool(sun) and sat[0]["bg"] != sun[0]["bg"] and sat[0]["letter"] != sun[0]["letter"], json.dumps(weekend, ensure_ascii=False)[:400])
    page.screenshot(path=f"{OUT}/v19-check-binder.png")
    ctx.close()

    # ── 글자 크기 1·9단계에서 스위치 모양 ──
    for font in (1, 9):
        ctx2, page2 = boot(browser, 1440, 900, f"font{font}", font=font)
        page2.click('button[data-tab="projects"]')
        page2.wait_for_timeout(700)
        page2.click('button[aria-label="일정 열기"]')
        page2.wait_for_timeout(400)
        g = page2.evaluate("""() => {
          const b = document.querySelector('div[data-schedule-drawer-toggle="true"] button[role="switch"]');
          const k = b.querySelector('[data-switch-knob]');
          const t = b.getBoundingClientRect(), kr = k.getBoundingClientRect();
          return {tw: t.width, th: t.height, kw: kr.width, inside: kr.left >= t.left - .5 && kr.right <= t.right + .5};
        }""")
        check(f"2 스위치 모양 (글자 {font}단계)", abs(g["tw"] - 36) < 1 and abs(g["th"] - 20) < 1 and g["inside"], json.dumps(g))
        page2.screenshot(path=f"{OUT}/v19-check-switch-fs{font}.png")
        ctx2.close()

    # ── 모바일 ──
    ctx3, page3 = boot(browser, 390, 844, "mobile")
    page3.click('button[data-tab="projects"]')
    page3.wait_for_timeout(700)
    page3.screenshot(path=f"{OUT}/v19-mobile-projects.png")
    page3.click('article[data-index-card] [data-task-edit]')
    page3.wait_for_timeout(700)
    check("모바일 연필 → 상세", page3.evaluate("""() => !!document.querySelector('[data-detail-close]')"""))
    page3.click('[data-detail-close]')
    page3.wait_for_timeout(400)
    page3.click('button[data-tab="calendar"]')
    page3.wait_for_timeout(700)
    # 모바일 주간 → 하루 목록 시트 버튼 한 줄
    head = page3.evaluate("""() => {
      const el = document.querySelector('[data-week-day-head]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {x: r.x + Math.min(30, r.width / 2), y: r.y + r.height / 2};
    }""")
    if head:
        page3.mouse.click(head["x"], head["y"])
        page3.wait_for_timeout(700)
    msheet = page3.evaluate("""() => {
      const s = document.querySelector('[data-day-list]');
      if (!s) return null;
      const btns = [...s.querySelectorAll('button')].filter(b => b.offsetParent && b.innerText.trim());
      const row = btns.filter(b => ['일간 보기', '주간 보기'].includes(b.innerText.trim()));
      const boxes = row.map(b => b.getBoundingClientRect());
      let wrap = false;
      for (const b of btns) { const r = b.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(b).lineHeight) || 20; if (r.height > lh * 1.9) wrap = true; }
      return {texts: btns.map(b => b.innerText.trim()), wrap, count: row.length, widths: boxes.map(b => Math.round(b.width)), h: boxes.map(b => Math.round(b.height))};
    }""")
    check("8 모바일 하루 목록 — 두 줄 아님", bool(msheet) and not msheet["wrap"] and msheet["count"] == 2, json.dumps(msheet, ensure_ascii=False)[:300])
    page3.screenshot(path=f"{OUT}/v19-mobile-daysheet.png")
    page3.click('[data-day-list] button:has-text("닫기") >> nth=0')
    page3.wait_for_timeout(400)
    page3.click('button[data-tab="binder"]')
    page3.wait_for_timeout(800)
    page3.screenshot(path=f"{OUT}/v19-mobile-binder.png")
    ctx3.close()

    browser.close()

print("\nERRORS:", errors[:12])
fails = [r for r in results if not r[1]]
print(f"\nRESULT: {len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails or errors else 0)
