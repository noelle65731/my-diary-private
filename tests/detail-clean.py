"""일정·할 일 상세/수정 화면 개편 검증 (PC 1440×900 · 폰 402×874).

    DIST=.next-b2 ./detail-run.sh tests/detail-clean.py

모든 /api 호출은 브라우저 안에서 답하므로, 앱이 노션에 실제로 보내는 값(PATCH/POST/PUT)을
그대로 읽어 확인합니다.
"""

import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from detail_fixture import Mock, build_fixture  # noqa: E402

BASE = os.environ.get("BASE", "http://127.0.0.1:3231")
CHROME = os.environ.get("CHROME")
OUT = os.environ.get("OUT", "/workspace/work/detail-shots/verify")
os.makedirs(OUT, exist_ok=True)

FAILS = []
PASSES = []


def check(name, condition, detail=""):
    if condition:
        PASSES.append(name)
        print(f"PASS  {name}")
    else:
        FAILS.append(f"{name} {detail}".strip())
        print(f"FAIL  {name} {detail}")


def launch_args():
    args = ["--no-sandbox", "--disable-dev-shm-usage"]
    return {"executable_path": CHROME, "args": args} if CHROME else {"args": args}


def dialogs(page):
    return [(page.get_by_role("dialog").nth(i).get_attribute("aria-label") or "")
            for i in range(page.get_by_role("dialog").count())]


def detail(page, prefix):
    return page.get_by_role("dialog", name=re.compile("^" + re.escape(prefix)))


def month_view(page):
    page.get_by_role("button", name=re.compile("^월간$")).first.click()
    page.wait_for_timeout(700)


def open_event(page, title):
    month_view(page)
    page.get_by_role("button", name=re.compile(title)).first.click()
    page.wait_for_timeout(800)
    if any(label.startswith("일정") for label in dialogs(page)):
        return
    row = page.locator("[data-day-list-event]", has_text=title)
    if row.count():
        row.first.click()
        page.wait_for_timeout(800)


def goto_tab(page, name):
    page.get_by_role("button", name=re.compile(name)).last.click()
    page.wait_for_timeout(700)


def open_task(page, title):
    goto_tab(page, "프로젝트")
    page.get_by_role("button", name=re.compile(title)).first.click()
    page.wait_for_timeout(900)


def new_page(browser, width, height):
    mock = Mock(build_fixture())
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR")
    page = ctx.new_page()
    page.set_default_timeout(9000)
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.route("**/api/**", lambda route, request: mock.handle(route, request))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1", timeout=20000)
    page.wait_for_timeout(900)
    return ctx, page, mock, errors


def scroll_bottom(page):
    page.evaluate("""() => {
      const all = Array.from(document.querySelectorAll('[data-sheet-scroll]'));
      const el = all[all.length - 1];
      if (el) el.scrollTop = el.scrollHeight;
    }""")
    page.wait_for_timeout(250)


# ─────────────────────────── 일정 상세 ───────────────────────────

def verify_event(browser, width, height, tag):
    ctx, page, mock, errors = new_page(browser, width, height)
    open_event(page, "도서관 반납")
    box = detail(page, "일정")
    box.wait_for()
    text = box.inner_text()
    page.screenshot(path=f"{OUT}/{tag}-event-detail.png")
    box.screenshot(path=f"{OUT}/{tag}-event-detail-shell.png")

    for label in ["도서관 반납", "예정", "완료", "취소", "날짜", "시간", "분류", "색", "프로젝트", "메모", "세부 옵션"]:
        check(f"[{tag}] 일정 상세에 '{label}'", label in text, text[:200])
    check(f"[{tag}] 옛 '제목*' 라벨이 사라짐", "제목*" not in text)
    check(f"[{tag}] 안내 문구가 사라짐", "이전·바깥 클릭은" not in text and "변경 없음" not in text)

    link = box.get_by_role("link", name="노션에서 열기")
    check(f"[{tag}] '노션에서 열기'가 하나", link.count() == 1, str(link.count()))
    check(f"[{tag}] 노션 링크 주소", link.first.get_attribute("href") == "https://www.notion.so/umana/0123456789abcdef0123456789abcdef")
    check(f"[{tag}] 노션 링크는 새 탭", link.first.get_attribute("target") == "_blank")

    # 접힌 세부 옵션 — 배지로 켜 둔 값을 알 수 있습니다.
    more = box.get_by_role("button", name=re.compile("세부 옵션"))
    check(f"[{tag}] 세부 옵션은 기본 접힘", more.first.get_attribute("aria-expanded") == "false")
    before = len(mock.patches("calendar"))
    more.first.click()
    page.wait_for_timeout(400)
    opened = box.inner_text()
    check(f"[{tag}] 세부 옵션을 펼치면 유형·NOW 숨김", "유형" in opened and "NOW 숨김" in opened, opened[-300:])
    page.screenshot(path=f"{OUT}/{tag}-event-more.png")
    more.first.click()
    page.wait_for_timeout(300)
    check(f"[{tag}] 펼쳤다 접어도 저장 없음", len(mock.patches("calendar")) == before)

    # 인라인 수정 — 제목
    box.get_by_role("button", name="제목 수정").first.click()
    page.wait_for_timeout(200)
    title_input = page.get_by_role("textbox", name="제목 입력")
    title_input.fill("도서관 반납 (수정)")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1600)
    saved = mock.patches("calendar")
    check(f"[{tag}] 제목을 고치면 저장", bool(saved) and saved[-1][3].get("title") == "도서관 반납 (수정)",
          json.dumps(saved[-1][3], ensure_ascii=False) if saved else "no patch")
    check(f"[{tag}] 제목만 바뀐 저장(다른 값 없음)", bool(saved) and set(saved[-1][3].keys()) == {"title"},
          str(sorted(saved[-1][3].keys())) if saved else "")

    # 완료 칩 → done true
    box.get_by_role("button", name="상태: 완료").first.click()
    page.wait_for_timeout(1600)
    saved = mock.patches("calendar")
    check(f"[{tag}] 완료를 누르면 done=true", bool(saved) and saved[-1][3].get("done") is True,
          json.dumps(saved[-1][3], ensure_ascii=False) if saved else "")
    check(f"[{tag}] 완료만 바뀌면 취소 값은 보내지 않음", bool(saved) and "canceled" not in saved[-1][3],
          json.dumps(saved[-1][3], ensure_ascii=False) if saved else "")

    # 시간 지정
    box.get_by_role("button", name=re.compile("^시간 지정")).first.click()
    page.wait_for_timeout(1600)
    saved = mock.patches("calendar")
    body = saved[-1][3] if saved else {}
    check(f"[{tag}] 시간 지정을 켜면 시작 시각이 저장", body.get("startTime") == "09:00", json.dumps(body, ensure_ascii=False))
    check(f"[{tag}] 켜면 종료 시각 입력이 나타남", box.get_by_role("button", name="종료 수정").count() == 1)
    box.get_by_role("button", name="종료 수정").first.click()
    page.wait_for_timeout(200)
    page.get_by_role("textbox", name="종료 입력").fill("17:00")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1600)
    saved = mock.patches("calendar")
    check(f"[{tag}] 종료 시각 저장", saved and saved[-1][3].get("endTime") == "17:00",
          json.dumps(saved[-1][3], ensure_ascii=False) if saved else "")
    page.screenshot(path=f"{OUT}/{tag}-event-timed.png")

    # 닫기: 바깥 클릭은 한 단계(상세만 닫힘)
    check(f"[{tag}] 닫기 전 상세가 열려 있음", any(x.startswith("일정") for x in dialogs(page)))
    page.keyboard.press("Escape")
    page.wait_for_timeout(700)
    check(f"[{tag}] Esc로 상세가 닫힘", not any(x.startswith("일정") for x in dialogs(page)), str(dialogs(page)))
    check(f"[{tag}] 일정 상세 페이지 오류 없음", not errors, str(errors[:2]))
    ctx.close()


def verify_event_readonly(browser, width, height, tag):
    """읽기만 하고 닫으면 저장하지 않는다 + 취소된 일정은 사유가 바로 보인다."""
    ctx, page, mock, errors = new_page(browser, width, height)
    open_event(page, "동네 모임")
    box = detail(page, "일정")
    box.wait_for()
    text = box.inner_text()
    check(f"[{tag}] 취소된 일정은 취소 상태", box.get_by_role("button", name="상태: 취소").first.get_attribute("aria-pressed") == "true")
    check(f"[{tag}] 취소 사유가 첫 화면에 보임", "취소 사유" in text and "일정 변경" in text, text[:300])
    page.screenshot(path=f"{OUT}/{tag}-event-canceled.png")
    before = len(mock.patches("calendar"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(900)
    check(f"[{tag}] 읽기만 하고 닫으면 저장 없음", len(mock.patches("calendar")) == before,
          str(len(mock.patches("calendar")) - before))
    check(f"[{tag}] 취소 일정 화면 오류 없음", not errors, str(errors[:2]))
    ctx.close()


def verify_event_escape_stack(browser, width, height, tag):
    """폰: 하루 목록 위에 상세가 떠도 Esc는 상세만 닫고, X는 전부 닫습니다."""
    ctx, page, mock, errors = new_page(browser, width, height)
    open_event(page, "도서관 반납")
    detail(page, "일정").wait_for()
    if width <= 640:
        check(f"[{tag}] 폰: 뒤에 하루 목록이 남아 있음", any("하루 목록" in x for x in dialogs(page)), str(dialogs(page)))
        page.keyboard.press("Escape")
        page.wait_for_timeout(600)
        check(f"[{tag}] 폰: Esc 한 번에 상세만 닫힘", not any(x.startswith("일정") for x in dialogs(page))
              and any("하루 목록" in x for x in dialogs(page)), str(dialogs(page)))
        # 하루 목록에서 다시 상세를 열고 X로 전체 닫기
        page.locator("[data-day-list-event]", has_text="도서관 반납").first.click()
        page.wait_for_timeout(700)
        detail(page, "일정").get_by_role("button", name="전체 닫기").first.click()
        page.wait_for_timeout(700)
        check(f"[{tag}] 폰: X는 목록까지 전부 닫음", len(dialogs(page)) == 0, str(dialogs(page)))
    else:
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        open_event(page, "도서관 반납")
        detail(page, "일정").get_by_role("button", name="전체 닫기").first.click()
        page.wait_for_timeout(600)
        check(f"[{tag}] PC: X로 상세가 닫힘", len(dialogs(page)) == 0, str(dialogs(page)))
    check(f"[{tag}] 닫기 규칙 화면 오류 없음", not errors, str(errors[:2]))
    ctx.close()


# ─────────────────────────── 할 일 상세 ───────────────────────────

def verify_task(browser, width, height, tag):
    ctx, page, mock, errors = new_page(browser, width, height)
    open_task(page, "약국 들르기")
    box = detail(page, "할 일")
    box.wait_for()
    text = box.inner_text()
    page.screenshot(path=f"{OUT}/{tag}-task-detail.png")
    box.screenshot(path=f"{OUT}/{tag}-task-detail-shell.png")

    for label in ["약국 들르기", "미완료", "대기 중", "완료", "취소", "긴급", "중요", "이번 주 꼭", "날짜", "시간 지정", "마감일", "분류", "프로젝트", "내용", "메모", "세부 옵션"]:
        check(f"[{tag}] 할 일 상세에 '{label}'", label in text, text[:200])
    check(f"[{tag}] '표시'·'기타' 같은 모호한 제목이 사라짐", "표시" not in text and "기타" not in text)
    check(f"[{tag}] 안내 문구가 사라짐", "바뀐 값이 없으면" not in text)

    link = box.get_by_role("link", name="노션에서 열기")
    check(f"[{tag}] 할 일 '노션에서 열기'가 하나", link.count() == 1, str(link.count()))
    check(f"[{tag}] 할 일 노션 링크 주소", link.first.get_attribute("href") == "https://www.notion.so/umana/fedcba9876543210fedcba9876543210")

    # 기본은 시간 없음
    toggle = box.get_by_role("button", name=re.compile("시간 지정"))
    check(f"[{tag}] 시간 지정 기본은 꺼짐", toggle.first.get_attribute("aria-pressed") == "false")
    check(f"[{tag}] 꺼져 있으면 시작 입력 없음", box.get_by_role("button", name="시작 수정").count() == 0)

    # 세부 옵션 — NOW 숨김 · History
    more = box.get_by_role("button", name=re.compile("세부 옵션"))
    check(f"[{tag}] 할 일 세부 옵션 기본 접힘", more.first.get_attribute("aria-expanded") == "false")
    before = len(mock.patches("projects"))
    more.first.click()
    page.wait_for_timeout(400)
    more_text = box.inner_text()
    check(f"[{tag}] 세부 옵션에 NOW 숨김·History", "NOW 숨김" in more_text and "History" in more_text, more_text[-300:])
    page.screenshot(path=f"{OUT}/{tag}-task-more.png")
    box.get_by_role("switch", name="History").first.click()
    page.wait_for_timeout(1600)
    saved = mock.patches("projects")
    check(f"[{tag}] History를 켜면 저장", len(saved) > before and saved[-1][3].get("history") is True,
          json.dumps(saved[-1][3], ensure_ascii=False) if saved else "")
    box.get_by_role("switch", name="History").first.click()
    page.wait_for_timeout(1600)

    # 시간 지정 켜고 저장
    box.get_by_role("button", name=re.compile("^시간 지정")).first.click()
    page.wait_for_timeout(1600)
    saved = mock.patches("projects")
    body = saved[-1][3] if saved else {}
    check(f"[{tag}] 켜면 시작·종료 입력이 나타남",
          box.get_by_role("button", name="시작 수정").count() == 1 and box.get_by_role("button", name="종료 수정").count() == 1)
    check(f"[{tag}] 켜면 시작 시각 저장", body.get("startTime") == "09:00", json.dumps(body, ensure_ascii=False))
    check(f"[{tag}] 날짜는 그대로", body.get("date") == "2026-11-21", str(body.get("date")))
    box.get_by_role("button", name="시작 수정").first.click()
    page.wait_for_timeout(200)
    page.get_by_role("textbox", name="시작 입력").fill("14:00")
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    box.get_by_role("button", name="종료 수정").first.click()
    page.wait_for_timeout(200)
    page.get_by_role("textbox", name="종료 입력").fill("15:30")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1600)
    saved = mock.patches("projects")
    check(f"[{tag}] 시작·종료 저장", saved and saved[-1][3].get("startTime") == "14:00" and saved[-1][3].get("endTime") == "15:30",
          json.dumps(saved[-1][3], ensure_ascii=False) if saved else "")
    page.screenshot(path=f"{OUT}/{tag}-task-timed.png")

    # 메모 인라인 수정
    box.get_by_role("button", name="메모 수정").first.click()
    page.wait_for_timeout(300)
    memo_box = page.get_by_role("textbox", name="메모 입력")
    memo_box.fill("약국 3시 전에")
    page.get_by_role("button", name="메모 입력 마침").first.click()
    page.wait_for_timeout(1600)
    saved = mock.patches("projects")
    check(f"[{tag}] 메모 저장", saved and saved[-1][3].get("memo") == "약국 3시 전에",
          json.dumps(saved[-1][3], ensure_ascii=False) if saved else "")

    # 내용(노션 본문)
    box.get_by_role("button", name=re.compile("내용 수정|눌러서 내용")).first.click()
    page.wait_for_timeout(300)
    page.get_by_role("textbox", name="내용 입력").fill("본문 첫 문단")
    page.get_by_role("button", name="내용 입력 마침").first.click()
    page.wait_for_timeout(1600)
    bodies = mock.bodies()
    check(f"[{tag}] 본문 저장", bool(bodies) and bodies[-1][3].get("text") == "본문 첫 문단",
          json.dumps(bodies[-1][3], ensure_ascii=False) if bodies else "no body call")

    # 상태 바꾸기 — 대기 중
    box.get_by_role("button", name="상태: 대기 중").first.click()
    page.wait_for_timeout(1600)
    waiting = box.inner_text()
    check(f"[{tag}] 대기 중이면 기다리는 칸이 나타남", "기다리는 중" in waiting and "대기 대상" in waiting, waiting[:300])
    page.screenshot(path=f"{OUT}/{tag}-task-becomes-waiting.png")

    page.keyboard.press("Escape")
    page.wait_for_timeout(700)
    check(f"[{tag}] 할 일 화면 오류 없음", not errors, str(errors[:2]))
    ctx.close()


def verify_task_waiting_canceled(browser, width, height, tag):
    ctx, page, mock, errors = new_page(browser, width, height)
    open_task(page, "견적 회신 기다리기")
    box = detail(page, "할 일")
    box.wait_for()
    text = box.inner_text()
    check(f"[{tag}] 대기 중 할 일: 대기 대상이 보임", "거래처 담당자" in text, text[:300])
    check(f"[{tag}] 대기 중 할 일: 확인일이 보임", "11/24" in text, text[:300])
    page.screenshot(path=f"{OUT}/{tag}-task-waiting.png")
    box.get_by_role("button", name="3일 뒤").first.click()
    page.wait_for_timeout(1600)
    saved = mock.patches("projects")
    import datetime
    expected = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
    check(f"[{tag}] '3일 뒤'로 확인일 저장", saved and saved[-1][3].get("checkedAt") == expected,
          json.dumps(saved[-1][3], ensure_ascii=False) if saved else "")
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)

    # 취소 상태인 할 일 — 목록에 없으므로 휴지통/상세는 대기 중 항목에서 상태를 바꿔 확인
    open_task(page, "약국 들르기")
    box = detail(page, "할 일")
    box.wait_for()
    box.get_by_role("button", name="상태: 취소").first.click()
    page.wait_for_timeout(1600)
    canceled = box.inner_text()
    check(f"[{tag}] 취소로 바꾸면 사유 칸이 나타남", "사유" in canceled and "일정 변경" in canceled, canceled[:300])
    page.screenshot(path=f"{OUT}/{tag}-task-canceled.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    check(f"[{tag}] 대기/취소 화면 오류 없음", not errors, str(errors[:2]))
    ctx.close()


# ─────────────────────────── 새로 만들기 ───────────────────────────

def verify_new_task(browser, width, height, tag):
    ctx, page, mock, errors = new_page(browser, width, height)
    goto_tab(page, "프로젝트")
    page.get_by_role("button", name=re.compile(r"^\+ 할 일$")).first.click()
    page.wait_for_timeout(800)
    panel = page.locator("[data-new-item-panel]").last
    text = panel.inner_text()
    check(f"[{tag}] 새 할 일 창이 열림", "새 할 일" in text, text[:120])
    check(f"[{tag}] 새 할 일 창에 세부 옵션이 접혀 있음", "세부 옵션" in text)
    page.get_by_placeholder("무엇을 해야 하나요?").fill("[테스트] 새 할 일")
    timed = panel.get_by_role("button", name=re.compile("시간 지정"))
    check(f"[{tag}] 편집기 시간 지정 기본 꺼짐", timed.first.get_attribute("aria-pressed") == "false")
    timed.first.click()
    page.wait_for_timeout(300)
    panel.get_by_label("시작 시간").fill("08:00")
    panel.get_by_label("종료 시간").fill("09:00")
    page.screenshot(path=f"{OUT}/{tag}-new-task.png")
    before = len(mock.posts("projects"))
    panel.get_by_role("button", name="추가", exact=True).first.click()
    page.wait_for_timeout(1500)
    created = mock.posts("projects")[before:]
    body = created[-1][2] if created else {}
    check(f"[{tag}] 새 할 일에 시작·종료가 저장", body.get("startTime") == "08:00" and body.get("endTime") == "09:00",
          json.dumps(body, ensure_ascii=False))
    check(f"[{tag}] 새 할 일 제목", body.get("title") == "[테스트] 새 할 일", str(body.get("title")))
    check(f"[{tag}] 새 할 일 화면 오류 없음", not errors, str(errors[:2]))
    ctx.close()


def verify_new_event(browser, width, height, tag):
    ctx, page, mock, errors = new_page(browser, width, height)
    goto_tab(page, "캘린더")
    page.wait_for_timeout(500)
    direct = page.get_by_role("button", name=re.compile("새 일정"))
    if direct.count() and direct.first.is_visible():
        direct.first.click()
    else:
        page.get_by_role("button", name="빠른 추가").first.click()
        page.wait_for_timeout(400)
        page.get_by_role("button", name=re.compile("^일정")).first.click()
    page.wait_for_timeout(900)
    modal = page.get_by_role("dialog").last
    text = modal.inner_text()
    check(f"[{tag}] 새 일정 창이 열림", "새 일정" in text, text[:120])
    modal.get_by_placeholder("무엇을 기록할까요?").fill("[테스트] 새 일정")
    modal.get_by_role("button", name="시간 지정").first.click()
    page.wait_for_timeout(300)
    times = modal.locator('input[type="time"]')
    check(f"[{tag}] 시간 지정을 켜면 시각 입력이 나타남", times.count() == 2, str(times.count()))
    page.screenshot(path=f"{OUT}/{tag}-new-event.png")
    before = len(mock.posts("calendar"))
    modal.get_by_role("button", name="추가", exact=True).first.click()
    page.wait_for_timeout(1500)
    created = mock.posts("calendar")[before:]
    body = created[-1][2] if created else {}
    check(f"[{tag}] 새 일정 저장", body.get("title") == "[테스트] 새 일정", json.dumps(body, ensure_ascii=False)[:200])
    check(f"[{tag}] 새 일정에 시작 시각", bool(body.get("startTime")), json.dumps(body, ensure_ascii=False)[:200])
    check(f"[{tag}] 새 일정 화면 오류 없음", not errors, str(errors[:2]))
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        for tag, w, h in (("pc", 1440, 900), ("mo", 402, 874)):
            verify_event(browser, w, h, tag)
            verify_event_readonly(browser, w, h, tag)
            verify_event_escape_stack(browser, w, h, tag)
            verify_task(browser, w, h, tag)
            verify_task_waiting_canceled(browser, w, h, tag)
            verify_new_task(browser, w, h, tag)
            verify_new_event(browser, w, h, tag)
        browser.close()

    print()
    print(f"PASS {len(PASSES)} · FAIL {len(FAILS)}")
    for fail in FAILS:
        print(" -", fail)
    return 1 if FAILS else 0


if __name__ == "__main__":
    raise SystemExit(main())
