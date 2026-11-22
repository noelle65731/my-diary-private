"""배포된 사이트(https://my-diary-private.vercel.app)에서 A35 이동이 실제로 도는지 확인.
API 는 테스트 하네스가 브라우저 안에서 대신 응답합니다(실제 노션은 건드리지 않음)."""

import importlib.util
import pathlib
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("uicheck", HERE / "ui-check.py")
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)

Mock = ui.Mock
build_fixture = ui.build_fixture
task = ui.task
check = ui.check
launch_args = ui.launch_args
patches = ui.patches
new_context = ui.new_context
TODAY = ui.TODAY
OUT = "/workspace/downloads"


def fixture():
    data = build_fixture()
    data["projects"].append(task("tk-10", "책상 정리", category="개인", date="2026-11-18", projectIds=["pj-2"]))
    return data


def touch(page, kind, x, y):
    page.evaluate(
        """([kind, x, y]) => {
          const target = kind === 'down' ? document.querySelector('[data-a35-src]') : (kind === 'up' ? window : window);
          target.dispatchEvent(new PointerEvent('pointer' + kind, {
            bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch',
            isPrimary: true, clientX: x, clientY: y,
            buttons: kind === 'up' ? 0 : 1, button: 0,
          }));
        }""",
        [kind, x, y],
    )


def point_of(page, selector):
    return page.evaluate(
        """(sel) => {
          const sheets = [...document.querySelectorAll('[data-week-cell-sheet]')];
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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        mock = Mock(fixture())
        ctx, page = ui.new_context(browser, 390, 844, mock)
        page.on("pageerror", lambda e: print("PAGEERROR", e))
        page.get_by_role("button", name="캘린더", exact=True).first.click()
        page.wait_for_timeout(500)
        page.get_by_role("button", name="주간", exact=True).first.click()
        page.wait_for_timeout(900)

        cell = page.locator("[data-week-project-cell='브랜드 포트폴리오:2026-11-18']").first
        cell.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        cell.click()
        page.wait_for_timeout(600)
        check("배포본: 프로젝트 칸 시트 열림", page.locator("[data-week-cell-sheet]").count() == 1, "")

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
        hidden = page.evaluate("getComputedStyle(document.querySelector('[data-week-cell-sheet]')).opacity")
        check("배포본: 끄는 동안 시트가 감춰짐", hidden == "0", hidden)
        touch(page, "move", sx + 3, sy - 12)
        page.wait_for_timeout(60)
        touch(page, "move", target["x"], target["y"])
        page.wait_for_timeout(200)
        hint = page.locator(".dnd-ghost-hint").first.inner_text() if page.locator(".dnd-ghost-hint").count() else ""
        check("배포본: 안내에 프로젝트·날짜", "집 정리" in hint and "11/22" in hint, hint)
        page.screenshot(path=f"{OUT}/a35-deployed-mobile-dragging.png")
        touch(page, "up", target["x"], target["y"])
        page.wait_for_timeout(1000)
        body = [c for c in patches(mock, "projects") if c[2] == "tk-3"]
        body = body[-1][3] if body else {}
        check("배포본: 프로젝트와 날짜가 함께 저장", body.get("projectIds") == ["pj-2"] and body.get("date") == "2026-11-22", str(body))
        ctx.close()
        browser.close()

    print(f"passed {len(ui.PASSES)} failed {len(ui.FAILS)}")
    for f in ui.FAILS:
        print(" -", f)
    return 1 if ui.FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
