"""A44 4건 통합 검증 — PC(1440x900)·모바일(390x844).

1) 캘린더 상단 2줄 구조 — 윗줄 접힘, 고정 줄 위치 고정, 모바일 한 줄
2) 새 일정·일정 수정 창 압축 배치 + `여러 날` 토글(종일+여러 날 / 시간 지정+여러 날)
3) 하루짜리 종일 일정도 색 막대 — 완료·취소는 흐림 + 취소선
4) `할 일` 토글(기본 OFF) + `할 일 N개` + 하루 목록 시트 + 주간 프로젝트 영역 연동
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3219")
OUT = os.environ.get("OUT", "/workspace/downloads")
SHELL = "/workspace/.tools/chrome/chrome-headless-shell-linux64/chrome-headless-shell"
LIBS = "/workspace/.tools/chrome-libs"
os.makedirs(OUT, exist_ok=True)

results = []
errors = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def boot(browser, width, height, tag, storage=None):
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale="ko-KR", timezone_id="Asia/Seoul",
                              is_mobile=width < 640, has_touch=width < 640)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"[{tag}] {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
    if storage:
        ctx.add_init_script("window.localStorage.setItem(%s, %s)" % (json.dumps(list(storage)[0]), json.dumps(list(storage.values())[0])))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1400)
    return ctx, page


def boxes(page, selector):
    return page.evaluate("""(sel) => [...document.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), label: (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 18)};
    })""", selector)


def click_aria(page, label):
    page.evaluate("""(label) => {
      const b = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label);
      if (b) b.click();
    }""", label)


def close_overlays(page):
    """열린 시트/상세를 확실히 닫습니다 — 하루 목록 시트는 Escape 로 닫히지 않습니다."""
    page.evaluate("""() => {
      const sheet = document.querySelector('[data-day-list]');
      if (sheet) {
        const btn = [...sheet.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '닫기');
        (btn || sheet.querySelector('[aria-label="닫기"]')).click();
        return;
      }
      const close = document.querySelector('[data-detail-close]');
      if (close) close.click();
      else {
        const x = [...document.querySelectorAll('[role="dialog"] [aria-label="닫기"]')].pop();
        if (x) x.click();
      }
    }""")
    page.wait_for_timeout(600)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox", "--disable-dev-shm-usage"],
                                env={**os.environ, "LD_LIBRARY_PATH": LIBS})

    # ══════════════════════ PC ══════════════════════
    ctx, page = boot(browser, 1440, 900, "pc")
    page.screenshot(path=f"{OUT}/a44-01-pc-week-top.png")

    # ── 1) 두 줄 구조 ──
    row1 = page.evaluate("""() => {
      const el = document.querySelector('#calendar-header-rows');
      return el ? {text: el.innerText.replace(/\\n/g, ' ')} : null;
    }""")
    row1_text = row1["text"] if row1 else ""
    need1 = ["전체", "업무", "개인", "공부", "루틴", "오늘", "일괄 관리", "NOW"]
    check("1 윗줄 — 날짜·분류 필터·루틴·오늘·일괄 관리·NOW·휴지통", all(word in row1_text for word in need1)
          and bool(page.query_selector('[data-bulk-open="calendar"]')) and bool(page.query_selector('[aria-label="휴지통"]'))
          and bool(page.query_selector('[aria-label="검색"]')), row1_text[:120])
    fixed = page.evaluate("""() => {
      const row = document.querySelector('[data-calendar-fixed-row]');
      const views = [...document.querySelectorAll('[data-view-switch] button')].map(b => b.getAttribute('aria-label'));
      const el = document.querySelector('[data-calendar-tasks-toggle]');
      return {
        views,
        tasks: el ? el.getAttribute('aria-pressed') : null,
        arrow: !!document.querySelector('[data-calendar-header-toggle]'),
        add: !!document.querySelector('[data-new-event]'),
        y: Math.round(row.getBoundingClientRect().y),
        h: Math.round(row.getBoundingClientRect().height),
        labels: [...row.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') || b.innerText || '').trim()),
      };
    }""")
    check("1 고정 줄 — 연간·월간·주간·3일·일간 + 화살표 + 할 일 + 새 일정",
          fixed["views"] == ["연간", "월간", "주간", "3일", "일간"] and fixed["arrow"] and fixed["add"] and fixed["tasks"] == "false",
          json.dumps({k: fixed[k] for k in ("views", "tasks", "arrow", "add")}, ensure_ascii=False))

    xs = {}
    for view in ("month", "week", "three", "day", "year"):
        click_aria(page, {"month": "월간", "week": "주간", "three": "3일", "day": "일간", "year": "연간"}[view])
        page.wait_for_timeout(550)
        vb = boxes(page, "[data-view-switch]")
        fb = boxes(page, "[data-calendar-tasks-toggle]")
        xs[view] = (vb[0]["x"], vb[0]["y"], fb[0]["x"] if fb else None)
    same = len({v[0] for v in xs.values()}) == 1 and len({v[1] for v in xs.values()}) == 1
    check("1 보기와 상관없이 고정 줄 같은 자리", same, json.dumps(xs, ensure_ascii=False))

    click_aria(page, "월간")
    page.wait_for_timeout(500)
    page.click('[data-calendar-header-toggle="collapse"]')
    page.wait_for_timeout(500)
    collapsed = page.evaluate("""() => {
      const rows = document.querySelector('#calendar-header-rows');
      const vb = document.querySelector('[data-view-switch]');
      const r = vb.getBoundingClientRect();
      return {
        hidden: getComputedStyle(rows).display === 'none',
        viewX: Math.round(r.x), viewY: Math.round(r.y),
        arrow: document.querySelector('[data-calendar-header-toggle]')?.getAttribute('data-calendar-header-toggle'),
        tasks: !!document.querySelector('[data-calendar-tasks-toggle]'),
      };
    }""")
    check("1 윗줄 접힘 — 분류·도구만 숨고 고정 줄은 그대로",
          collapsed["hidden"] and collapsed["arrow"] == "expand" and collapsed["tasks"]
          and collapsed["viewX"] == xs["month"][0], json.dumps(collapsed, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-02-pc-collapsed.png")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1300)
    kept = page.evaluate("""() => document.querySelector('[data-calendar-header]')?.getAttribute('data-header-collapsed')""")
    check("1 접힘 상태 localStorage 유지", kept == "true", str(kept))
    page.click('[data-calendar-header-toggle="expand"]')
    page.wait_for_timeout(400)

    # ── 4) 할 일 토글 (기본 OFF) ──
    click_aria(page, "월간")
    page.wait_for_timeout(600)
    m = page.evaluate("""() => {
      const tasks = [...document.querySelectorAll('[data-month-item]')].map(el => el.getAttribute('data-month-item')).filter(id => id.startsWith('demo-tk') || id.startsWith('demo-pj'));
      const counts = [...document.querySelectorAll('[data-month-task-count]')].map(el => ({day: el.getAttribute('data-month-task-count'), text: el.innerText.trim()})) .filter(x => x.text);
      return {tasks: tasks.slice(0, 5), counts: counts.slice(0, 4), pressed: document.querySelector('[data-calendar-tasks-toggle]').getAttribute('aria-pressed')};
    }""")
    check("4 기본 OFF — 월간 칸에 할 일 없음 · `할 일 N개` 표기",
          m["pressed"] == "false" and len(m["tasks"]) == 0 and len(m["counts"]) > 0,
          json.dumps(m, ensure_ascii=False)[:220])
    page.screenshot(path=f"{OUT}/a44-03-pc-month-tasks-off.png")

    # 하루 목록 시트는 토글과 상관없이 일정+할 일 모두
    page.evaluate("""() => {
      const target = [...document.querySelectorAll('[data-month-cell]')].find(el => (el.innerText || '').includes('아침 요가'))
        || [...document.querySelectorAll('[data-month-cell]')].find(el => (el.innerText || '').includes(':'));
      target.click();
    }""")
    page.wait_for_timeout(700)
    sheet = page.evaluate("""() => {
      const s = document.querySelector('[data-day-list]');
      if (!s) return null;
      return {events: s.querySelectorAll('[data-day-list-event]').length, tasks: s.querySelectorAll('[data-day-list-task]').length,
              text: s.innerText.replace(/\\n/g, ' ').slice(0, 90)};
    }""")
    check("4 하루 목록 시트 — 토글 OFF여도 일정·할 일 모두", bool(sheet) and sheet["events"] > 0 and sheet["tasks"] > 0,
          json.dumps(sheet, ensure_ascii=False)[:200])
    page.screenshot(path=f"{OUT}/a44-04-pc-daylist.png")
    close_overlays(page)

    page.click('[data-calendar-tasks-toggle]')
    page.wait_for_timeout(600)
    on = page.evaluate("""() => {
      const tasks = [...document.querySelectorAll('[data-month-item]')].map(el => el.getAttribute('data-month-item')).filter(id => id.startsWith('demo-tk'));
      return {tasks: tasks.length, counts: document.querySelectorAll('[data-month-task-count]').length,
              pressed: document.querySelector('[data-calendar-tasks-toggle]').getAttribute('aria-pressed')};
    }""")
    check("4 토글 ON — 월간 칸에 할 일 표시", on["pressed"] == "true" and on["tasks"] > 0 and on["counts"] == 0,
          json.dumps(on, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-05-pc-month-tasks-on.png")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1300)
    persisted = page.evaluate("""() => document.querySelector('[data-calendar-tasks-toggle]').getAttribute('aria-pressed')""")
    check("4 토글 상태 localStorage 유지", persisted == "true", str(persisted))

    # ── 3) 하루짜리 종일 일정 막대 ──
    click_aria(page, "월간")
    page.wait_for_timeout(600)
    bars = page.evaluate("""() => {
      const out = {};
      for (const el of document.querySelectorAll('[data-month-span]')) {
        const id = el.getAttribute('data-month-span');
        const cs = getComputedStyle(el);
        out[id] = out[id] || {bg: cs.backgroundColor, deco: cs.textDecorationLine, opacity: cs.opacity,
                               w: Math.round(el.getBoundingClientRect().width), text: el.innerText.trim().slice(0, 14)};
      }
      return out;
    }""")
    single = bars.get("demo-ev-6")          # 주간 장보기 — 하루짜리 종일
    done = bars.get("demo-ev-7")            # 도서관 반납 — 하루짜리 종일 + 완료
    timed_text = page.evaluate("""() => [...document.querySelectorAll('[data-month-item]')].map(el => el.getAttribute('data-month-item'))""")
    check("3 월간 — 하루짜리 종일도 색 막대", bool(single) and single["bg"] not in ("rgba(0, 0, 0, 0)", "transparent") and single["deco"] == "none",
          json.dumps({"single": single, "done": done}, ensure_ascii=False)[:240])
    check("3 완료된 종일 일정 — 흐림 + 취소선", bool(done) and done["deco"] == "line-through" and float(done["opacity"]) < 0.8,
          json.dumps(done, ensure_ascii=False)[:160])
    check("3 시간 지정 일정은 글자 칩 그대로", "demo-ev-1" in timed_text and "demo-ev-6" not in timed_text,
          json.dumps(timed_text[:6], ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-06-pc-month-bars.png")

    # ── 4) 주간 프로젝트 영역 연동 + 기존 접기 버튼 유지 ──
    click_aria(page, "주간")
    page.wait_for_timeout(700)
    week_on = page.evaluate("""() => ({
      cells: document.querySelectorAll('[data-week-project-cell]').length,
      toggle: document.querySelector('[data-week-projects-toggle]')?.innerText.trim(),
    })""")
    check("4 주간 ON — 프로젝트 행 보임 · 접기 버튼 유지", week_on["cells"] > 0 and "접기" in (week_on["toggle"] or ""),
          json.dumps(week_on, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-07-pc-week-tasks-on.png")

    page.click('[data-calendar-tasks-toggle]')
    page.wait_for_timeout(600)
    week_off = page.evaluate("""() => ({
      cells: document.querySelectorAll('[data-week-project-cell]').length,
      toggle: document.querySelector('[data-week-projects-toggle]')?.innerText.trim(),
      count: document.querySelector('[data-week-task-count]')?.innerText.trim(),
      section: !!document.querySelector('[data-week-section="projects"]'),
    })""")
    check("4 주간 OFF — 프로젝트 행 숨김 · 접기 버튼 남음 · `할 일 N개`",
          week_off["cells"] == 0 and week_off["section"] and week_off["toggle"] and week_off["count"] and "할 일" in week_off["count"],
          json.dumps(week_off, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-08-pc-week-tasks-off.png")
    page.click('[data-week-projects-toggle]')
    page.wait_for_timeout(600)
    restored = page.evaluate("""() => ({
      cells: document.querySelectorAll('[data-week-project-cell]').length,
      pressed: document.querySelector('[data-calendar-tasks-toggle]').getAttribute('aria-pressed'),
    })""")
    check("4 가려진 프로젝트 영역에서 `펴기` → 할 일 토글 켜짐", restored["cells"] > 0 and restored["pressed"] == "true",
          json.dumps(restored, ensure_ascii=False))

    # 주간 하루짜리 종일 막대 + 완료 취소선
    wbars = page.evaluate("""() => [...document.querySelectorAll('[data-all-day-bar]')].map(el => {
      const cs = getComputedStyle(el);
      return {id: el.getAttribute('data-all-day-bar'), bg: cs.backgroundColor, deco: cs.textDecorationLine, opacity: cs.opacity};
    })""")
    wb = {b["id"]: b for b in wbars}
    check("3 주간 — 하루짜리 종일도 색 막대", bool(wb.get("demo-ev-6")) and wb["demo-ev-6"]["bg"] not in ("rgba(0, 0, 0, 0)", "transparent"),
          json.dumps(wb.get("demo-ev-6"), ensure_ascii=False))
    list_ids = page.evaluate("""() => [...document.querySelectorAll('[data-week-event]')].map(el => el.getAttribute('data-week-event'))""")
    check("3 주간 — 시간 지정 일정은 목록에 남음", "demo-ev-1" in list_ids and "demo-ev-6" not in list_ids,
          json.dumps(list_ids[:8], ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-09-pc-week-bars.png")

    # ── 2) 새 일정 창 ──
    page.click('[data-new-event="true"]')
    page.wait_for_timeout(700)
    ed = page.evaluate("""() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[data-editor-quick-row]'));
      if (!dlg) return null;
      const pressed = (label) => {
        const b = [...dlg.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').startsWith(label));
        return b ? b.getAttribute('aria-pressed') : null;
      };
      const y = (sel) => { const el = dlg.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().y) : null; };
      const yOfText = (text) => {
        const el = [...dlg.querySelectorAll('*')].find(x => x.children.length === 0 && (x.textContent || '').trim() === text);
        return el ? Math.round(el.getBoundingClientRect().y) : null;
      };
      return {
        allDay: pressed('종일'), timed: pressed('시간 지정'), multi: pressed('여러 날'),
        endDate: !!dlg.querySelector('[aria-label="종료 날짜"]'),
        start: !!dlg.querySelector('input[type="time"]'),
        order: {
          title: y('input[autofocus], input[placeholder="무엇을 기록할까요?"]'),
          quick: y('[data-editor-quick-row]'),
          date: y('[aria-label="날짜"]'),
          category: yOfText('분류'),
          memo: yOfText('메모'),
          more: yOfText('세부 옵션'),
        },
      };
    }""")
    order_ok = ed and all(ed["order"][k] is not None for k in ed["order"]) and \
        ed["order"]["title"] < ed["order"]["quick"] < ed["order"]["date"] < ed["order"]["category"] < ed["order"]["memo"] < ed["order"]["more"]
    check("2 새 일정 — 기본은 하루·종일, 여러 날 꺼짐·종료 날짜 접힘",
          ed and ed["allDay"] == "true" and ed["multi"] == "false" and not ed["endDate"] and not ed["start"],
          json.dumps({k: ed[k] for k in ("allDay", "timed", "multi", "endDate", "start")} if ed else None, ensure_ascii=False))
    check("2 새 일정 — ①제목 ②일시 ③분류 ④메모 ⑤세부 옵션 순서", order_ok, json.dumps(ed["order"] if ed else None))
    page.screenshot(path=f"{OUT}/a44-10-pc-editor-default.png")

    page.click('[data-editor-multi-day="true"]')
    page.wait_for_timeout(500)
    combo1 = page.evaluate("""() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[data-editor-quick-row]'));
      const multi = dlg.querySelector('[data-editor-multi-day]');
      const end = dlg.querySelector('[aria-label="종료 날짜"]');
      const allDay = [...dlg.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('종일'));
      return {multi: multi.getAttribute('aria-pressed'), allDay: allDay.getAttribute('aria-pressed'),
              end: !!end, endY: end ? Math.round(end.getBoundingClientRect().y) : null,
              timeHidden: !dlg.querySelector('input[type="time"]')};
    }""")
    check("2 종일 + 여러 날 — 종료 날짜 펼침", combo1["multi"] == "true" and combo1["allDay"] == "true" and combo1["end"] and combo1["timeHidden"],
          json.dumps(combo1, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-11-pc-editor-allday-multi.png")

    page.evaluate("""() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[data-editor-quick-row]'));
      [...dlg.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('시간 지정')).click();
    }""")
    page.wait_for_timeout(500)
    combo2 = page.evaluate("""() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[data-editor-quick-row]'));
      const multi = dlg.querySelector('[data-editor-multi-day]');
      const timed = [...dlg.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('시간 지정'));
      return {multi: multi.getAttribute('aria-pressed'), timed: timed.getAttribute('aria-pressed'),
              end: !!dlg.querySelector('[aria-label="종료 날짜"]'), times: dlg.querySelectorAll('input[type="time"]').length};
    }""")
    check("2 시간 지정 + 여러 날 — 둘 다 켜짐 · 시각·종료 날짜 함께",
          combo2["multi"] == "true" and combo2["timed"] == "true" and combo2["end"] and combo2["times"] == 2,
          json.dumps(combo2, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-12-pc-editor-timed-multi.png")

    page.click('[data-editor-multi-day="true"]')
    page.wait_for_timeout(400)
    off_again = page.evaluate("""() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[data-editor-quick-row]'));
      return {multi: dlg.querySelector('[data-editor-multi-day]').getAttribute('aria-pressed'), end: !!dlg.querySelector('[aria-label="종료 날짜"]')};
    }""")
    check("2 여러 날 끄면 하루짜리로 접힘", off_again["multi"] == "false" and not off_again["end"], json.dumps(off_again))
    close_overlays(page)

    # ── 일정 상세(수정 창) ──
    page.evaluate("""() => {
      const bar = document.querySelector('[data-all-day-bar="demo-ev-6"]');
      if (bar) bar.click();
    }""")
    page.wait_for_timeout(800)
    detail = page.evaluate("""() => {
      const dlg = document.querySelector('[data-detail-close]')?.closest('[role="dialog"]');
      if (!dlg) return null;
      const multi = [...dlg.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('여러 날'));
      const more = [...dlg.querySelectorAll('button')].find(b => (b.innerText || '').trim().startsWith('세부 옵션'));
      return {multi: multi ? multi.getAttribute('aria-pressed') : null,
              endVisible: !!dlg.querySelector('[aria-label="종료 날짜 수정"]') || dlg.innerText.includes('종료 날짜'),
              moreOpen: more ? more.getAttribute('aria-expanded') : null};
    }""")
    check("2 일정 상세 — `여러 날` 토글이 본문에 있고 꺼져 있음(세부 옵션 아님)",
          detail and detail["multi"] == "false" and detail["moreOpen"] == "false" and not detail["endVisible"],
          json.dumps(detail, ensure_ascii=False))
    page.click('[data-detail-close] >> nth=0') if False else None
    page.evaluate("""() => {
      const dlg = document.querySelector('[data-detail-close]')?.closest('[role="dialog"]');
      [...dlg.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('여러 날')).click();
    }""")
    page.wait_for_timeout(700)
    detail2 = page.evaluate("""() => {
      const dlg = document.querySelector('[data-detail-close]')?.closest('[role="dialog"]');
      const multi = [...dlg.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('여러 날'));
      const more = [...dlg.querySelectorAll('button')].find(b => (b.innerText || '').trim().startsWith('세부 옵션'));
      const endRow = [...dlg.querySelectorAll('*')].find(x => x.children.length === 0 && (x.textContent || '').trim() === '종료 날짜');
      return {multi: multi.getAttribute('aria-pressed'), end: !!endRow,
              belowTime: endRow ? true : false, y: endRow ? Math.round(endRow.getBoundingClientRect().y) : null,
              moreOpen: more.getAttribute('aria-expanded')};
    }""")
    check("2 일정 상세 — 여러 날 켜면 종료 날짜 줄 펼침", detail2["multi"] == "true" and detail2["end"] and detail2["moreOpen"] == "false",
          json.dumps(detail2, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/a44-13-pc-detail-multi.png")
    close_overlays(page)

    ctx.close()

    # ══════════════════════ 모바일 ══════════════════════
    ctx3, page3 = boot(browser, 390, 844, "mobile")
    page3.screenshot(path=f"{OUT}/a44-14-mo-week.png")

    mobiles = {}
    for view, label in (("week", "주간"), ("month", "월간"), ("three", "3일"), ("day", "일간"), ("year", "연간")):
        click_aria(page3, label)
        page3.wait_for_timeout(550)
        fb = boxes(page3, "[data-calendar-fixed-row]")
        vb = boxes(page3, "[data-view-switch]")
        tb = boxes(page3, "[data-calendar-tasks-toggle]")
        ab = boxes(page3, "[data-new-event]")
        mobiles[view] = {
            "fixed": fb[0], "view": vb[0], "tasks": tb[0] if tb else None, "add": ab[0] if ab else None,
            "fit": page3.evaluate("""() => { const r = document.querySelector('[data-calendar-fixed-row]'); return {scroll: r.scrollWidth, client: r.clientWidth}; }"""),
        }
    ok_fit = all(v["fit"]["scroll"] <= v["fit"]["client"] + 1 for v in mobiles.values())
    tops = {round(v["view"]["y"]) for v in mobiles.values()}
    lefts = {round(v["view"]["x"]) for v in mobiles.values()}
    check("1 모바일 — 고정 줄 한 줄에 다 들어감", ok_fit,
          json.dumps({k: v["fit"] for k, v in mobiles.items()}, ensure_ascii=False))
    check("1 모바일 — 보기가 바뀌어도 고정 줄 같은 자리", len(tops) == 1 and len(lefts) == 1,
          json.dumps({"y": sorted(tops), "x": sorted(lefts)}))
    row_one_line = all(
        abs(mobiles["week"]["tasks"]["y"] - mobiles["week"]["view"]["y"]) < 10
        and mobiles["week"]["add"]["right"] <= 390
        and mobiles["week"]["fixed"]["h"] < 46
        for _ in [0])
    check("1 모바일 — [연·월·주·3일·일] ^ 할 일 + 가 한 줄", row_one_line,
          json.dumps(mobiles["week"], ensure_ascii=False)[:220])
    page3.screenshot(path=f"{OUT}/a44-15-mo-fixed-row.png")

    # 모바일 할 일 토글 + 월간 셈
    click_aria(page3, "월간")
    page3.wait_for_timeout(700)
    m_off = page3.evaluate("""() => ({
      pressed: document.querySelector('[data-calendar-tasks-toggle]').getAttribute('aria-pressed'),
      tasks: [...document.querySelectorAll('[data-month-item]')].filter(el => (el.getAttribute('data-month-item') || '').startsWith('demo-tk')).length,
      counts: [...document.querySelectorAll('[data-month-task-count]')].filter(el => el.innerText.trim()).length,
    })""")
    check("4 모바일 — 기본 OFF · `할 일 N개`", m_off["pressed"] == "false" and m_off["tasks"] == 0 and m_off["counts"] > 0,
          json.dumps(m_off))
    page3.screenshot(path=f"{OUT}/a44-16-mo-month.png")
    page3.click('[data-calendar-tasks-toggle]')
    page3.wait_for_timeout(600)
    m_on = page3.evaluate("""() => [...document.querySelectorAll('[data-month-item]')].filter(el => (el.getAttribute('data-month-item') || '').startsWith('demo-tk')).length""")
    check("4 모바일 — 토글 ON 이면 할 일 표시", m_on > 0, str(m_on))
    page3.screenshot(path=f"{OUT}/a44-17-mo-month-on.png")

    # 모바일 새 일정 창
    page3.click('[data-new-event="true"]')
    page3.wait_for_timeout(700)
    med = page3.evaluate("""() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector('[data-editor-quick-row]'));
      if (!dlg) return null;
      const r = dlg.getBoundingClientRect();
      return {w: Math.round(r.width), multi: dlg.querySelector('[data-editor-multi-day]')?.getAttribute('aria-pressed'),
              overflowX: dlg.scrollWidth - dlg.clientWidth};
    }""")
    check("2 모바일 새 일정 — 여러 날 토글 보임 · 가로 넘침 없음", med and med["multi"] == "false" and med["overflowX"] <= 1,
          json.dumps(med))
    page3.click('[data-editor-multi-day="true"]')
    page3.wait_for_timeout(500)
    page3.screenshot(path=f"{OUT}/a44-18-mo-editor-multi.png")
    page3.keyboard.press("Escape")
    page3.wait_for_timeout(500)
    ctx3.close()

    browser.close()

print("\nERRORS:", errors[:12])
fails = [r for r in results if not r[1]]
print(f"\nRESULT: {len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails or errors else 0)
