/**
 * A46: 문서 변환 단위 검증 — 노션 블록 ↔ 앱 문서 ↔ 마크다운.
 * `node tests/a46-doc-model.mjs` 로 실행합니다(타입스크립트를 그 자리에서 옮겨 실행).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/lib/doc.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module_ = { exports: {} };
new Function("exports", "module", "require", js)(module_.exports, module_, require);
const doc = module_.exports;

let pass = 0;
const fail = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log("PASS " + name + (detail ? " — " + detail : ""));
  } else {
    fail.push(name);
    console.log("FAIL " + name + (detail ? " — " + detail : ""));
  }
};

// 1. 스탬프 줄
check("스탬프 줄", doc.stampLine({ weather: "☀️", mood: "😊" }) === "☀️ 😊");
check("스탬프 읽기", JSON.stringify(doc.parseStampLine("☀️ 😊")) === JSON.stringify({ weather: "☀️", mood: "😊" }));
check("스탬프 아닌 줄", doc.parseStampLine("오늘은 ☀️ 좋았다") === null);

// 2. 문서 → 노션 블록
const model = {
  stamp: { weather: "☀️", mood: "😊" },
  blocks: [
    { id: "a", type: "paragraph", spans: [{ text: "보통 글" }, { text: " 굵게", bold: true }, { text: " 밑줄", underline: true }] },
    { id: "b", type: "quote", spans: [{ text: "인용 문장", color: "blue" }], tone: "gray" },
    { id: "c", type: "callout", spans: [{ text: "강조 박스", background: "yellow" }], emoji: "💡", tone: "yellow" },
    { id: "d", type: "todo", spans: [{ text: "체크할 일", strike: true }], checked: true },
  ],
};
const blocks = doc.blocksFromDoc(model);
check("블록 수(스탬프 포함)", blocks.length === 5, String(blocks.length));
check("스탬프는 첫 문단", blocks[0].type === "paragraph" && blocks[0].paragraph.rich_text[0].text.content === "☀️ 😊");
check("인용구 블록", blocks[2].type === "quote" && blocks[2].quote.color === "gray_background");
check("강조 박스 블록", blocks[3].type === "callout" && blocks[3].callout.icon.emoji === "💡" && blocks[3].callout.color === "yellow_background");
check("체크리스트 블록", blocks[4].type === "to_do" && blocks[4].to_do.checked === true);
const first = blocks[1].paragraph.rich_text;
check("굵게 주석", first[1].annotations.bold === true, JSON.stringify(first[1].annotations));
check("밑줄 주석", first[2].annotations.underline === true);
check("형광펜은 배경색 이름", blocks[3].callout.rich_text[0].annotations.color === "yellow_background", blocks[3].callout.rich_text[0].annotations.color);
check("글자색", blocks[2].quote.rich_text[0].annotations.color === "blue");
check("취소선", blocks[4].to_do.rich_text[0].annotations.strikethrough === true);

// 3. 노션 블록 → 문서 (왕복)
const notionShaped = [
  { id: "p1", type: "paragraph", paragraph: { rich_text: [{ plain_text: "☀️ 😊" }] } },
  {
    id: "p2",
    type: "paragraph",
    paragraph: {
      rich_text: [
        { plain_text: "보통 ", annotations: { color: "default" } },
        { plain_text: "굵게", annotations: { bold: true, color: "default" } },
      ],
    },
  },
  { id: "p3", type: "quote", quote: { rich_text: [{ plain_text: "인용", annotations: { color: "blue" } }], color: "gray_background" } },
  {
    id: "p4",
    type: "callout",
    callout: { rich_text: [{ plain_text: "강조", annotations: { color: "yellow_background" } }], icon: { emoji: "📌" }, color: "yellow_background" },
  },
  { id: "p5", type: "to_do", to_do: { rich_text: [{ plain_text: "체크", annotations: { strikethrough: true } }], checked: true } },
  { id: "p6", type: "divider", divider: {} },
  { id: "p7", type: "image", image: {} },
];
const parsed = doc.docFromBlocks(notionShaped);
check("스탬프 복원", parsed.stamp.weather === "☀️" && parsed.stamp.mood === "😊");
check("이미지 블록은 무시", parsed.blocks.length === 5, String(parsed.blocks.length));
check("굵게 복원", parsed.blocks[0].spans.some((s) => s.bold && s.text === "굵게"));
check("글자색 복원", parsed.blocks[1].spans[0].color === "blue");
check("형광펜 복원", parsed.blocks[2].spans[0].background === "yellow");
check("체크 상태 복원", parsed.blocks[3].type === "todo" && parsed.blocks[3].checked === true);
check("구분선 복원", parsed.blocks[4].type === "divider");

// 4. 마크다운 왕복
const md = doc.docToMarkdown(model);
check("마크다운 표식", md.includes("> 인용 문장") && md.includes("- [x] ~~체크할 일~~") && md.includes("**굵게**"), md.split("\n").slice(0, 3).join(" / "));
const back = doc.docFromMarkdown(md);
check("마크다운 → 문서: 인용", back.blocks.some((b) => b.type === "quote"));
check("마크다운 → 문서: 체크", back.blocks.some((b) => b.type === "todo" && b.checked));
check("마크다운 → 문서: 스탬프", back.stamp.weather === "☀️");
const again = doc.docToMarkdown(back);
check("마크다운 왕복 안정", doc.docToMarkdown(doc.docFromMarkdown(again)) === again);

console.log();
console.log(fail.length === 0 ? `전부 통과 (${pass})` : `실패 ${fail.length} / 통과 ${pass}`);
process.exit(fail.length === 0 ? 0 : 1);
