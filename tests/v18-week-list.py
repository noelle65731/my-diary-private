"""v18 — 주간·3일 `일정` 목록화 점검 (데모/대역 API, PC·모바일).

    NEXT_DIST_DIR=.next-v18 tests/run-with-server.sh tests/v18-week-list.py

확인 항목
1. 0~24시 시간표 그리드·현재 시각 빨간 선이 주간/3일에서 사라지고, 왼쪽 행 라벨이 `일정` 하나
2. 두 날 이상 일정은 연결 막대(시작·끝 칸·드래그 날짜 이동·양끝 리사이즈·시각 유지)
3. 하루 일정 목록 — 시작 시각 순, `10:20~11:10`(시작만 있으면 `10:20`) 작은 글씨, 왼쪽 색 선
4. 같은 날 일정 드래그 순서 변경 → localStorage 저장 + 토스트, 다른 날로 끌면 날짜 이동(시각 유지)
5. 설정 → 캘린더 `주간 하루 일정 표시 개수`(3~7, 기본 5) + `+N개 더 보기`/`접기`
6. 요일별 `+ 일정` → 그 날짜로 새 일정 창
7. 일간 보기에는 현재 시각 빨간 선이 그대로
"""
import json
import os
import re
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
os.makedirs(OUT, exist_ok=True)

TODAY = "2026-11-23"
WEEK_START = "2026-11-23"

errors = []
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" :: {detail}"))


def stamp(day="2026-11-01"):
    return f"{day}T00:00:00.000Z"


def base(id_, title, **extra):
    item = dict(
        id=id_, url="", title=title, hidden=False, trash=False, favorite=False,
        memo="", sort=None, projectIds=[], createdAt=stamp(), updatedAt=stamp(),
    )
    item.update(extra)
    return item


def event(id_, title, date, **extra):
    item = base(id_, title, **extra)
    item.update(dict(kind="일정", category="개인", date=date, startTime=None, endDate=None,
                     endTime=None, allDay=True, done=False, canceled=False, cancelReason="",
                     cancelAt=None, weekKey="", baseDate=None))
    item.update(extra)
    return item


def task(id_, title, **extra):
    item = base(id_, title, **extra)
    item.update(dict(kind="할 일", category="개인", status="미완료", date=None, startTime=None,
                     endTime=None, due=None, doneAt=None, checkedAt=None, urgent=False,
                     important=False, history=False, waitFor="", waitNote="", cancelReason="",
                     cancelAt=None, repeatGroupId=""))
    item.update(extra)
    return item


def build_fixture():
    calendar = [
        # 두 날 이상 — 종일(막대)과 시간이 있는 것(막대 + 시각 유지 확인)
        event("ev-span-a", "포트폴리오 주간 점검", "2026-11-23", endDate="2026-11-25", sort=10),
        event("ev-span-b", "브랜드 워크숍", "2026-11-24", endDate="2026-11-25",
              startTime="10:00", endTime="16:00", allDay=False, sort=20),
        # 하루 일정 — 정렬·시간 표기·색 선
        event("ev-mon-1", "우유 사기", "2026-11-23"),
        event("ev-mon-2", "아침 요가", "2026-11-23", startTime="08:30", endTime="09:20", allDay=False),
        event("ev-mon-3", "오전 회의", "2026-11-23", startTime="10:00", endTime="11:00", allDay=False),
        event("ev-mon-4", "메일 정리", "2026-11-23", startTime="10:00", endTime="11:00", allDay=False),
        event("ev-mon-5", "치과 예약", "2026-11-23", startTime="11:30", endTime="12:00", allDay=False),
        event("ev-mon-6", "친구와 저녁", "2026-11-23", startTime="19:00", allDay=False),
        event("ev-wed-1", "전시 관람", "2026-11-25", startTime="15:00", endTime="17:30", allDay=False),
    ]
    projects = [
        task("pj-1", "브랜드 마케팅 포트폴리오", kind="프로젝트", category="업무",
             date="2026-11-10", due="2026-11-30"),
        task("tk-1", "사례 1-2 스토리라인 정리", category="업무", date="2026-11-24", projectIds=["pj-1"]),
    ]
    return dict(calendar=calendar, projects=projects, routines=[], binder=[], archive=[])


class Mock:
    def __init__(self, data):
        self.data = data
        self.calls = []
        self.seq = 0

    def resource_of(self, path):
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)", path)
        return m.group(1) if m else None

    def item(self, resource, item_id):
        for it in self.data.get(resource, []):
            if it["id"] == item_id:
                return it
        return None

    def handle(self, route, request):
        path = urllib.parse.urlparse(request.url).path
        method = request.method
        if path == "/api/status":
            return route.fulfill(json={
                "ok": True, "needsToken": False, "authRequired": False, "authenticated": True,
                "dbs": {k: {"label": k, "envKey": f"NOTION_{k.upper()}_DB_ID", "configured": True,
                            "ok": True, "message": "연결됨"} for k in self.data},
            })
        if path == "/api/notion/all":
            return route.fulfill(json={"ok": True, "data": self.data, "errors": {}})
        resource = self.resource_of(path)
        if resource and path.endswith("/schema"):
            return route.fulfill(json={"ok": True, "data": []})
        if resource and path.endswith("/blocks"):
            return route.fulfill(json={"ok": True, "data": {"text": "", "preserved": []}})
        if path == "/api/upload":
            return route.fulfill(json={"ok": True, "data": {"token": "upload:up-1", "id": "up-1", "name": "photo.jpg"}})
        if resource and method == "POST" and not re.search(r"/(schema|blocks)$", path):
            body = json.loads(request.post_data or "{}")
            self.calls.append(("POST", resource, body))
            self.seq += 1
            new = dict(event(f"new-{self.seq}", body.get("title", "새 일정"), body.get("date") or TODAY), **body)
            new["id"] = f"new-{self.seq}"
            # 노션은 시작 시각이 있으면 종일이 아닌 일정으로 돌려줍니다(notion-map 과 같은 규칙).
            if new.get("startTime"):
                new["allDay"] = False
            self.data[resource].append(new)
            return route.fulfill(json={"ok": True, "data": new})
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)/([^/]+)$", path)
        if m and method == "PATCH":
            res, item_id = m.group(1), m.group(2)
            body = json.loads(request.post_data or "{}")
            body.pop("expectedUpdatedAt", None)
            self.calls.append(("PATCH", res, item_id, body))
            current = self.item(res, item_id)
            if current:
                current.update(body)
            return route.fulfill(json={"ok": True, "data": current or {}})
        if m and method == "DELETE":
            self.calls.append(("DELETE", m.group(1), m.group(2)))
            return route.fulfill(json={"ok": True, "deleted": True})
        return route.fulfill(json={"ok": True, "data": None})

    def patches(self, item_id=None):
        return [c for c in self.calls if c[0] == "PATCH" and (item_id is None or c[2] == item_id)]


def launch(p, viewport, mobile=False):
    browser = p.chromium.launch(
        executable_path=SHELL,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
        env={**os.environ, "LD_LIBRARY_PATH": LIBS},
    )
    context = browser.new_context(
        viewport=viewport, locale="ko-KR", timezone_id="Asia/Seoul", is_mobile=mobile, has_touch=mobile
    )
    page = context.new_page()
    page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    return browser, context, page


def drag_mouse(page, x1, y1, x2, y2):
    page.mouse.move(x1, y1)
    page.mouse.down()
    page.mouse.move(x1 + 9, y1 + 4, steps=4)
    page.wait_for_timeout(60)
    page.mouse.move(x2, y2, steps=16)
    page.wait_for_timeout(90)
    page.mouse.up()
    page.wait_for_timeout(650)


def cell_box(page, day):
    return page.locator(f"[data-week-day-list='{day}']").first.bounding_box()


def day_list_titles(page, day):
    return page.eval_on_selector_all(
        f"[data-week-day-list='{day}'] [data-week-event]",
        "els => els.map(e => e.innerText.replace(/\\n/g, '|'))",
    )


with sync_playwright() as p:
    # ── PC ─────────────────────────────────────────────────────────────────
    mock = Mock(build_fixture())
    browser, context, page = launch(p, {"width": 1440, "height": 900})
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.click('button[data-tab="calendar"]')
    page.wait_for_timeout(700)
    page.click('button:has-text("주간")')
    page.wait_for_timeout(900)

    # 1) 시간표 그리드·빨간 선 제거 + 왼쪽 라벨 `일정`
    check("1. 주간에 시간표 스크롤 창 없음", page.locator("[data-week-scroll]").count() == 0)
    check("1. 주간에 현재 시각 빨간 선 없음", page.locator("[data-now-line]").count() == 0)
    check("1. 일정 목록 구역 있음", page.locator("[data-week-list-block]").count() == 1)
    gutter = page.eval_on_selector(
        "[data-week-list-block] > div:first-child", "el => el.innerText.trim()"
    )
    check("1. 왼쪽 행 라벨이 `일정`", gutter == "일정", gutter)
    section_text = page.locator("[data-week-section='schedule']").inner_text()
    check("1. `종일` 라벨 없음", "종일" not in section_text, section_text[:120])

    # 2) 연결 막대 — 두 날 이상만
    bars = page.eval_on_selector_all(
        "[data-all-day-bar]",
        "els => els.map(e => ({id: e.dataset.allDayBar, start: Number(e.dataset.allDayStart), end: Number(e.dataset.allDayEnd)}))",
    )
    check("2. 두 날 일정이 연결 막대로", {b["id"] for b in bars} == {"ev-span-a", "ev-span-b"}, str(bars))
    span_a = next((b for b in bars if b["id"] == "ev-span-a"), None)
    span_b = next((b for b in bars if b["id"] == "ev-span-b"), None)
    check("2. 막대 칸(11/23~25)", span_a == {"id": "ev-span-a", "start": 0, "end": 2}, str(span_a))
    check("2. 막대 칸(11/24~25)", span_b == {"id": "ev-span-b", "start": 1, "end": 2}, str(span_b))
    check(
        "2. 하루 일정은 막대에 없음",
        page.locator("[data-all-day-bar='ev-mon-2']").count() == 0,
    )

    # 3) 하루 목록 — 종일 먼저, 시작 시각 순, 시간 글씨, 왼쪽 색 선
    titles = day_list_titles(page, TODAY)
    check(
        "3. 하루 목록 시작 시각 순",
        titles[:5] == ["우유 사기", "08:30~09:20|아침 요가", "10:00~11:00|오전 회의", "10:00~11:00|메일 정리", "11:30~12:00|치과 예약"],
        str(titles),
    )
    check("3. 기본 5개 + 나머지 접힘", page.locator("[data-week-event-more='2026-11-23']").count() == 1, str(titles))
    more_text = page.locator("[data-week-event-more='2026-11-23']").inner_text()
    check("3. +1개 더 보기 문구", "1" in more_text and "더 보기" in more_text, more_text)
    check("3. 시작만 있으면 `10:20`처럼", True)  # 아래에서 새 일정으로 확인
    colors = page.eval_on_selector_all(
        "[data-week-day-list='2026-11-23'] [data-week-event] > span:first-child",
        "els => els.map(e => ({w: Math.round(e.getBoundingClientRect().width), cls: e.className}))",
    )
    check("3. 각 일정 왼쪽에 얇은 색 선", bool(colors) and all(c["w"] <= 4 and "absolute" in c["cls"] for c in colors), str(colors[:2]))

    # 4) 같은 날 순서 바꾸기 — 메일 정리를 오전 회의 위로
    src = page.locator("[data-week-event='ev-mon-4']").first.bounding_box()
    dst = page.locator("[data-week-event='ev-mon-3']").first.bounding_box()
    drag_mouse(page, src["x"] + 20, src["y"] + 6, dst["x"] + 20, dst["y"] + 2)
    stored = page.evaluate("() => window.localStorage.getItem('my-diary:week-event-order:v1')")
    check("4. 순서가 localStorage에 저장", bool(stored) and "ev-mon-4" in (stored or ""), str(stored))
    order_now = day_list_titles(page, TODAY)
    check("4. 화면 순서도 바뀜", order_now.index("10:00~11:00|메일 정리") < order_now.index("10:00~11:00|오전 회의"), str(order_now))
    toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
    check("4. `일정 순서를 변경했습니다` 토스트", "일정 순서를 변경했습니다" in toast, toast)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1400)
    page.click('button[data-tab="calendar"]')
    page.wait_for_timeout(600)
    page.click('button:has-text("주간")')
    page.wait_for_timeout(800)
    kept = day_list_titles(page, TODAY)
    check("4. 새로 고쳐도 바뀐 순서 유지", kept.index("10:00~11:00|메일 정리") < kept.index("10:00~11:00|오전 회의"), str(kept))

    # 5) 설정 → 캘린더 개수(3~7) + 접기/펼치기
    page.evaluate("() => document.querySelector('[aria-label=\"설정\"]').click()")
    page.wait_for_timeout(600)
    page.click('[role="dialog"] button:has-text("캘린더")')
    page.wait_for_timeout(500)
    seg = page.locator("[data-week-day-items]")
    labels = seg.locator("button").all_inner_texts()
    check("5. 설정에 3·4·5·6·7 선택", [x.strip() for x in labels] == ["3", "4", "5", "6", "7"], str(labels))
    active = seg.locator("button[aria-pressed='true']").first.inner_text().strip()
    check("5. 기본값 5", active == "5", active)
    seg.locator("button:has-text('3')").first.click()
    page.wait_for_timeout(500)
    toast = page.locator("[data-toast]").last.inner_text() if page.locator("[data-toast]").count() else ""
    check("5. 개수 변경 토스트", "3" in toast and "보여" in toast, toast)
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    shown = page.locator(f"[data-week-day-list='{TODAY}'] [data-week-event]").count()
    check("5. 설정 3개면 3개만 표시", shown == 3, str(shown))
    more = page.locator("[data-week-event-more='2026-11-23']")
    check("5. +3개 더 보기", "3" in more.inner_text(), more.inner_text())
    more.click()
    page.wait_for_timeout(500)
    all_shown = page.locator(f"[data-week-day-list='{TODAY}'] [data-week-event]").count()
    check("5. 더 보기 → 전부 표시", all_shown == 6, str(all_shown))
    check("5. 접기 버튼", page.locator("[data-week-event-fold='2026-11-23']").count() == 1)
    page.locator("[data-week-event-fold='2026-11-23']").first.click()
    page.wait_for_timeout(500)
    check("5. 접기 → 3개로", page.locator(f"[data-week-day-list='{TODAY}'] [data-week-event]").count() == 3)
    # 기본값 5로 되돌리기
    page.evaluate("() => document.querySelector('[aria-label=\"설정\"]').click()")
    page.wait_for_timeout(500)
    page.click('[role="dialog"] button:has-text("캘린더")')
    page.wait_for_timeout(400)
    page.locator("[data-week-day-items] button:has-text('5')").first.click()
    page.wait_for_timeout(400)
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)

    # 6) 요일별 `+ 일정`
    check("6. 요일마다 + 일정 버튼", page.locator("[data-week-add-event]").count() == 7, str(page.locator("[data-week-add-event]").count()))
    page.locator("[data-week-add-event='2026-11-26']").first.click()
    page.wait_for_timeout(700)
    date_value = page.locator("input[aria-label='날짜']").first.input_value()
    check("6. + 일정 → 그 날짜로 새 일정", date_value == "2026-11-26", date_value)
    page.fill("input[placeholder='무엇을 기록할까요?']", "시간만 있는 일정")
    # 시작만 있는 시간(끝 시간 없이) → 목록에 `10:20`으로
    page.locator("[role='dialog'] button:has-text('시간 지정')").first.click()
    page.wait_for_timeout(300)
    page.locator("input[type='time']").first.fill("10:20")
    page.locator("[role='dialog'] button:has-text('추가')").first.click()
    page.wait_for_timeout(900)
    thu = day_list_titles(page, "2026-11-26")
    check("6. + 일정으로 만든 일정이 그 날 목록에", any("시간만 있는 일정" in t for t in thu), str(thu))
    check("3. 시작만 있으면 `10:20`으로 표기", any(t.strip() == "10:20|시간만 있는 일정" for t in thu), str(thu))

    # 7) 연결 막대 드래그 — 날짜만 옮기고 시각·일수 유지
    bar = page.locator("[data-all-day-bar='ev-span-b']").first.bounding_box()
    target = cell_box(page, "2026-11-27")
    drag_mouse(page, bar["x"] + bar["width"] / 2, bar["y"] + bar["height"] / 2, target["x"] + target["width"] / 2, target["y"] + 40)
    patch = next((c[3] for c in mock.patches("ev-span-b")), None)
    check("7. 막대를 끌면 날짜만 이동", bool(patch) and patch.get("date") == "2026-11-27", str(patch))
    record = mock.item("calendar", "ev-span-b") or {}
    check(
        "7. 막대를 끌어도 시작·끝 시각 유지",
        record.get("startTime") == "10:00" and record.get("endTime") == "16:00" and "startTime" not in (patch or {}),
        f"{record.get('startTime')}~{record.get('endTime')} patch={patch}",
    )
    check("7. 막대를 끌어도 일수 유지", bool(patch) and patch.get("endDate") == "2026-11-28", str(patch))
    bar_time = page.locator("[data-all-day-bar='ev-span-b']").first.inner_text().replace("\n", " ")
    check("7. 옮긴 막대에 시각이 그대로 보임", "10:00~16:00" in bar_time, bar_time)

    # 8) 하루 일정을 다른 날로 끌기 — 시각 유지
    src = page.locator("[data-week-event='ev-mon-5']").first.bounding_box()
    target = cell_box(page, "2026-11-24")
    drag_mouse(page, src["x"] + 24, src["y"] + 8, target["x"] + target["width"] / 2, target["y"] + 60)
    moved = next((c[3] for c in mock.patches("ev-mon-5")), None)
    check("8. 일정을 다른 날로 옮기면 날짜 변경", bool(moved) and moved.get("date") == "2026-11-24", str(moved))
    check("8. 날짜를 옮겨도 시각 유지", bool(moved) and moved.get("startTime") == "11:30", str(moved))
    tue = day_list_titles(page, "2026-11-24")
    check("8. 옮긴 일정이 그 날 목록에", any("치과 예약" in t for t in tue), str(tue))

    # 9) 일간 보기에는 현재 시각 빨간 선 유지
    page.click('button:has-text("일간")')
    page.wait_for_timeout(900)
    check("9. 일간 보기엔 현재 시각 빨간 선", page.locator("[data-now-line]").count() == 1)

    check("콘솔 오류 0건(PC)", len(errors) == 0, json.dumps(errors[:6], ensure_ascii=False))
    page.click('button:has-text("주간")')
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/diary-v18-week-pc.png", full_page=True)
    browser.close()

    # ── 모바일 ─────────────────────────────────────────────────────────────
    mock = Mock(build_fixture())
    browser, context, page = launch(p, {"width": 390, "height": 844}, mobile=True)
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.click('button[data-tab="calendar"]')
    page.wait_for_timeout(700)
    page.click('button:has-text("주간")')
    page.wait_for_timeout(900)
    check("m. 시간표·빨간 선 없음", page.locator("[data-week-scroll]").count() == 0 and page.locator("[data-now-line]").count() == 0)
    check("m. 요일마다 + 일정", page.locator("[data-week-add-event]").count() == 7)
    check("m. 연결 막대 보임", page.locator("[data-all-day-bar='ev-span-a']").count() == 1)
    page.locator("[data-week-add-event='2026-11-25']").first.click()
    page.wait_for_timeout(700)
    check("m. + 일정 → 그 날짜", page.locator("input[aria-label='날짜']").first.input_value() == "2026-11-25")
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/diary-v18-week-mobile.png", full_page=False)
    page.click('button:has-text("3일")')
    page.wait_for_timeout(800)
    check("m. 3일에도 목록 구역", page.locator("[data-week-list-block]").count() == 1)
    page.screenshot(path=f"{OUT}/diary-v18-three-mobile.png", full_page=False)
    check("m. 콘솔 오류 0건", len(errors) == 0, json.dumps(errors[:6], ensure_ascii=False))
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} 통과")
