// ScamGraph — 실시간 피드 구독 헬퍼 (native WebSocket, 무의존)
// gateway의 /ws/feed 로 접속해 스캔·신고 이벤트를 스트리밍으로 받아온다.

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

// 연결이 끊겼을 때 재접속을 시도하기 전 대기 시간(ms).
const RECONNECT_DELAY_MS = 2000;

// gateway가 내보내는 피드 이벤트 타입(게이트웨이와 정확히 일치해야 함).
export type FeedEvent = {
  type: "scan" | "report";
  target: string;
  kind: "url" | "phone" | "account";
  grade: "safe" | "caution" | "warning" | "danger" | null;
  risk_score: number | null;
  note: string | null;
  ts: number;
};

// http(s):// gateway URL을 ws(s):// 피드 엔드포인트로 변환한다.
function toFeedUrl(gateway: string): string {
  const wsBase = gateway.replace(/^http/, "ws");
  return `${wsBase}/ws/feed`;
}

// 실시간 피드를 구독한다.
// onEvent: 새 이벤트가 도착할 때마다 호출. onStatus: 연결 상태 변화 알림(선택).
// 반환값: 소켓을 닫고 재접속을 취소하는 구독 해제 함수.
export function subscribeFeed(
  onEvent: (event: FeedEvent) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  // 브라우저에서만 동작(SSR 가드).
  if (typeof window === "undefined") {
    return () => {};
  }

  const url = toFeedUrl(GATEWAY);
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function scheduleReconnect() {
    // 이미 구독 해제됐거나 재접속이 예약돼 있으면 중복 예약하지 않는다.
    if (stopped || reconnectTimer !== null) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function connect() {
    if (stopped) {
      return;
    }

    try {
      socket = new WebSocket(url);
    } catch {
      // 생성 자체가 실패해도(잘못된 URL 등) UI를 무너뜨리지 않고 재시도.
      onStatus?.(false);
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      onStatus?.(true);
    };

    socket.onmessage = (message: MessageEvent) => {
      try {
        const parsed = JSON.parse(message.data as string) as FeedEvent;
        onEvent(parsed);
      } catch {
        // 손상된 프레임은 조용히 버리고 스트림을 계속 유지한다.
      }
    };

    socket.onerror = () => {
      onStatus?.(false);
      // onerror 뒤에는 대개 onclose가 따라오므로 여기서는 상태만 갱신한다.
    };

    socket.onclose = () => {
      onStatus?.(false);
      scheduleReconnect();
    };
  }

  connect();

  // 구독 해제: 재접속 취소 + 소켓 정리(닫는 중 콜백이 재접속을 예약하지 않도록 stopped 우선 처리).
  return () => {
    stopped = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      socket = null;
    }
  };
}
