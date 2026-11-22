"""일정·할 일 상세/수정 화면 검증용 공통 대역(Notion API 대신 브라우저 안에서 답합니다).

tests/task-time-and-notion-open.py 의 대역을 그대로 따르되, 상세 화면의 모든 칸
(분류·상태·취소 사유·대기 대상·메모·본문·색·숨김·이번 주 꼭·연결 프로젝트)을
한 번에 볼 수 있도록 기록을 조금 더 채워 둡니다.
"""

import json
import re
import urllib.parse

TODAY = "2026-11-21"
WEEK_KEY = "2026-W47"
WEEK_START = "2026-11-16"
PAGE_ID = "41f6ed96-9c5d-816b-b13d-e0389e874f1c"
EVENT_URL = "https://www.notion.so/umana/0123456789abcdef0123456789abcdef"
TASK_URL = "https://www.notion.so/umana/fedcba9876543210fedcba9876543210"


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
    item.update(dict(kind="할 일", category="개인", status="미완료", date=None,
                     startTime=None, endTime=None, due=None,
                     doneAt=None, checkedAt=None, urgent=False, important=False, history=False,
                     waitFor="", waitNote="", cancelReason="", cancelAt=None, repeatGroupId=""))
    item.update(extra)
    return item


def build_fixture():
    calendar = [
        # 시간 없는 종일 일정 · 노션 URL 있음 · 메모·색·연결 프로젝트가 모두 채워진 기록
        event("ev-1", "도서관 반납", TODAY, url=EVENT_URL, favorite=True,
              memo="반납증 챙기기\n두 줄 메모", projectIds=["pj-1"]),
        # 시간 지정 일정 (id 만 있는 기록 → notion.so/<id> 폴백 확인)
        event(PAGE_ID, "치과 예약", TODAY, startTime="14:00", endTime="15:00", allDay=False),
        # 취소된 일정 (취소 사유가 있는 기록)
        event("ev-3", "동네 모임", TODAY, canceled=True, cancelReason="일정 변경"),
        # 여러 날 일정
        event("ev-4", "제주 여행", "2026-11-20", endDate="2026-11-23", allDay=True),
    ]
    projects = [
        task("pj-1", "브랜드 포트폴리오", kind="프로젝트", category="업무",
             date="2026-11-10", due="2026-11-30"),
        task("pj-2", "집 정리", kind="프로젝트", category="개인", date="2026-11-15"),
        # 시간 없는 기본 할 일 · 연결 프로젝트 있음
        task("tk-1", "약국 들르기", category="개인", date=TODAY, projectIds=["pj-1"], url=TASK_URL),
        # 이미 시간이 저장된 할 일
        task("tk-2", "치과에 전화", category="개인", date=TODAY, startTime="10:00", endTime="10:30",
             projectIds=["pj-1"]),
        # 대기 중 · 대기 대상/내용/확인일이 채워진 할 일
        task("tk-3", "견적 회신 기다리기", category="업무", status="대기 중", date=TODAY,
             waitFor="거래처 담당자", waitNote="견적서 회신 오면 검토", checkedAt="2026-11-24",
             urgent=True, important=True),
        # 취소된 할 일
        task("tk-4", "옷장 비우기", category="개인", status="취소", date="2026-11-22",
             cancelReason="일정 변경"),
        # 숨김·히스토리 기록 (세부 옵션이 접힌 채로도 값이 보이는지)
        task("tk-5", "정리한 서류 보관", category="개인", date=TODAY, hidden=True, history=True),
    ]
    return dict(calendar=calendar, projects=projects, routines=[], binder=[], archive=[])


class Mock:
    def __init__(self, data):
        self.data = data
        self.calls = []
        self.seq = 0
        self.fail_next = False

    def resource_of(self, path):
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)", path)
        return m.group(1) if m else None

    def item(self, resource, item_id):
        for it in self.data[resource]:
            if it["id"] == item_id:
                return it
        return None

    def handle(self, route, request):
        url = urllib.parse.urlparse(request.url)
        path = url.path
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
        if resource and path.endswith("/blocks") and method == "GET":
            body = self.data.get("_bodies", {}).get(path.split("/")[-2], {"text": "", "preserved": []})
            return route.fulfill(json={"ok": True, "data": body})
        if path == "/api/upload":
            return route.fulfill(json={"ok": True, "data": {"token": "upload:up-1", "id": "up-1", "name": "photo.jpg"}})
        if resource and path.endswith("/blocks") is False and method == "PUT":
            return route.fulfill(json={"ok": True, "data": {"text": "", "preserved": []}})
        if resource and method == "POST" and not re.search(r"/(schema|blocks)$", path):
            body = json.loads(request.post_data or "{}")
            self.calls.append(("POST", resource, body))
            self.seq += 1
            new = dict(task(f"new-{self.seq}", body.get("title", "새 항목")), **body)
            new["id"] = f"new-{self.seq}"
            new["url"] = f"https://www.notion.so/umana/{abs(hash(new['id'])):032x}"[:300]
            self.data[resource].append(new)
            return route.fulfill(json={"ok": True, "data": new})
        m = re.match(r"^/api/notion/(calendar|projects|routines|binder|archive)/([^/]+)(/blocks)?$", path)
        if m and m.group(3) and method in ("PUT", "POST"):
            body = json.loads(request.post_data or "{}")
            self.calls.append(("BODY", m.group(1), m.group(2), body))
            self.data.setdefault("_bodies", {})[m.group(2)] = {"text": body.get("text", ""), "preserved": []}
            return route.fulfill(json={"ok": True, "data": {"text": body.get("text", ""), "preserved": []}})
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

    def patches(self, resource=None):
        return [c for c in self.calls if c[0] == "PATCH" and (resource is None or c[1] == resource)]

    def posts(self, resource=None):
        return [c for c in self.calls if c[0] == "POST" and (resource is None or c[1] == resource)]

    def bodies(self):
        return [c for c in self.calls if c[0] == "BODY"]
