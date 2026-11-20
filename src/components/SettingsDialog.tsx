"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { useSettings, DEFAULT_SETTINGS, type CalendarViewKey } from "@/state/settings";
import { useUi } from "@/state/ui";
import { Modal, Segmented, Toggle } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { ARCHIVE_KINDS } from "@/lib/types";

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
  { key: "NOTION_CALENDAR_DB_ID", label: "캘린더 DB" },
  { key: "NOTION_PROJECTS_DB_ID", label: "프로젝트 DB" },
  { key: "NOTION_ROUTINE_DB_ID", label: "루틴 DB" },
  { key: "NOTION_BINDER_DB_ID", label: "일기·노트 DB" },
  { key: "NOTION_ARCHIVE_DB_ID", label: "아카이브 DB" },
  { key: "DIARY_PASSWORD", label: "접속 비밀번호 (선택)" },
];

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useUi();
  const { settings, set, reset } = useSettings();
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
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-[0.86rem] text-ink-800">종일 일정 접기 기준</p>
                  <span className="text-[0.72rem] text-ink-400">{settings.allDayCollapse}개 이상</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={settings.allDayCollapse}
                  onChange={(event) => set("allDayCollapse", Number(event.target.value))}
                  className="w-full accent-ink-900"
                />
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

              <ol className="space-y-2 text-[0.78rem] leading-relaxed text-ink-600">
                <li>
                  <span className="font-medium text-ink-900">1.</span> notion.so/my-integrations 에서 통합을 만들고
                  내부 통합 토큰을 복사합니다.
                </li>
                <li>
                  <span className="font-medium text-ink-900">2.</span> 노션에서 다섯 개 DB(캘린더 · 프로젝트 · 루틴 ·
                  일기/노트 · 아카이브)를 열고 <span className="font-mono">···</span> → Connections 에 통합을 추가합니다.
                </li>
                <li>
                  <span className="font-medium text-ink-900">3.</span> Vercel 프로젝트 → Settings → Environment Variables
                  에 아래 값을 추가하고 재배포합니다.
                </li>
                <li>
                  <span className="font-medium text-ink-900">4.</span> 폰에서 Safari로 열고 <b>공유 → 홈 화면에 추가</b>를
                  누르면 앱처럼 쓸 수 있습니다.
                </li>
              </ol>

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
                  DB ID를 비워 두면 이 저장소의 기본값이 쓰입니다. 다른 사람의 DB로 쓰려면 값을 바꾸면 됩니다.
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
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
