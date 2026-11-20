/**
 * Content of the public kit page (`/kit`) and of the two downloadable guides.
 *
 * Everything here is meant to be public: it describes the empty Notion
 * template, the environment variables and the install steps. It must never
 * contain a Notion token, a database ID, a password or any other secret.
 */

import { DB_ENV_KEYS, DB_LABELS, DB_ORDER, DB_PROPERTIES, DB_PURPOSES, DB_SETUP_STEPS, KIT_VERSION } from "./db-meta";

export const KIT_TITLE = "나의 다이어리";
export const KIT_REPO = "github.com/noelle65731/my-diary-private";
export const KIT_FILE_BASE = `my-diary-kit-${KIT_VERSION}`;

const PROPERTY_LINES: string[] = DB_ORDER.flatMap((resource) => [
  `### ${DB_LABELS[resource]} (${DB_ENV_KEYS[resource]})`,
  `용도: ${DB_PURPOSES[resource]}`,
  ...DB_PROPERTIES[resource].map(
    (property) => `- ${property.name} — ${property.type}${property.detail ? ` (${property.detail})` : ""}`,
  ),
  "",
]);

/** The Korean instruction block a person can paste into any other AI. */
export const INSTALL_PROMPT = [
  `아래 내용대로 내 노션 계정에 "${KIT_TITLE}" 키트(${KIT_VERSION})를 설치해 줘.`,
  "코드는 GitHub 저장소 " + KIT_REPO + " 를 쓴다. 저장소가 비공개라 열 수 없으면, 소유자에게 받은 키트 HTML 파일을 읽고 같은 순서로 진행해 줘.",
  "제작자의 계정·비밀번호·DB ID·비밀 키는 어디에도 쓰지 마. 모든 ID와 비밀번호는 내 워크스페이스에서 새로 만든다.",
  "내가 직접 해야 하는 일(노션 로그인, 통합 만들기, 배포 버튼)은 한 단계씩 물어보고, 내가 답하면 다음 단계로 넘어가 줘.",
  "",
  "[목표]",
  "내 노션 워크스페이스에 빈 DB 5개를 만들고, 그 ID를 서버 환경변수에 넣어 나만의 다이어리 웹앱을 배포한다.",
  "",
  "[1] 노션 준비",
  "1. notion.so/my-integrations 에서 Internal Integration 을 만들고 토큰을 복사한다. 이름은 '나의 다이어리'로 한다.",
  "2. 내 워크스페이스에 아래 다섯 개 DB를 새로 만든다. DB 이름과 속성 이름·타입을 표와 똑같이 맞춘다. 속성 이름이 다르면 값이 저장되지 않는다.",
  `   ${DB_ORDER.map((resource) => DB_LABELS[resource]).join(" / ")}`,
  "3. 각 DB에서 ··· → Connections → 방금 만든 통합을 추가한다. (이 단계를 빠뜨리면 API가 404로 답한다.)",
  "4. 각 DB 주소의 32자리 ID를 적어 둔다. (https://www.notion.so/<워크스페이스>/<DB_ID>?v=… 의 <DB_ID>)",
  "",
  "[2] 코드 배포",
  "1. 저장소를 내 GitHub 계정으로 복제(fork 또는 clone)한다.",
  "2. Vercel → New Project → 저장소 선택. Framework는 Next.js(자동 감지), Node 20.",
  "3. Environment Variables 에 아래 값을 넣는다.",
  "   NOTION_TOKEN=<내 통합 토큰>",
  ...DB_ORDER.map((resource) => `   ${DB_ENV_KEYS[resource]}=<내 ${DB_LABELS[resource]} DB ID>`),
  "   DIARY_PASSWORD=<내가 정한 비밀번호>",
  "4. Deploy → 배포 주소에 접속 → 비밀번호 입력 → 설정(톱니) → 연결 탭에서 다섯 개 DB가 모두 '연결됨'인지 확인한다.",
  "5. 하나라도 '미연결'이나 '오류'면 그 DB의 Connections 와 ID를 다시 확인한다. 미연결 DB는 조회가 비고 저장이 중단된다.",
  "",
  "[3] 확인",
  "- /api/status 응답의 dbs 에서 다섯 개 모두 configured=true, ok=true 인지 확인한다.",
  "- 각 화면(캘린더·프로젝트·바인더·아카이브)에서 항목을 하나씩 만들고, 내 노션의 해당 DB에 행이 생기는지 확인한다.",
  "- 비밀번호를 잊었을 때를 대비해 DIARY_PASSWORD 를 어디에 적어 두었는지 나에게 알려 준다.",
  "",
  "[속성표]",
  ...PROPERTY_LINES,
  "[주의]",
  "- 토큰과 DB ID는 서버 환경변수에만 둔다. 브라우저 코드·HTML·채팅에 붙여 넣지 않는다.",
  "- 이 키트에는 제작자의 노션 계정, 비밀번호, DB ID, 비밀 키가 들어 있지 않다. 빈 DB를 내가 새로 만드는 것이 전제다.",
].join("\n");

/** Markdown version of the install guide, for saving as a file. */
export function buildInstallGuide(): string {
  return [
    `# ${KIT_TITLE} 설치 가이드 (${KIT_VERSION})`,
    "",
    `- 제작자: ${KIT_TITLE} 키트`,
    `- 버전: ${KIT_VERSION}`,
    `- 저장소: ${KIT_REPO}`,
    "",
    "> 이 문서에는 제작자의 노션 계정·비밀번호·DB ID·비밀 키가 없습니다. 빈 Notion DB를 직접 만들어 연결합니다.",
    "",
    "## 1. 준비물",
    "- 노션 계정과 빈 워크스페이스(또는 새 페이지 영역)",
    "- GitHub 계정, Vercel 계정 (무료 플랜 가능)",
    "- Node.js 20 이상 (로컬에서 빌드해 볼 때)",
    "",
    "## 2. 빈 Notion 템플릿 구성",
    ...PROPERTY_LINES.flatMap((line) => (line === "" ? [""] : [line])),
    "## 3. 서버 연동 파일과 환경변수",
    "서버에서만 쓰는 값입니다. 브라우저 코드에 넣지 마세요.",
    "",
    "| 환경변수 | 설명 |",
    "| --- | --- |",
    "| `NOTION_TOKEN` | notion.so/my-integrations 에서 만든 내부 통합 토큰 |",
    ...DB_ORDER.map((resource) => `| \`${DB_ENV_KEYS[resource]}\` | ${DB_LABELS[resource]} — ${DB_PURPOSES[resource]} |`),
    "| `DIARY_PASSWORD` | 접속 비밀번호 (권장) |",
    "| `DIARY_SESSION_SECRET` | 세션 서명 키 (선택, 비우면 비밀번호 사용) |",
    "",
    "서버 연동 파일: `src/lib/notion.ts` (서버 REST 클라이언트), `src/lib/notion-map.ts` (속성 이름 ↔ 데이터), `src/lib/db-config.ts` (환경변수 → DB ID), `src/app/api/*` (라우트).",
    "",
    "## 4. 설치 순서",
    ...DB_SETUP_STEPS.map((step, index) => `${index + 1}. ${step}`),
    "6. 배포 주소 → 설정 → 연결에서 다섯 개 DB가 모두 '연결됨'인지 확인합니다.",
    "",
    "## 5. 연결 상태 확인",
    "- `/api/status` 응답의 `dbs` 에 DB별 `label · envKey · configured · ok · message` 가 나옵니다.",
    "- `configured=false` 인 DB는 조회하지 않고, 저장 요청은 `503 db_not_configured` 로 막힙니다.",
    "",
    "## 6. 다른 AI에 붙여넣을 설치 지시문",
    "",
    "```text",
    INSTALL_PROMPT,
    "```",
    "",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Standalone HTML guide — works offline and can be handed to another AI. */
export function buildKitHtml(): string {
  const propertySections = DB_ORDER.map((resource) => {
    const rows = DB_PROPERTIES[resource]
      .map(
        (property) =>
          `<tr><td>${escapeHtml(property.name)}</td><td><code>${escapeHtml(property.type)}</code></td><td>${escapeHtml(
            property.detail ?? "",
          )}</td></tr>`,
      )
      .join("\n");
    return `<section>
  <h3>${escapeHtml(DB_LABELS[resource])} <span class="env">${escapeHtml(DB_ENV_KEYS[resource])}</span></h3>
  <p class="purpose">${escapeHtml(DB_PURPOSES[resource])}</p>
  <table><thead><tr><th>속성 이름</th><th>타입</th><th>값 / 비고</th></tr></thead><tbody>
${rows}
  </tbody></table>
</section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(KIT_TITLE)} 키트 ${KIT_VERSION}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px 20px 64px; background: #fff; color: #111827;
         font-family: "Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, "Apple SD Gothic Neo", sans-serif;
         font-size: 15px; line-height: 1.65; }
  main { max-width: 820px; margin: 0 auto; }
  h1 { font-size: 26px; letter-spacing: -0.03em; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 36px 0 10px; letter-spacing: -0.02em; }
  h3 { font-size: 15px; margin: 22px 0 4px; }
  p, li { color: #374151; }
  .meta { color: #6b7280; font-size: 13px; }
  .badge { display: inline-block; border: 1px solid #e7e9ee; border-radius: 999px; padding: 1px 8px; font-size: 12px; color: #374151; }
  .env { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #6b7280; font-weight: 400; }
  .purpose { margin: 0 0 8px; font-size: 13px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border-bottom: 1px solid #e7e9ee; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { color: #6b7280; font-weight: 500; }
  code { background: #f3f4f6; border-radius: 4px; padding: 1px 4px; font-size: 12px; }
  pre { background: #f9fafb; border: 1px solid #e7e9ee; border-radius: 10px; padding: 14px; white-space: pre-wrap; word-break: break-word; font-size: 12.5px; }
  .note { border: 1px solid #fde68a; background: #fffbeb; border-radius: 10px; padding: 10px 12px; font-size: 13px; color: #92400e; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(KIT_TITLE)} — 내 다이어리 만들기</h1>
  <p class="meta">제작자: ${escapeHtml(KIT_TITLE)} 키트 · 버전 <span class="badge">${KIT_VERSION}</span> · 저장소: ${escapeHtml(KIT_REPO)}</p>

  <p class="note">이 키트에는 제작자의 노션 계정, 비밀번호, DB ID, 비밀 키가 들어 있지 않습니다. 빈 Notion DB 다섯 개를 직접 만들고 내 서버 환경변수에 내 ID만 넣어 설치합니다.</p>

  <h2>1. 빈 Notion 템플릿 구성</h2>
  ${propertySections}

  <h2>2. 서버 연동 파일과 환경변수</h2>
  <ul>
    <li><code>src/lib/notion.ts</code> — 서버 전용 Notion REST 클라이언트 (토큰은 여기서만 쓰입니다)</li>
    <li><code>src/lib/notion-map.ts</code> — 속성 이름 ↔ 데이터 변환</li>
    <li><code>src/lib/db-config.ts</code> — 환경변수 → DB ID (비어 있으면 미연결)</li>
    <li><code>src/app/api/status</code>, <code>src/app/api/notion/*</code> — 연결 상태·조회·저장 라우트</li>
  </ul>
  <table><thead><tr><th>환경변수</th><th>설명</th></tr></thead><tbody>
    <tr><td><code>NOTION_TOKEN</code></td><td>내부 통합 토큰 (필수)</td></tr>
    ${DB_ORDER.map(
      (resource) => `<tr><td><code>${DB_ENV_KEYS[resource]}</code></td><td>${escapeHtml(DB_LABELS[resource])} — ${escapeHtml(DB_PURPOSES[resource])}</td></tr>`,
    ).join("\n    ")}
    <tr><td><code>DIARY_PASSWORD</code></td><td>접속 비밀번호 (권장)</td></tr>
    <tr><td><code>DIARY_SESSION_SECRET</code></td><td>세션 서명 키 (선택)</td></tr>
  </tbody></table>

  <h2>3. 설치 순서</h2>
  <ol>
    ${DB_SETUP_STEPS.map((step) => `<li>${escapeHtml(step)}</li>`).join("\n    ")}
    <li>배포 주소 → 설정 → 연결에서 다섯 개 DB가 모두 '연결됨'인지 확인합니다.</li>
  </ol>

  <h2>4. 다른 AI에 붙여넣을 설치 지시문</h2>
  <pre>${escapeHtml(INSTALL_PROMPT)}</pre>
</main>
</body>
</html>
`;
}
