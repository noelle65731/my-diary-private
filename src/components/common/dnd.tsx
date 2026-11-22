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
 * One drag layer for the whole app.
 *
 * HTML5 `draggable` never fires on iOS/Android, so every draggable surface uses the
 * press-and-hold gesture below. Mouse starts a drag after a few pixels; touch and pen
 * start one after a short press (so the page can still be scrolled by swiping).
 * Drop targets are plain DOM attributes, which keeps the components free of drag state:
 *
 *   data-drop-zone="cal-day" data-drop-date="2026-11-20"
 *
 * The zone name and every other `data-drop-*` value arrive in `DropTarget.data`
 * (`date`, `id`, `idx`, …), camel-cased. The element under the pointer is also
 * highlighted through `data-drop-hover`, styled in globals.css.
 *
 * A37 — 왜 손가락은 포인터 이벤트가 아니라 터치 이벤트로 끄는가:
 * iOS 사파리(WebKit)는 손가락이 스크롤 가능한 상자 위에서 움직이면 스크롤 제스처로
 * 판단하고 `pointercancel` 을 보내 끌기 전체를 끊습니다. 게다가 끌기가 시작되면서 시트를
 * `pointer-events: none` 으로 감추면(하이라이트·놓을 자리를 찾기 위해 반드시 필요합니다)
 * WebKit 은 그 타깃이 사라진 것으로 보고 역시 포인터 스트림을 취소합니다. 두 번째 것은
 * 시트가 눈에 띄게 비켜 나기도 전에 끌기를 되돌리므로, 아이폰에서는 "꾹 눌러도 시트가
 * 그대로" 있는 것처럼 보였습니다. 액티베이션 뒤에는 `touch-action` 을 바꿔도 이미 시작된
 * 제스처에는 적용되지 않습니다(불가능).
 *
 * 그래서 손가락은 터치 이벤트(touchstart/touchmove/touchend)로 끕니다:
 *   - 터치 이벤트는 touchstart 때 정해진 타깃으로 계속 배달되므로, 그 사이 시트를 감추거나
 *     `pointer-events: none` 으로 바꿔도 끊기지 않습니다.
 *   - 비수동(non-passive) `touchmove` 에서 `preventDefault()` 를 부르면 브라우저가 스크롤을
 *     가져가지 않습니다(끌기가 무르익기 전에는 부르지 않으므로, 시트는 손가락으로 계속
 *     스크롤됩니다).
 * 마우스는 예전처럼 포인터 이벤트로 7px 움직이면 시작합니다. 클릭은 그대로 항목 열기이고
 * (제자리에서 누르고 있기만 하면 아무것도 옮기지 않습니다), 느린 클릭이 끌기로 새지 않게
 * 일부러 "꾹 누르기"를 두지 않았습니다.
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
  /**
   * A33: every ending of the gesture, including a cancel (Escape, pointercancel, a
   * scroll that beat the long press). `onStart` may hide the surface the drag came
   * from, and only this guarantees it comes back.
   */
  onEnd?: () => void;
  /**
   * A18: zones this drag should look through. A timed event dropped on the 종일 줄
   * lands on the day cell under the bars rather than on the bar that covers it.
   */
  skipZones?: string[];
}

type DragFinish = (target: DropTarget | null, point: DragPoint) => void;

interface DndApi {
  start: (event: ReactPointerEvent<HTMLElement>, descriptor: DragDescriptor, finish: DragFinish, options?: DragSourceOptions) => void;
}

const DndContext = createContext<DndApi | null>(null);

const MOUSE_THRESHOLD = 7;
const TOUCH_HOLD_MS = 160;
const TOUCH_SCROLL_TOLERANCE = 10;
/** A37: 꾹 눌러 든 뒤 이만큼은 움직여야 '옮기기' — 그냥 눌렀다 떼면 아무것도 옮기지 않습니다. */
const TOUCH_MOVE_EPSILON = 3;
const EDGE_SCROLL = 64;

interface Gesture {
  pointerId: number;
  pointerType: string;
  /** A37: 손가락은 터치 이벤트로, 마우스는 포인터 이벤트로 끕니다. */
  mode: "pointer" | "touch";
  /** A37: 터치 이벤트가 실제로 오고 있는지 — 펜처럼 포인터 이벤트만 오는 입력은 포인터로 계속 끕니다. */
  sawTouch: boolean;
  /**
   * A38: 이 제스처를 시작할 때 손가락이 이미 화면에 닿아 있었는지. iOS 사파리는 `touchstart` 를
   * `pointerdown` 보다 먼저 보내므로, `start()` 안에서 터치 리스너를 달면 그 touchstart 는
   * 놓칩니다. 그래서 프로바이더가 늘 듣고 있다가 마지막 터치를 알려 주고, start() 가 처음부터
   * 손가락 제스처로 시작합니다(이 값이 없으면 아이폰에서 꾹 잡고만 있어도 pointercancel 에
   * 끌기가 되돌려집니다).
   */
  pressedByTouch: boolean;
  /** A37: 따라가는 손가락 하나의 identifier — 다른 손가락이 끼어들면 취소합니다. */
  touchId: number | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  el: HTMLElement;
  descriptor: DragDescriptor;
  finish: DragFinish;
  options: DragSourceOptions;
  active: boolean;
  /** A37: 끌기가 시작된 뒤 실제로 움직였는지. 제자리에서 눌렀다 뗀 것은 클릭으로 남깁니다. */
  moved: boolean;
  /** A35: 드래그가 시작된 자리 — 손을 떼기 전에 움직였는지 보아 가장자리 자동 스크롤을 가립니다. */
  anchorX: number;
  anchorY: number;
  holdTimer: number | null;
  hoverEl: HTMLElement | null;
  /** A35: 마지막으로 가리킨 놓을 자리가 들어 있는 스크롤 상자 — 가장자리 자동 스크롤에 씁니다. */
  scrollBox: HTMLElement | null;
}

function pickElement(x: number, y: number): Element | null {
  const seam = (window as unknown as { __dndPick?: (x: number, y: number) => Element | null }).__dndPick;
  if (typeof seam === "function") return seam(x, y);
  return document.elementFromPoint(x, y);
}

/** A37: 따라가던 손가락을 찾습니다. `id` 가 없으면(아직 못 봤으면) 첫 손가락을 씁니다. */
function touchOf(list: TouchList, id: number | null): Touch | null {
  for (let index = 0; index < list.length; index += 1) {
    const item = list.item(index);
    if (!item) continue;
    if (id === null || item.identifier === id) return item;
  }
  return null;
}

/**
 * A18: the zone under the pointer, skipping zones this drag looks through.
 * A 종일 막대가 날짜 칸을 덮고 있어도, 시간표에서 끌어온 일정은 그 아래 종일 칸에 놓입니다.
 */
function pickZone(x: number, y: number, skip: string[]): HTMLElement | null {
  const first = pickElement(x, y);
  const direct = first instanceof Element ? first.closest<HTMLElement>("[data-drop-zone]") : null;
  if (direct && !skip.includes(direct.dataset.dropZone ?? "")) return direct;
  if (skip.length === 0) return direct;
  if (typeof document.elementsFromPoint !== "function") return null;
  for (const element of document.elementsFromPoint(x, y)) {
    const zone = element.closest?.<HTMLElement>("[data-drop-zone]");
    if (zone && !skip.includes(zone.dataset.dropZone ?? "")) return zone;
  }
  return null;
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

/**
 * A35: 손끝·커서 아래에서 가장 가까운 스크롤 상자. 주간 게시판처럼 창 안에서 움직이는
 * 상자를 끄는 동안 가장자리에서 저절로 넘겨, 화면 밖에 있는 다른 프로젝트 행까지 갈 수 있게 합니다.
 */
function scrollableBox(node: Element | null): HTMLElement | null {
  while (node && node !== document.body && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node);
      const scrollsY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
      const scrollsX = /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 2;
      if (scrollsY || scrollsX) return node;
    }
    node = node.parentElement;
  }
  return null;
}

function scrollerUnder(x: number, y: number): HTMLElement | null {
  return scrollableBox(document.elementFromPoint(x, y));
}

export function DndProvider({ children }: { children: ReactNode }) {
  const gestureRef = useRef<Gesture | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLSpanElement | null>(null);
  const suppressUntil = useRef(0);
  /**
   * A38: 마지막으로 화면에 닿은 손가락. iOS 사파리는 touchstart → pointerdown 순서로 이벤트를
   * 보내므로, start() 가 실행될 때는 그 touchstart 가 이미 지나가 있습니다. 프로바이더가 상시
   * (캡처) 듣고 있다가 이 기록으로 "지금 손가락이 닿아 있다"를 알려 줍니다.
   */
  const lastTouch = useRef<{ id: number | null; at: number }>({ id: null, at: 0 });
  const [ghost, setGhost] = useState<DragDescriptor | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.changedTouches.item(0) ?? event.touches.item(0);
      lastTouch.current = { id: touch ? touch.identifier : null, at: performance.now() };
    };
    const onTouchEnd = () => {
      lastTouch.current = { id: null, at: performance.now() };
    };
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, []);

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
    /* A35: 화면 오른쪽·아래에서 끌 때 미리보기 카드와 안내가 화면 밖으로 잘리지 않게 안으로 돌립니다. */
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    let x = gesture.x + 14;
    let y = gesture.y + 16;
    if (x + width > window.innerWidth - 8) x = Math.max(8, gesture.x - width - 14);
    if (y + height > window.innerHeight - 8) y = Math.max(8, gesture.y - height - 14);
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
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
    const isTouch = event.pointerType !== "mouse";
    /* A38: 방금 전에 시작된 손가락이 아직 닿아 있으면(아이폰의 touchstart → pointerdown 순서)
       처음부터 손가락 제스처로 시작합니다. 800ms 안에 시작된 터치만 이 제스처의 것으로 봅니다. */
    const pressed = isTouch && lastTouch.current.id !== null && performance.now() - lastTouch.current.at < 800;
    const gesture: Gesture = {
      pointerId: typeof event.pointerId === "number" ? event.pointerId : 1,
      pointerType: event.pointerType || "mouse",
      mode: isTouch ? "touch" : "pointer",
      sawTouch: false,
      pressedByTouch: pressed,
      touchId: pressed ? lastTouch.current.id : null,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      el,
      descriptor,
      finish,
      options,
      active: false,
      moved: false,
      anchorX: event.clientX,
      anchorY: event.clientY,
      holdTimer: null,
      hoverEl: null,
      scrollBox: null,
    };
    gestureRef.current = gesture;

    const setHint = (text: string | null) => {
      const node = hintRef.current;
      if (node) node.textContent = text ?? "";
    };

    const updateHover = () => {
      const current = gestureRef.current;
      if (!current?.active) return;
      const zoneEl = pickZone(current.x, current.y, current.options.skipZones ?? []);
      if (zoneEl !== current.hoverEl) {
        if (current.hoverEl) delete current.hoverEl.dataset.dropHover;
        current.hoverEl = zoneEl;
        if (zoneEl) zoneEl.dataset.dropHover = "true";
      }
      if (zoneEl) {
        current.scrollBox = scrollableBox(zoneEl) ?? current.scrollBox;
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
        /* 처음 잡은 자리에서 아직 움직이지 않았으면 넘기지 않습니다 — 시트가 닫힐 때 손끝이
           화면 아래쪽에 있어 게시판이 저절로 흘러가 버리는 일을 막습니다. */
        if (Math.hypot(current.x - current.anchorX, current.y - current.anchorY) < 10) return;
        /* A35: 화면 가장자리에 닿으면 마지막으로 가리킨 놓을 자리의 스크롤 상자를 넘깁니다. */
        const edge = 72;
        const speed = (distance: number) => Math.max(3, Math.min(18, Math.ceil(distance / 3)));
        let dx = 0;
        let dy = 0;
        if (current.y < edge) dy = -speed(edge - current.y);
        else if (current.y > window.innerHeight - edge) dy = speed(current.y - (window.innerHeight - edge));
        if (current.x < edge) dx = -speed(edge - current.x);
        else if (current.x > window.innerWidth - edge) dx = speed(current.x - (window.innerWidth - edge));
        const box = current.scrollBox ?? scrollerUnder(current.x, current.y);
        if (box && (dx !== 0 || dy !== 0)) {
          const left = box.scrollLeft;
          const top = box.scrollTop;
          box.scrollBy(dx, dy);
          if (box.scrollLeft !== left || box.scrollTop !== top) {
            current.scrollBox = box;
            updateHover();
            return;
          }
        }
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
      current.anchorX = current.x;
      current.anchorY = current.y;
      /* A37: 마우스는 7px 움직여야 시작하므로 그 자체로 '옮기기'입니다. 손가락은 꾹 누르기만
         으로도 시작하므로, 실제로 움직였는지는 터치무브에서 따로 봅니다. */
      if (current.mode === "pointer") current.moved = true;
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
      /* A37: 시트를 감춘 직후의 화면에서 놓일 자리를 바로 짚어 둡니다(안내 문구까지). */
      updateHover();
      setGhost(current.descriptor);
      startAutoScroll();
    };

    const detach = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchCancel, true);
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
      current?.options.onEnd?.();
    };

    /**
     * A37: 끌기를 마칩니다. 꾹 눌러 든 뒤 실제로 움직였을 때만 옮깁니다 — 제자리에서 눌렀다
     * 떼면(또는 느리게 클릭하면) 아무것도 옮기지 않고, 그 클릭은 원래대로 항목을 엽니다.
     */
    const finishGesture = () => {
      const current = gestureRef.current;
      if (!current) return;
      const dropped = current.active && current.moved;
      const target = dropped && current.hoverEl ? readDropTarget(current.hoverEl) : null;
      const point = { x: current.x, y: current.y };
      const finishDrag = current.finish;
      if (dropped) suppressUntil.current = performance.now() + 450;
      cleanup();
      if (dropped) finishDrag(target, point);
    };

    function onPointerMove(nativeEvent: PointerEvent) {
      const current = gestureRef.current;
      if (!current) return;
      /* A38: 손가락으로 시작한 제스처는 처음부터 터치 이벤트가 맡습니다. 아이폰은 touchstart 가
         pointerdown 보다 먼저 오므로 sawTouch 가 아직 false 일 수 있어, start() 가 알아 둔
         pressedByTouch 까지 함께 봅니다(안 그러면 7px 만 움직여도 포인터 경로로 끌기가 시작됩니다). */
      if (current.mode === "touch" && (current.sawTouch || current.pressedByTouch)) return;
      if (nativeEvent.pointerId && nativeEvent.pointerId !== current.pointerId) return;
      current.x = nativeEvent.clientX;
      current.y = nativeEvent.clientY;
      if (!current.active) {
        const distance = Math.hypot(current.x - current.startX, current.y - current.startY);
        if (distance >= MOUSE_THRESHOLD) activate();
      }
      if (gestureRef.current?.active) {
        if (Math.hypot(current.x - current.anchorX, current.y - current.anchorY) >= 1) current.moved = true;
        placeGhost();
        updateHover();
      }
    }

    function onPointerUp() {
      const current = gestureRef.current;
      if (!current) return;
      if (current.mode === "touch" && (current.sawTouch || current.pressedByTouch)) return;
      finishGesture();
    }

    function onPointerCancel() {
      const current = gestureRef.current;
      if (!current) return;
      /*
       * A37/A38: 손가락에는 터치 이벤트로 끝까지 이어 갑니다 — 시트를 `pointer-events: none` 으로
       * 감추거나 스크롤 가능한 상자 위를 끌면 WebKit 이 늘 pointercancel 을 보내는데, 그것으로
       * 끌기를 접으면 시트가 곧바로 되돌아와 "꾹 잡고 있어도 시트가 안 비켜난다"가 됩니다.
       * 터치 스트림은 touchend/touchcancel 로 반드시 끝나므로 안전하게 무시합니다.
       * 펜처럼 포인터 이벤트만 오는 입력은 예전처럼 취소합니다.
       */
      if (current.pointerType === "touch") return;
      if (current.mode === "touch" && current.sawTouch) return;
      cleanup();
    }

    function onTouchStart(nativeEvent: TouchEvent) {
      const current = gestureRef.current;
      if (!current || current.mode !== "touch") return;
      current.sawTouch = true;
      if (nativeEvent.touches.length > 1) {
        cleanup();
        return;
      }
      const touch = nativeEvent.changedTouches.item(0) ?? nativeEvent.touches.item(0);
      if (touch && current.touchId === null) current.touchId = touch.identifier;
    }

    function onTouchMove(nativeEvent: TouchEvent) {
      const current = gestureRef.current;
      if (!current || current.mode !== "touch") return;
      current.sawTouch = true;
      if (nativeEvent.touches.length > 1) {
        // 두 번째 손가락이 끼어들면(핀치·두 손가락 스크롤) 끌기를 접습니다.
        cleanup();
        return;
      }
      let touch: Touch | null =
        touchOf(nativeEvent.touches, current.touchId) ?? touchOf(nativeEvent.changedTouches, current.touchId);
      if (!touch && nativeEvent.touches.length === 1) {
        /* A38: 알아 둔 식별자와 지금 손가락이 어긋나도(아이폰이 첫 touchstart 를 pointerdown 보다
           먼저 보낸 경우 등) 손가락이 하나뿐이면 그 손가락을 그대로 따라갑니다 — 엉뚱한 손가락을
           따라갈 여지가 없고, 이대로 두면 끌기가 손을 따라오지 못해 멈춰 버립니다. */
        touch = nativeEvent.touches.item(0);
      }
      if (!touch) return;
      if (current.touchId !== touch.identifier) current.touchId = touch.identifier;
      current.x = touch.clientX;
      current.y = touch.clientY;
      if (!current.active) {
        // 아직 무르익기 전에 크게 움직였으면 스크롤입니다 — 시트를 그대로 두고 손을 뗍니다.
        if (Math.hypot(current.x - current.startX, current.y - current.startY) > TOUCH_SCROLL_TOLERANCE) cleanup();
        return;
      }
      /* A37: 끌기가 시작된 뒤에는 브라우저가 스크롤을 가져가지 못하게 막습니다. 이 한 줄이
         없으면 iOS 사파리가 스크롤로 판단하고 터치·포인터 스트림을 끊습니다. */
      if (nativeEvent.cancelable) nativeEvent.preventDefault();
      if (Math.hypot(current.x - current.anchorX, current.y - current.anchorY) >= TOUCH_MOVE_EPSILON) current.moved = true;
      placeGhost();
      updateHover();
    }

    function onTouchEnd(nativeEvent: TouchEvent) {
      const current = gestureRef.current;
      if (!current || current.mode !== "touch") return;
      /* A38: 화면에 손가락이 하나도 남지 않았으면 식별자가 어긋났더라도 제스처는 끝입니다 —
         pointerup 은 손가락 제스처에서 일부러 무시하므로, 여기서 놓아 주지 않으면 다음 끌기가
         시작되지 못합니다. */
      if (nativeEvent.touches.length === 0) {
        finishGesture();
        return;
      }
      if (!touchOf(nativeEvent.changedTouches, current.touchId)) return;
      if (touchOf(nativeEvent.touches, current.touchId)) return;
      finishGesture();
    }

    function onTouchCancel() {
      const current = gestureRef.current;
      if (!current || current.mode !== "touch") return;
      // 브라우저가 제스처를 가져갔습니다(스크롤·시스템 동작) — 시트를 원래대로 돌립니다.
      cleanup();
    }

    function onKey(nativeEvent: KeyboardEvent) {
      if (nativeEvent.key === "Escape") cleanup();
    }

    function onContextMenu(nativeEvent: Event) {
      if (gestureRef.current?.active) nativeEvent.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContextMenu);

    if (gesture.mode === "touch") {
      document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
      document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
      document.addEventListener("touchend", onTouchEnd, { capture: true });
      document.addEventListener("touchcancel", onTouchCancel, { capture: true });
      /* 펜처럼 터치 이벤트 없이 포인터 이벤트만 오는 입력의 안전망 — 터치가 한 번이라도 오면 무시됩니다. */
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      gesture.holdTimer = window.setTimeout(() => activate(), TOUCH_HOLD_MS);
    } else {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
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
