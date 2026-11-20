/** Service Worker 註冊與版本更新提示（vite-plugin-pwa） */
import { registerSW } from "virtual:pwa-register";

export function registerSWWithUpdatePrompt(): void {
  registerSW({
    onNeedRefresh() {
      // 版本化更新提示：不強制刷新，讓使用者決定
      const bar = document.createElement("div");
      bar.textContent = "有新版本可用";
      bar.style.cssText =
        "position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:50%;transform:translateX(-50%);z-index:999;background:#3d3423;color:#f6f1e7;padding:10px 16px;border-radius:999px;font-size:13px;display:flex;gap:10px;align-items:center;";
      const btn = document.createElement("button");
      btn.textContent = "更新";
      btn.style.cssText = "border:none;background:#f6f1e7;color:#3d3423;border-radius:999px;padding:4px 12px;cursor:pointer;";
      btn.onclick = () => location.reload();
      bar.appendChild(btn);
      document.body.appendChild(bar);
    },
    onOfflineReady() {
      console.info("[BaziGFun] 離線快取完成，可離線使用");
    },
  });
}

export { registerSW };
