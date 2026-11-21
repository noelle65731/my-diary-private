"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { XIcon } from "@/components/icons";
import type { ProjectTask } from "@/lib/types";

export function TagInput({
  tags,
  onChange,
  placeholder = "태그 입력 후 Enter",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim().replace(/^#/, "");
    if (!value) return;
    if (!tags.includes(value)) onChange([...tags, value]);
    setDraft("");
  };

  return (
    <div className="rounded-xl border border-paper-400/90 bg-white/80 px-2 py-1.5 focus-within:border-accent-300 focus-within:ring-2 focus-within:ring-accent-100">
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span key={tag} className="chip border border-paper-300 bg-paper-100 text-ink-600">
            #{tag}
            <button type="button" onClick={() => onChange(tags.filter((value) => value !== tag))} aria-label={`${tag} 삭제`}>
              <XIcon size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            } else if (event.key === "Backspace" && !draft && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[6rem] flex-1 border-none bg-transparent px-1 py-0.5 text-[15px] outline-none placeholder:text-ink-400"
        />
      </div>
    </div>
  );
}

export function ProjectPicker({
  projects,
  value,
  onChange,
  onCreate,
}: {
  projects: ProjectTask[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Notion에 프로젝트를 새로 만들고 바로 연결합니다. */
  onCreate?: (title: string) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // A6: a project in History is not offered for new tasks.
  const available = projects.filter((project) => !project.history);

  const commit = async () => {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    setBusy(true);
    const id = await onCreate?.(title);
    setBusy(false);
    setAdding(false);
    setDraft("");
    if (id) onChange([...value.filter((item) => item !== id), id]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {available.length === 0 && !onCreate ? <p className="text-[15px] text-ink-400">연결할 프로젝트가 아직 없습니다.</p> : null}
      {available.map((project) => {
        const active = value.includes(project.id);
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onChange(active ? value.filter((id) => id !== project.id) : [...value, project.id])}
            className={cn(
              "chip border transition",
              active ? "border-accent-300 bg-accent-100 text-accent-600" : "border-paper-400 bg-white/60 text-ink-500 hover:border-ink-400",
            )}
          >
            {project.title}
          </button>
        );
      })}
      {onCreate ? (
        adding ? (
          <input
            autoFocus
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commit();
              }
              if (event.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            onBlur={() => void commit()}
            placeholder={busy ? "만드는 중…" : "새 프로젝트 이름"}
            aria-label="새 프로젝트 만들기"
            className="input h-7 w-[8.5rem] py-0 text-[14px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="새 프로젝트 만들기"
            className="inline-flex h-[26px] items-center gap-0.5 rounded-full border border-dashed border-paper-400 px-2 text-[14px] text-ink-500 transition hover:border-ink-500 hover:text-ink-900"
          >
            <span className="text-[15px] leading-none">+</span> 새 프로젝트
          </button>
        )
      ) : null}
    </div>
  );
}

export function EditorFooter({
  onClose,
  onSave,
  onDelete,
  onRestore,
  trashed,
  saveLabel = "저장",
  children,
}: {
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  trashed?: boolean;
  saveLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        {onDelete && !trashed ? (
          <button type="button" onClick={onDelete} className="btn-ghost btn-xs text-rose-500 hover:bg-rose-50">
            삭제
          </button>
        ) : null}
        {trashed && onRestore ? (
          <button type="button" onClick={onRestore} className="btn-outline btn-xs">
            휴지통에서 복원
          </button>
        ) : null}
        {children}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="btn-ghost btn-xs">
          닫기
        </button>
        <button type="button" onClick={onSave} className="btn-primary btn-xs px-4">
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[14.5px] text-rose-600">{message}</p>;
}
