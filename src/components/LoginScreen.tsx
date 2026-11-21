"use client";

import { useState } from "react";
import { useData } from "@/state/store";
import { LockIcon } from "@/components/icons";

export function LoginScreen() {
  const { login, loading } = useData();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await login(password);
    if (!result.ok) setError(result.message ?? "비밀번호가 맞지 않습니다.");
    setBusy(false);
  };

  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-paper-300 bg-white text-accent-500 shadow-soft">
            <LockIcon size={24} />
          </div>
          <h1 className="serif text-[26px] tracking-tight text-ink-900">나의 다이어리</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-500">
            소중한 기록을 지키기 위해
            <br />
            비밀번호를 한 번만 확인할게요.
          </p>
        </div>

        <form onSubmit={submit} className="card p-5">
          <label className="label" htmlFor="diary-password">
            비밀번호
          </label>
          <input
            id="diary-password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
            placeholder="••••••••"
          />
          {error ? <p className="mt-2 text-[15px] text-rose-600">{error}</p> : null}
          <button type="submit" disabled={busy || loading || password.length === 0} className="btn-primary mt-4 w-full py-2.5">
            {busy ? "확인 중…" : "들어가기"}
          </button>
        </form>

        <p className="mt-4 text-center text-[14px] leading-relaxed text-ink-400">
          이 비밀번호는 Vercel 환경변수 <span className="font-mono">DIARY_PASSWORD</span> 로 설정되어 있습니다.
        </p>

        <a
          href="/kit"
          className="mt-4 flex items-center justify-center gap-1 text-[14.5px] text-ink-500 underline decoration-paper-400 underline-offset-2 hover:text-ink-900"
        >
          내 다이어리 만들기 (공개 키트)
        </a>
      </div>
    </div>
  );
}
