"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import {
  useSettings,
  DEFAULT_SETTINGS,
  FONT_STEPS,
  fontSizeToPx,
  THEME_OPTIONS,
  FONT_OPTIONS,
  DENSITY_OPTIONS,
  type CalendarViewKey,
  type DensityKey,
  type FontKey,
  type ThemeKey,
  type TimeFormatKey,
  type ArchiveViewKey,
} from "@/state/settings";
import { useUi } from "@/state/ui";
import { Modal, Segmented, Toggle } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { ARCHIVE_KINDS } from "@/lib/types";
import { CATEGORY_COLOR_CHOICES, useCategoryColors } from "@/state/category-colors";
import { useCategoryOptions } from "@/state/categories";
import { DB_ENV_KEYS, DB_LABELS, DB_ORDER, DB_PURPOSES, DB_SETUP_STEPS, KIT_VERSION } from "@/lib/db-meta";
import { TASK_DATE_ORDER_LABELS, type TaskDateOrder } from "@/lib/order";

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
  /** A19: 분류별 기본 색을 직접 고르는 팔레트. */
  const categoryOptions = useCategoryOptions();
  const { colorOf, setColor, resetAll } = useCategoryColors();
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
                "flex-none rounded-lg px-2.5 py-1.5 text-left text-[calc(15px*var(--fs))] transition",
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
                  <p className="text-[calc(15.5px*var(--fs))] font-medium text-ink-800">글자 크기</p>
                  <span className="text-[calc(14px*var(--fs))] text-ink-400">
                    {settings.fontSize} / {FONT_STEPS} · {fontSizeToPx(settings.fontSize).toFixed(1)}px
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={FONT_STEPS}
                  step={1}
                  value={settings.fontSize}
                  onChange={(event) => set("fontSize", Number(event.target.value))}
                  className="w-full accent-ink-900"
                />
                <div className="mt-1 flex justify-between text-[calc(12px*var(--fs))] text-ink-300">
                  <span>더 작게</span>
                  <span>{DEFAULT_SETTINGS.fontSize}단계가 기본</span>
                  <span>더 크게</span>
                </div>
                <div className="mt-3 rounded-xl border border-paper-300 bg-paper-50 px-3 py-2.5">
                  <p className="serif text-[calc(16px*var(--fs))] text-ink-900">오늘의 기록</p>
                  <p className="mt-0.5 text-[calc(15px*var(--fs))] leading-relaxed text-ink-600">
                    이 크기로 일기와 목록이 보입니다. 눈이 편한 단계를 골라 주세요.
                  </p>
                </div>
              </div>
              {/* A48: 색감 테마 다섯 가지 — 도트로 미리 봅니다. */}
              <div data-theme-options="true">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-[calc(15.5px*var(--fs))] font-medium text-ink-800">색감 테마</p>
                  <span className="text-[calc(14px*var(--fs))] text-ink-400">
                    {THEME_OPTIONS.find((option) => option.value === settings.theme)?.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {THEME_OPTIONS.map((option) => {
                    const active = settings.theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-theme-option={option.value}
                        aria-pressed={active}
                        onClick={() => set("theme", option.value as ThemeKey)}
                        className={cn(
                          "flex flex-col items-start gap-1.5 rounded-xl border px-2.5 py-2 text-left transition",
                          active ? "border-ink-900 bg-white ring-1 ring-ink-900" : "border-paper-300 bg-white/70 hover:border-paper-400",
                        )}
                      >
                        <span className="flex items-center gap-1" aria-hidden>
                          {option.dots.map((dot) => (
                            <span key={dot} className="h-[13px] w-[13px] rounded-full ring-1 ring-black/10" style={{ backgroundColor: dot }} />
                          ))}
                          <span className="ml-0.5 h-[13px] w-[13px] rounded-full ring-1 ring-black/10" style={{ backgroundColor: option.canvas }} />
                        </span>
                        <span className="text-[calc(14.5px*var(--fs))] font-medium leading-tight text-ink-900">{option.label}</span>
                        <span className="text-[calc(12.5px*var(--fs))] leading-none text-ink-400">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  어느 테마를 골라도 일정 막대·할 일·프로젝트 색은 바탕과 또렷하게 구분되도록 맞췄습니다.
                </p>
              </div>

              {/* A48: 글꼴 세 가지 — 미리보기 글자가 그 글꼴로 보입니다. */}
              <div data-font-options="true">
                <p className="label">글꼴</p>
                <div className="grid grid-cols-3 gap-2">
                  {FONT_OPTIONS.map((option) => {
                    const active = settings.font === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-font-option={option.value}
                        aria-pressed={active}
                        onClick={() => set("font", option.value as FontKey)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-xl border px-2.5 py-2 text-left transition",
                          active ? "border-ink-900 bg-white ring-1 ring-ink-900" : "border-paper-300 bg-white/70 hover:border-paper-400",
                        )}
                      >
                        <span className="truncate text-[calc(16px*var(--fs))] text-ink-900" style={{ fontFamily: option.family }}>
                          {option.sample}
                        </span>
                        <span className="text-[calc(13px*var(--fs))] leading-tight text-ink-600">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* A48: 화면 밀도 — 노트북에서는 촘촘히, 폰에서는 여유롭게. */}
              <div data-density-options="true">
                <p className="label">화면 밀도</p>
                <Segmented<DensityKey>
                  value={settings.density}
                  onChange={(value) => set("density", value)}
                  size="sm"
                  options={DENSITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                />
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  촘촘히를 고르면 카드·날짜 칸의 세로 여백과 글줄 간격이 줄어 한 화면에 더 많이 담깁니다.
                </p>
              </div>

              <div className="rounded-xl border border-paper-300 bg-paper-50/60 px-3 py-2.5 text-[calc(14.5px*var(--fs))] leading-relaxed text-ink-500">
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
              {/* A48: 시간 표기 — 캘린더·프로젝트·바인더의 시간이 모두 이 설정을 따릅니다. */}
              <div data-time-format="true">
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-[calc(15.5px*var(--fs))] text-ink-800">시간 표기</p>
                  <span className="text-[calc(14px*var(--fs))] tabular-nums text-ink-400">
                    {settings.timeFormat === "ampm" ? "오후 2:30" : "14:30"}
                  </span>
                </div>
                <Segmented<TimeFormatKey>
                  value={settings.timeFormat}
                  onChange={(value) => set("timeFormat", value)}
                  size="sm"
                  options={[
                    { value: "24", label: "24시간제" },
                    { value: "ampm", label: "오전·오후" },
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
              {/* A42: 주간·3일 `일정` 목록에 하루 몇 개까지 보여 줄지 — 넘치는 일정은 +N개 더 보기로 접힙니다. */}
              <div data-week-day-items="true">
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-[calc(15.5px*var(--fs))] text-ink-800">주간 하루 일정 표시 개수</p>
                  <span className="text-[calc(14px*var(--fs))] text-ink-400">{settings.weekDayItems}개</span>
                </div>
                <Segmented<"3" | "4" | "5" | "6" | "7">
                  value={String(settings.weekDayItems) as "3" | "4" | "5" | "6" | "7"}
                  onChange={(value) => set("weekDayItems", Number(value) as 3 | 4 | 5 | 6 | 7)}
                  size="sm"
                  options={[
                    { value: "3", label: "3" },
                    { value: "4", label: "4" },
                    { value: "5", label: "5" },
                    { value: "6", label: "6" },
                    { value: "7", label: "7" },
                  ]}
                />
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  주간·3일 보기의 하루 `일정` 목록에 이 개수까지만 보여 줍니다. 넘치는 일정은 ‘+N개 더 보기’로 접히고, 두 날 이상 이어지는 일정은 위 연결 막대에 늘 보입니다.
                </p>
              </div>
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
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
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
              {/* A19: 분류 색깔 — 업무·개인·공부(그리고 더한 분류)의 기본 색을 직접 고릅니다. */}
              <div data-category-colors="true">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="text-[calc(15.5px*var(--fs))] font-medium text-ink-800">분류 색깔</p>
                  <button type="button" onClick={resetAll} className="btn-ghost btn-xs">
                    모두 기본색
                  </button>
                </div>
                <p className="mb-2 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  일정·할 일·루틴에 함께 쓰이는 분류 색입니다. 일정 하나에 따로 고른 색이 있으면 그 색이 먼저 나옵니다.
                </p>
                <ul className="space-y-2">
                  {categoryOptions.map((category) => {
                    const current = colorOf(category);
                    return (
                      <li key={category} className="rounded-xl border border-paper-300 bg-white px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[calc(15px*var(--fs))] font-medium text-ink-900">{category}</span>
                          {current === "default" ? (
                            <span className="text-[calc(13px*var(--fs))] text-ink-400">기본색</span>
                          ) : (
                            <button type="button" onClick={() => setColor(category, "default")} className="btn-ghost btn-xs">
                              기본색으로
                            </button>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {CATEGORY_COLOR_CHOICES.map((choice) => (
                            <button
                              key={choice.key}
                              type="button"
                              data-category-color={`${category}:${choice.key}`}
                              aria-label={`${category} ${choice.label}`}
                              aria-pressed={current === choice.key}
                              title={choice.label}
                              onClick={() => setColor(category, choice.key)}
                              className={cn(
                                "h-[1.15rem] w-[1.15rem] rounded-full transition",
                                choice.swatch,
                                current === choice.key ? "ring-2 ring-ink-900 ring-offset-1" : "hover:scale-110",
                              )}
                            />
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : null}

          {section === "projects" ? (
            <>
              {/* A28: 남은 할 일의 날짜 정렬 방향 — 완료된 기록은 늘 최근 것이 위입니다. */}
              <div data-project-task-order="true">
                <p className="label">할 일 날짜 정렬</p>
                <Segmented<TaskDateOrder>
                  value={settings.projectTaskOrder}
                  onChange={(value) => set("projectTaskOrder", value)}
                  size="sm"
                  options={[
                    { value: "near", label: TASK_DATE_ORDER_LABELS.near },
                    { value: "far", label: TASK_DATE_ORDER_LABELS.far },
                  ]}
                />
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  ‘남은 할 일’이 이 순서로 놓입니다 — 가까운 날짜순(오름차순)이 기본이고 먼 날짜순(내림차순)도 고를 수 있습니다. 완료한 기록은 어느 쪽을 골라도 항상 아래에 최근 것부터 쌓입니다.
                </p>
              </div>
              {/* A19: 카드 한 장에 보여 줄 남은 할 일 수 (3~8). */}
              <div data-project-preview="true">
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-[calc(15.5px*var(--fs))] text-ink-800">남은 할 일 표시 개수</p>
                  <span className="text-[calc(14px*var(--fs))] text-ink-400">{settings.projectTaskPreview}개</span>
                </div>
                <Segmented<"3" | "4" | "5" | "6" | "7" | "8">
                  value={String(settings.projectTaskPreview) as "3" | "4" | "5" | "6" | "7" | "8"}
                  onChange={(value) => set("projectTaskPreview", Number(value))}
                  size="sm"
                  options={[
                    { value: "3", label: "3" },
                    { value: "4", label: "4" },
                    { value: "5", label: "5" },
                    { value: "6", label: "6" },
                    { value: "7", label: "7" },
                    { value: "8", label: "8" },
                  ]}
                />
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  프로젝트 카드마다 ‘남은 할 일’과 ‘완료한 할 일’을 이 개수까지만 보여 줍니다. 아래 ‘최근 기록’은 최근 완료한 두 개를 늘 보여 줍니다.
                </p>
              </div>
              <Toggle
                checked={settings.showCompletedTasks}
                onChange={(value) => set("showCompletedTasks", value)}
                label="완료한 일도 기본으로 보기"
                description="프로젝트 서랍에서 완료 항목을 접지 않습니다"
              />
              {/* A41: 프로젝트 탭 맨 앞 `일정` 카드를 보일지 — 일정 서랍 맨 위의 스위치와 같은 값입니다. */}
              <div data-project-schedule-card="true">
                <Toggle
                  checked={settings.showScheduleCard}
                  onChange={(value) => set("showScheduleCard", value)}
                  label="일정 카드 표시"
                  description="프로젝트 탭 맨 앞의 `일정` 카드를 보여 줍니다 (일정 서랍 맨 위에서도 켜고 끌 수 있습니다)"
                />
              </div>
              <div>
                <p className="label">내 분류</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {settings.customCategories.length === 0 ? (
                    <span className="text-[calc(14px*var(--fs))] text-ink-400">필터의 ‘+’로 분류를 더할 수 있습니다.</span>
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
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  추가한 분류는 프로젝트·주간 필터에 나타나고, Notion의 분류(select)에 그대로 저장됩니다.
                </p>
              </div>
            </>
          ) : null}

          {section === "binder" ? (
            <>
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-[calc(15.5px*var(--fs))] text-ink-800">주간 미리보기 줄 수</p>
                  <span className="text-[calc(14px*var(--fs))] text-ink-400">{settings.binderPreviewLines}줄</span>
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
              {/* A24: 위클리 화면의 참고 창은 헤더 버튼으로도 열고 닫습니다 — 열어 둔 상태가 여기 남습니다. */}
              <Toggle
                checked={settings.binderWeekSchedule}
                onChange={(value) => set("binderWeekSchedule", value)}
                label="주간 일정 창 펼쳐 두기"
                description="위클리 날짜 칸에 그날 일정·할 일이 늘 붙어 있습니다. 이 창은 그 주 전체를 한 번에 볼 때만 엽니다"
              />
            </>
          ) : null}

          {section === "archive" ? (
            <div className="space-y-4">
              {/* A48: 아카이브를 카드로 볼지, 한 줄 목록으로 볼지. */}
              <div data-archive-view-options="true">
                <p className="label">기본 보기</p>
                <Segmented<ArchiveViewKey>
                  value={settings.archiveView}
                  onChange={(value) => set("archiveView", value)}
                  size="sm"
                  options={[
                    { value: "card", label: "카드형" },
                    { value: "list", label: "한 줄 목록형" },
                  ]}
                />
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  아카이브 위쪽 전환 버튼과 같은 값입니다. 두 보기 모두에서 여러 개 고르기·고정핀·끌어 옮기기·삭제가 똑같이 됩니다.
                </p>
              </div>
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
                  <p className="text-[calc(15.5px*var(--fs))] font-medium text-ink-800">데이터베이스 5개</p>
                  <span className="text-[calc(14px*var(--fs))] text-ink-400">각각 따로 연결·차단됩니다</span>
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
                          <span className="text-[calc(15px*var(--fs))] font-medium text-ink-900">{db?.label ?? DB_LABELS[resource]}</span>
                          <span
                            className={cn(
                              "chip border text-[calc(14px*var(--fs))]",
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
                        <p className="mt-0.5 text-[calc(14px*var(--fs))] text-ink-400">{DB_PURPOSES[resource]}</p>
                        <p className="mt-1 break-all font-mono text-[calc(14px*var(--fs))] text-ink-600">{db?.envKey ?? DB_ENV_KEYS[resource]}</p>
                        {!ok && db?.message ? (
                          <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-600">{db.message}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <p className="mb-1.5 text-[calc(15.5px*var(--fs))] font-medium text-ink-800">설정 방법</p>
                <ol className="space-y-1.5 text-[calc(15px*var(--fs))] leading-relaxed text-ink-600">
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
                <p className="mb-2 text-[calc(14px*var(--fs))] font-semibold uppercase tracking-[0.1em] text-ink-500">환경변수</p>
                <ul className="space-y-1.5">
                  {ENV_LIST.map((env) => (
                    <li key={env.key} className="flex items-start justify-between gap-3 text-[calc(15px*var(--fs))]">
                      <span className="font-mono text-ink-800">
                        {env.key}
                        {env.required ? <span className="ml-1 text-accent-500">*</span> : null}
                      </span>
                      <span className="text-right text-ink-500">{env.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  DB ID를 비워 두면 그 DB는 <b>미연결</b>로 표시되고, 해당 화면은 조회가 비어 있고 저장이 중단됩니다. 다른 사람의
                  DB를 가리키는 기본값은 없습니다.
                </p>
              </div>

              {demo ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[calc(14.5px*var(--fs))] leading-relaxed text-amber-800">
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
                <p className="text-[calc(15px*var(--fs))] font-medium text-ink-900">내 다이어리 만들기 (공개 키트) {KIT_VERSION}</p>
                <p className="mt-1 text-[calc(14px*var(--fs))] leading-relaxed text-ink-500">
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
