/**
 * Client-safe descriptions of the five Notion databases.
 *
 * No secrets and no process.env here: the settings screen, the public kit page
 * and the downloadable guides all read these lists, and the server reads the
 * same names from `db-config.ts`.
 */

import type { Resource } from "./types";

export const KIT_VERSION = "v2.0";

export const DB_LABELS: Record<Resource, string> = {
  calendar: "Calendar 기록",
  projects: "프로젝트 · 할 일",
  routines: "루틴 · 체크 기록",
  binder: "일기 · 노트",
  archive: "아카이브",
};

export const DB_ENV_KEYS: Record<Resource, string> = {
  calendar: "NOTION_CALENDAR_DB_ID",
  projects: "NOTION_PROJECTS_DB_ID",
  routines: "NOTION_ROUTINE_DB_ID",
  binder: "NOTION_BINDER_DB_ID",
  archive: "NOTION_ARCHIVE_DB_ID",
};

/** One-line purpose of each database. */
export const DB_PURPOSES: Record<Resource, string> = {
  calendar: "일정 · 주간 목표 · 주간 메모 · 월간 메모",
  projects: "프로젝트 · 할 일 · index",
  routines: "루틴 정의 · 날짜별 체크 기록",
  binder: "일기 · 노트 본문",
  archive: "메모 · 책 · 영화 · 레퍼런스 · 읽을거리",
};

export interface DbProperty {
  name: string;
  /** Notion property type, e.g. `title`, `select`, `rich_text`. */
  type: string;
  /** Allowed values or a short note. */
  detail?: string;
}

/** Every property the app reads or writes, in the order shown by the kit page. */
export const DB_PROPERTIES: Record<Resource, DbProperty[]> = {
  calendar: [
    { name: "제목", type: "title" },
    { name: "유형", type: "select", detail: "일정 / 주간 목표 / 주간 메모 / 월간 메모" },
    { name: "분류", type: "select", detail: "개인 / 외부일정 / 성과 / 휴먼네트워크" },
    { name: "날짜", type: "date", detail: "시작·종료 시각 포함" },
    { name: "완료", type: "checkbox" },
    { name: "취소", type: "checkbox" },
    { name: "취소 사유", type: "rich_text" },
    { name: "취소 시각", type: "date" },
    { name: "기타", type: "rich_text" },
    { name: "NOW 숨김", type: "checkbox" },
    { name: "즐겨찾기", type: "checkbox" },
    { name: "휴지통", type: "checkbox" },
    { name: "주간 키", type: "rich_text" },
    { name: "작성 기준일", type: "date" },
    { name: "연결 프로젝트", type: "relation", detail: "프로젝트 · 할 일 DB" },
    { name: "정렬", type: "number" },
  ],
  projects: [
    { name: "제목", type: "title" },
    { name: "유형", type: "select", detail: "프로젝트 / 할 일" },
    { name: "분류", type: "select", detail: "업무 / 개인 / 공부 / 내가 만든 분류" },
    { name: "상태", type: "status", detail: "미완료 / 대기 중 / 완료 / 취소" },
    { name: "날짜", type: "date" },
    { name: "마감일", type: "date" },
    { name: "완료일", type: "date" },
    { name: "확인일", type: "date" },
    { name: "긴급", type: "checkbox" },
    { name: "중요", type: "checkbox" },
    { name: "NOW 숨김", type: "checkbox" },
    { name: "History", type: "checkbox" },
    { name: "휴지통", type: "checkbox" },
    { name: "기타", type: "rich_text" },
    { name: "대기 대상", type: "rich_text" },
    { name: "대기 내용", type: "rich_text" },
    { name: "취소 사유", type: "rich_text" },
    { name: "취소 시각", type: "date" },
    { name: "반복 묶음 ID", type: "rich_text" },
    { name: "연결 프로젝트", type: "relation", detail: "프로젝트 · 할 일 DB" },
    { name: "정렬", type: "number" },
  ],
  routines: [
    { name: "제목", type: "title" },
    { name: "유형", type: "select", detail: "루틴 / 날짜별 체크" },
    { name: "분류", type: "select", detail: "업무 / 개인 / 공부 / 내가 만든 분류" },
    { name: "날짜", type: "date" },
    { name: "반복 요일", type: "multi_select", detail: "월 / 화 / 수 / 목 / 금 / 토 / 일" },
    { name: "목표 횟수", type: "number" },
    { name: "실행 횟수", type: "number" },
    { name: "한 번의 양", type: "number" },
    { name: "단위", type: "rich_text" },
    { name: "NOW 숨김", type: "checkbox" },
    { name: "History", type: "checkbox" },
    { name: "휴지통", type: "checkbox" },
    { name: "연결 루틴", type: "relation", detail: "루틴 · 체크 기록 DB" },
    { name: "정렬", type: "number" },
  ],
  binder: [
    { name: "제목", type: "title" },
    { name: "유형", type: "select", detail: "일기 / 노트" },
    { name: "날짜", type: "date" },
    { name: "링크", type: "url" },
    { name: "태그", type: "multi_select" },
    { name: "즐겨찾기", type: "checkbox" },
    { name: "아카이브 표시", type: "checkbox" },
    { name: "휴지통", type: "checkbox" },
    { name: "기록 데이터", type: "rich_text", detail: "본문" },
    { name: "사진", type: "files" },
    { name: "연결 프로젝트", type: "relation", detail: "프로젝트 · 할 일 DB" },
    { name: "정렬", type: "number" },
  ],
  archive: [
    { name: "제목", type: "title" },
    { name: "유형", type: "select", detail: "메모 / 책 / 영화 / 레퍼런스 / 읽을거리" },
    { name: "날짜", type: "date" },
    { name: "작성 기준일", type: "date" },
    { name: "별점", type: "number" },
    { name: "링크", type: "url" },
    { name: "태그", type: "multi_select" },
    { name: "즐겨찾기", type: "checkbox" },
    { name: "휴지통", type: "checkbox" },
    { name: "기록 데이터", type: "rich_text", detail: "본문" },
    { name: "사진", type: "files" },
    { name: "연결 프로젝트", type: "relation", detail: "프로젝트 · 할 일 DB" },
    { name: "정렬", type: "number" },
  ],
};

export const DB_SETUP_STEPS = [
  "notion.so/my-integrations 에서 내부 통합(Internal Integration)을 만들고 토큰을 복사합니다. → NOTION_TOKEN",
  "노션에 아래 다섯 개 DB를 만들고, 각 DB에서 `···` → Connections 에 방금 만든 통합을 추가합니다.",
  "각 DB 주소의 32자리 ID를 NOTION_CALENDAR_DB_ID · NOTION_PROJECTS_DB_ID · NOTION_ROUTINE_DB_ID · NOTION_BINDER_DB_ID · NOTION_ARCHIVE_DB_ID 에 각각 넣습니다.",
  "DIARY_PASSWORD 에 원하는 비밀번호를 넣어 잠급니다. (권장)",
  "서버(Vercel)의 Environment Variables 에 저장하고 재배포합니다.",
] as const;

/** Order used by every list in the UI. */
export const DB_ORDER: Resource[] = ["calendar", "projects", "routines", "binder", "archive"];
