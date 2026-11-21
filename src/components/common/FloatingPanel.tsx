"use client";

import { useRef, useState, type ReactNode } from "react";
import { Portal } from "@/components/common/primitives";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, XIcon } from "@/components/icons";

/**
 * A30: 비차단 플로팅 창.
 *
 * 모달과 달리 화면을 어둡게 덮지 않고, 뒤쪽 화면의 스크롤·클릭·탭 전환을 막지 않습니다.
 * 바깥 클릭이나 뒤로 가기로는 닫히지 않고, 사용자가 X(닫기)나 저장으로만 직접 닫습니다.
 * 상단 바를 끌어 자리를 옮기거나, 접기 버튼으로 제목 줄만 남길 수 있습니다.
 */
export interface FloatingPanelProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 테스트·확인용 이름 (예: 할 일 · 프로젝트) */
  label?: string;
}

export function FloatingPanel({ open, onClose, title, subtitle, children, footer, label }: FloatingPanelProps) {
  if (!open) return null;
  return (
    <FloatingPanelInner onClose={onClose} title={title} subtitle={subtitle} footer={footer} label={label}>
      {children}
    </FloatingPanelInner>
  );
}

function FloatingPanelInner({
  onClose,
  title,
  subtitle,
  children,
  footer,
  label,
}: Omit<FloatingPanelProps, "open">) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    box: { left: number; top: number; width: number; height: number };
  } | null>(null);

  const onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
      // 이동 한계는 끌기 시작할 때의 자리(변형 전)를 기준으로 잡습니다.
      box: { left: box.left - offset.x, top: box.top - offset.y, width: box.width, height: box.height },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const margin = 8;
    const minX = margin - drag.box.left;
    const maxX = Math.max(minX, window.innerWidth - margin - drag.box.left - drag.box.width);
    const minY = margin - drag.box.top;
    const maxY = Math.max(minY, window.innerHeight - margin - drag.box.top - drag.box.height);
    const nextX = Math.min(maxX, Math.max(minX, drag.originX + (event.clientX - drag.startX)));
    const nextY = Math.min(maxY, Math.max(minY, drag.originY + (event.clientY - drag.startY)));
    setOffset({ x: nextX, y: nextY });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <Portal>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={typeof title === "string" ? title : "새로 만들기"}
        data-new-item-panel={label ?? ""}
        data-panel-collapsed={collapsed ? "true" : "false"}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        className={cn(
          // 하단 탭바(z-40)와 겹치지 않게 그 위에 뜨고, 다른 모달(z-50)보다는 아래에 둡니다.
          "fixed left-3 right-3 bottom-[calc(4.15rem+env(safe-area-inset-bottom))] z-[45] flex max-h-[64vh] flex-col overflow-hidden",
          "animate-fade-in rounded-2xl border border-paper-300 bg-white text-ink-900",
          "shadow-[0_24px_60px_-24px_rgba(17,24,39,0.5)] ring-1 ring-black/[0.04]",
          "sm:left-auto sm:right-6 sm:bottom-[calc(4.35rem+env(safe-area-inset-bottom))] sm:max-h-[82vh] sm:w-[400px] lg:w-[420px]",
          dragging && "select-none",
        )}
      >
        <div
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-panel-drag="true"
          className={cn(
            "flex flex-none touch-none items-start gap-2 border-b border-paper-300/80 px-4 pb-2.5 pt-3",
            "sm:cursor-grab",
            dragging && "sm:cursor-grabbing",
          )}
        >
          <div className="min-w-0 flex-1">
            {title ? <h2 className="truncate text-[calc(16.5px*var(--fs))] font-semibold text-ink-900">{title}</h2> : null}
            {subtitle ? (
              <p className="mt-0.5 truncate text-[calc(14px*var(--fs))] text-ink-500">{subtitle}</p>
            ) : (
              <p className="mt-0.5 truncate text-[calc(14px*var(--fs))] text-ink-400">뒤 화면을 보면서 적을 수 있어요</p>
            )}
          </div>
          <div className="flex flex-none items-center gap-0.5" data-no-drag="true">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="icon-btn"
              aria-label={collapsed ? "펼치기" : "접기"}
              aria-expanded={!collapsed}
              data-panel-collapse="true"
              title={collapsed ? "펼치기" : "접기"}
            >
              <ChevronDownIcon
                size={17}
                className={cn("transition-transform", collapsed && "rotate-180")}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="icon-btn"
              aria-label="닫기"
              data-panel-close="true"
              title="닫기"
            >
              <XIcon size={17} />
            </button>
          </div>
        </div>

        {collapsed ? null : (
          <>
            <div data-panel-scroll="true" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {children}
            </div>
            {footer ? <div className="flex-none border-t border-paper-300/80 bg-paper-50/60 px-4 py-2.5 pb-safe">{footer}</div> : null}
          </>
        )}
      </div>
    </Portal>
  );
}
