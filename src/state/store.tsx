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
import { differingKeys } from "@/lib/diff";
import { applyRoutineNow } from "@/lib/routine-now";

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
  /** B3: a newer server version was found while saving. */
  conflict: ConflictState | null;
  resolveConflict: (keepMine: boolean) => Promise<boolean>;
  /** B3: queued offline edits waiting for the network. */
  offlinePending: number;
  refresh: () => Promise<void>;
  refreshQuiet: () => Promise<void>;
  login: (password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  create: (resource: Resource, patch: Patch) => Promise<AnyItem | null>;
  update: (resource: Resource, id: string, patch: Patch) => Promise<boolean>;
  remove: (resource: Resource, id: string) => Promise<void>;
  destroy: (resource: Resource, id: string) => Promise<void>;
  setRoutineCount: (routine: Routine, date: string, count: number) => Promise<void>;
  findItem: (resource: Resource, id: string) => AnyItem | undefined;
  /** B2: property schema (names, types, select options) of one database. */
  fetchSchema: (resource: Resource) => Promise<Record<string, { type: string; options?: string[] }>>;
  /** A5: the Notion page body of one record ('내용'). */
  fetchBody: (resource: Resource, id: string) => Promise<PageBodyPayload | null>;
  saveBody: (resource: Resource, id: string, text: string) => Promise<boolean>;
}

export interface ConflictState {
  resource: Resource;
  id: string;
  patch: Patch;
  local: AnyItem;
  current: AnyItem;
  serverUpdatedAt: string;
}

interface QueuedWrite {
  kind: "create" | "update";
  resource: Resource;
  id?: string;
  tempId?: string;
  patch: Patch;
  at: number;
}

const QUEUE_KEY = "my-diary:offline-queue:v1";

class RequestError extends Error {
  code: string;
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, code: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = "RequestError";
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

export interface PageBodyPayload {
  text: string;
  preserved: string[];
}

const DataContext = createContext<DataContextValue | null>(null);

/* ───────────────── A41: 모든 변경에 한 줄 토스트 ─────────────────
 * 화면마다 토스트를 붙이면 빠지는 곳이 생깁니다. 저장이 한 곳(create·update·destroy)을
 * 지나므로, 여기서 바뀐 값만 보고 짧게 알립니다. 값이 그대로인 항목은 말하지 않습니다
 * (편집 창은 늘 전체 값을 보내므로, 비교 없이는 늘 '날짜를 변경했습니다'가 됩니다).
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => value === b[index]);
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  return a === b;
}

function changedKey(previous: AnyItem, patch: Patch, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(patch, key)) return false;
  return !sameValue((previous as unknown as Record<string, unknown>)[key], patch[key]);
}

function describeUpdate(previous: AnyItem, patch: Patch): string {
  const changed = (key: string) => changedKey(previous, patch, key);
  if (changed("trash")) return patch["trash"] ? "휴지통으로 옮겼습니다" : "휴지통에서 되살렸습니다";
  if (changed("canceled")) return patch["canceled"] ? "취소로 바꿨습니다" : "취소를 풀었습니다";
  if (changed("done")) return patch["done"] ? "완료로 바꿨습니다" : "완료를 해제했습니다";
  if (changed("status")) {
    const status = String(patch["status"] ?? "");
    if (status === "완료") return "완료로 바꿨습니다";
    if (status === "취소") return "취소로 바꿨습니다";
    if (status === "대기 중") return "대기 중으로 바꿨습니다";
    return "미완료로 되돌렸습니다";
  }
  if (changed("history")) return patch["history"] ? "히스토리로 보냈습니다" : "히스토리에서 되살렸습니다";
  if (changed("hidden")) return patch["hidden"] ? "NOW 숨김을 켰습니다" : "NOW 숨김을 껐습니다";
  if (changed("favorite")) return patch["favorite"] ? "이번 주 꼭에 담았습니다" : "이번 주 꼭에서 뺐습니다";
  if (changed("color")) return "색을 바꿨습니다";
  if (changed("category")) return "분류를 바꿨습니다";
  if (changed("projectIds")) return "프로젝트를 옮겼습니다";
  if (changed("urgent") || changed("important")) return "긴급·중요를 바꿨습니다";
  if (changed("startTime") || changed("endTime")) return "시간을 변경했습니다";
  if (changed("endDate")) return "기간을 변경했습니다";
  if (changed("date") || changed("due")) return "날짜를 변경했습니다";
  if (changed("execCount")) return Number(patch["execCount"] ?? 0) > 0 ? "루틴을 체크했습니다" : "루틴 체크를 풀었습니다";
  if (changed("doneAt") || changed("checkedAt") || changed("cancelAt")) return "상태를 바꿨습니다";
  if (changed("title")) return "이름을 바꿨습니다";
  if (changed("memo") || changed("body")) return "메모를 저장했습니다";
  if (changed("sort")) return "순서를 바꿨습니다";
  if (changed("icon")) return "아이콘을 바꿨습니다";
  if (changed("repeatDays") || changed("targetCount") || changed("amount") || changed("unit")) return "루틴을 저장했습니다";
  if (changed("weekKey") || changed("baseDate")) return "주를 옮겼습니다";
  if (changed("waitFor") || changed("waitNote")) return "대기 내용을 저장했습니다";
  if (changed("cancelReason")) return "취소 사유를 저장했습니다";
  if (changed("tags") || changed("rating") || changed("link") || changed("archiveFlag")) return "기록을 저장했습니다";
  return "저장했습니다";
}

function describeCreate(resource: Resource, patch: Patch): string {
  const kind = String(patch["kind"] ?? "");
  if (resource === "projects") return kind === "프로젝트" ? "프로젝트를 추가했습니다" : "할 일을 추가했습니다";
  if (resource === "calendar") {
    if (kind === "주간 목표") return "이번 주 목표를 추가했습니다";
    if (kind === "주간 메모") return "주간 메모를 저장했습니다";
    if (kind === "월간 메모") return "월간 메모를 저장했습니다";
    return "일정을 추가했습니다";
  }
  if (resource === "routines") return kind === "날짜별 체크" ? "루틴을 체크했습니다" : "루틴을 추가했습니다";
  if (resource === "binder") return kind === "노트" ? "노트를 저장했습니다" : "일기를 저장했습니다";
  return "아카이브에 담았습니다";
}

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
  const payload = (body ?? {}) as { ok?: boolean; error?: { message?: string; code?: string }; [key: string]: unknown };
  if (!response.ok || payload.ok === false) {
    throw new RequestError(
      payload.error?.message ?? "요청을 처리하지 못했습니다.",
      payload.error?.code ?? "server_error",
      response.status,
      payload as Record<string, unknown>,
    );
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

/**
 * A record must never fall out of both the list and the trash because a flag came
 * back as `undefined`: the three flags are read as plain booleans everywhere.
 */
function normalize<T extends AnyItem>(item: T): T {
  return { ...item, trash: item.trash === true, hidden: item.hidden === true, favorite: item.favorite === true };
}

function normalizeList<T extends AnyItem>(items: T[]): T[] {
  return items.map(normalize);
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
      startTime: (patch["startTime"] as string | null) ?? null,
      endTime: (patch["endTime"] as string | null) ?? null,
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
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [offlinePending, setOfflinePending] = useState(0);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);
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

  const load = useCallback(async (fresh = false, quiet = false) => {
    if (!quiet) setLoading(true);
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
        calendar: normalizeList(result.data?.calendar ?? []),
        projects: normalizeList(result.data?.projects ?? []),
        routines: applyRoutineNow(normalizeList(result.data?.routines ?? [])),
        binder: normalizeList(result.data?.binder ?? []),
        archive: normalizeList(result.data?.archive ?? []),
      });
      setResourceErrors(result.errors ?? {});
    } catch (error) {
      if (!quiet) setFatalError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const refreshQuiet = useCallback(async () => {
    await load(false, true);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── B1/B3: keep the screen in step with Notion without a reload ── */
  useEffect(() => {
    if (demo || !status?.authenticated) return;
    let alive = true;
    const tick = () => {
      if (!alive || typeof document === "undefined" || document.visibilityState !== "visible") return;
      void refreshQuiet();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(tick, 120_000);
    return () => {
      alive = false;
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [demo, refreshQuiet, status?.authenticated]);

  /* ── B3: offline edits wait in localStorage and are sent once on reconnect ── */
  const readQueue = (): QueuedWrite[] => {
    try {
      const raw = window.localStorage.getItem(QUEUE_KEY);
      const parsed = raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeQueue = (entries: QueuedWrite[]) => {
    try {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
    } catch {
      /* ignore quota */
    }
    setOfflinePending(entries.length);
  };

  const enqueue = (entry: QueuedWrite) => {
    const entries = readQueue();
    // Repeating the same edit of the same item replaces the queued one — one save on reconnect.
    const next = entries.filter((item) => !(item.kind === entry.kind && item.resource === entry.resource && item.id === entry.id));
    next.push(entry);
    writeQueue(next);
  };

  const flushQueue = useCallback(async () => {
    if (flushing.current || demo) return;
    const entries = readQueue();
    if (entries.length === 0) return;
    flushing.current = true;
    const rest: QueuedWrite[] = [];
    for (const entry of entries) {
      try {
        if (entry.kind === "create") {
          const result = await requestJson<{ data: AnyItem }>(`/api/notion/${entry.resource}`, {
            method: "POST",
            body: JSON.stringify(entry.patch),
          });
          setData((current) => ({
            ...current,
            [entry.resource]: (current[entry.resource] as AnyItem[]).map((item) =>
              item.id === entry.tempId ? normalize(result.data) : item,
            ),
          }) as AllData);
        } else if (entry.id) {
          await requestJson(`/api/notion/${entry.resource}/${entry.id}`, {
            method: "PATCH",
            body: JSON.stringify(entry.patch),
          });
        }
      } catch {
        rest.push(entry);
      }
    }
    writeQueue(rest);
    flushing.current = false;
    if (rest.length === 0) {
      setLastSavedAt(Date.now());
      await load(false, true);
    } else {
      reportError(`${rest.length}개 항목이 아직 네트워크에 저장되지 않았습니다.`);
    }
  }, [demo, load, reportError]);

  useEffect(() => {
    setOfflinePending(readQueue().length);
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    if (navigator.onLine) void flushQueue();
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

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
      notify(describeCreate(resource, patch));

      if (demo) {
        setLastSavedAt(Date.now());
        return optimistic;
      }

      if (!navigator.onLine) {
        enqueue({ kind: "create", resource, tempId: optimistic.id, patch, at: Date.now() });
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
            item.id === optimistic.id ? normalize(result.data) : item,
          ),
        }) as AllData);
        setLastSavedAt(Date.now());
        return result.data;
      } catch (error) {
        const offline = error instanceof TypeError || (!navigator.onLine);
        if (offline) {
          enqueue({ kind: "create", resource, tempId: optimistic.id, patch, at: Date.now() });
          setLastSavedAt(Date.now());
          return optimistic;
        }
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
      notify(describeUpdate(previous, patch));

      if (demo) {
        setLastSavedAt(Date.now());
        return true;
      }

      if (!navigator.onLine) {
        enqueue({ kind: "update", resource, id, patch, at: Date.now() });
        setLastSavedAt(Date.now());
        return true;
      }

      setSavingCount((n) => n + 1);
      try {
        const result = await requestJson<{ data: AnyItem }>(`/api/notion/${resource}/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...patch, expectedUpdatedAt: previous.updatedAt }),
        });
        setData((current) => ({
          ...current,
          [resource]: replaceIn(current[resource] as AnyItem[], normalize(result.data)),
        }) as AllData);
        setLastSavedAt(Date.now());
        return true;
      } catch (error) {
        if (error instanceof RequestError && error.code === "conflict") {
          // Two versions exist: keep both visible and let the user choose.
          const current = error.payload["current"] as AnyItem | undefined;
          if (current) {
            const mine = { ...previous, ...patch } as AnyItem;
            // The other side already holds exactly what we asked for (a retry after the
            // conflict was settled): adopt it, so no empty '동시 수정' sheet appears.
            if (differingKeys(mine, current).length === 0) {
              setData((state) => ({
                ...state,
                [resource]: replaceIn(state[resource] as AnyItem[], normalize(current)),
              }) as AllData);
              setLastSavedAt(Date.now());
              return true;
            }
            setConflict({
              resource,
              id,
              patch,
              local: optimistic,
              current,
              serverUpdatedAt: String(error.payload["serverUpdatedAt"] ?? ""),
            });
            return false;
          }
        }
        const offline = error instanceof TypeError || !navigator.onLine;
        if (offline) {
          enqueue({ kind: "update", resource, id, patch, at: Date.now() });
          setLastSavedAt(Date.now());
          return true;
        }
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

  /** B3: keeps the chosen value; the other one is dropped from the screen. */
  const resolveConflict = useCallback<DataContextValue["resolveConflict"]>(
    async (keepMine) => {
      const open = conflict;
      if (!open) return true;
      setConflict(null);
      if (!keepMine) {
        setData((current) => ({
          ...current,
          [open.resource]: replaceIn(current[open.resource] as AnyItem[], open.current),
        }) as AllData);
        return true;
      }
      setSavingCount((n) => n + 1);
      try {
        const result = await requestJson<{ data: AnyItem }>(`/api/notion/${open.resource}/${open.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...open.patch, expectedUpdatedAt: open.serverUpdatedAt }),
        });
        setData((current) => ({
          ...current,
          [open.resource]: replaceIn(current[open.resource] as AnyItem[], normalize(result.data)),
        }) as AllData);
        setLastSavedAt(Date.now());
        return true;
      } catch (error) {
        reportError(error instanceof Error ? error.message : "저장하지 못했습니다.");
        return false;
      } finally {
        setSavingCount((n) => Math.max(0, n - 1));
      }
    },
    [conflict, reportError],
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
      notify("영구 삭제했습니다");
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

  const schemaCache = useRef<Partial<Record<Resource, Record<string, { type: string; options?: string[] }>>>>({});
  const fetchSchema = useCallback<DataContextValue["fetchSchema"]>(
    async (resource) => {
      if (demo) return {};
      const cached = schemaCache.current[resource];
      if (cached) return cached;
      try {
        const result = await requestJson<{ data: { name: string; type: string; options?: string[] }[] }>(
          `/api/notion/${resource}/schema`,
        );
        const map: Record<string, { type: string; options?: string[] }> = {};
        for (const item of result.data ?? []) map[item.name] = { type: item.type, options: item.options };
        schemaCache.current[resource] = map;
        return map;
      } catch {
        return {};
      }
    },
    [demo],
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
        notify("내용을 저장했습니다");
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
        notify("내용을 저장했습니다");
        setLastSavedAt(Date.now());
        return true;
      } catch (error) {
        reportError(error instanceof Error ? error.message : "내용을 저장하지 못했습니다.");
        return false;
      } finally {
        setSavingCount((n) => Math.max(0, n - 1));
      }
    },
    [demo, notify, reportError],
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
      conflict,
      resolveConflict,
      offlinePending,
      refresh: () => load(true),
      refreshQuiet,
      login,
      logout,
      create,
      update,
      remove,
      destroy,
      setRoutineCount,
      findItem,
      fetchSchema,
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
      conflict,
      resolveConflict,
      offlinePending,
      load,
      refreshQuiet,
      login,
      logout,
      create,
      update,
      remove,
      destroy,
      setRoutineCount,
      findItem,
      fetchSchema,
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
