"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ArchiveKind } from "@/lib/types";
import type { TaskDateOrder } from "@/lib/order";
import { pushToast } from "@/lib/toast-bus";
import { setClockFormat } from "@/lib/date";

export type CalendarViewKey = "year" | "month" | "week" | "three" | "day" | "habit";
/** A48: 화면 색감 테마 다섯 가지. */
export type ThemeKey = "tone" | "vivid" | "pastel" | "sage" | "mono";
/** A48: 글꼴 세 가지 — 고딕 · 명조 · 손글씨. */
export type FontKey = "gothic" | "serif" | "hand";
/** A48: 화면 밀도. */
export type DensityKey = "comfortable" | "compact";
/** A48: 시간 표기 — 24시간제 / 오전·오후. */
export type TimeFormatKey = "24" | "ampm";
/** A48: 아카이브 기본 보기 — 카드형 / 한 줄 목록형. */
export type ArchiveViewKey = "card" | "list";

export interface Settings {
  /** A18: 1–9단계 — 1~3은 더 작은 쪽에 새로 더한 단계, 6이 기본(15px)입니다. */
  fontSize: number;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  weekStartHour: number;
  weekEndHour: number;
  /** How many items a month cell shows before the rest collapses into a count. */
  monthDayItems: 3 | 4 | 5;
  /** A42: 주간·3일 보기의 하루 `일정` 목록에 기본으로 보여 줄 일정 수 (3~7). */
  weekDayItems: 3 | 4 | 5 | 6 | 7;
  calendarDefaultView: CalendarViewKey;
  calendarShowHidden: boolean;
  /** A19: 카드 한 장에 보여 줄 남은 할 일 수 (3~8). */
  projectTaskPreview: number;
  /** A24: 우선순위 탭 사분면마다 기본으로 보여 줄 할 일 수 (3~10). */
  priorityTaskPreview: number;
  /** A28: 프로젝트 목록의 날짜 정렬 방향 — 기본은 가까운 날짜순(오름차순). */
  projectTaskOrder: TaskDateOrder;
  /** A6/A7: user-made categories shown next to 업무·개인·공부 in the filters. */
  customCategories: string[];
  /** A16: 분류 the user removed — hidden from filters and pickers (records keep their value). */
  hiddenCategories: string[];
  /** A16: NOW 모드 — 켜면 `NOW 숨김` 항목만 화면에서 가립니다 (프로젝트 탭 토글). */
  nowOnly: boolean;
  /** A39: 프로젝트 탭 맨 앞 `일정` 카드를 보여 줄지 — 설정과 일정 서랍 양쪽에서 켜고 끕니다. */
  showScheduleCard: boolean;
  showCompletedTasks: boolean;
  binderPreviewLines: number;
  binderShowSchedule: boolean;
  /** A45: 속지 배경 — 무지 / 줄노트 / 모눈. 모든 일기에 공통입니다(localStorage). */
  binderPaper: "plain" | "ruled" | "grid";
  /** A24: 위클리 바인더에서 그 주의 일정·할 일 참고 창을 열어 둘지. */
  binderWeekSchedule: boolean;
  archiveDefaultCategory: "전체" | ArchiveKind;
  /** A48: 화면 전체 색감 테마 (기본: 차분한 톤다운). */
  theme: ThemeKey;
  /** A48: 화면 글꼴 (기본: 깔끔한 고딕). */
  font: FontKey;
  /** A48: 화면 밀도 (기본: 여유롭게). */
  density: DensityKey;
  /** A48: 시간 표기 (기본: 24시간제 `14:30`). */
  timeFormat: TimeFormatKey;
  /** A48: 아카이브 기본 보기 (기본: 카드형). */
  archiveView: ArchiveViewKey;
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 6,
  weekStartsOn: 1,
  showWeekends: true,
  weekStartHour: 9,
  weekEndHour: 19,
  monthDayItems: 3,
  /** A42: 주간 하루 일정은 기본 다섯 개까지만 펼치고 나머지는 +N개 더 보기로 접습니다. */
  weekDayItems: 5,
  calendarDefaultView: "week",
  calendarShowHidden: false,
  projectTaskPreview: 6,
  priorityTaskPreview: 5,
  projectTaskOrder: "near",
  customCategories: [],
  hiddenCategories: [],
  nowOnly: false,
  /** A41: 일정 카드는 기본으로 보입니다. */
  showScheduleCard: true,
  showCompletedTasks: false,
  binderPreviewLines: 3,
  /** A45: 기본은 줄노트 — 예전 일기 화면의 줄과 같습니다. */
  binderPaper: "ruled",
  binderShowSchedule: true,
  binderWeekSchedule: false,
  archiveDefaultCategory: "전체",
  theme: "tone",
  font: "gothic",
  density: "comfortable",
  timeFormat: "24",
  archiveView: "card",
};

/** A48: 설정 화면의 색감 미리보기 도트 — 테마마다 포인트 세 가지를 보여 줍니다. */
export const THEME_OPTIONS: { value: ThemeKey; label: string; hint: string; dots: string[]; canvas: string }[] = [
  { value: "tone", label: "차분한 톤다운", hint: "기본", dots: ["#a87a69", "#718a5d", "#8d82a3"], canvas: "#f6f4f0" },
  { value: "vivid", label: "선명한 비비드", hint: "또렷하게", dots: ["#dd5233", "#3a9e4d", "#7a56ff"], canvas: "#f2f4f7" },
  { value: "pastel", label: "포근한 파스텔", hint: "부드럽게", dots: ["#c76c63", "#6d9f62", "#9b86b8"], canvas: "#f7f1e8" },
  { value: "sage", label: "숲속 세이지", hint: "초록 결", dots: ["#b07048", "#789c62", "#6d9482"], canvas: "#eef2e8" },
  { value: "mono", label: "시크 모노", hint: "무채색", dots: ["#84767c", "#647d68", "#6b8ba6"], canvas: "#f4f4f5" },
];

export const FONT_OPTIONS: { value: FontKey; label: string; hint: string; sample: string; family: string }[] = [
  { value: "gothic", label: "깔끔한 고딕", hint: "기본", sample: "오늘의 기록", family: "var(--font-app)" },
  { value: "serif", label: "책 같은 명조", hint: "차분하게", sample: "오늘의 기록", family: "var(--font-serif)" },
  { value: "hand", label: "손글씨 느낌", hint: "다이어리처럼", sample: "오늘의 기록", family: "var(--font-hand)" },
];

export const DENSITY_OPTIONS: { value: DensityKey; label: string }[] = [
  { value: "comfortable", label: "여유롭게" },
  { value: "compact", label: "촘촘히" },
];

/**
 * A41: 설정을 바꾸면 무엇이 바뀌었는지 한 줄로 알립니다 — 모든 변경에 토스트를 붙이는
 * 작업의 일부입니다. 슬라이더처럼 계속 움직이는 값(글자 크기·미리보기 줄 수)은
 * 소리 없이 저장해 토스트가 쏟아지지 않게 합니다.
 */
function settingsToast(key: keyof Settings, value: Settings[keyof Settings]): string | null {
  switch (key) {
    case "showScheduleCard":
      return value ? "일정 카드를 표시합니다" : "일정 카드를 숨겼습니다";
    case "showCompletedTasks":
      return value ? "완료한 일도 함께 보기로 했습니다" : "남은 일만 보기로 했습니다";
    case "nowOnly":
      return value ? "NOW 숨김만 보기로 했습니다" : "NOW 숨김을 다시 보이게 했습니다";
    case "projectTaskPreview":
      return `남은 할 일 표시를 ${value}개로 했습니다`;
    case "priorityTaskPreview":
      return `우선순위 표시를 ${value}개로 했습니다`;
    case "projectTaskOrder":
      return value === "far" ? "할 일을 먼 날짜순으로 정렬합니다" : "할 일을 가까운 날짜순으로 정렬합니다";
    case "monthDayItems":
      return `월간 하루 표시를 ${value}개로 했습니다`;
    case "weekDayItems":
      return `주간 하루 일정을 ${value}개까지 보여 줍니다`;
    case "calendarDefaultView":
      return "기본 보기를 바꿨습니다";
    case "calendarShowHidden":
      return value ? "숨긴 항목도 함께 보여 줍니다" : "숨긴 항목은 전체 모드에서만 보여 줍니다";
    case "weekStartsOn":
      return value === 1 ? "한 주의 시작을 월요일로 했습니다" : "한 주의 시작을 일요일로 했습니다";
    case "showWeekends":
      return value ? "주말을 함께 보여 줍니다" : "주말을 접었습니다";
    case "weekStartHour":
      return `주간 시작 시각을 ${String(value).padStart(2, "0")}:00으로 했습니다`;
    case "weekEndHour":
      return `주간 끝 시각을 ${String(value).padStart(2, "0")}:00으로 했습니다`;
    case "binderShowSchedule":
      return value ? "바인더에 오늘 일정을 함께 보여 줍니다" : "바인더의 오늘 일정을 접었습니다";
    case "binderWeekSchedule":
      return value ? "주간 일정 창을 펼쳐 둡니다" : "주간 일정 창을 접었습니다";
    case "binderPaper":
      return value === "ruled" ? "속지를 줄노트로 했습니다" : value === "grid" ? "속지를 모눈으로 했습니다" : "속지를 무지로 했습니다";
    case "archiveDefaultCategory":
      return `아카이브 기본 분류를 ${value}로 했습니다`;
    case "theme":
      return `색감을 ${THEME_OPTIONS.find((option) => option.value === value)?.label ?? ""}으로 바꿨습니다`;
    case "font":
      return `글꼴을 ${FONT_OPTIONS.find((option) => option.value === value)?.label ?? ""}으로 바꿨습니다`;
    case "density":
      return value === "compact" ? "화면을 촘촘히 배치했습니다" : "화면을 여유롭게 배치했습니다";
    case "timeFormat":
      return value === "ampm" ? "시간을 오전·오후로 표기합니다" : "시간을 24시간제로 표기합니다";
    case "archiveView":
      return value === "list" ? "아카이브를 한 줄 목록으로 봅니다" : "아카이브를 카드로 봅니다";
    default:
      return null;
  }
}

interface SettingsContextValue {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** A7: adds a user-made 분류 (stored in this browser). */
  addCategory: (name: string) => void;
  removeCategory: (name: string) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const STORAGE_KEY = "my-diary:settings:v1";

/**
 * A18: 글자 크기 9단계. 1~3은 새로 더한 작은 단계이고, 6단계가 `html { font-size: 15px }`
 * 기본값과 같습니다(예전 3단계를 6단계로 옮겨 적습니다 — 저장된 설정은 한 번 옮겨 줍니다).
 */
const FONT_PX = [11.4, 12, 12.6, 13.2, 14.1, 15, 15.9, 16.8, 17.7];
const FONT_BASE_PX = 15;
const FONT_STEPS = FONT_PX.length;

export function fontSizeToPx(level: number): number {
  const clamped = Math.max(1, Math.min(FONT_STEPS, Math.round(level)));
  return FONT_PX[clamped - 1]!;
}

/** px 글자 크기 클래스들이 곱해서 쓰는 배율(`--fs`). */
export function fontSizeScale(level: number): number {
  return fontSizeToPx(level) / FONT_BASE_PX;
}

export { FONT_STEPS };

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings> & { fontSizeVersion?: number };
        // A18: 예전 6단계 설정(1~6)을 9단계로 옮깁니다 — 같은 크기를 가리키게 3을 더합니다.
        const legacy = parsed.fontSizeVersion !== 2;
        const fontSize =
          legacy && typeof parsed.fontSize === "number"
            ? Math.max(1, Math.min(FONT_STEPS, Math.round(parsed.fontSize) + 3))
            : parsed.fontSize;
        // A19: '완료 보기'의 뜻이 바뀌었습니다(남은 할 일 + 완료한 할 일만). 예전 저장값은 한 번만
        // 기본(남은 할 일)으로 되돌려, 첫 화면에서 카드가 비어 보이지 않게 합니다.
        const legacyCompleted = (parsed as { projectViewVersion?: number }).projectViewVersion !== 2;
        const completed = legacyCompleted ? DEFAULT_SETTINGS.showCompletedTasks : (parsed.showCompletedTasks ?? DEFAULT_SETTINGS.showCompletedTasks);
        const next = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          fontSize: fontSize ?? DEFAULT_SETTINGS.fontSize,
          fontSizeVersion: 2,
          showCompletedTasks: completed,
          projectTaskPreview: Math.max(3, Math.min(8, Number(parsed.projectTaskPreview) || DEFAULT_SETTINGS.projectTaskPreview)),
          priorityTaskPreview: Math.max(3, Math.min(10, Number(parsed.priorityTaskPreview) || DEFAULT_SETTINGS.priorityTaskPreview)),
          weekDayItems: Math.max(3, Math.min(7, Number(parsed.weekDayItems) || DEFAULT_SETTINGS.weekDayItems)) as Settings["weekDayItems"],
          projectTaskOrder: (parsed.projectTaskOrder === "far" ? "far" : "near") as TaskDateOrder,
          projectViewVersion: 2,
        };
        setSettings(next);
        if (legacy || legacyCompleted) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      /* ignore broken storage */
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeToPx(settings.fontSize)}px`;
    document.documentElement.style.setProperty("--fs", String(fontSizeScale(settings.fontSize)));
    document.documentElement.dataset.fontSize = String(settings.fontSize);
  }, [settings.fontSize]);

  /** A48: 색감·글꼴·밀도는 `<html data-…>` 로 두고, globals.css 의 테마 블록이 값을 정합니다. */
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.dataset.density = settings.density;
  }, [settings.theme, settings.font, settings.density]);

  /** A48: 시간 표기 — 화면 곳곳의 시간이 이 값을 따릅니다. */
  useEffect(() => {
    setClockFormat(settings.timeFormat);
  }, [settings.timeFormat]);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    const message = settingsToast(key, value);
    if (message) pushToast(message);
  }, []);

  const addCategory = useCallback((name: string) => {
    const clean = name.trim().slice(0, 12);
    if (!clean) return;
    pushToast(`${clean} 분류를 더했습니다`);
    setSettings((current) => {
      const next = {
        ...current,
        hiddenCategories: current.hiddenCategories.filter((item) => item !== clean),
        customCategories: current.customCategories.includes(clean) ? current.customCategories : [...current.customCategories, clean],
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /** A16: 지운 분류는 목록에서 사라집니다 — 기본 업무·개인·공부도 지울 수 있습니다. */
  const removeCategory = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    pushToast(`${clean} 분류를 지웠습니다`);
    setSettings((current) => {
      const next = {
        ...current,
        customCategories: current.customCategories.filter((item) => item !== clean),
        hiddenCategories: current.hiddenCategories.includes(clean) ? current.hiddenCategories : [...current.hiddenCategories, clean],
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    pushToast("설정을 처음 값으로 되돌렸습니다");
    setSettings(DEFAULT_SETTINGS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ settings, set, addCategory, removeCategory, reset }), [settings, set, addCategory, removeCategory, reset]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
