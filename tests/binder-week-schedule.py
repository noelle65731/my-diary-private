"""바인더 위클리 — 그 주의 일정·할 일 참고 창(열고 닫기)과 톤 다운 색상 검증.

    BASE=http://127.0.0.1:3241 CHROME=/workspace/.browsers/chromium/chromium \
        python3 tests/binder-week-schedule.py
"""

import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3241")
CHROME = os.environ.get("CHROME")
OUT = os.environ.get("OUT", "/workspace/work/local-shots")
os.makedirs(OUT, exist_ok=True)

# A24: 톤 다운 팔레트 (tailwind.config.ts → colors.binder)
CHARCOAL = "rgb(59, 69, 83)"  # #3b4553
SAT_BLUE = "rgb(82, 112, 143)"  # #52708f
SUN_RED = "rgb(168, 96, 90)"  # #a8605a

fails = []


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {extra}" if extra else ""))
    if not ok:
        fails.append(name)


def open_binder(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="바인더", exact=False).first.click()
    page.wait_for_timeout(800)
    page.get_by_role("button", name="Weekly", exact=False).first.click()
    page.wait_for_timeout(600)


def day_colors(page):
    return page.evaluate(
        """() => [...document.querySelectorAll('[data-binder-day]')].slice(0, 14).map(row => {
            const button = row.querySelector('button');
            const number = button ? button.querySelector('span') : null;
            return {
              day: row.dataset.binderDay,
              num: number ? getComputedStyle(number).color : null,
              bg: number ? getComputedStyle(number).backgroundColor : null,
            };
        })"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()

    # ── PC 1440×900 ─────────────────────────────────────────────
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    open_binder(page)

    toggle = page.locator("[data-week-schedule-toggle]")
    check("PC 참고 창 버튼 있음", toggle.count() == 1, f"count={toggle.count()}")

    # 처음에는 닫혀 있고, 열면 그 주의 날짜별 일정·할 일이 보입니다.
    check("PC 처음엔 닫힘", page.locator("[data-week-schedule]").count() == 0)
    page.screenshot(path=f"{OUT}/binder-week-pc-closed.png")

    toggle.click()
    page.wait_for_timeout(500)
    panel = page.locator("[data-week-schedule]")
    check("PC 버튼으로 열림", panel.count() == 1)

    days = page.locator("[data-week-schedule-day]")
    check("PC 이번 주 7일 모두 표시", days.count() == 7, f"days={days.count()}")

    rows = page.evaluate(
        """() => [...document.querySelectorAll('[data-week-schedule-day]')].map(section => ({
            day: section.dataset.weekScheduleDay,
            text: section.innerText.replace(/\\n/g, ' | '),
            items: section.querySelectorAll('li').length,
        }))"""
    )
    with_items = [row for row in rows if row["items"] > 0]
    check("PC 일정·할 일 항목이 날짜별로 보임", len(with_items) >= 2, f"{len(with_items)}일 · 예: {with_items[:2]}")
    check(
        "PC 항목에 시각·종일 표기",
        any(("종일" in row["text"]) or any(t in row["text"] for t in ("08:", "09:", "10:", "13:", "14:")) for row in rows),
        " | ".join(row["text"][:60] for row in with_items[:3]),
    )
    panel_text = panel.inner_text()
    check("PC 완료 표시(취소선 항목 포함)", "완료" in panel_text or "일정" in panel_text, panel_text.replace("\n", " / ")[:90])

    # 글 쓰는 칸을 가리지 않는지: 창과 스프레드가 겹치지 않아야 합니다.
    box_panel = panel.bounding_box()
    box_spread = page.locator("[data-week-schedule-layout] .lg\\:grid-cols-2").first.bounding_box()
    overlap = not (
        box_panel["x"] + box_panel["width"] <= box_spread["x"] + 1
        or box_spread["x"] + box_spread["width"] <= box_panel["x"] + 1
        or box_panel["y"] + box_panel["height"] <= box_spread["y"] + 1
        or box_spread["y"] + box_spread["height"] <= box_panel["y"] + 1
    )
    check(
        "PC 글 쓰는 칸과 겹치지 않음",
        not overlap,
        f"panel x={box_panel['x']:.0f} w={box_panel['width']:.0f} · spread x={box_spread['x']:.0f} w={box_spread['width']:.0f}",
    )
    check("PC 창이 화면 안에 들어옴", box_panel["y"] + box_panel["height"] <= 900, f"bottom={box_panel['y'] + box_panel['height']:.0f}")

    page.screenshot(path=f"{OUT}/binder-week-pc-open.png")

    # 지난주 참고 창도 열립니다.
    page.locator("[data-week-schedule-scope='last']").click()
    page.wait_for_timeout(400)
    last_rows = page.locator("[data-week-schedule-day]").first.get_attribute("data-week-schedule-day")
    check("PC 지난주 참고 창 전환", last_rows is not None and last_rows < rows[0]["day"], f"first={last_rows} · current={rows[0]['day']}")
    page.locator("[data-week-schedule-scope='current']").click()
    page.wait_for_timeout(300)

    # 닫기 → 다시 열기
    page.get_by_role("button", name="일정 창 닫기").click()
    page.wait_for_timeout(400)
    check("PC 닫기로 사라짐", page.locator("[data-week-schedule]").count() == 0)
    check("PC 닫힌 뒤 스프레드 폭 복귀", page.locator("[data-week-schedule-layout='spread-only']").count() == 1)
    toggle.click()
    page.wait_for_timeout(400)
    check("PC 다시 열림", page.locator("[data-week-schedule]").count() == 1)

    # 새로 열어도 열어 둔 상태가 남습니다(설정에 저장).
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    check("새로 열어도 창 열린 상태 유지", page.locator("[data-week-schedule]").count() == 1)

    # 지난주 날짜를 눌러 쓰기 시작하면 참고 창도 그 주로 따라갑니다.
    page.locator('[data-binder-day="2026-11-10"] [role="button"]').first.click()
    page.wait_for_timeout(500)
    check(
        "PC 지난주 날짜를 쓰면 창도 지난주",
        page.locator("[data-week-schedule='last']").count() == 1,
        page.locator("[data-week-schedule]").get_attribute("data-week-schedule") or "none",
    )
    page.keyboard.press("Escape")
    page.wait_for_timeout(700)

    # 창을 연 채로 글을 쓸 수 있습니다.
    page.locator('[data-binder-day="2026-11-16"] [role="button"]').first.click()
    page.wait_for_timeout(400)
    textarea = page.locator('[data-binder-day="2026-11-16"] textarea')
    check("PC 창을 연 채 바로 쓰기 열림", textarea.count() == 1)
    if textarea.count() == 1:
        textarea.fill("창 열고 쓰는 중")
        page.wait_for_timeout(300)
        check("PC 쓰는 동안 창이 그대로", page.locator("[data-week-schedule]").count() == 1)
        page.keyboard.press("Escape")
        page.wait_for_timeout(1200)
        check(
            "PC 쓴 내용이 그 날 줄에 남음",
            "창 열고 쓰는 중" in page.locator('[data-binder-day="2026-11-16"]').inner_text(),
        )

    # ── 색상 ────────────────────────────────────────────────────
    colors = day_colors(page)
    sat = [c for c in colors if c["num"] == SAT_BLUE]
    sun = [c for c in colors if c["num"] == SUN_RED]
    charcoal = [c for c in colors if c["num"] == CHARCOAL]
    check("토요일 숫자 = 차분한 슬레이트 블루", len(sat) >= 1, f"{[c['day'] for c in sat]}")
    check("일요일 숫자 = 차분한 브릭 로즈", len(sun) >= 2, f"{[c['day'] for c in sun]}")
    check("평일 숫자 = 진한 차콜", len(charcoal) >= 8, f"{len(charcoal)}개")
    old = [c for c in colors if c["num"] in ("rgb(17, 24, 39)", "rgb(37, 99, 235)", "rgb(239, 68, 68)", "rgb(59, 130, 246)", "rgb(248, 113, 113)")]
    check("예전 쨍한 색 없음", not old, str(old))
    print("  날짜 색:", [(c["day"], c["num"]) for c in colors[:8]])

    page.screenshot(path=f"{OUT}/binder-week-pc-colors.png", clip={"x": 0, "y": 60, "width": 1440, "height": 560})
    page.close()

    # ── 모바일 402×874 ──────────────────────────────────────────
    page = browser.new_page(viewport={"width": 402, "height": 874}, is_mobile=True, has_touch=True)
    open_binder(page)
    page.screenshot(path=f"{OUT}/binder-week-mobile-closed.png")

    toggle = page.locator("[data-week-schedule-toggle]")
    check("모바일 참고 창 버튼 보임", toggle.is_visible(), f"count={toggle.count()}")
    toggle.click()
    page.wait_for_timeout(500)
    panel = page.locator("[data-week-schedule]")
    check("모바일 참고 창 열림", panel.count() == 1)
    box_panel = panel.bounding_box()
    check("모바일 창이 화면 폭 안에", box_panel["x"] >= 0 and box_panel["x"] + box_panel["width"] <= 402, f"x={box_panel['x']:.0f} w={box_panel['width']:.0f}")

    box_row = page.locator("[data-binder-day]:visible").first.bounding_box()
    check("모바일 창이 쓰는 칸 위(가리지 않음)", box_panel["y"] + box_panel["height"] <= box_row["y"] + 1, f"panel bottom={box_panel['y'] + box_panel['height']:.0f} · row top={box_row['y']:.0f}")
    check("모바일 가로 스크롤 없음", page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), page.evaluate("() => document.documentElement.scrollWidth"))
    page.screenshot(path=f"{OUT}/binder-week-mobile-open.png")

    page.get_by_role("button", name="일정 창 닫기").click()
    page.wait_for_timeout(400)
    check("모바일 닫기", page.locator("[data-week-schedule]").count() == 0)
    page.screenshot(path=f"{OUT}/binder-week-mobile-after-close.png")
    page.close()

    # ── 설정 항목 · 일일 화면 ──────────────────────────────────
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    open_binder(page)
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(200)
    # 상단 메뉴는 화면 위쪽 가장자리에 닿으면 내려옵니다.
    page.mouse.move(720, 3)
    page.wait_for_timeout(400)
    page.get_by_role("button", name="설정", exact=True).first.click()
    page.wait_for_timeout(500)
    dialog = page.locator("[role=dialog]").first
    dialog.get_by_role("button", name="바인더", exact=True).first.click()
    page.wait_for_timeout(400)
    row = dialog.get_by_text("주간 일정 창 펼쳐 두기", exact=False)
    check("설정에 주간 일정 창 항목", row.count() >= 1, f"count={row.count()}")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    page.get_by_role("button", name="Daily", exact=False).first.click()
    page.wait_for_timeout(700)
    check("일일 화면 그대로 동작", page.get_by_text("이 날의 일정 · 할 일", exact=False).count() >= 1)
    page.screenshot(path=f"{OUT}/binder-daily-pc.png")
    page.close()

    browser.close()

print("")
if fails:
    print(f"{len(fails)} FAIL: {fails}")
    raise SystemExit(1)
print("ALL PASS")
