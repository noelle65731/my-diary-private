"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useSettings, type ArchiveViewKey } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import { cn, truncate } from "@/lib/utils";
import { formatShort, todayISO, weekdayKo } from "@/lib/date";
import { ARCHIVE_KINDS, type ArchiveEntry, type ArchiveKind as ArchiveKindType } from "@/lib/types";
import { archiveTone } from "@/components/common/tone";
import { ArchiveIcon, ArrowUpRightIcon, CheckIcon, PinIcon, PlusIcon, SearchIcon, TrashIcon, XIcon } from "@/components/icons";
import { EmptyState, StarRating } from "@/components/common/primitives";
import { ArchiveEditor } from "@/components/editors/ArchiveEditor";
import { FolderChips } from "@/components/common/PhotoField";
import { useArchiveFolders } from "@/lib/folders";
import { ArchiveDetail } from "@/components/detail/ArchiveDetail";
import { RichText } from "@/components/common/rich";
import { useDnd } from "@/components/common/dnd";

type SortKey = "recent" | "rating" | "title";

interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ArchiveTab() {
  const { data, create, update, destroy } = useData();
  const { settings, set: setSetting } = useSettings();
  /** A48: 아카이브 보기 — 설정(카드형/한 줄 목록형)을 그대로 따릅니다. */
  const view = settings.archiveView;
  const { focus, clearFocus, notify } = useUi();
  const dnd = useDnd();

  const [category, setCategory] = useState<"전체" | ArchiveKindType>(settings.archiveDefaultCategory);
  const [folder, setFolder] = useState<string | null>(null);
  const { folders, add: addFolder } = useArchiveFolders();
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [trashMode, setTrashMode] = useState(false);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ kind?: ArchiveKindType; date?: string } | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [busy, setBusy] = useState(false);

  /* A46: 여러 개 고르기 — PC 는 여백에서 끌어 상자 선택, 모바일은 `선택` 버튼. */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setCategory(settings.archiveDefaultCategory);
  }, [settings.archiveDefaultCategory]);

  useTabReset("archive", () => {
    setCategory(settings.archiveDefaultCategory);
    setTag(null);
    setQuery("");
    setSearchOpen(false);
    setSort("recent");
    setPinnedOnly(false);
    setTrashMode(false);
    setEditorId(null);
    setDraft(null);
    setSelectMode(false);
    setSelected([]);
  });

  useEffect(() => {
    if (!focus || focus.resource !== "archive") return;
    setEditorId(focus.id);
    clearFocus();
  }, [focus, clearFocus]);

  const base = useMemo(() => data.archive.filter((item) => Boolean(item.trash) === trashMode), [data.archive, trashMode]);

  const items = useMemo(() => {
    const filtered = base
      .filter((item) => (category === "전체" ? true : item.kind === category))
      // A9: a folder collects the records tagged with its name.
      .filter((item) => (folder ? item.tags.includes(folder) : true))
      .filter((item) => (tag ? item.tags.includes(tag) : true))
      .filter((item) => (pinnedOnly ? item.favorite : true))
      .filter((item) =>
        query.trim() ? `${item.title} ${item.body} ${item.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()) : true,
      );
    return filtered.sort((a, b) => {
      // A46: 상단 고정핀을 켠 기록이 늘 맨 위에 옵니다.
      const pinned = Number(!!b.favorite) - Number(!!a.favorite);
      if (pinned !== 0) return pinned;
      if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      return (b.date ?? "").localeCompare(a.date ?? "");
    });
  }, [base, category, folder, tag, pinnedOnly, query, sort]);

  /** 걸러진 목록이 바뀌면 사라진 항목은 선택에서 뺍니다. */
  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    setSelected((current) => current.filter((id) => ids.has(id)));
  }, [items]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { 전체: base.length };
    for (const kind of ARCHIVE_KINDS) map[kind] = 0;
    for (const item of base) map[item.kind] = (map[item.kind] ?? 0) + 1;
    return map;
  }, [base]);

  const tags = useMemo(() => {
    const seen = new Map<string, number>();
    for (const item of data.archive) {
      if (item.trash) continue;
      for (const itemTag of item.tags) seen.set(itemTag, (seen.get(itemTag) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [data.archive]);

  const addQuick = async () => {
    if (!quickTitle.trim() || busy) return;
    setBusy(true);
    const kind = category === "전체" ? "메모" : category;
    const created = await create("archive", {
      title: quickTitle.trim(),
      kind,
      date: todayISO(),
      baseDate: todayISO(),
      // B8: the quick-add title is never repeated as body text.
      body: "",
      ...(folder ? { tags: [folder] } : {}),
    });
    setQuickTitle("");
    setBusy(false);
    if (created) setEditorId(created.id);
  };

  /* ── 선택 helpers ── */
  const selectedItems = items.filter((item) => selected.includes(item.id));
  const toggleSelected = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const clearSelection = () => {
    setSelected([]);
    setSelectMode(false);
    setMoveOpen(false);
  };

  const bulkTrash = async () => {
    const targets = selectedItems;
    if (targets.length === 0) return;
    for (const item of targets) {
      if (trashMode) await destroy("archive", item.id);
      else await update("archive", item.id, { trash: true }, { silent: true });
    }
    notify(
      trashMode ? `${targets.length}개를 완전히 삭제했습니다` : `${targets.length}개를 휴지통으로 옮겼습니다`,
      "success",
    );
    clearSelection();
  };

  const bulkRestore = async () => {
    const targets = selectedItems;
    for (const item of targets) await update("archive", item.id, { trash: false }, { silent: true });
    notify(`${targets.length}개를 복원했습니다`, "success");
    clearSelection();
  };

  /** A46: 여러 개를 한 번에 다른 분류(또는 폴더)로 옮깁니다. */
  const moveItems = async (targets: ArchiveEntry[], to: { kind?: ArchiveKindType; folderName?: string }) => {
    if (targets.length === 0) return;
    for (const item of targets) {
      const patch: Record<string, unknown> = {};
      if (to.kind) patch.kind = to.kind;
      if (to.folderName && !item.tags.includes(to.folderName)) patch.tags = [...item.tags, to.folderName];
      if (Object.keys(patch).length > 0) await update("archive", item.id, patch, { silent: true });
    }
    const label = to.kind ?? to.folderName ?? "";
    notify(targets.length > 1 ? `${targets.length}개를 ${label}(으)로 옮겼습니다` : `${label}(으)로 옮겼습니다`, "success");
    clearSelection();
  };

  /* ── 드래그: 카드(들)를 분류 칩 위로 ── */
  const startCardDrag = (event: React.PointerEvent<HTMLElement>, item: ArchiveEntry) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const targets = selected.includes(item.id) && selected.length > 1 ? selectedItems : [item];
    dnd.start(
      event,
      { kind: "archive", id: item.id, label: targets.length > 1 ? `${targets.length}개` : item.title },
      (target) => {
        setDropTarget(null);
        if (!target) return;
        if (target.zone === "archive-kind" && target.data.kind) {
          void moveItems(targets, { kind: target.data.kind as ArchiveKindType });
        }
      },
      {
        getHint: (target) => {
          if (target.zone === "archive-kind" && target.data.kind) {
            const name = target.data.kind;
            setDropTarget(name);
            return `${targets.length > 1 ? `${targets.length}개를 ` : ""}${name}(으)로 옮기기`;
          }
          setDropTarget(null);
          return null;
        },
        onEnd: () => setDropTarget(null),
      },
    );
  };

  /* ── 여백에서 끌어 상자 선택 (PC) ── */
  const onGridPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    if (event.target !== event.currentTarget) return;
    if (event.button !== 0) return;
    event.preventDefault();
    marqueeStart.current = { x: event.clientX, y: event.clientY };
    setSelectMode(true);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is a nicety — the drag still works without it */
    }
  };

  const onGridPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = marqueeStart.current;
    if (!start) return;
    const x = Math.min(start.x, event.clientX);
    const y = Math.min(start.y, event.clientY);
    const w = Math.abs(event.clientX - start.x);
    const h = Math.abs(event.clientY - start.y);
    setMarquee({ x, y, w, h });
    const box = { left: x, top: y, right: x + w, bottom: y + h };
    const next: string[] = [];
    gridRef.current?.querySelectorAll<HTMLElement>("[data-archive-card]").forEach((node) => {
      const rect = node.getBoundingClientRect();
      const hit = rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
      if (hit && node.dataset.archiveCard) next.push(node.dataset.archiveCard);
    });
    setSelected(next);
  };

  const endMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!marqueeStart.current) return;
    marqueeStart.current = null;
    setMarquee(null);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* capture may already be gone */
    }
  };

  return (
    <div className="pb-16">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[calc(13.5px*var(--fs))] text-ink-400">
            {trashMode
              ? base.length > 0
                ? `휴지통 ${base.length}개 · 복원하거나 완전 삭제할 수 있습니다`
                : "휴지통이 비어 있습니다"
              : ARCHIVE_KINDS.filter((kind) => (counts[kind] ?? 0) > 0)
                  .map((kind) => `${kind} ${counts[kind]}`)
                  .join(" · ") || "아직 담긴 것이 없습니다"}
          </p>
          <h1 className="mt-1.5 text-[calc(20px*var(--fs))] font-semibold leading-none tracking-[-0.02em] text-ink-900 md:text-[calc(21px*var(--fs))]">아카이브</h1>
        </div>

        <div className="flex flex-none items-center gap-1.5">
          <button
            type="button"
            data-archive-select-toggle
            aria-pressed={selectMode}
            onClick={() => {
              if (selectMode) clearSelection();
              else setSelectMode(true);
            }}
            className={cn(
              "flex h-9 items-center gap-1 rounded-full px-3 text-[calc(14px*var(--fs))] font-medium transition",
              selectMode ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-600 hover:bg-paper-300/70",
            )}
          >
            {selectMode ? <XIcon size={13} /> : <CheckIcon size={13} />}
            {selectMode ? "취소" : "선택"}
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen((current) => !current)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition",
              searchOpen ? "bg-ink-900 text-white" : "bg-paper-200 hover:bg-paper-300/70",
            )}
            aria-label="검색"
          >
            <SearchIcon size={16} />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="mt-3">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목·내용·태그 검색"
            className="w-full rounded-full bg-paper-200 px-3.5 py-2 text-[calc(15px*var(--fs))] text-ink-900 placeholder:text-ink-400 focus:bg-paper-200 focus:outline-none"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(["전체", ...ARCHIVE_KINDS] as const).map((kind) => {
          const active = category === kind;
          const drop = dropTarget === kind;
          return (
            <button
              key={kind}
              type="button"
              data-archive-kind={kind}
              data-drop-zone={kind === "전체" ? undefined : "archive-kind"}
              data-drop-kind={kind === "전체" ? undefined : kind}
              onClick={() => {
                setCategory(kind);
                setTag(null);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[calc(15px*var(--fs))] font-medium transition",
                active ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
                drop && "ring-2 ring-ink-300 ring-offset-1",
              )}
            >
              {kind}
              {counts[kind] ? (
                <span className={cn("text-[calc(13.5px*var(--fs))]", active ? "text-white/70" : "text-ink-400")}>{counts[kind]}</span>
              ) : null}
            </button>
          );
        })}
        {tags.map(([itemTag]) => (
          <button
            key={itemTag}
            type="button"
            onClick={() => setTag(tag === itemTag ? null : itemTag)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[calc(14px*var(--fs))] transition",
              tag === itemTag ? "bg-ink-900 text-white" : "bg-paper-200/70 text-ink-500 hover:bg-paper-300/60",
            )}
          >
            #{itemTag}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-paper-300" aria-hidden />
        <FolderChips folders={folders} selected={folder} onSelect={setFolder} onCreate={(name, emoji) => addFolder(name, emoji)} compact />
        <button
          type="button"
          onClick={() => {
            setDraft({ kind: category === "전체" ? "메모" : category, date: todayISO() });
            setEditorId(null);
          }}
          className="rounded-full border border-dashed border-paper-400 px-2.5 py-1 text-[calc(14px*var(--fs))] text-ink-400 transition hover:border-ink-300 hover:text-ink-700"
        >
          + 담기
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[calc(14px*var(--fs))] text-ink-400">
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="rounded-md bg-transparent py-0.5 text-[calc(14px*var(--fs))] text-ink-400 focus:outline-none"
        >
          <option value="recent">최신순</option>
          <option value="rating">별점순</option>
          <option value="title">제목순</option>
        </select>
        <button
          type="button"
          data-archive-pinned-filter
          onClick={() => setPinnedOnly((current) => !current)}
          className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5", pinnedOnly && "bg-amber-50 text-amber-700")}
        >
          <PinIcon size={11} filled={pinnedOnly} /> 고정
        </button>
        <button
          type="button"
          onClick={() => setTrashMode((current) => !current)}
          className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5", trashMode && "bg-red-50 text-red-500")}
        >
          <TrashIcon size={11} /> {trashMode ? "휴지통" : "휴지통"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {/* A48: 카드형 ↔ 한 줄 목록형 — 설정과 같은 값을 씁니다. */}
          <div className="flex items-center gap-0.5 rounded-full bg-paper-200 p-0.5" data-archive-view-toggle="true" role="group" aria-label="보기 방식">
            {(
              [
                { value: "card", label: "카드" },
                { value: "list", label: "목록" },
              ] as { value: ArchiveViewKey; label: string }[]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                data-archive-view={option.value}
                aria-pressed={view === option.value}
                onClick={() => setSetting("archiveView", option.value)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[calc(13.5px*var(--fs))] font-medium transition",
                  view === option.value ? "bg-white text-ink-900 shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-ink-500 hover:text-ink-800",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span>{items.length}개</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-3">
          {base.length > 0 ? (
            // Records exist here; only the kind·folder·tag·search filter hides them.
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-paper-300 bg-paper-50/60 px-3 py-2 text-[calc(15px*var(--fs))] text-ink-500">
              <span>고른 필터에 맞는 항목이 없습니다. {base.length}개가 다른 분류·폴더에 있습니다.</span>
              <button
                type="button"
                onClick={() => {
                  setCategory("전체");
                  setFolder(null);
                  setTag(null);
                  setQuery("");
                  setPinnedOnly(false);
                }}
                className="btn-outline btn-xs"
              >
                필터 지우기
              </button>
            </div>
          ) : (
          <EmptyState
            icon={<ArchiveIcon size={22} />}
            title={trashMode ? "휴지통이 비어 있습니다" : "아직 담긴 것이 없습니다"}
            description={trashMode ? "삭제한 기록은 여기서 되살릴 수 있습니다." : "책, 영화, 레퍼런스, 읽을거리를 모아 두세요."}
            action={
              trashMode ? undefined : (
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ kind: category === "전체" ? "메모" : category, date: todayISO() });
                    setEditorId(null);
                  }}
                  className="btn-outline btn-xs"
                >
                  <PlusIcon size={12} /> 첫 기록 담기
                </button>
              )
            }
          />
          )}
        </div>
      ) : (
        <div
          ref={gridRef}
          data-archive-grid
          data-archive-current-view={view}
          onPointerDown={onGridPointerDown}
          onPointerMove={onGridPointerMove}
          onPointerUp={endMarquee}
          onPointerCancel={endMarquee}
          className={cn(
            "mt-3 select-none",
            view === "card"
              ? "grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
              : "flex flex-col gap-1.5",
            selectMode && "pb-24",
          )}
        >
          {items.map((item) => {
            const tone = archiveTone(item.kind);
            const isSelected = selected.includes(item.id);
            /* A48: 한 줄 목록형 — 제목·분류·날짜·태그·별점·고정·삭제를 한 줄에. */
            if (view === "list") {
              return (
                <article
                  key={item.id}
                  data-archive-card={item.id}
                  data-archive-row={item.id}
                  data-archive-selected={isSelected ? "true" : undefined}
                  onPointerDown={(event) => {
                    const target = event.target as HTMLElement | null;
                    if (target?.closest("button, a, input, textarea, select")) return;
                    if (selectMode) {
                      event.preventDefault();
                      toggleSelected(item.id);
                      return;
                    }
                    startCardDrag(event, item);
                  }}
                  className={cn(
                    "group relative flex items-center gap-2 rounded-xl border px-2.5 py-2 transition",
                    isSelected
                      ? "border-ink-900 bg-paper-200/70 ring-1 ring-ink-900"
                      : item.favorite
                        ? "border-ink-900/25 bg-paper-100/60 hover:border-paper-400"
                        : "border-paper-300 bg-white hover:border-paper-400",
                  )}
                >
                  <button
                    type="button"
                    data-archive-row-check={item.id}
                    aria-label={isSelected ? `${item.title} 선택 해제` : `${item.title} 선택`}
                    aria-pressed={isSelected}
                    onClick={() => toggleSelected(item.id)}
                    className={cn(
                      "flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[4px] border text-[calc(10px*var(--fs))] transition",
                      isSelected ? "border-ink-900 bg-ink-900 text-white" : "border-paper-400 bg-white text-transparent hover:border-ink-400",
                    )}
                  >
                    ✓
                  </button>
                  <span className={cn("h-2 w-2 flex-none rounded-full", tone.solid)} aria-hidden />
                  <span className={cn("w-[3.1rem] flex-none text-[calc(13px*var(--fs))] font-medium", tone.text)}>{item.kind}</span>
                  <button
                    type="button"
                    onClick={() => (selectMode ? toggleSelected(item.id) : setEditorId(item.id))}
                    className="min-w-0 flex-1 truncate text-left text-[calc(15.5px*var(--fs))] font-medium text-ink-900"
                  >
                    {item.title}
                  </button>
                  {item.tags.length > 0 ? (
                    <span className="hidden flex-none items-center gap-1 sm:flex">
                      {item.tags.slice(0, 2).map((itemTag) => (
                        <button
                          key={itemTag}
                          type="button"
                          onClick={() => setTag(itemTag)}
                          className="rounded-full bg-paper-200/70 px-1.5 py-0.5 text-[calc(12.5px*var(--fs))] text-ink-500 hover:bg-paper-300/60"
                        >
                          #{itemTag}
                        </button>
                      ))}
                    </span>
                  ) : null}
                  <span className="hidden flex-none sm:block">
                    <StarRating value={item.rating} size={11} onChange={(value) => void update("archive", item.id, { rating: value })} />
                  </span>
                  <span className="hidden w-[4.6rem] flex-none text-right text-[calc(13px*var(--fs))] tabular-nums text-ink-400 md:block">
                    {item.date ? `${formatShort(item.date)} ${weekdayKo(item.date)}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void update("archive", item.id, { favorite: !item.favorite }, { silent: true }).then((ok) => {
                        if (ok) notify(item.favorite ? "상단 고정을 해제했습니다" : "맨 위에 고정했습니다", "success");
                      })
                    }
                    aria-pressed={item.favorite}
                    aria-label={item.favorite ? `${item.title} 상단 고정 해제` : `${item.title} 상단 고정`}
                    title={item.favorite ? "상단 고정 해제" : "상단 고정"}
                    className={cn(
                      "flex h-6 w-6 flex-none items-center justify-center rounded-full transition",
                      item.favorite ? "bg-ink-900 text-white" : "text-ink-300 hover:bg-paper-200 hover:text-ink-700",
                    )}
                  >
                    <PinIcon size={12} filled={item.favorite} />
                  </button>
                  {trashMode ? (
                    <span className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          void update("archive", item.id, { trash: false }).then((ok) => {
                            if (ok) notify(`‘${item.title}’을(를) 복원했습니다.`, "success");
                          });
                        }}
                        className="rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-500 hover:bg-paper-200"
                      >
                        복원
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void destroy("archive", item.id).then(() => notify(`‘${item.title}’을(를) 완전히 삭제했습니다.`, "success"));
                        }}
                        className="rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-red-500 hover:bg-red-50"
                      >
                        완전 삭제
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void update("archive", item.id, { trash: true })}
                      className="trash-btn flex h-6 w-6 flex-none items-center justify-center rounded-full text-ink-300 transition hover:bg-paper-200 hover:text-red-500"
                      aria-label={`${item.title} 휴지통으로`}
                    >
                      <TrashIcon size={12} />
                    </button>
                  )}
                </article>
              );
            }
            return (
              <article
                key={item.id}
                data-archive-card={item.id}
                data-archive-selected={isSelected ? "true" : undefined}
                onPointerDown={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("button, a, input, textarea, select")) return;
                  if (selectMode) {
                    event.preventDefault();
                    toggleSelected(item.id);
                    return;
                  }
                  startCardDrag(event, item);
                }}
                onClick={(event) => {
                  if (selectMode) {
                    const target = event.target as HTMLElement | null;
                    if (target?.closest("button, a, input, textarea, select")) return;
                    event.preventDefault();
                    return;
                  }
                }}
                className={cn(
                  "group relative flex flex-col rounded-2xl border px-4 py-3.5 pb-3 transition",
                  isSelected
                    ? "border-ink-900 bg-paper-200/70 ring-1 ring-ink-900"
                    : item.favorite
                      ? "border-ink-900/25 bg-paper-100/60 hover:border-paper-400"
                      : "border-paper-300 bg-white hover:border-paper-400",
                )}
              >
                {selectMode ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute right-2 top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[calc(11px*var(--fs))] transition",
                      isSelected ? "border-ink-900 bg-ink-900 text-white" : "border-paper-400 bg-white/90 text-transparent",
                    )}
                  >
                    ✓
                  </span>
                ) : null}

                <p className={cn("text-[calc(14px*var(--fs))] font-medium", tone.text)}>{item.kind}</p>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => (selectMode ? toggleSelected(item.id) : setEditorId(item.id))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="line-clamp-2 text-[calc(16.5px*var(--fs))] font-semibold leading-snug tracking-tight text-ink-900">{item.title}</p>
                    {item.memo ? (
                      <p className="mt-0.5 line-clamp-1 text-[calc(14.5px*var(--fs))] text-ink-400">
                        <RichText spans={item.memoRich} value={item.memo} links={false} />
                      </p>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void update("archive", item.id, { favorite: !item.favorite }, { silent: true }).then((ok) => {
                        if (ok) notify(item.favorite ? "상단 고정을 해제했습니다" : "맨 위에 고정했습니다", "success");
                      })
                    }
                    className={cn(
                      "flex h-6 w-6 flex-none items-center justify-center rounded-full transition",
                      item.favorite ? "bg-ink-900 text-white" : "text-ink-300 hover:bg-paper-200 hover:text-ink-700",
                    )}
                    aria-pressed={item.favorite}
                    aria-label={item.favorite ? `${item.title} 상단 고정 해제` : `${item.title} 상단 고정`}
                    title={item.favorite ? "상단 고정 해제" : "상단 고정"}
                  >
                    <PinIcon size={12} filled={item.favorite} />
                  </button>
                </div>

                {item.body && item.body.trim() !== item.title.trim() ? (
                  <button
                    type="button"
                    onClick={() => (selectMode ? toggleSelected(item.id) : setEditorId(item.id))}
                    className="mt-1.5 line-clamp-2 text-left text-[calc(15px*var(--fs))] leading-relaxed text-ink-500"
                  >
                    {truncate(item.body.replace(/\n/g, " "), 120)}
                  </button>
                ) : null}

                {item.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((itemTag) => (
                      <button
                        key={itemTag}
                        type="button"
                        onClick={() => setTag(itemTag)}
                        className="rounded-full bg-paper-200/70 px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-500 hover:bg-paper-300/60"
                      >
                        #{itemTag}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-2 flex items-center gap-1.5 pt-1">
                  <StarRating value={item.rating} size={12} onChange={(value) => void update("archive", item.id, { rating: value })} />
                  <span className="text-[calc(13.5px*var(--fs))] text-ink-400">
                    {item.date ? `${formatShort(item.date)} ${weekdayKo(item.date)}` : ""}
                  </span>
                  {item.link ? (
                    <a href={item.link} target="_blank" rel="noreferrer" className="ml-auto text-ink-300 hover:text-ink-600" aria-label="링크 열기">
                      <ArrowUpRightIcon size={13} />
                    </a>
                  ) : null}
                </div>

                <div className="absolute bottom-2 right-3 flex items-center gap-1 rounded-full bg-white/90 px-1 opacity-0 transition group-hover:opacity-100">
                  {trashMode ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void update("archive", item.id, { trash: false }).then((ok) => {
                            if (ok) notify(`‘${item.title}’을(를) 복원했습니다.`, "success");
                          });
                        }}
                        className="rounded px-1.5 py-0.5 text-[calc(13.5px*var(--fs))] text-ink-500 hover:bg-paper-200"
                      >
                        복원
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void destroy("archive", item.id).then(() => notify(`‘${item.title}’을(를) 완전히 삭제했습니다.`, "success"));
                        }}
                        className="rounded px-1.5 py-0.5 text-[calc(13.5px*var(--fs))] text-red-500 hover:bg-red-50"
                      >
                        완전 삭제
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void update("archive", item.id, { trash: true })}
                      className="trash-btn flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-300 hover:bg-paper-200 hover:text-red-500"
                    >
                      <TrashIcon size={11} /> 휴지통
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* A46: 상자 선택 — 마우스로 여백에서 그린 사각형 */}
      {marquee ? (
        <div
          aria-hidden
          data-archive-marquee
          className="pointer-events-none fixed z-30 rounded-md border border-ink-700/60 bg-ink-900/[0.06]"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      ) : null}

      {/* A46: 선택한 항목이 있을 때만 뜨는 일괄 작업 줄 */}
      {selected.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(8.9rem+env(safe-area-inset-bottom))] z-20 px-4 md:px-8 lg:px-10">
          <div className="pointer-events-auto mx-auto flex w-full max-w-[46rem] items-center gap-2 rounded-2xl border border-ink-900/15 bg-white/95 px-3 py-2 shadow-lift backdrop-blur">
            <span className="flex-none text-[calc(14px*var(--fs))] font-medium text-ink-800">{selected.length}개 선택</span>
            <button
              type="button"
              data-archive-bulk-move
              onClick={() => setMoveOpen((current) => !current)}
              className="ml-auto rounded-full bg-paper-200 px-2.5 py-1 text-[calc(13.5px*var(--fs))] text-ink-700 transition hover:bg-paper-300"
            >
              이동
            </button>
            {trashMode ? (
              <button
                type="button"
                data-archive-bulk-restore
                onClick={() => void bulkRestore()}
                className="rounded-full bg-paper-200 px-2.5 py-1 text-[calc(13.5px*var(--fs))] text-ink-700 transition hover:bg-paper-300"
              >
                복원
              </button>
            ) : null}
            <button
              type="button"
              data-archive-bulk-trash
              onClick={() => void bulkTrash()}
              className="trash-btn flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[calc(13.5px*var(--fs))] text-rose-600 hover:bg-rose-100"
            >
              <TrashIcon size={11} /> {trashMode ? "완전 삭제" : "삭제"}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-full px-2 py-1 text-[calc(13.5px*var(--fs))] text-ink-400 transition hover:text-ink-800"
            >
              해제
            </button>
          </div>
        </div>
      ) : null}

      {/* A46: 일괄 이동 — 분류·폴더 고르기 */}
      {moveOpen && selected.length > 0 ? (
        <div
          data-archive-move-menu
          role="dialog"
          aria-label="옮길 분류 고르기"
          className="fixed inset-x-3 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-paper-300 bg-white p-2 shadow-lift"
        >
          <p className="px-2 py-1 text-[calc(13px*var(--fs))] text-ink-400">분류로 옮기기</p>
          <div className="flex flex-wrap gap-1.5 px-1 pb-2">
            {ARCHIVE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                data-archive-move-kind={kind}
                onClick={() => void moveItems(selectedItems, { kind })}
                className="rounded-full bg-paper-200 px-2.5 py-1 text-[calc(14px*var(--fs))] text-ink-700 transition hover:bg-paper-300"
              >
                {kind}
              </button>
            ))}
          </div>
          {folders.length > 0 ? (
            <>
              <p className="px-2 py-1 text-[calc(13px*var(--fs))] text-ink-400">폴더에 담기</p>
              <div className="flex flex-wrap gap-1.5 px-1 pb-2">
                {folders.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    data-archive-move-folder={entry.name}
                    onClick={() => void moveItems(selectedItems, { folderName: entry.name })}
                    className="rounded-full bg-paper-200 px-2.5 py-1 text-[calc(14px*var(--fs))] text-ink-700 transition hover:bg-paper-300"
                  >
                    {entry.emoji ? `${entry.emoji} ` : ""}
                    {entry.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setMoveOpen(false)}
            className="mt-1 w-full rounded-lg px-2 py-1.5 text-center text-[calc(13.5px*var(--fs))] text-ink-400 hover:bg-paper-100"
          >
            닫기
          </button>
        </div>
      ) : null}

      {/* A46: 하단 플로팅 빠른 입력 — 카드와 구분되도록 따뜻한 크림 바탕·뚜렷한 테두리·그림자. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] z-20 px-4 md:px-8 lg:px-10">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addQuick();
          }}
          data-archive-quick-add
          className="pointer-events-auto mx-auto flex w-full max-w-[46rem] items-center gap-2 rounded-full border border-[#d8cbb8] bg-[#fbf6ec] px-4 py-2 shadow-[0_10px_30px_-12px_rgba(90,70,40,0.35),0_2px_6px_rgba(90,70,40,0.10)] backdrop-blur"
        >
          <ArchiveIcon size={15} className="flex-none text-[#a08a6a]" />
          <input
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder="링크 붙여넣기 또는 메모 입력 후 Enter"
            className="min-w-0 flex-1 border-none bg-transparent text-[calc(15px*var(--fs))] text-ink-900 outline-none placeholder:text-[#a89a80]"
          />
          <button type="submit" disabled={!quickTitle.trim() || busy} className="btn-primary btn-xs flex-none">
            담기
          </button>
        </form>
      </div>

      <ArchiveDetail
        open={editorId !== null}
        archiveId={editorId}
        onBack={() => setEditorId(null)}
        onCloseDetail={() => {
          setEditorId(null);
          setDraft(null);
        }}
      />

      <ArchiveEditor
        open={draft !== null}
        draft={draft ?? undefined}
        onClose={() => {
          setEditorId(null);
          setDraft(null);
        }}
      />
    </div>
  );
}
