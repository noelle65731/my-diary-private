"use client";

/**
 * A51: 아카이브에 붙이는 사진 한 장.
 *
 * 입력 바의 사진 아이콘(휴대폰은 앨범·카메라 선택), PC 의 끌어다 놓기, Ctrl+V 붙여넣기가
 * 모두 이 한 곳을 지나갑니다. 사진은 화면에서 1600px·JPEG 로 줄여 `/api/upload` 로 올리고,
 * 노션이 돌려준 `upload:` 토큰을 기록의 `사진` 속성에 넣습니다.
 */

import { useCallback, useRef, useState } from "react";
import { useData } from "@/state/store";
import { useUi } from "@/state/ui";
import { compressPhoto, rememberUpload } from "@/components/common/PhotoField";

export function usePhotoAttach(photos: string[], onPhotosChange: (photos: string[]) => void) {
  const { demo } = useData();
  const { notify } = useUi();
  const [busy, setBusy] = useState(0);
  /** 연달아 붙일 때 앞의 사진이 덮어써지지 않도록 최신 목록을 들고 있습니다. */
  const latest = useRef<string[]>(photos);
  latest.current = photos;

  const append = useCallback(
    (value: string) => {
      latest.current = [...latest.current, value];
      onPhotosChange(latest.current);
    },
    [onPhotosChange],
  );

  const add = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        notify("사진 파일(jpg · png · heic)을 골라 주세요.", "error");
        return;
      }
      setBusy((count) => count + 1);
      try {
        const packed = await compressPhoto(file);
        if (!packed) {
          notify("사진을 줄이지 못했습니다. 다른 사진으로 시도해 주세요.", "error");
          return;
        }
        if (demo) {
          append(packed.preview);
          return;
        }
        const form = new FormData();
        form.append("file", new File([packed.blob], packed.name, { type: "image/jpeg" }), packed.name);
        const response = await fetch("/api/upload", { method: "POST", body: form });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; data?: { token?: string }; error?: { message?: string } }
          | null;
        if (!response.ok || !payload?.ok || !payload.data?.token) {
          notify(payload?.error?.message ?? "사진을 올리지 못했습니다.", "error");
          return;
        }
        rememberUpload(payload.data.token, packed.preview);
        append(payload.data.token);
      } finally {
        setBusy((count) => Math.max(0, count - 1));
      }
    },
    [append, demo, notify],
  );

  const addFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      if (!files) return;
      for (const file of Array.from(files)) await add(file);
    },
    [add],
  );

  return { add, addFiles, busy: busy > 0 };
}
