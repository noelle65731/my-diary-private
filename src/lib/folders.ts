"use client";

import { useCallback, useEffect, useState } from "react";

/** A9: archive folders live in this browser — name + emoji, no Notion property needed. */
export interface ArchiveFolder {
  id: string;
  name: string;
  emoji: string;
}

const KEY = "my-diary:archive-folders:v1";

export function useArchiveFolders() {
  const [folders, setFolders] = useState<ArchiveFolder[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as ArchiveFolder[]) : [];
      if (Array.isArray(parsed)) setFolders(parsed.filter((folder) => folder?.name));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((next: ArchiveFolder[]) => {
    setFolders(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const add = useCallback(
    (name: string, emoji: string) => {
      const clean = name.trim().slice(0, 14);
      if (!clean) return;
      const folder: ArchiveFolder = { id: `folder-${clean}`, name: clean, emoji: emoji || "📁" };
      const next = [...folders.filter((item) => item.name !== clean), folder];
      persist(next);
    },
    [folders, persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist(folders.filter((folder) => folder.id !== id));
    },
    [folders, persist],
  );

  return { folders, add, remove };
}

export const FOLDER_EMOJIS = ["📁", "📚", "🎬", "🎧", "✈️", "🍳", "🧠", "🪴", "💡", "🗂️", "🎨", "🧾", "❤️", "⭐️"];
