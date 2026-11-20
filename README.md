# 나의 다이어리 · Notion-connected diary PWA

노션 데이터베이스 다섯 개를 그대로 쓰는 개인 다이어리 웹앱입니다.
PC에서는 넓은 화면으로, 아이폰에서는 홈 화면에 추가해 앱처럼 쓸 수 있습니다.

- **캘린더** — 연 / 월 / 주 / 3일 / 일 / 루틴 보기, 주간 목표·메모, 종일 일정 접기, 드래그로 옮기기
- **프로젝트** — Tracks(분류별) · Priority(긴급·중요 4분면) · History(지난 프로젝트·루틴)
- **바인더** — 주간 3줄 미리보기, 하루 문서 편집기(자동 저장), 노트 모아 보기
- **아카이브** — 메모 / 책 / 영화 / 레퍼런스 / 읽을거리, 별점·태그·즐겨찾기
- **공통** — 전체 검색, 글자 크기 1–6단계, 저장 상태 표시, NOW 숨김, 휴지통·복원

토큰이 없으면 **데모 데이터**로 화면을 먼저 둘러볼 수 있습니다. (저장되지 않음)

---

## 1. 빠른 시작 (로컬)

```bash
npm install
cp .env.example .env.local   # NOTION_TOKEN 입력
npm run dev                  # http://localhost:3000
```

- Node.js 20 이상이 필요합니다.
- `.env.local`에 토큰이 없어도 앱은 뜹니다. 이때는 예시 기록으로 동작하고, 상단에 `데모 미리보기` 띠가 보입니다.

빌드 확인:

```bash
npm run typecheck
npm run build
```

---

## 2. Notion 준비

### 2-1. 통합(Integration) 만들기

1. <https://www.notion.so/my-integrations> → **New integration**
2. 이름을 정하고 워크스페이스를 고른 뒤 **Internal Integration Secret**을 복사합니다.
3. 이 값이 `NOTION_TOKEN`입니다. **절대 브라우저 코드에 넣지 마세요.**

### 2-2. 데이터베이스에 통합 연결

사용할 DB를 노션에서 열고 우측 상단 `···` → **Connections** → 방금 만든 통합을 추가합니다.
연결하지 않은 DB는 API에서 `404`로 보입니다.

### 2-3. DB 다섯 개

이 앱은 아래 다섯 DB를 사용합니다. 다른 DB를 쓰려면 `.env`의 ID만 바꾸면 됩니다.

| 환경변수 | 기본 DB | 용도 |
| --- | --- | --- |
| `NOTION_CALENDAR_DB_ID` | `41d6ed96-9c5d-81d9-b6e9-c1e1becd2b91` | 일정 · 주간 목표 · 주간 메모 · 월간 메모 |
| `NOTION_PROJECTS_DB_ID` | `41d6ed96-9c5d-8168-81d2-db94f71eae36` | 프로젝트 · 할 일 |
| `NOTION_ROUTINE_DB_ID` | `41d6ed96-9c5d-81f2-9ffe-c119024e6a0d` | 루틴 · 체크 기록 |
| `NOTION_BINDER_DB_ID` | `41d6ed96-9c5d-818e-8dd4-ded353ee362f` | 일기 · 노트 |
| `NOTION_ARCHIVE_DB_ID` | `41d6ed96-9c5d-81f2-983a-e865c94e692c` | 아카이브 |

> 데이터베이스 ID는 노션 URL의 32자리 문자열입니다.
> `https://www.notion.so/<workspace>/<DB_ID>?v=...`

### 2-4. 속성 이름 (그대로 유지해 주세요)

속성 이름이 다르면 값이 저장되지 않습니다. 이름을 바꾸고 싶다면 `src/lib/notion-map.ts`를 함께 고치세요.

**캘린더 기록**
`제목`(title) · `유형`(select: 일정/주간 목표/주간 메모/월간 메모) · `분류`(select: 개인/외부일정/성과/휴먼네트워크) · `날짜`(date) · `완료`·`취소`(checkbox) · `취소 사유`(rich text) · `취소 시각`(date) · `기타`(rich text) · `NOW 숨김`·`즐겨찾기`·`휴지통`(checkbox) · `주간 키`(rich text) · `작성 기준일`(date) · `연결 프로젝트`(relation) · `정렬`(number)

**프로젝트 · 할 일**
`제목` · `유형`(프로젝트/할 일) · `분류`(업무/개인/공부) · `상태`(status: 미완료/대기 중/완료/취소) · `날짜` · `마감일` · `완료일` · `확인일` · `긴급`·`중요`·`NOW 숨김`·`History`·`휴지통` · `기타` · `대기 대상`·`대기 내용`·`취소 사유` · `취소 시각` · `반복 묶음 ID` · `연결 프로젝트`

**루틴 · 체크 기록**
`제목` · `유형`(루틴/날짜별 체크) · `분류`(개인/공부) · `날짜` · `반복 요일`(multi-select: 월~일) · `목표 횟수`·`실행 횟수`·`한 번의 양`(number) · `단위`(rich text) · `NOW 숨김`·`History`·`휴지통` · `연결 루틴`(relation) · `정렬`

**일기 · 노트**
`제목` · `유형`(일기/노트) · `날짜` · `링크`(url) · `태그`(multi-select) · `즐겨찾기`·`아카이브 표시`·`휴지통` · `기록 데이터`(rich text, **본문**) · `연결 프로젝트` · `정렬`

**아카이브**
`제목` · `유형`(메모/책/영화/레퍼런스/읽을거리) · `날짜` · `작성 기준일` · `별점`(number) · `링크` · `태그` · `즐겨찾기`·`휴지통` · `기록 데이터`(본문) · `연결 프로젝트`

### 2-5. 루틴 체크가 저장되는 방식

- `유형 = 루틴` 행은 “무엇을, 어떤 요일에, 몇 번” 할지 정하는 **정의**입니다.
- 체크할 때마다 `유형 = 날짜별 체크` 행이 날짜별로 만들어지고, `실행 횟수`가 올라갑니다. `연결 루틴`이 원본 루틴을 가리킵니다.
- 그래서 노션에서도 “날짜별 체크” 행만 모아 보면 잔디 기록처럼 남습니다.

### 2-6. 다중 데이터 소스 DB

최근 노션은 한 데이터베이스 안에 여러 데이터 소스를 둘 수 있습니다.
이 앱은 먼저 예전 방식(`Notion-Version: 2022-06-28`, `/databases/{id}/query`)을 시도하고, 실패하면 자동으로 `2025-09-03` + `/data_sources/{id}/query`로 넘어갑니다. 별도 설정은 필요 없습니다.

---

## 3. Vercel 배포

1. <https://vercel.com/new> → **Import Git Repository** → 이 저장소 선택
2. Framework: **Next.js** (자동 감지). 빌드 설정은 그대로 둡니다.
3. **Environment Variables** 에 추가
   - `NOTION_TOKEN` (필수)
   - `DIARY_PASSWORD` (강력 권장)
   - 필요하면 `NOTION_*_DB_ID` 다섯 개
4. **Deploy** → `https://<프로젝트>.vercel.app`

배포 후 환경변수를 바꾸면 **Redeploy** 해야 반영됩니다.
무료(Hobby) 플랜으로 충분합니다.

### 아이폰에서 앱처럼 쓰기

1. Safari로 배포 주소를 엽니다.
2. 공유 → **홈 화면에 추가**
3. 홈 화면 아이콘으로 실행하면 주소창 없이 전체 화면으로 열립니다.

`public/manifest.webmanifest` 와 `apple-touch-icon` 이 이미 들어 있어 별도 설정이 필요 없습니다.

---

## 4. 보안 · 개인정보

- `NOTION_TOKEN` 은 **서버 라우트에서만** 사용됩니다. 브라우저 번들에 포함되지 않습니다.
- `DIARY_PASSWORD` 를 설정하면 접속 시 비밀번호를 묻고, HMAC 서명 쿠키(30일, httpOnly)로 세션을 유지합니다. 비밀번호를 바꾸면 기존 세션이 모두 무효가 됩니다.
- **이 저장소는 공개(public) 상태일 수 있습니다.** 코드에는 토큰이 없지만, DB ID 기본값과 앱 구조는 누구나 볼 수 있습니다. 일기 내용은 토큰 없이 접근할 수 없으므로 안전하지만, 배포 주소를 아는 사람이 비밀번호 없이 들어오는 것을 막으려면 `DIARY_PASSWORD` 를 꼭 설정하세요. 저장소 자체를 비공개로 돌리려면 GitHub → Settings → General → Danger zone → Change visibility.
- 검색 엔진에는 노출되지 않도록 `robots: noindex` 가 설정되어 있습니다.

---

## 5. 사용법

### 캘린더

| 보기 | 설명 |
| --- | --- |
| 연 | 2026 / 2027을 분기별로. 날짜를 누르면 하루 보기로 이동 |
| 월 | 일정·할 일을 2개까지 보여 주고 `+N` 팝오버로 펼침. 아래에 월간 루틴 표 |
| 주 | 09:00–19:00 기본, 일정이 밖에 있으면 자동 확장. 종일 3개 이상이면 접힘. 아래에 이번 주 꼭 / 목표 / 메모와 프로젝트·루틴 표 |
| 3일 | 사흘을 나란히 |
| 일 | 하루 흐름, 할 일, 루틴, 일기 쓰기 |
| 루틴 | 한 달 잔디 체크. 칸을 누르면 횟수가 올라가고 목표에 닿으면 0으로 |

- 모드 필터: **NOW / 전체 / 업무 / 개인 / 공부**. `NOW`는 `NOW 숨김` 항목을 감춥니다.
  일정의 `외부일정 · 성과`는 업무로, `개인 · 휴먼네트워크`는 개인으로 묶입니다.
- 빈 칸을 클릭하면 그 시각으로 일정이 만들어지고, 일정 블록을 드래그하면 날짜·시간이 옮겨집니다.
- `이번 주 꼭`은 `즐겨찾기`가 켜진 항목, `이번 주 목표`는 `유형 = 주간 목표`(`주간 키`로 묶임), `주간 메모`는 목표와 별개인 한 주 메모입니다.
- 하단 탭을 **두 번 누르면** 그 탭의 기본 화면으로 돌아갑니다.

### 프로젝트

- **Tracks** — 업무 / 개인 / 공부 세 줄기. 카드에 할 일이 최대 4개(설정에서 2–8) 보이고, 카드를 누르면 서랍이 열려 `전체 / 진행 / 완료` 목록을 봅니다. 할 일을 눌러도 목록 맥락이 유지됩니다.
- **Priority** — 긴급·중요 4분면. 할 일을 고쳐서 분면을 옮깁니다.
- **History** — 완료·취소한 프로젝트, History로 보낸 루틴, 최근 완료한 할 일. `되살리기`로 복구합니다.
- 받은함: 프로젝트를 정하지 않은 할 일이 모입니다. 위 입력창에 적고 Enter.
- 루틴 카드는 `1/4 … 4/4` 처럼 여러 번 체크할 수 있습니다.

### 바인더

- **Weekly** — 하루에 세 줄까지 미리보기, 주말·공휴일 색 구분 (2026–2027 공휴일 내장).
- **Daily** — 하루 한 편 문서 편집기. 제목·본문을 고치면 잠시 뒤 자동 저장됩니다. Markdown(`#`, `-`, `- [ ]`, `**굵게**`, `>` 인용)을 지원하고 `미리보기`로 확인할 수 있습니다. 아래에 그날의 일정·완료한 일이 접혀 있습니다.
- **Notes** — 2026–2027 월 필터, 검색, 카드 보기.
- 본문은 노션의 `기록 데이터` 속성에 저장됩니다. 노션 페이지 본문(블록)과는 별개입니다.

### 아카이브

- 분류 칩으로 거르고, 별점을 카드에서 바로 누를 수 있습니다.
- `즐겨찾기` 필터, `휴지통` 보기에서 복원·완전 삭제.
- 링크가 있으면 카드에서 바로 엽니다.

### 공통

- `⌘K` / `Ctrl+K` 또는 돋보기: 전체 검색. 기본은 숨김 항목 제외, 체크하면 포함.
- 설정(톱니): 글자 크기 1–6, 주 시작 요일, 주말 표시, 시간 범위, 종일 접기 기준, 기본 보기, 카드 미리보기 수, 월 필터 기본값, 연결 상태 확인. 설정은 브라우저에만 저장됩니다.
- 저장 상태는 상단에 `저장 중` → `저장됨`, 실패하면 빨간 표시로 나타납니다.
- 모달·서랍은 바깥을 누르거나 `Esc`, 브라우저 뒤로 가기로 닫힙니다. 편집 중이면 닫을 때 저장합니다.

---

## 6. API

| 경로 | 메서드 | 설명 |
| --- | --- | --- |
| `/api/status` | GET | 토큰·비밀번호·세션 상태 |
| `/api/auth` | POST / DELETE / GET | 로그인 / 잠그기 / 세션 확인 |
| `/api/notion/all` | GET | 다섯 DB를 한 번에 (앱 시작 시) |
| `/api/notion/{resource}` | GET / POST | 목록 / 생성 (`calendar` `projects` `routines` `binder` `archive`) |
| `/api/notion/{resource}/{id}` | PATCH / DELETE | 수정 / 휴지통(`?permanent=1`이면 페이지 보관) |

모든 응답은 `{ ok: true, data }` 또는 `{ ok: false, error: { message, code } }` 형태입니다.

---

## 7. 폴더 구조

```
src/
  app/
    layout.tsx            메타데이터 · Pretendard · PWA
    page.tsx              앱 진입
    globals.css           종이 질감 · 공통 클래스
    api/
      status/ auth/ notion/[resource]/ notion/all/
  components/
    AppShell.tsx          사이드바 · 헤더 · 하단 탭 · 토스트
    SearchDialog.tsx  SettingsDialog.tsx  LoginScreen.tsx
    calendar/             TimeGrid · Month · Year · Day · Habit · WeekPanels · WeekTable
    projects/             Tracks · Priority · History · ProjectDrawer · RoutineCard
    binder/  archive/
    editors/              Event · Task · Routine · Binder · Archive 편집기
    common/               Modal · Drawer · 입력 · 칩 · 토스트 톤
  lib/
    notion.ts             서버 REST 클라이언트 (레거시 → 데이터 소스 폴백)
    notion-map.ts         속성 이름 ↔ 데이터 모델
    auth.ts               HMAC 세션
    date.ts  holidays.ts  markdown.tsx  demo-data.ts  types.ts
  state/
    store.tsx             데이터 로드 · 낙관적 저장 · 오류 복구
    ui.tsx  settings.tsx
public/
  manifest.webmanifest  icons/  favicon.ico
```

---

## 8. 커스터마이즈

- **색·폰트** — `tailwind.config.ts` 의 `paper / ink / accent / sage / dusk` 팔레트와 `globals.css` 의 배경.
- **공휴일** — `src/lib/holidays.ts`. 임시공휴일이 생기면 여기에 한 줄 추가하면 캘린더·바인더에 바로 반영됩니다.
- **기본 DB ID** — `src/lib/db-config.ts` (또는 환경변수).
- **속성 이름** — `src/lib/notion-map.ts` 의 문자열만 바꾸면 다른 템플릿에도 붙일 수 있습니다.
- **시작 탭** — `src/state/ui.tsx` 의 초기값.

---

## 9. 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| 상단에 `데모 미리보기` 가 보임 | `NOTION_TOKEN` 이 배포 환경에 있는지, 재배포했는지 |
| `일부 DB를 불러오지 못했습니다` | 해당 DB를 노션에서 열고 `··· → Connections` 에 통합을 추가했는지 |
| `Notion 토큰이 올바르지 않습니다` | 토큰 복사 시 공백, 만료 여부 |
| 비밀번호를 잊음 | Vercel 환경변수에서 `DIARY_PASSWORD` 변경 후 재배포 (기존 세션은 자동 만료) |
| 저장이 안 됨 | 속성 이름·타입이 2-4와 같은지, 해당 속성이 DB에 있는지 |
| 아이콘이 안 바뀜 | 홈 화면에서 앱을 지우고 다시 추가 |

---

## 10. 라이선스

개인용으로 만든 키트입니다. 자유롭게 복제해 자기 노션에 붙여 쓰세요.
`DIARY_PASSWORD` 설정과 저장소 공개 범위는 각자 환경에 맞게 확인하시길 권합니다.
