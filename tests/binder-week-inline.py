"""바인더 위클리 — 각 날짜 칸에 그날 일정·할 일이 바로 붙어 보이는지 검증.

    BASE=http://127.0.0.1:3261 CHROME=/workspace/.browsers/chromium/chromium \
        python3 tests/binder-week-inline.py

확인하는 것
  · 위클리 화면을 열면 어떤 버튼도 누르지 않아도 날짜마다 그날 일정·할 일이 보임
  · 그 줄이 그 날짜의 입력 칸(미리보기/타이핑) 바로 위에 있음 — PC·폰 모두
  · 시각(종일 포함)·완료(취소선)·대기·마감이 칩에 드러남
  · 기본은 한 줄로 접혀 있고 +N 으로 펼쳐지며, 쓰기 시작하면 모두 보임
  · 그 날짜에 타이핑하면 그대로 저장되고, 쓰는 동안에도 일정 줄이 남아 있음
"""

import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3261")
CHROME = os.environ.get("CHROME")
OUT = os.environ.get("OUT", "/workspace/work/inline-shots")
os.makedirs(OUT, exist_ok=True)

fails = []


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {extra}" if extra else ""))
    if not ok:
        fails.append(name)


def open_binder(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    page.get_by_role("button", name="바인더", exact=False).first.click()
    page.wait_for_timeout(900)
    page.get_by_role("button", name="Weekly", exact=False).first.click()
    page.wait_for_timeout(700)


def agenda_rows(page):
    return page.evaluate(
        """() => [...document.querySelectorAll('[data-binder-day]')]
            .filter(row => row.getBoundingClientRect().height > 0)
            .map(row => {
              const agenda = row.querySelector('[data-day-agenda]');
              const entry = row.querySelector('[role="button"], textarea');
              const a = agenda ? agenda.getBoundingClientRect() : null;
              const e = entry ? entry.getBoundingClientRect() : null;
              const chips = agenda ? [...agenda.querySelectorAll('[data-agenda-item]')] : [];
              return {
                day: row.dataset.binderDay,
                hasAgenda: !!agenda,
                text: agenda ? agenda.innerText.replace(/\\n/g, ' | ') : '',
                chips: chips.length,
                chipTitles: chips.map(c => c.getAttribute('title')),
                // 그 줄이 입력 칸 위에 있는지
                above: !!(a && e && a.bottom <= e.top + 2),
                agendaH: a ? Math.round(a.height) : 0,
                rowH: Math.round(row.getBoundingClientRect().height),
                inRow: !!(a && a.left >= row.getBoundingClientRect().left && a.right <= row.getBoundingClientRect().right + 1),
              };
            })"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()

    # ── PC 1440×900 ─────────────────────────────────────────────
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    open_binder(page)
    page.screenshot(path=f"{OUT}/pc-week-inline.png", full_page=True)

    rows = agenda_rows(page)
    with_agenda = [r for r in rows if r["hasAgenda"]]
    check("PC 버튼 없이 날짜 칸에 일정·할 일이 보임", len(with_agenda) >= 3, f"{len(with_agenda)}일 · {[r['day'] for r in with_agenda]}")
    check("PC 모든 일정 줄이 그 날짜 입력 칸 위", all(r["above"] for r in with_agenda), str([(r["day"], r["above"]) for r in with_agenda]))
    check("PC 일정 줄이 그 날짜 칸 안에", all(r["inRow"] for r in with_agenda))
    check("PC 접힌 줄은 한두 줄 높이", all(r["agendaH"] <= 52 for r in with_agenda), str([(r["day"], r["agendaH"]) for r in with_agenda]))
    check("PC 일정 줄이 입력 칸을 밀어내지 않음(행 높이 200px 이하)", all(r["rowH"] <= 200 for r in with_agenda), str([(r["day"], r["rowH"]) for r in with_agenda]))

    joined = " / ".join(r["text"] for r in with_agenda)
    check("PC 시각 표시", any(t in joined for t in ("08:30", "10:00", "13:00", "14:00")), joined[:160])
    check("PC 종일 표시", "종일" in joined, joined[:160])
    check("PC 대기 표시", "대기" in joined, joined[:160])
    check("PC 마감 표시", "마감" in joined, joined[:160])

    titles = [t for r in with_agenda for t in r["chipTitles"]]
    check("PC 칩에 일정·할 일 이름이 담김", any("아침 요가" in (t or "") for t in titles), str(titles[:3]))

    # 완료한 할 일은 취소선으로 보입니다.
    struck = page.evaluate(
        """() => [...document.querySelectorAll('[data-agenda-item="할 일"]')]
            .map(el => ({ title: el.getAttribute('title'),
                          line: getComputedStyle(el.querySelector('span:last-child') || el).textDecorationLine }))
            .filter(item => item.line && item.line.includes('line-through'))"""
    )
    check("PC 완료한 할 일은 취소선", len(struck) >= 1, str(struck[:3]))

    # 접힌 날은 +N 으로 펼칩니다.
    more_days = [r["day"] for r in with_agenda]
    more_days = [day for day in more_days if page.locator(f'[data-binder-day="{day}"] [data-day-agenda] button').count() == 1]
    check("PC 항목이 많은 날은 +N 접기 버튼", len(more_days) >= 1, f"days={more_days}")
    if more_days:
        day_more = more_days[0]
        target_row = page.locator(f'[data-binder-day="{day_more}"]')
        before = target_row.locator("[data-agenda-item]").count()
        target_row.locator("[data-day-agenda] button").first.click()
        page.wait_for_timeout(400)
        after = target_row.locator("[data-agenda-item]").count()
        check("PC +N 으로 그날 일정 모두 펼쳐짐", after > before, f"{day_more}: {before} → {after}")
        page.screenshot(path=f"{OUT}/pc-week-inline-expanded.png", full_page=True)
        check("PC 펼친 뒤 접기 버튼", target_row.locator("[data-day-agenda] button").count() == 1,
              target_row.locator("[data-day-agenda] button").first.get_attribute("aria-label") or "none")
        target_row.locator("[data-day-agenda] button").first.click()
        page.wait_for_timeout(400)
        check("PC 다시 접힘", target_row.locator("[data-agenda-item]").count() == before, str(target_row.locator("[data-agenda-item]").count()))

    # 그 날짜를 눌러 쓰면 일정 줄은 그대로 있고 모두 펼쳐집니다.
    day = "2026-11-21"
    row = page.locator(f'[data-binder-day="{day}"]')
    row.locator("[role=button]").first.click()
    page.wait_for_timeout(400)
    check("PC 쓰기 시작해도 그날 일정 줄 남음", row.locator("[data-day-agenda]").count() == 1)
    check("PC 쓰는 동안 일정 줄이 입력 칸 위", page.evaluate(
        """() => { const row = document.querySelector('[data-binder-day="2026-11-21"]');
                   const a = row.querySelector('[data-day-agenda]').getBoundingClientRect();
                   const t = row.querySelector('textarea').getBoundingClientRect();
                   return a.bottom <= t.top + 2; }"""
    ))
    written = "일정 보면서 쓰는 중"
    row.locator("textarea").fill(written)
    page.wait_for_timeout(1400)
    page.keyboard.press("Escape")
    page.wait_for_timeout(1200)
    check("PC 쓴 글이 그 날짜 줄에 저장됨", written in row.inner_text(), row.inner_text().replace("\n", " / ")[:120])
    check("PC 저장 뒤에도 일정 줄 그대로", row.locator("[data-day-agenda]").count() == 1)
    page.screenshot(path=f"{OUT}/pc-week-inline-typed.png")

    # 보조 창은 그대로 쓸 수 있습니다(기본은 닫힘).
    check("PC 보조 창은 기본 닫힘", page.locator("[data-week-schedule]").count() == 0)
    page.locator("[data-week-schedule-toggle]").click()
    page.wait_for_timeout(500)
    check("PC 보조 창 열림", page.locator("[data-week-schedule]").count() == 1)
    page.locator("[data-week-schedule] button[aria-label='일정 창 닫기']").click()
    page.wait_for_timeout(300)
    page.close()

    # ── 모바일 402×874 ──────────────────────────────────────────
    page = browser.new_page(viewport={"width": 402, "height": 874}, is_mobile=True, has_touch=True)
    open_binder(page)
    page.screenshot(path=f"{OUT}/mobile-week-inline.png", full_page=True)
    rows = agenda_rows(page)
    with_agenda = [r for r in rows if r["hasAgenda"]]
    check("모바일 버튼 없이 날짜 칸에 일정·할 일이 보임", len(with_agenda) >= 3, f"{len(with_agenda)}일")
    check("모바일 모든 일정 줄이 그 날짜 입력 칸 위", all(r["above"] for r in with_agenda), str([(r["day"], r["above"]) for r in with_agenda]))
    check("모바일 줄이 그 날짜 칸 안에", all(r["inRow"] for r in with_agenda))
    check("모바일 접힌 줄은 두 줄 이하", all(r["agendaH"] <= 52 for r in with_agenda), str([(r["day"], r["agendaH"]) for r in with_agenda]))
    check("모바일 가로 스크롤 없음", page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"),
          page.evaluate("() => document.documentElement.scrollWidth"))

    more_days = [r["day"] for r in with_agenda if page.locator(f'[data-binder-day="{r["day"]}"] [data-day-agenda] button').count() == 1]
    check("모바일 +N 접기 버튼 있음", len(more_days) >= 1, f"days={more_days}")
    if more_days:
        day_more = more_days[0]
        target_row = page.locator(f'[data-binder-day="{day_more}"]')
        before = target_row.locator("[data-agenda-item]").count()
        target_row.locator("[data-day-agenda] button").first.click()
        page.wait_for_timeout(400)
        check("모바일 +N 으로 펼쳐짐", target_row.locator("[data-agenda-item]").count() > before,
              f"{day_more}: {before} → {target_row.locator('[data-agenda-item]').count()}")
        page.screenshot(path=f"{OUT}/mobile-week-inline-expanded.png")

    day = "2026-11-22"
    row = page.locator(f'[data-binder-day="{day}"]')
    row.locator("[role=button]").first.click()
    page.wait_for_timeout(500)
    check("모바일 쓰기 시작해도 일정 줄 남음", row.locator("[data-day-agenda]").count() == 1)
    check("모바일 쓰는 동안 일정 줄이 입력 칸 위", page.evaluate(
        """() => { const row = document.querySelector('[data-binder-day="2026-11-22"]');
                   const a = row.querySelector('[data-day-agenda]').getBoundingClientRect();
                   const t = row.querySelector('textarea').getBoundingClientRect();
                   return a.bottom <= t.top + 2; }"""
    ))
    written = "폰에서 일정 보면서 쓰기"
    row.locator("textarea").fill(written)
    page.wait_for_timeout(1400)
    page.keyboard.press("Escape")
    page.wait_for_timeout(1200)
    check("모바일 쓴 글이 그 날짜 줄에 저장됨", written in row.inner_text(), row.inner_text().replace("\n", " / ")[:120])
    page.screenshot(path=f"{OUT}/mobile-week-inline-typed.png")
    page.close()

    browser.close()

print("")
if fails:
    print(f"{len(fails)} FAIL: {fails}")
    raise SystemExit(1)
print("ALL PASS")
