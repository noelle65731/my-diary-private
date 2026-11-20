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
import { buildDemoData } from "@/lib/demo-data";
import { todayISO } from "@/lib/date";
import { uid } from "@/lib/utils";
import { useUi } from "@/state/ui";
import {
  emptyData,
  type AllData,
  type AnyItem,
  type ArchiveEntry,
  type BinderEntry,
  type CalendarEvent,
  type ProjectTask,
  type Resource,
  type Routine,
  type StatusPayload,
} from "@/lib/types";
import { coerceSpans } from "@/lib/richtext";

type Patch = Record<string, unknown>;

interface DataContextValue {
  data: AllData;
  status: StatusPayload | null;
  loading: boolean;
  demo: boolean;
  fatalError: string | null;
  resourceErrors: Partial<Record<Resource, string>>;
  savingCount: number;
  saveError: string | null;
  lastSavedAt: number | null;
  refresh: () => Promise<void>;
  login: (password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  create: (resource: Resource, patch: Patch) => Promise<AnyItem | null>;
  update: (resource: Resource, id: string, patch: Patch) => Promise<boolean>;
  remove: (resource: Resource, id: string) => Promise<void>;
  destroy: (resource: Resource, id: string) => Promise<void>;
  setRoutineCount: (routine: Routine, date: string, count: number) => Promise<void>;
  findItem: (resource: Resource, id: string) => AnyItem | undefined;
  /** A5: the Notion page body of one record ('내용'). */
  fetchBody: (resource: Resource, id: string) => Promise<PageBodyPayload | null>;
  saveBody: (resource: Resource, id: string, text: string) => Promise<boolean>;
}

export interface PageBodyPayload {
  text: string;
  preserved: string[];
}

const DataContext = createContext<DataContextValue | null>(null);

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* empty body */
  }
  const payload = (body ?? {}) as { ok?: boolean; error?: { message?: string } };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? "요청을 처리하지 못했습니다.");
  }
  return body as T;
}

function replaceIn<T extends AnyItem>(items: T[], item: T): T[] {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [item, ...items];
  const copy = [...items];
  copy[index] = item;
  return copy;
}

function sharedDefaults() {
  const now = new Date().toISOString();
  return {
    url: "",
    hidden: false,
    trash: false,
    favorite: false,
    memo: "",
    sort: null,
    projectIds: [] as string[],
    createdAt: now,
    updatedAt: now,
  };
}

function draftItem(resource: Resource, patch: Patch, id = uid("new")): AnyItem {
  const defaults = sharedDefaults();
  const base = {
    ...defaults,
    id,
    title: String(patch["title"] ?? "새 항목"),
    // Keep the optimistic row identical to what the patch asks for, so a flag such as
    // `favorite` (이번 주 꼭) is visible immediately in demo mode and before the server replies.
    hidden: Boolean(patch["hidden"] ?? defaults.hidden),
    favorite: Boolean(patch["favorite"] ?? defaults.favorite),
    memo: typeof patch["memo"] === "string" ? (patch["memo"] as string) : defaults.memo,
    memoRich: Array.isArray(patch["memoRich"]) ? coerceSpans(patch["memoRich"]) : undefined,
    sort: typeof patch["sort"] === "number" ? (patch["sort"] as number) : defaults.sort,
    projectIds: Array.isArray(patch["projectIds"]) ? (patch["projectIds"] as string[]) : defaults.projectIds,
  };
  if (resource === "calendar") {
    return {
      ...base,
      kind: (patch["kind"] as CalendarEvent["kind"]) ?? "일정",
      category: (patch["category"] as CalendarEvent["category"]) ?? "개인",
      date: (patch["date"] as string) ?? todayISO(),
      startTime: (patch["startTime"] as string | null) ?? null,
      endDate: (patch["endDate"] as string | null) ?? null,
      endTime: (patch["endTime"] as string | null) ?? null,
      allDay: !patch["startTime"],
      done: false,
      canceled: false,
      cancelReason: "",
      cancelAt: null,
      weekKey: (patch["weekKey"] as string) ?? "",
      baseDate: (patch["baseDate"] as string | null) ?? null,
    } satisfies CalendarEvent;
  }
  if (resource === "projects") {
    return {
      ...base,
      kind: (patch["kind"] as ProjectTask["kind"]) ?? "할 일",
      category: (patch["category"] as ProjectTask["category"]) ?? "개인",
      status: (patch["status"] as ProjectTask["status"]) ?? "미완료",
      date: (patch["date"] as string | null) ?? null,
      due: (patch["due"] as string | null) ?? null,
      doneAt: null,
      checkedAt: null,
      urgent: Boolean(patch["urgent"]),
      important: Boolean(patch["important"]),
      history: false,
      waitFor: "",
      waitNote: "",
      cancelReason: "",
      cancelAt: null,
      repeatGroupId: "",
    } satisfies ProjectTask;
  }
  if (resource === "routines") {
    return {
      ...base,
      kind: (patch["kind"] as Routine["kind"]) ?? "루틴",
      category: patch["category"] === "공부" ? "공부" : "개인",
      date: (patch["date"] as string | null) ?? null,
      repeatDays: (patch["repeatDays"] as string[]) ?? [],
      targetCount: (patch["targetCount"] as number) ?? 1,
      execCount: (patch["execCount"] as number) ?? 0,
      amount: (patch["amount"] as number | null) ?? null,
      unit: (patch["unit"] as string) ?? "",
      history: false,
      routineIds: (patch["routineIds"] as string[]) ?? [],
    } satisfies Routine;
  }
  if (resource === "binder") {
    return {
      ...base,
      kind: (patch["kind"] as BinderEntry["kind"]) ?? "일기",
      date: (patch["date"] as string | null) ?? todayISO(),
      link: "",
      tags: (patch["tags"] as string[]) ?? [],
      archiveFlag: false,
      body: (patch["body"] as string) ?? "",
      photos: [],
    } satisfies BinderEntry;
  }
  return {
    ...base,
    kind: (patch["kind"] as ArchiveEntry["kind"]) ?? "메모",
    date: (patch["date"] as string | null) ?? todayISO(),
    baseDate: (patch["date"] as string | null) ?? todayISO(),
    rating: null,
    link: (patch["link"] as string) ?? "",
    tags: (patch["tags"] as string[]) ?? [],
    body: (patch["body"] as string) ?? "",
    photos: [],
  } satisfies ArchiveEntry;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { notify } = useUi();
  const [data, setData] = useState<AllData>(emptyData());
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [resourceErrors, setResourceErrors] = useState<Partial<Record<Resource, string>>>({});
  const [savingCount, setSavingCount] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Demo mode keeps page bodies in memory; a connected Notion is read and written for real. */
  const bodyCache = useRef<Record<string, string>>({});

  const reportError = useCallback((message: string) => {
    setSaveError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setSaveError(null), 6000);
  }, []);

  /**
   * A database whose ID is missing is not writable — the server would answer
   * 503, so the client stops before drawing an optimistic row and explains why.
   */
  const blockReason = useCallback(
    (resource: Resource): string | null => {
      if (demo || !status) return null;
      const db = status.dbs?.[resource];
      const configured = db ? db.configured : !(status.unconfigured ?? []).includes(resource);
      if (configured) return null;
      const label = db?.label ?? resource;
      const envKey = db?.envKey ?? "";
      return envKey
        ? `${label} DB가 연결되지 않았습니다. 서버 환경변수 ${envKey} 를 설정하면 저장할 수 있어요.`
        : `${label} DB가 연결되지 않았습니다. 설정 → 연결에서 상태를 확인해 주세요.`;
    },
    [demo, status],
  );

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setFatalError(null);
    setResourceErrors({});
    try {
      const nextStatus = await requestJson<StatusPayload>(`/api/status${fresh ? "?fresh=1" : ""}`);
      setStatus(nextStatus);
      if (!nextStatus.authenticated) {
        setDemo(false);
        setData(emptyData());
        return;
      }
      if (nextStatus.needsToken) {
        setDemo(true);
        setData(buildDemoData());
        return;
      }
      const result = await requestJson<{
        ok: boolean;
        data: AllData;
        needsToken?: boolean;
        errors?: Partial<Record<Resource, string>>;
        error?: { message?: string };
      }>("/api/notion/all");
      if (result.needsToken) {
        setDemo(true);
        setData(buildDemoData());
        return;
      }
      setDemo(false);
      setData({
        calendar: result.data?.calendar ?? [],
        projects: result.data?.projects ?? [],
        routines: result.data?.routines ?? [],
        binder: result.data?.binder ?? [],
        archive: result.data?.archive ?? [],
      });
      setResourceErrors(result.errors ?? {});
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const login = useCallback(async (password: string) => {
    try {
      await requestJson("/api/auth", { method: "POST", body: JSON.stringify({ password }) });
      await load();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "로그인에 실패했습니다." };
    }
  }, [load]);

  const logout = useCallback(async () => {
    try {
      await requestJson("/api/auth", { method: "DELETE" });
    } finally {
      await load();
    }
  }, [load]);

  const create = useCallback<DataContextValue["create"]>(
    async (resource, patch) => {
      const blocked = blockReason(resource);
      if (blocked) {
        notify(blocked, "error");
        return null;
      }

      const optimistic = draftItem(resource, patch);
      setData((current) => ({
        ...current,
        [resource]: [optimistic, ...(current[resource] as AnyItem[])],
      }) as AllData);

      if (demo) {
        setLastSavedAt(Date.now());
        return optimistic;
      }

      setSavingCount((n) => n + 1);
      try {
        const result = await requestJson<{ data: AnyItem }>(`/api/notion/${resource}`, {
          method: "POST",
          body: JSON.stringify(patch),
        });
        setData((current) => ({
          ...current,
          [resource]: (current[resource] as AnyItem[]).map((item) =>
            item.id === optimistic.id ? result.data : item,
          ),
        }) as AllData);
        setLastSavedAt(Date.now());
        return result.data;
      } catch (error) {
        setData((current) => ({
          ...current,
          [resource]: (current[resource] as AnyItem[]).filter((item) => item.id !== optimistic.id),
        }) as AllData);
        reportError(error instanceof Error ? error.message : "저장하지 못했습니다.");
        return null;
      } finally {
        setSavingCount((n) => Math.max(0, n - 1));
      }
    },
    [blockReason, demo, notify, reportError],
  );

  const update = useCallback<DataContextValue["update"]>(
    async (resource, id, patch) => {
      const blocked = blockReason(resource);
      if (blocked) {
        notify(blocked, "error");
        return false;
      }

      const list = data[resource] as AnyItem[];
      const previous = list.find((item) => item.id === id);
      if (!previous) return false;
      const optimistic = { ...previous, ...patch } as AnyItem;
      setData((current) => ({
        ...current,
        [resource]: replaceIn(current[resource] as AnyItem[], optimistic),
      }) as AllData);

      if (demo) {
        setLastSavedAt(Date.now());
        return true;
      }

      setSavingCount((n) => n + 1);
      try {
        const result = await requestJson<{ data: AnyItem }>(`/api/notion/${resource}/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setData((current) => ({
          ...current,
          [resource]: replaceIn(current[resource] as AnyItem[], result.data),
        }) as AllData);
        setLastSavedAt(Date.now());
        return true;
      } catch (error) {
        setData((current) => ({
          ...current,
          [resource]: replaceIn(current[resource] as AnyItem[], previous),
        }) as AllData);
        reportError(error instanceof Error ? error.message : "저장하지 못했습니다.");
        return false;
      } finally {
        setSavingCount((n) => Math.max(0, n - 1));
      }
    },
    [blockReason, data, demo, notify, reportError],
  );

  const remove = useCallback<DataContextValue["remove"]>(
    async (resource, id) => {
      await update(resource, id, { trash: true });
    },
    [update],
  );

  const destroy = useCallback<DataContextValue["destroy"]>(
    async (resource, id) => {
      const blocked = blockReason(resource);
      if (blocked) {
        notify(blocked, "error");
        return;
      }
      if (!demo) {
        setSavingCount((n) => n + 1);
        try {
          await requestJson(`/api/notion/${resource}/${id}?permanent=1`, { method: "DELETE" });
        } catch (error) {
          reportError(error instanceof Error ? error.message : "삭제하지 못했습니다.");
          return;
        } finally {
          setSavingCount((n) => Math.max(0, n - 1));
        }
      }
      setData((current) => ({
        ...current,
        [resource]: (current[resource] as AnyItem[]).filter((item) => item.id !== id),
      }) as AllData);
      setLastSavedAt(Date.now());
    },
    [blockReason, demo, notify, reportError],
  );

  const setRoutineCount = useCallback<DataContextValue["setRoutineCount"]>(
    async (routine, date, count) => {
      const template =
        routine.kind === "루틴"
          ? routine
          : (data.routines.find((item) => item.id === routine.routineIds[0]) ?? routine);
      const target = Math.max(0, Math.min(template.targetCount ?? 1, Math.round(count)));
      const check = data.routines.find(
        (item) => item.kind === "날짜별 체크" && item.date === date && item.routineIds.includes(template.id),
      );

      if (check) {
        await update("routines", check.id, { execCount: target });
        return;
      }
      if (target <= 0) return;
      await create("routines", {
        title: template.title,
        kind: "날짜별 체크",
        category: template.category,
        date,
        targetCount: template.targetCount ?? 1,
        execCount: target,
        amount: template.amount,
        unit: template.unit,
        routineIds: [template.id],
      });
    },
    [create, data.routines, update],
  );

  const findItem = useCallback<DataContextValue["findItem"]>(
    (resource, id) => (data[resource] as AnyItem[]).find((item) => item.id === id),
    [data],
  );

  const fetchBody = useCallback<DataContextValue["fetchBody"]>(
    async (resource, id) => {
      const key = `${resource}:${id}`;
      if (demo) return { text: bodyCache.current[key] ?? "", preserved: [] };
      try {
        const result = await requestJson<{ data: PageBodyPayload }>(`/api/notion/${resource}/${id}/blocks`);
        return { text: result.data?.text ?? "", preserved: result.data?.preserved ?? [] };
      } catch (error) {
        reportError(error instanceof Error ? error.message : "내용을 불러오지 못했습니다.");
        return null;
      }
    },
    [demo, reportError],
  );

  const saveBody = useCallback<DataContextValue["saveBody"]>(
    async (resource, id, text) => {
      const key = `${resource}:${id}`;
      if (demo) {
        bodyCache.current[key] = text;
        setLastSavedAt(Date.now());
        return true;
      }
      setSavingCount((n) => n + 1);
      try {
        await requestJson(`/api/notion/${resource}/${id}/blocks`, {
          method: "PUT",
          body: JSON.stringify({ text }),
        });
        bodyCache.current[key] = text;
        setLastSavedAt(Date.now());
        return true;
      } catch (error) {
        reportError(error instanceof Error ? error.message : "내용을 저장하지 못했습니다.");
        return false;
      } finally {
        setSavingCount((n) => Math.max(0, n - 1));
      }
    },
    [demo, reportError],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      status,
      loading,
      demo,
      fatalError,
      resourceErrors,
      savingCount,
      saveError,
      lastSavedAt,
      refresh: () => load(true),
      login,
      logout,
      create,
      update,
      remove,
      destroy,
      setRoutineCount,
      findItem,
      fetchBody,
      saveBody,
    }),
    [
      data,
      status,
      loading,
      demo,
      fatalError,
      resourceErrors,
      savingCount,
      saveError,
      lastSavedAt,
      load,
      login,
      logout,
      create,
      update,
      remove,
      destroy,
      setRoutineCount,
      findItem,
      fetchBody,
      saveBody,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used inside DataProvider");
  return context;
}
