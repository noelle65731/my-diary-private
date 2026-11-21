"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** 스크롤이 멈춘 뒤 스크롤바가 사라지기까지의 시간(ms). */
const IDLE_MS = 900;

/**
 * A20: 주간 보기 스크롤바는 움직이는 동안에만 보이고, 손을 멈추면 잠시 뒤 사라집니다.
 * 폭은 그대로 두고 thumb만 투명하게 바꾸므로 사라질 때 글자가 밀리지 않습니다.
 *
 *   const bar = useAutoHideScrollbar();
 *   <div ref={ref} onScroll={bar.onScroll} className={cn("overflow-y-auto", bar.className)} />
 */
export function useAutoHideScrollbar() {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = useCallback(() => {
    setScrolling(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setScrolling(false), IDLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    scrolling,
    onScroll,
    className: cn("scrollbar-quiet", scrolling && "is-scrolling"),
  };
}
