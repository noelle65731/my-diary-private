"""A51 대표 스크린샷 — PC(1440×900)·태블릿(820×1180)·모바일(390×844).

토스트가 없는 깨끗한 화면으로 찍습니다(모의 데이터).
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3237")
OUT = os.environ.get("OUT", "/workspace/downloads")
CHROME = os.environ.get("CHROME", "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell")
LIBS = os.environ.get("LIBS", "/workspace/.tools/chrome-libs")
os.makedirs(OUT, exist_ok=True)


def main():
    saved = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})

        def open_archive(width, height):
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=2 if width < 500 else 1)
            page.goto(BASE, wait_until="domcontentloaded")
            page.wait_for_selector("nav", timeout=30000)
            page.wait_for_timeout(900)
            page.get_by_role("button", name="아카이브", exact=False).first.click()
            page.wait_for_selector("[data-archive-card]", timeout=20000)
            page.wait_for_timeout(1100)
            return page

        # PC — 카드 보드
        page = open_archive(1440, 900)
        path = os.path.join(OUT, "a51-archive-01-pc-board.png")
        page.screenshot(path=path)
        saved.append(path)

        # PC — 입력 바를 펼쳐 쓴 모습
        page.click("[data-quick-memo-open]")
        page.wait_for_timeout(350)
        page.fill("[data-quick-memo-title]", "12월 캠페인 아이디어")
        page.fill(
            "[data-quick-memo-body]",
            "- [ ] 협업 브랜드 후보 3곳 정리\n- [ ] 예산표 다시 계산\n- [x] 지난 캠페인 결과 캡처",
        )
        page.wait_for_timeout(400)
        path = os.path.join(OUT, "a51-archive-02-pc-quick-memo.png")
        page.screenshot(path=path)
        saved.append(path)
        page.click("[data-quick-memo-close]")
        page.wait_for_timeout(500)

        # PC — 별점 켜기 + 분류 색 패널
        page.click("[data-archive-rating-toggle]")
        page.wait_for_timeout(300)
        page.click("[data-archive-color-open]")
        page.wait_for_timeout(350)
        path = os.path.join(OUT, "a51-archive-03-pc-options.png")
        page.screenshot(path=path)
        saved.append(path)
        page.close()

        # 태블릿
        page = open_archive(820, 1180)
        path = os.path.join(OUT, "a51-archive-04-tablet.png")
        page.screenshot(path=path)
        saved.append(path)
        page.close()

        # 모바일
        page = open_archive(390, 844)
        path = os.path.join(OUT, "a51-archive-05-mobile.png")
        page.screenshot(path=path)
        saved.append(path)
        page.click("[data-quick-memo-open]")
        page.wait_for_timeout(400)
        path = os.path.join(OUT, "a51-archive-06-mobile-quick.png")
        page.screenshot(path=path)
        saved.append(path)
        page.close()

        browser.close()

    for item in saved:
        print(item)


if __name__ == "__main__":
    main()
