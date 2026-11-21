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
export const PASTELS: Pastel[] = [
  { key: "rose", label: "로즈", bg: "bg-[#faf4f5]", border: "border-[#f1e5e8]", dot: "bg-[#e8a3b3]", line: "#e8a3b3" },
  { key: "peach", label: "피치", bg: "bg-[#f9f4f0]", border: "border-[#eee4da]", dot: "bg-[#eab185]", line: "#eab185" },
  { key: "lemon", label: "레몬", bg: "bg-[#f8f7ee]", border: "border-[#e7e4d0]", dot: "bg-[#dcc464]", line: "#dcc464" },
  { key: "mint", label: "민트", bg: "bg-[#f1f7f4]", border: "border-[#dee9e4]", dot: "bg-[#7cc9a8]", line: "#7cc9a8" },
  { key: "sky", label: "스카이", bg: "bg-[#f2f6f9]", border: "border-[#e3eaf2]", dot: "bg-[#86b7e4]", line: "#86b7e4" },
  { key: "lavender", label: "라벤더", bg: "bg-[#f6f4fa]", border: "border-[#e9e6f3]", dot: "bg-[#a897e0]", line: "#a897e0" },
  { key: "sage", label: "세이지", bg: "bg-[#f3f6f1]", border: "border-[#e4e9e0]", dot: "bg-[#a3bf8c]", line: "#a3bf8c" },
  { key: "cream", label: "크림", bg: "bg-[#faf7f3]", border: "border-[#ebe5dd]", dot: "bg-[#d8bd93]", line: "#d8bd93" },
  { key: "aqua", label: "아쿠아", bg: "bg-[#f1f7f7]", border: "border-[#dee9e8]", dot: "bg-[#7fcbc6]", line: "#7fcbc6" },
  { key: "lilac", label: "라일락", bg: "bg-[#f8f3f8]", border: "border-[#eee3ed]", dot: "bg-[#cf9ccb]", line: "#cf9ccb" },
];

const BY_KEY = new Map(PASTELS.map((pastel) => [pastel.key, pastel]));

export function pastelByKey(key: PastelKey | string | null | undefined): Pastel | null {
  if (!key) return null;
  return BY_KEY.get(key as PastelKey) ?? null;
}
