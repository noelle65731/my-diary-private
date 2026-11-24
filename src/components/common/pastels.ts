/**
 * 프로젝트끼리 아주 옅게 구분하는 파스텔 톤 열 가지.
 * 진한 구분선과 글자색을 해치지 않도록 배경은 흰색에 가까운 톤만 씁니다.
 */
export type PastelKey =
  | "rose"
  | "peach"
  | "lemon"
  | "mint"
  | "sky"
  | "lavender"
  | "sage"
  | "cream"
  | "aqua"
  | "lilac";

export interface Pastel {
  key: PastelKey;
  label: string;
  /** 카드·행 배경 */
  bg: string;
  /** 아주 옅은 테두리 */
  border: string;
  /** 팔레트 버튼의 동그라미 */
  dot: string;
  /** A19: 월간 할 일 밑줄처럼 선으로 쓰는 같은 색(hex) */
  line: string;
}

/* A18: 카드·행 배경이 너무 진하다는 요청에 채도를 절반으로 낮춘 톤만 남깁니다.
 * 흰 바탕에 아주 은은하게 비치는 정도라, 열 가지가 서로 구분되면서도 무겁지 않습니다. */
/* A48: 색값은 `globals.css` 의 `--pastel-*` 변수에 있습니다 — 설정의 색감 테마를 바꾸면
 * 열 가지 파스텔도 함께 바뀌되, 어떤 테마에서도 흰 바탕에 또렷하게 구분되는 톤을 씁니다. */
export const PASTELS: Pastel[] = [
  { key: "rose", label: "로즈", bg: "bg-[var(--pastel-rose-bg)]", border: "border-[var(--pastel-rose-border)]", dot: "bg-[var(--pastel-rose-dot)]", line: "var(--pastel-rose-dot)" },
  { key: "peach", label: "피치", bg: "bg-[var(--pastel-peach-bg)]", border: "border-[var(--pastel-peach-border)]", dot: "bg-[var(--pastel-peach-dot)]", line: "var(--pastel-peach-dot)" },
  { key: "lemon", label: "레몬", bg: "bg-[var(--pastel-lemon-bg)]", border: "border-[var(--pastel-lemon-border)]", dot: "bg-[var(--pastel-lemon-dot)]", line: "var(--pastel-lemon-dot)" },
  { key: "mint", label: "민트", bg: "bg-[var(--pastel-mint-bg)]", border: "border-[var(--pastel-mint-border)]", dot: "bg-[var(--pastel-mint-dot)]", line: "var(--pastel-mint-dot)" },
  { key: "sky", label: "스카이", bg: "bg-[var(--pastel-sky-bg)]", border: "border-[var(--pastel-sky-border)]", dot: "bg-[var(--pastel-sky-dot)]", line: "var(--pastel-sky-dot)" },
  { key: "lavender", label: "라벤더", bg: "bg-[var(--pastel-lavender-bg)]", border: "border-[var(--pastel-lavender-border)]", dot: "bg-[var(--pastel-lavender-dot)]", line: "var(--pastel-lavender-dot)" },
  { key: "sage", label: "세이지", bg: "bg-[var(--pastel-sage-bg)]", border: "border-[var(--pastel-sage-border)]", dot: "bg-[var(--pastel-sage-dot)]", line: "var(--pastel-sage-dot)" },
  { key: "cream", label: "크림", bg: "bg-[var(--pastel-cream-bg)]", border: "border-[var(--pastel-cream-border)]", dot: "bg-[var(--pastel-cream-dot)]", line: "var(--pastel-cream-dot)" },
  { key: "aqua", label: "아쿠아", bg: "bg-[var(--pastel-aqua-bg)]", border: "border-[var(--pastel-aqua-border)]", dot: "bg-[var(--pastel-aqua-dot)]", line: "var(--pastel-aqua-dot)" },
  { key: "lilac", label: "라일락", bg: "bg-[var(--pastel-lilac-bg)]", border: "border-[var(--pastel-lilac-border)]", dot: "bg-[var(--pastel-lilac-dot)]", line: "var(--pastel-lilac-dot)" },
];

const BY_KEY = new Map(PASTELS.map((pastel) => [pastel.key, pastel]));

export function pastelByKey(key: PastelKey | string | null | undefined): Pastel | null {
  if (!key) return null;
  return BY_KEY.get(key as PastelKey) ?? null;
}
