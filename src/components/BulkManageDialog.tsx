"use client";

import { useMemo, useState } from "react";
import { useData } from "@/state/store";
import { useUi } from "@/state/ui";
import { useCategoryOptions } from "@/state/categories";
import { useEventColors } from "@/state/event-colors";
import { Modal, Segmented } from "@/components/common/primitives";
import { TrashIcon } from "@/components/icons";
import { EVENT_COLORS, type EventColorKey } from "@/components/common/event-colors";
import { useCategoryColors } from "@/state/category-colors";
import { taskTone } from "@/components/common/tone";
import { cn } from "@/lib/utils";
import { formatShort, timeRangeLabel, weekdayKo } from "@/lib/date";
import type { CalendarEvent, ProjectTask } from "@/lib/types";

/**
 * A40: `일괄 관리` — 일정과 할 일을 한 표에서 골라 색·분류·완료·날짜·삭제를 한 번에 바꿉니다.
 * 검색 화면(SearchDialog)은 그대로 두고, 이 창은 여러 항목을 고쳐 쓰는 일만 합니다.
 * 모바일은 체크할 수 있는 좁은 카드 목록, PC는 노션 표처럼 열을 맞춘 목록입니다.
 */

type RowKind = "일정" | "할 일";
type RowStatus = "미완료" | "완료" | "취소" | "대기 중";

interface Row {
  key: string;
  resource: "calendar" | "projects";
  id: string;
  kind: RowKind;
  title: string;
  category: string;
  date: string | null;
  time: string;
  status: RowStatus;
  memo: string;
}

type TypeFilter = "all" | "event" | "task";
type StatusFilter = "all" | RowStatus;

function eventRow(event: CalendarEvent): Row {
  return {
    key: `calendar:${event.id}`,
    resource: "calendar",
    id: event.id,
    kind: "일정",
    title: event.title,
    category: event.category,
    date: event.date || null,
    time: event.allDay ? "" : timeRangeLabel(event.startTime, event.endTime),
    status: event.canceled ? "취소" : event.done ? "완료" : "미완료",
    memo: event.memo,
  };
}

function taskRow(task: ProjectTask): Row {
  return {
    key: `projects:${task.id}`,
    resource: "projects",
    id: task.id,
    kind: "할 일",
    title: task.title,
    category: task.category,
    date: task.date ?? task.due ?? null,
    time: task.date ? timeRangeLabel(task.startTime, task.endTime) : "",
    status: task.status,
    memo: task.memo,
  };
}

function statusChipClass(status: RowStatus): string {
  if (status === "취소") return "bg-ink-900/[0.12] text-ink-800";
  if (status === "완료") return "bg-sage-100 text-sage-600";
  if (status === "대기 중") return "bg-amber-100 text-amber-700";
  return "bg-paper-200 text-ink-500";
}

export function BulkManageDialog() {
  const { data, update, remove } = useData();
  const { bulkOpen, setBulkOpen, notify } = useUi();
  const categories = useCategoryOptions();
  const categoryColor = useCategoryColors();
  const { setColor } = useEventColors();

  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [category, setCategory] = useState("전체");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"none" | "color" | "category">("none");
  const [moveDate, setMoveDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = useMemo(() => {
    const list: Row[] = [
      ...data.calendar.filter((event) => event.kind === "일정" && !event.trash).map(eventRow),
      ...data.projects.filter((task) => task.kind === "할 일" && !task.trash).map(taskRow),
    ];
    return list.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title));
  }, [data.calendar, data.projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (type === "event" && row.kind !== "일정") return false;
      if (type === "task" && row.kind !== "할 일") return false;
      if (category !== "전체" && row.category !== category) return false;
      if (status !== "all" && row.status !== status) return false;
      if (from && (!row.date || row.date < from)) return false;
      if (to && (!row.date || row.date > to)) return false;
      if (q && !`${row.title} ${row.memo} ${row.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, type, category, status, from, to]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedRows = useMemo(() => rows.filter((row) => selectedSet.has(row.key)), [rows, selectedSet]);
  const allChecked = filtered.length > 0 && filtered.every((row) => selectedSet.has(row.key));
  const someChecked = filtered.some((row) => selectedSet.has(row.key));
  const eventsSelected = selectedRows.filter((row) => row.resource === "calendar").length;

  const toggleRow = (key: string) =>
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  const toggleAll = () =>
    setSelected(allChecked ? [] : [...new Set([...selected, ...filtered.map((row) => row.key)])]);

  const close = () => {
    setBulkOpen(false);
    setConfirmDelete(false);
    setPanel("none");
  };

  const apply = async (work: (row: Row) => Promise<unknown>, after: () => void) => {
    if (busy || selectedRows.length === 0) return;
    setBusy(true);
    try {
      for (const row of selectedRows) await work(row);
      after();
    } finally {
      setBusy(false);
    }
  };

  const applyColor = (key: EventColorKey) =>
    apply(
      async (row) => {
        if (row.resource !== "calendar") return;
        setColor(row.id, key);
      },
      () => {
        setPanel("none");
        notify(`${eventsSelected}개 일정의 색을 바꿨습니다.`, "success");
      },
    );

  const applyCategory = (name: string) =>
    apply(
      async (row) => {
        await update(row.resource, row.id, { category: name });
      },
      () => {
        setPanel("none");
        notify(`${selectedRows.length}개 항목의 분류를 '${name}'으로 바꿨습니다.`, "success");
      },
    );

  const applyDone = (done: boolean) =>
    apply(
      async (row) => {
        if (row.status === "취소") return;
        if (row.resource === "calendar") {
          await update("calendar", row.id, { done });
        } else {
          await update("projects", row.id, {
            status: done ? "완료" : "미완료",
            doneAt: done ? new Date().toISOString().slice(0, 10) : null,
          });
        }
      },
      () => notify(`${selectedRows.length}개 항목을 ${done ? "완료" : "미완료"}로 바꿨습니다.`, "success"),
    );

  const applyDate = () =>
    apply(
      async (row) => {
        if (!moveDate) return;
        await update(row.resource, row.id, { date: moveDate });
      },
      () => {
        notify(`${selectedRows.length}개 항목의 날짜를 ${formatShort(moveDate)}로 옮겼습니다.`, "success");
        setMoveDate("");
      },
    );

  const applyDelete = () =>
    apply(
      async (row) => {
        await remove(row.resource, row.id);
      },
      () => {
        setConfirmDelete(false);
        setSelected([]);
        notify(`${selectedRows.length}개 항목을 휴지통으로 보냈습니다.`, "success");
      },
    );

  return (
    <Modal
      open={bulkOpen}
      onClose={close}
      size="xl"
      title={
        <span data-bulk-title="true" className="flex items-center gap-2">
          일괄 관리
          <span className="rounded-full bg-paper-200 px-2 py-0.5 text-[calc(12.5px*var(--fs))] font-normal text-ink-500">
            일정 {rows.filter((row) => row.kind === "일정").length} · 할 일 {rows.length - rows.filter((row) => row.kind === "일정").length}
          </span>
        </span>
      }
      subtitle="여러 항목을 골라 색·분류·완료·날짜를 한 번에 바꿉니다"
      footer={
        <div data-bulk-bar="true" className="space-y-2">
          {panel === "color" ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white px-2 py-1.5" data-bulk-color-panel="true">
              <span className="text-[calc(13px*var(--fs))] text-ink-400">색</span>
              {EVENT_COLORS.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  data-bulk-color={choice.key}
                  onClick={() => void applyColor(choice.key)}
                  disabled={busy || eventsSelected === 0}
                  title={choice.key === "default" ? "색 없음(분류 기본색)" : choice.label}
                  aria-label={choice.label}
                  className={cn("h-6 w-6 rounded-full border border-black/5 transition hover:scale-110", choice.swatch)}
                />
              ))}
              {eventsSelected === 0 ? (
                <span className="text-[calc(12.5px*var(--fs))] text-ink-400">일정을 하나 이상 골라야 색이 바뀝니다</span>
              ) : null}
            </div>
          ) : null}

          {panel === "category" ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white px-2 py-1.5" data-bulk-category-panel="true">
              <span className="text-[calc(13px*var(--fs))] text-ink-400">분류</span>
              {categories.map((name) => (
                <button
                  key={name}
                  type="button"
                  data-bulk-set-category={name}
                  onClick={() => void applyCategory(name)}
                  disabled={busy}
                  className={cn(
                    "rounded-full px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium transition",
                    categoryColor.toneOf(name, taskTone(name)).soft,
                    categoryColor.toneOf(name, taskTone(name)).text,
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <span data-bulk-count="true" className="mr-1 text-[calc(13.5px*var(--fs))] font-medium text-ink-700">
              {selectedRows.length}개 선택
            </span>
            <button type="button" data-bulk-action="color" onClick={() => setPanel(panel === "color" ? "none" : "color")} disabled={busy || selectedRows.length === 0} className="btn-outline btn-xs">
              색
            </button>
            <button type="button" data-bulk-action="category" onClick={() => setPanel(panel === "category" ? "none" : "category")} disabled={busy || selectedRows.length === 0} className="btn-outline btn-xs">
              분류
            </button>
            <button type="button" data-bulk-action="done" onClick={() => void applyDone(true)} disabled={busy || selectedRows.length === 0} className="btn-outline btn-xs">
              완료
            </button>
            <button type="button" data-bulk-action="undone" onClick={() => void applyDone(false)} disabled={busy || selectedRows.length === 0} className="btn-outline btn-xs">
              미완료
            </button>
            <span className="mx-0.5 h-4 w-px bg-paper-300" aria-hidden />
            <input
              type="date"
              aria-label="옮길 날짜"
              data-bulk-move-date="true"
              value={moveDate}
              onChange={(event) => setMoveDate(event.target.value)}
              className="rounded-lg bg-paper-200 px-2 py-1 text-[calc(13px*var(--fs))] tabular-nums text-ink-800 focus:bg-white focus:outline-none"
            />
            <button type="button" data-bulk-action="move" onClick={() => void applyDate()} disabled={busy || !moveDate || selectedRows.length === 0} className="btn-outline btn-xs">
              날짜 이동
            </button>
            <span className="ml-auto" />
            {confirmDelete ? (
              <>
                <button type="button" data-bulk-action="delete-confirm" onClick={() => void applyDelete()} disabled={busy} className="btn btn-xs bg-rose-600 text-white hover:bg-rose-700">
                  {selectedRows.length}개 삭제
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="btn-ghost btn-xs">
                  취소
                </button>
              </>
            ) : (
              <button
                type="button"
                data-bulk-action="delete"
                onClick={() => setConfirmDelete(true)}
                disabled={busy || selectedRows.length === 0}
                className="btn-ghost btn-xs text-rose-500 hover:bg-rose-50"
              >
                <TrashIcon size={12} /> 삭제
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3" data-bulk-manage="true">
        {/* 필터 — 검색어 · 유형 · 분류 · 상태 · 기간 */}
        <div className="space-y-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목·기타·분류로 찾기"
            aria-label="일괄 관리 검색"
            data-bulk-search="true"
            className="input h-8 w-full py-0 text-[calc(14px*var(--fs))]"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Segmented<TypeFilter>
              value={type}
              onChange={(next) => {
                setType(next);
                setSelected([]);
              }}
              size="sm"
              options={[
                { value: "all", label: "전체" },
                { value: "event", label: "일정" },
                { value: "task", label: "할 일" },
              ]}
            />
            <Segmented<StatusFilter>
              value={status}
              onChange={setStatus}
              size="sm"
              options={[
                { value: "all", label: "상태 전체" },
                { value: "미완료", label: "미완료" },
                { value: "완료", label: "완료" },
                { value: "대기 중", label: "대기" },
                { value: "취소", label: "취소" },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1" data-bulk-categories="true">
            {["전체", ...categories].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                aria-pressed={category === name}
                className={cn(
                  "rounded-full px-2 py-[2px] text-[calc(13px*var(--fs))] font-medium transition",
                  category === name ? "bg-ink-900 text-white" : "bg-paper-200 text-ink-500 hover:bg-paper-300/80 hover:text-ink-800",
                )}
              >
                {name}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-1 text-[calc(13px*var(--fs))] text-ink-400">
              <input
                type="date"
                aria-label="기간 시작"
                data-bulk-from="true"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="rounded-lg bg-paper-200 px-1.5 py-0.5 tabular-nums text-ink-700 focus:bg-white focus:outline-none"
              />
              ~
              <input
                type="date"
                aria-label="기간 끝"
                data-bulk-to="true"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="rounded-lg bg-paper-200 px-1.5 py-0.5 tabular-nums text-ink-700 focus:bg-white focus:outline-none"
              />
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 border-y border-paper-300/70 bg-paper-50/60 px-2 py-1.5">
          <label className="flex cursor-pointer items-center gap-1.5 text-[calc(13.5px*var(--fs))] text-ink-600">
            <input
              type="checkbox"
              data-bulk-all="true"
              checked={allChecked}
              ref={(node) => {
                if (node) node.indeterminate = !allChecked && someChecked;
              }}
              onChange={toggleAll}
              className="h-3.5 w-3.5 accent-ink-900"
            />
            전체 선택
          </label>
          <span className="text-[calc(13px*var(--fs))] text-ink-400" data-bulk-filtered-count="true">
            {filtered.length}개
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl bg-paper-200/50 px-3 py-8 text-center text-[calc(14.5px*var(--fs))] text-ink-400">
            조건에 맞는 항목이 없습니다.
          </p>
        ) : (
          <>
            {/* PC: 노션 표처럼 열을 맞춘 목록 */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-[1.6rem_minmax(0,1fr)_3.6rem_5rem_7rem_4.2rem] items-center gap-2 border-b border-paper-300/70 px-1 pb-1 text-[calc(12.5px*var(--fs))] text-ink-400">
                <span />
                <span>제목</span>
                <span>유형</span>
                <span>분류</span>
                <span>날짜</span>
                <span>상태</span>
              </div>
              <ul className="divide-y divide-paper-300/50">
                {filtered.map((row) => {
                  const checked = selectedSet.has(row.key);
                  return (
                    <li
                      key={row.key}
                      data-bulk-row={row.key}
                      className={cn(
                        "grid grid-cols-[1.6rem_minmax(0,1fr)_3.6rem_5rem_7rem_4.2rem] items-center gap-2 px-1 py-1.5 transition",
                        checked && "bg-accent-50/60",
                      )}
                    >
                      <input
                        type="checkbox"
                        aria-label={`${row.title} 선택`}
                        checked={checked}
                        onChange={() => toggleRow(row.key)}
                        className="h-3.5 w-3.5 accent-ink-900"
                      />
                      <span className={cn("truncate text-[calc(14.5px*var(--fs))] text-ink-800", row.status === "취소" && "text-ink-500 line-through")}>
                        {row.title}
                      </span>
                      <span className="text-[calc(12.5px*var(--fs))] text-ink-500">{row.kind}</span>
                      <span className="truncate text-[calc(12.5px*var(--fs))] text-ink-500">{row.category}</span>
                      <span className="truncate text-[calc(12.5px*var(--fs))] tabular-nums text-ink-400">
                        {row.date ? `${formatShort(row.date)} ${weekdayKo(row.date)}${row.time ? ` ${row.time}` : ""}` : ""}
                      </span>
                      <span className={cn("w-fit rounded px-1 text-[calc(11.5px*var(--fs))] font-medium leading-[1.6]", statusChipClass(row.status))}>
                        {row.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* 모바일: 체크할 수 있는 좁은 카드 */}
            <ul className="space-y-1.5 sm:hidden">
              {filtered.map((row) => {
                const checked = selectedSet.has(row.key);
                return (
                  <li
                    key={row.key}
                    data-bulk-card={row.key}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border px-2 py-1.5 transition",
                      checked ? "border-accent-300 bg-accent-50/60" : "border-paper-300 bg-white",
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${row.title} 선택`}
                      checked={checked}
                      onChange={() => toggleRow(row.key)}
                      className="mt-[3px] h-4 w-4 flex-none accent-ink-900"
                    />
                    <button type="button" onClick={() => toggleRow(row.key)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-1">
                        <span className={cn("truncate text-[calc(14.5px*var(--fs))] text-ink-800", row.status === "취소" && "text-ink-500 line-through")}>
                          {row.title}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[calc(12.5px*var(--fs))] text-ink-400">
                        <span>{row.kind}</span>
                        <span>· {row.category}</span>
                        {row.date ? (
                          <span>
                            · {formatShort(row.date)} {weekdayKo(row.date)}
                            {row.time ? ` ${row.time}` : ""}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <span className={cn("mt-[1px] flex-none rounded px-1 text-[calc(11.5px*var(--fs))] font-medium leading-[1.6]", statusChipClass(row.status))}>
                      {row.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
