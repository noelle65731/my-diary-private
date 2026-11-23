"use client";

import { useMemo, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Drawer, EmptyState, Segmented, Switch } from "@/components/common/primitives";
import { CalendarIcon, CheckIcon, ChevronRightIcon, PencilIcon, PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { formatShort, timeRangeLabel, weekdayKo } from "@/lib/date";
import type { CalendarEvent } from "@/lib/types";
import { BASE_CATEGORIES } from "@/lib/types";
import { useCategoryColors } from "@/state/category-colors";
import { useSettings } from "@/state/settings";
import { taskTone } from "@/components/common/tone";

/** A39: 일정 카드가 보여 주는 개수 — 프로젝트 카드와 같은 규격(5개)입니다. */
export const SCHEDULE_PREVIEW = 5;
/** A39: 카드 아래 '최근 기록'은 최근에 끝낸 두 개까지. */
export const SCHEDULE_RECENT = 2;

/** 카드·서랍이 함께 쓰는 날짜 줄 — `11/22 토` 또는 `11/22 토 14:00–15:00`. */
export function scheduleDateLabel(event: CalendarEvent): string {
  const day = event.date ? `${formatShort(event.date)} ${weekdayKo(event.date)}` : "";
  const time = event.allDay ? "" : timeRangeLabel(event.startTime, event.endTime);
  return time ? `${day} ${time}`.trim() : day;
}

export function isOpenEvent(event: CalendarEvent): boolean {
  return !event.trash && !event.done && !event.canceled;
}

/** 남은 일정은 가까운 날짜부터, 같은 날이면 시작 시각 순서. */
function byOpenOrder(a: CalendarEvent, b: CalendarEvent): number {
  const day = (a.date ?? "").localeCompare(b.date ?? "");
  if (day !== 0) return day;
  return (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
}

/** 끝낸 일정은 최근 날짜부터. */
function byDoneOrder(a: CalendarEvent, b: CalendarEvent): number {
  const left = a.endDate ?? a.date ?? "";
  const right = b.endDate ?? b.date ?? "";
  return right.localeCompare(left);
}

/** A40: `취소` 배지 — 예전 연한 회색보다 진하게(목록 오른쪽에서도 바로 읽히도록). */
function CancelPill() {
  return (
    <span
      data-cancel-badge="true"
      className="flex-none rounded bg-ink-900/[0.12] px-1 text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6] tracking-tight text-ink-800"
    >
      취소
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const categoryColor = useCategoryColors();
  const tone = categoryColor.toneOf(category, taskTone(category));
  return (
    <span
      data-schedule-badge={category}
      className={cn("flex-none rounded px-1 text-[calc(11.5px*var(--fs))] font-semibold leading-[1.6]", tone.soft, tone.text)}
    >
      {category || "분류 없음"}
    </span>
  );
}

/**
 * A39: 프로젝트 탭의 `index` 옆 `일정` 카드.
 * 상단 분류 필터와 상관없이 모든 일정을 한데 모아 보여 주고(NOW 모드가 켜져 있을 때만
 * NOW 숨김을 가림), 프로젝트 카드와 같은 규격으로 남은 일정 → 최근 기록 → `+ 일정` 순서입니다.
 */
export function ScheduleCard({
  events,
  nowOnly,
  showCompleted,
  previewCount = SCHEDULE_PREVIEW,
  highlight,
  open,
  dropProps,
  onOpenDrawer,
  onOpenEvent,
  onToggleDone,
  onCreate,
  onPointerDragStart,
  onDragStartEvent,
  onCardPointerDown,
}: {
  events: CalendarEvent[];
  nowOnly: boolean;
  /** 완료 보기 — 켜져 있으면 완료한 일정만 보여 줍니다. */
  showCompleted: boolean;
  /** A40: 프로젝트 카드와 같은 표시 개수(3~8)를 `일정` 카드도 따릅니다. */
  previewCount?: number;
  highlight: boolean;
  open: boolean;
  dropProps: React.HTMLAttributes<HTMLElement>;
  onOpenDrawer: () => void;
  onOpenEvent: (id: string) => void;
  onToggleDone: (event: CalendarEvent) => void;
  onCreate: (title: string) => void;
  /** 손가락 끌기(모바일) 시작 — ProjectsTab 이 놓일 자리별 동작을 정합니다. */
  onPointerDragStart: (event: ReactPointerEvent<HTMLElement>, item: CalendarEvent) => void;
  /** 마우스 끌기(PC) — HTML5 drag 로 id 를 실어 보냅니다. */
  onDragStartEvent: (event: ReactDragEvent<HTMLElement>, item: CalendarEvent) => void;
  /** A40: 카드 자체를 끌어 순서 바꾸기. */
  onCardPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const [draft, setDraft] = useState("");
  const visible = useMemo(() => events.filter((event) => event.kind === "일정" && !event.trash), [events]);
  /** NOW 모드에서만 NOW 숨김을 가립니다 — 분류는 걸지 않습니다. */
  const scoped = useMemo(() => (nowOnly ? visible.filter((event) => !event.hidden) : visible), [visible, nowOnly]);
  const openList = useMemo(() => scoped.filter(isOpenEvent).sort(byOpenOrder), [scoped]);
  /** A40: 완료·취소한 일정을 함께 하단 `최근 기록`에 모읍니다. */
  const doneList = useMemo(
    () => scoped.filter((event) => event.done || event.canceled).sort(byDoneOrder),
    [scoped],
  );
  const count = Math.max(1, previewCount);
  const preview = showCompleted ? doneList : openList;
  const recent = showCompleted ? [] : doneList.slice(0, SCHEDULE_RECENT);

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    onCreate(title);
    setDraft("");
  };

  return (
    <article
      data-schedule-card="true"
      data-drop-card="schedule"
      data-drop-zone="schedule-card"
      data-drop-id="schedule"
      {...dropProps}
      onPointerDown={onCardPointerDown}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, a, input, textarea, select, label, form")) return;
        onOpenDrawer();
      }}
      className={cn(
        "flex min-h-[10rem] cursor-pointer flex-col rounded-2xl border px-3.5 py-3 transition",
        highlight ? "border-ink-300 bg-paper-200/60 ring-2 ring-ink-200" : "border-paper-300 bg-white/70 hover:border-paper-400",
        open && "ring-2 ring-ink-200",
      )}
    >
      <header className="flex items-start gap-2">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-label="일정 열기"
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-paper-200 text-ink-500">
            <CalendarIcon size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[calc(17px*var(--fs))] font-semibold tracking-tight text-ink-900">일정</span>
            <span className="block truncate text-[calc(14px*var(--fs))] text-ink-500">모든 분류의 일정</span>
          </span>
        </button>
        <button type="button" onClick={onOpenDrawer} className="flex-none text-ink-300 transition hover:text-ink-600" aria-label="일정 상세 열기">
          <ChevronRightIcon size={15} />
        </button>
      </header>
      <p className="mt-1.5 text-[calc(14px*var(--fs))] text-ink-500">
        {showCompleted ? `완료·취소한 일정 ${doneList.length}` : `남은 일정 ${openList.length}`}
      </p>
      <ul className="mt-1 space-y-1.5">
        {preview.slice(0, count).map((event) => {
          const done = event.done;
          return (
            <li
              key={event.id}
              data-schedule-event={event.id}
              className="flex cursor-grab items-start gap-1.5 active:cursor-grabbing"
              draggable
              onDragStart={(dragEvent) => onDragStartEvent(dragEvent, event)}
              title="끌어서 프로젝트 카드에 놓으면 그 프로젝트의 할 일이 됩니다"
            >
              <button
                type="button"
                onClick={() => onToggleDone(event)}
                aria-label={event.canceled ? `${event.title} 취소됨` : done ? `${event.title} 완료 해제` : `${event.title} 완료`}
                aria-pressed={done}
                disabled={event.canceled}
                className={cn(
                  "mt-[3px] flex h-[16px] w-[16px] flex-none items-center justify-center rounded-[4px] border transition",
                  done && !event.canceled
                    ? "border-sage-400 bg-sage-400 text-white"
                    : event.canceled
                      ? "border-ink-300 bg-ink-900/[0.12] text-ink-700"
                      : "border-paper-400 hover:border-ink-500",
                )}
              >
                {event.canceled ? <span className="text-[calc(9px*var(--fs))] font-bold leading-none">×</span> : done ? <CheckIcon size={9} /> : null}
              </button>
              <button
                type="button"
                data-schedule-drag={event.id}
                onPointerDown={(pointerEvent) => onPointerDragStart(pointerEvent, event)}
                onClick={onOpenDrawer}
                className="min-w-0 flex-1 touch-manipulation select-none text-left"
              >
                {/* A41: 날짜·시간은 아래 줄로 내리지 않고 제목 오른쪽 한 줄에 — 프로젝트 카드와 같은 규격. */}
                <span className="flex items-center gap-1">
                  <CategoryBadge category={event.category} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[calc(15.5px*var(--fs))] leading-[1.35] text-ink-900",
                      (done || event.canceled) && "text-ink-400 line-through",
                    )}
                  >
                    {event.title}
                  </span>
                  {event.canceled ? <CancelPill /> : null}
                  <span
                    data-schedule-date={event.id}
                    className="flex-none whitespace-nowrap text-[calc(13px*var(--fs))] tabular-nums text-ink-400"
                  >
                    {scheduleDateLabel(event)}
                  </span>
                </span>
              </button>
              {/* A42: 연필을 누를 때만 바로 수정 창으로 — 제목·빈칸은 서랍을 먼저 엽니다. */}
              <button
                type="button"
                data-schedule-edit={event.id}
                onClick={() => onOpenEvent(event.id)}
                aria-label={`${event.title} 바로 수정`}
                title="바로 수정"
                className="mt-[2px] flex h-5 w-5 flex-none items-center justify-center rounded-full text-ink-300 transition hover:bg-paper-200 hover:text-ink-700"
              >
                <PencilIcon size={12} />
              </button>
            </li>
          );
        })}
        {preview.length === 0 ? (
          <li className="text-[calc(14px*var(--fs))] text-ink-300">
            {showCompleted ? "완료한 일정이 없습니다." : "남은 일정이 없습니다."}
          </li>
        ) : null}
        {preview.length > count ? (
          <li>
            <button
              type="button"
              onClick={onOpenDrawer}
              className="pl-[1.375rem] text-[calc(13.5px*var(--fs))] text-ink-500 transition hover:text-ink-700"
            >
              +{preview.length - count}개 더 보기
            </button>
          </li>
        ) : null}
      </ul>

      {recent.length > 0 ? (
        <div data-recent-log="schedule" className="mt-2 border-t border-black/[0.06] pt-1.5">
          <p className="text-[calc(13px*var(--fs))] text-ink-400">최근 기록</p>
          <ul className="mt-0.5 space-y-0.5">
            {recent.map((event) => (
              <li key={event.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenDrawer}
                  className="min-w-0 flex-1 truncate text-left text-[calc(14px*var(--fs))] text-ink-500"
                >
                  {event.title}
                </button>
                {event.canceled ? <CancelPill /> : null}
                <span className="flex-none whitespace-nowrap text-[calc(13px*var(--fs))] tabular-nums text-ink-400">
                  {scheduleDateLabel(event)}
                </span>
                <button
                  type="button"
                  data-schedule-edit={event.id}
                  onClick={() => onOpenEvent(event.id)}
                  aria-label={`${event.title} 바로 수정`}
                  title="바로 수정"
                  className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-ink-300 transition hover:bg-paper-200 hover:text-ink-700"
                >
                  <PencilIcon size={11} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mt-auto pt-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="+ 일정"
          aria-label="일정 빠른 추가"
          className="w-full rounded-lg bg-paper-200/70 px-2 py-1 text-[calc(14px*var(--fs))] text-ink-900 placeholder:text-ink-400 focus:bg-paper-200 focus:outline-none"
        />
      </form>
    </article>
  );
}

type DrawerFilter = "all" | "ing" | "done";

/**
 * A39: `일정` 카드를 누르면 열리는 서랍 — 전체/진행/완료와 분류별 필터를 함께 둡니다.
 * 분류 필터는 이 서랍 안에서만 걸립니다(카드와 프로젝트 탭 상단 필터는 그대로).
 */
export function ScheduleDrawer({
  open,
  events,
  nowOnly,
  onClose,
  onOpenEvent,
  onToggleDone,
  onCreate,
}: {
  open: boolean;
  events: CalendarEvent[];
  nowOnly: boolean;
  onClose: () => void;
  onOpenEvent: (id: string) => void;
  onToggleDone: (event: CalendarEvent) => void;
  onCreate: (title: string, category: string) => void;
}) {
  const { settings, set: setSetting } = useSettings();
  const [filter, setFilter] = useState<DrawerFilter>("all");
  const [category, setCategory] = useState<string>("전체");
  const [draft, setDraft] = useState("");

  const visible = useMemo(() => events.filter((event) => event.kind === "일정" && !event.trash), [events]);
  /**
   * A42: 프로젝트 서랍과 같은 순서 — 위에는 아직 해야 할 일정만(가까운 날짜부터),
   * 아래에는 완료·취소한 일정을 최근 날짜부터. 예전에는 날짜 하나로만 정렬해
   * 지난주에 끝낸 일정이 맨 위에 섞여 나왔습니다.
   */
  const scoped = useMemo(() => {
    const shown = nowOnly ? visible.filter((event) => !event.hidden) : visible;
    const open = shown.filter(isOpenEvent).sort(byOpenOrder);
    const closed = shown.filter((event) => event.done || event.canceled).sort(byDoneOrder);
    return [...open, ...closed];
  }, [visible, nowOnly]);
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const name of [...BASE_CATEGORIES, ...scoped.map((event) => event.category)]) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push(name);
    }
    return list;
  }, [scoped]);
  const categoryFiltered = category === "전체" ? scoped : scoped.filter((event) => event.category === category);
  /** A40: 완료와 취소는 함께 `완료` 영역에 — 취소는 완료로 세지 않고 그대로 표시합니다. */
  const completedCount = categoryFiltered.filter((event) => event.done && !event.canceled).length;
  const doneCount = categoryFiltered.filter((event) => event.done || event.canceled).length;
  const openCount = categoryFiltered.filter(isOpenEvent).length;
  const filtered = categoryFiltered.filter((event) => {
    if (filter === "ing") return isOpenEvent(event);
    if (filter === "done") return event.done || event.canceled;
    return true;
  });
  const total = categoryFiltered.length;
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    onCreate(title, category === "전체" ? "개인" : category);
    setDraft("");
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2" data-schedule-drawer-title="true">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-paper-200 text-ink-500">
            <CalendarIcon size={14} />
          </span>
          <span className="truncate">일정</span>
        </span>
      }
      subtitle="모든 분류의 일정"
      width="lg"
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary btn-xs">
            닫기
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-schedule-drawer="true">
        {/* A41: 일정 카드를 켜고 끄는 스위치 — 설정 → 프로젝트와 같은 값입니다. */}
        <div
          data-schedule-drawer-toggle="true"
          className="flex items-center justify-between gap-3 rounded-xl border border-paper-300 bg-paper-50/70 px-3 py-2"
        >
          <span className="min-w-0">
            <span className="block text-[calc(14.5px*var(--fs))] font-medium text-ink-800">일정 카드 표시</span>
            <span className="block text-[calc(13px*var(--fs))] text-ink-400">프로젝트 탭 맨 앞의 `일정` 카드를 켜고 끕니다</span>
          </span>
          <Switch
            checked={settings.showScheduleCard}
            onChange={(next) => setSetting("showScheduleCard", next)}
            label="일정 카드 표시"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[calc(14px*var(--fs))] text-ink-500">
            <span>
              완료 {doneCount} / 전체 {total}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-paper-200">
            <div className="h-full rounded-full bg-sage-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <Segmented<DrawerFilter>
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: `전체 ${categoryFiltered.length}` },
            { value: "ing", label: `진행 ${openCount}` },
            { value: "done", label: `완료·취소 ${doneCount}` },
          ]}
        />

        {/* 분류별 필터 — 이 서랍 안에서만 골라 봅니다. */}
        <div className="flex flex-wrap items-center gap-1" data-schedule-category-filter="true">
          {["전체", ...categories].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setCategory(name)}
              aria-pressed={category === name}
              data-schedule-category={name}
              className={cn(
                "rounded-full px-2 py-[2px] text-[calc(13.5px*var(--fs))] font-medium transition",
                category === name ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/80 hover:text-ink-800",
              )}
            >
              {name}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="아직 일정이 없습니다"
            description="아래 칸에 적고 Enter를 누르면 오늘 일정으로 담깁니다."
            icon={<PlusIcon size={20} />}
          />
        ) : (
          <ul className="divide-y divide-paper-300/40">
            {filtered.map((event) => {
              const done = event.done;
              return (
                <li key={event.id} className="flex items-start gap-2 py-1.5" data-schedule-drawer-event={event.id}>
                  <button
                    type="button"
                    onClick={() => onToggleDone(event)}
                    aria-label={done ? `${event.title} 완료 해제` : `${event.title} 완료`}
                    aria-pressed={done}
                    className={cn(
                      "mt-[3px] flex h-[16px] w-[16px] flex-none items-center justify-center rounded-[4px] border transition",
                      done ? "border-sage-400 bg-sage-400 text-white" : "border-paper-400 hover:border-ink-500",
                    )}
                  >
                    {done ? <CheckIcon size={9} /> : null}
                  </button>
                  <button type="button" onClick={() => onOpenEvent(event.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1">
                      <CategoryBadge category={event.category} />
                      <span
                        className={cn(
                          "break-keep text-[calc(15px*var(--fs))] leading-snug",
                          done || event.canceled ? "text-ink-400 line-through" : "text-ink-800",
                        )}
                      >
                        {event.title}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[calc(13px*var(--fs))] text-ink-400">{scheduleDateLabel(event)}</span>
                  </button>
                  {event.canceled ? <CancelPill /> : null}
                </li>
              );
            })}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex items-center gap-2 rounded-xl border border-paper-300 bg-paper-50/60 px-2 py-0.5"
        >
          <PlusIcon size={13} className="flex-none text-ink-400" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="일정을 적고 Enter"
            aria-label="일정 추가"
            className="min-w-0 flex-1 border-none bg-transparent px-1 py-1 text-[calc(15px*var(--fs))] outline-none placeholder:text-ink-400"
          />
          <button type="submit" disabled={!draft.trim()} className="btn-primary btn-xs flex-none whitespace-nowrap">
            추가
          </button>
        </form>

        <p className="text-[calc(13.5px*var(--fs))] leading-relaxed text-ink-400">
          일정을 프로젝트 카드로 끌어 놓으면 그 프로젝트의 할 일이 되고, 할 일을 일정 카드로 끌어 놓으면 일정이 됩니다.
        </p>
      </div>
    </Drawer>
  );
}
