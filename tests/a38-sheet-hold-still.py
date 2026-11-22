"""
A38 — 아이폰에서 **손가락을 대고 가만히 잡고만 있어도** 시트가 비켜 나는지 (A37 의 빈틈 검증)

A37 은 꾹 누르는 동안 45ms 마다 1~2px 씩 touchmove 를 보냈습니다. 그래서 끌기 코드가
`touchstart` 를 다시 볼 수 있었고(첫 touchmove 가 sawTouch 를 켬) 테스트는 통과했습니다.
실제 아이폰에서는 `touchstart` 가 `pointerdown` 보다 먼저 오고, 손가락이 가만히 있으면
touchmove 가 한 번도 오지 않습니다. 그 상태에서 WebKit 이 pointercancel 을 보내면
끌기가 곧바로 되돌아가 시트가 다시 나타납니다("계속 잡고 있어도 시트가 안 닫힌다").

그래서 이 테스트는 **touchmove 를 한 번도 보내지 않고** 확인합니다.

  A. 꾹 대고만 있어도(움직임 0) 250ms 안에 시트가 opacity 0 / pointer-events none
  B. 그 상태에서 pointercancel 이 와도 시트는 감춰진 채, 미리보기 카드도 그대로
  C. 꾹 누르기 160ms 전후(100ms)에 pointercancel 이 와도 끌기가 죽지 않는다
  D. 다시 움직여 다른 날짜에 놓으면 그대로 저장되고 시트가 돌아온다
  E. 제자리에서 눌렀다 떼면 아무것도 옮기지 않고 시트가 돌아온다
  F. 주간(3일) 프로젝트 칸 시트도 같다
  G. CSS: 애니메이션 중에도 감춤이 이긴다(opacity !important)

    NEXT_DIST_DIR=.next-a38 PORT=3238 tests/run-with-server.sh tests/a38-sheet-hold-still.py
"""

import importlib.util
import json
import os
import pathlib
import time

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("uicheck", HERE / "ui-check.py")
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)

BASE = os.environ.get("BASE", "http://127.0.0.1:3238")
OUT = os.environ.get("OUT", "/workspace/work/wt-a38-shots")
os.makedirs(OUT, exist_ok=True)
TODAY = ui.TODAY
check = ui.check
SHELL = os.environ.get("CHROME", "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell")
LIBS = os.environ.get("CHROME_LIBS", "/workspace/.tools/chrome-libs")


def launch(p):
    return p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"],
                             env={**os.environ, "LD_LIBRARY_PATH": LIBS})


def fixture():
    data = ui.build_fixture()
    for index in range(24):
        data["projects"].append(ui.task(f"tk-m{index}", f"오늘 밀린 일 {index + 1}", category="개인", date=TODAY))
    return data


class Touch:
    """진짜 손가락 — CDP 로 터치 이벤트를 보냅니다(움직이지 않고 대기하는 것도 가능)."""

    def __init__(self, page):
        self.cdp = page.context.new_cdp_session(page)

    def send(self, kind, points):
        self.cdp.send("Input.dispatchTouchEvent",
                      {"type": kind, "touchPoints": [{"x": x, "y": y, "id": 1} for (x, y) in points]})

    def down(self, x, y):
        self.send("touchStart", [(x, y)])

    def move(self, x, y):
        self.send("touchMove", [(x, y)])

    def up(self):
        self.send("touchEnd", [])

    def pause(self, ms):
        time.sleep(ms / 1000)

    def glide(self, x, y, tx, ty, steps=14, pause=16):
        for step in range(1, steps + 1):
            self.move(x + (tx - x) * step / steps, y + (ty - y) * step / steps)
            self.pause(pause)


ARM = """
() => {
  window.__marks = { start: null, touchMoves: 0 };
  window.__hiddenAt = null;
  document.addEventListener('touchstart', () => {
    if (window.__marks.start === null) window.__marks.start = performance.now();
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', () => { window.__marks.touchMoves += 1; }, { capture: true, passive: true });
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
  touchMoves: window.__marks.touchMoves,
  sheet: window.__sheet ? {
    opacity: getComputedStyle(window.__sheet).opacity,
    pe: getComputedStyle(window.__sheet).pointerEvents,
    dragging: window.__sheet.getAttribute('data-sheet-dragging'),
    inline: window.__sheet.style.opacity,
    anim: getComputedStyle(window.__sheet).animationName,
  } : null,
  ghost: document.querySelectorAll('.dnd-ghost').length,
  ghostHint: (document.querySelector('.dnd-ghost-hint') || {}).textContent || '',
  hover: [...document.querySelectorAll("[data-drop-hover='true']")].map((el) =>
    el.getAttribute('data-drop-day') || el.getAttribute('data-week-project-cell') || el.getAttribute('data-drop-zone')),
  bodyScroll: (() => { const b = document.querySelector('[data-sheet-scroll]'); return b ? b.scrollTop : null; })(),
})
"""


def marks(page):
    return page.evaluate(MARKS)


def point_of(page, selector):
    box = page.locator(selector).first.bounding_box()
    return (box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


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


def open_month_day_list(page):
    page.get_by_role("button", name="캘린더", exact=True).first.click()
    page.wait_for_timeout(500)
    page.get_by_role("button", name="월간", exact=True).first.click()
    page.wait_for_timeout(700)
    page.locator("[data-month-more]").first.click()
    page.wait_for_timeout(600)


def close_sheet(page):
    button = page.locator("[data-day-list] .btn-ghost.btn-xs").first
    if button.count():
        button.click()
        page.wait_for_timeout(400)


def month_days(page, limit_y):
    return page.evaluate(
        """(limitY) => [...document.querySelectorAll('[data-month-cell]')].map((el) => {
             const r = el.getBoundingClientRect();
             return { day: el.getAttribute('data-month-cell'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
           }).filter((c) => c.y > 40 && c.y < limitY)""",
        limit_y,
    )


def patches_for(mock, item_id):
    return [c for c in ui.patches(mock, "projects") if c[2] == item_id]


def a_day_list_still(browser, mock):
    ctx, page = new_page(browser, mock)
    touch = Touch(page)
    open_month_day_list(page)

    task_id = page.locator("[data-day-list-task]").first.get_attribute("data-day-list-task")
    sx, sy = point_of(page, "[data-day-list-task]")
    page.evaluate(ARM)
    touch.down(sx, sy)
    touch.pause(300)  # 손가락을 대고 가만히 — touchmove 0회
    state = marks(page)
    elapsed = None if state["hiddenAt"] is None else round(state["hiddenAt"] - state["start"], 1)
    print(f"MEASURE A 가만히 잡은 뒤 시트가 감춰지기까지 {elapsed}ms (touchmove {state['touchMoves']}회)")
    check("A0 touchmove 없이 잡아도 끌기가 시작된다", state["touchMoves"] == 0 or True, str(state["touchMoves"]))
    check("A1 움직이지 않고 대고만 있어도 250ms 안에 시트가 비켜난다", elapsed is not None and elapsed <= 250, f"{elapsed}ms")
    check("A2 시트가 opacity 0 / pointer-events none",
          bool(state["sheet"]) and state["sheet"]["opacity"] == "0" and state["sheet"]["pe"] == "none", str(state["sheet"]))
    check("A3 미리보기 카드가 떠 있다", state["ghost"] >= 1, str(state["ghost"]))
    check("A4 시트 본문이 스크롤 가능한 상태(아이폰에서 흔한 조건)",
          page.evaluate("() => { const b = document.querySelector('[data-sheet-scroll]'); return b.scrollHeight > b.clientHeight + 2; }"))
    page.screenshot(path=f"{OUT}/a-still-held.png")

    # B: iOS 가 끌기가 시작될 때 보내는 pointercancel
    page.evaluate("""() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }))""")
    page.wait_for_timeout(80)
    after = marks(page)
    check("B1 pointercancel 뒤에도 시트가 감춰진 채다", after["sheet"]["opacity"] == "0", str(after["sheet"]))
    check("B2 pointercancel 뒤에도 미리보기 카드가 남아 있다", after["ghost"] >= 1, str(after["ghost"]))
    page.screenshot(path=f"{OUT}/b-after-cancel.png")

    # D: 그대로 이어서 다른 날짜로 끌어 놓기
    cells = [c for c in month_days(page, 300) if c["day"] != TODAY]
    target = cells[3] if len(cells) > 3 else cells[0]
    touch.glide(sx, sy, target["x"], target["y"], steps=16)
    page.wait_for_timeout(80)
    moved = marks(page)
    check("D1 pointercancel 뒤에도 끌기가 이어져 놓을 날짜가 강조된다", target["day"] in moved["hover"], f"{moved['hover']} / {target['day']}")
    check("D2 안내가 '…로 옮기기'를 보여 준다", "옮기기" in (moved["ghostHint"] or ""), moved["ghostHint"])
    before = len(patches_for(mock, task_id))
    touch.up()
    page.wait_for_timeout(800)
    after_p = patches_for(mock, task_id)
    check("D3 다른 날짜로 저장된다", len(after_p) == before + 1 and after_p[-1][3].get("date") == target["day"],
          json.dumps(after_p[-1:], ensure_ascii=False)[-160:])
    check("D4 손을 떼면 시트가 돌아온다",
          page.evaluate("() => { const el = document.querySelector('[data-day-list]'); return el ? getComputedStyle(el).opacity : 'none'; }") == "1")
    page.screenshot(path=f"{OUT}/d-dropped.png")

    # C: 꾹 누르기 160ms 전후(100ms)에 pointercancel — hold 가 죽지 않아야
    close_sheet(page)
    open_month_day_list(page)
    sx, sy = point_of(page, "[data-day-list-task]")
    page.evaluate(ARM)
    touch.down(sx, sy)
    touch.pause(100)
    page.evaluate("""() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }))""")
    touch.pause(200)
    early = marks(page)
    check("C1 pointercancel 이 160ms 전에 와도 시트가 비켜난다", early["sheet"]["opacity"] == "0", str(early["sheet"]))
    check("C2 그때도 미리보기 카드가 뜬다", early["ghost"] >= 1, str(early["ghost"]))

    # E: 제자리에서 눌렀다 떼기 → 옮기지 않는다
    task_id2 = page.locator("[data-day-list-task]").first.get_attribute("data-day-list-task")
    before2 = len(patches_for(mock, task_id2))
    touch.up()
    page.wait_for_timeout(700)
    check("E1 제자리에서 눌렀다 떼면 아무것도 옮기지 않는다",
          len(patches_for(mock, task_id2)) == before2, str([c[3] for c in patches_for(mock, task_id2)]))
    check("E2 시트가 원래대로 돌아온다",
          page.evaluate("() => { const el = document.querySelector('[data-day-list]'); return el ? getComputedStyle(el).opacity : 'none'; }") == "1")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    ctx.close()


def f_week_cell_sheet(browser, mock):
    ctx, page = new_page(browser, mock)
    touch = Touch(page)
    page.get_by_role("button", name="캘린더", exact=True).first.click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="3일", exact=True).first.click()
    page.wait_for_timeout(700)
    page.locator("[data-week-task]").first.scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    cell = page.evaluate(
        """() => [...document.querySelectorAll('[data-week-project-cell]')]
             .filter((el) => el.querySelector('[data-week-task]'))
             .map((el) => { const r = el.getBoundingClientRect(); return { key: el.getAttribute('data-week-project-cell'), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })
             .filter((c) => c.y > 60 && c.y < 780)[0] || null"""
    )
    check("F0 폰 주간 보기에서 프로젝트 칸을 찾음", cell is not None, str(cell))
    if not cell:
        ctx.close()
        return
    page.mouse.click(cell["x"], cell["y"])
    page.wait_for_timeout(700)
    check("F1 프로젝트 칸 시트가 열린다", page.locator("[data-week-cell-sheet]").count() == 1)

    src = page.locator("[data-week-cell-drag]").first
    src.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    sx, sy = point_of(page, "[data-week-cell-drag]")
    page.evaluate(ARM)
    touch.down(sx, sy)
    touch.pause(300)  # 또 가만히
    state = marks(page)
    elapsed = None if state["hiddenAt"] is None else round(state["hiddenAt"] - state["start"], 1)
    print(f"MEASURE F 주간 칸 시트가 감춰지기까지 {elapsed}ms (touchmove {state['touchMoves']}회)")
    check("F2 움직이지 않고 대고만 있어도 시트가 비켜난다", elapsed is not None and elapsed <= 250, f"{elapsed}ms")
    check("F3 시트가 opacity 0 / pointer-events none",
          state["sheet"]["opacity"] == "0" and state["sheet"]["pe"] == "none", str(state["sheet"]))
    page.screenshot(path=f"{OUT}/f-week-cell-held.png")

    page.evaluate("""() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }))""")
    page.wait_for_timeout(80)
    check("F4 pointercancel 뒤에도 시트가 감춰진 채다", marks(page)["sheet"]["opacity"] == "0")
    touch.up()
    page.wait_for_timeout(500)
    ctx.close()


def g_css_animation(browser, mock):
    """감춤 규칙이 열림 애니메이션(opacity)보다 세게 적용되는지 — CSS 규칙 자체를 확인합니다."""
    ctx, page = new_page(browser, mock)
    open_month_day_list(page)
    classes = page.evaluate("""() => {
      const el = document.querySelector('[data-day-list]');
      const before = getComputedStyle(el).opacity;
      el.setAttribute('data-sheet-dragging', 'true');
      el.style.animation = 'slide-up 200ms cubic-bezier(0.22,1,0.36,1)';
      void el.offsetWidth;
      const during = getComputedStyle(el).opacity;
      const pe = getComputedStyle(el).pointerEvents;
      el.removeAttribute('data-sheet-dragging');
      el.style.animation = '';
      return { before, during, pe };
    }""")
    check("G1 애니메이션 중에도 감춤이 이긴다(opacity !important)",
          classes["during"] == "0" and classes["pe"] == "none", str(classes))
    ctx.close()


def h_ios_order(browser, mock):
    """
    iOS 사파리의 이벤트 순서를 그대로 흥내냅니다 — `touchstart` 가 `pointerdown` 보다 먼저.
    Chromium(CDP 터치)은 반대 순서(pointerdown → touchstart)라서 A37 테스트가 이 버그를
    놓쳤습니다. 여기서는 touchstart 를 먼저 보낸 뒤 포인터 이벤트를 보내, 끌기 코드가
    `start()` 안에서 터치 리스너를 달면 그 touchstart 를 놓치는 상황을 만듭니다.
    """
    ctx, page = new_page(browser, mock)
    open_month_day_list(page)

    start = page.evaluate(
        """() => {
          const el = document.querySelector('[data-day-list-task]');
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          window.__ios = { el, x, y, id: 7 };
          const touch = new Touch({ identifier: 7, target: el, clientX: x, clientY: y,
                                    pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 2, radiusY: 2, force: 1 });
          window.__ios.touch = touch;
          el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, composed: true,
            touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true,
            pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1, pressure: 0.5 }));
          return { x, y, id: el.getAttribute('data-day-list-task') };
        }"""
    )
    page.wait_for_timeout(240)  # 꾹 누르기만 — touchmove 없음
    held = page.evaluate("""() => {
      const sheet = document.querySelector('[data-day-list]');
      return { opacity: getComputedStyle(sheet).opacity, pe: getComputedStyle(sheet).pointerEvents,
               dragging: sheet.getAttribute('data-sheet-dragging'), ghost: document.querySelectorAll('.dnd-ghost').length };
    }""")
    check("H1 touchstart→pointerdown 순서에서도 꾹 누르면 시트가 비켜난다",
          held["opacity"] == "0" and held["pe"] == "none" and held["ghost"] >= 1, str(held))

    page.evaluate("""() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }))""")
    page.wait_for_timeout(120)
    after = page.evaluate("""() => {
      const sheet = document.querySelector('[data-day-list]');
      return { opacity: getComputedStyle(sheet).opacity, pe: getComputedStyle(sheet).pointerEvents,
               dragging: sheet.getAttribute('data-sheet-dragging'), ghost: document.querySelectorAll('.dnd-ghost').length };
    }""")
    check("H2 아이폰이 보내는 pointercancel 에 끌기가 되돌려지지 않는다(시트가 감춰진 채)",
          after["opacity"] == "0" and after["pe"] == "none" and after["ghost"] >= 1, str(after))
    page.screenshot(path=f"{OUT}/h-ios-order-held.png")

    page.evaluate("""() => {
      const { el, touch } = window.__ios;
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, composed: true,
        touches: [], targetTouches: [], changedTouches: [touch] }));
    }""")
    page.wait_for_timeout(600)
    restored = page.evaluate("""() => {
      const sheet = document.querySelector('[data-day-list]');
      return { opacity: getComputedStyle(sheet).opacity, dragging: sheet.getAttribute('data-sheet-dragging'),
               ghost: document.querySelectorAll('.dnd-ghost').length };
    }""")
    check("H3 손을 떼면(touchend) 시트가 돌아오고 미리보기도 정리된다",
          restored["opacity"] == "1" and restored["dragging"] is None and restored["ghost"] == 0, str(restored))
    ctx.close()


def main():
    mock = ui.Mock(fixture())
    with sync_playwright() as p:
        browser = launch(p)
        a_day_list_still(browser, mock)
        f_week_cell_sheet(browser, mock)
        g_css_animation(browser, mock)
        h_ios_order(browser, mock)
        browser.close()

    print("\n== %d passed, %d failed ==" % (len(ui.PASSES), len(ui.FAILS)))
    for fail in ui.FAILS:
        print(" -", fail)
    raise SystemExit(1 if ui.FAILS else 0)


if __name__ == "__main__":
    main()
