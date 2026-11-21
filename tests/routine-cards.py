"""A23 검증 — 프로젝트 탭 루틴 카드: 전체 통합 + 3개씩 자동 채움

1) 루틴 8개 → 카드 3장(3 + 3 + 2)으로 나뉘고 여덟 개가 모두 보인다(4번째부터 잘리지 않음)
2) 카드 부제목 `1~3 · 8개` / `4~6 · 8개` / `7~8 · 8개`, 한 장뿐이면 `전체 · N개`
3) 각 루틴 행에 분류 배지(개인·업무·공부)
4) 분류 필터(업무)를 켜면 그 분류 루틴만 한 카드로
5) 카드 사이 드래그로 순서 변경 → 전체 목록 기준 sort 저장
6) PC 1440×900 · 폰 402×874 레이아웃

    BASE=http://127.0.0.1:3222 OUT=/workspace/work/priority-shots python3 tests/routine-cards.py
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3222")
OUT = os.environ.get("OUT", "/workspace/work/priority-shots")
CHROME = os.environ.get("CHROME", "/workspace/.browsers/chromium/chromium")
os.makedirs(OUT, exist_ok=True)
STAMP = "2026-11-01T00:00:00.000Z"


def base(id, title, extra=None):
    d = {"id": id, "url": "", "title": title, "hidden": False, "trash": False, "favorite": False,
         "memo": "", "sort": None, "projectIds": [], "createdAt": STAMP, "updatedAt": STAMP}
    d.update(extra or {})
    return d


def routine(id, title, category, sort):
    d = base(id, title, {"kind": "루틴", "category": category, "date": None,
                         "repeatDays": ["월", "화", "수", "목", "금", "토", "일"], "targetCount": 1,
                         "execCount": 0, "amount": 1, "unit": "회", "history": False,
                         "routineIds": [], "sort": sort,
                         "createdAt": f"2026-11-01T00:00:0{(sort // 10)}.000Z"})
    return d


def fixture():
    routines = [
        routine("rt-1", "물 마시기", "개인", 10),
        routine("rt-2", "영어 단어", "공부", 20),
        routine("rt-3", "주간 보고", "업무", 30),
        routine("rt-4", "스트레칭", "개인", 40),
        routine("rt-5", "독서 30분", "공부", 50),
        routine("rt-6", "메일 정리", "업무", 60),
        routine("rt-7", "산책", "개인", 70),
        routine("rt-8", "회의 준비", "업무", 80),
    ]
    return {"calendar": [], "projects": [], "routines": routines, "binder": [], "archive": []}


PASSES, FAILS = [], []


def check(name, ok, detail=""):
    if ok:
        PASSES.append(name)
        print("PASS ", name)
    else:
        FAILS.append(f"{name} {detail}".strip())
        print("FAIL ", name, detail)


def mock_routes(page, data, patches):
    def handler(route, request):
        path = request.url.split("?")[0]
        if request.method == "PATCH" and "/api/notion/routines/" in path:
            body = json.loads(request.post_data or "{}")
            patches.append({"url": request.url, "body": body})
            item_id = path.rstrip("/").split("/")[-1]
            item = next((i for i in data["routines"] if i["id"] == item_id), None)
            if item is not None:
                for key, value in body.items():
                    if key != "expectedUpdatedAt":
                        item[key] = value
                item["updatedAt"] = "2026-11-21T00:00:00.000Z"
            return route.fulfill(json={"ok": True, "data": item})
        if path.endswith("/api/status"):
            return route.fulfill(json={"ok": True, "needsToken": False, "authRequired": False,
                                       "authenticated": True, "dbs": {}})
        if path.endswith("/api/notion/all"):
            return route.fulfill(json={"ok": True, "data": data, "errors": {}})
        if path.endswith("/schema"):
            return route.fulfill(json={"ok": True, "data": []})
        if path.endswith("/blocks"):
            return route.fulfill(json={"ok": True, "data": {"text": "", "preserved": []}})
        return route.fulfill(json={"ok": True, "data": []})
    page.route("**/api/**", handler)


def open_page(browser, width, height, data, patches, mobile=False):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR",
                              device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    mock_routes(page, data, patches)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=40000)
    page.wait_for_timeout(1200)
    page.locator("nav button", has_text="프로젝트").first.evaluate("el => el.click()")
    page.wait_for_timeout(800)
    return ctx, page, errors


def row_ids(page):
    return page.eval_on_selector_all("[data-routine-row]", "els => els.map(e => e.dataset.routineRow)")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

        # ---------- 1) PC ----------
        data = fixture()
        patches = []
        ctx, page, errors = open_page(browser, 1440, 900, data, patches)
        cards = page.locator("[data-routine-card]")
        check("PC: 루틴 카드 3장", cards.count() == 3, str(cards.count()))
        ids = row_ids(page)
        check("PC: 루틴 8개 모두 보임", ids == ["rt-1", "rt-2", "rt-3", "rt-4", "rt-5", "rt-6", "rt-7", "rt-8"], json.dumps(ids))
        ranges = page.locator("[data-routine-card-range]").all_inner_texts()
        check("PC: 부제목 1~3·4~6·7~8", ranges == ["1~3 · 8개", "4~6 · 8개", "7~8 · 8개"], json.dumps(ranges, ensure_ascii=False))
        badges = page.locator("[data-routine-category]").all_inner_texts()
        check("PC: 분류 배지 8개", badges == ["개인", "공부", "업무", "개인", "공부", "업무", "개인", "업무"],
              json.dumps(badges, ensure_ascii=False))
        check("PC: 첫 카드에 3개, 셋째 카드에 2개",
              page.locator('[data-routine-card="0"] [data-routine-row]').count() == 3
              and page.locator('[data-routine-card="2"] [data-routine-row]').count() == 2)
        page.screenshot(path=os.path.join(OUT, "pc-routine-chunks.png"), full_page=True)
        print("shot", os.path.join(OUT, "pc-routine-chunks.png"))

        # 분류 필터
        page.get_by_role("button", name="업무", exact=True).first.evaluate("el => el.click()")
        page.wait_for_timeout(700)
        check("PC 필터 업무: 카드 1장", page.locator("[data-routine-card]").count() == 1, str(page.locator("[data-routine-card]").count()))
        check("PC 필터 업무: 루틴 3개", row_ids(page) == ["rt-3", "rt-6", "rt-8"], json.dumps(row_ids(page)))
        check("PC 필터 업무: 부제목 전체 · 3개",
              page.locator("[data-routine-card-range]").inner_text().strip() == "전체 · 3개",
              page.locator("[data-routine-card-range]").inner_text())
        page.get_by_role("button", name="전체", exact=True).first.evaluate("el => el.click()")
        page.wait_for_timeout(700)

        # 카드 사이 드래그: 4번째(rt-4) → 1번째(rt-1) 위
        patches.clear()
        page.locator('[data-routine-row="rt-4"]').drag_to(page.locator('[data-routine-row="rt-1"]'))
        page.wait_for_timeout(1200)
        after = row_ids(page)
        check("드래그: rt-4 가 맨 앞", after[:3] == ["rt-4", "rt-1", "rt-2"], json.dumps(after))
        check("드래그: 8개 유지", len(after) == 8, str(len(after)))
        sorts = {p["url"].rstrip("/").split("/")[-1]: p["body"].get("sort") for p in patches}
        check("드래그: sort 저장 요청", len(patches) >= 3, json.dumps(sorts, ensure_ascii=False))
        check("드래그: rt-4 sort=10", sorts.get("rt-4") == 10, json.dumps(sorts))
        check("드래그: rt-1 sort=20", sorts.get("rt-1") == 20, json.dumps(sorts))
        page.screenshot(path=os.path.join(OUT, "pc-routine-chunks-reordered.png"), full_page=True)
        check("PC: 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:3]))
        ctx.close()

        # ---------- 2) 폰 ----------
        data = fixture()
        patches = []
        ctx, page, errors = open_page(browser, 402, 874, data, patches, mobile=True)
        check("폰: 루틴 8개 모두 보임", len(row_ids(page)) == 8, str(len(row_ids(page))))
        check("폰: 카드 3장", page.locator("[data-routine-card]").count() == 3, str(page.locator("[data-routine-card]").count()))
        overflow = page.evaluate("() => ({doc: document.documentElement.scrollWidth, win: window.innerWidth})")
        check("폰: 가로 넘침 없음", overflow["doc"] <= overflow["win"] + 1, json.dumps(overflow))
        page.screenshot(path=os.path.join(OUT, "mobile-402-routine-chunks.png"), full_page=True)
        print("shot", os.path.join(OUT, "mobile-402-routine-chunks.png"))
        check("폰: 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:3]))
        ctx.close()

        browser.close()

    print(f"\n{len(PASSES)} passed, {len(FAILS)} failed")
    if FAILS:
        for f in FAILS:
            print(" -", f)
        sys.exit(1)


main()
