"use client";

/**
 * A51: 아카이브 카드 한 장 (구글 킵 스타일).
 *
 * ① 대표 사진 한 장(풀폭, 세로로 긴 사진은 잘라서) ② 제목·본문 ③ 체크리스트 바로 체크
 * ④ 링크 바 ⑤ 분류 알약 + 수정 일시. 고정핀은 카드 오른쪽 위 모서리 끝에 늘 보이게 두어
 * 사진이 위에 있어도 누를 수 있습니다. 별점은 목록에서 기본으로 숨기고 설정/보기 옵션으로
 * 켤 때만 보입니다.
 */

import { useEffect, useRef, useState } from "react";
import type { ArchiveEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StarRating } from "@/components/common/primitives";
import { ArrowUpRightIcon, CheckIcon, ListIcon, PinIcon, TrashIcon } from "@/components/icons";
import { photoSrc } from "@/components/common/PhotoField";
import { useArchiveLook } from "@/state/archive-look";
import { useData } from "@/state/store";
import { useUi } from "@/state/ui";
import { cardBodyLines, cardTextFit, editedLabel, linkHost, toggleChecklist } from "@/lib/archive-card";
import { docFromMarkdown, docToMarkdown, type Doc } from "@/lib/doc";
import { useArchiveSend } from "@/components/archive/use-archive-send";
import { formatShort, weekdayKo } from "@/lib/date";

/** 잘린 본문 아래에 `…` 을 붙일지 — 실제로 넘치는지 재서 판단합니다(폭이 바뀌면 다시 잽니다). */
function useOverflow(ref: React.RefObject<HTMLDivElement | null>, deps: unknown[]): boolean {
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) {
      setOverflow(false);
      return;
    }
    const update = () => setOverflow(node.scrollHeight - node.clientHeight > 2);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return overflow;
}

export function ArchiveCard({
  item,
  selectMode,
  selected,
  trashMode,
  showRating,
  onOpen,
  onToggleSelected,
  onStartDrag,
}: {
  item: ArchiveEntry;
  selectMode: boolean;
  selected: boolean;
  trashMode: boolean;
  showRating: boolean;
  onOpen: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onStartDrag: (event: React.PointerEvent<HTMLElement>, item: ArchiveEntry) => void;
}) {
  const { update, destroy, fetchBody, saveBody } = useData();
  const { notify } = useUi();
  const look = useArchiveLook();
  const send = useArchiveSend();
  const [menuOpen, setMenuOpen] = useState(false);
  /** 체크를 바로 누를 때 화면이 즉시 바뀌도록 잠시 들고 있는 본문입니다. */
  const [localBody, setLocalBody] = useState<string | null>(null);
  const [pendingTodo, setPendingTodo] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalBody(null);
  }, [item.body]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-archive-menu]")) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const body = localBody ?? item.body;
  /** 본문이 비어 있고 `기타`(짧은 설명)만 적힌 기록은 그 설명을 카드 본문으로 보여 줍니다. */
  const shownBody = body.trim() ? body : item.memo;
  const lines = cardBodyLines({ ...item, body: shownBody });
  const fit = cardTextFit({ title: item.title, body: shownBody });
  const hasTitle = Boolean(item.title.trim());
  /**
   * 체크리스트는 한 항목이 한 줄이라, 글자 수로 정한 줄 수보다 먼저 잘리면 안 됩니다.
   * (짧은 체크리스트 메모에서 네 번째 항목이 사라지던 문제) 항목 수만큼은 보여 주되
   * 카드 높이가 10줄을 넘지 않게 막습니다.
   */
  const todoRows = lines.filter((line) => line.type === "todo").length;
  const textRows = lines.some((line) => line.type !== "todo" && line.type !== "divider" && line.text) ? 1 : 0;
  const drawnLines = Math.min(10, Math.max(fit.lines, todoRows + textRows));
  const style = look.styleOf(item.kind);
  const photo = item.photos.length > 0 ? photoSrc(item.photos[0]!) : "";
  const overflow = useOverflow(bodyRef, [shownBody, drawnLines, fit.bodyPx, item.id]);
  const edited = editedLabel(item.updatedAt);
  const host = linkHost(item.link);

  const toggleTodo = async (index: number) => {
    if (pendingTodo !== null) return;
    const optimistic = toggleChecklist(body, index);
    setLocalBody(optimistic);
    setPendingTodo(index);
    try {
      // 서식(색·형광펜)을 지키려면 마크다운이 아니라 노션 블록 문서를 고쳐야 합니다.
      const payload = await fetchBody("archive", item.id);
      const doc: Doc = payload?.doc && payload.doc.blocks.length > 0 ? payload.doc : docFromMarkdown(body);
      let seen = -1;
      const next: Doc = {
        ...doc,
        blocks: doc.blocks.map((block) => {
          if (block.type !== "todo") return block;
          seen += 1;
          return seen === index ? { ...block, checked: !block.checked } : block;
        }),
      };
      const ok = await saveBody("archive", item.id, next);
      if (ok) await update("archive", item.id, { body: docToMarkdown(next) }, { silent: true });
      else setLocalBody(null);
    } finally {
      setPendingTodo(null);
    }
  };

  const pin = () =>
    void update("archive", item.id, { favorite: !item.favorite }, { silent: true }).then((ok) => {
      if (ok) notify(item.favorite ? "상단 고정을 해제했습니다" : "맨 위에 고정했습니다", "success");
    });

  return (
    <article
      data-archive-card={item.id}
      data-archive-selected={selected ? "true" : undefined}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, a, input, textarea, select")) return;
        if (selectMode) {
          event.preventDefault();
          onToggleSelected(item.id);
          return;
        }
        onStartDrag(event, item);
      }}
      className="group relative"
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-white transition",
          selected ? "border-ink-900 ring-1 ring-ink-900" : "border-paper-300 hover:border-paper-400 hover:shadow-soft",
        )}
      >
        {/* ① 대표 사진 — 첫 번째 사진 한 장만. 세로로 긴 캡처는 높이를 잘라 보여 줍니다. */}
        {photo ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => (selectMode ? onToggleSelected(item.id) : onOpen(item.id))}
            className="block w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" loading="lazy" className="h-[118px] w-full object-cover sm:h-[142px]" />
          </button>
        ) : null}

        <div className={cn("px-3 pb-2.5 pt-3", photo && "pt-2.5")}>
          <div
            className="min-w-0 cursor-pointer"
            onClick={() => (selectMode ? onToggleSelected(item.id) : onOpen(item.id))}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter") (selectMode ? onToggleSelected(item.id) : onOpen(item.id));
            }}
          >
            {hasTitle ? (
              <p
                className="break-keep pr-6 font-semibold leading-snug tracking-tight text-ink-900"
                style={{ fontSize: `calc(${fit.titlePx}px * var(--fs))` }}
              >
                {item.title}
              </p>
            ) : null}

            {lines.length > 0 ? (
              <div
                ref={bodyRef}
                data-archive-body
                className={cn("overflow-hidden", hasTitle && "mt-1")}
                style={{ maxHeight: `${Math.round(drawnLines * fit.bodyPx * 1.55)}px` }}
              >
                {lines.map((line) => {
                  if (line.type === "divider") return <hr key={line.key} className="my-1.5 border-paper-300" />;
                  if (line.type === "todo") {
                    return (
                      <div key={line.key} className="flex items-start gap-1.5">
                        <button
                          type="button"
                          aria-label={`${line.text} ${line.checked ? "완료 해제" : "완료"}`}
                          aria-pressed={Boolean(line.checked)}
                          data-archive-todo={line.todoIndex}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (line.todoIndex !== undefined) void toggleTodo(line.todoIndex);
                          }}
                          className={cn(
                            "mt-[3px] flex h-[14px] w-[14px] flex-none items-center justify-center rounded-[4px] border transition",
                            line.checked
                              ? cn(style.dot, "border-transparent text-white")
                              : "border-ink-300 bg-white text-transparent hover:border-ink-500",
                          )}
                        >
                          <CheckIcon size={9} />
                        </button>
                        <span
                          className={cn(
                            "min-w-0 break-keep leading-[1.55]",
                            line.checked ? "text-ink-400 line-through" : hasTitle ? "text-ink-600" : "text-ink-800",
                          )}
                          style={{ fontSize: `calc(${fit.bodyPx}px * var(--fs))` }}
                        >
                          {line.text}
                        </span>
                      </div>
                    );
                  }
                  if (line.type === "heading") {
                    return (
                      <p
                        key={line.key}
                        className="break-keep font-semibold leading-[1.45] text-ink-800"
                        style={{ fontSize: `calc(${fit.bodyPx + 1}px * var(--fs))` }}
                      >
                        {line.text}
                      </p>
                    );
                  }
                  if (line.type === "quote") {
                    return (
                      <p
                        key={line.key}
                        className="break-keep border-l-2 border-paper-400 pl-1.5 leading-[1.55] text-ink-500"
                        style={{ fontSize: `calc(${fit.bodyPx}px * var(--fs))` }}
                      >
                        {line.text}
                      </p>
                    );
                  }
                  if (line.type === "bullet") {
                    return (
                      <p
                        key={line.key}
                        className="flex gap-1 break-keep leading-[1.55] text-ink-600"
                        style={{ fontSize: `calc(${fit.bodyPx}px * var(--fs))` }}
                      >
                        <span aria-hidden className="flex-none text-ink-400">•</span>
                        <span className="min-w-0">{line.text}</span>
                      </p>
                    );
                  }
                  if (!line.text) return <div key={line.key} className="h-1.5" aria-hidden />;
                  return (
                    <p
                      key={line.key}
                      className={cn(
                        "whitespace-pre-line break-keep leading-[1.55]",
                        hasTitle ? "text-ink-600" : "text-ink-800",
                      )}
                      style={{ fontSize: `calc(${fit.bodyPx}px * var(--fs))` }}
                    >
                      {line.text}
                    </p>
                  );
                })}
              </div>
            ) : null}

            {overflow ? (
              <span aria-hidden data-archive-more className="-mt-4 block text-right text-[calc(13px*var(--fs))] leading-none text-ink-300">
                …
              </span>
            ) : null}
          </div>

          {/* 링크 메모 — 목록에서 한 번에 새 탭으로 엽니다. */}
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-paper-200/70 px-2 py-1 text-[calc(13px*var(--fs))] text-ink-600 transition hover:bg-paper-300/70 hover:text-ink-900"
              title={item.link}
            >
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-sky-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{host || item.link}</span>
              <ArrowUpRightIcon size={12} className="flex-none text-ink-400" />
            </a>
          ) : null}

          {/* ⑤ 하단 — 분류 알약 + 수정 일시 (+ 켜 두었을 때만 별점) */}
          <div className="mt-2 flex items-center gap-1.5 pr-6">
            <span
              data-archive-kind-pill={item.kind}
              className={cn("inline-flex flex-none items-center gap-1 rounded-full px-1.5 py-[1px] text-[calc(12.5px*var(--fs))] font-medium", style.pill)}
            >
              <span className={cn("h-[5px] w-[5px] rounded-full", style.dot)} aria-hidden />
              {item.kind}
            </span>
            <span className="min-w-0 flex-1 truncate text-[calc(12px*var(--fs))] text-ink-400" title={item.date ? formatShort(item.date) : undefined}>
              {edited || (item.date ? `${formatShort(item.date)} ${weekdayKo(item.date)}` : "")}
            </span>
            {showRating ? (
              <span className="flex-none" onClick={(event) => event.stopPropagation()}>
                <StarRating value={item.rating} size={11} onChange={(value) => void update("archive", item.id, { rating: value })} />
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ⑤ 고정핀 — 카드 오른쪽 위 모서리 끝. 사진 위에서도 보이도록 흰 바탕을 깔아 둡니다. */}
      {!selectMode ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void pin();
          }}
          aria-pressed={item.favorite}
          data-archive-row-pin={item.id}
          aria-label={item.favorite ? `${item.title || "메모"} 상단 고정 해제` : `${item.title || "메모"} 상단 고정`}
          title={item.favorite ? "상단 고정 해제" : "상단 고정"}
          className={cn(
            "absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full transition",
            item.favorite
              ? "bg-ink-900 text-white"
              : "bg-white/85 text-ink-300 backdrop-blur hover:bg-white hover:text-ink-700",
          )}
        >
          <PinIcon size={12} filled={item.favorite} />
        </button>
      ) : null}

      {selectMode ? (
        <span
          aria-hidden
          className={cn(
            "absolute left-1.5 top-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[calc(11px*var(--fs))] transition",
            selected ? "border-ink-900 bg-ink-900 text-white" : "border-paper-400 bg-white/90 text-transparent",
          )}
        >
          ✓
        </span>
      ) : null}

      {/* ⑦ 카드 메뉴 — 할 일·일정으로 보내기, 휴지통·복원 */}
      {!selectMode ? (
        <div data-archive-menu className="absolute bottom-1.5 right-1.5 z-10">
          <button
            type="button"
            data-archive-card-menu={item.id}
            aria-label={`${item.title || "메모"} 더보기`}
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((current) => !current);
            }}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-ink-300 transition hover:bg-paper-200 hover:text-ink-700",
              menuOpen ? "bg-paper-200 text-ink-700 opacity-100" : "opacity-70 hover:bg-paper-200 hover:text-ink-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
            )}
          >
            <span aria-hidden className="text-[calc(15px*var(--fs))] leading-none">···</span>
          </button>
          {menuOpen ? (
            <div className="absolute bottom-7 right-0 w-[10.5rem] overflow-hidden rounded-xl border border-paper-300 bg-white p-1 text-[calc(13.5px*var(--fs))] shadow-lift">
              {trashMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void update("archive", item.id, { trash: false }).then((ok) => {
                        if (ok) notify(`‘${item.title || "메모"}’을(를) 복원했습니다.`, "success");
                      });
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-ink-700 hover:bg-paper-100"
                  >
                    복원
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void destroy("archive", item.id).then(() => notify("영구 삭제했습니다", "success"));
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-red-500 hover:bg-red-50"
                  >
                    <TrashIcon size={11} /> 완전 삭제
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void send.toTask(item);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-ink-700 hover:bg-paper-100"
                  >
                    <ListIcon size={11} /> 할 일로 보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void send.toEvent(item);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-ink-700 hover:bg-paper-100"
                  >
                    <CheckIcon size={11} /> 일정으로 보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void update("archive", item.id, { trash: true });
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-ink-400 hover:bg-paper-100 hover:text-red-500"
                  >
                    <TrashIcon size={11} /> 휴지통
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
