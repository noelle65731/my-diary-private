"""A51 — 아카이브 구글 킵 스타일 개편 확인 (PC 1440×900 / 태블릿 820×1180 / 모바일 390×844).

확인하는 것
  1) 벽돌형(메이슨리) 배치: 화면 폭에 따라 2·3·5열, 카드가 겹치지 않고, 첫 줄이 최신순으로
     왼쪽→오른쪽에 놓임(최신 메모가 왼쪽 아래로만 밀리지 않음)
  2) 제목 유무·길이에 따른 글자 크기 차이와 본문 접힘(…)
  3) 대표 사진 한 장이 카드 위에 깔리고 카드 높이가 상한을 넘지 않음
  4) 분류 알약이 카드 아래에 있고 알약마다 색이 다르며, 옆에 수정 일시가 붙음
  5) 고정핀이 오른쪽 위 모서리에 있고, 고정한 메모는 `고정됨` 구역에 모임
  6) 별점은 기본으로 숨김 → 위 `별점` 단추로 켜면 보임
  7) 하단 한 줄 입력: 펼치기 → 입력 → 바깥 클릭하면 자동 저장(빈 내용은 저장 안 함)
  8) 카드 안 체크리스트 바로 체크 / 링크 메모 한 번에 열기 / 할 일·일정으로 보내기
  9) 콘솔 오류 0건, 가로 넘침 없음

모의(mock) 데이터: Notion 이 연결되지 않았을 때의 예시 기록(`demo-data`)으로 확인합니다.
"""
import json
import os
import struct
import sys
import zlib

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3231")
OUT = os.environ.get("OUT", "/workspace/downloads")
CHROME = os.environ.get("CHROME", "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell")
LIBS = os.environ.get("LIBS", "/workspace/.tools/chrome-libs")
PREFIX = os.environ.get("SHOT_PREFIX", "a51-archive")
os.makedirs(OUT, exist_ok=True)

fails, notes = [], []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        fails.append(name)


def png_bytes(width=640, height=420, rgb=(168, 140, 170)):
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


POSITIONS = """() => {
  const section = document.querySelector('[data-archive-main-section]');
  const grid = section ? section.querySelector('[data-masonry]') : document.querySelector('[data-masonry]');
  const items = [...(section || document).querySelectorAll('[data-masonry-item]')].map((node) => {
    const r = node.getBoundingClientRect();
    return {
      id: node.getAttribute('data-masonry-item'),
      col: Number(node.getAttribute('data-masonry-column')),
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
    };
  });
  return {
    columns: grid ? Number(grid.getAttribute('data-masonry-columns')) : 0,
    gridWidth: grid ? Math.round(grid.getBoundingClientRect().width) : 0,
    gridHeight: grid ? Math.round(grid.getBoundingClientRect().height) : 0,
    items,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}"""


def open_archive(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-app-ready], nav", timeout=30000)
    page.wait_for_timeout(900)
    page.get_by_role("button", name="아카이브", exact=False).first.click()
    page.wait_for_timeout(900)
    page.wait_for_selector("[data-archive-card]", timeout=20000)
    page.wait_for_timeout(500)


def overlaps(items):
    bad = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = items[i], items[j]
            if a["x"] < b["x"] + b["w"] - 2 and b["x"] < a["x"] + a["w"] - 2 and a["y"] < b["y"] + b["h"] - 2 and b["y"] < a["y"] + a["h"] - 2:
                bad.append((a["id"], b["id"]))
    return bad


def main():
    shots = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"], env={**os.environ, "LD_LIBRARY_PATH": LIBS})

        def page_at(w, h, label):
            page = browser.new_page(viewport={"width": w, "height": h})
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            open_archive(page)
            return page, errors, label

        # ── PC ──
        page, errors, _ = page_at(1440, 900, "pc")
        info = page.evaluate(POSITIONS)
        print("pc", json.dumps({k: info[k] for k in ("columns", "gridWidth", "gridHeight", "overflowX")}))
        print("pc-items", json.dumps(info["items"][:8], ensure_ascii=False))
        check("PC: 5열", info["columns"] == 5, str(info["columns"]))
        check("PC: 카드 겹침 없음", not overlaps(info["items"]), str(overlaps(info["items"])[:3]))
        top_row = [item for item in info["items"] if item["y"] <= info["items"][0]["y"] + 2]
        check("PC: 첫 줄이 최신순 왼→오 (5장)", len(top_row) == 5, str([i["id"] for i in top_row]))
        check("PC: 첫 줄 x가 왼쪽부터 커짐", all(top_row[i]["x"] < top_row[i + 1]["x"] for i in range(len(top_row) - 1)))
        check("PC: 모든 열 사용", len({item["col"] for item in info["items"]}) == info["columns"])
        check("PC: 가로 넘침 없음", info["overflowX"] <= 1, str(info["overflowX"]))

        # 카드별 글자 크기·줄 수 (제목 없음 vs 있음)
        typo = page.evaluate(
            """() => [...document.querySelectorAll('[data-archive-main-section] [data-archive-card], [data-archive-pinned-section] [data-archive-card]')].map((card) => {
                 const body = card.querySelector('[data-archive-body]');
                 const first = body ? body.querySelector('p,span') : null;
                 return {
                   id: card.getAttribute('data-archive-card'),
                   size: first ? parseFloat(getComputedStyle(first).fontSize) : null,
                   bold: first ? Number(getComputedStyle(first).fontWeight) >= 600 : null,
                   maxH: body ? Math.round(body.getBoundingClientRect().height) : 0,
                   whole: Math.round(card.getBoundingClientRect().height),
                 };
               })"""
        )
        print("typo", json.dumps(typo, ensure_ascii=False))
        check("카드 높이 상한(460px) 이내", all(t["whole"] <= 460 for t in typo), str(max(t["whole"] for t in typo)))
        short_no_title = next((t for t in typo if t["id"] == "demo-ar-5"), None)
        long_with_title = next((t for t in typo if t["id"] == "demo-ar-6"), None)
        check("제목 없는 짧은 메모: 큼직한 글자(19px 이상)", short_no_title and short_no_title["size"] >= 19, json.dumps(short_no_title, ensure_ascii=False))
        check("제목 없는 메모: 볼드 아님", short_no_title and short_no_title["bold"] is False, json.dumps(short_no_title, ensure_ascii=False))
        check("긴 글: 글자 작아짐(15px 이하)", long_with_title and long_with_title["size"] <= 15, json.dumps(long_with_title, ensure_ascii=False))
        check("긴 글: 본문 접힘(… 표시)", page.locator("[data-archive-card='demo-ar-6']").locator("text=…").count() > 0)

        # 사진 카드
        photo = page.evaluate(
            """() => { const card = document.querySelector("[data-archive-card='demo-ar-8']");
                 const img = card?.querySelector('img');
                 return img ? { h: Math.round(img.getBoundingClientRect().height), w: Math.round(img.getBoundingClientRect().width),
                                cardW: Math.round(card.getBoundingClientRect().width), fit: getComputedStyle(img).objectFit } : null; }"""
        )
        check("사진 카드: 대표 사진이 카드 폭만큼", photo and abs(photo["w"] - photo["cardW"]) <= 4, json.dumps(photo, ensure_ascii=False))
        check("사진 카드: 높이 잘라 표시(90~170px)", photo and 90 <= photo["h"] <= 170 and photo["fit"] == "cover", json.dumps(photo, ensure_ascii=False))

        # 분류 알약 + 수정 일시
        pills = page.evaluate(
            """() => [...document.querySelectorAll('[data-archive-kind-pill]')].map((el) => ({
                 kind: el.getAttribute('data-archive-kind-pill'),
                 bg: getComputedStyle(el).backgroundColor,
                 text: el.textContent.trim(),
                 nearBottom: (() => { const card = el.closest('[data-archive-card]'); if (!card) return null;
                   const a = el.getBoundingClientRect(), b = card.getBoundingClientRect();
                   return Math.round(b.bottom - a.bottom); })(),
               }))"""
        )
        colors = {p["kind"]: p["bg"] for p in pills}
        print("pills", json.dumps(pills, ensure_ascii=False))
        check("분류 알약: 카드마다 있음", len(pills) >= 6, str(len(pills)))
        check("분류 알약: 종류별 색이 다름", len(set(colors.values())) == len(colors) and len(colors) >= 4, json.dumps(colors, ensure_ascii=False))
        check("분류 알약: 카드 아래쪽(아래에서 40px 이내)", all(p["nearBottom"] is not None and p["nearBottom"] <= 40 for p in pills))
        check("수정 일시 표기", page.locator("[data-archive-card] >> text=/오늘|어제|요일|\\d+\\. \\d+\\./").count() > 0)

        # 고정핀 위치 · 고정됨 구역
        pin = page.evaluate(
            """() => { const btn = document.querySelector("[data-archive-row-pin]");
                 const card = btn?.closest('[data-archive-card]');
                 if (!btn || !card) return null;
                 const a = btn.getBoundingClientRect(), b = card.getBoundingClientRect();
                 return { right: Math.round(b.right - a.right), top: Math.round(a.top - b.top), visible: getComputedStyle(btn).opacity }; }"""
        )
        check("고정핀: 오른쪽 위 모서리(오른쪽·위 16px 이내)", pin and pin["right"] <= 16 and pin["top"] <= 16, json.dumps(pin))
        check("고정됨 구역 있음", page.locator("[data-archive-pinned-section]").count() == 1)
        check("고정됨 구역에 고정 메모", page.locator("[data-archive-pinned-section] [data-archive-card]").count() >= 1)

        # 별점 기본 숨김 → 켜기
        check("별점 기본 숨김", page.locator("[data-archive-card] svg[data-star], [data-archive-card] [data-star-rating]").count() == 0)
        page.click("[data-archive-rating-toggle]")
        page.wait_for_timeout(400)
        stars_on = page.locator("[data-archive-card] [data-star-rating]").count()
        check("별점 켜면 보임", stars_on > 0, str(stars_on))
        page.click("[data-archive-rating-toggle]")
        page.wait_for_timeout(300)

        # 분류 칩 필터
        page.click("[data-archive-kind='책']")
        page.wait_for_timeout(400)
        only_books = page.evaluate("() => [...document.querySelectorAll('[data-archive-card]')].length")
        check("분류 칩: 책만 남음", only_books == 1, str(only_books))
        page.click("[data-archive-kind='전체']")
        page.wait_for_timeout(400)

        # 체크리스트 바로 체크
        todo_count = page.locator("[data-archive-card='demo-ar-7'] [data-archive-todo]").count()
        check("체크리스트 항목 4개가 모두 보임(잘리지 않음)", todo_count == 4, str(todo_count))
        check("체크리스트 메모에는 말줄임이 붙지 않음", page.locator("[data-archive-card='demo-ar-7'] [data-archive-more]").count() == 0)
        before = page.evaluate(
            "() => { const b = document.querySelector(\"[data-archive-card='demo-ar-7'] [data-archive-todo='0']\"); return b ? b.getAttribute('aria-pressed') : null; }"
        )
        page.click("[data-archive-card='demo-ar-7'] [data-archive-todo='0']")
        page.wait_for_timeout(600)
        after = page.evaluate(
            "() => { const b = document.querySelector(\"[data-archive-card='demo-ar-7'] [data-archive-todo='0']\"); return b ? b.getAttribute('aria-pressed') : null; }"
        )
        check("카드 체크리스트 바로 체크", before == "false" and after == "true", f"{before} → {after}")

        # 링크 바
        link = page.evaluate(
            """() => { const a = document.querySelector("[data-archive-card='demo-ar-8'] a[href]");
                 return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent.trim() } : null; }"""
        )
        check("링크 메모: 카드에 링크 바", link and link["href"].startswith("http") and link["target"] == "_blank" and "behance" in link["text"], json.dumps(link, ensure_ascii=False))

        # 할 일·일정으로 보내기 (카드 메뉴)
        page.hover("[data-archive-card='demo-ar-4']")
        page.click("[data-archive-card-menu='demo-ar-4']")
        page.wait_for_timeout(300)
        check("카드 메뉴: 할 일로 보내기 있음", page.locator("[data-archive-card='demo-ar-4'] >> text=할 일로 보내기").count() > 0)
        page.locator("[data-archive-card='demo-ar-4'] >> text=할 일로 보내기").first.click()
        page.wait_for_timeout(700)
        toast = page.locator("[data-toast]").all_inner_texts()
        check("할 일로 보냄 토스트", any("할 일로 보냈습니다" in t for t in toast), json.dumps(toast, ensure_ascii=False))

        # 한 줄 목록형 ↔ 카드형
        page.click("[data-archive-view='list']")
        page.wait_for_timeout(600)
        rows = page.locator("[data-archive-row]").count()
        check("목록형: 한 줄 행으로 보임", rows >= 7, str(rows))
        check("목록형: 벽돌 배치 사라짐", page.locator("[data-masonry]").count() == 0)
        page.click("[data-archive-view='card']")
        page.wait_for_timeout(600)
        check("카드형 복귀", page.locator("[data-masonry]").count() >= 1)

        # 상세 화면에서 할 일·일정으로 보내기
        page.locator("[data-archive-card='demo-ar-3'] >> text=패스트 라이브즈").first.click()
        page.wait_for_timeout(700)
        check("상세: 할 일·일정 보내기 단추 있음", page.locator("[data-archive-send-task]").count() == 1 and page.locator("[data-archive-send-event]").count() == 1)
        page.click("[data-archive-send-task]")
        page.wait_for_timeout(700)
        detail_toast = page.locator("[data-toast]").all_inner_texts()
        check("상세: 할 일로 보냄", any("할 일로 보냈습니다" in t for t in detail_toast), json.dumps(detail_toast[-2:], ensure_ascii=False))
        page.click("[data-detail-close]")
        page.wait_for_timeout(600)

        page.screenshot(path=os.path.join(OUT, f"{PREFIX}-pc-1440.png"), full_page=False)
        shots.append(os.path.join(OUT, f"{PREFIX}-pc-1440.png"))

        # ── 하단 한 줄 입력: 펼치기 → 입력 → 바깥 클릭 자동 저장 ──
        cards_before = page.locator("[data-archive-card]").count()
        page.click("[data-quick-memo-open]")
        page.wait_for_timeout(350)
        check("입력 바: 누르면 펼쳐짐", page.locator("[data-quick-memo-title]").is_visible() and page.locator("[data-quick-memo-body]").is_visible())
        page.fill("[data-quick-memo-title]", "A51 자동 저장 확인")
        page.fill("[data-quick-memo-body]", "바깥을 누르면 저장되는지 보는 메모")
        page.click("h1")
        page.wait_for_timeout(900)
        cards_after = page.locator("[data-archive-card]").count()
        check("입력 바: 바깥 클릭하면 자동 저장", cards_after == cards_before + 1, f"{cards_before} → {cards_after}")
        check("입력 바: 저장 뒤 다시 한 줄", page.locator("[data-quick-memo-title]").count() == 0)
        top_id = page.evaluate("() => document.querySelector('[data-archive-main-section] [data-archive-card]')?.getAttribute('data-archive-card')")
        first_title = page.evaluate("() => document.querySelector('[data-archive-main-section] [data-archive-card]')?.innerText || ''")
        check("새 메모가 목록 맨 앞(왼쪽 위)", "A51 자동 저장 확인" in first_title, first_title.split("\n")[0])

        # 빈 내용은 저장하지 않음
        cards_before = page.locator("[data-archive-card]").count()
        page.click("[data-quick-memo-open]")
        page.wait_for_timeout(300)
        page.click("h1")
        page.wait_for_timeout(600)
        check("입력 바: 빈 내용은 저장 안 함", page.locator("[data-archive-card]").count() == cards_before)

        # 체크리스트 퀵 버튼
        page.click("[data-quick-memo-checklist]")
        page.wait_for_timeout(300)
        body_value = page.input_value("[data-quick-memo-body]")
        check("입력 바: 체크리스트 단추가 `- [ ] ` 로 시작", body_value.startswith("- [ ]"), body_value)
        page.click("[data-quick-memo-close]")
        page.wait_for_timeout(500)

        # 사진 첨부 (모바일 사진 아이콘과 같은 파일 선택 경로)
        page.click("[data-quick-memo-open]")
        page.wait_for_timeout(200)
        page.set_input_files("input[type=file]", files=[{"name": "shot.png", "mimeType": "image/png", "buffer": png_bytes()}])
        page.wait_for_timeout(900)
        thumbs = page.locator("[data-quick-memo] img").count()
        check("입력 바: 사진 첨부되면 미리보기", thumbs >= 1, str(thumbs))
        page.fill("[data-quick-memo-title]", "사진 붙은 메모")
        page.click("[data-quick-memo-save]")
        page.wait_for_timeout(1200)
        photo_cards = page.evaluate(
            """() => [...document.querySelectorAll('[data-archive-card]')].filter((c) => c.querySelector('img')).length"""
        )
        check("사진 붙인 메모가 카드로 담김(사진 포함)", photo_cards >= 2, str(photo_cards))
        page.screenshot(path=os.path.join(OUT, f"{PREFIX}-pc-quick.png"), full_page=False)
        shots.append(os.path.join(OUT, f"{PREFIX}-pc-quick.png"))

        # 드래그 앤 드롭 (합성 이벤트)
        dropped = page.evaluate(
            """async (bytes) => {
                 const bytesArray = new Uint8Array(bytes);
                 const file = new File([bytesArray], 'drop.png', { type: 'image/png' });
                 const dt = new DataTransfer();
                 dt.items.add(file);
                 const target = document.querySelector('[data-quick-memo]');
                 const before = document.querySelectorAll('[data-quick-memo] img').length;
                 target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
                 target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
                 await new Promise((r) => setTimeout(r, 1200));
                 return { before, after: document.querySelectorAll('[data-quick-memo] img').length,
                          open: !!document.querySelector('[data-quick-memo-title]') };
               }""",
            list(png_bytes(120, 90)),
        )
        notes.append(("드래그앤드롭(합성)", dropped))
        check("입력 바: 끌어다 놓기로 사진 첨부", dropped["after"] > dropped["before"] or dropped["open"], json.dumps(dropped))
        # 남은 사진 비우기
        page.evaluate("() => document.querySelectorAll('[data-quick-memo] button[aria-label=\\'사진 빼기\\']').forEach((b) => b.click())")
        page.click("[data-quick-memo-close]")
        page.wait_for_timeout(600)

        # Ctrl+V 붙여넣기 (합성 paste 이벤트)
        pasted = page.evaluate(
            """async (bytes) => {
                 const file = new File([new Uint8Array(bytes)], 'paste.png', { type: 'image/png' });
                 const dt = new DataTransfer();
                 dt.items.add(file);
                 const before = document.querySelectorAll('[data-quick-memo] img').length;
                 window.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
                 await new Promise((r) => setTimeout(r, 1400));
                 return { before, after: document.querySelectorAll('[data-quick-memo] img').length,
                          open: !!document.querySelector('[data-quick-memo-title]') };
               }""",
            list(png_bytes(96, 72)),
        )
        notes.append(("붙여넣기(합성)", pasted))
        check("입력 바: 붙여넣기(Ctrl+V)로 사진 첨부", pasted["after"] > pasted["before"], json.dumps(pasted))
        page.evaluate("() => document.querySelectorAll('[data-quick-memo] button[aria-label=\\'사진 빼기\\']').forEach((b) => b.click())")
        page.click("[data-quick-memo-close]")
        page.wait_for_timeout(500)

        pc_errors = [e for e in errors if "favicon" not in e]
        check("PC: 콘솔 오류 0건", len(pc_errors) == 0, json.dumps(pc_errors[:3], ensure_ascii=False))
        page.close()

        # ── 태블릿 ──
        page, errors, _ = page_at(820, 1180, "tablet")
        info = page.evaluate(POSITIONS)
        print("tablet", json.dumps({k: info[k] for k in ("columns", "gridWidth", "gridHeight", "overflowX")}))
        check("태블릿: 3~4열", 3 <= info["columns"] <= 4, str(info["columns"]))
        check("태블릿: 겹침 없음", not overlaps(info["items"]))
        check("태블릿: 가로 넘침 없음", info["overflowX"] <= 1, str(info["overflowX"]))
        page.screenshot(path=os.path.join(OUT, f"{PREFIX}-tablet-820.png"))
        shots.append(os.path.join(OUT, f"{PREFIX}-tablet-820.png"))
        check("태블릿: 콘솔 오류 0건", len([e for e in errors if "favicon" not in e]) == 0, json.dumps(errors[:2], ensure_ascii=False))
        page.close()

        # ── 모바일 ──
        page, errors, _ = page_at(390, 844, "mobile")
        info = page.evaluate(POSITIONS)
        print("mobile", json.dumps({k: info[k] for k in ("columns", "gridWidth", "gridHeight", "overflowX")}))
        check("모바일: 2열", info["columns"] == 2, str(info["columns"]))
        check("모바일: 겹침 없음", not overlaps(info["items"]))
        check("모바일: 가로 넘침 없음", info["overflowX"] <= 1, str(info["overflowX"]))
        bar = page.evaluate(
            """() => { const el = document.querySelector('[data-quick-memo]'); const nav = document.querySelector('nav');
                 if (!el) return null;
                 const a = el.getBoundingClientRect();
                 return { h: Math.round(a.height), aboveNav: nav ? Math.round(nav.getBoundingClientRect().top - a.bottom) : null,
                          inView: a.left >= 0 && a.right <= window.innerWidth }; }"""
        )
        check("모바일: 입력 바가 한 줄(높이 60px 이하)로 하단 탭 위에", bar and bar["h"] <= 60 and (bar["aboveNav"] or 0) >= 0 and bar["inView"], json.dumps(bar))
        page.get_by_role("button", name="아카이브", exact=False).first.click()
        page.wait_for_timeout(300)
        page.click("[data-quick-memo-open]")
        page.wait_for_timeout(400)
        shell = page.evaluate("() => ({ h: Math.round(document.querySelector('[data-quick-memo]').getBoundingClientRect().height), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth })")
        check("모바일: 펼친 입력 바가 화면 폭 안", shell["overflowX"] <= 1, json.dumps(shell))
        page.screenshot(path=os.path.join(OUT, f"{PREFIX}-mobile-390.png"))
        shots.append(os.path.join(OUT, f"{PREFIX}-mobile-390.png"))
        page.click("[data-quick-memo-close]")
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(OUT, f"{PREFIX}-mobile-list.png"))
        shots.append(os.path.join(OUT, f"{PREFIX}-mobile-list.png"))
        check("모바일: 콘솔 오류 0건", len([e for e in errors if "favicon" not in e]) == 0, json.dumps(errors[:2], ensure_ascii=False))

        browser.close()

    print("\nshots: " + json.dumps(shots, ensure_ascii=False))
    print(json.dumps({"fails": fails, "notes": notes}, ensure_ascii=False))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
