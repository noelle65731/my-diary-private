"""
A37 — 목록 시트에서 할 일을 꾹 누르면 시트가 바로 비켜 나가고, 그대로 끌어 옮기기까지 되는지
아이폰 크기(390×844, hasTouch)에서 **진짜 터치 입력**(CDP Input.dispatchTouchEvent)으로 확인합니다.

  A. 하루 목록 시트(DayListPanel, 월간에서 '할 일 N'으로 엶)
     A1 꾹 누르면 250ms 안에 시트·배경이 비켜 나가고 미리보기 카드가 뜬다
     A2 손가락을 떼지 않고 다른 날짜 칸으로 끌어 놓으면 그 날짜로 저장된다
     A3 끄는 동안에는 시트 본문이 스크롤되지 않는다(터치무브 취소)
     A4 iOS 사파리처럼 끌기 도중 pointercancel 이 와도 끌기는 이어지고 저장까지 된다
     A5 제자리에서 꾹 눌렀다 떼면 아무것도 옮기지 않고 시트가 돌아온다
     A6 꾹 누르지 않고 바로 스와이프하면 시트가 스크롤된다(끌기가 시작되지 않는다)
  B. 주간(3일) 프로젝트 칸 시트(WeekBoard cellSheet)
     B1 꾹 누르면 시트가 비켜 나간다
     B2 다른 프로젝트 행·다른 날 칸으로 끌어 놓으면 프로젝트와 날짜가 함께 저장된다
     B3 pointercancel 이 와도 끌기가 이어진다

    tests/run-with-server.sh tests/a37-sheet-hold-touch.py
"""

import importlib.util
import json
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("uicheck", HERE / "ui-check.py")
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/work/diary-shots/a37")
os.makedirs(OUT, exist_ok=True)
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
TODAY = ui.TODAY  # 2026-11-21

check = ui.check


def launch(p):
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = LIBS
    return p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env=env)


def fixture():
    """오늘 할 일을 넉넉히 넣어 시트 본문이 실제로 스크롤되게 합니다(아이폰에서 흔한 상태)."""
    data = ui.build_fixture()
    for index in range(24):
        data["projects"].append(ui.task(f"tk-m{index}", f"오늘 밀린 일 {index + 1}", category="개인", date=TODAY))
    return data


class Touch:
    """트랙패드가 아니라 진짜 손가락 — CDP 로 터치 이벤트를 보냅니다."""

    def __init__(self, page):
        self.cdp = page.context.new_cdp_session(page)

    def send(self, kind, points):
        self.cdp.send(
            "Input.dispatchTouchEvent",
            {"type": kind, "touchPoints": [{"x": x, "y": y, "id": 1} for (x, y) in points]},
        )

    def down(self, x, y):
        self.send("touchStart", [(x, y)])

    def move(self, x, y):
        self.send("touchMove", [(x, y)])

    def up(self):
        self.send("touchEnd", [])

    def glide(self, x, y, tx, ty, steps=14, pause=16):
        for step in range(1, steps + 1):
            self.move(x + (tx - x) * step / steps, y + (ty - y) * step / steps)
            self.cdp._impl if False else None
            self.pause(pause)

    def pause(self, ms):
        # 시간을 벌기 위해 CDP 세션과 무관한 대기를 씁니다.
        import time

        time.sleep(ms / 1000)


ARM = """
() => {
  window.__marks = { start: null, hidden: null, prevent: 0, touchTargets: [] };
  window.__hiddenAt = null;
  document.addEventListener('touchstart', () => {
    if (window.__marks.start === null) window.__marks.start = performance.now();
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', (event) => {
    if (event.defaultPrevented) window.__marks.prevent += 1;
    const target = event.target;
    if (target && target.getAttribute) window.__marks.touchTargets.push(target.getAttribute('data-day-list-task') || target.getAttribute('data-week-cell-drag') || target.tagName);
  }, { capture: false, passive: true });
  const sheet = document.querySelector('[data-day-list], [data-week-cell-sheet]');
  window.__sheet = sheet;
  if (window.__timer) clearInterval(window.__timer);
  window.__timer = setInterval(() => {
    if (window.__hiddenAt !== null || !window.__sheet) return;
    if (getComputedStyle(window.__sheet).opacity === '0') window.__hiddenAt = performance.now();
  }, 8);
}
"""

MARKS = """
() => ({
  start: window.__marks.start,
  hiddenAt: window.__hiddenAt,
  prevent: window.__marks.prevent,
  touchTargets: window.__marks.touchTargets.slice(-3),
  sheet: window.__sheet ? { opacity: getComputedStyle(window.__sheet).opacity, pe: getComputedStyle(window.__sheet).pointerEvents, dragging: window.__sheet.getAttribute('data-sheet-dragging') } : null,
  ghost: document.querySelectorAll('.dnd-ghost').length,
  ghostHint: (document.querySelector('.dnd-ghost-hint') || {}).textContent || '',
  hover: [...document.querySelectorAll("[data-drop-hover='true']")].map((el) => el.getAttribute('data-drop-day') || el.getAttribute('data-week-project-cell') || el.getAttribute('data-drop-project') || el.getAttribute('data-drop-zone')),
  bodyScroll: (() => { const b = document.querySelector('[data-sheet-scroll]'); return b ? b.scrollTop : null; })(),
  pageScroll: window.scrollY,
})
"""


def marks(page):
    return page.evaluate(MARKS)


def point_of(page, selector):
    box = page.locator(selector).first.bounding_box()
    return (box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


def hold(page, touch, x, y, drift=((0.6, 1.0), (-0.7, 1.4), (0.9, -0.7), (0.4, 1.1)), total_ms=260):
    """꾹 누르기 — 손가락은 늘 1~2px 씩 흔들립니다(아이폰에서 늘 있는 일)."""
    touch.down(x, y)
    waited = 0
    index = 0
    while waited < total_ms:
        touch.pause(45)
        waited += 45
        dx, dy = drift[index % len(drift)]
        index += 1
        touch.move(x + dx, y + dy)
    return waited


def new_page(browser, mock):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True,
                              device_scale_factor=3, locale="ko-KR")
    page = ctx.new_page()
    page.set_default_timeout(10000)
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=15000)
    page.wait_for_timeout(900)
    return ctx, page


def patches(mock, item_id):
    return [c for c in ui.patches(mock, "projects") if c[2] == item_id]


def month_days(page, limit_y):
    """화면 위쪽(시트에 가리지 않는 곳)에 있는 날짜 칸들 — 가운데 좌표와 함께."""
    return page.evaluate(
        """(limitY) => [...document.querySelectorAll('[data-month-cell]')].map((el) => {
             const r = el.getBoundingClientRect();
             return { day: el.getAttribute('data-month-cell'), x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
           }).filter((c) => c.y > 40 && c.y < limitY)""",
        limit_y,
    )


def close_sheet(page):
    """하루 목록 시트는 Esc 로 닫히지 않습니다 — 시트 안의 '닫기' 버튼을 누릅니다."""
    button = page.locator("[data-day-list] .btn-ghost.btn-xs").first
    if button.count():
        button.click()
        page.wait_for_timeout(400)


def open_month_day_list(page):
    page.get_by_role("button", name="캘린더", exact=True).first.click()
    page.wait_for_timeout(500)
    page.get_by_role("button", name="월간", exact=True).first.click()
    page.wait_for_timeout(700)
    page.locator("[data-month-more]").first.click()
    page.wait_for_timeout(600)


def a_day_list(browser, mock):
    ctx, page = new_page(browser, mock)
    touch = Touch(page)

    # ── A1: 꾹 누르면 시트가 바로 비켜 나간다 ──────────────────────────────
    open_month_day_list(page)
    page.screenshot(path=f"{OUT}/a1-sheet-open.png")
    src = page.locator("[data-day-list-task]").first
    task_id = src.get_attribute("data-day-list-task")
    sx, sy = point_of(page, "[data-day-list-task]")
    page.evaluate(ARM)
    hold(page, touch, sx, sy)
    state = marks(page)
    elapsed = None if state["hiddenAt"] is None else round(state["hiddenAt"] - state["start"], 1)
    print(f"MEASURE A1 꾹 누른 뒤 시트가 감춰지기까지 {elapsed}ms")
    check("A1a 꾹 누르면 250ms 안에 시트가 비켜 나간다", elapsed is not None and elapsed <= 250, f"{elapsed}ms (start={state['start']})")
    check("A1b 시트가 opacity 0 / pointer-events none", bool(state["sheet"]) and state["sheet"]["opacity"] == "0" and state["sheet"]["pe"] == "none", str(state["sheet"]))
    check("A1c 미리보기 카드가 손끝을 따라온다", state["ghost"] >= 1, str(state["ghost"]))
    check("A1d 시트 본문이 스크롤 가능한 상태", page.evaluate("() => { const b = document.querySelector('[data-sheet-scroll]'); return b.scrollHeight > b.clientHeight + 2; }"), "")
    page.screenshot(path=f"{OUT}/a1-held.png")

    # ── A4: iOS 처럼 pointercancel 이 와도 끌기는 이어진다 ────────────────
    page.evaluate(
        """() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }))"""
    )
    page.wait_for_timeout(60)
    after_cancel = marks(page)
    check("A4a pointercancel 뒤에도 시트가 그대로 감춰져 있다", after_cancel["sheet"]["opacity"] == "0", str(after_cancel["sheet"]))
    check("A4b pointercancel 뒤에도 미리보기 카드가 남아 있다", after_cancel["ghost"] >= 1, str(after_cancel["ghost"]))

    # ── A2: 다른 날짜 칸으로 끌어 놓기 ────────────────────────────────────
    cells = [c for c in month_days(page, 300) if c["day"] != TODAY]
    target = cells[3] if len(cells) > 3 else cells[0]
    touch.glide(sx, sy, target["x"], target["y"], steps=16)
    page.wait_for_timeout(80)
    moved = marks(page)
    page.screenshot(path=f"{OUT}/a2-over-target.png")
    check("A2a 놓을 날짜 칸이 강조된다", target["day"] in moved["hover"], f"{moved['hover']} / target {target['day']}")
    check("A2b 안내가 '…로 옮기기'를 보여 준다", "옮기기" in (moved["ghostHint"] or ""), moved["ghostHint"])
    check("A3a 끄는 동안 시트 본문이 스크롤되지 않는다", (moved["bodyScroll"] or 0) == 0, str(moved["bodyScroll"]))
    check("A3b 끄는 동안 터치무브가 취소된다(브라우저가 스크롤을 못 가져감)", moved["prevent"] > 0, str(moved["prevent"]))
    check("A3c 터치 이벤트가 원래 항목으로 계속 배달된다", moved["touchTargets"] and task_id in moved["touchTargets"][-1], str(moved["touchTargets"]))

    before = len(patches(mock, task_id))
    touch.up()
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/a2-dropped.png")
    after = patches(mock, task_id)
    moved_ok = len(after) == before + 1 and after[-1][3].get("date") == target["day"]
    check("A2c 다른 날짜로 저장된다", moved_ok, json.dumps(after, ensure_ascii=False)[-160:])
    check("A2d 손을 떼면 시트가 돌아온다", page.evaluate("() => { const el = document.querySelector('[data-day-list]'); return el ? getComputedStyle(el).opacity : 'none'; }") == "1", "")

    # ── A5: 제자리에서 눌렀다 떼기 → 아무것도 옮기지 않는다 ────────────────
    close_sheet(page)
    open_month_day_list(page)
    src = page.locator("[data-day-list-task]").first
    task_id2 = src.get_attribute("data-day-list-task")
    sx, sy = point_of(page, "[data-day-list-task]")
    page.evaluate(ARM)
    hold(page, touch, sx, sy, total_ms=260)
    before2 = len(patches(mock, task_id2))
    touch.up()
    page.wait_for_timeout(600)
    check("A5a 제자리에서 눌렀다 떼면 아무것도 옮기지 않는다", len(patches(mock, task_id2)) == before2, str([c[3] for c in patches(mock, task_id2)]))
    check("A5b 시트가 원래대로 돌아온다", page.evaluate("() => { const el = document.querySelector('[data-day-list]'); return el ? getComputedStyle(el).opacity : 'none'; }") == "1", "")
    # 꾹 눌렀다 그냥 뗀 것은 클릭이므로, 원래대로 그 항목의 상세가 열립니다.
    page.wait_for_timeout(300)
    check("A5c 그때는 클릭으로 남아 항목 상세가 열린다", page.get_by_role("dialog").count() >= 1, str(page.get_by_role("dialog").count()))
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # ── A6: 바로 스와이프하면 시트가 스크롤된다 ────────────────────────────
    close_sheet(page)
    open_month_day_list(page)
    sx, sy = point_of(page, "[data-day-list-task]")
    page.evaluate(ARM)
    touch.down(sx, sy)
    touch.pause(16)
    for step in range(1, 9):
        touch.move(sx, sy - step * 6)
        touch.pause(12)
    page.wait_for_timeout(120)
    scrolled = marks(page)
    touch.up()
    page.wait_for_timeout(400)
    check("A6a 바로 스와이프하면 시트가 스크롤된다", (scrolled["bodyScroll"] or 0) > 0, str(scrolled["bodyScroll"]))
    check("A6b 그때는 끌기가 시작되지 않는다", scrolled["ghost"] == 0, str(scrolled["ghost"]))
    page.screenshot(path=f"{OUT}/a6-scrolled.png")

    # ── A7: 일정도 같은 방식으로 꾹 눌러 다른 날짜로 옮긴다 ────────────────
    close_sheet(page)
    open_month_day_list(page)
    src = page.locator("[data-day-list-event='ev-2']").first
    src.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    sx, sy = point_of(page, "[data-day-list-event='ev-2']")
    page.evaluate(ARM)
    hold(page, touch, sx, sy)
    state = marks(page)
    elapsed = None if state["hiddenAt"] is None else round(state["hiddenAt"] - state["start"], 1)
    print(f"MEASURE A7 일정 꾹 누른 뒤 시트가 감춰지기까지 {elapsed}ms")
    check("A7a 일정을 꾹 누르면 250ms 안에 시트가 비켜 나간다", elapsed is not None and elapsed <= 250, f"{elapsed}ms")
    cells = [c for c in month_days(page, 300) if c["day"] != TODAY]
    target = cells[1] if len(cells) > 1 else cells[0]
    touch.glide(sx, sy, target["x"], target["y"], steps=16)
    page.wait_for_timeout(80)
    page.screenshot(path=f"{OUT}/a7-over-target.png")
    before = len([c for c in ui.patches(mock, "calendar") if c[2] == "ev-2"])
    touch.up()
    page.wait_for_timeout(700)
    after = [c for c in ui.patches(mock, "calendar") if c[2] == "ev-2"]
    check(
        "A7b 일정이 그 날짜로 저장됩니다",
        len(after) == before + 1 and after[-1][3].get("date") == target["day"],
        json.dumps(after[-1:], ensure_ascii=False)[-200:],
    )
    ctx.close()


def b_cell_sheet(browser, mock):
    ctx, page = new_page(browser, mock)
    touch = Touch(page)
    page.get_by_role("button", name="캘린더", exact=True).first.click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="3일", exact=True).first.click()
    page.wait_for_timeout(700)
    # 폰 기본 보기(3일)에서 할 일이 있는 프로젝트 칸을 찾습니다.
    page.locator("[data-week-task]").first.scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    cell = page.evaluate(
        """() => [...document.querySelectorAll('[data-week-project-cell]')]
             .filter((el) => el.querySelector('[data-week-task]'))
             .map((el) => { const r = el.getBoundingClientRect(); return { key: el.getAttribute('data-week-project-cell'), x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })
             .filter((c) => c.y > 60 && c.y < 780)[0] || null"""
    )
    check("B0 폰 주간 보기에서 프로젝트 칸을 찾음", cell is not None, str(cell))
    if not cell:
        ctx.close()
        return
    page.mouse.click(cell["x"], cell["y"])
    page.wait_for_timeout(600)
    page.screenshot(path=f"{OUT}/b1-sheet-open.png")
    sheet_open = page.locator("[data-week-cell-sheet]").count()
    check("B0b 프로젝트 칸 시트가 열린다", sheet_open == 1, str(sheet_open))

    src = page.locator("[data-week-cell-drag]").first
    task_id = src.get_attribute("data-week-cell-drag")
    src.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    sx, sy = point_of(page, "[data-week-cell-drag]")
    page.evaluate(ARM)
    hold(page, touch, sx, sy)
    state = marks(page)
    elapsed = None if state["hiddenAt"] is None else round(state["hiddenAt"] - state["start"], 1)
    print(f"MEASURE B1 꾹 누른 뒤 시트가 감춰지기까지 {elapsed}ms")
    check("B1a 꾹 누르면 250ms 안에 시트가 비켜 나간다", elapsed is not None and elapsed <= 250, f"{elapsed}ms")
    check("B1b 시트가 opacity 0 / pointer-events none", state["sheet"]["opacity"] == "0" and state["sheet"]["pe"] == "none", str(state["sheet"]))
    page.screenshot(path=f"{OUT}/b1-held.png")

    page.evaluate(
        """() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }))"""
    )
    page.wait_for_timeout(50)
    check("B3a pointercancel 뒤에도 시트가 감춰진 채다", marks(page)["sheet"]["opacity"] == "0", "")

    # 다른 프로젝트 행의 다른 날 칸 (시트를 감춘 상태에서 놓일 자리를 미리 잽니다)
    target = page.evaluate(
        """() => {
           const out = [];
           for (const el of document.querySelectorAll('[data-week-project-cell]')) {
             const key = el.getAttribute('data-week-project-cell');
             if (!key) continue;
             const r = el.getBoundingClientRect();
             const x0 = Math.max(r.left, 0) + 6, x1 = Math.min(r.right, innerWidth) - 6;
             const y0 = Math.max(r.top, 0) + 6, y1 = Math.min(r.bottom, innerHeight) - 6;
             if (x1 - x0 < 8 || y1 - y0 < 8) continue;
             const x = (x0 + x1) / 2, y = (y0 + y1) / 2;
             const hit = document.elementFromPoint(x, y);
             if (!hit || hit.closest('[data-week-project-cell]') !== el) continue;
             out.push({ key, x, y });
           }
           return out;
        }"""
    )
    mine_key, mine_day = page.evaluate(
        """(id) => { const el = document.querySelector(`[data-week-task='${id}']`); const cell = el.closest('[data-week-project-cell]'); const key = cell.getAttribute('data-week-project-cell'); const [k, d] = key.split(':'); return [k, d]; }""",
        task_id,
    )
    others = [c for c in target if c["key"] != f"{mine_key}:{mine_day}" and c["key"].split(":")[1] != mine_day]
    check("B2a 다른 날 칸을 찾음", len(others) > 0, str(target))
    if others:
        spot = others[0]
        touch.glide(sx, sy, spot["x"], spot["y"], steps=16)
        page.wait_for_timeout(80)
        moved = marks(page)
        page.screenshot(path=f"{OUT}/b2-over-target.png")
        check("B2b 놓을 칸이 강조되고 안내가 뜬다", bool(moved["hover"]) and "옮기기" in (moved["ghostHint"] or ""), f"{moved['hover']} / {moved['ghostHint']}")
        if not moved["hover"]:
            print("DEBUG point", spot, page.evaluate(
                """([x, y]) => {
                  const el = document.elementFromPoint(x, y);
                  const chain = [];
                  let node = el;
                  while (node && chain.length < 6) {
                    chain.push(node.tagName + '.' + (node.className || '').toString().slice(0, 40) + '|' + [...node.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).join(','));
                    node = node.parentElement;
                  }
                  return { at: [x, y], scrollY: window.scrollY, chain };
                }""",
                [spot["x"], spot["y"]],
            ))
        before = len(patches(mock, task_id))
        touch.up()
        page.wait_for_timeout(700)
        after = patches(mock, task_id)
        page.screenshot(path=f"{OUT}/b2-dropped.png")
        want_day = spot["key"].split(":")[1]
        ok = len(after) > before
        body = after[-1][3] if after else {}
        check("B3b pointercancel 뒤에도 끌어 옮기기가 저장된다", ok, json.dumps(after, ensure_ascii=False)[-200:])
        check("B2c 날짜가 놓은 칸의 날로 바뀐다", body.get("date") == want_day or body.get("due") == want_day or ("projectIds" in body), f"want {want_day} got {body}")
        check("B2d 같은 시트가 손을 떼면 돌아온다", page.evaluate("() => { const el = document.querySelector('[data-week-cell-sheet]'); return el ? getComputedStyle(el).opacity : 'gone'; }") in ("1", "gone"), "")
    ctx.close()


def main():
    mock = ui.Mock(fixture())
    with sync_playwright() as p:
        browser = launch(p)
        a_day_list(browser, mock)
        b_cell_sheet(browser, mock)
        browser.close()
    print()
    print(f"PASS {len(ui.PASSES)} / FAIL {len(ui.FAILS)}")
    for item in ui.FAILS:
        print("  FAIL", item)
    sys.exit(1 if ui.FAILS else 0)


main()
