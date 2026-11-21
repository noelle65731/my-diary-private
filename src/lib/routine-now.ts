/**
 * A18: 루틴의 `NOW 숨김`을 이 브라우저에도 기억해 둡니다.
 *
 * 노션 Routine DB에 `NOW 숨김` 속성이 있으면 그 값이 그대로 쓰이고, 속성이 없는
 * 데이터베이스에서도 토글이 새로고침 뒤에 사라지지 않도록 localStorage에 함께 적습니다.
 * (프로젝트의 NOW 숨김과 같은 방식으로 읽고 씁니다.)
 */
const STORAGE_KEY = "my-diary:routine-now:v1";

type NowMap = Record<string, boolean>;

function read(): NowMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: NowMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "boolean") out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function write(next: NowMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 저장 공간이 없으면 이번 화면에서만 유지됩니다. */
  }
}

/** 이 브라우저에서 직접 켜고 끈 루틴의 NOW 숨김 값. */
export function routineNowOverrides(): NowMap {
  return read();
}

/** 한 루틴의 NOW 숨김을 이 브라우저에 적어 둡니다(노션 저장과 별개). */
export function writeRoutineNow(id: string, hidden: boolean) {
  const current = read();
  if (current[id] === hidden) return;
  write({ ...current, [id]: hidden });
}

/** 노션에서 읽은 목록 위에 이 브라우저의 값을 덮어씁니다. */
export function applyRoutineNow<T extends { id: string; hidden: boolean }>(items: T[]): T[] {
  const overrides = read();
  if (Object.keys(overrides).length === 0) return items;
  return items.map((item) => (item.id in overrides ? { ...item, hidden: overrides[item.id]! } : item));
}
