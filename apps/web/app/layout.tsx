import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScamGraph · 위협 인텔리전스 관제",
  description:
    "실시간 사기·피싱 위협 인텔리전스 플랫폼 — 사기 인프라의 관계망을 그래프와 지도로 시각화합니다.",
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
