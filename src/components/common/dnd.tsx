"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { isTypingTarget } from "@/lib/utils";

/**
 * One pointer-event drag layer for the whole app.
 *
 * HTML5 `draggable` never fires on iOS/Android, so every draggable surface uses
 * Pointer Events instead: mouse starts a drag after a few pixels, touch and pen
 * start one after a short press (so the page can still be scrolled by swiping)
 * and the drag itself blocks page scrolling through a non-passive touchmove
 * listener. Drop targets are plain DOM attributes, which keeps the components
 * free of drag state:
 *
 *   data-drop-zone="cal-day" data-drop-date="2026-11-20"
 *
 * The zone name and every other `data-drop-*` value arrive in `DropTarget.data`
 * (`date`, `id`, `idx`, …), camel-cased. The element under the pointer is also
 * highlighted through `data-drop-hover`, styled in globals.css.
 */

export interface DragDescriptor {
  /** What is being dragged, e.g. `event`, `task`, `project`, `binder`, `archive`. */
  kind: string;
  id: string;
  /** Short text shown on the floating badge. */
  label: string;
}

export interface DropTarget {
  zone: string;
  data: Record<string, string>;
  element: HTMLElement;
  rect: DOMRect;
}

export interface DragPoint {
  x: number;
  y: number;
}

export interface DragSourceOptions {
  enabled?: boolean;
  /** Badge text for the drop target under the pointer, recalculated while moving. */
  getHint?: (target: DropTarget, point: DragPoint) => string | null;
  onStart?: () => void;
}

type DragFinish = (target: DropTarget | null, point: DragPoint) => void;

interface DndApi {
  start: (event: ReactPointerEvent<HTMLElement>, descriptor: DragDescriptor, finish: DragFinish, options?: DragSourceOptions) => void;
}

const DndContext = createContext<DndApi | null>(null);

const MOUSE_THRESHOLD = 7;
const TOUCH_HOLD_MS = 160;
const TOUCH_SCROLL_TOLERANCE = 10;
const EDGE_SCROLL = 64;

interface Gesture {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  el: HTMLElement;
  descriptor: DragDescriptor;
  finish: DragFinish;
  options: DragSourceOptions;
  active: boolean;
  holdTimer: number | null;
  hoverEl: HTMLElement | null;
}

function pickElement(x: number, y: number): Element | null {
  const seam = (window as unknown as { __dndPick?: (x: number, y: number) => Element | null }).__dndPick;
  if (typeof seam === "function") return seam(x, y);
  return document.elementFromPoint(x, y);
}

/** Reads the `data-drop-*` attributes of a zone element. */
export function readDropTarget(element: HTMLElement): DropTarget {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(element.dataset)) {
    if (key === "dropZone" || key === "dropHover" || key === "dropHint" || value === undefined) continue;
    if (!key.startsWith("drop")) continue;
    const name = key.slice(4);
    data[`${name.slice(0, 1).toLowerCase()}${name.slice(1)}`] = value;
  }
  if (element.dataset.dropHint) data.hint = element.dataset.dropHint;
  return { zone: element.dataset.dropZone ?? "", data, element, rect: element.getBoundingClientRect() };
}

/** True when a vertical list drop happened on the lower half of its target. */
export function isAfterTarget(target: DropTarget, y: number): boolean {
  return y > target.rect.top + target.rect.height / 2;
}

export function DndProvider({ children }: { children: ReactNode }) {
  const gestureRef = useRef<Gesture | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLSpanElement | null>(null);
  const suppressUntil = useRef(0);
  const [ghost, setGhost] = useState<DragDescriptor | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // A click landing right after a drag must not open the item's editor.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (performance.now() < suppressUntil.current) {
        event.stopPropagation();
        event.preventDefault();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const placeGhost = useCallback(() => {
    const gesture = gestureRef.current;
    const node = ghostRef.current;
    if (!gesture || !node) return;
    node.style.transform = `translate3d(${gesture.x + 14}px, ${gesture.y + 16}px, 0)`;
  }, []);

  useEffect(() => {
    if (ghost) placeGhost();
  }, [ghost, placeGhost]);

  const start = useCallback<DndApi["start"]>((event, descriptor, finish, options = {}) => {
    if (options.enabled === false) return;
    if (gestureRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isTypingTarget(event.target)) return;

    const el = event.currentTarget;
    const gesture: Gesture = {
      pointerId: typeof event.pointerId === "number" ? event.pointerId : 1,
      pointerType: event.pointerType || "mouse",
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      el,
      descriptor,
      finish,
      options,
      active: false,
      holdTimer: null,
      hoverEl: null,
    };
    gestureRef.current = gesture;

    const setHint = (text: string | null) => {
      const node = hintRef.current;
      if (node) node.textContent = text ?? "";
    };

    const updateHover = () => {
      const current = gestureRef.current;
      if (!current?.active) return;
      const found = pickElement(current.x, current.y);
      const zoneEl = found instanceof Element ? found.closest<HTMLElement>("[data-drop-zone]") : null;
      if (zoneEl !== current.hoverEl) {
        if (current.hoverEl) delete current.hoverEl.dataset.dropHover;
        current.hoverEl = zoneEl;
        if (zoneEl) zoneEl.dataset.dropHover = "true";
      }
      if (zoneEl) {
        const target = readDropTarget(zoneEl);
        const hint = current.options.getHint?.(target, { x: current.x, y: current.y });
        setHint(hint ?? (zoneEl.dataset.dropHint ?? null));
      } else {
        setHint(null);
      }
    };

    let scrollTimer: number | null = null;

    const stopAutoScroll = () => {
      if (scrollTimer !== null) {
        window.clearInterval(scrollTimer);
        scrollTimer = null;
      }
    };

    const startAutoScroll = () => {
      if (scrollTimer !== null) return;
      scrollTimer = window.setInterval(() => {
        const current = gestureRef.current;
        if (!current?.active) return;
        const height = window.innerHeight;
        let delta = 0;
        if (current.y < EDGE_SCROLL) delta = -Math.ceil((EDGE_SCROLL - current.y) / 5);
        else if (current.y > height - EDGE_SCROLL) delta = Math.ceil((current.y - (height - EDGE_SCROLL)) / 5);
        if (delta === 0) return;
        const before = window.scrollY;
        window.scrollBy(0, delta);
        if (window.scrollY !== before) updateHover();
      }, 40);
    };

    const activate = () => {
      const current = gestureRef.current;
      if (!current || current.active) return;
      current.active = true;
      if (current.holdTimer !== null) {
        window.clearTimeout(current.holdTimer);
        current.holdTimer = null;
      }
      current.el.dataset.dragging = "true";
      current.el.style.touchAction = "none";
      document.body.classList.add("dnd-locked");
      document.body.dataset.dndActive = "true";
      document.body.dataset.dndKind = current.descriptor.kind;
      window.getSelection()?.removeAllRanges();
      current.options.onStart?.();
      setGhost(current.descriptor);
      startAutoScroll();
    };

    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("contextmenu", onContextMenu);
    };

    const cleanup = () => {
      const current = gestureRef.current;
      stopAutoScroll();
      detach();
      if (current) {
        if (current.holdTimer !== null) window.clearTimeout(current.holdTimer);
        delete current.el.dataset.dragging;
        current.el.style.touchAction = "";
        if (current.hoverEl) delete current.hoverEl.dataset.dropHover;
      }
      gestureRef.current = null;
      document.body.classList.remove("dnd-locked");
      delete document.body.dataset.dndActive;
      delete document.body.dataset.dndKind;
      setGhost(null);
    };

    function onMove(nativeEvent: PointerEvent) {
      const current = gestureRef.current;
      if (!current) return;
      if (nativeEvent.pointerId && nativeEvent.pointerId !== current.pointerId) return;
      current.x = nativeEvent.clientX;
      current.y = nativeEvent.clientY;
      if (!current.active) {
        const distance = Math.hypot(current.x - current.startX, current.y - current.startY);
        if (current.pointerType === "mouse") {
          if (distance >= MOUSE_THRESHOLD) activate();
        } else if (distance > TOUCH_SCROLL_TOLERANCE) {
          // Moved before the press matured: the person is scrolling, not dragging.
          cleanup();
          return;
        }
      }
      if (gestureRef.current?.active) {
        placeGhost();
        updateHover();
      }
    }

    function onUp() {
      const current = gestureRef.current;
      if (!current) return;
      const wasActive = current.active;
      const target = wasActive && current.hoverEl ? readDropTarget(current.hoverEl) : null;
      const point = { x: current.x, y: current.y };
      const finishDrag = current.finish;
      if (wasActive) suppressUntil.current = performance.now() + 450;
      cleanup();
      if (wasActive) finishDrag(target, point);
    }

    function onCancel() {
      cleanup();
    }

    function onKey(nativeEvent: KeyboardEvent) {
      if (nativeEvent.key === "Escape") cleanup();
    }

    function onTouchMove(nativeEvent: TouchEvent) {
      if (gestureRef.current?.active) nativeEvent.preventDefault();
    }

    function onContextMenu(nativeEvent: Event) {
      if (gestureRef.current?.active) nativeEvent.preventDefault();
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    if (gesture.pointerType !== "mouse") {
      gesture.holdTimer = window.setTimeout(() => activate(), TOUCH_HOLD_MS);
    }
  }, [placeGhost]);

  const api = useMemo<DndApi>(() => ({ start }), [start]);

  return (
    <DndContext.Provider value={api}>
      {children}
      {mounted && ghost
        ? createPortal(
            <div ref={ghostRef} className="dnd-ghost" aria-hidden="true">
              <span className="dnd-ghost-card">{ghost.label}</span>
              <span ref={hintRef} className="dnd-ghost-hint" />
            </div>,
            document.body,
          )
        : null}
    </DndContext.Provider>
  );
}

export function useDnd(): DndApi {
  const context = useContext(DndContext);
  if (!context) throw new Error("useDnd must be used inside DndProvider");
  return context;
}
