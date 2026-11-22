"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";import type { Resource, TaskDraft } from "@/lib/types";
import { uid } from "@/lib/utils";

export type TabKey = "calendar" | "projects" | "binder" | "archive";

export interface FocusTarget {
  resource: Resource;
  id: string;
}

interface Toast {
  id: string;
  message: string;
  tone: "info" | "error" | "success";
}

interface UiContextValue {
  tab: TabKey;
  setTab: (tab: TabKey) => void;
  /** A15: the sub-view of every tab lives here so 뒤로 가기 restores it. */
  views: Record<TabKey, string>;
  setView: (tab: TabKey, view: string, opts?: { replace?: boolean }) => void;
  resetSignal: Record<TabKey, number>;
  requestReset: (tab: TabKey) => void;
  focus: FocusTarget | null;
  openItem: (resource: Resource, id: string) => void;
  clearFocus: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** A40: 일괄 관리 창 — 검색과 별개의, 여러 항목을 고쳐 쓰는 화면. */
  bulkOpen: boolean;
  setBulkOpen: (open: boolean) => void;
  /** P0-1: one web trash for every record type — 캘린더·프로젝트·루틴·바인더·아카이브. */
  trashFilter: Resource | "all" | null;
  openTrash: (resource?: Resource | "all") => void;
  closeTrash: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toasts: Toast[];
  notify: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  pendingBinderDate: string | null;
  openBinderForDate: (date: string) => void;
  consumeBinderDate: () => void;
  /**
   * A30: 새 할 일·프로젝트는 앱 전체에 하나뿐인 플로팅 창에서 만듭니다.
   * 어느 탭에서 열어도 창이 유지되고, 탭을 옮겨도 뒤 화면만 바뀝니다.
   */
  taskDraft: TaskDraft | null;
  openTaskDraft: (draft?: TaskDraft) => void;
  closeTaskDraft: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export const TAB_FOR_RESOURCE: Record<Resource, TabKey> = {
  calendar: "calendar",
  projects: "projects",
  routines: "projects",
  binder: "binder",
  archive: "archive",
};

export function UiProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<TabKey>("calendar");
  const [resetSignal, setResetSignal] = useState<Record<TabKey, number>>({
    calendar: 0,
    projects: 0,
    binder: 0,
    archive: 0,
  });
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [trashFilter, setTrashFilter] = useState<Resource | "all" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingBinderDate, setPendingBinderDate] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [views, setViews] = useState<Record<TabKey, string>>({ calendar: "week", projects: "tracks", binder: "weekly", archive: "" });
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  /** True while a popstate is being applied, so it never pushes again. */
  const fromHistory = useRef(false);

  // A4: a layer unwind can re-render the shell; the tab the user was on is kept.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("my-diary:tab");
      if (stored === "calendar" || stored === "projects" || stored === "binder" || stored === "archive") {
        setTabState(stored);
      }
    } catch {
      /* private mode */
    }
  }, []);

  const notify = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = uid("toast");
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const writeRoute = useCallback((next: { tab?: TabKey; view?: string }, mode: "push" | "replace") => {
    if (typeof window === "undefined") return;
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    const current = (state.diaryRoute ?? {}) as { tab?: TabKey; view?: string };
    const route = { tab: next.tab ?? tabRef.current, view: next.view ?? viewsRef.current[(next.tab ?? tabRef.current)] };
    const merged = { ...state, diaryRoute: { ...current, ...route } };
    if (mode === "push") window.history.pushState(merged, "");
    else window.history.replaceState(merged, "");
  }, []);

  const setTab = useCallback(
    (next: TabKey) => {
      setTabState(next);
      try {
        window.localStorage.setItem("my-diary:tab", next);
      } catch {
        /* ignore */
      }
      if (!fromHistory.current) writeRoute({ tab: next, view: viewsRef.current[next] }, "push");
    },
    [writeRoute],
  );

  const setView = useCallback(
    (target: TabKey, view: string, opts?: { replace?: boolean }) => {
      setViews((current) => (current[target] === view ? current : { ...current, [target]: view }));
      if (!fromHistory.current) writeRoute({ tab: target, view }, opts?.replace ? "replace" : "push");
    },
    [writeRoute],
  );

  /** A15: the browser's back button walks the tabs and views the user visited. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    if (!state.diaryRoute) {
      window.history.replaceState({ ...state, diaryRoute: { tab: tabRef.current, view: viewsRef.current[tabRef.current] } }, "");
    }
    const onPop = () => {
      const route = ((window.history.state ?? {}) as Record<string, unknown>).diaryRoute as
        | { tab?: TabKey; view?: string }
        | undefined;
      if (!route) return;
      fromHistory.current = true;
      if (route.tab) {
        setTabState(route.tab);
        try {
          window.localStorage.setItem("my-diary:tab", route.tab);
        } catch {
          /* ignore */
        }
      }
      if (route.tab && route.view) {
        setViews((current) => (current[route.tab as TabKey] === route.view ? current : { ...current, [route.tab as TabKey]: route.view as string }));
      }
      window.setTimeout(() => {
        fromHistory.current = false;
      }, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const requestReset = useCallback((target: TabKey) => {
    setResetSignal((current) => ({ ...current, [target]: current[target] + 1 }));
  }, []);

  const openItem = useCallback(
    (resource: Resource, id: string) => {
      setFocus({ resource, id });
      setSearchOpen(false);
      setTab(TAB_FOR_RESOURCE[resource]);
    },
    [setTab],
  );

  const clearFocus = useCallback(() => setFocus(null), []);

  const openTrash = useCallback((resource: Resource | "all" = "all") => {
    setSearchOpen(false);
    setTrashFilter(resource);
  }, []);

  const closeTrash = useCallback(() => setTrashFilter(null), []);

  const openBinderForDate = useCallback(
    (date: string) => {
      setPendingBinderDate(date);
      setTab("binder");
    },
    [setTab],
  );

  const consumeBinderDate = useCallback(() => setPendingBinderDate(null), []);

  const openTaskDraft = useCallback((draft: TaskDraft = {}) => setTaskDraft(draft), []);
  const closeTaskDraft = useCallback(() => setTaskDraft(null), []);

  const value = useMemo<UiContextValue>(
    () => ({
      tab,
      setTab,
      views,
      setView,
      resetSignal,
      requestReset,
      focus,
      openItem,
      clearFocus,
      searchOpen,
      setSearchOpen,
      bulkOpen,
      setBulkOpen,
      trashFilter,
      openTrash,
      closeTrash,
      settingsOpen,
      setSettingsOpen,
      toasts,
      notify,
      dismissToast,
      pendingBinderDate,
      openBinderForDate,
      consumeBinderDate,
      taskDraft,
      openTaskDraft,
      closeTaskDraft,
    }),
    [
      tab,
      setTab,
      views,
      setView,
      resetSignal,
      requestReset,
      focus,
      openItem,
      clearFocus,
      searchOpen,
      bulkOpen,
      trashFilter,
      openTrash,
      closeTrash,
      settingsOpen,
      toasts,
      notify,
      dismissToast,
      pendingBinderDate,
      openBinderForDate,
      consumeBinderDate,
      taskDraft,
      openTaskDraft,
      closeTaskDraft,
    ],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const context = useContext(UiContext);
  if (!context) throw new Error("useUi must be used inside UiProvider");
  return context;
}

/** Watches the double-tap reset signal for one tab. */
export function useTabReset(key: TabKey, onReset: () => void): void {
  const { resetSignal } = useUi();
  const signal = resetSignal[key];
  const handled = useRef(signal);
  const callback = useRef(onReset);
  callback.current = onReset;

  useEffect(() => {
    if (signal === handled.current) return;
    handled.current = signal;
    callback.current();
  }, [signal]);
}
