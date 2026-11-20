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
} from "react";
import type { Resource } from "@/lib/types";
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
  resetSignal: Record<TabKey, number>;
  requestReset: (tab: TabKey) => void;
  focus: FocusTarget | null;
  openItem: (resource: Resource, id: string) => void;
  clearFocus: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toasts: Toast[];
  notify: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  pendingBinderDate: string | null;
  openBinderForDate: (date: string) => void;
  consumeBinderDate: () => void;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingBinderDate, setPendingBinderDate] = useState<string | null>(null);

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

  const setTab = useCallback((next: TabKey) => {
    setTabState(next);
    try {
      window.localStorage.setItem("my-diary:tab", next);
    } catch {
      /* ignore */
    }
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

  const openBinderForDate = useCallback(
    (date: string) => {
      setPendingBinderDate(date);
      setTab("binder");
    },
    [setTab],
  );

  const consumeBinderDate = useCallback(() => setPendingBinderDate(null), []);

  const value = useMemo<UiContextValue>(
    () => ({
      tab,
      setTab,
      resetSignal,
      requestReset,
      focus,
      openItem,
      clearFocus,
      searchOpen,
      setSearchOpen,
      settingsOpen,
      setSettingsOpen,
      toasts,
      notify,
      dismissToast,
      pendingBinderDate,
      openBinderForDate,
      consumeBinderDate,
    }),
    [
      tab,
      setTab,
      resetSignal,
      requestReset,
      focus,
      openItem,
      clearFocus,
      searchOpen,
      settingsOpen,
      toasts,
      notify,
      dismissToast,
      pendingBinderDate,
      openBinderForDate,
      consumeBinderDate,
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
