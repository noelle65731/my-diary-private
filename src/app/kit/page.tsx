import type { Metadata } from "next";
import { KitGuide } from "@/components/kit/KitGuide";
import { KIT_VERSION } from "@/lib/db-meta";

export const metadata: Metadata = {
  title: "내 다이어리 만들기 (공개 키트)",
  description: `빈 노션 템플릿 다섯 개로 나만의 다이어리를 설치하는 공개 키트 ${KIT_VERSION}. 제작자 계정·비밀번호·DB ID는 포함되지 않습니다.`,
  robots: { index: false, follow: false },
};

/**
 * Public route: no password gate. `AppShell` is not used here, so the diary's
 * `DIARY_PASSWORD` protection never covers this page.
 */
export default function KitPage() {
  return <KitGuide />;
}
