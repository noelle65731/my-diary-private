"use client";

/**
 * A51: 좌→우 순서를 지키는 메이슨리(벽돌형) 배치.
 *
 * CSS `columns` 는 항목을 위에서 아래로 먼저 채우고 다음 열로 넘어가서, 가장 최근 메모가
 * 왼쪽 열 가운데에 끼고 그 아래로 더 오래된 메모가 붙습니다. 여기서는 항목을 **순서대로**
 * 한 장씩 놓되, 그때마다 지금 가장 짧은 열에 넣습니다. 첫 줄은 가장 최근 항목부터
 * 왼쪽→오른쪽으로 채워지고, 열 높이는 서로 비슷하게 맞습니다(구글 킵과 같은 방식).
 *
 * 높이를 재야 하므로 항목은 `position: absolute` 로 놓고, 폭·위치는 잰 높이로 계산합니다.
 * 사진은 카드에서 고정 높이로 그리므로 사진이 늦게 떠도 배치가 흔들리지 않습니다.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 화면(정확히는 목록의 폭)에 따라 열 수를 정합니다 — 폰 2 · 태블릿 3~4 · PC 4~6. */
export function columnCountForWidth(width: number): number {
  if (width < 560) return 2;
  if (width < 900) return 3;
  if (width < 1200) return 4;
  if (width < 1480) return 5;
  return 6;
}

interface Position {
  x: number;
  y: number;
  col: number;
}

export function layoutColumns(heights: number[], columns: number, columnWidth: number, gap: number): { positions: Position[]; height: number } {
  const columnHeights = new Array<number>(Math.max(1, columns)).fill(0);
  const positions: Position[] = [];
  for (const height of heights) {
    let col = 0;
    for (let index = 1; index < columnHeights.length; index += 1) {
      if (columnHeights[index]! < columnHeights[col]! - 0.5) col = index;
    }
    positions.push({ x: col * (columnWidth + gap), y: columnHeights[col]!, col });
    columnHeights[col] = columnHeights[col]! + height + gap;
  }
  const total = columnHeights.reduce((max, value) => Math.max(max, value), 0);
  return { positions, height: Math.max(0, total - (heights.length > 0 ? gap : 0)) };
}

export function MasonryGrid<T>({
  items,
  itemKey,
  renderItem,
  gap = 12,
  className,
  containerRef,
  containerProps,
}: {
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  gap?: number;
  className?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const ref = containerRef ?? localRef;
  const nodes = useRef(new Map<string, HTMLElement>());
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);

  const columns = columnCountForWidth(width || 360);
  const columnWidth = width > 0 ? Math.max(0, (width - gap * (columns - 1)) / columns) : 0;

  const measure = useCallback(() => {
    const next: Record<string, number> = {};
    nodes.current.forEach((node, key) => {
      next[key] = node.getBoundingClientRect().height;
    });
    setHeights((current) => {
      const keys = Object.keys(next);
      const same = keys.length === Object.keys(current).length && keys.every((key) => Math.abs((current[key] ?? -1) - next[key]!) < 0.6);
      return same ? current : next;
    });
    if (!ready && Object.keys(next).length > 0) setReady(true);
  }, [ready]);

  /* 목록의 폭을 따라 열 수를 정하고, 폭이 바뀌면 다시 잽니다. */
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const apply = () => setWidth(node.clientWidth);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [ref]);

  /* 항목이 바뀌면(필터·검색·추가) 높이를 다시 잽니다. */
  useLayoutEffect(() => {
    measure();
  }, [items, measure, width, columns]);

  /* 글꼴이 늦게 준비되면 높이가 달라집니다 — 한 번 더 잽니다. */
  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    let alive = true;
    void (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(() => {
      if (alive) measure();
    });
    return () => {
      alive = false;
    };
  }, [measure]);

  const ordered = useMemo(() => {
    const list = items.map((item) => ({ item, key: itemKey(item), height: heights[itemKey(item)] ?? 0 }));
    return list;
  }, [items, itemKey, heights]);

  const layout = useMemo(
    () => layoutColumns(ordered.map((entry) => entry.height), columns, columnWidth, gap),
    [ordered, columns, columnWidth, gap],
  );

  return (
    <div
      {...containerProps}
      ref={ref}
      data-masonry="true"
      data-masonry-columns={columns}
      className={cn("relative", className)}
      style={{ ...(containerProps?.style ?? {}), height: layout.height > 0 ? layout.height : undefined }}
    >
      {ordered.map((entry, index) => {
        const position = layout.positions[index];
        const style: CSSProperties = {
          position: "absolute",
          top: 0,
          left: 0,
          width: columnWidth > 0 ? columnWidth : undefined,
          transform: position ? `translate3d(${position.x}px, ${position.y}px, 0)` : undefined,
          opacity: ready && columnWidth > 0 ? 1 : 0,
          transition: "opacity 140ms ease-out",
        };
        return (
          <div
            key={entry.key}
            data-masonry-item={entry.key}
            data-masonry-column={position?.col}
            style={style}
            ref={(node) => {
              if (node) {
                nodes.current.set(entry.key, node);
              } else {
                nodes.current.delete(entry.key);
              }
            }}
          >
            {renderItem(entry.item, index)}
          </div>
        );
      })}
    </div>
  );
}
