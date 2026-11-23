/** Service Worker 註冊與版本更新提示（vite-plugin-pwa） */
import { registerSW } from "virtual:pwa-register";

const BAR_ID = "bz-update-bar";

export function registerSWWithUpdatePrompt(): void {
  // registerSW 回傳的 updateSW 會送 SKIP_WAITING 給等待中的新 SW；
  // 新 SW 接管時（controlling 事件）外掛才會自動 reload。
  // 只呼叫 location.reload() 是不夠的：新 SW 仍卡在 waiting，重載後還是舊版，提示會一直出現。
  const updateSW = registerSW({
    onNeedRefresh() {
      document.getElementById(BAR_ID)?.remove();
      const bar = document.createElement("div");
      bar.id = BAR_ID;
      bar.setAttribute("role", "status");
      bar.style.cssText =
        "position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);" +
        // 摺疊雙螢幕時只置中在第一螢幕，不跨鉸鏈
        "left:calc((100vw - var(--seg-pad-right,0px)) / 2);transform:translateX(-50%);" +
        "z-index:999;background:#3d3423;color:#f6f1e7;padding:6px 8px 6px 16px;border-radius:999px;" +
        "font-size:13px;display:flex;gap:10px;align-items:center;cursor:pointer;" +
        "box-shadow:0 3px 14px rgba(0,0,0,0.4);";
      const label = document.createElement("span");
      label.textContent = "有新版本可用";
      label.style.cssText = "white-space:nowrap;";
      const btn = document.createElement("button");
      btn.textContent = "更新";
      btn.style.cssText =
        "border:none;background:#f6f1e7;color:#3d3423;border-radius:999px;" +
        "padding:0 16px;min-height:44px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;";
      let updating = false;
      const apply = async () => {
        if (updating) return;
        updating = true;
        btn.textContent = "更新中…";
        btn.disabled = true;
        try {
          await updateSW();
        } catch {
          location.reload(); // 送訊息失敗時至少重載一次
          return;
        }
        // 外掛在新 SW 接管時會自動 reload；若 2 秒內沒發生（少數瀏覽器語義差異），自行重載。
        // 若外掛已 reload，整頁（含此 timer）都已消失，不會有雙重重載。
        setTimeout(() => location.reload(), 2000);
      };
      btn.onclick = (e) => {
        e.stopPropagation();
        void apply();
      };
      bar.onclick = () => void apply(); // 整條提示都可點，避免小按鈕按不到
      bar.append(label, btn);
      document.body.appendChild(bar);
    },
    onOfflineReady() {
      console.info("[BaziGFun] 離線快取完成，可離線使用");
    },
  });
}

export { registerSW };
