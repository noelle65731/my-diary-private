"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useData } from "@/state/store";
import { pushToast } from "@/lib/toast-bus";
import { PASTELS, pastelByKey, type Pastel, type PastelKey } from "@/components/common/pastels";

/**
 * 프로젝트 색은 프로젝트 순서대로 파스텔을 자동으로 돌려 배정하고,
 * 직접 고른 색이 있으면 그 색을 씁니다. 고른 색은 이 브라우저에 남습니다.
 */
const STORAGE_KEY = "my-diary:project-colors:v1";

type ColorMap = Record<string, PastelKey>;

function read(): ColorMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ColorMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[id] = value as PastelKey;
    }
    return out;
  } catch {
    return {};
  }
}

function save(next: ColorMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 저장 공간이 없으면 이번 화면에서만 색이 유지됩니다. */
  }
}

interface ProjectColorContextValue {
  colors: ColorMap;
  /** 이 프로젝트에 지금 적용되는 파스텔 */
  pastelOf: (id: string) => Pastel;
  /** 직접 고른 색 (없으면 null) */
  chosenOf: (id: string) => PastelKey | null;
  setColor: (id: string, key: PastelKey | null) => void;
}

const ProjectColorContext = createContext<ProjectColorContextValue | null>(null);

export function ProjectColorProvider({ children }: { children: ReactNode }) {
  const { data } = useData();
  const [colors, setColors] = useState<ColorMap>({});

  useEffect(() => {
    setColors(read());
  }, []);

  /** 프로젝트가 화면에 놓이는 순서 — 이 순서대로 파스텔을 하나씩 돌려 씁니다. */
  const order = useMemo(() => {
    const list = data.projects.filter((item) => item.kind === "프로젝트" && !item.trash);
    const sorted = [...list].sort(
      (a, b) =>
        (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) ||
        String(a.createdAt).localeCompare(String(b.createdAt)),
    );
    const map = new Map<string, number>();
    sorted.forEach((project, index) => map.set(project.id, index));
    return map;
  }, [data.projects]);

  const pastelOf = useCallback(
    (id: string) => {
      const chosen = pastelByKey(colors[id]);
      if (chosen) return chosen;
      const index = order.get(id) ?? 0;
      return PASTELS[index % PASTELS.length]!;
    },
    [colors, order],
  );

  const chosenOf = useCallback((id: string) => colors[id] ?? null, [colors]);

  const setColor = useCallback((id: string, key: PastelKey | null) => {
    /* A41: 색을 바꾼 것도 데이터 변경 — 짧게 알립니다. */
    pushToast(key ? "프로젝트 색을 바꿨습니다" : "프로젝트 색을 자동으로 되돌렸습니다");
    setColors((current) => {
      const next = { ...current };
      if (!key) delete next[id];
      else next[id] = key;
      save(next);
      return next;
    });
  }, []);

  const value = useMemo<ProjectColorContextValue>(
    () => ({ colors, pastelOf, chosenOf, setColor }),
    [chosenOf, colors, pastelOf, setColor],
  );

  return <ProjectColorContext.Provider value={value}>{children}</ProjectColorContext.Provider>;
}

export function useProjectColors(): ProjectColorContextValue {
  const value = useContext(ProjectColorContext);
  if (value) return value;
  return {
    colors: {},
    pastelOf: () => PASTELS[0]!,
    chosenOf: () => null,
    setColor: () => {},
  };
}
