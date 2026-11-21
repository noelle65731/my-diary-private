"""주간 보기 검증 — 오늘 칸 배경색(절반 연하게) + 스크롤바 자동 숨김.

    NEXT_DIST_DIR=.next-t3 node node_modules/next/dist/bin/next start -p 3224
    BASE=http://127.0.0.1:3224 CHROME=/workspace/.browsers/chromium/chromium python3 tests/today-tint-scrollbar.py
"""

import os
import sys

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3224")
CHROME = os.environ.get("CHROME")
OUT = os.environ.get("OUT", "/workspace/work/local-shots")
os.makedirs(OUT, exist_ok=True)

TODAY_BG = "rgb(244, 246, 250)"  # #f4f6fa — 흰 바탕 대비 절반 농도
TRANSPARENT = ("transparent", "rgba(0, 0, 0, 0)")
VISIBLE = "rgba(156, 163, 175, 0.45)"

fails = []


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {extra}" if extra else ""))
    if not ok:
        fails.append(name)


def differs(a, b):
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    return ImageChops.difference(ia, ib).getbbox() is not None


def open_week(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    page.get_by_role("button", name="캘린더", exact=False).first.click()
    page.wait_for_timeout(800)
    page.get_by_role("button", name="주간", exact=True).first.click()
    page.wait_for_timeout(1200)


with sync_playwright() as p:
    # 오버레이 스크롤바를 끄고(클래식 스크롤바) 실제로 그려지는지 확인합니다.
    ARGV = [
        "--disable-features=OverlayScrollbar,FluentOverlayScrollbar,ScrollbarFluentOverlay,"
        "OverlayScrollbarFlashAfterAnyScrollUpdate,OverlayScrollbarFlashWhenMouseEnter",
    ]
    browser = p.chromium.launch(executable_path=CHROME, args=ARGV) if CHROME else p.chromium.launch(args=ARGV)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    open_week(page)

    # ── 1) 오늘 칸 배경색 ─────────────────────────────────────────────
    cells = page.locator("[data-week-task-day]").evaluate_all(
        "els => els.map(e => ({day: e.dataset.weekTaskDay, bg: getComputedStyle(e).backgroundColor}))"
    )
    tinted = [c for c in cells if c["bg"] != "rgba(0, 0, 0, 0)"]
    check(
        "오늘 칸(프로젝트 칸) 배경 = #f4f6fa",
        len(tinted) > 0
        and all(c["bg"] == TODAY_BG for c in tinted)
        and len({c["day"] for c in tinted}) == 1,
        f"{len(tinted)}칸, 날짜 {sorted({c['day'] for c in tinted})}",
    )
    other_tint = page.locator("[data-timeline-column]").evaluate_all(
        "els => els.map(e => getComputedStyle(e).backgroundColor)"
    )
    check("시간표 오늘 열도 #f4f6fa", TODAY_BG in other_tint and other_tint.count(TODAY_BG) == 1, str(other_tint))
    all_day = page.locator("[data-drop-zone='allday-day']").evaluate_all(
        "els => els.map(e => getComputedStyle(e).backgroundColor)"
    )
    check("종일 줄 오늘 칸도 #f4f6fa", all_day.count(TODAY_BG) == 1, str(all_day))
    routine = page.locator("[data-week-routine-day]").evaluate_all(
        "els => els.map(e => getComputedStyle(e).backgroundColor)"
    )
    routine_rows = page.locator("[data-week-routine-day]").count()
    check(
        "루틴 오늘 칸도 #f4f6fa",
        routine.count(TODAY_BG) > 0 and routine.count(TODAY_BG) == routine_rows // 7,
        f"{routine.count(TODAY_BG)}/{routine_rows}칸",
    )

    # ── 2) 스크롤바: 평소엔 투명 ──────────────────────────────────────
    board = page.locator("[data-week-board-scroll]").first
    sched = page.locator("[data-week-scroll]").first

    def state(loc):
        return loc.evaluate(
            "el => ({cls: el.className, color: getComputedStyle(el).scrollbarColor,"
            " w: el.clientWidth, ow: el.offsetWidth, sh: el.scrollHeight, ch: el.clientHeight})"
        )

    b0, s0 = state(board), state(sched)
    print("idle board:", b0)
    print("idle schedule:", s0)
    check("board: scrollbar-quiet, is-scrolling 없음", "scrollbar-quiet" in b0["cls"] and "is-scrolling" not in b0["cls"])
    check("schedule: scrollbar-quiet, is-scrolling 없음", "scrollbar-quiet" in s0["cls"] and "is-scrolling" not in s0["cls"])
    check("평소 스크롤바 투명", any(t in b0["color"] for t in TRANSPARENT) and any(t in s0["color"] for t in TRANSPARENT),
          f"{b0['color']} / {s0['color']}")
    check("실제로 스크롤되는 영역", s0["sh"] > s0["ch"] or b0["sh"] > b0["ch"],
          f"board {b0['sh']}>{b0['ch']}, sched {s0['sh']}>{s0['ch']}")

    gutter_before = (b0["ow"] - b0["w"], s0["ow"] - s0["w"])
    page.screenshot(path=os.path.join(OUT, "scrollbar-idle-1440.png"))

    # ── 3) 스크롤 중 is-scrolling ─────────────────────────────────────
    target = sched if s0["sh"] > s0["ch"] else board
    box = target.bounding_box()
    bar_clip = {"x": box["x"] + box["width"] - 12, "y": box["y"], "width": 12, "height": box["height"]}
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.wheel(0, 120)
    page.wait_for_timeout(150)
    s1 = state(target)
    print("during scroll:", s1)
    check("스크롤 중 is-scrolling", "is-scrolling" in s1["cls"], s1["cls"])
    check("스크롤 중 스크롤바 보임", VISIBLE in s1["color"], s1["color"])
    during = os.path.join(OUT, "bar-during.png")
    page.screenshot(path=during, clip=bar_clip)

    # ── 4) 1초쯤 멈추면 다시 투명 ─────────────────────────────────────
    page.wait_for_timeout(1300)
    s2 = state(target)
    print("after idle:", s2)
    check("멈추면 is-scrolling 제거", "is-scrolling" not in s2["cls"], s2["cls"])
    check("멈추면 스크롤바 다시 투명", any(t in s2["color"] for t in TRANSPARENT), s2["color"])
    idle_a = os.path.join(OUT, "bar-idle-a.png")
    page.screenshot(path=idle_a, clip=bar_clip)
    page.wait_for_timeout(1200)
    idle_b = os.path.join(OUT, "bar-idle-b.png")
    page.screenshot(path=idle_b, clip=bar_clip)

    # 이 헤드리스 Chromium은 오버레이 스크롤바만 그려서 thumb 픽셀은 비교할 수 없습니다.
    # (실제 브라우저에서는 scrollbar-color transparent 로 thumb이 사라지고 폭은 그대로입니다.)
    if gutter_before[1] > 0 or gutter_before[0] > 0:
        check("스크롤 중 픽셀에 thumb이 그려짐", differs(during, idle_a))
        check("멈춘 뒤에는 처음처럼 thumb 없음", not differs(idle_a, idle_b))
    else:
        print(f"INFO 픽셀 비교 생략 — 이 브라우저는 오버레이 스크롤바(거터 {gutter_before})라 thumb이 화면 폭을 차지하지 않습니다")
        check("멈춘 뒤 화면 변화 없음", not differs(idle_a, idle_b))
    gutter_after = (state(board)["ow"] - state(board)["w"], state(sched)["ow"] - state(sched)["w"])
    check("숨김/표시에 레이아웃 흔들림 없음", gutter_before == gutter_after, f"{gutter_before} → {gutter_after}")

    page.screenshot(path=os.path.join(OUT, "today-tint-1440.png"))
    page.locator("[data-week-board-scroll]").first.screenshot(path=os.path.join(OUT, "week-board-1440.png"))
    print("오늘 칸 색:", TODAY_BG, "/ 이전 #e8edf4")

    # ── 5) 폰 폭 ────────────────────────────────────────────────────
    mobile = browser.new_page(viewport={"width": 402, "height": 874}, is_mobile=True, has_touch=True)
    open_week(mobile)
    mobile.screenshot(path=os.path.join(OUT, "today-tint-mobile-402.png"))
    m_tint = mobile.locator("[data-week-task-day]").evaluate_all(
        "els => els.map(e => getComputedStyle(e).backgroundColor)"
    )
    check("폰에서도 오늘 칸 #f4f6fa", m_tint.count(TODAY_BG) > 0, str(set(m_tint)))

    browser.close()

print("\nFAILS:", fails if fails else "none")
sys.exit(1 if fails else 0)
