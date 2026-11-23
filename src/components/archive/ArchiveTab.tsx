"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import { cn, truncate } from "@/lib/utils";
import { formatShort, todayISO, weekdayKo } from "@/lib/date";
import { ARCHIVE_KINDS, type ArchiveKind } from "@/lib/types";
import { archiveTone } from "@/components/common/tone";
import { ArchiveIcon, ArrowUpRightIcon, PlusIcon, SearchIcon, StarIcon, TrashIcon } from "@/components/icons";
import { EmptyState, StarRating } from "@/components/common/primitives";
import { ArchiveEditor } from "@/components/editors/ArchiveEditor";
import { FolderChips } from "@/components/common/PhotoField";
import { useArchiveFolders } from "@/lib/folders";
import { ArchiveDetail } from "@/components/detail/ArchiveDetail";
import { RichText } from "@/components/common/rich";

type SortKey = "recent" | "rating" | "title";

export function ArchiveTab() {
  const { data, create, update, destroy } = useData();
  const { settings } = useSettings();
  const { focus, clearFocus, notify } = useUi();

  const [category, setCategory] = useState<"전체" | ArchiveKind>(settings.archiveDefaultCategory);
  const [folder, setFolder] = useState<string | null>(null);
  const { folders, add: addFolder } = useArchiveFolders();
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [trashMode, setTrashMode] = useState(false);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ kind?: ArchiveKind; date?: string } | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCategory(settings.archiveDefaultCategory);
  }, [settings.archiveDefaultCategory]);

  useTabReset("archive", () => {
    setCategory(settings.archiveDefaultCategory);
    setTag(null);
    setQuery("");
    setSearchOpen(false);
    setSort("recent");
    setFavoritesOnly(false);
    setTrashMode(false);
    setEditorId(null);
    setDraft(null);
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
      .filter((item) => (favoritesOnly ? item.favorite : true))
      .filter((item) =>
        query.trim() ? `${item.title} ${item.body} ${item.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()) : true,
      );
    return filtered.sort((a, b) => {
      if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      return (b.date ?? "").localeCompare(a.date ?? "");
    });
  }, [base, category, folder, tag, favoritesOnly, query, sort]);

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
          return (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setCategory(kind);
                setTag(null);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[calc(15px*var(--fs))] font-medium transition",
                active ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/70 hover:text-ink-800",
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
          onClick={() => setFavoritesOnly((current) => !current)}
          className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5", favoritesOnly && "bg-amber-50 text-amber-700")}
        >
          <StarIcon size={11} filled={favoritesOnly} /> 즐겨찾기
        </button>
        <button
          type="button"
          onClick={() => setTrashMode((current) => !current)}
          className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5", trashMode && "bg-red-50 text-red-500")}
        >
          <TrashIcon size={11} /> {trashMode ? "휴지통" : "휴지통"}
        </button>
        <span className="ml-auto">{items.length}개</span>
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
                  setFavoritesOnly(false);
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
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((item) => {
            const tone = archiveTone(item.kind);
            return (
              <article key={item.id} className="group relative flex flex-col rounded-2xl border border-paper-300 px-4 py-3.5 pb-3 transition hover:border-paper-400">
                <p className={cn("text-[calc(14px*var(--fs))] font-medium", tone.text)}>{item.kind}</p>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setEditorId(item.id)} className="min-w-0 flex-1 text-left">
                    <p className="line-clamp-2 text-[calc(16.5px*var(--fs))] font-semibold leading-snug tracking-tight text-ink-900">{item.title}</p>
                    {item.memo ? (
                      <p className="mt-0.5 line-clamp-1 text-[calc(14.5px*var(--fs))] text-ink-400">
                        <RichText spans={item.memoRich} value={item.memo} links={false} />
                      </p>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void update("archive", item.id, { favorite: !item.favorite })}
                    className={cn("flex-none rounded p-0.5 transition", item.favorite ? "text-amber-400" : "text-ink-300 hover:text-ink-500")}
                    aria-label="즐겨찾기"
                  >
                    <StarIcon size={14} filled={item.favorite} />
                  </button>
                </div>

                {item.body && item.body.trim() !== item.title.trim() ? (
                  <button type="button" onClick={() => setEditorId(item.id)} className="mt-1.5 line-clamp-2 text-left text-[calc(15px*var(--fs))] leading-relaxed text-ink-500">
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
                      className="rounded px-1.5 py-0.5 text-[calc(13px*var(--fs))] text-ink-300 hover:bg-paper-200 hover:text-red-500"
                    >
                      휴지통
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.4rem+env(safe-area-inset-bottom))] z-20 px-4 md:px-8 lg:px-10">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addQuick();
          }}
          className="pointer-events-auto mx-auto flex w-full max-w-[46rem] items-center gap-2 rounded-full border border-paper-300 bg-white/95 px-4 py-2 shadow-lift backdrop-blur"
        >
          <ArchiveIcon size={15} className="flex-none text-ink-400" />
          <input
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder="링크 붙여넣기 또는 메모 입력 후 Enter"
            className="min-w-0 flex-1 border-none bg-transparent text-[calc(15px*var(--fs))] text-ink-900 outline-none placeholder:text-ink-400"
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
