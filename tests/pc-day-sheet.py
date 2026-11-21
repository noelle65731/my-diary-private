"""
A32 checks: the week board's two day views on PC and phone.

  1) 프로젝트 칸(index 포함)을 누르면 그 날 그 프로젝트의 할 일 시트가 먼저 열립니다
     (예전에는 PC만 바로 상세/수정으로 갔고, index 칸은 시트가 비어 있었습니다).
  2) 요일 머리글 · 일정 칸(종일/시간)을 누르면 월간 보기와 같은 그 날 정리 목록이 열립니다.

    ./run-a25-test.sh tests/pc-day-sheet.py

The Notion API is answered inside the browser (see tests/ui-check.py), so every
assertion reads exactly what the app would send.
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
new_context = ui.new_context
check = ui.check
launch_args = ui.launch_args
patches = ui.patches
posts = ui.posts
TODAY = ui.TODAY


def sheet(page):
    return page.locator("[data-week-cell-sheet]")


def day_list(page):
    return page.locator("[data-day-list]")


def text_of(locator):
    return locator.first.inner_text() if locator.count() else ""


def close_all(page):
    for _ in range(3):
        if not sheet(page).count() and not day_list(page).count():
            return
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
    if sheet(page).count():
        page.locator("[data-week-cell-sheet] button[aria-label='닫기']").first.click()
    if day_list(page).count():
        page.locator("[data-day-list] button[aria-label='닫기']").first.click()
    page.wait_for_timeout(300)


def open_project_cell(page, project_title, day):
    page.locator(f"[data-week-project-cell='{project_title}:{day}']").first.click()
    page.wait_for_timeout(400)


def detail_open(page, prefix):
    for index in range(page.get_by_role("dialog").count()):
        label = page.get_by_role("dialog").nth(index).get_attribute("aria-label") or ""
        if label.startswith(prefix):
            return True
    return False


def last_post(mock, resource):
    items = posts(mock, resource)
    return items[-1][2] if items else {}


def pc_project_cells(browser, mock):
    ctx, page = new_context(browser, 1440, 900, mock)
    page.screenshot(path=f"{OUT}/pc-a25-week.png")

    # ── 1. 프로젝트 칸(할 일이 있는 칸) → 바로 상세가 아니라 그 날 목록 ─────────
    open_project_cell(page, "브랜드 포트폴리오", "2026-11-18")
    text = text_of(sheet(page))
    check("PC: 할 일이 있는 프로젝트 칸에 목록 시트가 열림", sheet(page).count() == 1, text[:80])
    check("PC: 그 칸의 할 일이 시트에 보임", "사례 3 정리" in text and "와이어프레임" in text, text[:120])
    check("PC: 시트가 먼저라 할 일 상세는 열리지 않음", not detail_open(page, "할 일"), str(page.get_by_role("dialog").count()))
    page.screenshot(path=f"{OUT}/pc-a25-project-cell-sheet.png")

    page.locator("[data-week-cell-task='tk-3']").first.click()
    page.wait_for_timeout(700)
    check("PC: 시트 안 항목을 누르면 상세가 열림", detail_open(page, "할 일"), "")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    close_all(page)

    # ── 2. index 행: 할 일이 있는 칸 → 시트에 그 할 일이 보임(빈칸 버그 수정) ──
    open_project_cell(page, "index", TODAY)
    text = text_of(sheet(page))
    check("PC: index 칸 시트가 열림", sheet(page).count() == 1, text[:80])
    check("PC: index 칸의 할 일이 시트에 보임", "약국 들르기" in text and "오늘 할 일 둘" in text, text[:160])
    page.screenshot(path=f"{OUT}/pc-a25-index-cell-sheet.png")
    close_all(page)

    # 할 일 제목 자체를 눌러도 상세가 아니라 그 날 목록이 먼저
    page.locator("[data-week-task='tk-5'] button").nth(1).click()
    page.wait_for_timeout(500)
    check("PC: 할 일 제목을 눌러도 상세 대신 그 날 목록", sheet(page).count() == 1 and not detail_open(page, "할 일"), str(page.get_by_role("dialog").count()))
    close_all(page)

    # ── 3. index 빈 칸 → 시트 → 프로젝트 없는 새 할 일 ─────────────────────────
    open_project_cell(page, "index", "2026-11-19")
    check("PC: index 빈 칸도 시트가 열림", sheet(page).count() == 1, "")
    check("PC: 빈 칸 안내 문구", "예정된 할 일이 없습니다" in text_of(sheet(page)), text_of(sheet(page))[:120])
    page.locator("[data-week-cell-add='true']").first.click()
    page.wait_for_timeout(700)
    editor = page.locator("[data-new-item-panel]").last
    check("PC: 시트의 '+ 할 일 추가'가 그 날짜로 편집기를 엶", editor.locator("input[type='date']").first.input_value() == "2026-11-19", "")
    editor.locator("input").first.fill("index 칸에서 더한 할 일")
    editor.get_by_role("button", name="추가", exact=True).click()
    page.wait_for_timeout(900)
    body = last_post(mock, "projects")
    check(
        "PC: index 칸에서 더한 할 일은 프로젝트 없이 저장",
        body.get("date") == "2026-11-19" and body.get("projectIds") == [],
        str({k: body.get(k) for k in ("title", "date", "projectIds")}),
    )

    # ── 4. 프로젝트 칸에서 '+ 할 일 추가' → 그 프로젝트·그 날짜 ───────────────
    open_project_cell(page, "브랜드 포트폴리오", "2026-11-17")
    page.locator("[data-week-cell-add='true']").first.click()
    page.wait_for_timeout(700)
    editor = page.locator("[data-new-item-panel]").last
    check("PC: 프로젝트 칸의 '+ 할 일 추가'가 그 날짜로 엶", editor.locator("input[type='date']").first.input_value() == "2026-11-17", "")
    editor.locator("input").first.fill("프로젝트 칸에서 더한 할 일")
    editor.get_by_role("button", name="추가", exact=True).click()
    page.wait_for_timeout(900)
    body = last_post(mock, "projects")
    check(
        "PC: 프로젝트 칸에서 더한 할 일은 그 프로젝트로 저장",
        body.get("date") == "2026-11-17" and body.get("projectIds") == ["pj-1"],
        str({k: body.get(k) for k in ("title", "date", "projectIds")}),
    )
    close_all(page)
    return ctx


def pc_day_summary(browser, mock):
    ctx, page = new_context(browser, 1440, 900, mock)

    # ── 5. 요일 머리글(토 21) → 그 날 정리 목록(월간과 같은 화면) ─────────────
    page.locator("[data-week-day-head='2026-11-21']").first.click()
    page.wait_for_timeout(500)
    text = text_of(day_list(page))
    check("PC: 요일 머리글 클릭으로 그 날 정리 목록이 열림", day_list(page).count() == 1, text[:80])
    check("PC: 정리 목록에 종일 일정", "종일 일정" in text and "도서관 반납" in text, text[:160])
    check("PC: 정리 목록에 시간 일정", "시간 일정" in text and "치과 예약" in text, text[:200])
    check("PC: 정리 목록에 할 일", "약국 들르기" in text and "오늘 할 일 둘" in text, text[:260])
    check("PC: '+ 일정' · '+ 할 일' · '이 날짜로 이동' 버튼", all(
        day_list(page).locator(f"[data-day-list-add-{key}]").count() == 1 for key in ("event", "task")
    ) and "이 날짜로 이동" in text, text[-90:])
    check(
        "PC: 머리글 클릭으로 바로 일간 보기로 뛰지 않음",
        "–" in page.locator("h1").first.inner_text(),
        page.locator("h1").first.inner_text(),
    )
    page.screenshot(path=f"{OUT}/pc-a25-header-day-list.png")

    # 항목 → 상세, 닫으면 목록으로 돌아옴
    page.locator("[data-day-list-task='tk-5']").first.click()
    page.wait_for_timeout(700)
    check("PC: 정리 목록의 항목을 누르면 상세가 열림", detail_open(page, "할 일"), "")
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    check("PC: 상세를 닫으면 정리 목록이 남음", day_list(page).count() == 1, "")

    # + 할 일 → 그 날짜로 새 할 일
    page.locator("[data-day-list-add-task='true']").first.click()
    page.wait_for_timeout(700)
    editor = page.locator("[data-new-item-panel]").last
    check("PC: 정리 목록의 '+ 할 일'이 그 날짜로 엶", editor.locator("input[type='date']").first.input_value() == TODAY, editor.locator("input[type='date']").first.input_value())
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # 이 날짜로 이동 → 일간 보기
    page.get_by_role("button", name="이 날짜로 이동").first.click()
    page.wait_for_timeout(700)
    heading = page.locator("h1").first.inner_text()
    check("PC: '이 날짜로 이동'이 그 날 일간 보기를 엶", "21" in heading and day_list(page).count() == 0, heading)
    page.screenshot(path=f"{OUT}/pc-a25-day-view.png")

    # ── 6. 시간표 빈칸 클릭 → 그 날 정리 목록 + 그 시각으로 일정 추가 ─────────
    page.get_by_role("button", name="주간", exact=True).first.click()
    page.wait_for_timeout(600)
    column = page.locator("[data-drop-zone='timeline-day'][data-drop-day='2026-11-18']").first
    frame = page.locator("[data-week-scroll='true']").first
    col_box = column.bounding_box()
    frame_box = frame.bounding_box()
    page.mouse.click(col_box["x"] + col_box["width"] / 2, frame_box["y"] + 30)
    page.wait_for_timeout(500)
    text = text_of(day_list(page))
    check("PC: 시간표 빈칸에 그 날 정리 목록이 열림", day_list(page).count() == 1, text[:80])
    check("PC: 그 날 할 일이 목록에 함께 보임", "사례 3 정리" in text, text[:160])
    check("PC: 누른 시각이 '+ 일정' 버튼에 표시됨", "+ 일정 " in text or "+ 일정" in text, text[-70:])
    page.screenshot(path=f"{OUT}/pc-a25-timeline-day-list.png")

    page.locator("[data-day-list-add-event='true']").first.click()
    page.wait_for_timeout(700)
    editor = page.get_by_role("dialog").last
    check("PC: '+ 일정'이 그 날짜로 새 일정을 엶", editor.locator("input[type='date']").first.input_value() == "2026-11-18", "")
    time_input = editor.locator("input[type='time']").first
    check("PC: 누른 시각이 시작 시각으로 채워짐", time_input.count() == 1 and bool(time_input.input_value()), time_input.input_value() if time_input.count() else "none")
    editor.locator("input[placeholder='무엇을 기록할까요?']").first.fill("빈칸에서 더한 일정")
    editor.get_by_role("button", name="추가", exact=True).click()
    page.wait_for_timeout(900)
    body = last_post(mock, "calendar")
    check(
        "PC: 빈칸에서 더한 일정이 그 날짜·그 시각으로 저장",
        body.get("date") == "2026-11-18" and bool(body.get("startTime")),
        str({k: body.get(k) for k in ("title", "date", "startTime", "allDay")}),
    )
    close_all(page)

    # ── 7. 일정 카드 · 종일 막대 → 그 날 정리 목록 ───────────────────────────
    page.locator("[data-timeline-event='ev-2']").first.click()
    page.wait_for_timeout(500)
    check("PC: 일정 카드가 그 날 정리 목록을 먼저 엶", day_list(page).count() == 1 and "치과 예약" in text_of(day_list(page)), "")
    check("PC: 일정 카드로 상세가 바로 열리지 않음", not detail_open(page, "일정 ·"), str(page.get_by_role("dialog").count()))
    page.locator("[data-day-list-event='ev-2']").first.click()
    page.wait_for_timeout(600)
    check("PC: 목록 안 일정을 누르면 상세가 열림", detail_open(page, "일정 ·"), "")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    close_all(page)

    page.locator("[data-all-day-bar='ev-1']").first.click()
    page.wait_for_timeout(500)
    check("PC: 종일 막대도 그 날 정리 목록을 엶", day_list(page).count() == 1 and "도서관 반납" in text_of(day_list(page)), "")
    page.screenshot(path=f"{OUT}/pc-a25-allday-day-list.png")
    close_all(page)
    return ctx


def pc_drag(browser, mock):
    ctx, page = new_context(browser, 1440, 900, mock)

    # ── 8. 할 일 끌어 옮기기(시트가 열리지 않음) ─────────────────────────────
    before = len(patches(mock, "projects"))
    chip = page.locator("[data-week-task='tk-3']").first
    target = page.locator("[data-week-project-cell='브랜드 포트폴리오:2026-11-19']").first
    chip_box = chip.bounding_box()
    target_box = target.bounding_box()
    page.mouse.move(chip_box["x"] + 8, chip_box["y"] + 6)
    page.mouse.down()
    page.mouse.move(chip_box["x"] + 40, chip_box["y"] + 30, steps=8)
    page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + 14, steps=12)
    page.mouse.up()
    page.wait_for_timeout(900)
    moved = [c for c in patches(mock, "projects")[before:] if c[2] == "tk-3"]
    check("PC: 할 일 끌어 옮기기가 그대로 동작", bool(moved) and moved[-1][3].get("date") == "2026-11-19", str(moved))
    check("PC: 끌어 옮긴 뒤에는 시트가 열리지 않음", sheet(page).count() == 0 and day_list(page).count() == 0, "")

    # ── 9. 일정 카드를 옆 요일 칸으로 끌어 옮기기 ────────────────────────────
    before = len(patches(mock, "calendar"))
    card = page.locator("[data-timeline-event='ev-2']").first
    card.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    card_box = card.bounding_box()
    dest = page.locator("[data-drop-zone='timeline-day'][data-drop-day='2026-11-22']").first
    dest_box = dest.bounding_box()
    page.mouse.move(card_box["x"] + card_box["width"] / 2, card_box["y"] + card_box["height"] / 2)
    page.mouse.down()
    page.mouse.move(card_box["x"] + card_box["width"] / 2 + 30, card_box["y"] + card_box["height"] / 2, steps=8)
    page.mouse.move(dest_box["x"] + dest_box["width"] / 2, card_box["y"] + card_box["height"] / 2, steps=14)
    page.mouse.up()
    page.wait_for_timeout(900)
    moved_event = [c for c in patches(mock, "calendar")[before:] if c[2] == "ev-2"]
    check("PC: 일정 끌어 옮기기가 그대로 동작", bool(moved_event) and moved_event[-1][3].get("date") == "2026-11-22", str(moved_event))
    check("PC: 일정을 끈 뒤에도 목록이 열리지 않음", day_list(page).count() == 0 and sheet(page).count() == 0, "")

    # ── 10. 요일 머리글의 일간 보기 이동은 목록 안 버튼으로 ────────────────────
    page.locator("[data-week-day-head='2026-11-18']").first.click()
    page.wait_for_timeout(500)
    check("PC: 머리글은 먼저 정리 목록", day_list(page).count() == 1, "")
    page.get_by_role("button", name="이 날짜로 이동").first.click()
    page.wait_for_timeout(700)
    heading = page.locator("h1").first.inner_text()
    check("PC: '이 날짜로 이동'으로 18일 일간 보기", "18" in heading, heading)
    ctx.close()


def mobile_checks(browser):
    mock = Mock(build_fixture())
    ctx, page = new_context(browser, 402, 874, mock)
    page.screenshot(path=f"{OUT}/mob-a25-week.png")

    # 요일 머리글 → 그 날 정리 목록(모바일도 PC와 동일)
    page.locator("[data-week-day-head='2026-11-21']").first.click()
    page.wait_for_timeout(500)
    text = text_of(day_list(page))
    check("모바일: 요일 머리글에 그 날 정리 목록", day_list(page).count() == 1, text[:80])
    check("모바일: 정리 목록에 일정·할 일", "치과 예약" in text and "약국 들르기" in text, text[:200])
    page.screenshot(path=f"{OUT}/mob-a25-header-day-list.png")
    close_all(page)

    # 프로젝트 칸 → 프로젝트 시트(기존 동작 유지)
    cell = page.locator("[data-week-project-cell='브랜드 포트폴리오:2026-11-18']").first
    cell.scroll_into_view_if_needed()
    cell.click()
    page.wait_for_timeout(400)
    check("모바일: 프로젝트 칸에 할 일 시트", sheet(page).count() == 1 and "사례 3 정리" in text_of(sheet(page)), text_of(sheet(page))[:80])
    page.screenshot(path=f"{OUT}/mob-a25-project-sheet.png")
    close_all(page)

    # index 칸 → 그 날 할 일이 보임
    index_cell = page.locator(f"[data-week-project-cell='index:{TODAY}']").first
    index_cell.scroll_into_view_if_needed()
    index_cell.click()
    page.wait_for_timeout(400)
    text = text_of(sheet(page))
    check("모바일: index 칸 시트에 할 일이 보임", sheet(page).count() == 1 and "오늘 할 일 둘" in text, text[:120])
    page.screenshot(path=f"{OUT}/mob-a25-index-sheet.png")
    close_all(page)

    # 시간표 일정 카드 → 상세(기존 동작 유지)
    card = page.locator("[data-timeline-event='ev-2']").first
    if card.count():
        card.scroll_into_view_if_needed()
        card.click()
        page.wait_for_timeout(500)
        check("모바일: 일정 카드는 그대로 상세", detail_open(page, "일정 ·") and day_list(page).count() == 0, "")
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

    # 오늘 칸의 빈 시간표 → 새 일정(기존 동작 유지)
    column = page.locator(f"[data-drop-zone='timeline-day'][data-drop-day='{TODAY}']").first
    column.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    box = column.bounding_box()
    if box:
        page.mouse.click(box["x"] + box["width"] / 2, box["y"] + 24)
        page.wait_for_timeout(600)
        has_editor = page.locator("input[placeholder='무엇을 기록할까요?']").count() > 0
        check("모바일: 빈 시간표 칸은 예전처럼 새 일정", has_editor and day_list(page).count() == 0, str(page.get_by_role("dialog").count()))
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        pc_project_cells(browser, Mock(build_fixture()))
        pc_day_summary(browser, Mock(build_fixture()))
        pc_drag(browser, Mock(build_fixture()))
        mobile_checks(browser)
        browser.close()

    print("\n===== RESULT A32 =====")
    print(f"passed {len(ui.PASSES)} · failed {len(ui.FAILS)}")
    for f in ui.FAILS:
        print(" -", f)
    return 1 if ui.FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
