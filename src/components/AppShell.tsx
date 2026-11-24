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
  ListIcon,
  PlusIcon,
  RepeatIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { SaveIndicator } from "@/components/SaveIndicator";
import { ConflictDialog } from "@/components/ConflictDialog";
import { LoginScreen } from "@/components/LoginScreen";
import { SearchDialog } from "@/components/SearchDialog";
import { BulkManageDialog } from "@/components/BulkManageDialog";
import { TrashDialog } from "@/components/TrashDialog";
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
  { key: "task", label: "할 일", hint: "프로젝트·index", icon: CheckIcon },
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
      <p className="text-[calc(15px*var(--fs))] text-ink-500">기록을 불러오는 중…</p>
    </div>
  );
}

export function AppShell() {
  const { status, loading, fatalError, demo, resourceErrors, refresh, data } = useData();
  const { tab, setTab, requestReset, setSearchOpen, setBulkOpen, openTrash, setSettingsOpen, toasts, dismissToast, taskDraft, openTaskDraft, closeTaskDraft } = useUi();
  const [today, setToday] = useState(todayISO());
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState<QuickKind | null>(null);
  const lastTap = useRef<{ key: TabKey | null; at: number }>({ key: null, at: 0 });
  const quickRef = useRef<HTMLDivElement | null>(null);
  /** The top bar stays out of the way until the pointer reaches the top edge. */
  const [chromeOpen, setChromeOpen] = useState(false);
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openChrome = () => {
    if (chromeTimer.current) {
      clearTimeout(chromeTimer.current);
      chromeTimer.current = null;
    }
    setChromeOpen(true);
  };
  const closeChrome = () => setChromeOpen(false);
  /** A16: an upward swipe on the open bar (dy < -24px) puts it away at once. */
  const chromeTouchY = useRef<number | null>(null);
  const onChromeTouchStart = (event: React.TouchEvent) => {
    chromeTouchY.current = event.touches[0]?.clientY ?? null;
  };
  const onChromeTouchMove = (event: React.TouchEvent) => {
    const start = chromeTouchY.current;
    const current = event.touches[0]?.clientY;
    if (start === null || current === undefined) return;
    if (start - current > 24) {
      chromeTouchY.current = null;
      closeChrome();
    }
  };
  const onChromeTouchEnd = () => {
    chromeTouchY.current = null;
  };
  const scheduleClose = () => {
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => {
      chromeTimer.current = null;
      // A focused control inside the bar (typing in search) keeps it open.
      if (chromeRef.current?.contains(document.activeElement)) return;
      setChromeOpen(false);
    }, 240);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChromeOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Leaving the top band (or the bar itself) lets it slide away again. */
  useEffect(() => {
    if (!chromeOpen) return;
    const onMove = (event: MouseEvent) => {
      if (event.clientY > 120) scheduleClose();
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chromeOpen]);

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
    // A30: 할 일은 다른 화면의 + new 와 같은 플로팅 창에서 만듭니다.
    if (kind === "task") {
      openTaskDraft({ kind: "할 일", date: todayISO() });
      return;
    }
    setQuick(kind);
  };

  const errorEntries = useMemo(() => Object.entries(resourceErrors), [resourceErrors]);

  const unconfigured = status?.unconfigured ?? [];
  const unconfiguredLabels = useMemo(
    () => unconfigured.map((resource) => status?.dbs?.[resource]?.label ?? resource),
    [status?.dbs, unconfigured],
  );

  if (!status && loading) return <Splash />;
  if (status?.authRequired && !status.authenticated) return <LoginScreen />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper-50">
      {/* Chrome (나의 다이어리 · 검색 · 휴지통 · 설정) is an overlay: the page uses the full
          height, and the bar slides down when the pointer reaches the top edge. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 print:hidden" ref={chromeRef}>
        <div
          aria-hidden="true"
          className="pointer-events-auto hidden h-2.5 w-full md:block"
          onMouseEnter={openChrome}
        />
        <button
          type="button"
          onClick={() => (chromeOpen ? closeChrome() : openChrome())}
          onTouchStart={onChromeTouchStart}
          onTouchMove={onChromeTouchMove}
          onTouchEnd={onChromeTouchEnd}
          aria-label={chromeOpen ? "상단 메뉴 닫기" : "상단 메뉴 열기"}
          aria-expanded={chromeOpen}
          className="pointer-events-auto absolute left-1/2 top-0 flex h-4 w-12 -translate-x-1/2 items-center justify-center rounded-b-full border border-t-0 border-paper-400 bg-white/95 text-ink-400 shadow-soft md:hidden"
        >
          <span className="h-[3px] w-5 rounded-full bg-paper-400" />
        </button>
        <div
          onMouseEnter={openChrome}
          onMouseLeave={scheduleClose}
          onTouchStart={onChromeTouchStart}
          onTouchMove={onChromeTouchMove}
          onTouchEnd={onChromeTouchEnd}
          onFocus={openChrome}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClose();
          }}
          className={cn(
            "border-b border-paper-300 bg-white/95 backdrop-blur transition-[transform,opacity] duration-200 ease-out",
            chromeOpen ? "pointer-events-auto translate-y-0 opacity-100 shadow-[0_6px_18px_-14px_rgba(17,24,39,0.5)]" : "pointer-events-none -translate-y-full opacity-0",
          )}
        >
          <div className="mx-auto flex h-11 w-full max-w-[1680px] items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-ink-900 text-white">
                <SparkIcon size={11} />
              </span>
              <span className="truncate text-[calc(15px*var(--fs))] font-semibold tracking-tight text-ink-900">나의 다이어리</span>
            </div>
            <div className="flex flex-none items-center gap-0.5">
              <SaveIndicator compact />
              <ConflictDialog />
              <button type="button" className="icon-btn" onClick={() => setSearchOpen(true)} aria-label="검색">
                <SearchIcon size={16} />
              </button>
              <button
                type="button"
                data-bulk-open="chrome"
                onClick={() => setBulkOpen(true)}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-paper-200 px-2.5 text-[calc(13.5px*var(--fs))] font-medium text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
                aria-label="일괄 관리"
                title="여러 일정·할 일을 한 번에 고치기"
              >
                <ListIcon size={14} /> 일괄 관리
              </button>
              <button type="button" className="icon-btn" onClick={() => openTrash("all")} aria-label="휴지통">
                <TrashIcon size={16} />
              </button>
              <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="설정">
                <SettingsIcon size={16} />
              </button>
            </div>
          </div>

      {demo ? (
            <div className="border-b border-paper-300 bg-paper-200/60">
              <div className="mx-auto flex w-full max-w-[1680px] items-center gap-2 px-4 py-1.5 text-[calc(14px*var(--fs))] text-ink-600 md:px-6 lg:px-8">
                <span className="flex-none font-semibold text-ink-800">데모 미리보기</span>
                <p className="min-w-0 flex-1 truncate">
                  아직 Notion에 연결되지 않아 예시 기록을 보여 줍니다.
                  <span className="hidden sm:inline"> Vercel에 NOTION_TOKEN을 추가하면 실제 기록으로 바뀝니다.</span>
                </p>
                <button type="button" onClick={() => setSettingsOpen(true)} className="flex-none rounded-full border border-paper-400 px-2 py-0.5 text-[calc(14px*var(--fs))] hover:bg-white">
                  연결 방법
                </button>
              </div>
            </div>
          ) : null}

          {!demo && unconfigured.length > 0 ? (
            <div className="border-b border-amber-200 bg-amber-50/70">
              <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-1 px-4 py-1.5 text-[calc(14px*var(--fs))] text-amber-800 sm:flex-row sm:items-center md:px-6 lg:px-8">
                <p className="min-w-0 flex-1">
                  미연결 DB: {unconfiguredLabels.join(" · ")}
                  <span className="hidden sm:inline"> — 이 DB를 쓰는 화면은 조회·저장되지 않습니다. 설정 → 연결에서 상태를 확인하세요.</span>
                </p>
                <button type="button" onClick={() => setSettingsOpen(true)} className="flex-none self-start rounded-full border border-amber-300 px-2 py-0.5 text-[calc(14px*var(--fs))] hover:bg-white sm:self-auto">
                  연결 설정
                </button>
              </div>
            </div>
          ) : null}

          {errorEntries.length > 0 && !fatalError ? (
            <div className="border-b border-paper-300 bg-paper-200/50 px-4 py-1.5 md:px-6 lg:px-8">
              <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-1 text-[calc(14px*var(--fs))] text-ink-600 sm:flex-row sm:items-center">
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

        </div>
      </div>

      {fatalError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-1.5 md:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1680px] items-center gap-2 text-[calc(14.5px*var(--fs))] text-red-600">
            <p className="min-w-0 flex-1">{fatalError}</p>
            <button type="button" onClick={() => void refresh()} className="btn-outline btn-xs flex-none">
              다시 시도
            </button>
          </div>
        </div>
      ) : null}


      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(3.4rem+env(safe-area-inset-bottom))] pt-2 md:px-6 md:pt-2 lg:px-8">
        <div className="mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col">
          {tab === "calendar" ? <CalendarTab /> : null}
          {tab === "projects" ? <ProjectsTab /> : null}
          {tab === "binder" ? <BinderTab /> : null}
          {tab === "archive" ? <ArchiveTab /> : null}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-paper-300 bg-white/95 pb-safe backdrop-blur">
        <div className="relative mx-auto flex h-[3.4rem] w-full max-w-[1680px] items-center gap-0.5 px-2 pr-[4.4rem] md:px-6 md:pr-[5rem] lg:px-8">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                data-tab={item.key}
                onClick={() => handleTabPress(item.key)}
                className={cn("nav-pill tap-highlight-none", active && "nav-pill-active")}
              >
                {item.label}
                {item.key === "projects" && openProjectCount > 0 ? (
                  <span className={cn("text-[calc(14.5px*var(--fs))] font-semibold", active ? "text-blue-500" : "text-blue-500/80")}>
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
                        <span className="block text-[calc(15px*var(--fs))] font-medium text-ink-900">{item.label}</span>
                        <span className="block text-[calc(13.5px*var(--fs))] text-ink-400">{item.hint}</span>
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
      <BulkManageDialog />
      <TrashDialog />
      <SettingsDialog />

      <EventEditor open={quick === "event"} onClose={() => setQuick(null)} draft={{ date: todayISO() }} />
      <RoutineEditor open={quick === "routine"} onClose={() => setQuick(null)} routineId={null} />
      <BinderEditor open={quick === "diary" || quick === "note"} onClose={() => setQuick(null)} draft={{ date: todayISO(), kind: quick === "note" ? "노트" : "일기" }} />
      <ArchiveEditor open={quick === "memo"} onClose={() => setQuick(null)} draft={{ date: todayISO() }} />

      {/* A30: 새 할 일·프로젝트 — 탭을 옮겨도 유지되는 비차단 플로팅 창 */}
      <TaskEditor open={taskDraft !== null} draft={taskDraft ?? undefined} onClose={closeTaskDraft} />

      <div className="pointer-events-none fixed bottom-[calc(4.4rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 md:inset-x-8 md:bottom-6 md:left-auto md:translate-x-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-toast="true"
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-2 text-[calc(15px*var(--fs))] shadow-lift animate-slide-up",
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
