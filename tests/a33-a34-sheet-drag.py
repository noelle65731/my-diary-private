"""
A33 · A34 checks.

A33 — 하루 목록 시트 안에서 다른 날짜로 끌어 옮기기
  1) 월간 하루 목록 시트의 할 일·일정을 끌면 시트·배경이 감춰지고 뒤의 날짜 칸이 강조된다.
  2) 놓으면 그 날짜로 저장(PATCH)되고 시트는 다시 보인다. 취소하면 아무것도 저장하지 않는다.
  3) 주간 보기의 하루 목록 시트에서도 같게 동작한다 (날짜 머리글·시간표 칸).
  4) 폰(390×844)에서는 꾹 눌러(터치 롱프레스) 끌어 옮긴다.

A34 — 완료한 일정의 취소선 + 주간 바인더의 조건부 일정·할 일
  5) 완료한 일정이 월간 칩·주간 종일 막대·시간표 카드에서 취소선으로 그려진다.
  6) 주간 바인더는 기본에 그날 일정·할 일을 감추고, 칸을 눌러 쓸 때만 위에 보여 준다.

    NEXT_DIST_DIR=.next-a33 node node_modules/next/dist/bin/next start -p 3210 &
    CHROME=/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell \
      python3 tests/a33-a34-sheet-drag.py

The Notion API is answered inside the browser (tests/ui-check.py), so every assertion
reads exactly what the app would send.
"""

import importlib.util
import pathlib
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("uicheck", HERE / "ui-check.py")
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)

OUT = ui.OUT
Mock = ui.Mock
build_fixture = ui.build_fixture
event = ui.event
new_context = ui.new_context
check = ui.check
launch_args = ui.launch_args
patches = ui.patches
TODAY = ui.TODAY

CONSOLE = []


def fixture():
    """공용 픽스처 + 완료한 일정 두 건(A34 확인용)."""
    data = build_fixture()
    data["calendar"].append(event("ev-6", "완료한 종일 정리", TODAY, done=True))
    data["calendar"].append(
        event("ev-7", "완료한 시간 약속", "2026-11-18", startTime="09:00", endTime="10:00", allDay=False, done=True)
    )
    return data


def watch(page, tag):
    page.on("console", lambda m: CONSOLE.append(f"{tag}:console:{m.type}:{m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: CONSOLE.append(f"{tag}:pageerror:{e}"))


def open_page(browser, width, height, mock, tag):
    ctx, page = new_context(browser, width, height, mock)
    watch(page, tag)
    return ctx, page


def sheet(page):
    return page.locator("[data-day-list]")


def last_patch(mock, resource, item_id):
    found = [c for c in patches(mock, resource) if c[2] == item_id]
    return found[-1][3] if found else {}


def go_month(page):
    page.get_by_role("button", name="캘린더", exact=True).first.click()
    page.wait_for_timeout(500)
    page.get_by_role("button", name="월간", exact=True).first.click()
    page.wait_for_timeout(700)


def go_week(page):
    page.get_by_role("button", name="캘린더", exact=True).first.click()
    page.wait_for_timeout(500)
    page.get_by_role("button", name="주간", exact=True).first.click()
    page.wait_for_timeout(700)


def go_binder(page):
    page.get_by_role("button", name="바인더", exact=True).first.click()
    page.wait_for_timeout(800)


def center(box):
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def mouse_drag(page, source, target, steps=14):
    """source 요소를 잡고 조금 움직여 드래그를 깨운 뒤 target 위로 옮깁니다."""
    sb = source.bounding_box()
    tb = target.bounding_box()
    sx, sy = center(sb)
    tx, ty = center(tb)
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 6, sy + 6, steps=3)
    page.mouse.move(sx + 16, sy + 14, steps=4)
    page.mouse.move(tx, ty, steps=steps)
    page.wait_for_timeout(120)


def touch_long_press(page, selector, x, y):
    """터치 롱프레스 — 실제 터치 대신 pointer 이벤트를 그대로 보냅니다."""
    page.evaluate(
        """([sel, x, y]) => {
          const el = document.querySelector(sel);
          el.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch',
            isPrimary: true, clientX: x, clientY: y, buttons: 1, button: 0,
          }));
        }""",
        [selector, x, y],
    )


def touch_move(page, x, y):
    page.evaluate(
        """([x, y]) => {
          window.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch',
            isPrimary: true, clientX: x, clientY: y, buttons: 1, button: 0,
          }));
        }""",
        [x, y],
    )


def touch_up(page, x, y):
    page.evaluate(
        """([x, y]) => {
          window.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch',
            isPrimary: true, clientX: x, clientY: y, buttons: 0, button: 0,
          }));
        }""",
        [x, y],
    )


def sheet_opacity(page, selector="[data-day-list]"):
    return page.evaluate(
        """(sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return { opacity: getComputedStyle(el).opacity, pe: getComputedStyle(el).pointerEvents,
               hover: document.querySelectorAll("[data-drop-hover='true']").length };
    }""",
        selector,
    )


def safe_point(page, selector):
    """시트를 감춰 둔 상태(드래그 중과 같은 상태)에서 실제로 그 칸이 눌리는 좌표를 찾습니다.
    폰에서는 아래쪽 탭 바나 가로 스크롤 밖이 걸리므로 좌표를 찍어 확인해야 합니다."""
    return page.evaluate(
        """([sel]) => {
          const sheets = [...document.querySelectorAll('[data-day-list], [data-week-cell-sheet]')];
          const saved = sheets.map((el) => ({ el, v: el.style.visibility, pe: el.style.pointerEvents }));
          for (const el of sheets) { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
          const el = document.querySelector(sel);
          let point = null;
          if (el) {
            const r = el.getBoundingClientRect();
            const fractions = [[0.5, 0.45], [0.35, 0.3], [0.65, 0.3], [0.5, 0.15], [0.3, 0.6], [0.7, 0.6]];
            for (const [fx, fy] of fractions) {
              const px = r.left + r.width * fx;
              const py = r.top + r.height * fy;
              if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) continue;
              const hit = document.elementFromPoint(px, py);
              if (hit && (hit === el || el.contains(hit))) { point = { x: px, y: py }; break; }
            }
            if (!point) point = { x: r.left + r.width / 2, y: r.top + r.height / 2, fallback: true };
          }
          for (const item of saved) { item.el.style.visibility = item.v; item.el.style.pointerEvents = item.pe; }
          return point;
        }""",
        [selector],
    )


def text_decoration(page, selector):
    return page.evaluate(
        """(sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const own = getComputedStyle(el).textDecorationLine;
          const inner = [...el.querySelectorAll('span,p')].map(n => getComputedStyle(n).textDecorationLine);
          return [own, ...inner];
        }""",
        selector,
    )


def has_line_through(values):
    return bool(values) and any("line-through" in (value or "") for value in values)


# ─────────────────────────────────────────────────────────── A33 · 월간 (PC)


def month_sheet_drag(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc-month")
    go_month(page)

    page.locator(f"[data-month-more='{TODAY}']").first.click()
    page.wait_for_timeout(500)
    check("A33 월간: '할 일 N'으로 하루 목록 시트가 열림", sheet(page).count() == 1, "")
    check(
        "A33 월간: 시트에 일정·할 일이 모두 있음",
        page.locator("[data-day-list-event='ev-2']").count() == 1 and page.locator("[data-day-list-task='tk-5']").count() == 1,
        "",
    )
    page.screenshot(path=f"{OUT}/a33-month-sheet.png")

    # ── 할 일을 다른 날짜 칸으로 ───────────────────────────────────────────
    source = page.locator("[data-day-list-task='tk-5']").first
    target = page.locator("[data-month-cell='2026-11-25']").first
    mouse_drag(page, source, target)

    state = sheet_opacity(page)
    check("A33 월간: 끄는 동안 시트가 감춰짐(opacity 0)", state and state["opacity"] == "0", str(state))
    check("A33 월간: 끄는 동안 시트가 클릭을 받지 않음(pointer-events none)", state and state["pe"] == "none", str(state))
    check("A33 월간: 뒤의 날짜 칸이 놓을 자리로 강조됨", state and state["hover"] == 1, str(state))
    ghost = page.locator(".dnd-ghost-card").first
    check(
        "A33 월간: 미리보기 카드가 항목 이름을 들고 따라옴",
        ghost.count() == 1 and "약국 들르기" in ghost.inner_text(),
        ghost.inner_text() if ghost.count() else "none",
    )
    hint = page.locator(".dnd-ghost-hint").first
    check("A33 월간: 놓을 날짜 안내 문구", hint.count() == 1 and "로 옮기기" in hint.inner_text(), hint.inner_text() if hint.count() else "none")
    page.screenshot(path=f"{OUT}/a33-month-dragging.png")

    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "projects", "tk-5")
    check("A33 월간: 할 일이 그 날짜로 저장됨", body.get("date") == "2026-11-25", str(body))
    state = sheet_opacity(page)
    check("A33 월간: 손을 떼면 시트가 다시 보임", state and state["opacity"] == "1" and state["pe"] != "none", str(state))
    check("A33 월간: 옮긴 항목은 목록에서 빠짐", page.locator("[data-day-list-task='tk-5']").count() == 0, "")
    page.screenshot(path=f"{OUT}/a33-month-after.png")

    # ── 시간 일정을 다른 날짜 칸으로: 시각·길이 유지 ───────────────────────
    before = len(patches(mock, "calendar"))
    mouse_drag(page, page.locator("[data-day-list-event='ev-2']").first, page.locator("[data-month-cell='2026-11-26']").first)
    page.mouse.up()
    page.wait_for_timeout(900)
    moved = [c for c in patches(mock, "calendar")[before:] if c[2] == "ev-2"]
    stored = mock.item("calendar", "ev-2") or {}
    check(
        "A33 월간: 일정이 그 날짜로 옮겨지고 시각·길이가 유지됨",
        bool(moved) and stored.get("date") == "2026-11-26" and stored.get("startTime") == "14:00" and stored.get("endTime") == "15:00" and stored.get("allDay") is False,
        str(stored),
    )

    # ── 같은 날짜에 놓으면 아무것도 바뀌지 않음 ───────────────────────────
    before = len(patches(mock, "projects")) + len(patches(mock, "calendar"))
    mouse_drag(page, page.locator("[data-day-list-task='tk-8']").first, page.locator(f"[data-month-cell='{TODAY}']").first)
    page.mouse.up()
    page.wait_for_timeout(700)
    after = len(patches(mock, "projects")) + len(patches(mock, "calendar"))
    check("A33 월간: 원래 날짜에 놓으면 저장하지 않음", after == before, f"{before} -> {after}")

    # ── Esc로 취소: 저장 없음, 시트 복원 ───────────────────────────────────
    before = len(patches(mock, "projects")) + len(patches(mock, "calendar"))
    mouse_drag(page, page.locator("[data-day-list-event='ev-1']").first, page.locator("[data-month-cell='2026-11-27']").first)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    page.mouse.up()
    page.wait_for_timeout(500)
    after = len(patches(mock, "projects")) + len(patches(mock, "calendar"))
    state = sheet_opacity(page)
    check("A33 월간: Esc 취소는 저장하지 않음", after == before, f"{before} -> {after}")
    check("A33 월간: 취소해도 시트가 다시 보임", state and state["opacity"] == "1", str(state))

    # ── 짧은 클릭은 그대로 상세 열기 ───────────────────────────────────────
    page.locator("[data-day-list-task='tk-8']").first.click()
    page.wait_for_timeout(700)
    dialogs = [page.get_by_role("dialog").nth(i).get_attribute("aria-label") or "" for i in range(page.get_by_role("dialog").count())]
    check("A33 월간: 그냥 누르면 지금처럼 상세가 열림", any(label.startswith("할 일") for label in dialogs), str(dialogs))
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    ctx.close()


# ─────────────────────────────────────────────────────────── A33 · 주간 (PC)


def week_sheet_drag(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc-week")
    go_week(page)

    page.locator(f"[data-week-day-head='{TODAY}']").first.click()
    page.wait_for_timeout(600)
    check("A33 주간: 요일 머리글로 하루 목록 시트가 열림", sheet(page).count() == 1, "")
    page.screenshot(path=f"{OUT}/a33-week-sheet.png")

    # 할 일 → 다른 날짜 머리글
    mouse_drag(page, page.locator("[data-day-list-task='tk-8']").first, page.locator("[data-week-day-head='2026-11-19']").first)
    state = sheet_opacity(page)
    check("A33 주간: 끄는 동안 시트가 감춰짐", state and state["opacity"] == "0", str(state))
    check("A33 주간: 주간 날짜 열이 강조됨", state and state["hover"] == 1, str(state))
    page.screenshot(path=f"{OUT}/a33-week-dragging.png")
    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "projects", "tk-8")
    check("A33 주간: 할 일이 그 날짜로 저장됨", body.get("date") == "2026-11-19", str(body))
    check("A33 주간: 손을 떼면 시트가 다시 보임", (sheet_opacity(page) or {}).get("opacity") == "1", "")

    # 일정 → 시간표 칸
    before = len(patches(mock, "calendar"))
    column = page.locator("[data-drop-zone='timeline-day'][data-drop-day='2026-11-20']").first
    mouse_drag(page, page.locator("[data-day-list-event='ev-2']").first, column)
    page.mouse.up()
    page.wait_for_timeout(900)
    moved = [c for c in patches(mock, "calendar")[before:] if c[2] == "ev-2"]
    stored = mock.item("calendar", "ev-2") or {}
    check(
        "A33 주간: 일정이 시간표 칸의 날짜로 옮겨지고 시각이 유지됨",
        bool(moved) and stored.get("date") == "2026-11-20" and stored.get("startTime") == "14:00",
        str(stored),
    )
    ctx.close()


# ─────────────────────────────────────────────────────────── A33 · 폰


def month_sheet_drag_mobile(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 390, 844, mock, "mob-month")
    go_month(page)

    page.locator(f"[data-month-more='{TODAY}']").first.click()
    page.wait_for_timeout(500)
    check("A33 폰: 하루 목록 시트가 열림", sheet(page).count() == 1, "")

    source = page.locator("[data-day-list-task='tk-8']").first
    sb = source.bounding_box()
    target = page.locator("[data-month-cell='2026-11-24']").first
    target.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    point = safe_point(page, "[data-month-cell='2026-11-24']")
    sx, sy = center(sb)
    tx, ty = point["x"], point["y"]
    touch_long_press(page, "[data-day-list-task='tk-8']", sx, sy)
    page.wait_for_timeout(320)  # 160ms 롱프레스가 지나 드래그가 시작됩니다
    state = sheet_opacity(page)
    check("A33 폰: 꾹 누르면 시트가 감춰짐", state and state["opacity"] == "0", str(state))
    touch_move(page, tx, ty)
    page.wait_for_timeout(120)
    state = sheet_opacity(page)
    check("A33 폰: 뒤의 날짜 칸이 강조됨", state and state["hover"] == 1, str(state))
    page.screenshot(path=f"{OUT}/a33-mobile-dragging.png")
    touch_up(page, tx, ty)
    page.wait_for_timeout(900)
    body = last_patch(mock, "projects", "tk-8")
    check("A33 폰: 할 일이 그 날짜로 저장됨", body.get("date") == "2026-11-24", str(body))
    check("A33 폰: 손을 떼면 시트가 다시 보임", (sheet_opacity(page) or {}).get("opacity") == "1", "")
    page.screenshot(path=f"{OUT}/a33-mobile-after.png")
    ctx.close()


def week_sheet_drag_mobile(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 390, 844, mock, "mob-week")
    go_week(page)

    page.locator(f"[data-week-day-head='{TODAY}']").first.click()
    page.wait_for_timeout(600)
    check("A33 폰: 주간 하루 목록 시트가 열림", sheet(page).count() == 1, "")

    source = page.locator("[data-day-list-task='tk-9']").first
    sb = source.bounding_box()
    head = page.locator("[data-week-day-head='2026-11-19']").first
    head.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    point = safe_point(page, "[data-week-day-head='2026-11-19']")
    sx, sy = center(sb)
    tx, ty = point["x"], point["y"]
    touch_long_press(page, "[data-day-list-task='tk-9']", sx, sy)
    page.wait_for_timeout(320)
    touch_move(page, sx + 4, sy - 6)
    touch_move(page, tx, ty)
    page.wait_for_timeout(120)
    page.screenshot(path=f"{OUT}/a33-mobile-week-dragging.png")
    touch_up(page, tx, ty)
    page.wait_for_timeout(900)
    body = last_patch(mock, "projects", "tk-9")
    check("A33 폰: 주간 시트에서 끌어 옮긴 할 일이 저장됨", body.get("date") == "2026-11-19", str(body))
    ctx.close()


# ──────────────────────────────────────────────────────── A34 · 완료한 일정


def done_events(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc-done")
    go_month(page)

    month_chip = text_decoration(page, "[data-month-item='ev-7']")
    check("A34 월간: 완료한 일정 칩에 취소선", has_line_through(month_chip), str(month_chip))
    page.locator(f"[data-month-more='{TODAY}']").first.click()
    page.wait_for_timeout(500)
    list_chip = text_decoration(page, "[data-day-list-event='ev-6']")
    check("A34 월간 하루 목록: 완료한 일정에 취소선", has_line_through(list_chip), str(list_chip))
    page.screenshot(path=f"{OUT}/a34-month-done.png")
    page.locator("[data-day-list] button[aria-label='닫기']").first.click()
    page.wait_for_timeout(400)

    go_week(page)
    bar = text_decoration(page, "[data-all-day-bar='ev-6']")
    check("A34 주간: 완료한 종일 일정 막대에 취소선", has_line_through(bar), str(bar))
    card = text_decoration(page, "[data-timeline-event='ev-7']")
    check("A34 주간: 완료한 시간 일정 카드에 취소선", has_line_through(card), str(card))
    ongoing = text_decoration(page, "[data-all-day-bar='ev-1']")
    check("A34 주간: 완료하지 않은 일정에는 취소선이 없음", not has_line_through(ongoing), str(ongoing))
    page.screenshot(path=f"{OUT}/a34-week-done.png")
    ctx.close()


# ──────────────────────────────────────────────────────── A34 · 주간 바인더


def binder_weekly(browser, width, height, tag):
    mock = Mock(fixture())
    ctx, page = open_page(browser, width, height, mock, tag)
    go_binder(page)
    page.get_by_role("button", name="Weekly", exact=True).first.click()
    page.wait_for_timeout(700)

    check(f"{tag} 바인더: 기본에는 그날 일정·할 일이 보이지 않음", page.locator("[data-day-agenda]").count() == 0, str(page.locator("[data-day-agenda]").count()))
    row = page.locator(f"[data-binder-day='{TODAY}']").first
    row_text = row.inner_text() if row.count() else ""
    check(
        f"{tag} 바인더: 날짜 숫자와 쓴 글은 그대로 보임",
        "아침에 창문을 열었다" in row_text and "토" in row_text,
        row_text[:120],
    )
    page.screenshot(path=f"{OUT}/{tag}-binder-default.png")

    page.locator(f"[data-binder-day='{TODAY}'] button").first.click()
    page.wait_for_timeout(700)
    agenda = page.locator(f"[data-day-agenda='{TODAY}']")
    text = agenda.inner_text() if agenda.count() else ""
    check(f"{tag} 바인더: 칸을 누르면 그날 일정·할 일이 나타남", agenda.count() == 1, text[:80])
    check(f"{tag} 바인더: 나타난 목록에 일정과 할 일", "치과 예약" in text and "약국 들르기" in text, text[:160])
    order = page.evaluate(
        """(day) => {
          const agenda = document.querySelector(`[data-day-agenda='${day}']`);
          const area = document.querySelector('[data-binder-day="' + day + '"] textarea');
          if (!agenda || !area) return null;
          const a = agenda.getBoundingClientRect();
          const t = area.getBoundingClientRect();
          return { agendaBottom: a.bottom, areaTop: t.top, areaVisible: t.height > 0 };
        }""",
        TODAY,
    )
    check(
        f"{tag} 바인더: 일정·할 일이 입력창 위에 붙음",
        bool(order) and order["areaVisible"] and order["agendaBottom"] <= order["areaTop"] + 2,
        str(order),
    )
    page.screenshot(path=f"{OUT}/{tag}-binder-writing.png")

    page.locator("[data-binder-day='2026-11-18'] button").first.click()
    page.wait_for_timeout(800)
    check(f"{tag} 바인더: 다른 칸을 누르면 그 칸에만 보임", page.locator("[data-day-agenda]").count() == 1 and page.locator("[data-day-agenda='2026-11-18']").count() == 1, str(page.locator("[data-day-agenda]").count()))
    check(f"{tag} 바인더: 이전 칸의 목록은 다시 접힘", page.locator(f"[data-day-agenda='{TODAY}']").count() == 0, "")

    page.locator("h1").first.click()
    page.wait_for_timeout(700)
    check(f"{tag} 바인더: 바깥을 눌러 포커스가 풀리면 다시 숨김", page.locator("[data-day-agenda]").count() == 0, str(page.locator("[data-day-agenda]").count()))
    page.screenshot(path=f"{OUT}/{tag}-binder-blur.png")
    ctx.close()


# ────────────────────────────────────────────── A33 · 주간 프로젝트 칸 시트


def project_sheet_drag(browser, width, height, tag):
    mock = Mock(fixture())
    ctx, page = open_page(browser, width, height, mock, tag)
    go_week(page)

    cell = page.locator("[data-week-project-cell='브랜드 포트폴리오:2026-11-18']").first
    cell.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    cell.click()
    page.wait_for_timeout(500)
    check(f"A33 {tag} 프로젝트 칸: 시트가 열림", page.locator("[data-week-cell-sheet]").count() == 1, "")

    head = page.locator("[data-week-day-head='2026-11-20']").first
    head.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    point = safe_point(page, "[data-week-day-head='2026-11-20']")
    source = page.locator("[data-week-cell-drag='tk-3']").first
    sb = source.bounding_box()

    if tag.startswith("pc"):
        sx, sy = center(sb)
        page.mouse.move(sx, sy)
        page.mouse.down()
        page.mouse.move(sx + 6, sy + 6, steps=3)
        page.mouse.move(sx + 16, sy + 14, steps=4)
        page.mouse.move(point["x"], point["y"], steps=12)
        page.wait_for_timeout(120)
        state = sheet_opacity(page, "[data-week-cell-sheet]")
        check(f"A33 {tag} 프로젝트 칸: 끄는 동안 시트가 감춰짐", bool(state) and state["opacity"] == "0", str(state))
        check(f"A33 {tag} 프로젝트 칸: 놓을 날짜 열이 강조됨", bool(state) and state["hover"] == 1, str(state))
        page.mouse.up()
    else:
        sx, sy = center(sb)
        touch_long_press(page, "[data-week-cell-drag='tk-3']", sx, sy)
        page.wait_for_timeout(320)
        touch_move(page, point["x"], point["y"])
        page.wait_for_timeout(120)
        touch_up(page, point["x"], point["y"])

    page.wait_for_timeout(900)
    body = last_patch(mock, "projects", "tk-3")
    check(f"A33 {tag} 프로젝트 칸: 항목이 그 날짜로 저장됨", body.get("date") == "2026-11-20", str(body))
    state = sheet_opacity(page, "[data-week-cell-sheet]")
    check(f"A33 {tag} 프로젝트 칸: 손을 떼면 시트가 다시 보임", bool(state) and state["opacity"] == "1", str(state))
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        month_sheet_drag(browser)
        week_sheet_drag(browser)
        project_sheet_drag(browser, 1440, 900, "pc")
        project_sheet_drag(browser, 390, 844, "mob")
        month_sheet_drag_mobile(browser)
        week_sheet_drag_mobile(browser)
        done_events(browser)
        binder_weekly(browser, 1440, 900, "pc")
        binder_weekly(browser, 390, 844, "mob")
        browser.close()

    errors = [line for line in CONSOLE if "favicon" not in line]
    check("콘솔 에러 0건", len(errors) == 0, str(errors[:4]))

    print("\n===== RESULT A33/A34 =====")
    print(f"passed {len(ui.PASSES)} · failed {len(ui.FAILS)}")
    for f in ui.FAILS:
        print(" -", f)
    return 1 if ui.FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
