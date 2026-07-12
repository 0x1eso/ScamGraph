import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// ScamGraph web 단위 테스트 러너 (jsdom + Testing Library).
// "@/…" 별칭은 tsconfig(paths)와 동일하게 apps/web 루트로 해석한다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Next 빌드 산출물/의존성은 테스트 대상에서 제외.
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", ".next-verify"],
  },
});
