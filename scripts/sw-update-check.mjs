/**
 * Service Worker 更新流程實測（對 preview 伺服器，需先 npm run build && npm run preview）。
 *
 * 驗證 autoUpdate 行為：修改 dist/sw.js 冒充「新版 SW」→ registration.update() →
 * 新版 SW 在背景下載完成後自行 skipWaiting + clientsClaim 接管 → 外掛自動 reload →
 * 頁面載入新版。全程不需要使用者點任何按鈕（也不會出現「有新版本可用」提示）。
 * 這同時驗證了「先有雞還是先有蛋」已解決：連還在跑舊程式的頁面也會被新 SW 接管。
 *
 * 結束時（含例外）會還原原本的 sw.js。
 *
 * 用法：npm run test:sw   （--url=<preview 網址>；預設 http://localhost:4173/BaziGFun/）
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { browserArgs, requireBrowser } from "./lib/test-browser.mjs";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const URL = opt("url", "http://localhost:4173/BaziGFun/");
const SW_PATH = "dist/sw.js";

let failed = 0;
const line = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
};

const original = readFileSync(SW_PATH);
const originalText = original.toString("utf8");
let browser;
try {
  // 先確認建置出來的是 autoUpdate（SW 含 skipWaiting + clientsClaim）
  line(/skipWaiting/.test(originalText) && /clientsClaim/.test(originalText), "SW 為 autoUpdate（含 skipWaiting + clientsClaim）");

  browser = await chromium.launch({ executablePath: requireBrowser(), headless: true, args: browserArgs() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
  const page = await ctx.newPage();
  let navigations = 0;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame() && f.url().includes("BaziGFun")) navigations++;
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  line(true, `SW 已安裝並接管（navigation ${navigations}）`);

  // 沒有新版本時，重新載入不應造成無限更新迴圈
  const beforeIdle = navigations;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  line(navigations === beforeIdle + 1, `一般重新載入不會觸發額外自動更新（navigation ${beforeIdle} → ${navigations}，應只 +1）`);

  // 冒充新版：改 sw.js 位元組（加註解）。autoUpdate 下新版會自己接管，不需按鈕。
  writeFileSync(SW_PATH, Buffer.concat([Buffer.from("/* test-update */\n"), original]));
  const before = navigations;
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });

  // 等新版 SW 接管並自動 reload（framenavigated 計數增加）
  const deadline = Date.now() + 12000;
  while (navigations <= before && Date.now() < deadline) await page.waitForTimeout(200);
  line(navigations > before, `新版 SW 接管後自動重載（navigation ${before} → ${navigations}），不需點任何按鈕`);

  // 不應該出現「有新版本可用」的卡住提示
  const stuck = await page.evaluate(() => !!document.getElementById("bz-update-bar"));
  line(!stuck, "沒有卡住的「有新版本可用」提示");
} catch (e) {
  line(false, `執行失敗：${e.message}`);
} finally {
  writeFileSync(SW_PATH, original);
  if (browser) await browser.close();
}

console.log(failed === 0 ? "\nService Worker 更新流程實測全部通過" : `\n共 ${failed} 項未通過`);
process.exit(failed === 0 ? 0 : 1);
