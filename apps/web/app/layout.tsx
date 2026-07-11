import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScamGraph · 위협 인텔리전스 관제",
  description:
    "실시간 사기·피싱 위협 인텔리전스 플랫폼 — 사기 인프라의 관계망을 그래프와 지도로 시각화합니다.",
  // PWA: 설치형 앱 + 공유 대상(share_target) 등록.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  // 홈 화면에 추가했을 때 iOS 전체 화면 웹앱으로 동작하도록.
  appleWebApp: {
    capable: true,
    title: "ScamGraph",
    statusBarStyle: "black-translucent",
  },
};

// Next 15: 테마 색상은 metadata가 아닌 viewport로 내보낸다.
export const viewport: Viewport = {
  themeColor: "#00e5c0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
