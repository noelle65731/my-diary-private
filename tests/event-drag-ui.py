"""A23 검증 — 일정을 다른 날로 끌어 옮겨도 시간·내부 설정이 그대로인지.

PC 1440×900 (마우스)와 폰 402×874 (터치)에서:
1) 주간 시간표의 시간 지정 일정을 같은 높이로 다른 요일에 놓으면 날짜만 바뀌고
   startTime/endTime/allDay 는 그대로다 (PATCH 본문·화면·새로고침 후 모두).
2) 다른 요일·다른 시각으로 놓으면 그 시각으로 옮겨지고 길이는 유지된다.
3) 종일 줄에 놓아도 다른 날이면 시각이 지워지지 않는다.
4) 종일 일정을 다른 날로 옮기면 종일로 남는다.
5) 여러 날 일정은 일수를 유지한다 (월간 달력 드래그).
6) 분류·메모·취소 같은 내부 설정은 패치에 끼지 않고 화면에 그대로 남는다.

    BASE=http://127.0.0.1:3241 OUT=/workspace/work/drag-shots python3 tests/event-drag-ui.py
"""

import json
import os
import sys
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3241")
OUT = os.environ.get("OUT", "/workspace/work/drag-shots")
CHROME = os.environ.get("CHROME", "/workspace/.browsers/chromium/chromium")
os.makedirs(OUT, exist_ok=True)

TODAY = "2026-11-21"  # 토요일
STAMP = "2026-11-01T00:00:00.000Z"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  — {detail}" if detail else ""))


def base(item_id, title, extra=None):
    data = {
        "id": item_id, "url": "", "title": title, "hidden": False, "trash": False, "favorite": False,
        "memo": "", "sort": None, "projectIds": [], "createdAt": STAMP, "updatedAt": STAMP,
    }
    data.update(extra or {})
    return data


def event(item_id, title, when_date, extra=None):
    data = base(item_id, title, {
        "kind": "일정", "category": "업무", "date": when_date, "startTime": None, "endTime": None,
        "endDate": None, "allDay": True, "done": False, "canceled": False, "cancelReason": "",
        "cancelAt": None, "weekKey": "", "baseDate": None,
    })
    data.update(extra or {})
    return data


def task(item_id, title, when_date, extra=None):
    data = base(item_id, title, {
        "kind": "할 일", "category": "개인", "status": "미완료", "date": when_date, "due": None,
        "doneAt": None, "checkedAt": None, "urgent": False, "important": False, "history": False,
        "waitFor": "", "waitNote": "", "cancelReason": "", "cancelAt": None, "repeatGroupId": "",
    })
    data.update(extra or {})
    return data


def fixtures(morning=True):
    """morning=False 이면 폰의 좁은 시간창(지금 전후 3시간)에 보이는 저녁 일정을 씁니다."""
    start, end = ("09:00", "10:00") if morning else ("20:00", "21:00")
    return {
        "calendar": [
            event("ev-1", "팀 회의", TODAY, {
                "startTime": start, "endTime": end, "allDay": False,
                "category": "업무", "memo": "회의실 3층", "canceled": True, "cancelReason": "장소 미정",
            }),
            event("ev-2", "워크숍", TODAY),
            event("ev-3", "출장", "2026-11-18", {"endDate": "2026-11-20"}),
            event("ev-4", "점심 약속", "2026-11-22", {"startTime": "12:00", "endTime": "13:00", "allDay": False}),
            event("ev-5", "저녁 모임", "2026-11-19", {"startTime": "19:00", "endTime": "21:00", "allDay": False, "category": "개인", "memo": "예약 완료"}),
            event("ev-6", "여행", "2026-11-19", {"endDate": "2026-11-21", "category": "개인"}),
        ],
        "projects": [
            base("proj-a", "브랜드 리뉴얼", {"kind": "프로젝트", "category": "업무", "status": "미완료", "sort": 10}),
            task("t-1", "온담 방문", TODAY, {"startTime": "13:00", "endTime": "14:00", "projectIds": ["proj-a"], "urgent": True}),
        ],
        "routines": [],
        "binder": [],
        "archive": [],
    }


class App:
    def __init__(self, page, morning=True, data=None):
        self.page = page
        self.morning = morning
        self.data = data or fixtures(morning)
        self.patches = []
        self.errors = []
        page.on("pageerror", lambda error: self.errors.append(str(error)))

    def install(self):
        def handler(route):
            request = route.request
            path = request.url.split("?")[0].split(BASE, 1)[-1]
            method = request.method
            if path == "/api/status":
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({
                    "ok": True, "needsToken": False, "authRequired": False, "authenticated": True, "missing": [],
                }))
            if path == "/api/notion/all":
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": self.data}))
            if path.startswith("/api/notion/"):
                parts = path.split("/")
                resource, item_id = parts[3], parts[4] if len(parts) > 4 else None
                if method == "PATCH" and item_id:
                    patch = json.loads(request.post_data or "{}")
                    self.patches.append({"resource": resource, "id": item_id, "patch": patch})
                    item = next(entry for entry in self.data[resource] if entry["id"] == item_id)
                    # 서버가 날짜 속성을 통째로 다시 쓰면서 패치에 없는 시각·끝 날짜는 원래 값에서 채우는 것과 같은 결과.
                    merged = {**item, **patch}
                    if "startTime" not in patch and "date" in patch:
                        merged["startTime"] = item.get("startTime")
                        merged["endTime"] = item.get("endTime")
                        span = 0
                        if item.get("endDate") and item.get("date"):
                            span = (date.fromisoformat(item["endDate"]) - date.fromisoformat(item["date"])).days
                        if "endDate" not in patch:
                            merged["endDate"] = None if span <= 0 else (
                                date.fromisoformat(patch["date"]) + timedelta(days=span)
                            ).isoformat()
                        merged["allDay"] = not merged.get("startTime")
                    merged["updatedAt"] = "2026-11-21T12:00:00.000Z"
                    self.data[resource] = [merged if entry["id"] == item_id else entry for entry in self.data[resource]]
                    return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": merged}))
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "data": []}))
            return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))

        self.page.route("**/api/**", handler)

    def goto_calendar(self):
        self.page.goto(BASE, wait_until="networkidle")
        self.page.wait_for_timeout(500)
        self.page.locator("nav button", has_text="캘린더").first.click()
        self.page.wait_for_timeout(500)

    def view(self, label):
        self.page.locator("main button", has_text=label).first.click()
        self.page.wait_for_timeout(700)

    def expand_schedule(self):
        """기본(3시간 창) 대신 전체(하루)를 펼쳐 09시 일정과 종일 줄을 한눈에."""
        buttons = self.page.locator("main .seg-track button", has_text="전체")
        if buttons.count():
            buttons.first.click()
            self.page.wait_for_timeout(500)
        self.page.evaluate("document.querySelector('[data-week-scroll]')?.scrollTo({top: 0})")
        self.page.wait_for_timeout(300)

    def item(self, event_id):
        return next(entry for entry in self.data["calendar"] if entry["id"] == event_id)

    def last_patch(self, event_id):
        return next((p for p in reversed(self.patches) if p["id"] == event_id), None)


def center(page, locator):
    box = locator.bounding_box()
    if not box:
        raise RuntimeError("no box")
    return {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2, "box": box}


def mouse_drag(page, start, end, steps=18):
    page.mouse.move(start["x"], start["y"])
    page.mouse.down()
    page.mouse.move(start["x"] + 4, start["y"] + 3, steps=2)
    page.wait_for_timeout(50)
    page.mouse.move(end["x"], end["y"], steps=steps)
    page.wait_for_timeout(150)
    page.mouse.up()
    page.wait_for_timeout(600)


def touch_drag(client, page, start, end, steps=18, hold=280):
    client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": start["x"], "y": start["y"], "id": 1}]})
    page.wait_for_timeout(hold)
    for index in range(1, steps + 1):
        x = start["x"] + (end["x"] - start["x"]) * index / steps
        y = start["y"] + (end["y"] - start["y"]) * index / steps
        client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y, "id": 1}]})
        page.wait_for_timeout(18)
    client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(700)


def column(page, day):
    return page.locator(f'[data-drop-zone="timeline-day"][data-drop-day="{day}"]').first


def allday_cell(page, day):
    return page.locator(f'[data-drop-zone="allday-day"][data-drop-day="{day}"]').first


def run_desktop(browser):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    app = App(page)
    app.install()
    app.goto_calendar()
    app.view("주간")
    app.expand_schedule()

    card = page.locator('[data-timeline-event="ev-1"]').first
    if card.count() == 0:
        check("PC: 시간 지정 일정이 주간 시간표에 보인다", False, "no [data-timeline-event]")
        context.close()
        return
    card.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    check("PC: 시간 지정 일정이 주간 시간표에 보인다", True)
    page.screenshot(path=f"{OUT}/pc-week-before.png")

    # 1) 같은 높이 → 다른 요일: 날짜만 바뀐다
    from_card = center(page, card)
    target = column(page, "2026-11-22")
    target_box = target.bounding_box()
    target_point = {"x": target_box["x"] + target_box["width"] / 2, "y": from_card["y"]}
    mouse_drag(page, from_card, target_point)
    patch = app.last_patch("ev-1")
    check("PC 1) 드래그 후 PATCH 가 전송됐다", patch is not None, json.dumps(patch and patch["patch"], ensure_ascii=False))
    body = patch["patch"] if patch else {}
    check("PC 1) 날짜만 11/22 로 바뀐다", body.get("date") == "2026-11-22", body.get("date"))
    check(
        "PC 1) 같은 높이 드롭 → 시작·끝 시각 그대로 (09:00–10:00)",
        body.get("startTime") == "09:00" and body.get("endTime") == "10:00",
        f"{body.get('startTime')}–{body.get('endTime')}",
    )
    check("PC 1) 종일로 바뀌지 않는다", body.get("allDay") is False, body.get("allDay"))
    check(
        "PC 1) 내부 설정(분류·메모·취소)은 패치에 실리지 않는다",
        not ({"category", "memo", "canceled", "cancelReason"} & set(body)),
        sorted(body.keys()),
    )
    stored = app.item("ev-1")
    check(
        "PC 1) 저장된 값도 시간·분류·메모·취소 그대로",
        stored["date"] == "2026-11-22" and stored["startTime"] == "09:00" and stored["endTime"] == "10:00"
        and stored["allDay"] is False and stored["category"] == "업무" and stored["memo"] == "회의실 3층"
        and stored["canceled"] is True and stored["cancelReason"] == "장소 미정",
        stored,
    )
    page.screenshot(path=f"{OUT}/pc-week-after-move.png")

    moved_card = page.locator('[data-timeline-event="ev-1"]').first
    moved_text = (moved_card.text_content() or "").replace("\n", " ")
    moved_day = moved_card.evaluate("node => node.closest('[data-drop-day]')?.dataset.dropDay ?? null")
    check("PC 1) 화면에서 11/22 칸으로 옮겨졌다", moved_day == "2026-11-22", moved_day)
    check("PC 1) 화면 카드에 09:00–10:00 이 남아 있다", "09:00" in moved_text and "10:00" in moved_text, moved_text)
    check("PC 1) 화면 카드가 종일 줄로 가지 않았다", page.locator('[data-all-day-bar="ev-1"]').count() == 0)

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(700)
    app.view("주간")
    app.expand_schedule()
    reloaded = page.locator('[data-timeline-event="ev-1"]').first
    reloaded.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    reloaded_text = (reloaded.text_content() or "").replace("\n", " ")
    reloaded_day = reloaded.evaluate("node => node.closest('[data-drop-day]')?.dataset.dropDay ?? null")
    check(
        "PC 1) 새로고침 후에도 11/22 · 09:00–10:00 · 종일 아님",
        reloaded_day == "2026-11-22" and "09:00" in reloaded_text and "10:00" in reloaded_text
        and page.locator('[data-all-day-bar="ev-1"]').count() == 0,
        f"{reloaded_day} {reloaded_text}",
    )

    # 2) 다른 요일·다른 시각 (한 시간 반 아래로)
    page2 = context.new_page()
    app2 = App(page2)
    app2.install()
    app2.goto_calendar()
    app2.view("주간")
    app2.expand_schedule()
    card2 = page2.locator('[data-timeline-event="ev-1"]').first
    card2.scroll_into_view_if_needed()
    page2.wait_for_timeout(250)
    from2 = center(page2, card2)
    target2 = column(page2, "2026-11-20").bounding_box()
    drop2_y = min(from2["y"] + 80, target2["y"] + target2["height"] - 24)
    check("PC 2) 옮길 칸이 화면 안에 있다", drop2_y > target2["y"] + 8, f"{from2['y']} → {drop2_y} / {target2['y']}..{target2['y'] + target2['height']}")
    drop2 = {"x": target2["x"] + target2["width"] / 2, "y": drop2_y}
    mouse_drag(page2, from2, drop2)
    body2 = (app2.last_patch("ev-1") or {"patch": {}})["patch"]
    check(
        "PC 2) 다른 요일·다른 시각으로 옮긴다",
        body2.get("date") == "2026-11-20" and body2.get("startTime") not in (None, "09:00"),
        json.dumps(body2, ensure_ascii=False),
    )
    if body2.get("startTime") and body2.get("endTime"):
        start_min = int(body2["startTime"][:2]) * 60 + int(body2["startTime"][3:])
        end_min = int(body2["endTime"][:2]) * 60 + int(body2["endTime"][3:])
        check("PC 2) 일정 길이는 1시간 그대로", end_min - start_min == 60, f"{body2['startTime']}–{body2['endTime']}")
    check("PC 2) 종일 아님", body2.get("allDay") is False, body2.get("allDay"))

    # 3) 종일 줄에 다른 날로 놓기 — 시각 유지
    page3 = context.new_page()
    app3 = App(page3)
    app3.install()
    app3.goto_calendar()
    app3.view("주간")
    app3.expand_schedule()
    card3 = page3.locator('[data-timeline-event="ev-1"]').first
    card3.scroll_into_view_if_needed()
    page3.wait_for_timeout(250)
    from3 = center(page3, card3)
    cell3 = allday_cell(page3, "2026-11-19").bounding_box()
    mouse_drag(page3, from3, {"x": cell3["x"] + cell3["width"] / 2, "y": cell3["y"] + cell3["height"] / 2})
    body3 = (app3.last_patch("ev-1") or {"patch": {}})["patch"]
    check(
        "PC 3) 종일 줄에 다른 날로 놓아도 시각이 지워지지 않는다",
        body3.get("date") == "2026-11-19" and body3.get("startTime") == "09:00" and body3.get("endTime") == "10:00",
        json.dumps(body3, ensure_ascii=False),
    )
    check("PC 3) 종일로 바뀌지 않는다", app3.item("ev-1")["allDay"] is False, app3.item("ev-1")["allDay"])
    page3.screenshot(path=f"{OUT}/pc-allday-drop-keeps-time.png")

    # 4) 종일 일정을 다른 날로 — 종일 유지
    page4 = context.new_page()
    app4 = App(page4)
    app4.install()
    app4.goto_calendar()
    app4.view("주간")
    app4.expand_schedule()
    bar = page4.locator('[data-all-day-bar="ev-2"]').first
    if bar.count():
        from4 = center(page4, bar)
        cell4 = allday_cell(page4, "2026-11-22").bounding_box()
        mouse_drag(page4, from4, {"x": cell4["x"] + cell4["width"] / 2, "y": cell4["y"] + cell4["height"] / 2})
        body4 = (app4.last_patch("ev-2") or {"patch": {}})["patch"]
        check(
            "PC 4) 종일 일정은 다른 날로 옮겨도 종일",
            body4.get("date") == "2026-11-22" and body4.get("startTime") is None and body4.get("allDay") is True,
            json.dumps(body4, ensure_ascii=False),
        )
    else:
        check("PC 4) 종일 일정이 종일 줄에 보인다", False, "no all-day bar")

    # 4b) 여러 날 종일 일정도 일수를 유지 (종일 줄에 이 일정 하나만 둔 화면)
    trip = fixtures(True)
    trip["calendar"] = [entry for entry in trip["calendar"] if entry["id"] == "ev-6"]
    page4b = context.new_page()
    app4b = App(page4b, data=trip)
    app4b.install()
    app4b.goto_calendar()
    app4b.view("주간")
    app4b.expand_schedule()
    bar6 = page4b.locator('[data-all-day-bar="ev-6"]').first
    if bar6.count():
        from6 = center(page4b, bar6)
        cell6 = allday_cell(page4b, "2026-11-22").bounding_box()
        mouse_drag(page4b, from6, {"x": cell6["x"] + cell6["width"] / 2, "y": cell6["y"] + cell6["height"] / 2})
        body6 = (app4b.last_patch("ev-6") or {"patch": {}})["patch"]
        check(
            "PC 4b) 여러 날 종일 일정: 3일 길이 그대로",
            body6.get("date") == "2026-11-22" and body6.get("endDate") == "2026-11-24" and body6.get("allDay") is True,
            json.dumps(body6, ensure_ascii=False),
        )
    else:
        check("PC 4b) 여러 날 종일 일정이 보인다", False, "no bar")

    # 4c) 할 일을 다른 날 시간표 칸에 놓아도 날짜만 바뀌고 시각은 그대로
    page6 = context.new_page()
    app6 = App(page6)
    app6.install()
    app6.goto_calendar()
    app6.view("주간")
    page6.wait_for_timeout(600)
    task_chip = page6.locator('[data-week-task="t-1"]').first
    if task_chip.count():
        task_chip.scroll_into_view_if_needed()
        page6.wait_for_timeout(300)
        from7 = center(page6, task_chip)
        col7 = column(page6, "2026-11-22")
        col7.scroll_into_view_if_needed()
        page6.wait_for_timeout(200)
        col7_box = col7.bounding_box()
        mouse_drag(page6, from7, {"x": col7_box["x"] + col7_box["width"] / 2, "y": max(col7_box["y"] + 20, from7["y"])})
        body7 = (app6.last_patch("t-1") or {"patch": {}})["patch"]
        check(
            "PC 4c) 할 일을 시간표 칸에 놓으면 그 날로 옮겨진다",
            body7.get("date") == "2026-11-22",
            json.dumps(body7, ensure_ascii=False),
        )
        stored7 = next(entry for entry in app6.data["projects"] if entry["id"] == "t-1")
        check(
            "PC 4c) 할 일의 시작·끝 시각은 그대로",
            stored7.get("startTime") == "13:00" and stored7.get("endTime") == "14:00",
            stored7,
        )
    else:
        check("PC 4c) 주간표에 할 일 줄이 보인다", False, "no [data-week-task]")

    # 5) 월간 달력 — 여러 날 일정의 일수 유지
    page5 = context.new_page()
    app5 = App(page5)
    app5.install()
    app5.goto_calendar()
    app5.view("월간")
    chip = page5.locator('[data-month-item="ev-3"]').first
    chip.scroll_into_view_if_needed()
    page5.wait_for_timeout(200)
    from5 = center(page5, chip)
    target5 = page5.locator('[data-month-cell="2026-11-25"]').first.bounding_box()
    mouse_drag(page5, from5, {"x": target5["x"] + target5["width"] / 2, "y": target5["y"] + target5["height"] / 3})
    body5 = (app5.last_patch("ev-3") or {"patch": {}})["patch"]
    check(
        "PC 5) 월간 드래그: 날짜와 끝 날짜가 같은 일수(3일)만큼",
        body5.get("date") == "2026-11-25" and body5.get("endDate") == "2026-11-27",
        json.dumps(body5, ensure_ascii=False),
    )
    check("PC 5) 월간 드래그가 시각을 건드리지 않는다", "startTime" not in body5, sorted(body5.keys()))
    page5.screenshot(path=f"{OUT}/pc-month-multi-move.png")

    check("PC: 콘솔 오류 없음", not app.errors, app.errors[:3])
    context.close()


def run_mobile(browser):
    context = browser.new_context(viewport={"width": 402, "height": 874}, has_touch=True, is_mobile=True, device_scale_factor=2)
    page = context.new_page()
    app = App(page, morning=False)
    app.install()
    app.goto_calendar()
    app.view("주간")
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/mobile-week-before.png")

    card = page.locator('[data-timeline-event="ev-1"]').first
    if card.count() == 0:
        check("폰: 시간 지정 일정이 주간표에 보인다", False, "no [data-timeline-event]")
        context.close()
        return
    check("폰: 시간 지정 일정이 주간표에 보인다", True)
    card.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    from_card = center(page, card)
    target = column(page, "2026-11-22")
    target.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    target_box = target.bounding_box()
    client = context.new_cdp_session(page)
    touch_drag(client, page, from_card, {"x": target_box["x"] + target_box["width"] / 2, "y": from_card["y"]})
    body = (app.last_patch("ev-1") or {"patch": None})["patch"]
    check("폰 1) 터치로 끌어 옮기면 PATCH 가 간다", body is not None, json.dumps(body, ensure_ascii=False))
    body = body or {}
    check("폰 1) 날짜만 11/22 로", body.get("date") == "2026-11-22", body.get("date"))
    check(
        "폰 1) 시작·끝 시각 그대로 (20:00–21:00)",
        body.get("startTime") == "20:00" and body.get("endTime") == "21:00",
        f"{body.get('startTime')}–{body.get('endTime')}",
    )
    check("폰 1) 종일 아님", body.get("allDay") is False, body.get("allDay"))
    stored = app.item("ev-1")
    check(
        "폰 1) 저장된 값도 시간·분류·메모 유지",
        stored["date"] == "2026-11-22" and stored["startTime"] == "20:00" and stored["endTime"] == "21:00"
        and stored["category"] == "업무" and stored["memo"] == "회의실 3층",
        stored,
    )
    page.screenshot(path=f"{OUT}/mobile-week-after-move.png")

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(800)
    app.view("주간")
    page.wait_for_timeout(600)
    moved = page.locator('[data-timeline-event="ev-1"]').first
    if moved.count():
        moved.scroll_into_view_if_needed()
        page.wait_for_timeout(200)
        moved_text = (moved.text_content() or "").replace("\n", " ")
        moved_day = moved.evaluate("node => node.closest('[data-drop-day]')?.dataset.dropDay ?? null")
    else:
        moved_text, moved_day = "", None
    check(
        "폰 1) 새로고침 후에도 11/22 · 시간 표시",
        moved_day == "2026-11-22" and "20:00" in moved_text,
        f"{moved_day} {moved_text}",
    )
    check("폰: 콘솔 오류 없음", not app.errors, app.errors[:3])
    context.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        try:
            run_desktop(browser)
            run_mobile(browser)
        finally:
            browser.close()
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} PASS" + (f" — FAILED: {failed}" if failed else " — ALL PASS"))
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
