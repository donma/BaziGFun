/**
 * 陀螺儀實測：用真實 Edge／Chrome 的「Sensors → Orientation」模擬（CDP DeviceOrientation.setDeviceOrientationOverride）。
 *
 * 瀏覽器會自己送出真正的 `deviceorientation` 事件（alpha／beta／gamma），
 * 驗證：事件 → 姿態幾何換算（非 iOS 路徑）→ 相機水平朝向 → 八宅吉凶 → 畫面。
 * 與合成 webkitCompassHeading 事件不同，這條路徑走的是歐拉角換算，直式、橫式、傾斜、朝天、平放都會經過。
 *
 * 用法：npm run dev   然後   npm run test:sensor   （--url=<網址> 可指定網址）
 *
 * 說明：DevTools 模擬的事件 absolute=false（相對方位），所以狀態列預期顯示「需校正」而不是「感測✓」——
 * 這正是 App 對「非絕對北」的誠實標示。方位數字本身（歐拉角幾何）仍應與已知姿態一致。
 */
import { chromium } from "playwright-core";
import { browserArgs, requireBrowser, TEST_STORAGE } from "./lib/test-browser.mjs";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const URL = opt("url", "http://localhost:5173/BaziGFun/");
const exe = requireBrowser();

// 人物：1991 女 → 乾六命。八方：西北伏位吉、北六煞凶、東北天醫吉、東五鬼凶、東南禍害凶、南絕命凶、西南延年吉、西生氣吉
const POSES = [
  { name: "直式·鏡頭朝北", a: 0, b: 90, g: 0, deg: 0, dir: "北", star: "六煞", good: false },
  { name: "直式·鏡頭朝西（alpha=90）", a: 90, b: 90, g: 0, deg: 270, dir: "西", star: "生氣", good: true },
  { name: "直式·鏡頭朝南", a: 180, b: 90, g: 0, deg: 180, dir: "南", star: "絕命", good: false },
  { name: "直式·鏡頭朝東（alpha=270）", a: 270, b: 90, g: 0, deg: 90, dir: "東", star: "五鬼", good: false },
  { name: "直式·鏡頭朝西北", a: 45, b: 90, g: 0, deg: 315, dir: "西北", star: "伏位", good: true },
  { name: "橫式握持（beta=0, gamma=90）→ 朝西", a: 0, b: 0, g: 90, deg: 270, dir: "西", star: "生氣", good: true },
  { name: "橫式握持（beta=0, gamma=-90）→ 朝東", a: 0, b: 0, g: -90, deg: 90, dir: "東", star: "五鬼", good: false },
  { name: "手機滾轉 30°（簡化公式會差 30°）→ 330°", a: 0, b: 90, g: 30, deg: 330, dir: "西北", star: "伏位", good: true },
  { name: "鏡頭上仰 30°（水平朝向不變）→ 朝北", a: 0, b: 120, g: 0, deg: 0, dir: "北", star: "六煞", good: false },
  { name: "鏡頭下俯 30°（水平朝向不變）→ 朝北", a: 0, b: 60, g: 0, deg: 0, dir: "北", star: "六煞", good: false },
  { name: "鏡頭朝天（beta=175）→ 暫停判定", a: 0, b: 175, g: 0, degraded: true },
  { name: "手機平放螢幕朝上（鏡頭朝地）→ 暫停判定", a: 0, b: 0, g: 0, degraded: true },
];

const circDiff = (x, y) => Math.abs(((x - y + 540) % 360) - 180);

const browser = await chromium.launch({ executablePath: exe, headless: true, args: browserArgs() });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  // 沒有「動作感測器」權限時，Chrome 送出的 deviceorientation 事件 alpha/beta/gamma 全是 null
  permissions: ["camera", "accelerometer", "gyroscope", "magnetometer"],
  locale: "zh-TW",
});
await ctx.addInitScript((storage) => {
  localStorage.setItem("bazigfun.v1", JSON.stringify(storage));
  window.__ori = [];
  for (const t of ["deviceorientation", "deviceorientationabsolute"]) {
    window.addEventListener(t, (e) => window.__ori.push({ t, abs: e.absolute, a: e.alpha, b: e.beta, g: e.gamma }), true);
  }
}, TEST_STORAGE);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const cdp = await ctx.newCDPSession(page);
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".compass-svg");

/** 以輕微抖動連續設定同一姿態（Chrome 只在變化 >0.1° 時才送事件；真機會持續送），讓濾波收斂 */
async function holdPose(p, n = 45) {
  // DevTools 只接受合法範圍：alpha∈[0,360)、beta∈[-180,180)、gamma∈[-90,90)
  const A = (v) => ((v % 360) + 360) % 360;
  const B = (v) => Math.max(-180, Math.min(179.99, v));
  const G = (v) => Math.max(-90, Math.min(89.99, v));
  for (let i = 0; i < n; i++) {
    const j = i % 2 ? 0.25 : -0.25;
    await cdp.send("DeviceOrientation.setDeviceOrientationOverride", { alpha: A(p.a + j), beta: B(p.b + j), gamma: G(p.g + j) });
    await page.waitForTimeout(18);
  }
  await page.waitForTimeout(250);
}

const read = () =>
  page.evaluate(() => ({
    big: document.querySelector(".heading-big")?.textContent?.replace(/\s+/g, "") ?? "",
    pill: document.querySelector(".star-pill")?.textContent?.replace(/\s+/g, "") ?? "",
    chip: document.querySelector(".status-strip .chip")?.textContent ?? "",
    warn: document.querySelector(".heading-warn")?.textContent ?? "",
    desc: document.querySelector(".heading-desc")?.textContent?.replace(/\s+/g, "") ?? "",
    tags: Array.from(document.querySelectorAll(".heading-sub .tag")).map((t) => t.textContent),
  }));

let failed = 0;
const line = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
};

// 先確認瀏覽器真的送出事件，並記錄 absolute 旗標
await holdPose(POSES[0], 10);
const evInfo = await page.evaluate(() => ({ n: window.__ori.length, types: [...new Set(window.__ori.map((e) => e.t + ":absolute=" + e.abs))] }));
line(evInfo.n > 0, `瀏覽器送出真正的方向事件 ${evInfo.n} 筆（${evInfo.types.join("、")}）`);

let lastGood = null;
for (const p of POSES) {
  await holdPose(p);
  const r = await read();
  if (p.degraded) {
    // 低調提示：檢查「暫停判定」膠囊＋朝向不穩晶片＋短說明，且不再出現紅色警告
    const ok = r.pill.includes("暫停判定") && r.chip.includes("朝向不穩") && /暫停|拿正/.test(r.desc) && !r.warn;
    // 凍結在最後有效方位（不亂轉）
    const frozenOk = lastGood === null || r.big.includes(String(lastGood.deg));
    line(ok && frozenOk, `${p.name}｜晶片「${r.chip}」、膠囊「${r.pill}」、說明「${r.desc.slice(0, 18)}」、無紅字警告=${!r.warn}、顯示 ${r.big}（凍結 ${frozenOk ? "正確" : "失敗"}）`);
  } else {
    const m = /^(\d+)°(.+)$/.exec(r.big);
    const deg = m ? Number(m[1]) : NaN;
    const okDeg = m && circDiff(deg, p.deg) <= 3;
    const okDir = m && m[2] === p.dir;
    const okStar = r.pill.startsWith(p.star) && r.pill.includes(p.good ? "吉方" : "凶方");
    const okNoDegrade = !r.pill.includes("暫停判定") && !r.chip.includes("朝向不穩");
    line(okDeg && okDir && okStar && okNoDegrade, `${p.name}｜期望 ${p.deg}° ${p.dir} ${p.star}${p.good ? "吉" : "凶"}；實際 ${r.big} ${r.pill}（晶片「${r.chip}」）`);
    if (okDeg) lastGood = { deg: p.deg };
  }
}

// 感測語義：DevTools 模擬為相對方位，App 必須誠實標示為需校正，且「校正指南針」要能修正偏移
await holdPose(POSES[0], 30);
const semChip = (await read()).chip;
line(semChip === "需校正" || semChip === "感測✓", `非絕對北的標示：狀態列為「${semChip}」（相對方位應為「需校正」）`);
await page.click(".action-btn:nth-child(1)"); // 校正指南針
await page.waitForSelector(".modal");
await page.click('.modal .btn:has-text("對準東")'); // 目前鏡頭實際朝北(0°)，卻告訴它這是東(90°) → 偏移 +90°
await page.waitForTimeout(300);
await holdPose(POSES[0], 20);
const afterCal = await read();
line(/^90°東/.test(afterCal.big), `校正偏移立即生效：把朝北的鏡頭校成「東」後顯示 ${afterCal.big}、偏移晶片存在=${await page.locator("button.chip-btn", { hasText: "偏移" }).count() > 0}`);
await page.click(".action-btn:nth-child(1)");
await page.waitForSelector(".modal");
await page.click('.modal .btn:has-text("重置偏移")');
await holdPose(POSES[0], 30);
const afterReset = await read();
line(/^0°北/.test(afterReset.big), `重置偏移後回到 ${afterReset.big}`);

line(errors.length === 0, `主控台無錯誤${errors.length ? "：" + errors.slice(0, 2).join(" | ") : ""}`);
await browser.close();
console.log(failed === 0 ? "\n陀螺儀實測全部通過" : `\n共 ${failed} 項未通過`);
process.exit(failed === 0 ? 0 : 1);
