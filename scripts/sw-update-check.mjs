/**
 * Service Worker 更新流程實測（對 preview 伺服器，需先 npm run build && npm run preview）。
 *
 * 驗證「有新版本可用 → 點更新 → 新 SW 接管 → 頁面重載 → 提示消失」整條鏈路。
 * 這正是之前出問題的地方：舊寫法只呼叫 location.reload()，但新 SW 還卡在 waiting，
 * 重載後還是舊版、提示又出現，看起來像「點了沒反應」。正確做法要呼叫 registerSW 回傳的
 * updateSW() 送 SKIP_WAITING。
 *
 * 測試方式：修改 dist/sw.js 的位元組（插註解，precache 內容不變）冒充「新版 SW」，
 * 觸發 registration.update()，等提示出現後點擊，確認真的 reload 且提示消失。
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
let browser;
try {
  browser = await chromium.launch({ executablePath: requireBrowser(), headless: true, args: browserArgs() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
  const page = await ctx.newPage();
  let navigations = 0;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame() && f.url().includes("BaziGFun")) navigations++;
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  // Workbox 未開 clientsClaim：SW 安裝後需 reload 一次才接管
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  line(true, `SW 已安裝並接管（navigation ${navigations}）`);

  // 冒充新版 SW
  writeFileSync(SW_PATH, Buffer.concat([Buffer.from("/* test-update */\n"), original]));
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page.waitForSelector("#bz-update-bar", { timeout: 15000 });
  const barText = (await page.locator("#bz-update-bar").innerText()).replace(/\s+/g, " ");
  line(barText.includes("有新版本可用") && barText.includes("更新"), `更新提示出現：「${barText}」`);

  // 點整條提示（實測整條可點，不限小按鈕）
  const before = navigations;
  await page.locator("#bz-update-bar").click();
  const sawUpdating = await page
    .waitForFunction(() => document.querySelector("#bz-update-bar button")?.textContent?.includes("更新中"), null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  console.log(`ℹ 點擊後观察到「更新中…」回饋：${sawUpdating ? "是" : "否（reload 太快，一閃而過）"}`);

  // 等 reload（外掛的 controlling 事件，或 2 秒 fallback）
  await page
    .waitForFunction(() => !document.getElementById("bz-update-bar"), null, { timeout: 12000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  const barGone = (await page.locator("#bz-update-bar").count()) === 0;
  line(navigations > before, `點擊後確實重載（navigation ${before} → ${navigations}）`);
  line(barGone, "重載後更新提示消失（新 SW 已生效，不會再跳出來）");
} catch (e) {
  line(false, `執行失敗：${e.message}`);
} finally {
  writeFileSync(SW_PATH, original); // 一定要還原，避免污染 dist
  if (browser) await browser.close();
}

console.log(failed === 0 ? "\nService Worker 更新流程實測全部通過" : `\n共 ${failed} 項未通過`);
process.exit(failed === 0 ? 0 : 1);
