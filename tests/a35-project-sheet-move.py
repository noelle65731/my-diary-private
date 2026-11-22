"""
A35 — 프로젝트 칸 시트에서 끌어 다른 프로젝트(와 다른 날짜)로 옮기기

  1) 시트 안의 할 일을 꾹 누르면(마우스는 조금 끌어) 시트와 어두운 배경이 사라지고 뒤의
     주간 프로젝트 게시판이 그대로 보인다.
  2) 다른 프로젝트 행의 다른 날 칸에 놓으면 projectId 와 날짜가 함께 저장된다.
  3) 다른 프로젝트 행의 같은 날 칸에 놓으면 날짜는 그대로 두고 프로젝트만 바뀐다.
  4) 다른 프로젝트 행의 이름(왼쪽 열)에 놓으면 날짜를 그대로 두고 프로젝트만 바뀐다.
  5) 미리보기 안내가 프로젝트·날짜 변경을 함께 보여 준다.
  6) Esc 로 취소하면 저장하지 않고 시트가 돌아온다.
  7) 폰(390×844)에서도 터치 롱프레스로 같은 이동이 된다.

    NEXT_DIST_DIR=.next-a35 node node_modules/next/dist/bin/next start -p 3217 &
    BASE=http://127.0.0.1:3217 CHROME=... python3 tests/a35-project-sheet-move.py
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
task = ui.task
new_context = ui.new_context
check = ui.check
launch_args = ui.launch_args
patches = ui.patches

TODAY = ui.TODAY
CONSOLE = []


def fixture():
    """공용 픽스처 + 다른 프로젝트 행이 같은 날에도 있도록 한 건 더."""
    data = build_fixture()
    data["projects"].append(task("tk-10", "책상 정리", category="개인", date="2026-11-18", projectIds=["pj-2"]))
    return data


def watch(page, tag):
    page.on("console", lambda m: CONSOLE.append(f"{tag}:console:{m.type}:{m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: CONSOLE.append(f"{tag}:pageerror:{e}"))


def open_page(browser, width, height, mock, tag):
    ctx, page = new_context(browser, width, height, mock)
    watch(page, tag)
    return ctx, page


def go_week(page):
    page.get_by_role("button", name="캘린더", exact=True).first.click()
    page.wait_for_timeout(500)
    page.get_by_role("button", name="주간", exact=True).first.click()
    page.wait_for_timeout(800)


def center(box):
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def last_patch(mock, item_id):
    found = [c for c in patches(mock, "projects") if c[2] == item_id]
    return found[-1][3] if found else {}


def open_cell(page, project, day):
    cell = page.locator(f"[data-week-project-cell='{project}:{day}']").first
    cell.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    cell.click()
    page.wait_for_timeout(500)


def sheet_state(page, selector="[data-week-cell-sheet]"):
    return page.evaluate(
        """(sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return { opacity: getComputedStyle(el).opacity, pe: getComputedStyle(el).pointerEvents,
               hover: document.querySelectorAll("[data-drop-hover='true']").length };
    }""",
        selector,
    )


def hover_point(page, selector):
    """시트를 감춘 상태(드래그 중)에서 그 칸이 실제로 눌리는 좌표를 찾습니다."""
    return page.evaluate(
        """(sel) => {
          const sheets = [...document.querySelectorAll('[data-week-cell-sheet], [data-day-list]')];
          const saved = sheets.map((el) => ({ el, v: el.style.visibility, pe: el.style.pointerEvents }));
          for (const el of sheets) { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
          const el = document.querySelector(sel);
          let point = null;
          if (el) {
            const r = el.getBoundingClientRect();
            const fractions = [[0.5, 0.5], [0.35, 0.35], [0.65, 0.35], [0.5, 0.2], [0.5, 0.8]];
            for (const [fx, fy] of fractions) {
              const px = r.left + r.width * fx;
              const py = r.top + r.height * fy;
              if (px < 1 || py < 1 || px > innerWidth - 1 || py > innerHeight - 1) continue;
              const hit = document.elementFromPoint(px, py);
              if (hit && (hit === el || el.contains(hit))) { point = { x: px, y: py }; break; }
            }
            if (!point) point = { x: r.left + r.width / 2, y: r.top + r.height / 2, fallback: true };
          }
          for (const item of saved) { item.el.style.visibility = item.v; item.el.style.pointerEvents = item.pe; }
          return point;
        }""",
        selector,
    )


def mouse_drag(page, source, point):
    sb = source.bounding_box()
    sx, sy = center(sb)
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 6, sy + 6, steps=3)
    page.mouse.move(sx + 16, sy + 14, steps=4)
    page.mouse.move(point["x"], point["y"], steps=12)
    page.wait_for_timeout(150)


def touch(page, kind, x, y):
    page.evaluate(
        """([kind, x, y]) => {
          const target = kind === 'down' ? document.querySelector('[data-a35-source]') : window;
          target.dispatchEvent(new PointerEvent('pointer' + kind, {
            bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch',
            isPrimary: true, clientX: x, clientY: y,
            buttons: kind === 'up' ? 0 : 1, button: 0,
          }));
        }""",
        [kind, x, y],
    )


# ─────────────────────────────────────────────── PC · 날짜 + 프로젝트 함께

def pc_move_other_project_and_day(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc")
    go_week(page)

    open_cell(page, "브랜드 포트폴리오", "2026-11-18")
    check("A35 PC: 프로젝트 칸 시트가 열림", page.locator("[data-week-cell-sheet]").count() == 1, "")
    check("A35 PC: 시트에 사례 3 정리가 있음", page.locator("[data-week-cell-drag='tk-3']").count() == 1, "")

    target = page.locator("[data-drop-zone='week-task-day'][data-drop-project='pj-2'][data-drop-day='2026-11-22']").first
    target.scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    point = hover_point(page, "[data-drop-zone='week-task-day'][data-drop-project='pj-2'][data-drop-day='2026-11-22']")
    check("A35 PC: 대상 칸 좌표를 찾음", bool(point) and not point.get("fallback"), str(point))

    source = page.locator("[data-week-cell-drag='tk-3']").first
    mouse_drag(page, source, point)

    state = sheet_state(page)
    check("A35 PC: 끄는 동안 시트가 감춰짐(opacity 0)", state and state["opacity"] == "0", str(state))
    check("A35 PC: 시트가 클릭을 받지 않음", state and state["pe"] == "none", str(state))
    check("A35 PC: 놓을 칸이 강조됨", state and state["hover"] == 1, str(state))
    hint = page.locator(".dnd-ghost-hint").first
    hint_text = hint.inner_text() if hint.count() else ""
    check("A35 PC: 안내가 프로젝트와 날짜를 함께 보여 줌", "집 정리" in hint_text and "11/22" in hint_text, hint_text)
    page.screenshot(path=f"{OUT}/a35-pc-dragging.png")

    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-3")
    check("A35 PC: 프로젝트가 집 정리로 저장됨", body.get("projectIds") == ["pj-2"], str(body))
    check("A35 PC: 날짜도 함께 저장됨", body.get("date") == "2026-11-22", str(body))
    check("A35 PC: 프로젝트 분류를 따라감", body.get("category") == "개인", str(body))
    state = sheet_state(page)
    check("A35 PC: 손을 떼면 시트가 다시 보임", state and state["opacity"] == "1", str(state))
    check("A35 PC: 옮긴 항목은 시트 목록에서 빠짐", page.locator("[data-week-cell-drag='tk-3']").count() == 0, "")
    page.screenshot(path=f"{OUT}/a35-pc-after.png")
    ctx.close()


# ───────────────────────────────────────────────── PC · 같은 날 프로젝트만

def pc_move_same_day(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc2")
    go_week(page)

    open_cell(page, "브랜드 포트폴리오", "2026-11-18")
    point = hover_point(page, "[data-drop-zone='week-task-day'][data-drop-project='pj-2'][data-drop-day='2026-11-18']")
    source = page.locator("[data-week-cell-drag='tk-4']").first
    mouse_drag(page, source, point)
    hint = page.locator(".dnd-ghost-hint").first
    hint_text = hint.inner_text() if hint.count() else ""
    check("A35 PC 같은 날: 안내는 프로젝트만", hint_text.strip() == "집 정리로 옮기기", hint_text)
    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-4")
    check("A35 PC 같은 날: 프로젝트만 바뀜", body.get("projectIds") == ["pj-2"] and "date" not in body, str(body))
    ctx.close()


def pc_move_row_name(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc3")
    go_week(page)

    open_cell(page, "브랜드 포트폴리오", "2026-11-18")
    row = page.locator(f"[data-drop-zone='week-project-row'][data-drop-project='pj-2']").first
    row.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    point = hover_point(page, "[data-drop-zone='week-project-row'][data-drop-project='pj-2']")
    source = page.locator("[data-week-cell-drag='tk-4']").first
    mouse_drag(page, source, point)
    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-4")
    check("A35 PC 행 이름: 날짜 그대로 프로젝트만 바뀜", body.get("projectIds") == ["pj-2"] and "date" not in body, str(body))
    ctx.close()


def pc_index_to_project(browser):
    """index(프로젝트 없음) 행의 시트에서 다른 프로젝트 행으로."""
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc5")
    go_week(page)

    open_cell(page, "index", TODAY)
    check("A35 PC index: index 칸 시트가 열림", page.locator("[data-week-cell-drag='tk-8']").count() == 1, "")
    target_sel = "[data-drop-zone='week-task-day'][data-drop-project='pj-1'][data-drop-day='2026-11-20']"
    page.locator(target_sel).first.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    point = hover_point(page, target_sel)
    mouse_drag(page, page.locator("[data-week-cell-drag='tk-8']").first, point)
    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-8")
    check("A35 PC index→프로젝트: projectIds 와 날짜가 함께 저장됨", body.get("projectIds") == ["pj-1"] and body.get("date") == "2026-11-20", str(body))
    check("A35 PC index→프로젝트: 분류도 프로젝트를 따라감", body.get("category") == "업무", str(body))
    ctx.close()


def pc_project_to_index(browser):
    """프로젝트 행의 시트에서 index 행으로 — 프로젝트를 떼어 냅니다."""
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc6")
    go_week(page)

    open_cell(page, "브랜드 포트폴리오", "2026-11-18")
    target_sel = f"[data-drop-zone='week-task-day'][data-drop-project='inbox'][data-drop-day='{TODAY}']"
    page.locator(target_sel).first.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    point = hover_point(page, target_sel)
    mouse_drag(page, page.locator("[data-week-cell-drag='tk-4']").first, point)
    hint = page.locator(".dnd-ghost-hint").first
    hint_text = hint.inner_text() if hint.count() else ""
    check("A35 PC →index: 안내에 index 가 나옴", "index" in hint_text, hint_text)
    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-4")
    check("A35 PC →index: projectIds 가 비워짐", body.get("projectIds") == [] and body.get("date") == TODAY, str(body))
    ctx.close()


def pc_cancel(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc4")
    go_week(page)

    open_cell(page, "브랜드 포트폴리오", "2026-11-18")
    before = len(patches(mock, "projects"))
    point = hover_point(page, "[data-drop-zone='week-task-day'][data-drop-project='pj-2'][data-drop-day='2026-11-22']")
    mouse_drag(page, page.locator("[data-week-cell-drag='tk-3']").first, point)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    page.mouse.up()
    page.wait_for_timeout(500)
    state = sheet_state(page)
    check("A35 PC 취소: 저장하지 않음", len(patches(mock, "projects")) == before, str(len(patches(mock, "projects")) - before))
    check("A35 PC 취소: 시트가 다시 보임", state and state["opacity"] == "1", str(state))
    ctx.close()


# ───────────────────────────────────────────────────────────── 폰 · 터치

def pc_grid_drag(browser):
    """게시판에서 바로 끌 때도 같게 — 다른 프로젝트 행이면 프로젝트까지, 같은 행이면 날짜만."""
    mock = Mock(fixture())
    ctx, page = open_page(browser, 1440, 900, mock, "pc7")
    go_week(page)

    # 같은 행의 다른 날 — 날짜만
    source = page.locator(f"[data-week-task='tk-8']").first
    sb = source.bounding_box()
    point = hover_point(page, f"[data-drop-zone='week-task-day'][data-drop-project='inbox'][data-drop-day='2026-11-20']")
    mouse_drag(page, source, point)
    hint = page.locator(".dnd-ghost-hint").first.inner_text() if page.locator(".dnd-ghost-hint").count() else ""
    check("A35 게시판 같은 행: 안내는 날짜만", hint.strip() == "11/20로 옮기기", hint)
    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-8")
    check("A35 게시판 같은 행: 날짜만 바뀜", body.get("date") == "2026-11-20" and "projectIds" not in body, str(body))

    # 다른 프로젝트 행 — 프로젝트까지
    point = hover_point(page, "[data-drop-zone='week-task-day'][data-drop-project='pj-2'][data-drop-day='2026-11-22']")
    mouse_drag(page, page.locator("[data-week-task='tk-9']").first, point)
    hint = page.locator(".dnd-ghost-hint").first.inner_text() if page.locator(".dnd-ghost-hint").count() else ""
    check("A35 게시판 다른 행: 안내에 프로젝트와 날짜", "집 정리" in hint and "11/22" in hint, hint)
    page.mouse.up()
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-9")
    check("A35 게시판 다른 행: 프로젝트와 날짜가 함께 저장됨", body.get("projectIds") == ["pj-2"] and body.get("date") == "2026-11-22", str(body))
    ctx.close()


def mobile_move_other_project(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 390, 844, mock, "mob")
    go_week(page)

    open_cell(page, "브랜드 포트폴리오", "2026-11-18")
    check("A35 폰: 프로젝트 칸 시트가 열림", page.locator("[data-week-cell-sheet]").count() == 1, "")

    target_sel = "[data-drop-zone='week-task-day'][data-drop-project='pj-2'][data-drop-day='2026-11-22']"
    row = page.locator("[data-week-project-cell='집 정리:2026-11-22']").first
    row.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    point = hover_point(page, target_sel)
    check("A35 폰: 대상 칸이 화면 안에 있음", bool(point) and not point.get("fallback"), str(point))

    source = page.locator("[data-week-cell-drag='tk-3']").first
    page.locator("[data-week-cell-drag='tk-3']").first.evaluate("el => el.setAttribute('data-a35-source', 'true')")
    sb = source.bounding_box()
    sx, sy = center(sb)
    touch(page, "down", sx, sy)
    page.wait_for_timeout(320)
    state = sheet_state(page)
    check("A35 폰: 꾹 누르면 시트가 감춰짐", state and state["opacity"] == "0", str(state))
    touch(page, "move", sx + 4, sy - 8)
    page.wait_for_timeout(60)
    touch(page, "move", point["x"], point["y"])
    page.wait_for_timeout(150)
    state = sheet_state(page)
    check("A35 폰: 대상 칸이 강조됨", state and state["hover"] == 1, str(state))
    page.screenshot(path=f"{OUT}/a35-mobile-dragging.png")
    touch(page, "up", point["x"], point["y"])
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-3")
    check("A35 폰: 프로젝트가 집 정리로 저장됨", body.get("projectIds") == ["pj-2"], str(body))
    check("A35 폰: 날짜도 함께 저장됨", body.get("date") == "2026-11-22", str(body))
    state = sheet_state(page)
    check("A35 폰: 손을 떼면 시트가 다시 보임", state and state["opacity"] == "1", str(state))
    page.screenshot(path=f"{OUT}/a35-mobile-after.png")
    ctx.close()


def mobile_move_row_name(browser):
    mock = Mock(fixture())
    ctx, page = open_page(browser, 390, 844, mock, "mob2")
    go_week(page)

    open_cell(page, "브랜드 포트폴리오", "2026-11-18")
    page.locator("[data-week-cell-drag='tk-4']").first.evaluate("el => el.setAttribute('data-a35-source', 'true')")
    row = page.locator("[data-drop-zone='week-project-row'][data-drop-project='pj-2']").first
    row.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    point = hover_point(page, "[data-drop-zone='week-project-row'][data-drop-project='pj-2']")
    sb = page.locator("[data-week-cell-drag='tk-4']").first.bounding_box()
    sx, sy = center(sb)
    touch(page, "down", sx, sy)
    page.wait_for_timeout(320)
    touch(page, "move", sx + 4, sy - 8)
    page.wait_for_timeout(60)
    touch(page, "move", point["x"], point["y"])
    page.wait_for_timeout(150)
    touch(page, "up", point["x"], point["y"])
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-4")
    check("A35 폰 행 이름: 날짜 그대로 프로젝트만 바뀜", body.get("projectIds") == ["pj-2"] and "date" not in body, str(body))
    ctx.close()


def mobile_scroll_to_far_row(browser):
    """행이 화면보다 길 때 — 끌고 내려가면 게시판이 저절로 넘어가 화면 밖 프로젝트 행에도 놓을 수 있다."""
    data = fixture()
    for index in range(7):
        pid = f"pj-x{index}"
        data["projects"].append(task(pid, f"프로젝트 {index + 1}", kind="프로젝트", category="업무", date="2026-11-01"))
        data["projects"].append(task(f"tk-x{index}", f"할 일 {index + 1}", category="업무", date=TODAY, projectIds=[pid]))
    mock = Mock(data)
    ctx, page = open_page(browser, 390, 844, mock, "mob3")
    go_week(page)

    open_cell(page, "index", TODAY)
    source = page.locator("[data-week-cell-drag='tk-8']").first
    page.locator("[data-week-cell-drag='tk-8']").first.evaluate("el => el.setAttribute('data-a35-source', 'true')")
    sb = source.bounding_box()
    sx, sy = center(sb)
    board = page.locator("[data-week-board-scroll='true']").first
    before = board.evaluate("el => el.scrollTop")
    touch(page, "down", sx, sy)
    page.wait_for_timeout(320)
    touch(page, "move", sx + 3, sy - 12)
    page.wait_for_timeout(80)
    touch(page, "move", 200, 780)
    page.wait_for_timeout(1200)
    after = board.evaluate("el => el.scrollTop")
    check("A35 폰 스크롤: 화면 가장자리에서 게시판이 넘어감", after > before + 20, f"{before} -> {after}")

    target_sel = f"[data-drop-zone='week-task-day'][data-drop-project='pj-x6'][data-drop-day='{TODAY}']"
    point = hover_point(page, target_sel)
    check("A35 폰 스크롤: 내려간 뒤 대상 칸이 화면 안에 있음", bool(point) and not point.get("fallback"), str(point))
    touch(page, "move", point["x"], point["y"])
    page.wait_for_timeout(150)
    hint = page.locator(".dnd-ghost-hint").first.inner_text() if page.locator(".dnd-ghost-hint").count() else ""
    check("A35 폰 스크롤: 안내가 그 프로젝트를 가리킴", "프로젝트 7" in hint, hint)
    page.screenshot(path=f"{OUT}/a35-mobile-far-row.png")
    touch(page, "up", point["x"], point["y"])
    page.wait_for_timeout(900)
    body = last_patch(mock, "tk-8")
    check("A35 폰 스크롤: 화면 밖이었던 행으로 저장됨", body.get("projectIds") == ["pj-x6"], str(body))
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        pc_move_other_project_and_day(browser)
        pc_move_same_day(browser)
        pc_move_row_name(browser)
        pc_index_to_project(browser)
        pc_project_to_index(browser)
        pc_cancel(browser)
        pc_grid_drag(browser)
        mobile_move_other_project(browser)
        mobile_move_row_name(browser)
        mobile_scroll_to_far_row(browser)
        browser.close()

    errors = [line for line in CONSOLE if "favicon" not in line]
    check("콘솔 에러 0건", len(errors) == 0, str(errors[:4]))

    print("\n===== RESULT A35 =====")
    print(f"passed {len(ui.PASSES)} · failed {len(ui.FAILS)}")
    for f in ui.FAILS:
        print(" -", f)
    return 1 if ui.FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
