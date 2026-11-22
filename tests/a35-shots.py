"""A35 검증 스크린샷 — 시트에서 끌어 다른 프로젝트 행으로 옮기는 순간을 찍어 downloads/ 에 남깁니다."""

import importlib.util
import pathlib

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("uicheck", HERE / "ui-check.py")
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)

OUT = pathlib.Path("/workspace/downloads")
OUT.mkdir(parents=True, exist_ok=True)

Mock = ui.Mock
build_fixture = ui.build_fixture
task = ui.task
new_context = ui.new_context
launch_args = ui.launch_args
patches = ui.patches
TODAY = ui.TODAY


def fixture():
    data = build_fixture()
    data["projects"].append(task("tk-10", "책상 정리", category="개인", date="2026-11-18", projectIds=["pj-2"]))
    return data


def go_week(page):
    page.get_by_role("button", name="캘린더", exact=True).first.click()
    page.wait_for_timeout(500)
    page.get_by_role("button", name="주간", exact=True).first.click()
    page.wait_for_timeout(800)


def point_of(page, selector):
    return page.evaluate(
        """(sel) => {
          const sheets = [...document.querySelectorAll('[data-week-cell-sheet], [data-day-list]')];
          const saved = sheets.map((el) => ({ el, v: el.style.visibility, pe: el.style.pointerEvents }));
          for (const el of sheets) { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
          const el = document.querySelector(sel);
          let point = null;
          if (el) {
            const r = el.getBoundingClientRect();
            for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
              const px = r.left + r.width * fx, py = r.top + r.height * fy;
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


def touch(page, kind, x, y):
    page.evaluate(
        """([kind, x, y]) => {
          const target = kind === 'down' ? document.querySelector('[data-a35-src]') : window;
          target.dispatchEvent(new PointerEvent('pointer' + kind, {
            bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch',
            isPrimary: true, clientX: x, clientY: y,
            buttons: kind === 'up' ? 0 : 1, button: 0,
          }));
        }""",
        [kind, x, y],
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())

        # ── 폰 390×844 ────────────────────────────────────────────────
        mock = Mock(fixture())
        ctx, page = new_context(browser, 390, 844, mock)
        go_week(page)
        cell = page.locator(f"[data-week-project-cell='브랜드 포트폴리오:2026-11-18']").first
        cell.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        cell.click()
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "a35-mobile-1-sheet.png"))

        sel = "[data-drop-zone='week-task-day'][data-drop-project='pj-2'][data-drop-day='2026-11-22']"
        page.locator(sel).first.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        target = point_of(page, sel)
        source = page.locator("[data-week-cell-drag='tk-3']").first
        source.evaluate("el => el.setAttribute('data-a35-src', 'true')")
        box = source.bounding_box()
        sx, sy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        touch(page, "down", sx, sy)
        page.wait_for_timeout(340)
        touch(page, "move", sx + 3, sy - 12)
        page.wait_for_timeout(60)
        touch(page, "move", target["x"], target["y"])
        page.wait_for_timeout(200)
        print("hint:", page.locator(".dnd-ghost-hint").first.inner_text())
        page.screenshot(path=str(OUT / "a35-mobile-2-dragging.png"))
        touch(page, "up", target["x"], target["y"])
        page.wait_for_timeout(1000)
        print("patch:", [c for c in patches(mock, "projects") if c[2] == "tk-3"][-1][3])
        page.screenshot(path=str(OUT / "a35-mobile-3-after.png"))
        ctx.close()

        # ── PC 1440×900 ───────────────────────────────────────────────
        mock = Mock(fixture())
        ctx, page = new_context(browser, 1440, 900, mock)
        go_week(page)
        page.locator("[data-week-project-cell='브랜드 포트폴리오:2026-11-18']").first.click()
        page.wait_for_timeout(600)
        sel = "[data-drop-zone='week-task-day'][data-drop-project='pj-2'][data-drop-day='2026-11-22']"
        target = point_of(page, sel)
        source = page.locator("[data-week-cell-drag='tk-3']").first
        box = source.bounding_box()
        sx, sy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(sx, sy)
        page.mouse.down()
        page.mouse.move(sx + 6, sy + 6, steps=3)
        page.mouse.move(sx + 16, sy + 14, steps=4)
        page.mouse.move(target["x"], target["y"], steps=12)
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "a35-pc-1-dragging.png"))
        page.mouse.up()
        page.wait_for_timeout(1000)
        page.screenshot(path=str(OUT / "a35-pc-2-after.png"))
        ctx.close()
        browser.close()

    print("saved to", OUT)


if __name__ == "__main__":
    main()
