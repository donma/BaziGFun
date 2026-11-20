import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // GitHub Pages 專案頁面掛在 /BaziGFun/ 子路徑；本機 dev 仍由 Vite 自動處理
  base: "/BaziGFun/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "BaziGFun 八宅羅盤",
        short_name: "BaziGFun",
        description: "禪意後天八卦實景羅盤・八宅命卦量測（本機離線，不上傳資料）",
        lang: "zh-Hant",
        display: "standalone",
        orientation: "any",
        theme_color: "#241c0f",
        background_color: "#241c0f",
        start_url: "/BaziGFun/",
        scope: "/BaziGFun/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/BaziGFun/index.html",
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 版面同步測試需要讀到 CSS 原文（預設 Vitest 會把 CSS 換成空字串）
    css: { include: [/\.css\?raw$/] },
  },
  server: {
    // 實測腳本的截圖與下載檔放在 scripts/.cache：不讓 dev server 監看。
    // （Windows 上檔案寫入中被監看會丟 EBUSY 讓伺服器當掉，也會觸發無謂的重新整理）
    watch: { ignored: ["**/scripts/.cache/**"] },
  },
});
