"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useUi, type TabKey } from "@/state/ui";
import { cn } from "@/lib/utils";
import { addDaysISO, formatFullKo, todayISO, weekdayKo, weekKeyOf } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import {
  ArchiveIcon,
  BookIcon,
  CalendarIcon,
  LayersIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
  XIcon,
} from "@/components/icons";
import { SaveIndicator } from "@/components/SaveIndicator";
import { LoginScreen } from "@/components/LoginScreen";
import { SearchDialog } from "@/components/SearchDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { CalendarTab } from "@/components/calendar/CalendarTab";
import { ProjectsTab } from "@/components/projects/ProjectsTab";
import { BinderTab } from "@/components/binder/BinderTab";
import { ArchiveTab } from "@/components/archive/ArchiveTab";

const TABS: { key: TabKey; label: string; icon: typeof CalendarIcon; hint: string }[] = [
  { key: "calendar", label: "캘린더", icon: CalendarIcon, hint: "일정·목표·루틴" },
  { key: "projects", label: "프로젝트", icon: LayersIcon, hint: "할 일·우선순위" },
  { key: "binder", label: "바인더", icon: BookIcon, hint: "일기·노트" },
  { key: "archive", label: "아카이브", icon: ArchiveIcon, hint: "모아 둔 것들" },
];

function Splash() {
  return (
    <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-paper-300 bg-[#fffdfa] text-accent-500 shadow-soft">
        <SparkIcon size={22} />
      </div>
      <div className="text-center">
        <p className="serif text-[1.15rem] text-ink-800">나의 다이어리</p>
        <p className="mt-1 text-[0.75rem] text-ink-500">기록을 불러오는 중…</p>
      </div>
      <div className="mt-1 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-300"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function AppShell() {
  const { status, loading, fatalError, demo, resourceErrors, refresh, logout } = useData();
  const { tab, setTab, requestReset, setSearchOpen, setSettingsOpen, toasts, dismissToast } = useUi();
  const [today, setToday] = useState(todayISO());
  const lastTap = useRef<{ key: TabKey | null; at: number }>({ key: null, at: 0 });

  useEffect(() => {
    const timer = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  const todayLabel = `${Number(today.slice(5, 7))}월 ${Number(today.slice(8, 10))}일 ${weekdayKo(today)}요일`;
  const holiday = holidayName(today);
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0]!;

  const handleTabPress = (key: TabKey) => {
    const now = Date.now();
    if (tab === key && now - lastTap.current.at < 330) {
      requestReset(key);
      lastTap.current = { key: null, at: 0 };
      return;
    }
    lastTap.current = { key, at: now };
    setTab(key);
  };

  const errorEntries = useMemo(() => Object.entries(resourceErrors), [resourceErrors]);

  if (!status && loading) return <Splash />;
  if (status?.authRequired && !status.authenticated) return <LoginScreen />;

  return (
    <div className="relative z-10 flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-paper-300/70 bg-[#faf7f1]/70 px-4 pb-5 pt-6 backdrop-blur-sm md:flex">
        <div className="flex items-center gap-2.5 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900 text-paper-50">
            <SparkIcon size={17} />
          </span>
          <div>
            <p className="serif text-[1.05rem] leading-tight text-ink-900">나의 다이어리</p>
            <p className="text-[0.6rem] uppercase tracking-[0.18em] text-ink-400">Notion connected</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-paper-300/70 bg-[#fffdfa]/80 px-3.5 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-ink-400">{weekKeyOf(today)}</p>
          <p className="mt-0.5 text-[0.92rem] font-medium text-ink-800">{todayLabel}</p>
          <p className={cn("mt-0.5 text-[0.72rem]", holiday ? "text-accent-600" : "text-ink-500")}>
            {holiday ?? formatFullKo(today).split(" ").slice(0, 3).join(" ")}
          </p>
        </div>

        <nav className="mt-5 flex flex-col gap-1">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleTabPress(item.key)}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition",
                  active ? "bg-ink-900 text-paper-50 shadow-sm" : "text-ink-600 hover:bg-paper-200/70 hover:text-ink-900",
                )}
                title={`${item.label} · 두 번 누르면 기본 화면`}
              >
                <Icon size={18} className={active ? "text-paper-100" : "text-ink-500 group-hover:text-ink-800"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.86rem] font-medium leading-tight">{item.label}</span>
                  <span className={cn("block text-[0.66rem]", active ? "text-paper-300" : "text-ink-400")}>{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-1.5 pt-6">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[0.8rem] text-ink-600 transition hover:bg-paper-200/70 hover:text-ink-900"
          >
            <SearchIcon size={16} /> 검색
            <span className="ml-auto rounded border border-paper-400 px-1 py-0.5 text-[0.6rem] text-ink-400">⌘K</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[0.8rem] text-ink-600 transition hover:bg-paper-200/70 hover:text-ink-900"
          >
            <SettingsIcon size={16} /> 설정
          </button>
          {status?.authRequired ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[0.8rem] text-ink-400 transition hover:bg-paper-200/70 hover:text-ink-700"
            >
              잠그기
            </button>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-paper-300/60 bg-[#f8f5ef]/85 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-2 px-3 md:h-[4.5rem] md:px-7">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-ink-900 text-paper-50">
                <SparkIcon size={14} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.9rem] font-semibold leading-tight text-ink-900">{activeTab.label}</p>
                <p className="text-[0.64rem] leading-tight text-ink-500">{todayLabel}</p>
              </div>
            </div>
            <div className="hidden min-w-0 md:block">
              <h1 className="serif truncate text-[1.42rem] leading-tight text-ink-900">{activeTab.label}</h1>
              <p className={cn("text-[0.75rem]", holiday ? "text-accent-600" : "text-ink-500")}>
                {todayLabel}
                {holiday ? ` · ${holiday}` : ""}
              </p>
            </div>
            <div className="flex flex-none items-center gap-0.5">
              <SaveIndicator compact />
              <button type="button" className="icon-btn" onClick={() => setSearchOpen(true)} aria-label="검색">
                <SearchIcon size={18} />
              </button>
              <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="설정">
                <SettingsIcon size={18} />
              </button>
            </div>
          </div>
        </header>

        {demo ? (
          <div className="border-b border-amber-200/70 bg-amber-50/80 px-3 py-2 md:px-7">
            <div className="mx-auto flex w-full max-w-[1200px] items-center gap-2 text-[0.74rem] text-amber-800">
              <SparkIcon size={14} className="flex-none" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">데모 미리보기</span> — 아직 Notion에 연결되지 않아 예시 기록을 보여 줍니다.
                <span className="hidden sm:inline"> Vercel에 <span className="font-mono">NOTION_TOKEN</span>을 추가하면 실제 기록으로 바뀝니다.</span>
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="hidden flex-none rounded-full border border-amber-300 px-2.5 py-1 text-[0.7rem] font-medium hover:bg-amber-100 sm:inline-flex"
              >
                연결 방법
              </button>
            </div>
          </div>
        ) : null}

        {fatalError ? (
          <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 md:px-7">
            <div className="mx-auto flex w-full max-w-[1200px] items-center gap-2 text-[0.76rem] text-rose-700">
              <p className="min-w-0 flex-1">{fatalError}</p>
              <button type="button" onClick={() => void refresh()} className="btn-outline btn-xs flex-none">
                다시 시도
              </button>
            </div>
          </div>
        ) : null}

        {errorEntries.length > 0 && !fatalError ? (
          <div className="border-b border-paper-300 bg-paper-50 px-3 py-2 md:px-7">
            <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 text-[0.72rem] text-ink-600 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1">
                일부 DB를 불러오지 못했습니다: {errorEntries.map(([key]) => key).join(", ")} ·{" "}
                <span className="text-ink-500">{errorEntries[0]?.[1]}</span>
              </p>
              <button type="button" onClick={() => void refresh()} className="btn-outline btn-xs flex-none self-start sm:self-auto">
                다시 시도
              </button>
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 px-3 pb-[calc(5.6rem+env(safe-area-inset-bottom))] pt-3 md:px-7 md:pb-10 md:pt-5">
          <div className="mx-auto w-full max-w-[1200px]">
            {tab === "calendar" ? <CalendarTab /> : null}
            {tab === "projects" ? <ProjectsTab /> : null}
            {tab === "binder" ? <BinderTab /> : null}
            {tab === "archive" ? <ArchiveTab /> : null}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-paper-300/80 bg-[#fffdfa]/95 pb-safe backdrop-blur-lg md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pb-1 pt-1.5">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleTabPress(item.key)}
                className={cn(
                  "tap-highlight-none flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition",
                  active ? "text-ink-900" : "text-ink-400",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition", active && "bg-paper-200/80")}>
                  <Icon size={19} />
                </span>
                <span className={cn("text-[0.64rem]", active ? "font-semibold" : "font-medium")}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <SearchDialog />
      <SettingsDialog />

      <div className="pointer-events-none fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-2xl border px-3.5 py-2.5 text-[0.78rem] shadow-lift animate-slide-up",
              toast.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : toast.tone === "success"
                  ? "border-sage-200 bg-sage-50 text-sage-500"
                  : "border-paper-300 bg-[#fffdfa] text-ink-700",
            )}
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button type="button" onClick={() => dismissToast(toast.id)} className="flex-none text-ink-400 hover:text-ink-700">
              <XIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
