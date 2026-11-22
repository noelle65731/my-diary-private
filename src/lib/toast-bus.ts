/**
 * A41: 화면 밖(설정·색 고르기처럼 React 트리 위쪽이나 별도 저장소에서 바로 쓰는 곳)에서도
 * 같은 토스트를 띄울 수 있게, UiProvider 가 자기 notify 를 여기에 등록합니다.
 * 등록 전에 불린 알림은 버려집니다(앱이 그려지기 전의 일은 화면에 보일 필요가 없습니다).
 */
type ToastTone = "info" | "error" | "success";
type Listener = (message: string, tone?: ToastTone) => void;

let listener: Listener | null = null;

export function setToastListener(next: Listener | null): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

export function pushToast(message: string, tone: ToastTone = "info"): void {
  if (!message) return;
  listener?.(message, tone);
}
