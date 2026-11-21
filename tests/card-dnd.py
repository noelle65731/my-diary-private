"""A21 검증 — 프로젝트 카드 사이로 할 일 끌어 옮기기

1) 카드 A 의 할 일을 카드 B 로 끌어 놓으면 화면에서 바로 옮겨지고(낙관적 업데이트),
   PATCH /api/notion/projects/{id} 본문에 대상 projectIds·분류가 실린다.
2) index(미분류) 카드로 끌어 놓으면 projectIds 가 빈 배열로 저장된다.
3) 드롭 대상 카드에 은은한 강조(ring)가 뜬다.
4) 같은 카드 안에서 놓으면 아무 요청도 보내지 않는다.
5) 저장이 실패하면 원래 카드로 되돌아온다.
6) 드래그 뒤에도 할 일 클릭(상세 열기)·완료 체크가 그대로 동작한다.
7) PC 1440×900 · 폰 402×874 에서 카드 배치가 깨지지 않는다.

    BASE=http://127.0.0.1:3221 OUT=/workspace/work/priority-shots python3 tests/card-dnd.py
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3221")
OUT = os.environ.get("OUT", "/workspace/work/priority-shots")
CHROME = os.environ.get("CHROME", "/workspace/.browsers/chromium/chromium")
os.makedirs(OUT, exist_ok=True)

STAMP = "2026-11-01T00:00:00.000Z"
TODAY = "2026-11-21"


def base(id, title, extra=None):
    d = {
        "id": id, "url": "", "title": title, "hidden": False, "trash": False, "favorite": False,
        "memo": "", "sort": None, "projectIds": [], "createdAt": STAMP, "updatedAt": STAMP,
    }
    d.update(extra or {})
    return d


def task(id, title, extra=None):
    d = base(id, title)
    d.update({
        "kind": "할 일", "category": "업무", "status": "미완료", "date": TODAY, "due": None,
        "doneAt": None, "checkedAt": None, "urgent": False, "important": False, "history": False,
        "waitFor": "", "waitNote": "", "cancelReason": "", "cancelAt": None, "repeatGroupId": "",
    })
    d.update(extra or {})
    return d


def fixture():
    projects = [
        task("pj-work", "브랜드 포트폴리오", {"kind": "프로젝트", "category": "업무"}),
        task("pj-home", "집 정리", {"kind": "프로젝트", "category": "개인"}),
        task("pj-study", "영어 회화", {"kind": "프로젝트", "category": "공부"}),
    ]
    tasks = [
        task("t-work-1", "업무 하나", {"projectIds": ["pj-work"], "sort": 10}),
        task("t-work-2", "업무 둘", {"projectIds": ["pj-work"], "sort": 20}),
        task("t-home-1", "옷장 정리", {"category": "개인", "projectIds": ["pj-home"], "sort": 10}),
        task("t-home-2", "냉장고 정리", {"category": "개인", "projectIds": ["pj-home"], "sort": 20}),
        task("t-study-1", "단어 30개", {"category": "공부", "projectIds": ["pj-study"], "sort": 10}),
        task("t-inbox-1", "분류 안 한 할 일", {"category": "업무"}),
    ]
    return {"calendar": [], "projects": projects + tasks, "routines": [], "binder": [], "archive": []}


PASSES, FAILS = [], []


def check(name, ok, detail=""):
    if ok:
        PASSES.append(name)
        print("PASS ", name)
    else:
        FAILS.append(f"{name} {detail}".strip())
        print("FAIL ", name, detail)


def mock_routes(page, data, patches, fail_patch=False):
    def handler(route, request):
        path = request.url.split("?")[0]
        method = request.method
        if method == "PATCH" and "/api/notion/projects/" in path:
            body = json.loads(request.post_data or "{}")
            patches.append({"url": request.url, "body": body})
            if fail_patch:
                return route.fulfill(status=500, json={"ok": False, "error": "저장하지 못했습니다(테스트)"})
            item_id = path.rstrip("/").split("/")[-1]
            item = next((i for i in data["projects"] if i["id"] == item_id), None)
            if item is None:
                return route.fulfill(status=404, json={"ok": False, "error": "없음"})
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


def open_page(browser, width, height, data, patches, mobile=False, fail_patch=False):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR",
                              device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    mock_routes(page, data, patches, fail_patch)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=40000)
    page.wait_for_timeout(1200)
    nav = page.locator("nav button", has_text="프로젝트").first
    nav.wait_for(state="attached")
    nav.evaluate("el => el.click()")
    page.wait_for_timeout(800)
    return ctx, page, errors


def shot(page, name):
    path = os.path.join(OUT, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print("shot", path)


def in_card(page, card, task_id):
    return page.locator(f'[data-project-card="{card}"] [data-task-id="{task_id}"]').count()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])

        # ---------- 1) PC: 카드 A → 카드 B ----------
        data = fixture()
        patches = []
        ctx, page, errors = open_page(browser, 1440, 900, data, patches)
        check("PC: 진행 카드 3개 + index", page.locator("[data-drop-card]").count() == 4,
              str(page.locator("[data-drop-card]").count()))
        check("시작: 옷장 정리는 집 정리 카드", in_card(page, "pj-home", "t-home-1") == 1)

        source = page.locator('[data-project-card="pj-home"] [data-task-id="t-home-1"]')
        target = page.locator('[data-drop-card="pj-work"]')
        source.drag_to(target)
        page.wait_for_timeout(900)

        check("드롭: 집 정리 카드에서 사라짐", in_card(page, "pj-home", "t-home-1") == 0)
        check("드롭: 브랜드 포트폴리오 카드에 생김", in_card(page, "pj-work", "t-home-1") == 1)
        check("드롭: PATCH 1건", len(patches) == 1, json.dumps(patches, ensure_ascii=False))
        if patches:
            body = patches[0]["body"]
            check("드롭: PATCH URL 이 그 할 일", patches[0]["url"].endswith("/api/notion/projects/t-home-1"), patches[0]["url"])
            check("드롭: projectIds=[pj-work]", body.get("projectIds") == ["pj-work"], json.dumps(body, ensure_ascii=False))
            check("드롭: 분류도 카드(업무)로", body.get("category") == "업무", json.dumps(body, ensure_ascii=False))
        check("드롭: 저장 후에도 카드에 남아 있음", in_card(page, "pj-work", "t-home-1") == 1)
        shot(page, "pc-card-dnd-moved")

        # ---------- 2) index(미분류)로 ----------
        patches.clear()
        page.locator('[data-project-card="pj-work"] [data-task-id="t-home-1"]').drag_to(page.locator('[data-drop-card="index"]'))
        page.wait_for_timeout(900)
        check("index: 프로젝트 카드에서 사라짐", in_card(page, "pj-work", "t-home-1") == 0)
        check("index: 미분류 카드에 생김", page.locator('[data-drop-card="index"] [data-task-id="t-home-1"]').count() == 1)
        check("index: PATCH 1건", len(patches) == 1, json.dumps(patches, ensure_ascii=False))
        if patches:
            body = patches[0]["body"]
            check("index: projectIds=[]", body.get("projectIds") == [], json.dumps(body, ensure_ascii=False))
            check("index: 분류는 건드리지 않음", "category" not in body, json.dumps(body, ensure_ascii=False))

        # ---------- 3) 같은 카드 안에 놓기 = 변화 없음 ----------
        patches.clear()
        page.locator('[data-project-card="pj-work"] [data-task-id="t-work-1"]').drag_to(page.locator('[data-project-card="pj-work"]'))
        page.wait_for_timeout(800)
        check("같은 카드: 요청 없음", len(patches) == 0, json.dumps(patches, ensure_ascii=False))
        check("같은 카드: 그대로 있음", in_card(page, "pj-work", "t-work-1") == 1)

        # ---------- 4) 강조 표시 ----------
        ring = page.evaluate("""() => {
          const card = document.querySelector('[data-project-card="pj-study"]');
          const dt = new DataTransfer();
          dt.setData('text/diary-task', 't-work-2');
          card.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
          card.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
          return new Promise((resolve) => setTimeout(() => resolve(card.className), 120));
        }""")
        check("강조: 드롭 대상 카드에 ring", "ring-2" in ring and "ring-ink-200" in ring, ring)
        page.evaluate("""() => {
          const card = document.querySelector('[data-project-card="pj-study"]');
          const dt = new DataTransfer();
          dt.setData('text/diary-task', 't-work-2');
          card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        }""")
        page.wait_for_timeout(200)
        ring_after = page.locator('[data-project-card="pj-study"]').get_attribute("class")
        check("강조: dragend 뒤 해제", "ring-2" not in ring_after, ring_after)

        # ---------- 5) 드래그 뒤 클릭·체크 정상 ----------
        page.locator('[data-project-card="pj-work"] [data-task-id="t-work-2"] button[aria-label="완료"]').click()
        page.wait_for_timeout(700)
        patches.clear()
        page.locator('[data-project-card="pj-study"] [data-task-id="t-study-1"] button').last.click()
        page.wait_for_timeout(900)
        opened = page.locator('[role=\"dialog\"]').count()
        check("클릭: 할 일 상세가 열림", opened >= 1, str(opened))
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        check("콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:3]))
        shot(page, "pc-card-dnd-after-click")
        ctx.close()

        # ---------- 6) 저장 실패 → 원래 카드로 ----------
        data = fixture()
        patches = []
        ctx, page, errors = open_page(browser, 1440, 900, data, patches, fail_patch=True)
        page.locator('[data-project-card="pj-home"] [data-task-id="t-home-1"]').drag_to(page.locator('[data-drop-card="pj-study"]'))
        page.wait_for_timeout(1500)
        check("실패: PATCH 는 갔음", len(patches) == 1, str(len(patches)))
        check("실패: 원래 카드로 되돌아옴", in_card(page, "pj-home", "t-home-1") == 1)
        check("실패: 옮겨 간 카드에 없음", in_card(page, "pj-study", "t-home-1") == 0)
        shot(page, "pc-card-dnd-failed-rollback")
        ctx.close()

        # ---------- 7) 폰 402×874 ----------
        data = fixture()
        patches = []
        ctx, page, errors = open_page(browser, 402, 874, data, patches, mobile=True)
        overflow = page.evaluate("() => ({doc: document.documentElement.scrollWidth, win: window.innerWidth})")
        check("폰: 가로 넘침 없음", overflow["doc"] <= overflow["win"] + 1, json.dumps(overflow))
        page.locator('[data-project-card="pj-home"] [data-task-id="t-home-1"]').drag_to(page.locator('[data-drop-card="pj-work"]'))
        page.wait_for_timeout(900)
        check("폰: 카드 사이 이동 동작", in_card(page, "pj-work", "t-home-1") == 1, str(in_card(page, "pj-work", "t-home-1")))
        check("폰: PATCH projectIds", bool(patches) and patches[-1]["body"].get("projectIds") == ["pj-work"],
              json.dumps(patches[-1]["body"], ensure_ascii=False) if patches else "없음")
        shot(page, "mobile-402-card-dnd")
        check("폰: 콘솔 에러 없음", len(errors) == 0, " | ".join(errors[:3]))
        ctx.close()

        browser.close()

    print(f"\n{len(PASSES)} passed, {len(FAILS)} failed")
    if FAILS:
        for f in FAILS:
            print(" -", f)
        sys.exit(1)


main()
