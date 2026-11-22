"""A41 — 웹 다이어리 15건 2차 개편 확인 (데모 데이터).

    tests/run-with-server.sh tests/v17-check.py
"""
import json
import os
import time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
os.makedirs(OUT, exist_ok=True)
errors = []
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" :: {detail}"))


def launch(p, viewport, mobile=False):
    browser = p.chromium.launch(
        executable_path=SHELL,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
        env={**os.environ, "LD_LIBRARY_PATH": LIBS},
    )
    context = browser.new_context(
        viewport=viewport, locale="ko-KR", timezone_id="Asia/Seoul", is_mobile=mobile, has_touch=mobile
    )
    page = context.new_page()
    page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    return browser, context, page


def drag_mouse(page, x1, y1, x2, y2):
    page.mouse.move(x1, y1)
    page.mouse.down()
    page.mouse.move(x1 + 10, y1 + 4, steps=4)
    page.wait_for_timeout(60)
    page.mouse.move(x2, y2, steps=14)
    page.wait_for_timeout(80)
    page.mouse.up()
    page.wait_for_timeout(500)


def slots_of(page):
    return page.eval_on_selector_all(
        "[data-card-slot]", "els => els.map(e => ({slot: Number(e.dataset.cardSlot), key: e.innerText.split('\\n')[0]}))"
    )


with sync_playwright() as p:
    browser, context, page = launch(p, {"width": 1440, "height": 900})
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)

    # ── 5) 뷰 전환 스위치 위치 고정 ──
    xs = []
    for label in ["월간", "주간", "3일", "일간", "연간"]:
        page.click(f'button:has-text("{label}")')
        page.wait_for_timeout(600)
        box = page.locator("[data-view-switch]").bounding_box()
        xs.append((label, round(box["x"]), round(box["width"])))
    check("5. 뷰 전환 스위치 x 고const", len({x for _, x, _ in xs}) == 1, str(xs))

    # ── 4) 미니 달력 현재 주 강조 ──
    page.click('button:has-text("주간")')
    page.wait_for_timeout(700)
    week_bg = page.evaluate(
        """() => {
          const el = document.querySelector('[data-mini-in-week="true"]:not([data-mini-day$="-22"])');
          return el ? getComputedStyle(el).backgroundColor : null;
        }"""
    )
    check("4. 미니 달력 현재 주 배경색", week_bg == "rgb(211, 225, 248)", str(week_bg))

    # ── 15) 오른쪽 패널 접기·펼치기 ──
    aside = page.locator(".side-panel").first
    check("15. 주간 오른쪽 패널 있음", aside.count() == 1)
    board_before = page.locator("[data-week-board-scroll]").first.bounding_box()["width"]
    page.click("[data-week-panel-toggle]")
    page.wait_for_timeout(600)
    check("15. 접으면 패널 사라짐", page.locator(".side-panel").count() == 0)
    board_after = page.locator("[data-week-board-scroll]").first.bounding_box()["width"]
    check("15. 접으면 게시판이 넓어짐", board_after > board_before + 100, f"{round(board_before)} → {round(board_after)}")
    stored = page.evaluate("() => window.localStorage.getItem('my-diary:week-panel-collapsed:v1')")
    check("15. 접힘 상태 저장", stored == "1", str(stored))
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1400)
    check("15. 새로 고쳐도 접힘 유지", page.locator(".side-panel").count() == 0)
    page.click("[data-week-panel-toggle]")
    page.wait_for_timeout(600)
    check("15. 다시 펼치기", page.locator(".side-panel").count() == 1)
    page.click('button:has-text("3일")')
    page.wait_for_timeout(600)
    check("15. 3일 보기에도 패널·토글", page.locator(".side-panel").count() == 1 and page.locator("[data-week-panel-toggle]").count() == 1)
    page.click('button:has-text("주간")')
    page.wait_for_timeout(600)

    # ── 7w) 주간 종일 연결 막대 + 리사이즈 ──
    week_bar = page.locator("[data-all-day-bar='demo-ev-span-1']")
    check("7w. 주간 종일 연결 막대", week_bar.count() == 1)
    if week_bar.count() == 1:
        end_before = int(week_bar.get_attribute("data-all-day-end"))
        handle = page.locator("[data-all-day-bar='demo-ev-span-1'] [data-all-day-handle='end']").first
        hb = handle.bounding_box()
        target = page.locator("[data-week-day-head]").nth(end_before - 1).bounding_box()
        drag_mouse(page, hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2, target["x"] + target["width"] / 2, target["y"] + 30)
        page.wait_for_timeout(600)
        end_after = int(page.locator("[data-all-day-bar='demo-ev-span-1']").first.get_attribute("data-all-day-end"))
        check("7w. 주간 막대 끝을 끌어 기간 줄이기", end_after < end_before, f"{end_before} → {end_after}")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1500)

    # 9) 주간 메모 저장 토스트
    memo_box = page.locator("textarea[aria-label='이번 주 메모']").first
    if memo_box.count():
        memo_box.click()
        memo_box.fill("토스트 확인용 메모")
        page.locator("h1").first.click()
        page.wait_for_timeout(800)
        toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
        check("9. 주간 메모 저장 토스트", "메모" in toast, toast)

    # ── 14) 주간 프로젝트 이름 → 프로젝트 서랍 ──
    name = page.locator("[data-week-project-row]").nth(1).locator("button").first
    rows = page.eval_on_selector_all("[data-week-project-row]", "els => els.map(e => e.dataset.weekProjectRow)")
    check("14. 프로젝트 행 있음", len(rows) >= 2, str(rows))
    name.click()
    page.wait_for_timeout(700)
    drawer_title = page.evaluate(
        """() => {
          const d = document.querySelector('[role="dialog"]');
          return d ? d.innerText.slice(0, 400) : null;
        }"""
    )
    check("14. 주간 이름 클릭 → 프로젝트 서랍(할 일·수정)", bool(drawer_title) and "프로젝트 수정" in (drawer_title or ""), str(drawer_title))
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    # index 행
    page.locator("[data-week-project-row='inbox'] button").first.click()
    page.wait_for_timeout(700)
    check("14. index 이름 클릭 → index 서랍", page.locator("[data-index-drawer-title]").count() == 1)
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # ── 8) PC 바인더 하단 잘림 ──
    page.click('[data-tab="binder"]')
    page.wait_for_timeout(900)
    page.evaluate("() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight; }")
    page.wait_for_timeout(600)
    gap = page.evaluate(
        """() => {
          const cells = Array.from(document.querySelectorAll('[data-binder-day], [data-binder-row], section'));
          const nav = document.querySelector('nav');
          const rows = Array.from(document.querySelectorAll('[data-week-spread-day]'));
          const all = document.querySelectorAll('[data-week-spread] div');
          return null;
        }"""
    )
    binder_gap = page.evaluate(
        """() => {
          const nav = document.querySelector('nav');
          const spread = document.querySelector('[data-week-schedule-layout]');
          const last = spread ? spread.getBoundingClientRect().bottom : null;
          return last === null ? null : Math.round(nav.getBoundingClientRect().top - last);
        }"""
    )
    check("8. PC 바인더 마지막 줄이 탭 바 위", binder_gap is not None and binder_gap > 8, f"gap={binder_gap}")
    page.screenshot(path=f"{OUT}/diary-v17-binder.png", full_page=False)

    # ── 프로젝트 탭: 1) 일정 카드 한 줄, 2) 슬롯 배치, 3) 일정 카드 표시 ──
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(900)
    page.screenshot(path=f"{OUT}/diary-v17-projects.png")
    row_geo = page.evaluate(
        """() => {
          const li = document.querySelector('[data-schedule-card] [data-schedule-event]');
          if (!li) return null;
          const title = li.querySelector('button span span');
          const date = li.querySelector('[data-schedule-date]');
          if (!title || !date) return null;
          const t = title.getBoundingClientRect();
          const d = date.getBoundingClientRect();
          const overlap = Math.min(t.bottom, d.bottom) - Math.max(t.top, d.top);
          return { overlap, titleH: t.height, dateTop: Math.round(d.top - t.top), text: date.innerText };
        }"""
    )
    check(
        "1. 일정 카드 날짜가 제목과 같은 줄",
        row_geo is not None and row_geo["overlap"] > 6 and row_geo["dateTop"] < 8,
        str(row_geo),
    )

    before = slots_of(page)
    check("2. 슬롯 격자로 그려짐", len(before) >= 4, str(before[:6]))
    # 6) 5칸 보기
    page.click('button:has-text("5칸")')
    page.wait_for_timeout(700)
    cols5 = page.evaluate("() => getComputedStyle(document.querySelector('.slot-grid')).gridTemplateColumns.split(' ').length")
    check("6. 5칸 보기 격자 5열", cols5 == 5, str(cols5))
    page.screenshot(path=f"{OUT}/diary-v17-5cols.png")
    page.click('button:has-text("4칸")')
    page.wait_for_timeout(600)

    # 2) 빈 칸으로 끌어 놓기 — 일정 카드를 두 번째 줄 빈 칸으로
    empty = page.locator("[data-drop-zone='card-slot']").first
    check("2. 빈 칸이 놓을 자리로 있음", empty.count() == 1)
    if empty.count() == 1:
        schedule_card = page.locator("[data-schedule-card]").first
        sb = schedule_card.bounding_box()
        tb = empty.bounding_box()
        target_slot = int(empty.get_attribute("data-card-slot"))
        drag_mouse(page, sb["x"] + sb["width"] - 12, sb["y"] + 46, tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2)
        moved = page.evaluate(
            """() => {
              const card = document.querySelector('[data-schedule-card]');
              const wrap = card?.closest('[data-card-slot]');
              return wrap ? Number(wrap.dataset.cardSlot) : null;
            }"""
        )
        check("2. 빈 칸으로 카드 이동", moved == target_slot, f"{target_slot} → {moved}")
        toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
        check("9. 카드 이동 토스트", "옮겼" in toast or "바꿨" in toast, toast)
        # 새로 고쳐도 자리 유지
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.click('[data-tab="projects"]')
        page.wait_for_timeout(900)
        kept = page.evaluate(
            """() => {
              const card = document.querySelector('[data-schedule-card]');
              const wrap = card?.closest('[data-card-slot]');
              return wrap ? Number(wrap.dataset.cardSlot) : null;
            }"""
        )
        check("2. 새로 고쳐도 칸 유지", kept == target_slot, f"{target_slot} → {kept}")

    # 2) 카드끼리 자리 바꾸기 — 다른 카드 위에 놓으면 두 카드가 자리를 맞바꿉니다.
    slots_now = page.eval_on_selector_all(
        "[data-card-slot]", "els => els.map(e => ({slot: Number(e.dataset.cardSlot), key: (e.querySelector('[data-project-card]')||e.querySelector('[data-schedule-card]')||e.querySelector('[data-routine-card]')||{}).dataset?.projectCard || (e.querySelector('[data-schedule-card]')?'schedule':'') }))"
    )
    occupants = [(x["slot"], x["key"]) for x in slots_now if x["key"]]
    if len(occupants) >= 2:
        (slot_a, key_a), (slot_b, key_b) = occupants[0], occupants[1]
        card_a = page.locator(f"[data-card-slot='{slot_a}'] > *").first
        card_b = page.locator(f"[data-card-slot='{slot_b}'] > *").first
        ab = card_a.bounding_box()
        bb = card_b.bounding_box()
        drag_mouse(page, ab["x"] + 16, ab["y"] + 40, bb["x"] + bb["width"] / 2, bb["y"] + 24)
        page.wait_for_timeout(500)
        after_slots = page.eval_on_selector_all(
            "[data-card-slot]",
            """els => els.map(e => ({slot: Number(e.dataset.cardSlot), key: (e.querySelector('[data-project-card]')||{}).dataset?.projectCard || ''}))""",
        )
        now_a = next((x["slot"] for x in after_slots if x["key"] == key_a), None)
        now_b = next((x["slot"] for x in after_slots if x["key"] == key_b), None)
        check("2. 카드끼리 자리 바꾸기", now_a == slot_b and now_b == slot_a, f"{key_a}:{slot_a}→{now_a}, {key_b}:{slot_b}→{now_b}")

    # 2) 줄 추가
    slots_before = page.locator("[data-card-slot]").count()
    page.click("[data-card-add-row]")
    page.wait_for_timeout(600)
    slots_after = page.locator("[data-card-slot]").count()
    check("2. 줄 추가로 칸이 늘어남", slots_after == slots_before + 4, f"{slots_before} → {slots_after}")
    page.click("[data-card-trim-row]")
    page.wait_for_timeout(500)
    check("2. 빈 줄 접기", page.locator("[data-card-slot]").count() == slots_before)

    # 3) 일정 카드 서랍 맨 위 스위치
    page.evaluate("() => window.scrollTo(0, 0)")
    page.locator("[data-schedule-card]").first.click(position={"x": 30, "y": 60})
    page.wait_for_timeout(600)
    toggles = page.locator("[data-schedule-drawer-toggle]")
    check("3. 일정 서랍 맨 위 스위치", toggles.count() == 1)
    toggles.locator("button").click()
    page.wait_for_timeout(700)
    check("3. 스위치로 일정 카드 숨김", page.locator("[data-schedule-card]").count() == 0)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    # 설정 → 프로젝트에서 다시 켜기
    page.evaluate("() => document.querySelector('[aria-label=\"설정\"]').click()")
    page.wait_for_timeout(600)
    page.click('[role="dialog"] button:has-text("프로젝트")')
    page.wait_for_timeout(500)
    sc = page.locator("[data-project-schedule-card] button")
    check("3. 설정 → 프로젝트 스위치 있음", sc.count() == 1)
    sc.click()
    page.wait_for_timeout(700)
    page.keyboard.press("Escape")
    page.wait_for_timeout(700)
    check("3. 설정에서 다시 켜면 카드 복귀", page.locator("[data-schedule-card]").count() == 1)

    # ── 12) 히스토리 탭 아래 박스 제거 ──
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(600)
    page.click('button:has-text("히스토리")')
    page.wait_for_timeout(700)
    body = page.locator("main").inner_text()
    check("12. 히스토리로 보낸 항목 영역 제거", "히스토리로 보낸 항목" not in body, body[:60])
    page.click('button:has-text("진행")')
    page.wait_for_timeout(600)

    # ── 13) 프로젝트 서랍·편집의 긴급·중요 제거 ──
    page.locator("[data-project-card]").first.locator("header button").first.click()
    page.wait_for_timeout(700)
    drawer_text = page.evaluate("() => document.querySelector('[role=\"dialog\"]')?.innerText ?? ''")
    check("13. 프로젝트 서랍에 긴급·중요 없음", "긴급" not in drawer_text and "중요" not in drawer_text, drawer_text[:80])
    page.click('[role="dialog"] button:has-text("프로젝트 수정")')
    page.wait_for_timeout(800)
    editor_text = page.locator("text=프로젝트 수정").first.inner_text() if page.locator("text=프로젝트 수정").count() else ""
    edit_body = page.evaluate("() => document.body.innerText")
    check("13. 프로젝트 편집에 긴급·중요 없음", "긴급 끄기" not in edit_body and "중요 끄기" not in edit_body)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    task_row = page.locator("[data-index-card] [data-task-drag]").first
    if task_row.count():
        task_row.click()
        page.wait_for_timeout(700)
        task_body = page.evaluate("() => document.querySelector('[role=\"dialog\"]')?.innerText ?? ''")
        check("13. 할 일에는 긴급·중요 유지", "긴급" in task_body and "중요" in task_body, "")
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    # ── 7) 시간 일정을 다른 날로 끌어도 시작·끝 시각 유지 ──
    page.click('[data-tab="calendar"]')
    page.wait_for_timeout(600)
    page.click('button:has-text("월간")')
    page.wait_for_timeout(800)
    chip = page.locator("[data-month-cell='2026-11-21'] [data-month-item]").first
    if chip.count():
        chip_id = chip.get_attribute("data-month-item")
        source_cell = page.locator("[data-month-cell='2026-11-21']").first.bounding_box()
        dest = page.locator("[data-month-cell='2026-11-19']").first.bounding_box()
        chip.hover()
        page.mouse.down()
        page.mouse.move(dest["x"] + dest["width"] / 2, dest["y"] + dest["height"] - 20, steps=12)
        page.mouse.up()
        page.wait_for_timeout(700)
        moved_chip = page.locator(f"[data-month-cell='2026-11-19'] [data-month-item='{chip_id}']").count()
        check("7. 월간 칩을 다른 날로 옮김", moved_chip == 1, f"chip={chip_id}")
        page.locator("[data-month-cell='2026-11-19']").first.click(position={"x": 20, "y": 40})
        page.wait_for_timeout(600)
        list_text = page.locator("[data-day-list]").inner_text() if page.locator("[data-day-list]").count() else ""
        check("7. 칩을 옮겨도 시간 유지", "10:00" in list_text and "12:00" in list_text, list_text.replace("\n", " ")[:120])
        page.locator("[data-day-list] button[aria-label='닫기']").first.click()
        page.wait_for_timeout(400)
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(800)

    # ── 9) 토스트 — 할 일 완료 체크, 색 바꾸기 ──
    page.wait_for_timeout(200)
    check_box = page.locator("[data-index-card] [data-task-id] button[aria-label='완료']").first
    if check_box.count():
        check_box.click()
        page.wait_for_timeout(500)
        toast = page.locator("[data-toast]").last.inner_text()
        check("9. 완료 체크 토스트", "완료" in toast, toast)
        check_box = page.locator("[data-index-card] [data-task-id] button[aria-label='완료 취소']").first
        if check_box.count():
            check_box.click()
            page.wait_for_timeout(500)
    page.locator("[data-project-card]").first.locator("header button").first.click()
    page.wait_for_timeout(700)
    page.locator("[data-project-color]").nth(2).click()
    page.wait_for_timeout(600)
    toast = page.locator("[data-toast]").last.inner_text()
    check("9. 색 변경 토스트", "색" in toast, toast)
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    # 설정 변경 토스트
    page.locator("[data-project-card]").first.locator("button[aria-pressed]:has-text('NOW')").first.click()
    page.wait_for_timeout(600)
    toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
    check("9. NOW 숨김 토스트", "NOW" in toast, toast)
    page.locator("[data-project-card]").first.locator("button[aria-pressed]:has-text('NOW')").first.click()
    page.wait_for_timeout(400)

    # 루틴 체크 토스트
    page.locator("[data-routine-day]").first.click()
    page.wait_for_timeout(600)
    toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
    check("9. 루틴 체크 토스트", "루틴" in toast, toast)

    # 할 일 추가(빠른 입력) 토스트
    quick = page.locator("[data-index-card] input[placeholder='+ 할 일']")
    if quick.count():
        quick.fill("토스트 확인용 할 일")
        quick.press("Enter")
        page.wait_for_timeout(700)
        toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
        check("9. 할 일 추가 토스트", "추가" in toast, toast)

    # 휴지통·복구 토스트 — 할 일 상세에서 휴지통으로 보낸 뒤, 휴지통 창에서 복원
    task_btn = page.locator("[data-index-card] [data-task-drag]").first
    if task_btn.count():
        task_btn.click()
        page.wait_for_timeout(700)
        trash_btn = page.locator("[role='dialog'] button[aria-label*='휴지통으로']").first
        check("9. 상세에 휴지통 버튼", trash_btn.count() == 1)
        if trash_btn.count():
            trash_btn.click()
            page.wait_for_timeout(800)
            toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
            check("9. 휴지통 토스트", "휴지통" in toast, toast)
        page.wait_for_timeout(400)
        page.evaluate(
            """() => {
              const b = Array.from(document.querySelectorAll('button')).find((x) => (x.getAttribute('aria-label') || '') === '휴지통');
              if (b) b.click();
            }"""
        )
        page.wait_for_timeout(800)
        restore = page.locator("[role='dialog'] button:has-text('복원')").first
        check("9. 휴지통 창에 복원 버튼", restore.count() >= 1)
        if restore.count():
            restore.click()
            page.wait_for_timeout(800)
            toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
            check("9. 복구 토스트", "복구" in toast or "복원" in toast or "되살" in toast, toast)
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)

    # ── 10) PC 월간은 '이 주 보기' 유지 ──
    page.click('[data-tab="calendar"]')
    page.wait_for_timeout(600)
    page.click('button:has-text("월간")')
    page.wait_for_timeout(800)
    check("10. PC 월간 '이 주 보기' 유지", page.locator("[data-week-link-wide]").count() > 0)
    page.screenshot(path=f"{OUT}/diary-v17-month.png")

    # ── 7) 월간 연결 막대 ──
    bars = page.eval_on_selector_all(
        "[data-month-span]",
        """els => els.map(e => ({id: e.dataset.monthSpan, start: Number(e.dataset.monthSpanStart), end: Number(e.dataset.monthSpanEnd), row: e.closest('[data-month-row]')?.dataset.monthRow}))""",
    )
    span_ids = {b["id"] for b in bars}
    check("7. 여러 날 일정이 막대로", "demo-ev-span-1" in span_ids and "demo-ev-span-3" in span_ids, str(bars))
    rows_for_span1 = [b for b in bars if b["id"] == "demo-ev-span-1"]
    check("7. 주가 바뀌면 다음 줄로 이어짐", len(rows_for_span1) == 2, str(rows_for_span1))
    # 시간이 있는 여러 날 일정(브랜드 워크숍)을 하루 옮겨도 시각 유지
    timed_bar = page.locator("[data-month-span='demo-ev-span-3']").first
    tb = timed_bar.bounding_box()
    cell = page.locator("[data-month-cell]").nth(0)
    cell_box = page.locator("[data-month-row]").nth(3).bounding_box()
    # 11/22 칸(같은 줄 마지막 칸)으로 하루 옮기기
    target = page.locator("[data-month-cell='2026-11-22']").first.bounding_box()
    days_before = sum(
        b["end"] - b["start"] + 1
        for b in page.eval_on_selector_all("[data-month-span='demo-ev-span-3']", "els => els.map(e => ({start: Number(e.dataset.monthSpanStart), end: Number(e.dataset.monthSpanEnd)}))")
    )
    drag_mouse(page, tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2, target["x"] + target["width"] / 2, target["y"] + target["height"] / 2)
    page.wait_for_timeout(600)
    days_after = sum(
        b["end"] - b["start"] + 1
        for b in page.eval_on_selector_all("[data-month-span='demo-ev-span-3']", "els => els.map(e => ({start: Number(e.dataset.monthSpanStart), end: Number(e.dataset.monthSpanEnd)}))")
        if True
    )
    check("7. 막대를 옮겨도 기간(일수) 유지", days_after == days_before, f"{days_before} → {days_after}")
    # 옮긴 뒤 11/22 하루 목록에서 시작·끝 시각이 그대로인지
    page.locator("[data-month-cell='2026-11-22']").first.click(position={"x": 20, "y": 40})
    page.wait_for_timeout(600)
    list_text = page.locator("[data-day-list]").inner_text() if page.locator("[data-day-list]").count() else ""
    check("7. 연결 막대를 옮겨도 시간 유지", "10:00" in list_text and "16:00" in list_text, list_text.replace("\n", " ")[:120])
    check("11. 하루 목록에 '이 주간으로 이동'", page.locator("[data-day-list-go-week]").count() == 1)
    page.locator("[data-day-list] button[aria-label='닫기']").first.click()
    page.wait_for_timeout(400)

    # 리사이즈 — 11/23 줄의 끝 핸들을 오른쪽으로
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1400)
    page.click('button:has-text("월간")')
    page.wait_for_timeout(800)
    seg = page.eval_on_selector_all(
        "[data-month-span='demo-ev-span-1']",
        "els => els.map(e => ({start: Number(e.dataset.monthSpanStart), end: Number(e.dataset.monthSpanEnd), row: e.closest('[data-month-row]')?.dataset.monthRow}))",
    )
    handle = page.locator("[data-month-span='demo-ev-span-1'] [data-month-span-handle='end']").first
    hb = handle.bounding_box()
    row_days = page.eval_on_selector_all(
        "[data-month-row]",
        "els => els.map(e => Array.from(e.querySelectorAll('[data-month-cell]')).map(c => c.dataset.monthCell))",
    )
    row_index = 0 if seg[0]["row"] == page.evaluate("() => document.querySelectorAll('[data-month-row]')[3]?.dataset.monthRow") else 0
    if hb:
        # 이 줄의 마지막 칸에서 두 칸 오른쪽(다음 줄)으로
        target_row = page.locator("[data-month-row]").nth(4)
        target_cell = target_row.locator("[data-month-cell]").nth(2)
        tcb = target_cell.bounding_box()
        drag_mouse(page, hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2, tcb["x"] + tcb["width"] / 2, tcb["y"] + tcb["height"] / 2)
        page.wait_for_timeout(600)
        after = page.eval_on_selector_all(
            "[data-month-span='demo-ev-span-1']",
            "els => els.map(e => ({start: Number(e.dataset.monthSpanStart), end: Number(e.dataset.monthSpanEnd), row: e.closest('[data-month-row]')?.dataset.monthRow}))",
        )
        span_before = sum(b["end"] - b["start"] + 1 for b in seg)
        span_after = sum(b["end"] - b["start"] + 1 for b in after)
        check("7. 막대 끝을 끌어 기간 늘리기", span_after > span_before or len(after) > len(seg), f"{seg} → {after}")
    else:
        check("7. 막대 끝을 끌어 기간 늘리기", False, "handle 없음")

    check("콘솔 오류 0건(PC)", len(errors) == 0, json.dumps(errors[:6], ensure_ascii=False))
    page.screenshot(path=f"{OUT}/diary-v17-week.png")
    browser.close()

    # ── 모바일 ──
    browser, context, page = launch(p, {"width": 390, "height": 844}, mobile=True)
    cdp = context.new_cdp_session(page)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.click('button:has-text("월간")')
    page.wait_for_timeout(900)

    # 10) 모바일 '주간 보기' 기둥 제거
    check("10. 모바일 주간 열 제거", page.locator("[data-week-link]").count() == 0)

    # 5) 모바일 스위치 위치
    xs = []
    for label in ["월간", "주간", "3일", "일간"]:
        page.click(f'button:has-text("{label}")')
        page.wait_for_timeout(600)
        box = page.locator("[data-view-switch]").bounding_box()
        xs.append((label, round(box["x"])))
    check("5. 모바일 스위치 위치 고정", len({x for _, x in xs}) == 1, str(xs))
    page.click('button:has-text("월간")')
    page.wait_for_timeout(800)

    # 11) 날짜 숫자 → 하루 목록
    page.locator("[data-day-num]").nth(15).click()
    page.wait_for_timeout(700)
    check("11. 모바일 날짜 숫자 → 하루 목록", page.locator("[data-day-list]").count() == 1)
    check("11. 하루 목록 '이 주간으로 이동'", page.locator("[data-day-list-go-week]").count() == 1)
    page.locator("[data-day-list-go-week]").click()
    page.wait_for_timeout(900)
    check("11. '이 주간으로 이동' → 주간 보기", page.locator("[data-view-switch] button.seg-item-active:has-text('주간')").count() == 1)
    page.click('button:has-text("월간")')
    page.wait_for_timeout(800)
    # 빈칸 → 하루 목록
    cell = page.locator("[data-month-cell]").nth(12)
    cb = cell.bounding_box()
    page.mouse.click(cb["x"] + cb["width"] - 8, cb["y"] + cb["height"] - 6)
    page.wait_for_timeout(700)
    check("11. 모바일 빈칸 → 하루 목록", page.locator("[data-day-list]").count() == 1)
    page.locator("[data-day-list] button[aria-label='닫기']").first.click()
    page.wait_for_timeout(400)

    # 2) 모바일 카드 순서 — 1열로 빈 칸 없이
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(900)
    cards = page.eval_on_selector_all(
        "[data-card-slot] > *", "els => els.map(e => ({left: Math.round(e.getBoundingClientRect().left), top: Math.round(e.getBoundingClientRect().top)}))"
    )
    lefts = {c["left"] for c in cards}
    check("2m. 모바일 1열로 카드", len(lefts) == 1, str(lefts))
    page.screenshot(path=f"{OUT}/diary-v17-mobile-projects.png")

    def touch_drag(x1, y1, x2, y2, hold=320):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x1, "y": y1}]})
        page.wait_for_timeout(hold)
        steps = 14
        for i in range(1, steps + 1):
            cdp.send(
                "Input.dispatchTouchEvent",
                {"type": "touchMove", "touchPoints": [{"x": x1 + (x2 - x1) * i / steps, "y": y1 + (y2 - y1) * i / steps}]},
            )
            page.wait_for_timeout(18)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(700)

    # 모바일 카드 이동 — 두 번째 카드를 첫 카드 아래로
    page.locator("[data-card-slot]").nth(2).scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    second_box = page.locator("[data-card-slot]").nth(2).bounding_box()
    page.evaluate("(y) => { const m = document.querySelector('main'); m.scrollTop += y - 320; }", second_box["y"])
    page.wait_for_timeout(500)
    first = page.locator("[data-card-slot]").nth(1).bounding_box()
    second = page.locator("[data-card-slot]").nth(2).bounding_box()
    if first and second:
        before_order = page.eval_on_selector_all("[data-card-slot]", "els => els.map(e => e.innerText.slice(0, 10))")
        start_y = max(40, min(first["y"] + first["height"] - 70, 250))
        touch_drag(first["x"] + 30, start_y, second["x"] + second["width"] / 2, second["y"] + 22)
        after_order = page.eval_on_selector_all("[data-card-slot]", "els => els.map(e => e.innerText.slice(0, 10))")
        check("2m. 모바일 카드 끌어 이동", before_order != after_order, f"{before_order[:3]} → {after_order[:3]}")

    # 11m) 모바일 일정·할 일 클릭도 하루 목록
    page.click('[data-tab="calendar"]')
    page.wait_for_timeout(700)
    page.click('button:has-text("월간")')
    page.wait_for_timeout(800)
    chip = page.locator("[data-month-item]").first
    if chip.count():
        chip.click()
        page.wait_for_timeout(700)
        check("11. 모바일 일정 클릭 → 하루 목록", page.locator("[data-day-list]").count() == 1)
        page.locator("[data-day-list] button[aria-label='닫기']").first.click()
        page.wait_for_timeout(400)

    check("콘솔 오류 0건(모바일)", len(errors) == 0, json.dumps(errors[:6], ensure_ascii=False))
    page.screenshot(path=f"{OUT}/diary-v17-mobile-month.png")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} 통과")
