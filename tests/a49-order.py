"""A49 — 월간 3단 통합 정렬 + 주간·3일 칸 내 순서 바꾸기 (PC 1440×900 / 모바일 390×844).

확인하는 것
  1) 월간 날짜 칸: 종일(막대) → 시간 지정(일정+할 일 시각 순, 같은 시각 안에서는 저장된 순서) → 시간 없는 할 일
  2) 날짜 칸에서 같은 시각 항목끼리 끌어서 순서 바꾸기 / 다른 시각끼리는 바뀌지 않음
  3) 하루 목록 서랍: 3층 표시, ↑↓로 순서 바꾸기 → 새로고침 뒤에도 유지
  4) 주간·3일 프로젝트 칸: 시간 지정 할 일이 시각 순으로 위, 시간 없는 할 일이 아래 / 끌어서·↑↓로 순서 바꾸기
  5) 주간 위쪽 일정 칸: 같은 시작 시각 일정끼리 끌어서 순서 바꾸기
  6) 콘솔 오류 0건, 가로 넘침 없음
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
results, errors = [], []
DAY_ORDER = "my-diary:day-order:v1"
DAY = "2026-11-24"
WORK_CELL = "브랜드 마케팅 포트폴리오:2026-11-24"


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def open_app(page, clean=False):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-view-switch]", timeout=25000)
    if clean:
        page.evaluate("(key) => localStorage.removeItem(key)", DAY_ORDER)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("[data-view-switch]", timeout=25000)
    page.wait_for_timeout(600)
    if page.evaluate("() => document.querySelector('[data-calendar-tasks-toggle]')?.getAttribute('aria-pressed')") != "true":
        page.click("[data-calendar-tasks-toggle]")
        page.wait_for_timeout(400)


def layer_order(page, layer):
    return page.evaluate(
        """(layer) => [...document.querySelectorAll(`[data-day-layer="${layer}"] [data-day-order-item]`)]
              .map(e => e.getAttribute('data-day-order-item'))""",
        layer,
    )


def cell_order(page, day=DAY):
    return page.evaluate(
        """(day) => [...document.querySelectorAll(`[data-month-cell="${day}"] [data-month-order-item]`)]
              .map(e => e.getAttribute('data-month-order-item'))""",
        day,
    )


def week_cell_order(page, cell=WORK_CELL):
    return page.evaluate(
        """(cell) => {
          const node = document.querySelector(`[data-week-project-cell="${cell}"]`);
          return node ? [...node.querySelectorAll('[data-week-task]')].map(e => e.getAttribute('data-week-task')) : null;
        }""",
        cell,
    )


def stored_order(page, day=DAY):
    return page.evaluate(
        """({key, day}) => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw)[day] ?? null) : null; } catch { return null; } }""",
        {"key": DAY_ORDER, "day": day},
    )


def open_month(page):
    page.click('[data-view-switch] button[aria-label="월간"]')
    page.wait_for_timeout(600)


def open_week(page, label="주간"):
    page.click(f'[data-view-switch] button[aria-label="{label}"]')
    page.wait_for_timeout(700)


def close_sheet(page, day=DAY):
    page.click(f'[data-day-list="{day}"] button.icon-btn')
    page.wait_for_timeout(400)


def drag(page, from_sel, to_sel, dy=0.15):
    box = page.evaluate(
        """({a, b, dy}) => {
          const from = document.querySelector(a), to = document.querySelector(b);
          if (!from || !to) return null;
          const r1 = from.getBoundingClientRect(), r2 = to.getBoundingClientRect();
          return {from: {x: r1.x + r1.width / 2, y: r1.y + r1.height / 2},
                  to: {x: r2.x + r2.width / 2, y: r2.y + r2.height * dy}};
        }""",
        {"a": from_sel, "b": to_sel, "dy": dy},
    )
    if not box:
        return False
    page.mouse.move(box["from"]["x"], box["from"]["y"])
    page.mouse.down()
    page.mouse.move(box["from"]["x"] + 3, box["from"]["y"] + 10, steps=5)
    page.mouse.move(box["to"]["x"], box["to"]["y"] + 2, steps=14)
    page.wait_for_timeout(200)
    page.mouse.up()
    page.wait_for_timeout(700)
    return True


def toast_visible(page, text):
    return page.evaluate(
        """(text) => [...document.querySelectorAll('*')].some(e => e.children.length === 0 && e.textContent.trim() === text)""",
        text,
    )


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})

    # ─────────────── PC ───────────────
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR", timezone_id="Asia/Seoul")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"pc {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pc pageerror: {e}"))
    open_app(page, clean=True)
    open_month(page)

    order = cell_order(page)
    check("월간 칸 — 08:30 일정 두 개 뒤에 08:30 할 일(시각 순으로 섞임)", order[:3] == ["e:demo-ev-1", "e:demo-ev-17", "t:demo-tk-19"], json.dumps(order))
    check("월간 칸 — 남은 항목은 개수로 접힘", page.evaluate("""(day) => !!document.querySelector(`[data-month-cell="${day}"] [data-month-more]`)""", DAY))
    page.screenshot(path=f"{OUT}/a49-pc-month-before.png", full_page=True)

    # 날짜 칸에서 같은 시각(08:30) 항목끼리 끌어서 순서 바꾸기
    drag(page, '[data-month-order-item="t:demo-tk-19"]', '[data-month-order-item="e:demo-ev-1"]', 0.2)
    after_drag = cell_order(page)
    check("월간 칸 — 같은 08:30 안에서 할 일을 일정 위로 끌기", after_drag[:3] == ["t:demo-tk-19", "e:demo-ev-1", "e:demo-ev-17"], json.dumps(after_drag))
    saved = stored_order(page)
    check("저장 — 날짜 칸에서 바꾼 순서가 브라우저에 남음", bool(saved and saved.get("t:08:30") == ["t:demo-tk-19", "e:demo-ev-1", "e:demo-ev-17"]), json.dumps(saved, ensure_ascii=False))
    check("토스트 — 순서를 바꿨습니다", toast_visible(page, "순서를 바꿨습니다"))
    page.screenshot(path=f"{OUT}/a49-pc-month.png", full_page=True)

    # 하루 목록 서랍
    page.click(f'[data-month-cell="{DAY}"]')
    page.wait_for_selector(f'[data-day-list="{DAY}"]', timeout=5000)
    page.wait_for_timeout(400)
    layers = page.evaluate("""() => ['allday','timed','untimed'].map(l => ({layer: l, count: document.querySelectorAll(`[data-day-layer="${l}"] [data-day-order-item]`).length}))""")
    check("하루 목록 — 세 층이 모두 있음", all(x["count"] > 0 for x in layers), json.dumps(layers))
    timed = layer_order(page, "timed")
    check("하루 목록 — 2층은 시각 순(종일·시간 없음은 다른 층)", timed[:4] == ["t:demo-tk-19", "e:demo-ev-1", "e:demo-ev-17", "t:demo-tk-20"], json.dumps(timed))
    untimed = layer_order(page, "untimed")
    check("하루 목록 — 3층은 시간 없는 할 일", untimed == ["t:demo-tk-2", "t:demo-tk-9", "t:demo-tk-11", "t:demo-tk-22"], json.dumps(untimed))
    page.screenshot(path=f"{OUT}/a49-pc-daylist.png")

    # 시간 없는 할 일끼리 ↑↓
    page.click('[data-day-order-down="t:demo-tk-2"]')
    page.wait_for_timeout(500)
    untimed2 = layer_order(page, "untimed")
    check("하루 목록 — 시간 없는 할 일끼리 ↓", untimed2[:3] == ["t:demo-tk-9", "t:demo-tk-2", "t:demo-tk-11"], json.dumps(untimed2))
    # 종일 일정이 하나뿐이면 ↑↓ 를 두지 않음
    allday_controls = page.evaluate("""() => document.querySelectorAll('[data-day-layer="allday"] [data-day-order-controls]').length""")
    check("하루 목록 — 하나뿐인 묶음에는 ↑↓ 없음", allday_controls == 0, str(allday_controls))

    # 새로고침 뒤에도 유지
    open_app(page)
    open_month(page)
    page.click(f'[data-month-cell="{DAY}"]')
    page.wait_for_selector(f'[data-day-list="{DAY}"]', timeout=5000)
    page.wait_for_timeout(400)
    check("새로고침 — 같은 시각 순서 유지", layer_order(page, "timed")[:3] == ["t:demo-tk-19", "e:demo-ev-1", "e:demo-ev-17"], json.dumps(layer_order(page, "timed")[:3]))
    check("새로고침 — 시간 없는 할 일 순서 유지", layer_order(page, "untimed")[:3] == ["t:demo-tk-9", "t:demo-tk-2", "t:demo-tk-11"], json.dumps(layer_order(page, "untimed")))
    check("새로고침 — 월간 칸도 같은 순서", cell_order(page)[:3] == ["t:demo-tk-19", "e:demo-ev-1", "e:demo-ev-17"], json.dumps(cell_order(page)))
    close_sheet(page)

    # 주간 — 위쪽 일정 칸: 같은 08:30끼리 끌어서 순서 바꾸기
    open_week(page)
    page.wait_for_timeout(500)
    drag(page, '[data-week-event="demo-ev-17"]', '[data-week-event="demo-ev-1"]', 0.2)
    week_events = page.evaluate("""() => [...document.querySelectorAll('[data-week-event-day="2026-11-24"]')].map(e => e.getAttribute('data-week-event'))""")
    check("주간 일정 칸 — 같은 08:30 일정끼리 끌어서 순서 바꾸기", week_events[:2] == ["demo-ev-17", "demo-ev-1"], json.dumps(week_events))
    saved = stored_order(page)
    check("주간 일정 칸 — 바뀐 순서 저장", bool(saved and saved.get("t:08:30", [])[:3] == ["t:demo-tk-19", "e:demo-ev-17", "e:demo-ev-1"]), json.dumps(saved, ensure_ascii=False))

    # 주간 — 프로젝트 칸
    work_cell = week_cell_order(page)
    check("주간 칸 — 시간 지정 할 일(09:00)이 시간 없는 할 일보다 위", bool(work_cell) and work_cell[0] == "demo-tk-20", json.dumps(work_cell))
    page.screenshot(path=f"{OUT}/a49-pc-week.png", full_page=True)

    if work_cell and len(work_cell) >= 3:
        src, dst = work_cell[1], work_cell[2]
        drag(page, f'[data-week-task="{src}"] [class*="flex-1"]', f'[data-week-task="{dst}"] [class*="flex-1"]', 0.9)
        after = week_cell_order(page)
        check("주간 칸 — 끌어서 시간 없는 할 일끼리 순서 바꾸기", after == [work_cell[0], work_cell[2], work_cell[1]], json.dumps(after))
        check("주간 칸 — 바뀐 순서 저장", bool((stored_order(page) or {}).get("none")), json.dumps(stored_order(page), ensure_ascii=False))
        page.screenshot(path=f"{OUT}/a49-pc-week-reorder.png", full_page=True)
        # 다른 시각대(시간 지정) 위로는 바뀌지 않아야
        drag(page, f'[data-week-task="{src}"] [class*="flex-1"]', f'[data-week-task="{work_cell[0]}"] [class*="flex-1"]', 0.2)
        after2 = week_cell_order(page)
        check("주간 칸 — 시간이 다른 항목 위로는 순서가 바뀌지 않음", after2 == after, json.dumps(after2))
        check("주간 칸 — 시간이 다르다는 안내", toast_visible(page, "시작 시각이 다르면 시간순이 먼저라 순서를 바꿀 수 없습니다"))
        open_app(page)
        open_week(page)
        page.wait_for_timeout(600)
        check("주간 칸 — 새로고침 뒤에도 유지", week_cell_order(page) == after, json.dumps(week_cell_order(page)))

    overflow = page.evaluate("() => ({w: document.documentElement.scrollWidth, iw: window.innerWidth})")
    check("PC — 가로 넘침 없음", overflow["w"] <= overflow["iw"] + 1, json.dumps(overflow))

    # 3일 — 같은 게시판, 칸 안 순서
    open_week(page, "3일")
    page.wait_for_timeout(600)
    three = page.evaluate("""() => {
      const cells = [...document.querySelectorAll('[data-week-task-day]')];
      return cells.slice(0, 3).map(c => c.getAttribute('data-week-task-day') + ':' + [...c.querySelectorAll('[data-week-task]')].map(t => t.getAttribute('data-week-task')).join(','));
    }""")
    check("3일 — 프로젝트 칸이 있는 게시판", bool(three), json.dumps(three, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a49-pc-three.png", full_page=True)
    overflow = page.evaluate("() => ({w: document.documentElement.scrollWidth, iw: window.innerWidth})")
    check("PC — 3일 가로 넘침 없음", overflow["w"] <= overflow["iw"] + 1, json.dumps(overflow))
    ctx.close()

    # ─────────────── 모바일 ───────────────
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="ko-KR", timezone_id="Asia/Seoul", is_mobile=True, has_touch=True, device_scale_factor=2)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"mo {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"mo pageerror: {e}"))
    open_app(page, clean=True)
    open_month(page)
    page.screenshot(path=f"{OUT}/a49-mo-month.png", full_page=True)
    page.tap(f'[data-day-num="{DAY}"]')
    page.wait_for_selector(f'[data-day-list="{DAY}"]', timeout=5000)
    page.wait_for_timeout(400)
    check("모바일 — 하루 목록 2층 순서(기본)", layer_order(page, "timed")[:3] == ["e:demo-ev-1", "e:demo-ev-17", "t:demo-tk-19"], json.dumps(layer_order(page, "timed")[:3]))
    page.screenshot(path=f"{OUT}/a49-mo-daylist.png")
    page.tap('[data-day-order-up="t:demo-tk-19"]')
    page.wait_for_timeout(500)
    check("모바일 — 손가락 ↑ 한 번은 한 칸", layer_order(page, "timed")[:3] == ["e:demo-ev-1", "t:demo-tk-19", "e:demo-ev-17"], json.dumps(layer_order(page, "timed")[:3]))
    page.tap('[data-day-order-up="t:demo-tk-19"]')
    page.wait_for_timeout(500)
    check("모바일 — 같은 시각 안에서 맨 위까지", layer_order(page, "timed")[:2] == ["t:demo-tk-19", "e:demo-ev-1"], json.dumps(layer_order(page, "timed")[:3]))
    page.tap('[data-day-order-down="t:demo-tk-19"]')
    page.wait_for_timeout(400)
    check("모바일 — 되돌리기도 동작", layer_order(page, "timed")[:2] == ["e:demo-ev-1", "t:demo-tk-19"], json.dumps(layer_order(page, "timed")[:2]))
    page.screenshot(path=f"{OUT}/a49-mo-daylist-reorder.png")
    close_sheet(page)
    overflow = page.evaluate("() => ({w: document.documentElement.scrollWidth, iw: window.innerWidth})")
    check("모바일 — 가로 넘침 없음(월간·서랍)", overflow["w"] <= overflow["iw"] + 1, json.dumps(overflow))

    # 모바일 주간 — 칸을 눌러 시트에서 순서 바꾸기
    open_week(page)
    page.wait_for_timeout(700)
    page.tap(f'[data-week-project-cell="{WORK_CELL}"]')
    page.wait_for_selector("[data-week-cell-sheet]", timeout=5000)
    page.wait_for_timeout(400)
    sheet = page.evaluate("""() => [...document.querySelectorAll('[data-week-cell-task]')].map(e => e.getAttribute('data-week-cell-task'))""")
    check("모바일 주간 시트 — 시간 지정 할 일이 먼저", sheet[:1] == ["demo-tk-20"], json.dumps(sheet))
    ups = page.evaluate("""() => [...document.querySelectorAll('[data-week-cell-order-up]')].map(e => e.getAttribute('data-week-cell-order-up'))""")
    check("모바일 주간 시트 — 시간 없는 할 일에 ↑↓ 있음", "demo-tk-2" in ups, json.dumps(ups))
    if "demo-tk-2" in ups:
        page.tap('[data-week-cell-order-down="demo-tk-2"]')
        page.wait_for_timeout(500)
        sheet2 = page.evaluate("""() => [...document.querySelectorAll('[data-week-cell-task]')].map(e => e.getAttribute('data-week-cell-task'))""")
        check("모바일 주간 시트 — 손가락 ↑↓로 순서 바꾸기", sheet2 != sheet, json.dumps(sheet2))
        page.screenshot(path=f"{OUT}/a49-mo-week-sheet.png")
    overflow = page.evaluate("() => ({w: document.documentElement.scrollWidth, iw: window.innerWidth})")
    check("모바일 — 가로 넘침 없음(주간)", overflow["w"] <= overflow["iw"] + 1, json.dumps(overflow))
    ctx.close()
    browser.close()

print("ERRORS:", errors[:10])
print(f"RESULT: {sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) and not errors else 1)
