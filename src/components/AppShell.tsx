"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useUi, type TabKey } from "@/state/ui";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/date";
import {
  ArchiveIcon,
  BookIcon,
  CalendarIcon,
  CheckIcon,
  LayersIcon,
  PlusIcon,
  RepeatIcon,
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
import { EventEditor } from "@/components/editors/EventEditor";
import { TaskEditor } from "@/components/editors/TaskEditor";
import { RoutineEditor } from "@/components/editors/RoutineEditor";
import { BinderEditor } from "@/components/editors/BinderEditor";
import { ArchiveEditor } from "@/components/editors/ArchiveEditor";

const TABS: { key: TabKey; label: string; icon: typeof CalendarIcon }[] = [
  { key: "calendar", label: "캘린더", icon: CalendarIcon },
  { key: "projects", label: "프로젝트", icon: LayersIcon },
  { key: "binder", label: "바인더", icon: BookIcon },
  { key: "archive", label: "아카이브", icon: ArchiveIcon },
];

type QuickKind = "event" | "task" | "routine" | "diary" | "note" | "memo";

const QUICK_ITEMS: { key: QuickKind; label: string; hint: string; icon: typeof PlusIcon }[] = [
  { key: "event", label: "일정", hint: "시간·종일 일정", icon: CalendarIcon },
  { key: "task", label: "할 일", hint: "프로젝트·받은함", icon: CheckIcon },
  { key: "routine", label: "루틴", hint: "매일 반복", icon: RepeatIcon },
  { key: "diary", label: "일기", hint: "오늘 기록", icon: BookIcon },
  { key: "memo", label: "아카이브", hint: "메모·리뷰", icon: ArchiveIcon },
];

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-900 text-white">
        <SparkIcon size={19} />
      </span>
      <p className="text-[0.85rem] text-ink-500">기록을 불러오는 중…</p>
    </div>
  );
}

export function AppShell() {
  const { status, loading, fatalError, demo, resourceErrors, refresh, data } = useData();
  const { tab, setTab, requestReset, setSearchOpen, setSettingsOpen, toasts, dismissToast } = useUi();
  const [today, setToday] = useState(todayISO());
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState<QuickKind | null>(null);
  const lastTap = useRef<{ key: TabKey | null; at: number }>({ key: null, at: 0 });
  const quickRef = useRef<HTMLDivElement | null>(null);

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
      if (event.key === "Escape") setQuickOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  useEffect(() => {
    if (!quickOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!quickRef.current?.contains(event.target as Node)) setQuickOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [quickOpen]);

  const openProjectCount = useMemo(
    () => data.projects.filter((task) => task.kind === "프로젝트" && !task.trash && task.status !== "완료" && task.status !== "취소").length,
    [data.projects],
  );

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

  const startQuick = (kind: QuickKind) => {
    setQuickOpen(false);
    setQuick(kind);
  };

  const errorEntries = useMemo(() => Object.entries(resourceErrors), [resourceErrors]);

  if (!status && loading) return <Splash />;
  if (status?.authRequired && !status.authenticated) return <LoginScreen />;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-paper-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-10 w-full max-w-[1680px] items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-ink-900 text-white">
              <SparkIcon size={11} />
            </span>
            <span className="truncate text-[0.84rem] font-semibold tracking-tight text-ink-900">나의 다이어리</span>
          </div>
          <div className="flex flex-none items-center gap-0.5">
            <SaveIndicator compact />
            <button type="button" className="icon-btn" onClick={() => setSearchOpen(true)} aria-label="검색">
              <SearchIcon size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="설정">
              <SettingsIcon size={16} />
            </button>
          </div>
        </div>
      </header>

      {demo ? (
        <div className="border-b border-paper-300 bg-paper-200/60">
          <div className="mx-auto flex w-full max-w-[1680px] items-center gap-2 px-4 py-1.5 text-[0.72rem] text-ink-600 md:px-8">
            <span className="flex-none font-semibold text-ink-800">데모 미리보기</span>
            <p className="min-w-0 flex-1 truncate">
              아직 Notion에 연결되지 않아 예시 기록을 보여 줍니다.
              <span className="hidden sm:inline"> Vercel에 NOTION_TOKEN을 추가하면 실제 기록으로 바뀝니다.</span>
            </p>
            <button type="button" onClick={() => setSettingsOpen(true)} className="flex-none rounded-full border border-paper-400 px-2 py-0.5 text-[0.68rem] hover:bg-white">
              연결 방법
            </button>
          </div>
        </div>
      ) : null}

      {fatalError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-1.5 md:px-8">
          <div className="mx-auto flex w-full max-w-[1680px] items-center gap-2 text-[0.74rem] text-red-600">
            <p className="min-w-0 flex-1">{fatalError}</p>
            <button type="button" onClick={() => void refresh()} className="btn-outline btn-xs flex-none">
              다시 시도
            </button>
          </div>
        </div>
      ) : null}

      {errorEntries.length > 0 && !fatalError ? (
        <div className="border-b border-paper-300 bg-paper-200/50 px-4 py-1.5 md:px-8">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-1 text-[0.72rem] text-ink-600 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1">
              일부 DB를 불러오지 못했습니다: {errorEntries.map(([key]) => key).join(", ")} ·{" "}
              <span className="text-ink-400">{errorEntries[0]?.[1]}</span>
            </p>
            <button type="button" onClick={() => void refresh()} className="btn-outline btn-xs flex-none self-start sm:self-auto">
              다시 시도
            </button>
          </div>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 px-4 pb-[calc(4.6rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pt-6 lg:px-10">
        <div className="mx-auto w-full max-w-[1680px]">
          {tab === "calendar" ? <CalendarTab /> : null}
          {tab === "projects" ? <ProjectsTab /> : null}
          {tab === "binder" ? <BinderTab /> : null}
          {tab === "archive" ? <ArchiveTab /> : null}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-paper-300 bg-white/95 pb-safe backdrop-blur">
        <div className="relative mx-auto flex h-[3.4rem] w-full max-w-[1680px] items-center gap-0.5 px-2 pr-[4.4rem] md:px-6 md:pr-[5rem]">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleTabPress(item.key)}
                className={cn("nav-pill tap-highlight-none", active && "nav-pill-active")}
              >
                {item.label}
                {item.key === "projects" && openProjectCount > 0 ? (
                  <span className={cn("text-[0.74rem] font-semibold", active ? "text-blue-500" : "text-blue-500/80")}>
                    {openProjectCount}
                  </span>
                ) : null}
              </button>
            );
          })}

          <div ref={quickRef} className="absolute right-2 top-1/2 -translate-y-1/2 md:right-6">
            {quickOpen ? (
              <div className="absolute bottom-[3.4rem] right-0 w-[13.5rem] animate-pop-in overflow-hidden rounded-2xl border border-paper-300 bg-white p-1 shadow-lift">
                {QUICK_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => startQuick(item.key)}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition hover:bg-paper-200/70"
                    >
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-paper-200 text-ink-600">
                        <Icon size={13} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.8rem] font-medium text-ink-900">{item.label}</span>
                        <span className="block text-[0.64rem] text-ink-400">{item.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setQuickOpen((current) => !current)}
              aria-label="빠른 추가"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-white transition hover:bg-ink-800 active:scale-95 md:h-10 md:w-10",
                quickOpen && "rotate-45",
              )}
            >
              <PlusIcon size={18} />
            </button>
          </div>
        </div>
      </nav>

      <SearchDialog />
      <SettingsDialog />

      <EventEditor open={quick === "event"} onClose={() => setQuick(null)} draft={{ date: todayISO() }} />
      <TaskEditor open={quick === "task"} onClose={() => setQuick(null)} draft={{ kind: "할 일", date: todayISO() }} />
      <RoutineEditor open={quick === "routine"} onClose={() => setQuick(null)} routineId={null} />
      <BinderEditor open={quick === "diary" || quick === "note"} onClose={() => setQuick(null)} draft={{ date: todayISO(), kind: quick === "note" ? "노트" : "일기" }} />
      <ArchiveEditor open={quick === "memo"} onClose={() => setQuick(null)} draft={{ date: todayISO() }} />

      <div className="pointer-events-none fixed bottom-[calc(4.4rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 md:inset-x-8 md:bottom-6 md:left-auto md:translate-x-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-2 text-[0.76rem] shadow-lift animate-slide-up",
              toast.tone === "error"
                ? "border-red-200 bg-red-50 text-red-600"
                : toast.tone === "success"
                  ? "border-sage-200 bg-sage-50 text-sage-500"
                  : "border-paper-300 bg-white text-ink-700",
            )}
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button type="button" onClick={() => dismissToast(toast.id)} className="flex-none text-ink-400 hover:text-ink-700">
              <XIcon size={13} />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
