"""A30: 새 할 일·프로젝트 비차단 플로팅 창 검증 (PC 1440×900 · 모바일 402×874).

    BASE=http://127.0.0.1:3251 CHROME=/workspace/.browsers/chromium/chromium \
        LD_LIBRARY_PATH=/workspace/work/chromium-libs/lib python3 tests/floating-new-item.py
"""

import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3251")
CHROME = os.environ.get("CHROME")
OUT = os.environ.get("OUT", "/workspace/work/float-shots")
os.makedirs(OUT, exist_ok=True)

fails = []


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {extra}" if extra else ""))
    if not ok:
        fails.append(name)


def open_projects(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2200)
    page.locator("nav button", has_text="프로젝트").first.click()
    page.wait_for_timeout(1200)


def panel(page):
    return page.locator("[data-new-item-panel]")


def behind_scrollable(page, probe_y=None):
    """뒤 화면이 잠기지 않았는지: body 스크롤 잠금 없음 + 바깥 지점이 패널이 아님."""
    body_overflow = page.evaluate("getComputedStyle(document.body).overflow")
    y = probe_y if probe_y is not None else 300
    hit = page.evaluate(
        """(y) => {
            const el = document.elementFromPoint(40, y);
            if (!el) return null;
            return {
              inPanel: !!el.closest('[data-new-item-panel]'),
              inMain: !!el.closest('main'),
            };
        }""",
        y,
    )
    return body_overflow, hit


def box(page):
    b = panel(page).bounding_box()
    return {k: round(v, 1) for k, v in (b or {}).items()}


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()

    # ── PC 1440×900 ────────────────────────────────────────────────
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    open_projects(page)
    page.screenshot(path=f"{OUT}/pc-01-projects.png")

    check("PC 시작: 플로팅 창 없음", panel(page).count() == 0)
    page.get_by_text("+ new", exact=True).first.click()
    page.wait_for_timeout(500)

    check("PC + new → 플로팅 창 열림", panel(page).count() == 1)
    check("PC 창 종류: 프로젝트", panel(page).get_attribute("data-new-item-panel") == "프로젝트")
    b = box(page)
    check("PC 창 폭 380~430px", 380 <= b.get("width", 0) <= 430, str(b))
    check("PC 오른쪽에 붙음", abs((b["x"] + b["width"]) - (1440 - 24)) <= 3, str(b))
    nav_top = page.evaluate("() => document.querySelector('nav').getBoundingClientRect().top")
    check("PC 창이 하단 탭바 위에 있음", b["y"] + b["height"] <= nav_top + 1, f"panelBottom={b['y'] + b['height']} navTop={nav_top}")

    # 어둡게 덮는 백드롭이 없고, 뒤 화면이 클릭·스크롤 가능해야 합니다.
    overflow, hit = behind_scrollable(page)
    check("PC body 스크롤 잠금 없음", overflow in ("visible", ""), overflow)
    check("PC 왼쪽 화면이 패널 아님(main 영역)", bool(hit and not hit["inPanel"]), str(hit))
    backdrop = page.evaluate(
        """() => [...document.querySelectorAll('div,button')].filter(el => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (s.position !== 'fixed' || r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) return false;
            if (el.closest('[data-new-item-panel]')) return false;
            return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || (s.backdropFilter && s.backdropFilter !== 'none');
        }).length"""
    )
    check("PC 어둡게 덮는 백드롭 없음", backdrop == 0, f"backdrops={backdrop}")
    page.screenshot(path=f"{OUT}/pc-02-floating-open.png")

    # 뒤 화면 스크롤 — 짧은 화면에서도 스크롤되고, 패널은 제자리(fixed)에 남습니다.
    page.set_viewport_size({"width": 1440, "height": 620})
    page.wait_for_timeout(400)
    before = page.evaluate("() => window.scrollY")
    page.mouse.move(300, 400)
    page.mouse.wheel(0, 700)
    page.wait_for_timeout(500)
    after = page.evaluate("() => window.scrollY")
    check("PC 뒤 화면 스크롤됨", after > before, f"{before} → {after}")
    check(
        "PC 창 본문 내부 스크롤(내용이 길 때)",
        page.evaluate("() => { const el = document.querySelector('[data-panel-scroll]'); return el.scrollHeight > el.clientHeight; }"),
    )
    page.screenshot(path=f"{OUT}/pc-02b-scrolled-behind.png")
    page.set_viewport_size({"width": 1440, "height": 900})
    page.wait_for_timeout(400)
    b2 = box(page)
    check("PC 스크롤해도 창 제자리", b2["y"] == b["y"] and b2["x"] == b["x"], f"{b} → {b2}")
    check("PC 스크롤해도 창 유지", panel(page).count() == 1)

    # 바깥을 눌러도 닫히지 않습니다.
    page.mouse.click(200, 300)
    page.wait_for_timeout(400)
    check("PC 바깥 클릭해도 닫히지 않음", panel(page).count() == 1)

    # 작성 중 탭 전환 — 창과 입력한 내용이 그대로 남습니다.
    page.locator("[data-panel-scroll] input").first.fill("플로팅 창 테스트")
    page.locator("nav button", has_text="캘린더").first.click()
    page.wait_for_timeout(900)
    check("PC 탭 전환해도 창 유지", panel(page).count() == 1)
    check(
        "PC 탭 전환해도 입력 유지",
        page.locator("[data-panel-scroll] input").first.input_value() == "플로팅 창 테스트",
    )
    page.locator("nav button", has_text="프로젝트").first.click()
    page.wait_for_timeout(700)

    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    check("PC Esc로는 닫히지 않음", panel(page).count() == 1)

    # 창을 연 채 다른 카드의 + 할 일을 눌러도 적던 제목은 남습니다.
    page.get_by_text("+ 할 일", exact=True).first.click()
    page.wait_for_timeout(400)
    check("PC 다시 + 할 일 → 창 유지", panel(page).count() == 1)
    check(
        "PC 다시 + 할 일 → 적던 제목 유지",
        page.locator("[data-panel-scroll] input").first.input_value() == "플로팅 창 테스트",
    )
    check("PC 다시 + 할 일 → 종류 반영", panel(page).get_attribute("data-new-item-panel") == "할 일")

    # 접기/펼치기
    page.locator("[data-panel-collapse]").click()
    page.wait_for_timeout(300)
    collapsed = box(page)
    check("PC 접기 → 본문 숨김", page.locator("[data-panel-scroll]").count() == 0)
    check("PC 접기 → 제목 줄만", collapsed["height"] < 90, str(collapsed))
    page.screenshot(path=f"{OUT}/pc-03-collapsed.png")
    page.locator("[data-panel-collapse]").click()
    page.wait_for_timeout(300)
    check("PC 펼치기 → 본문 복귀", page.locator("[data-panel-scroll]").count() == 1)

    # 상단 바를 끌어 옮기기
    head = page.locator("[data-panel-drag]")
    hb = head.bounding_box()
    page.mouse.move(hb["x"] + 120, hb["y"] + 16)
    page.mouse.down()
    page.mouse.move(hb["x"] + 120 - 260, hb["y"] + 16 - 120, steps=8)
    page.mouse.up()
    page.wait_for_timeout(300)
    moved = box(page)
    check("PC 상단 바 드래그로 이동", moved["x"] < b["x"] - 150 and moved["y"] < b["y"] - 60, f"{b} → {moved}")
    check("PC 드래그 후에도 유지", panel(page).count() == 1)
    page.screenshot(path=f"{OUT}/pc-04-dragged.png")

    # X(닫기) — 직접 닫습니다. (A4: 고친 내용은 저장)
    page.locator("[data-panel-close]").click()
    page.wait_for_timeout(800)
    check("PC X로 닫기", panel(page).count() == 0)

    # 저장 — 새 할 일이 목록에 나타납니다.
    page.locator("nav button", has_text="프로젝트").first.click()
    page.wait_for_timeout(700)
    page.get_by_text("+ new", exact=True).first.click()
    page.wait_for_timeout(400)
    page.locator("[data-panel-scroll] input").first.fill("플로팅 창 저장 확인")
    panel(page).get_by_role("button", name="추가", exact=True).click()
    page.wait_for_timeout(1200)
    check("PC 저장 → 창 닫힘", panel(page).count() == 0)
    page.wait_for_timeout(600)
    check("PC 저장 → 목록에 새 항목", page.get_by_text("플로팅 창 저장 확인").count() > 0)

    # X로 닫을 때도 적은 내용은 저장됩니다.
    page.locator("nav button", has_text="프로젝트").first.click()
    page.wait_for_timeout(600)
    page.get_by_text("+ new", exact=True).first.click()
    page.wait_for_timeout(400)
    page.locator("[data-panel-scroll] input").first.fill("플로팅 창 X 저장 확인")
    page.locator("[data-panel-close]").click()
    page.wait_for_timeout(1400)
    check("PC X 닫기 → 적은 내용 저장", page.get_by_text("플로팅 창 X 저장 확인").count() > 0)

    page.close()

    # ── 모바일 402×874 ─────────────────────────────────────────────
    m = browser.new_page(viewport={"width": 402, "height": 874}, is_mobile=True, has_touch=True)
    open_projects(m)
    m.screenshot(path=f"{OUT}/m-01-projects.png")
    check("모바일 시작: 플로팅 창 없음", panel(m).count() == 0)
    m.get_by_text("+ new", exact=True).first.click()
    m.wait_for_timeout(500)

    check("모바일 + new → 플로팅 창 열림", panel(m).count() == 1)
    mb = box(m)
    check("모바일 창이 화면 안", mb["x"] >= 0 and mb["x"] + mb["width"] <= 402.5, str(mb))
    check("모바일 창 폭이 화면 폭 근처", 330 <= mb["width"] <= 402, str(mb))
    mnav_top = m.evaluate("() => document.querySelector('nav').getBoundingClientRect().top")
    check("모바일 창이 하단 탭바 위", mb["y"] + mb["height"] <= mnav_top + 1, f"panelBottom={mb['y'] + mb['height']} navTop={mnav_top}")
    check("모바일 창 높이: 반쪽 정도(위 배경 보임)", mb["height"] <= 874 * 0.66, str(mb))
    check("모바일 위쪽 배경 보임", mb["y"] >= 874 * 0.2, str(mb))

    overflow, hit = behind_scrollable(m, probe_y=max(40, mb["y"] - 30))
    check("모바일 body 스크롤 잠금 없음", overflow in ("visible", ""), overflow)
    check("모바일 위쪽 화면이 패널 아님(main)", bool(hit and not hit["inPanel"] and hit["inMain"]), str(hit))
    mbackdrop = m.evaluate(
        """() => [...document.querySelectorAll('div,button')].filter(el => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (s.position !== 'fixed' || r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) return false;
            if (el.closest('[data-new-item-panel]')) return false;
            return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || (s.backdropFilter && s.backdropFilter !== 'none');
        }).length"""
    )
    check("모바일 백드롭 없음", mbackdrop == 0, f"backdrops={mbackdrop}")
    m.screenshot(path=f"{OUT}/m-02-floating-open.png")

    # 뒤 화면 스크롤 (터치) — 창은 그대로.
    if not m.evaluate("() => document.scrollingElement.scrollHeight > window.innerHeight + 4"):
        m.set_viewport_size({"width": 402, "height": 700})
        m.wait_for_timeout(300)
    mbefore = m.evaluate("() => window.scrollY")
    m.mouse.move(200, 120)
    m.mouse.wheel(0, 600)
    m.wait_for_timeout(500)
    mafter = m.evaluate("() => window.scrollY")
    check("모바일 뒤 화면 스크롤됨", mafter > mbefore, f"{mbefore} → {mafter}")
    m.screenshot(path=f"{OUT}/m-02b-scrolled-behind.png")
    check("모바일 스크롤해도 창 유지", panel(m).count() == 1)
    check("모바일 스크롤해도 창 제자리", box(m)["y"] == mb["y"], f"{mb} → {box(m)}")
    m.set_viewport_size({"width": 402, "height": 874})
    m.wait_for_timeout(300)

    # 바깥 터치로 닫히지 않음 (패널 밖 왼쪽 여백)
    m.touchscreen.tap(4, max(40, mb["y"] + 40))
    m.wait_for_timeout(400)
    check("모바일 바깥 터치해도 닫히지 않음", panel(m).count() == 1)

    # 탭 전환에도 유지 + 입력 유지
    m.locator("[data-panel-scroll] input").first.fill("모바일 플로팅 확인")
    m.locator("nav button", has_text="캘린더").first.click()
    m.wait_for_timeout(900)
    check("모바일 탭 전환해도 창 유지", panel(m).count() == 1)
    check("모바일 탭 전환해도 입력 유지", m.locator("[data-panel-scroll] input").first.input_value() == "모바일 플로팅 확인")
    m.locator("nav button", has_text="프로젝트").first.click()
    m.wait_for_timeout(700)
    m.screenshot(path=f"{OUT}/m-03-typed.png")

    # 접기/펼치기
    m.locator("[data-panel-collapse]").click()
    m.wait_for_timeout(300)
    check("모바일 접기 → 본문 숨김", m.locator("[data-panel-scroll]").count() == 0)
    m.screenshot(path=f"{OUT}/m-04-collapsed.png")
    m.locator("[data-panel-collapse]").click()
    m.wait_for_timeout(300)
    check("모바일 펼치기 → 본문 복귀", m.locator("[data-panel-scroll]").count() == 1)

    # 저장
    m.locator("[data-panel-scroll] input").first.fill("모바일 플로팅 확인")
    m.wait_for_timeout(200)
    check(
        "모바일 창 본문 내부 스크롤",
        m.evaluate("() => { const el = document.querySelector('[data-panel-scroll]'); return el.scrollHeight > el.clientHeight; }"),
    )
    panel(m).get_by_role("button", name="추가", exact=True).click()
    m.wait_for_timeout(1300)
    check("모바일 저장 → 창 닫힘", panel(m).count() == 0)
    m.wait_for_timeout(600)
    check("모바일 저장 → 목록에 새 항목", m.get_by_text("모바일 플로팅 확인").count() > 0)

    # X 닫기 (적은 내용 저장)
    m.locator("nav button", has_text="프로젝트").first.click()
    m.wait_for_timeout(600)
    m.get_by_text("+ new", exact=True).first.click()
    m.wait_for_timeout(400)
    m.locator("[data-panel-scroll] input").first.fill("모바일 X 저장 확인")
    m.screenshot(path=f"{OUT}/m-05-before-close.png")
    m.locator("[data-panel-close]").click()
    m.wait_for_timeout(1400)
    check("모바일 X로 닫기", panel(m).count() == 0)
    check("모바일 X 닫기 → 적은 내용 저장", m.get_by_text("모바일 X 저장 확인").count() > 0)

    # 프로젝트 카드의 + 할 일 도 같은 창을 쓰고, 그 프로젝트가 미리 연결됩니다.
    m.locator("nav button", has_text="프로젝트").first.click()
    m.wait_for_timeout(600)
    card = m.locator("[data-project-card]").filter(has_text="+ 할 일").first
    project_title = card.locator("header p").first.inner_text().strip()
    m.get_by_text("+ 할 일", exact=True).first.click()
    m.wait_for_timeout(500)
    check("모바일 카드 + 할 일 → 같은 플로팅 창", panel(m).count() == 1)
    check("모바일 창 종류: 할 일", panel(m).get_attribute("data-new-item-panel") == "할 일")
    chip = panel(m).get_by_role("button", name=project_title, exact=True)
    check(
        "모바일 연결 프로젝트 미리 선택",
        chip.count() > 0
        and chip.first.get_attribute("aria-pressed") == "true"
        and "bg-accent-100" in (chip.first.get_attribute("class") or ""),
        f"project={project_title} pressed={chip.first.get_attribute('aria-pressed') if chip.count() else 'none'}",
    )
    m.screenshot(path=f"{OUT}/m-06-from-card.png")
    m.locator("[data-panel-close]").click()
    m.close()

    browser.close()

print("\n" + ("ALL PASS" if not fails else f"FAILS: {fails}"))
raise SystemExit(1 if fails else 0)
