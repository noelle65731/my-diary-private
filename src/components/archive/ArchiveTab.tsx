"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/state/store";
import { useSettings } from "@/state/settings";
import { useTabReset, useUi } from "@/state/ui";
import { cn, truncate } from "@/lib/utils";
import { formatShort, todayISO } from "@/lib/date";
import { ARCHIVE_KINDS, type ArchiveKind } from "@/lib/types";
import { archiveTone } from "@/components/common/tone";
import {
  ArchiveIcon,
  ArrowUpRightIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
} from "@/components/icons";
import { EmptyState, StarRating } from "@/components/common/primitives";
import { ArchiveEditor } from "@/components/editors/ArchiveEditor";

type SortKey = "recent" | "rating" | "title";

export function ArchiveTab() {
  const { data, create, update, destroy } = useData();
  const { settings } = useSettings();
  const { focus, clearFocus } = useUi();

  const [category, setCategory] = useState<"전체" | ArchiveKind>(settings.archiveDefaultCategory);
  const [query, setQuery] = useState("");
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
    setQuery("");
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

  const items = useMemo(() => {
    const base = data.archive.filter((item) => item.trash === trashMode);
    const filtered = base
      .filter((item) => (category === "전체" ? true : item.kind === category))
      .filter((item) => (favoritesOnly ? item.favorite : true))
      .filter((item) =>
        query.trim() ? `${item.title} ${item.body} ${item.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()) : true,
      );
    return filtered.sort((a, b) => {
      if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      return (b.date ?? "").localeCompare(a.date ?? "");
    });
  }, [data.archive, trashMode, category, favoritesOnly, query, sort]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { 전체: 0 };
    for (const kind of ARCHIVE_KINDS) map[kind] = 0;
    for (const item of data.archive) {
      if (item.trash !== trashMode) continue;
      map["전체"] = (map["전체"] ?? 0) + 1;
      map[item.kind] = (map[item.kind] ?? 0) + 1;
    }
    return map;
  }, [data.archive, trashMode]);

  const addQuick = async () => {
    if (!quickTitle.trim() || busy) return;
    setBusy(true);
    const kind = category === "전체" ? "메모" : category;
    const created = await create("archive", {
      title: quickTitle.trim(),
      kind,
      date: todayISO(),
      baseDate: todayISO(),
    });
    setQuickTitle("");
    setBusy(false);
    if (created) setEditorId(created.id);
  };

  return (
    <div className="space-y-3">
      <div className="card flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ArchiveIcon size={16} className="flex-none text-ink-400" />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addQuick();
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <input
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              placeholder={category === "전체" ? "빠르게 메모 담기" : `빠르게 ${category} 담기`}
              className="min-w-0 flex-1 border-none bg-transparent px-1 py-1 text-[0.86rem] outline-none placeholder:text-ink-400"
            />
            <button type="submit" disabled={!quickTitle.trim() || busy} className="btn-primary btn-xs flex-none">
              <PlusIcon size={12} /> 담기
            </button>
          </form>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft({ kind: category === "전체" ? "메모" : category, date: todayISO() });
            setEditorId(null);
          }}
          className="btn-outline btn-xs self-start sm:self-auto"
        >
          자세히 담기
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["전체", ...ARCHIVE_KINDS] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setCategory(kind)}
            className={cn(
              "chip border transition",
              category === kind
                ? "border-ink-900 bg-ink-900 text-paper-50"
                : "border-paper-400 bg-white/50 text-ink-500 hover:border-ink-400 hover:text-ink-800",
            )}
          >
            {kind}
            <span className={cn("text-[0.6rem]", category === kind ? "text-paper-300" : "text-ink-400")}>{counts[kind] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[8rem] flex-1 sm:max-w-[15rem]">
          <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목·내용·태그"
            className="input py-1.5 pl-8 text-[0.78rem]"
          />
        </div>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="input w-auto py-1.5 text-[0.76rem]">
          <option value="recent">최신순</option>
          <option value="rating">별점순</option>
          <option value="title">제목순</option>
        </select>
        <button
          type="button"
          onClick={() => setFavoritesOnly((current) => !current)}
          className={cn(
            "chip border",
            favoritesOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-paper-400 bg-white/50 text-ink-500",
          )}
        >
          <StarIcon size={11} filled={favoritesOnly} /> 즐겨찾기
        </button>
        <button
          type="button"
          onClick={() => setTrashMode((current) => !current)}
          className={cn(
            "chip border",
            trashMode ? "border-rose-200 bg-rose-50 text-rose-600" : "border-paper-400 bg-white/50 text-ink-500",
          )}
        >
          <TrashIcon size={11} /> {trashMode ? "휴지통 보는 중" : "휴지통"}
        </button>
        <span className="ml-auto text-[0.66rem] text-ink-400">{items.length}개</span>
      </div>

      {items.length === 0 ? (
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
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const tone = archiveTone(item.kind);
            return (
              <article key={item.id} className="card flex flex-col px-3.5 py-3 transition hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setEditorId(item.id)} className="min-w-0 flex-1 text-left">
                    <span className={cn("chip mb-1 border", tone.bg, tone.border, tone.text)}>{item.kind}</span>
                    <p className="line-clamp-2 text-[0.9rem] font-medium leading-snug text-ink-900">{item.title}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void update("archive", item.id, { favorite: !item.favorite })}
                    className={cn("flex-none rounded p-1 transition", item.favorite ? "text-amber-400" : "text-ink-300 hover:text-ink-500")}
                    aria-label="즐겨찾기"
                  >
                    <StarIcon size={15} filled={item.favorite} />
                  </button>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <StarRating
                    value={item.rating}
                    size={12}
                    onChange={trashMode ? undefined : (value) => void update("archive", item.id, { rating: value })}
                  />
                  <span className="text-[0.62rem] text-ink-400">{item.date ? formatShort(item.date) : ""}</span>
                  {item.link ? (
                    <a href={item.link} target="_blank" rel="noreferrer" className="ml-auto text-ink-400 hover:text-accent-600" aria-label="링크 열기">
                      <ArrowUpRightIcon size={13} />
                    </a>
                  ) : null}
                </div>

                {item.body ? (
                  <button
                    type="button"
                    onClick={() => setEditorId(item.id)}
                    className="mt-1.5 line-clamp-2 text-left text-[0.74rem] leading-relaxed text-ink-500"
                  >
                    {truncate(item.body.replace(/\n/g, " "), 90)}
                  </button>
                ) : null}

                {item.tags.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="chip bg-paper-100 text-[0.6rem] text-ink-500">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-2 flex items-center justify-end gap-1 border-t border-paper-300/40 pt-1.5">
                  {trashMode ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void update("archive", item.id, { trash: false })}
                        className="rounded px-1.5 py-0.5 text-[0.64rem] text-ink-500 hover:bg-paper-200"
                      >
                        복원
                      </button>
                      <button
                        type="button"
                        onClick={() => void destroy("archive", item.id)}
                        className="rounded px-1.5 py-0.5 text-[0.64rem] text-rose-500 hover:bg-rose-50"
                      >
                        완전 삭제
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void update("archive", item.id, { trash: true })}
                      className="rounded px-1.5 py-0.5 text-[0.64rem] text-ink-400 hover:bg-paper-200 hover:text-rose-500"
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

      <ArchiveEditor
        open={editorId !== null || draft !== null}
        archiveId={editorId}
        draft={draft ?? undefined}
        onClose={() => {
          setEditorId(null);
          setDraft(null);
        }}
      />
    </div>
  );
}
