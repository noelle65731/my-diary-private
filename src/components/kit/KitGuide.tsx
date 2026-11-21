"use client";

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DB_ENV_KEYS, DB_LABELS, DB_ORDER, DB_PROPERTIES, DB_PURPOSES, DB_SETUP_STEPS, KIT_VERSION } from "@/lib/db-meta";
import { buildInstallGuide, buildKitHtml, INSTALL_PROMPT, KIT_FILE_BASE, KIT_REPO, KIT_TITLE } from "@/lib/kit-content";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[calc(20px*var(--fs))] font-semibold tracking-[-0.02em] text-ink-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function saveFile(name: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function KitGuide() {
  const [copied, setCopied] = useState(false);
  const prompt = useMemo(() => INSTALL_PROMPT, []);

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      return;
    } catch {
      /* fall through to the manual selection below */
    }
    const area = document.createElement("textarea");
    area.value = prompt;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [prompt]);

  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-30 border-b border-paper-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-11 w-full max-w-[1080px] items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
          <a href="/" className="truncate text-[calc(15px*var(--fs))] font-semibold tracking-tight text-ink-900">
            {KIT_TITLE}
          </a>
          <a href="/" className="text-[calc(15px*var(--fs))] text-ink-500 hover:text-ink-900">
            내 다이어리로 돌아가기
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-4 pb-24 pt-6 md:px-6 md:pt-8 lg:px-8">
        <p className="text-[calc(14px*var(--fs))] tracking-[0.02em] text-ink-400">공개 배포용 · 내 다이어리 만들기</p>
        <h1 className="mt-1.5 text-[calc(30px*var(--fs))] font-semibold leading-tight tracking-[-0.035em] text-ink-900 md:text-[calc(34px*var(--fs))]">
          빈 노션 템플릿으로 내 다이어리 설치하기
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="chip border border-paper-300 bg-paper-50 text-ink-700">버전 {KIT_VERSION}</span>
          <span className="chip border border-paper-300 bg-paper-50 text-ink-700">제작자 · {KIT_TITLE} 키트</span>
          <span className="chip border border-paper-300 bg-paper-50 font-mono text-[calc(14px*var(--fs))] text-ink-500">{KIT_REPO}</span>
        </div>

        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[calc(15px*var(--fs))] leading-relaxed text-amber-800">
          이 키트에는 <b>제작자의 노션 계정·비밀번호·DB ID·비밀 키가 들어 있지 않습니다.</b> 빈 노션 DB 다섯 개를 직접 만들고,
          내 서버 환경변수에 내 ID만 넣어 설치합니다.
        </p>

        <nav className="mt-5 flex flex-wrap gap-1.5">
          {[
            { href: "#template", label: "1. 노션 템플릿" },
            { href: "#server", label: "2. 서버·환경변수" },
            { href: "#steps", label: "3. 설치 순서" },
            { href: "#download", label: "4. 파일 받기" },
            { href: "#prompt", label: "5. AI 지시문" },
          ].map((item) => (
            <a key={item.href} href={item.href} className="chip-button chip border border-paper-300">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-9">
          <Section id="template" title="1. 빈 Notion 템플릿 구성 (DB 5개)">
            <p className="mb-3 text-[calc(15px*var(--fs))] leading-relaxed text-ink-600">
              다섯 개 DB를 새로 만들고 <b>속성 이름과 타입을 그대로</b> 맞춰 주세요. 이름이 다르면 그 값은 저장되지 않습니다. 각
              DB에서 <span className="font-mono">···</span> → Connections 에 내 통합을 추가해야 앱이 읽을 수 있습니다.
            </p>
            <div className="space-y-3">
              {DB_ORDER.map((resource) => (
                <div key={resource} className="card overflow-hidden">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-paper-300/70 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[calc(16px*var(--fs))] font-semibold text-ink-900">{DB_LABELS[resource]}</p>
                      <p className="mt-0.5 text-[calc(14px*var(--fs))] text-ink-500">{DB_PURPOSES[resource]}</p>
                    </div>
                    <span className="font-mono text-[calc(14px*var(--fs))] text-ink-500">{DB_ENV_KEYS[resource]}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[calc(15px*var(--fs))]">
                      <thead>
                        <tr className="text-[calc(14px*var(--fs))] text-ink-400">
                          <th className="px-3.5 py-1.5 font-medium">속성 이름</th>
                          <th className="px-3.5 py-1.5 font-medium">타입</th>
                          <th className="px-3.5 py-1.5 font-medium">값 / 비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DB_PROPERTIES[resource].map((property) => (
                          <tr key={property.name} className="border-t border-paper-300/60 text-ink-700">
                            <td className="whitespace-nowrap px-3.5 py-1.5 text-ink-900">{property.name}</td>
                            <td className="whitespace-nowrap px-3.5 py-1.5 font-mono text-[calc(14px*var(--fs))] text-ink-500">{property.type}</td>
                            <td className="px-3.5 py-1.5 text-ink-500">{property.detail ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="server" title="2. 서버 연동 파일과 환경변수">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="card p-3.5">
                <p className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">서버 연동 파일</p>
                <ul className="mt-2 space-y-1.5 text-[calc(15px*var(--fs))] leading-relaxed text-ink-600">
                  <li>
                    <span className="font-mono text-ink-800">src/lib/notion.ts</span> — 서버 전용 Notion REST 클라이언트. 토큰은
                    여기서만 쓰입니다.
                  </li>
                  <li>
                    <span className="font-mono text-ink-800">src/lib/notion-map.ts</span> — 속성 이름 ↔ 데이터 변환.
                  </li>
                  <li>
                    <span className="font-mono text-ink-800">src/lib/db-config.ts</span> — 환경변수 → DB ID. 비어 있으면 미연결.
                  </li>
                  <li>
                    <span className="font-mono text-ink-800">src/app/api/status</span>,{" "}
                    <span className="font-mono text-ink-800">src/app/api/notion/*</span> — 연결 상태·조회·저장 라우트.
                  </li>
                </ul>
              </div>
              <div className="card p-3.5">
                <p className="text-[calc(15px*var(--fs))] font-semibold text-ink-900">환경변수</p>
                <ul className="mt-2 space-y-1 text-[calc(14px*var(--fs))] text-ink-600">
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-ink-800">NOTION_TOKEN</span>
                    <span className="text-ink-500">내 통합 토큰 (필수)</span>
                  </li>
                  {DB_ORDER.map((resource) => (
                    <li key={resource} className="flex items-baseline justify-between gap-2">
                      <span className="break-all font-mono text-ink-800">{DB_ENV_KEYS[resource]}</span>
                      <span className="flex-none text-ink-500">{DB_LABELS[resource]}</span>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-ink-800">DIARY_PASSWORD</span>
                    <span className="text-ink-500">접속 비밀번호 (권장)</span>
                  </li>
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-ink-800">DIARY_SESSION_SECRET</span>
                    <span className="text-ink-500">세션 키 (선택)</span>
                  </li>
                </ul>
                <p className="mt-2 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
                  모든 DB ID를 비워 두어도 앱은 뜹니다. 이때 각 DB는 &lsquo;미연결&rsquo;로 표시되고 조회가 비며 저장이
                  중단됩니다.
                </p>
              </div>
            </div>
          </Section>

          <Section id="steps" title="3. 설치 순서">
            <ol className="space-y-2 text-[calc(15px*var(--fs))] leading-relaxed text-ink-600">
              {DB_SETUP_STEPS.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-paper-200 text-[calc(14px*var(--fs))] font-semibold text-ink-700">
                    {index + 1}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
              <li className="flex gap-2">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-paper-200 text-[calc(14px*var(--fs))] font-semibold text-ink-700">
                  6
                </span>
                <span className="min-w-0">
                  배포 주소에 접속 → 설정(톱니) → <b>연결</b> 탭에서 다섯 개 DB가 모두 <b>연결됨</b>인지 확인합니다. 하나라도
                  미연결·오류면 그 DB의 Connections 와 ID를 다시 확인합니다.
                </span>
              </li>
            </ol>
          </Section>

          <Section id="download" title="4. 파일로 받기">
            <p className="mb-3 text-[calc(15px*var(--fs))] leading-relaxed text-ink-600">
              오프라인에서 보거나 다른 AI·다른 사람에게 그대로 전달할 때 쓰세요. 두 파일 모두 이 페이지와 같은 내용이며 개인 정보는
              들어 있지 않습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => saveFile(`${KIT_FILE_BASE}.html`, buildKitHtml(), "text/html;charset=utf-8")}
                className="btn-primary btn-xs"
              >
                HTML 키트 가이드 내려받기
              </button>
              <button
                type="button"
                onClick={() => saveFile(`${KIT_FILE_BASE}-install.md`, buildInstallGuide(), "text/markdown;charset=utf-8")}
                className="btn-outline btn-xs"
              >
                설치 가이드 (Markdown) 내려받기
              </button>
              <button
                type="button"
                onClick={() =>
                  saveFile(`${KIT_FILE_BASE}-install-prompt.txt`, INSTALL_PROMPT, "text/plain;charset=utf-8")
                }
                className="btn-outline btn-xs"
              >
                AI 설치 지시문 (txt) 내려받기
              </button>
            </div>
          </Section>

          <Section id="prompt" title="5. 다른 AI에 붙여넣을 설치 지시문">
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-300/70 px-3.5 py-2.5">
                <p className="text-[calc(14.5px*var(--fs))] text-ink-500">
                  아래 내용을 그대로 복사해 ChatGPT·Claude 등에 붙여 넣으면 순서대로 안내합니다.
                </p>
                <button type="button" onClick={() => void copyPrompt()} className={cn("btn-xs", copied ? "btn-primary" : "btn-outline")}>
                  {copied ? "복사됨" : "전체 복사"}
                </button>
              </div>
              <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap break-words px-3.5 py-3 text-[calc(14px*var(--fs))] leading-relaxed text-ink-700">
                {prompt}
              </pre>
            </div>
          </Section>
        </div>

        <footer className="mt-10 border-t border-paper-300 pt-4 text-[calc(14px*var(--fs))] leading-relaxed text-ink-400">
          {KIT_TITLE} 키트 {KIT_VERSION} · 개인용으로 만든 키트입니다. 내 워크스페이스에 복제해 자유롭게 쓰세요. 검색 엔진에는
          노출되지 않습니다.
        </footer>
      </main>
    </div>
  );
}
