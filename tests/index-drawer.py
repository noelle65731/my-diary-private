"""A38 검증 — index 카드 상세 서랍(지난 할 일 목록)

프로젝트 카드처럼 index 카드를 눌러도 서랍이 열리고, 그 안에서
- index(분류 없는) 할 일만 보이고 프로젝트 할 일은 섞이지 않는지
- 전체 / 진행 / 완료 필터로 지난(완료한) 할 일까지 볼 수 있는지
- 서랍에서 새 할 일을 담으면 projectIds: [] 로 index 에 들어가는지
- 완료 체크·할 일 상세 열기·닫기(버튼·Esc·브라우저 뒤로)가 되는지
- 카드 안 체크박스·할 일 이름·최근 기록·+ 할 일 입력은 카드를 열지 않는지
- 프로젝트 카드 서랍은 예전 그대로인지
- PC 1440×900 · 폰 402×874 모두에서 가로 넘침이 없는지

    NEXT_DIST_DIR=.next-a38 PORT=3238 tests/run-with-server.sh tests/index-drawer.py
    # (직접) BASE=http://127.0.0.1:3238 OUT=/workspace/work/wt-a38-shots python3 tests/index-drawer.py
"""
import copy
import json
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3238")
OUT = os.environ.get("OUT", "/workspace/work/wt-a38-shots")
CHROME = os.environ.get("CHROME", "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell")
LIBS = os.environ.get("CHROME_LIBS", "/workspace/.tools/chrome-libs")
os.makedirs(OUT, exist_ok=True)
STAMP = "2026-11-01T00:00:00.000Z"

POSTS, PATCHES = [], []


def base_item(id_, title, extra=None):
    d = {"id": id_, "url": "", "title": title, "hidden": False, "trash": False, "favorite": False,
         "memo": "", "sort": None, "projectIds": [], "createdAt": STAMP, "updatedAt": STAMP}
    d.update(extra or {})
    return d


def task(id_, title, extra=None):
    d = base_item(id_, title)
    d.update({"kind": "할 일", "category": "개인", "status": "미완료", "date": None, "due": None,
              "startTime": None, "endTime": None, "doneAt": None, "checkedAt": None,
              "urgent": False, "important": False, "history": False, "waitFor": "", "waitNote": "",
              "cancelReason": "", "cancelAt": None, "repeatGroupId": "", "memoRich": None})
    d.update(extra or {})
    return d


def fixture():
    projects = [
        task("pj-1", "온담 프로젝트", {"kind": "프로젝트", "category": "개인", "status": "미완료"}),
    ]
    tasks = [
        # index(분류 없음)
        task("ix-1", "장보기 목록 정리", {"date": "2026-11-21", "createdAt": "2026-10-01T00:00:00.000Z"}),
        task("ix-2", "책 반납하기", {"date": "2026-11-23", "createdAt": "2026-10-02T00:00:00.000Z"}),
        task("ix-3", "날짜 없는 메모", {"date": None, "createdAt": "2026-10-03T00:00:00.000Z"}),
        task("ix-4", "접어 둔 일", {"status": "취소", "cancelReason": "필요 없어짐",
                                  "createdAt": "2026-10-04T00:00:00.000Z"}),
        task("ix-h1", "숨긴 index 일", {"hidden": True, "createdAt": "2026-10-05T00:00:00.000Z"}),
        task("ix-hist", "히스토리로 보낸 일", {"history": True, "createdAt": "2026-10-06T00:00:00.000Z"}),
        task("ix-d1", "완료한 index 11/20", {"status": "완료", "date": "2026-11-20", "doneAt": "2026-11-20",
                                          "createdAt": "2026-10-07T00:00:00.000Z"}),
        task("ix-d2", "완료한 index 11/18", {"status": "완료", "date": "2026-11-18", "doneAt": "2026-11-18",
                                          "createdAt": "2026-10-08T00:00:00.000Z"}),
        # 프로젝트 소속 — index 서랍에 섞이면 안 됩니다.
        task("t-1", "프로젝트 할 일", {"date": "2026-11-22", "projectIds": ["pj-1"]}),
    ]
    return {"calendar": [], "projects": projects + tasks, "routines": [], "binder": [], "archive": []}


def make_routes(data):
    """서버처럼 동작하는 목 — POST/PATCH 본문을 적용해 전체 항목을 돌려줍니다."""
    state = {"projects": [copy.deepcopy(item) for item in data["projects"]]}
    counter = {"n": 0}

    def handler(route, request):
        path = request.url.split("?")[0]
        method = request.method
        if path.endswith("/api/status"):
            return route.fulfill(json={"ok": True, "needsToken": False, "authRequired": False,
                                       "authenticated": True, "dbs": {}})
        if path.endswith("/api/notion/all"):
            return route.fulfill(json={"ok": True, "data": state, "errors": {}})
        if path.endswith("/schema") or path.endswith("/blocks"):
            if path.endswith("/blocks"):
                return route.fulfill(json={"ok": True, "data": {"text": "", "preserved": []}})
            return route.fulfill(json={"ok": True, "data": []})
        if "/api/notion/projects" in path:
            rest = path.split("/api/notion/projects", 1)[1].strip("/")
            body = request.post_data_json or {}
            if method == "POST" and not rest:
                counter["n"] += 1
                item = task("new-%d" % counter["n"], body.get("title", ""))
                item.update(body)
                item["createdAt"] = "2026-11-22T03:00:00.000Z"
                state["projects"].append(item)
                POSTS.append(body)
                return route.fulfill(json={"ok": True, "data": item})
            target = None
            if rest:
                target = next((x for x in state["projects"] if x["id"] == rest.split("/")[0]), None)
            if method == "PATCH" and target is not None:
                PATCHES.append(body)
                target.update({k: v for k, v in body.items() if k != "expectedUpdatedAt"})
                target["updatedAt"] = "2026-11-22T03:10:00.000Z"
                return route.fulfill(json={"ok": True, "data": target})
            return route.fulfill(json={"ok": True, "data": state})
        return route.fulfill(json={"ok": True, "data": []})

    return handler


PASSES, FAILS = [], []


def check(name, ok, detail=""):
    if ok:
        PASSES.append(name)
        print("PASS ", name)
    else:
        FAILS.append(f"{name} {detail}".strip())
        print("FAIL ", name, detail)


def open_page(browser, width, height, data, mobile=False):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR",
                              device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.set_default_timeout(15000)
    page.route("**/api/**", make_routes(data))
    seed = json.dumps({"projectTaskPreview": 8, "priorityTaskPreview": 10})
    page.add_init_script(
        "try { if (!localStorage.getItem('my-diary:settings:v1')) localStorage.setItem('my-diary:settings:v1', %s); } catch (e) {}"
        % json.dumps(seed)
    )
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=40000)
    page.wait_for_timeout(1200)
    return ctx, page


def go_projects(page):
    page.locator("nav button", has_text="프로젝트").first.evaluate("el => el.click()")
    page.wait_for_timeout(700)


def drawer_rows(page):
    return page.evaluate("""() => [...document.querySelectorAll('[data-index-drawer] [data-task-row]')]
        .map((row) => row.getAttribute('data-task-row'))""")


def drawer_open(page):
    return page.evaluate("() => !!document.querySelector('[data-index-drawer]')")


def card_rows(page):
    return page.evaluate("""() => { const card = document.querySelector('[data-index-card]');
        if (!card) return null;
        return [...card.querySelectorAll('ul li[data-task-id]')].map((li) => li.getAttribute('data-task-id')); }""")


def detail_open(page):
    return page.evaluate("() => !!document.querySelector('[aria-label=\"전체 닫기\"]')")


def open_index_drawer(page):
    page.locator('[data-index-card] p', has_text="남은 할 일").first.click()
    page.wait_for_timeout(600)


def filter_tab(page, label):
    page.locator('[data-index-drawer] [role="dialog"] >> nth=0').count()
    page.locator('[data-index-drawer] button', has_text=label).first.click()
    page.wait_for_timeout(400)


def close_drawer(page):
    page.locator('[role="dialog"] button', has_text="닫기").last.click()
    page.wait_for_timeout(500)


def main():
    data = fixture()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"],
                                    env={**os.environ, "LD_LIBRARY_PATH": LIBS})

        for label, w, h, mobile in [("pc", 1440, 900, False), ("mobile", 402, 874, True)]:
            POSTS.clear()
            PATCHES.clear()
            data = fixture()
            ctx, page = open_page(browser, w, h, data, mobile)
            go_projects(page)

            card = page.locator("[data-index-card]")
            check(f"{label}: index 카드가 있습니다", card.count() == 1)
            text = card.inner_text()
            # ix-1, ix-2, ix-3, ix-h1 = 남은 4 (취소·완료 제외)
            check(f"{label}: 카드에 남은 할 일 4", "남은 할 일 4" in text, text.replace("\n", " | "))
            check(f"{label}: 카드가 누를 수 있는 모양(cursor-pointer)",
                  "cursor-pointer" in (card.get_attribute("class") or ""))

            # 1) 카드를 눌러 서랍 열기
            open_index_drawer(page)
            check(f"{label}: 카드를 누르면 index 서랍이 열림", drawer_open(page))
            dlg = page.locator('[role="dialog"]').last
            dtext = dlg.inner_text()
            check(f"{label}: 서랍 제목 index · 아직 분류되지 않은 할 일",
                  "index" in dtext and "아직 분류되지 않은 할 일" in dtext, dtext[:120].replace("\n", " | "))
            check(f"{label}: 완료 2 / 전체 7", "완료 2 / 전체 7" in dtext, dtext[:200].replace("\n", " | "))
            check(f"{label}: 필터 탭 전체 7 / 진행 4 / 완료 2",
                  "전체 7" in dtext and "진행 4" in dtext and "완료 2" in dtext, dtext[:200].replace("\n", " | "))
            check(f"{label}: 프로젝트 속성(상태·색·분류·삭제·히스토리)은 index 서랍에 없음",
                  all(x not in dtext for x in ["프로젝트 수정", "히스토리로 보내기", "NOW 숨김", "분류 새로 추가"]),
                  dtext[:200].replace("\n", " | "))
            rows = drawer_rows(page)
            check(f"{label}: index 할 일만(프로젝트·히스토리 항목 제외)",
                  set(rows) == {"ix-1", "ix-2", "ix-3", "ix-4", "ix-h1", "ix-d1", "ix-d2"}, str(rows))
            open_rows = [row for row in rows if row in {"ix-1", "ix-2", "ix-3", "ix-h1"}]
            closed_rows = [row for row in rows if row in {"ix-4", "ix-d1", "ix-d2"}]
            check(f"{label}: 남은 할 일이 먼저, 완료한 할 일은 아래쪽",
                  rows[: len(open_rows)] == open_rows and rows[len(open_rows):] == closed_rows, str(rows))
            shot = os.path.join(OUT, f"{label}-index-drawer-all.png")
            page.screenshot(path=shot, full_page=False)
            print("shot", shot)

            # 2) 완료 필터로 지난 할 일 보기
            page.locator('[data-index-drawer] button', has_text="완료 2").first.click()
            page.wait_for_timeout(400)
            rows = drawer_rows(page)
            check(f"{label}: 완료 필터 = 지난 할 일만", set(rows) == {"ix-d1", "ix-d2"}, str(rows))
            struck = page.evaluate("""() => [...document.querySelectorAll('[data-index-drawer] [data-task-row] .line-through')].length""")
            check(f"{label}: 완료한 할 일은 취소선", struck >= 2, str(struck))
            shot = os.path.join(OUT, f"{label}-index-drawer-done.png")
            page.screenshot(path=shot, full_page=False)
            print("shot", shot)

            # 3) 진행 필터
            page.locator('[data-index-drawer] button', has_text="진행 4").first.click()
            page.wait_for_timeout(400)
            rows = drawer_rows(page)
            check(f"{label}: 진행 필터 = 남은 할 일만",
                  set(rows) == {"ix-1", "ix-2", "ix-3", "ix-h1"}, str(rows))
            page.locator('[data-index-drawer] button', has_text="전체 7").first.click()
            page.wait_for_timeout(300)

            # 4) 서랍에서 새 할 일 담기 — 분류 없이 index 로
            page.locator('[data-index-drawer] input[aria-label="index 에 할 일 추가"]').fill("서랍에서 담은 할 일")
            page.locator('[data-index-drawer] input[aria-label="index 에 할 일 추가"]').press("Enter")
            page.wait_for_timeout(900)
            last = POSTS[-1] if POSTS else {}
            check(f"{label}: 서랍 추가는 projectIds: [] 로 저장",
                  last.get("title") == "서랍에서 담은 할 일" and last.get("projectIds") == [] and last.get("kind") == "할 일",
                  json.dumps(last, ensure_ascii=False)[:200])
            check(f"{label}: 담은 할 일이 서랍 목록에 보임",
                  "서랍에서 담은 할 일" in page.locator("[data-index-drawer]").inner_text())

            # 5) 서랍에서 완료 체크
            page.locator('[data-index-drawer] [data-task-row="ix-1"] button[aria-label="완료"]').first.click()
            page.wait_for_timeout(800)
            patch = PATCHES[-1] if PATCHES else {}
            check(f"{label}: 서랍 체크는 완료 상태로 저장", patch.get("status") == "완료", json.dumps(patch, ensure_ascii=False))
            dtext = page.locator('[role="dialog"]').last.inner_text()
            check(f"{label}: 완료 개수가 바로 늘어남(완료 3)", "완료 3" in dtext, dtext[:200].replace("\n", " | "))

            # 6) 할 일 상세 열기
            page.locator('[data-index-drawer] [data-task-row="ix-2"] button').nth(1).click()
            page.wait_for_timeout(800)
            check(f"{label}: 서랍에서 할 일을 누르면 상세가 열림", detail_open(page))
            shot = os.path.join(OUT, f"{label}-index-drawer-task-detail.png")
            page.screenshot(path=shot, full_page=False)
            print("shot", shot)
            page.locator('[aria-label="전체 닫기"]').first.click()
            page.wait_for_timeout(700)
            check(f"{label}: 상세까지 닫으면 서랍도 닫힘", not drawer_open(page) and not detail_open(page))

            # 7) 닫기 버튼
            open_index_drawer(page)
            check(f"{label}: 다시 열림", drawer_open(page))
            close_drawer(page)
            check(f"{label}: 닫기 버튼으로 닫힘", not drawer_open(page))

            # 8) Esc
            open_index_drawer(page)
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
            check(f"{label}: Esc 로 닫힘", not drawer_open(page))

            # 9) 브라우저 뒤로
            open_index_drawer(page)
            check(f"{label}: 뒤로 가기 전 열림", drawer_open(page))
            page.go_back()
            page.wait_for_timeout(900)
            check(f"{label}: 뒤로 가기로 닫히고 화면은 그대로",
                  not drawer_open(page) and page.locator("h1").first.is_visible())

            # 10) 카드 안 클릭 가드 — 체크박스
            page.locator('[data-index-card] li[data-task-id="ix-2"] button').first.click()
            page.wait_for_timeout(800)
            check(f"{label}: 카드 체크박스는 서랍을 열지 않음", not drawer_open(page))
            patch = PATCHES[-1] if PATCHES else {}
            check(f"{label}: 카드 체크박스는 완료만 바꿈", patch.get("status") == "완료", json.dumps(patch, ensure_ascii=False))

            # 11) 최근 기록 클릭 가드
            recent = page.locator('[data-recent-log="index"] button').first
            check(f"{label}: 카드에 최근 기록이 있음", recent.count() == 1)
            recent.click()
            page.wait_for_timeout(800)
            check(f"{label}: 최근 기록은 상세를 열고 서랍은 열지 않음", detail_open(page) and not drawer_open(page))
            page.locator('[aria-label="전체 닫기"]').first.click()
            page.wait_for_timeout(600)

            # 12) + 할 일 입력 가드
            quick = page.locator('[data-index-card] input[placeholder="+ 할 일"]').first
            quick.click()
            page.wait_for_timeout(400)
            check(f"{label}: 카드의 + 할 일 입력은 서랍을 열지 않음",
                  not drawer_open(page) and page.evaluate("() => document.activeElement && document.activeElement.getAttribute('placeholder')") == "+ 할 일")
            quick.fill("카드에서 바로 담기")
            quick.press("Enter")
            page.wait_for_timeout(900)
            last = POSTS[-1] if POSTS else {}
            check(f"{label}: 카드 빠른 추가도 분류 없이(projectIds 없음/빈 값)",
                  last.get("title") == "카드에서 바로 담기" and last.get("projectIds") in (None, []), json.dumps(last, ensure_ascii=False)[:160])

            # 13) 카드 제목 버튼으로도 열림
            page.locator('[data-index-card] header button[aria-label="index 열기"]').first.click()
            page.wait_for_timeout(600)
            check(f"{label}: index 머리글 버튼으로도 열림", drawer_open(page))
            close_drawer(page)

            # 14) 프로젝트 카드는 예전 그대로
            page.locator('[data-project-card="pj-1"] header button').first.click()
            page.wait_for_timeout(700)
            ptext = page.locator('[role="dialog"]').last.inner_text()
            prows = page.evaluate("""() => [...document.querySelectorAll('[role="dialog"] [data-task-row]')]
                .map((row) => row.getAttribute('data-task-row'))""")
            check(f"{label}: 프로젝트 서랍은 그대로(온담 · 프로젝트 할 일)",
                  "온담 프로젝트" in ptext and prows == ["t-1"] and not drawer_open(page), str(prows))
            page.locator('[role="dialog"] button', has_text="닫기").last.click()
            page.wait_for_timeout(500)

            overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"{label}: 가로 넘침 없음", overflow <= 1, str(overflow))
            shot = os.path.join(OUT, f"{label}-index-card.png")
            page.screenshot(path=shot, full_page=True)
            print("shot", shot)
            ctx.close()

        browser.close()

    print("\n== %d passed, %d failed ==" % (len(PASSES), len(FAILS)))
    for fail in FAILS:
        print(" -", fail)


if __name__ == "__main__":
    main()
