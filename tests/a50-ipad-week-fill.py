"""A50 — 아이패드 Air 4 세로에서 바인더 주간 보기가 화면 세로를 채우는지.

    NEXT_DIST_DIR=.next-a50 PORT=3223 tests/run-with-server.sh tests/a50-ipad-week-fill.py

확인하는 것
  1) 아이패드 Air 4 세로(820×1180): 일곱 칸이 110px 이상으로 늘어나 한 주가 화면을 채우고,
     페이지가 넘치지 않음(docScrollHeight ≤ innerHeight)
  2) 아이패드 Air 4 가로(1180×820)·PC(1440×900)·모바일(390×844): 칸 높이가 예전(83px 근처)
     그대로 — 잘 보이던 화면을 건드리지 않음
  3) 아이패드 세로에서 칸 아래쪽 빈 곳을 눌러도 그 날 쓰기가 시작됨(누를 수 있는 면이 칸 전체)
  4) 전체 펼치기·주간 한눈에 창이 깨지지 않고 콘솔 오류 0건, 가로 넘침 없음
"""
import json
import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3223")
OUT = os.environ.get("OUT", "/workspace/downloads")
CHROME = os.environ.get("CHROME", "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell")
LIBS = os.environ.get("LIBS", "/workspace/.tools/chrome-libs")
os.makedirs(OUT, exist_ok=True)

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        fails.append(name)


PROBE = """() => {
  const rows = [...document.querySelectorAll('[data-binder-day]')]
    .filter(e => e.getBoundingClientRect().height > 0);
  const first = rows[0], last = rows[rows.length - 1];
  return {
    vh: window.innerHeight,
    rows: rows.map(e => ({ day: e.dataset.binderDay, h: Math.round(e.getBoundingClientRect().height) })),
    weekTop: first ? Math.round(first.getBoundingClientRect().top) : null,
    weekBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
    docScrollH: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    navTop: Math.round(document.querySelector('nav').getBoundingClientRect().top),
  };
}"""


def open_weekly(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-view-switch]", timeout=25000)
    page.wait_for_timeout(800)
    page.get_by_role("button", name="바인더", exact=False).first.click()
    page.wait_for_timeout(700)
    page.get_by_role("button", name="Weekly", exact=False).first.click()
    page.wait_for_timeout(800)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})

        def page_at(w, h):
            page = browser.new_page(viewport={"width": w, "height": h})
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            open_weekly(page)
            return page, errors

        # 1) 아이패드 Air 4 세로
        page, errors = page_at(820, 1180)
        info = page.evaluate(PROBE)
        print("ipad-portrait", json.dumps(info, ensure_ascii=False))
        heights = [r["h"] for r in info["rows"]]
        check("아이패드 세로: 일곱 칸", len(heights) == 7, str(heights))
        check("아이패드 세로: 칸마다 110px 이상", len(heights) == 7 and min(heights) >= 110, str(heights))
        check("아이패드 세로: 칸 높이 고름(편차 3px 이내)", len(heights) == 7 and max(heights) - min(heights) <= 3, str(heights))
        check("아이패드 세로: 한 주가 800px 이상", (info["weekBottom"] or 0) - (info["weekTop"] or 0) >= 800, f'{info["weekBottom"]} - {info["weekTop"]}')
        check("아이패드 세로: 하단 탭 위에서 끝남", info["weekBottom"] <= info["navTop"], f'weekBottom {info["weekBottom"]} / navTop {info["navTop"]}')
        check("아이패드 세로: 페이지 넘침/스크롤 없음", info["docScrollH"] <= info["vh"], f'{info["docScrollH"]} / {info["vh"]}')
        check("아이패드 세로: 가로 넘침 없음", info["overflowX"] <= 0, str(info["overflowX"]))
        check("아이패드 세로: 콘솔 오류 0건", not errors, " | ".join(errors[:3]))
        page.screenshot(path=f"{OUT}/a50-ipad-portrait.png")

        # 3) 칸 아래쪽 빈 곳 눌러도 쓰기 시작
        empty_day = page.evaluate(
            """() => [...document.querySelectorAll('[data-binder-day]')]
                 .filter(e => e.getBoundingClientRect().height > 0 && !e.querySelector('[data-binder-preview]'))
                 .map(e => e.dataset.binderDay)[0] ?? document.querySelector('[data-binder-day]').dataset.binderDay"""
        )
        target = page.evaluate(
            """(day) => {
              const row = document.querySelector(`[data-binder-day="${day}"]`);
              const r = row.getBoundingClientRect();
              return { x: r.x + r.width * 0.6, y: r.bottom - 14 };
            }""",
            empty_day,
        )
        page.mouse.click(target["x"], target["y"])
        page.wait_for_timeout(700)
        opened = page.evaluate(f"() => !!document.querySelector('[data-binder-expanded=\"{empty_day}\"]')")
        check("아이패드 세로: 칸 아래쪽을 눌러도 쓰기가 열림", opened, f"{empty_day} @y={round(target['y'])}")
        page.screenshot(path=f"{OUT}/a50-ipad-portrait-writing.png")
        page.get_by_role("button", name="닫기", exact=False).first.click()
        page.wait_for_timeout(500)

        # 4) 전체 펼치기
        page.click("[data-binder-expand-all]")
        page.wait_for_timeout(1200)
        expanded = page.evaluate(
            """() => [...document.querySelectorAll('[data-binder-expanded-all]')]
                 .map(e => Math.round(e.closest('[data-binder-day]').getBoundingClientRect().height))
                 .filter(h => h > 0)"""
        )
        check("아이패드 세로: 전체 펼치기에서 칸이 제 높이를 지킴", bool(expanded) and all(h >= 121 for h in expanded), str(expanded))
        check("아이패드 세로: 펼친 뒤 가로 넘침 없음", page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 0)
        page.screenshot(path=f"{OUT}/a50-ipad-portrait-expanded.png", full_page=False)
        page.click("[data-binder-expand-all]")
        page.wait_for_timeout(600)

        # 주간 한눈에 창
        page.click("[data-week-schedule-toggle]")
        page.wait_for_timeout(800)
        panel = page.evaluate("() => !!document.querySelector('#week-schedule')")
        check("아이패드 세로: 주간 한눈에 창이 열림", panel)
        page.screenshot(path=f"{OUT}/a50-ipad-portrait-panel.png")
        page.close()

        # 2) 나머지 화면은 그대로
        for name, w, h in [("ipad-landscape", 1180, 820), ("pc", 1440, 900), ("mobile", 390, 844)]:
            page, errors = page_at(w, h)
            info = page.evaluate(PROBE)
            print(name, json.dumps(info, ensure_ascii=False))
            heights = sorted({r["h"] for r in info["rows"]})
            check(f"{name}: 칸 높이 예전 그대로(78~92px)", all(78 <= v <= 92 for v in heights), str(heights))
            check(f"{name}: 가로 넘침 없음", info["overflowX"] <= 0, str(info["overflowX"]))
            check(f"{name}: 콘솔 오류 0건", not errors, " | ".join(errors[:3]))
            page.screenshot(path=f"{OUT}/a50-{name}.png")

            # 주간 → Daily → Notes → Weekly 흐름과 쓰기·펼치기가 이 화면에서도 그대로
            day = page.evaluate(
                """() => [...document.querySelectorAll('[data-binder-day]')]
                     .filter(e => e.getBoundingClientRect().height > 0)[0].dataset.binderDay"""
            )
            page.locator(f'[data-binder-day="{day}"] [role="button"]').first.click()
            page.wait_for_timeout(700)
            check(f"{name}: 칸을 눌러 쓰기가 열림", page.evaluate(f"() => !!document.querySelector('[data-binder-expanded=\"{day}\"]')"))
            page.get_by_role("button", name="닫기", exact=False).first.click()
            page.wait_for_timeout(400)
            page.get_by_role("button", name="Daily", exact=False).first.click()
            page.wait_for_timeout(700)
            check(f"{name}: Daily 화면이 열림", page.evaluate("() => document.body.innerText.includes('Daily')"))
            page.get_by_role("button", name="Notes", exact=False).first.click()
            page.wait_for_timeout(700)
            check(f"{name}: Notes 화면이 열림", page.evaluate("() => document.body.innerText.includes('Notes')"))
            check(f"{name}: 세 화면 오류 0건", not errors, " | ".join(errors[:3]))
            page.close()

        browser.close()

    print(f"\n{len(fails)} fail(s)")
    for name in fails:
        print(" -", name)


main()
