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
}

export const PASTELS: Pastel[] = [
  { key: "rose", label: "로즈", bg: "bg-[#fdf1f3]", border: "border-[#f7dfe4]", dot: "bg-[#e8a3b3]" },
  { key: "peach", label: "피치", bg: "bg-[#fdf4ec]", border: "border-[#f7e4d1]", dot: "bg-[#eab185]" },
  { key: "lemon", label: "레몬", bg: "bg-[#fdfae9]", border: "border-[#f3ecc4]", dot: "bg-[#dcc464]" },
  { key: "mint", label: "민트", bg: "bg-[#eefaf4]", border: "border-[#d8efe5]", dot: "bg-[#7cc9a8]" },
  { key: "sky", label: "스카이", bg: "bg-[#eef6fd]", border: "border-[#dbeafa]", dot: "bg-[#86b7e4]" },
  { key: "lavender", label: "라벤더", bg: "bg-[#f4f1fd]", border: "border-[#e6dffa]", dot: "bg-[#a897e0]" },
  { key: "sage", label: "세이지", bg: "bg-[#f3f8ef]", border: "border-[#e4eedb]", dot: "bg-[#a3bf8c]" },
  { key: "cream", label: "크림", bg: "bg-[#fdf8f0]", border: "border-[#f2e7d6]", dot: "bg-[#d8bd93]" },
  { key: "aqua", label: "아쿠아", bg: "bg-[#eefaf9]", border: "border-[#d8efed]", dot: "bg-[#7fcbc6]" },
  { key: "lilac", label: "라일락", bg: "bg-[#fbf0fa]", border: "border-[#f4ddf1]", dot: "bg-[#cf9ccb]" },
];

const BY_KEY = new Map(PASTELS.map((pastel) => [pastel.key, pastel]));

export function pastelByKey(key: PastelKey | string | null | undefined): Pastel | null {
  if (!key) return null;
  return BY_KEY.get(key as PastelKey) ?? null;
}
