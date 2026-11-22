"""A40 — v16 종합 개편 확인 (데모 데이터).

    tests/run-with-server.sh tests/v16-check.py
"""
import json, os, time
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
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})
    context = browser.new_context(viewport=viewport, locale="ko-KR", timezone_id="Asia/Seoul", is_mobile=mobile, has_touch=mobile)
    page = context.new_page()
    page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    return browser, context, page

with sync_playwright() as p:
    browser, context, page = launch(p, {"width": 1440, "height": 900})
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)

    # ── 캘린더: 월간 보기 ──
    page.click('button:has-text("월간")')
    page.wait_for_timeout(600)
    page.screenshot(path=f"{OUT}/diary-v16-month.png")
    title_before = page.locator("h1").first.inner_text()
    cell = page.locator('[data-month-cell="2026-11-25"]').first
    box = cell.bounding_box()

    # 7) 빈칸 클릭 → 하루 목록
    page.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] - 6)
    page.wait_for_timeout(400)
    check("7. 월간 빈칸 클릭 → 하루 목록", page.locator('[data-day-list="2026-11-25"]').count() == 1)
    page.locator('[data-day-list] button[aria-label="닫기"]').first.click()
    page.wait_for_timeout(300)

    # 7) 일정 칩 클릭 → 하루 목록 (상세 아님)
    chip = page.locator('[data-month-item][data-month-item]').first
    chip.click()
    page.wait_for_timeout(400)
    check("7. 월간 일정 클릭 → 하루 목록", page.locator("[data-day-list]").count() == 1)
    page.locator('[data-day-list] button[aria-label="닫기"]').first.click()
    page.wait_for_timeout(300)

    # 7) 날짜 숫자 → 일간
    page.locator('[data-day-num="2026-11-25"]').click()
    page.wait_for_timeout(500)
    check("7. 날짜 숫자 → 일간 보기", "11월 25일" in page.locator("h1").first.inner_text(), page.locator("h1").first.inner_text())

    # 6) 월간 + 마우스 끌기 스와이프
    page.click('button:has-text("월간")')
    page.wait_for_timeout(500)
    box = page.locator('[data-month-cell="2026-11-25"]').first.bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] - 8)
    page.mouse.down()
    page.mouse.move(box["x"] - 60, box["y"] + box["height"] - 8, steps=12)
    page.mouse.up()
    page.wait_for_timeout(700)
    check("6. 월간 마우스 스와이프 → 다음 달", page.locator("h1").first.inner_text().startswith("12월"), page.locator("h1").first.inner_text())
    page.screenshot(path=f"{OUT}/diary-v16-month-swipe.png")

    # 16) 하단 탭 바 위 빈 여백
    gap = page.evaluate("""() => {
      const nav = document.querySelector('nav');
      const inner = document.querySelector('main').firstElementChild;
      return Math.round(nav.getBoundingClientRect().top - inner.getBoundingClientRect().bottom);
    }""")
    check("16. 탭 바 위 빈 여백 0", abs(gap) <= 2, f"gap={gap}")

    page.screenshot(path=f"{OUT}/diary-v16-week.png")
    # ── 15) 주간 목표 주차 분리 ──
    page.click('button:has-text("오늘")')
    page.wait_for_timeout(400)
    page.click('button:has-text("주간")')
    page.wait_for_timeout(600)
    goal_week = page.locator("section:has(h3:text('이번 주 목표'))")
    before_goals = goal_week.locator("li").count()
    page.click('button[aria-label="다음"]')
    page.wait_for_timeout(900)
    goals_next = page.locator("section:has(h3:text('이번 주 목표'))")
    text_next = goals_next.inner_text()
    check("15. 주를 넘기면 목표가 비워짐", "아직 없습니다" in text_next, text_next.replace("\n", " | ")[:120])
    # 새 주에 목표를 만들고, 그 다음 주에는 보이지 않아야 함
    inp = page.locator('input[aria-label="주간 목표 추가"]')
    inp.fill("A40 주차 분리 확인")
    inp.press("Enter")
    page.wait_for_timeout(700)
    check("15. 새 주 목표 저장", "A40 주차 분리 확인" in page.locator("section:has(h3:text('이번 주 목표'))").inner_text())
    page.click('button[aria-label="다음"]')
    page.wait_for_timeout(900)
    check("15. 그 다음 주에는 목표가 따라오지 않음", "A40 주차 분리 확인" not in page.locator("section:has(h3:text('이번 주 목표'))").inner_text())
    page.click('button[aria-label="이전"]')
    page.wait_for_timeout(500)
    page.click('button[aria-label="이전"]')
    page.wait_for_timeout(900)
    print("week now:", page.locator("h1").first.inner_text())

    # ── 9) 주간 프로젝트 행 순서 ──
    rows_before = page.eval_on_selector_all("[data-week-project-row]", "els => els.map(e => e.dataset.weekProjectRow).filter(k => k !== 'inbox')")
    if len(rows_before) >= 2:
        grip = page.locator(f'[data-week-row-grip="{rows_before[0]}"]').first
        target = page.locator(f'[data-week-project-row="{rows_before[1]}"]').first
        gb, tb = grip.bounding_box(), target.bounding_box()
        page.mouse.move(gb["x"] + gb["width"] / 2, gb["y"] + gb["height"] / 2)
        page.mouse.down()
        page.mouse.move(tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] - 2, steps=14)
        page.wait_for_timeout(200)
        page.mouse.up()
        page.wait_for_timeout(500)
        rows_after = page.eval_on_selector_all("[data-week-project-row]", "els => els.map(e => e.dataset.weekProjectRow).filter(k => k !== 'inbox')")
        check("9. 주간 프로젝트 행 드래그 순서", rows_after[:2] == [rows_before[1], rows_before[0]], f"{rows_before} → {rows_after}")
    else:
        check("9. 주간 프로젝트 행 드래그 순서", False, f"rows={rows_before}")

    # 루틴 행 순서
    rrows = page.eval_on_selector_all("[data-week-routine-row]", "els => els.map(e => e.dataset.weekRoutineRow)")
    if len(rrows) >= 2:
        grip = page.locator(f'[data-week-row-grip="{rrows[0]}"]').first
        target = page.locator(f'[data-week-routine-row="{rrows[1]}"]').first
        gb, tb = grip.bounding_box(), target.bounding_box()
        page.mouse.move(gb["x"] + gb["width"] / 2, gb["y"] + gb["height"] / 2)
        page.mouse.down()
        page.mouse.move(tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] - 2, steps=14)
        page.wait_for_timeout(200)
        page.mouse.up()
        page.wait_for_timeout(500)
        rrows_after = page.eval_on_selector_all("[data-week-routine-row]", "els => els.map(e => e.dataset.weekRoutineRow)")
        check("9. 주간 루틴 행 드래그 순서", rrows_after[:2] == [rrows[1], rrows[0]], f"{rrows} → {rrows_after}")

    # ── 10) 바인더 주간 미리보기 3줄 ──
    page.click('[data-tab="binder"]')
    page.wait_for_timeout(700)
    preview = page.locator("[data-binder-preview]").first
    clamp = preview.evaluate("el => getComputedStyle(el).webkitLineClamp") if preview.count() else "none"
    check("10. 바인더 미리보기 line-clamp 3", clamp == "3", f"clamp={clamp}")
    page.screenshot(path=f"{OUT}/diary-v16-binder.png")

    # ── 11) 모바일 상세 시트 하단 ──
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(700)
    page.locator('[data-task-id]').first.click()
    page.wait_for_timeout(700)
    sheet = page.locator('div[role="dialog"][aria-modal="true"]').last
    info = sheet.evaluate("""el => { const r = el.getBoundingClientRect(); return {bottom: Math.round(r.bottom), vh: innerHeight, max: getComputedStyle(el).maxHeight}; }""")
    check("11. 상세 시트가 화면 안에 들어옴", info["bottom"] <= info["vh"] + 1, json.dumps(info))
    page.screenshot(path=f"{OUT}/diary-v16-detail.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    # ── 14) 카드 순서·새 줄 ──
    order_before = page.eval_on_selector_all("[data-project-card], [data-schedule-card], [data-routine-card]", "els => els.map(e => e.dataset.projectCard || e.dataset.scheduleCard || e.dataset.routineCard)")
    cards = page.locator('[data-project-card]')
    src = cards.nth(2)
    dst = cards.nth(0)
    sb, db = src.bounding_box(), dst.bounding_box()
    # 카드의 빈 아래쪽(남은 할 일 줄)을 잡고 끕니다.
    page.mouse.move(sb["x"] + 24, sb["y"] + 22)
    page.mouse.down()
    page.mouse.move(db["x"] + 30, db["y"] + 60, steps=16)
    page.wait_for_timeout(250)
    page.mouse.up()
    page.wait_for_timeout(600)
    order_after = page.eval_on_selector_all("[data-project-card], [data-schedule-card], [data-routine-card]", "els => els.map(e => e.dataset.projectCard || e.dataset.scheduleCard || e.dataset.routineCard)")
    check("14. 카드 드래그 순서", order_after != order_before, f"{order_before} → {order_after}")

    break_slot = page.locator("[data-card-row-break]").first
    break_slot.scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    bb = break_slot.bounding_box()
    if bb:
        src = page.locator('[data-project-card]').last
        src.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        sb = src.bounding_box()
        page.mouse.move(sb["x"] + 24, sb["y"] + 22)
        page.mouse.down()
        page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, steps=16)
        page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/diary-v16-newrow-drop.png")
        page.mouse.up()
        page.wait_for_timeout(600)
        saved = page.evaluate("() => localStorage.getItem('my-diary:project-card-order:v1')")
        check("14. 새 줄 슬롯에 놓기", "__break__" in (saved or ""), saved)

    # ── 3) 카드 사이 할 일 드래그 ──
    before_task = page.evaluate("() => document.querySelector('[data-task-id]')?.dataset.taskId")
    page.wait_for_timeout(300)
    errs_before = len(errors)

    # ── 4) 우선순위 프로젝트 색 ──
    page.click('button:has-text("우선순위")')
    page.wait_for_timeout(600)
    badge = page.locator("[data-priority-project]").first
    if badge.count():
        style = badge.evaluate("el => getComputedStyle(el).backgroundColor")
        check("4. 우선순위 프로젝트 배지 색", style not in ("rgba(0, 0, 0, 0)", "transparent"), style)
    else:
        check("4. 우선순위 프로젝트 배지 색", False, "no badge")
    page.screenshot(path=f"{OUT}/diary-v16-priority.png")

    # ── 5) 기록 탭 ──
    page.click('button:has-text("기록")')
    page.wait_for_timeout(600)
    check("5. 기록 탭에 완료·취소 일정", page.locator("[data-history-events]").count() == 1)
    ev_rows = page.locator("[data-history-events] li")
    check("5. 완료·취소 일정에 날짜·시간", ev_rows.count() > 0 and "/" in ev_rows.first.inner_text(), ev_rows.first.inner_text() if ev_rows.count() else "none")
    more = page.locator("[data-history-more]")
    more_count = more.count()
    check("5. 5개 넘으면 펼치기 버튼", more_count >= 1, f"more={more_count}")
    if more_count:
        more.first.click()
        page.wait_for_timeout(300)
        check("5. 펼치기 동작", more.first.inner_text().startswith("접기"), more.first.inner_text())
    # 취소 배지 진한 색
    pill = page.locator("[data-cancel-badge]").first
    if pill.count():
        cls = pill.get_attribute("class") or ""
        check("13. 취소 배지 진한 색", "ink-900/[0.12]" in cls and "text-ink-800" in cls, cls)
    page.screenshot(path=f"{OUT}/diary-v16-history.png")

    # ── 1·2) 설정 연동: 일정 카드 개수 · 루틴 주 시작 ──
    page.evaluate("""() => {
      const raw = localStorage.getItem('my-diary:settings:v1');
      const next = raw ? JSON.parse(raw) : {};
      next.projectTaskPreview = 3;
      next.weekStartsOn = 0;
      localStorage.setItem('my-diary:settings:v1', JSON.stringify(next));
    }""")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1400)
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(800)
    shown = page.locator('[data-schedule-card] [data-schedule-event]').count()
    more = page.locator('[data-schedule-card] li button:has-text("개 더 보기")').count()
    check("1. 일정 카드 개수 = 설정(3)", shown == 3 and more == 1, f"shown={shown} more={more}")
    first_day = page.locator('[data-routine-day]').first.inner_text()
    check("2. 루틴 주 시작 = 일요일", first_day.strip().startswith("일"), repr(first_day))
    page.screenshot(path=f"{OUT}/diary-v16-settings-sync.png")
    page.evaluate("""() => {
      const raw = localStorage.getItem('my-diary:settings:v1');
      const next = raw ? JSON.parse(raw) : {};
      next.projectTaskPreview = 6;
      next.weekStartsOn = 1;
      localStorage.setItem('my-diary:settings:v1', JSON.stringify(next));
    }""")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1400)
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(800)

    # ── 3) 카드 사이 할 일 드래그(마우스) ──
    before = page.eval_on_selector_all('[data-project-card="demo-pj-1"] [data-task-id]', "els => els.map(e => e.dataset.taskId)")
    task = page.locator('[data-index-card] [data-task-id]').first
    tid = task.get_attribute("data-task-id")
    task.drag_to(page.locator('[data-project-card="demo-pj-1"]'))
    page.wait_for_timeout(800)
    after = page.eval_on_selector_all('[data-project-card="demo-pj-1"] [data-task-id]', "els => els.map(e => e.dataset.taskId)")
    check("3. 카드 사이 할 일 드래그", tid in after and tid not in before, f"{before} → {after}")
    page.screenshot(path=f"{OUT}/diary-v16-card-dnd.png")

    # ── 3) 일정 카드 → 프로젝트 카드 (할 일로) ──
    page.evaluate("() => { const m = document.querySelector('main'); if (m) m.scrollTop = 0; }")
    page.wait_for_timeout(400)
    ev_row = page.locator('[data-schedule-card] [data-schedule-event]').first
    ev_title = ev_row.inner_text().split("\n")[0]
    ev_id = ev_row.get_attribute("data-schedule-event")
    ev_row.drag_to(page.locator('[data-project-card="demo-pj-1"]'))
    page.wait_for_timeout(900)
    still_event = page.locator(f'[data-schedule-card] [data-schedule-event="{ev_id}"]').count()
    pj2_text = page.locator('[data-project-card="demo-pj-1"]').inner_text()
    print("  ev drag:", ev_id, ev_title, "still", still_event, "toasts", page.evaluate("() => Array.from(document.querySelectorAll('.pointer-events-auto')).map(e => e.innerText).slice(-2)"))
    check("3. 일정 카드 → 프로젝트 카드", still_event == 0 and "최근 기록" in pj2_text, f"still={still_event} title={ev_title}")

    # ── 13) 취소 항목은 완료로 바뀌지 않음 ──
    page.click('button:has-text("완료 보기")')
    page.wait_for_timeout(700)
    lines = page.locator('[data-task-id]:has([data-cancel-badge])')
    if lines.count():
        first = lines.first
        before_title = first.inner_text()
        first.locator("button").first.click()
        page.wait_for_timeout(700)
        after_line = page.locator(f'[data-task-id="{first.get_attribute("data-task-id")}"]')
        check("13. 취소 항목 토글해도 취소 유지", after_line.locator('[data-cancel-badge]').count() == 1, after_line.inner_text() if after_line.count() else "gone")
    else:
        check("13. 취소 항목 토글해도 취소 유지", False, "no canceled line")
    page.click('button:has-text("완료 보기")')
    page.wait_for_timeout(500)

    # ── 8) 일괄 관리 ──
    page.click('[data-tab="calendar"]')
    page.wait_for_timeout(700)
    page.click('[data-bulk-open="calendar"]')
    page.wait_for_timeout(700)
    check("8. 일괄 관리 창", page.locator("[data-bulk-manage]").count() == 1)
    rows = page.locator("[data-bulk-row]")
    total_rows = rows.count()
    check("8. 목록 행 표시", total_rows > 5, f"rows={total_rows}")
    page.locator("[data-bulk-search]").fill("요가")
    page.wait_for_timeout(300)
    filtered_rows = page.locator("[data-bulk-row]").count()
    check("8. 검색 필터", 1 <= filtered_rows < total_rows, f"filtered={filtered_rows} / {total_rows}")
    page.locator("[data-bulk-search]").fill("")
    page.wait_for_timeout(200)
    page.locator("[data-bulk-all]").check()
    page.wait_for_timeout(300)
    count_text = page.locator("[data-bulk-count]").inner_text()
    check("8. 전체 선택", "개 선택" in count_text and not count_text.startswith("0"), count_text)
    page.locator('[data-bulk-action="color"]').click()
    page.locator('[data-bulk-color="blue"]').click()
    page.wait_for_timeout(900)
    colors = page.evaluate("() => localStorage.getItem('my-diary:event-colors:v1')")
    check("8. 일괄 색 변경", bool(colors) and "blue" in colors, (colors or "")[:80])
    # 분류 변경
    page.locator("[data-bulk-row] input[type=checkbox]").first.check()
    page.locator('[data-bulk-action="category"]').click()
    page.locator('[data-bulk-set-category="업무"]').click()
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/diary-v16-bulk.png")
    # 날짜 이동
    page.locator("[data-bulk-move-date]").fill("2026-12-01")
    page.locator('[data-bulk-action="move"]').click()
    page.wait_for_timeout(800)
    # 삭제
    before_rows = page.locator("[data-bulk-row]").count()
    page.locator('[data-bulk-action="delete"]').click()
    page.locator('[data-bulk-action="delete-confirm"]').click()
    page.wait_for_timeout(1000)
    check("8. 일괄 삭제", page.locator("[data-bulk-row]").count() < before_rows, f"{before_rows} → {page.locator('[data-bulk-row]').count()}")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    check("콘솔 오류 0건(PC)", len(errors) == 0, json.dumps(errors[:6], ensure_ascii=False))
    context.close(); browser.close()

    # ── 모바일 ──
    browser, context, page = launch(p, {"width": 390, "height": 844}, mobile=True)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{OUT}/diary-v16-mobile-calendar.png")
    # 월간 터치 스와이프
    page.click('button:has-text("월간")')
    page.wait_for_timeout(600)
    page.locator('[data-month-cell="2026-11-30"]').first.click(position={"x": 34, "y": 18})
    page.wait_for_timeout(400)
    check("7m. 모바일 빈칸 → 하루 목록", page.locator("[data-day-list]").count() == 1)
    page.locator('[data-day-list] button[aria-label="닫기"]').first.click()
    page.wait_for_selector("[data-day-list]", state="detached")
    page.wait_for_timeout(800)
    # 터치 스와이프는 CDP 로 보냅니다.
    page.evaluate("""() => { window.__swipe = true; }""")
    cdp = context.new_cdp_session(page)
    def touch_swipe(x1, y1, x2, y2):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x1, "y": y1}]})
        steps = 10
        for i in range(1, steps + 1):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x1 + (x2 - x1) * i / steps, "y": y1 + (y2 - y1) * i / steps}]})
            page.wait_for_timeout(16)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    title_m = page.locator("h1").first.inner_text()
    page.locator('[data-month-cell="2026-11-02"]').first.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    box = page.locator('[data-month-cell="2026-11-02"]').first.bounding_box()
    print("mobile swipe box", box)
    touch_swipe(box["x"] + box["width"] * 0.8, box["y"] + 22, box["x"] - 60, box["y"] + 22)
    page.wait_for_timeout(700)
    title_after = page.locator("h1").first.inner_text()
    check("6m. 모바일 터치 스와이프 → 다음 달", title_after != title_m, f"{title_m} → {title_after}")
    page.screenshot(path=f"{OUT}/diary-v16-mobile-month.png")

    # 모바일 상세 시트
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(700)
    page.locator('[data-task-id]').first.tap()
    page.wait_for_timeout(700)
    sheet = page.locator('div[role="dialog"][aria-modal="true"]').last
    info = sheet.evaluate("""el => { const r = el.getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight}; }""")
    check("11m. 모바일 상세 시트 하단이 화면 안", info["bottom"] <= info["vh"] + 1, json.dumps(info))
    page.screenshot(path=f"{OUT}/diary-v16-mobile-detail.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    # 모바일 일괄 관리 카드
    page.click('[data-tab="calendar"]')
    page.wait_for_timeout(700)
    page.click('[data-bulk-open="calendar"]')
    page.wait_for_timeout(700)
    check("8m. 모바일 일괄 관리 카드", page.locator("[data-bulk-card]").count() > 0)
    page.screenshot(path=f"{OUT}/diary-v16-mobile-bulk.png")
    page.locator('[data-bulk-manage]').count() and page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    # ── 3m/14m) 모바일 손가락 끌기 — 카드 사이 할 일, 카드 자체 순서 ──
    def touch_drag(x1, y1, x2, y2, hold=320):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x1, "y": y1}]})
        page.wait_for_timeout(hold)
        steps = 14
        for i in range(1, steps + 1):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x1 + (x2 - x1) * i / steps, "y": y1 + (y2 - y1) * i / steps}]})
            page.wait_for_timeout(18)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(700)

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1400)
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(900)
    order_before = page.eval_on_selector_all("[data-project-card]", "els => els.map(e => e.dataset.projectCard)")
    if len(order_before) >= 2:
        page.evaluate("(id) => document.querySelector(`[data-project-card='${id}']`)?.scrollIntoView({block:'start'})", order_before[0])
        page.wait_for_timeout(500)
        a = page.locator(f'[data-project-card="{order_before[0]}"]').bounding_box()
        b = page.locator(f'[data-project-card="{order_before[1]}"]').bounding_box()
        touch_drag(a["x"] + 26, a["y"] + 26, b["x"] + 26, b["y"] + b["height"] - 24)
        order_after = page.eval_on_selector_all("[data-project-card]", "els => els.map(e => e.dataset.projectCard)")
        check("14m. 모바일 카드 끌어 순서", order_after != order_before, f"{order_before} → {order_after}")
    else:
        check("14m. 모바일 카드 끌어 순서", False, f"cards={order_before}")
    page.screenshot(path=f"{OUT}/diary-v16-mobile-cards.png")

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1400)
    page.click('[data-tab="projects"]')
    page.wait_for_timeout(900)
    task = page.locator('[data-index-card] [data-task-drag]').first
    tid = task.get_attribute("data-task-drag")
    tb = task.bounding_box()
    target = page.locator('[data-schedule-card]').first.bounding_box()
    if tb and target and tid:
        open_before = page.evaluate("() => document.querySelector('[data-schedule-card] p')?.innerText")
        touch_drag(tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2, target["x"] + 40, target["y"] + 30)
        left = page.evaluate("(id) => !!document.querySelector(`[data-index-card] [data-task-id='${id}']`)", tid)
        open_after = page.evaluate("() => document.querySelector('[data-schedule-card] p')?.innerText")
        check("3m. 모바일 할 일 → 일정 카드 변환", not left and open_before != open_after, f"left={left} {open_before} → {open_after}")
        page.screenshot(path=f"{OUT}/diary-v16-mobile-task-dnd.png")
    else:
        check("3m. 모바일 할 일 → 일정 카드 변환", False, "no task")

    check("콘솔 오류 0건(모바일)", len(errors) == 0, json.dumps(errors[:6], ensure_ascii=False))
    context.close(); browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
for name, ok, detail in failed:
    print(" -", name, detail)
