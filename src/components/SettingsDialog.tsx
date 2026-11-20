"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { useSettings, DEFAULT_SETTINGS, type CalendarViewKey } from "@/state/settings";
import { useUi } from "@/state/ui";
import { Modal, Segmented, Toggle } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { ARCHIVE_KINDS } from "@/lib/types";
import { DB_ENV_KEYS, DB_LABELS, DB_ORDER, DB_PURPOSES, DB_SETUP_STEPS, KIT_VERSION } from "@/lib/db-meta";

const SECTIONS = [
  { key: "look", label: "모양" },
  { key: "calendar", label: "캘린더" },
  { key: "projects", label: "프로젝트" },
  { key: "binder", label: "바인더" },
  { key: "archive", label: "아카이브" },
  { key: "connect", label: "연결" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const ENV_LIST = [
  { key: "NOTION_TOKEN", label: "Notion 통합 토큰", required: true },
  { key: DB_ENV_KEYS.calendar, label: "캘린더 DB" },
  { key: DB_ENV_KEYS.projects, label: "프로젝트 DB" },
  { key: DB_ENV_KEYS.routines, label: "루틴 DB" },
  { key: DB_ENV_KEYS.binder, label: "일기·노트 DB" },
  { key: DB_ENV_KEYS.archive, label: "아카이브 DB" },
  { key: "DIARY_PASSWORD", label: "접속 비밀번호 (선택)" },
];

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useUi();
  const { settings, set, reset, removeCategory } = useSettings();
  const { status, demo, refresh, logout } = useData();
  const [section, setSection] = useState<SectionKey>("look");

  return (
    <Modal
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      title="설정"
      subtitle="모든 설정은 이 기기에만 저장됩니다"
      size="lg"
      bodyClassName="!px-0 !py-0"
    >
      <div className="flex min-h-[340px] flex-col sm:flex-row">
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-paper-300/70 px-3 py-2 sm:w-[9.5rem] sm:flex-col sm:border-b-0 sm:border-r sm:py-3">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
              className={cn(
                "flex-none rounded-lg px-2.5 py-1.5 text-left text-[0.8rem] transition",
                section === item.key ? "bg-ink-900 text-paper-50" : "text-ink-600 hover:bg-paper-100",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {section === "look" ? (
            <>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-[0.86rem] font-medium text-ink-800">글자 크기</p>
                  <span className="text-[0.72rem] text-ink-400">{settings.fontSize} / 6</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={settings.fontSize}
                  onChange={(event) => set("fontSize", Number(event.target.value))}
                  className="w-full accent-ink-900"
                />
                <div className="mt-3 rounded-xl border border-paper-300 bg-paper-50 px-3 py-2.5">
                  <p className="serif text-[1rem] text-ink-900">오늘의 기록</p>
                  <p className="mt-0.5 text-[0.8rem] leading-relaxed text-ink-600">
                    이 크기로 일기와 목록이 보입니다. 눈이 편한 단계를 골라 주세요.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-paper-300 bg-paper-50/60 px-3 py-2.5 text-[0.74rem] leading-relaxed text-ink-500">
                설정은 브라우저(localStorage)에 저장되어 기기마다 따로 적용됩니다. 폰과 PC에서 각각 맞춰 쓰세요.
              </div>
              <button
                type="button"
                onClick={reset}
                className="btn-outline btn-xs"
                title={`기본값 ${DEFAULT_SETTINGS.fontSize}단계`}
              >
                설정 초기화
              </button>
            </>
          ) : null}

          {section === "calendar" ? (
            <>
              <div>
                <p className="label">기본 보기</p>
                <Segmented<CalendarViewKey>
                  value={settings.calendarDefaultView}
                  onChange={(value) => set("calendarDefaultView", value)}
                  size="sm"
                  options={[
                    { value: "year", label: "연" },
                    { value: "month", label: "월" },
                    { value: "week", label: "주" },
                    { value: "three", label: "3일" },
                    { value: "day", label: "일" },
                    { value: "habit", label: "루틴" },
                  ]}
                />
              </div>
              <div>
                <p className="label">한 주의 시작</p>
                <Segmented<"1" | "0">
                  value={String(settings.weekStartsOn) as "1" | "0"}
                  onChange={(value) => set("weekStartsOn", value === "0" ? 0 : 1)}
                  size="sm"
                  options={[
                    { value: "1", label: "월요일" },
                    { value: "0", label: "일요일" },
                  ]}
                />
              </div>
              <Toggle checked={settings.showWeekends} onChange={(value) => set("showWeekends", value)} label="주말 표시" description="주간·3일 보기에서 토·일을 접습니다" />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">시작 시각</span>
                  <select
                    className="input"
                    value={settings.weekStartHour}
                    onChange={(event) => set("weekStartHour", Number(event.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">끝 시각</span>
                  <select
                    className="input"
                    value={settings.weekEndHour}
                    onChange={(event) => set("weekEndHour", Number(event.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <p className="label">월간 하루 표시</p>
                <Segmented<"3" | "4" | "5">
                  value={String(settings.monthDayItems) as "3" | "4" | "5"}
                  onChange={(value) => set("monthDayItems", Number(value) as 3 | 4 | 5)}
                  size="sm"
                  options={[
                    { value: "3", label: "3개" },
                    { value: "4", label: "4개" },
                    { value: "5", label: "5개" },
                  ]}
                />
                <p className="mt-1 text-[0.7rem] leading-relaxed text-ink-400">
                  월간 달력의 하루 칸에 제목을 보여 줄 항목 수입니다. 넘치는 항목은 ‘할 일 N’·‘+N 더’로 접히고, 누르면 그 날짜 전체
                  목록이 열립니다.
                </p>
              </div>
              <Toggle
                checked={settings.calendarShowHidden}
                onChange={(value) => set("calendarShowHidden", value)}
                label="처음부터 숨긴 항목 표시"
                description="끄면 숨긴 항목은 '전체' 모드에서만 보입니다"
              />
            </>
          ) : null}

          {section === "projects" ? (
            <>
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-[0.86rem] text-ink-800">카드에 보이는 할 일 수</p>
                  <span className="text-[0.72rem] text-ink-400">{settings.projectTaskPreview}개</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={settings.projectTaskPreview}
                  onChange={(event) => set("projectTaskPreview", Number(event.target.value))}
                  className="w-full accent-ink-900"
                />
              </div>
              <Toggle
                checked={settings.showCompletedTasks}
                onChange={(value) => set("showCompletedTasks", value)}
                label="완료한 일도 기본으로 보기"
                description="프로젝트 서랍에서 완료 항목을 접지 않습니다"
              />
              <div>
                <p className="label">카드에 보이는 최근 완료 기록</p>
                <Segmented<"2" | "3">
                  value={String(settings.projectCompletedPreview) as "2" | "3"}
                  onChange={(value) => set("projectCompletedPreview", value === "3" ? 3 : 2)}
                  size="sm"
                  options={[
                    { value: "2", label: "2개" },
                    { value: "3", label: "3개" },
                  ]}
                />
              </div>
              <div>
                <p className="label">내 분류</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {settings.customCategories.length === 0 ? (
                    <span className="text-[0.72rem] text-ink-400">필터의 ‘+’로 분류를 더할 수 있습니다.</span>
                  ) : (
                    settings.customCategories.map((category) => (
                      <span key={category} className="chip border border-paper-400 bg-white/60 text-ink-600">
                        {category}
                        <button
                          type="button"
                          onClick={() => removeCategory(category)}
                          className="ml-1 text-ink-300 hover:text-rose-500"
                          aria-label={`${category} 분류 지우기`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-ink-400">
                  추가한 분류는 프로젝트·주간 필터에 나타나고, Notion의 분류(select)에 그대로 저장됩니다.
                </p>
              </div>
            </>
          ) : null}

          {section === "binder" ? (
            <>
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-[0.86rem] text-ink-800">주간 미리보기 줄 수</p>
                  <span className="text-[0.72rem] text-ink-400">{settings.binderPreviewLines}줄</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={settings.binderPreviewLines}
                  onChange={(event) => set("binderPreviewLines", Number(event.target.value))}
                  className="w-full accent-ink-900"
                />
              </div>
              <Toggle
                checked={settings.binderShowSchedule}
                onChange={(value) => set("binderShowSchedule", value)}
                label="오늘의 일정 함께 보기"
                description="일일 편집 화면 아래에 오늘 일정과 완료한 일을 접어서 보여 줍니다"
              />
            </>
          ) : null}

          {section === "archive" ? (
            <div>
              <p className="label">기본 분류</p>
              <div className="flex flex-wrap gap-1.5">
                {(["전체", ...ARCHIVE_KINDS] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => set("archiveDefaultCategory", kind)}
                    className={cn(
                      "chip border",
                      settings.archiveDefaultCategory === kind
                        ? "border-ink-900 bg-ink-900 text-paper-50"
                        : "border-paper-400 bg-white/60 text-ink-600 hover:border-ink-400",
                    )}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {section === "connect" ? (
            <>
              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "chip border",
                    status?.needsToken ? "border-amber-200 bg-amber-50 text-amber-700" : "border-sage-200 bg-sage-50 text-sage-500",
                  )}
                >
                  {status?.needsToken ? "Notion 미연결 (데모)" : "Notion 연결됨"}
                </span>
                <span className="chip border border-paper-300 bg-paper-50 text-ink-600">
                  {status?.authRequired ? "비밀번호 보호 켜짐" : "비밀번호 없음"}
                </span>
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <p className="text-[0.86rem] font-medium text-ink-800">데이터베이스 5개</p>
                  <span className="text-[0.68rem] text-ink-400">각각 따로 연결·차단됩니다</span>
                </div>
                <ul className="space-y-1.5">
                  {DB_ORDER.map((resource) => {
                    const db = status?.dbs?.[resource];
                    const configured = db?.configured ?? false;
                    const ok = db?.ok ?? false;
                    const state = !configured ? "미연결" : ok ? "연결됨" : "오류";
                    return (
                      <li
                        key={resource}
                        className={cn(
                          "rounded-xl border px-3 py-2",
                          !configured
                            ? "border-amber-200 bg-amber-50/60"
                            : ok
                              ? "border-sage-200 bg-sage-50/50"
                              : "border-rose-200 bg-rose-50/60",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.8rem] font-medium text-ink-900">{db?.label ?? DB_LABELS[resource]}</span>
                          <span
                            className={cn(
                              "chip border text-[0.68rem]",
                              !configured
                                ? "border-amber-300 bg-white text-amber-700"
                                : ok
                                  ? "border-sage-200 bg-white text-sage-500"
                                  : "border-rose-200 bg-white text-rose-600",
                            )}
                          >
                            {state}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[0.68rem] text-ink-400">{DB_PURPOSES[resource]}</p>
                        <p className="mt-1 break-all font-mono text-[0.68rem] text-ink-600">{db?.envKey ?? DB_ENV_KEYS[resource]}</p>
                        {!ok && db?.message ? (
                          <p className="mt-1 text-[0.7rem] leading-relaxed text-ink-600">{db.message}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <p className="mb-1.5 text-[0.86rem] font-medium text-ink-800">설정 방법</p>
                <ol className="space-y-1.5 text-[0.78rem] leading-relaxed text-ink-600">
                  {DB_SETUP_STEPS.map((step, index) => (
                    <li key={step} className="flex gap-1.5">
                      <span className="font-medium text-ink-900">{index + 1}.</span>
                      <span className="min-w-0">{step}</span>
                    </li>
                  ))}
                  <li className="flex gap-1.5">
                    <span className="font-medium text-ink-900">6.</span>
                    <span className="min-w-0">폰에서는 Safari로 열고 <b>공유 → 홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있습니다.</span>
                  </li>
                </ol>
              </div>

              <div className="rounded-xl border border-paper-300 bg-paper-50/70 p-3">
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-500">환경변수</p>
                <ul className="space-y-1.5">
                  {ENV_LIST.map((env) => (
                    <li key={env.key} className="flex items-start justify-between gap-3 text-[0.76rem]">
                      <span className="font-mono text-ink-800">
                        {env.key}
                        {env.required ? <span className="ml-1 text-accent-500">*</span> : null}
                      </span>
                      <span className="text-right text-ink-500">{env.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[0.68rem] leading-relaxed text-ink-400">
                  DB ID를 비워 두면 그 DB는 <b>미연결</b>로 표시되고, 해당 화면은 조회가 비어 있고 저장이 중단됩니다. 다른 사람의
                  DB를 가리키는 기본값은 없습니다.
                </p>
              </div>

              {demo ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[0.74rem] leading-relaxed text-amber-800">
                  지금은 예시 데이터로 동작합니다. 토큰을 설정하면 이 화면이 실제 기록으로 바뀌고, 데모에서 만든 내용은 저장되지
                  않습니다.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void refresh()} className="btn-outline btn-xs">
                  연결 상태 새로고침
                </button>
                {status?.authRequired ? (
                  <button type="button" onClick={() => void logout()} className="btn-ghost btn-xs">
                    잠그기
                  </button>
                ) : null}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-outline btn-xs"
                >
                  Notion 통합 열기
                </a>
                <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="btn-outline btn-xs">
                  Vercel 대시보드
                </a>
              </div>

              <div className="rounded-xl border border-paper-300 bg-white p-3">
                <p className="text-[0.8rem] font-medium text-ink-900">내 다이어리 만들기 (공개 키트) {KIT_VERSION}</p>
                <p className="mt-1 text-[0.72rem] leading-relaxed text-ink-500">
                  빈 노션 템플릿 구성표, 환경변수, 다른 AI에 붙여넣을 설치 지시문을 공개 페이지에서 내려받을 수 있습니다. 제작자
                  계정·비밀번호·DB ID·키는 들어 있지 않습니다.
                </p>
                <a href="/kit" className="btn-outline btn-xs mt-2">
                  공개 키트 열기
                </a>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
