/**
 * 版面實測：以真實 Edge／Chrome（headless）＋假相機串流，跑各種螢幕尺寸與摺疊狀態。
 *
 * 做什麼
 *  - 直式／橫式手機、平板、桌機、Surface Duo 合起（單螢幕）與展開（雙螢幕，含鉸鏈）。
 *  - 摺疊狀態使用 DevTools Protocol 的 displayFeature 模擬（等同 DevTools「Dual-screen」），
 *    讓 CSS 的 viewport-segments 媒體特徵與 env(viewport-segment-*) 生效。
 *  - 每個情境檢查三種狀態：預設（感測即時）、手動羅盤、分析面板（抽屜／側欄）。
 *  - 以量測到的元素位置判斷：沒有溢出視窗、互不重疊、羅盤夠大、**沒有任何內容壓到鉸鏈**、頁面不捲動。
 *  - 輸出截圖到 scripts/.cache/shots/（摺疊情境會疊上洋紅色鉸鏈帶方便肉眼確認）。
 *
 * 用法
 *   1) 先啟動開發伺服器：npm run dev          （預設網址 http://localhost:5173/BaziGFun/）
 *   2) npm run test:layout
 *      選項：--url=<網址>  --only=<情境 id，逗號分隔>  --out=<截圖資料夾>
 *   需要本機已安裝 Edge 或 Chrome（或設定環境變數 BROWSER_PATH）。
 *
 * 注意：這是「近似 viewport＋模擬鉸鏈」的驗證；真機折疊適配仍需在硬體取得時補測。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browserArgs, requireBrowser } from "./lib/test-browser.mjs";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const URL = opt("url", "http://localhost:5173/BaziGFun/");
const OUT = opt("out", join("scripts", ".cache", "shots"));
const ONLY = opt("only", "").split(",").filter(Boolean);

const exe = requireBrowser();

/** 情境表。fold＝DevTools displayFeature（offset 為鉸鏈起點，maskLength 為鉸鏈寬度，單位 CSS px） */
const SCENARIOS = [
  { id: "iphone14-portrait", name: "iPhone 14 直式", w: 390, h: 844, dpr: 3 },
  { id: "iphone-se-portrait", name: "iPhone SE 直式", w: 375, h: 667, dpr: 2 },
  { id: "android-small-portrait", name: "小型 Android 直式", w: 360, h: 640, dpr: 3 },
  { id: "iphone14-landscape", name: "iPhone 14 橫式", w: 844, h: 390, dpr: 3 },
  { id: "iphone15pm-landscape", name: "iPhone 15 Pro Max 橫式", w: 932, h: 430, dpr: 3 },
  { id: "iphone-se-landscape", name: "iPhone SE 橫式", w: 667, h: 375, dpr: 2 },
  { id: "android-small-landscape", name: "小型 Android 橫式", w: 640, h: 360, dpr: 3 },
  { id: "ipad-portrait", name: "iPad 直式", w: 768, h: 1024, dpr: 2 },
  { id: "ipad-landscape", name: "iPad 橫式", w: 1024, h: 768, dpr: 2 },
  { id: "duo-closed-portrait", name: "Surface Duo 合起・直式（單螢幕）", w: 540, h: 720, dpr: 2.5 },
  { id: "duo-closed-landscape", name: "Surface Duo 合起・橫式（單螢幕）", w: 720, h: 540, dpr: 2.5 },
  {
    id: "duo-open-book",
    name: "Surface Duo 展開・左右雙螢幕（鉸鏈垂直）",
    w: 1114,
    h: 720,
    dpr: 2.5,
    fold: { orientation: "vertical", offset: 540, maskLength: 34 },
  },
  {
    id: "duo-open-stacked",
    name: "Surface Duo 展開・上下雙螢幕（鉸鏈水平）",
    w: 720,
    h: 1114,
    dpr: 2.5,
    fold: { orientation: "horizontal", offset: 540, maskLength: 34 },
  },
  { id: "desktop-wide", name: "桌機寬螢幕", w: 1280, h: 800, dpr: 1 },
];

const KEYS = [".brand-bar", ".scheme-row", ".person-card", ".status-strip", ".heading-card", ".manual-bar", ".action-row"];
/** 量測容差（CSS px）：子像素排版會有 <1px 的誤差 */
const tol = 0.75;

const rectOf = (r) => ({ x: r.x, y: r.y, r: r.x + r.w, b: r.y + r.h, w: r.w, h: r.h });
const inter = (a, c) =>
  Math.max(0, Math.min(a.r, c.r) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.b, c.b) - Math.max(a.y, c.y));

/** 在頁面內量測所有需要的矩形 */
async function measure(page) {
  return page.evaluate((KEYS) => {
    const box = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const out = { keys: {}, vw: innerWidth, vh: innerHeight };
    for (const k of KEYS) out.keys[k] = box(document.querySelector(k));
    const svg = document.querySelector(".compass-svg");
    const sb = box(svg);
    if (sb) {
      const side = Math.min(sb.w, sb.h);
      out.dial = { x: sb.x + (sb.w - side) / 2, y: sb.y + (sb.h - side) / 2, w: side, h: side };
    } else out.dial = null;
    out.drawer = box(document.querySelector(".drawer:not(.closed)"));
    out.drawerClose = box(document.querySelector(".drawer:not(.closed) .drawer-close"));
    out.sidePanel = box(document.querySelector(".side-panel"));
    out.modal = box(document.querySelector(".modal"));
    out.toast = box(document.querySelector(".toast"));
    out.circles = Array.from(document.querySelectorAll(".action-circle")).map((e) => {
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    out.iconBtns = Array.from(document.querySelectorAll(".icon-btn")).map((e) => {
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    const de = document.documentElement;
    out.scroll = { sw: de.scrollWidth, sh: de.scrollHeight, bodySh: document.body.scrollHeight };
    out.truncated = Array.from(document.querySelectorAll(".person-line1, .person-line2, .heading-big"))
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .map((e) => e.className);
    // 內容溢出：卡片內任何 HTML 元素的內容比自己的框還寬（文字溢出膠囊、標題疊到按鈕、人名被擠扁…）
    out.contentOverflow = [];
    const ROOTS = [".brand-bar", ".scheme-row", ".person-card", ".status-strip", ".heading-card", ".manual-bar", ".action-row"];
    for (const sel of ROOTS) {
      const root = document.querySelector(sel);
      if (!root) continue;
      const rr = root.getBoundingClientRect();
      for (const el of root.querySelectorAll("*")) {
        if (!(el instanceof HTMLElement)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const name = (typeof el.className === "string" && el.className.trim().split(/\\s+/)[0]) || el.tagName.toLowerCase();
        // (a) 元素超出所屬卡片
        if (r.right > rr.right + 1 || r.left < rr.left - 1) {
          out.contentOverflow.push(sel + " > ." + name + " 超出卡片 " + Math.round(Math.max(r.right - rr.right, rr.left - r.left)) + "px");
        }
        // (b) 元素自己的內容比框寬（含 overflow:hidden 造成的被切／省略）
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          out.contentOverflow.push(sel + " > ." + name + " 內容被切／溢出 " + (el.scrollWidth - el.clientWidth) + "px「" + (el.textContent || "").trim().slice(0, 14) + "」");
        }
      }
    }
    out.mq = {
      h2: matchMedia("(horizontal-viewport-segments: 2)").matches,
      v2: matchMedia("(vertical-viewport-segments: 2)").matches,
    };
    out.video = (() => {
      const v = document.querySelector("video.scene-video");
      return v ? { w: v.videoWidth, h: v.videoHeight } : null;
    })();
    out.camChip = document.querySelector(".status-strip")?.textContent ?? "";
    return out;
  }, KEYS);
}

function hingeRect(s) {
  if (!s.fold) return null;
  const f = s.fold;
  return f.orientation === "vertical"
    ? { x: f.offset, y: 0, r: f.offset + f.maskLength, b: s.h }
    : { x: 0, y: f.offset, r: s.w, b: f.offset + f.maskLength };
}

/** 對一份量測結果跑所有規則，回傳 [{ok, msg}] */
function evaluate(s, m, stateName) {
  const res = [];
  const add = (ok, msg) => res.push({ ok, msg: `${stateName}｜${msg}` });
  const named = {};
  for (const k of KEYS) if (m.keys[k]) named[k] = rectOf(m.keys[k]);
  if (m.dial) named["羅盤"] = rectOf(m.dial);
  const hinge = hingeRect(s);

  // 0) 摺疊模擬必須仍然生效（否則是測試工具的問題，而不是 App 的問題）
  if (s.fold) {
    const active = s.fold.orientation === "vertical" ? m.mq.h2 : m.mq.v2;
    add(active, `摺疊模擬仍生效（viewport-segments: 2 為 ${active}）`);
  }

  // 1) 不溢出視窗
  for (const [k, r] of Object.entries(named)) {
    const inside = r.x >= -tol && r.y >= -tol && r.r <= m.vw + tol && r.b <= m.vh + tol;
    add(inside, `${k} 在視窗內 (${Math.round(r.x)},${Math.round(r.y)})-(${Math.round(r.r)},${Math.round(r.b)}) / ${m.vw}×${m.vh}`);
  }
  // 2) 互不重疊
  const keys = Object.keys(named);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = inter(named[keys[i]], named[keys[j]]);
      if (a > 3) add(false, `${keys[i]} 與 ${keys[j]} 重疊 ${Math.round(a)}px²`);
    }
  }
  // 3) 羅盤大小
  if (m.dial) add(m.dial.w >= 170, `羅盤直徑 ${Math.round(m.dial.w)}px（≥170）`);
  else add(false, "找不到羅盤");
  // 3b) 內容不得溢出／被切（文字溢出膠囊、標題疊到按鈕、人名被擠扁…）
  for (const o of m.contentOverflow ?? []) add(false, o);
  // 4) 頁面不捲動
  add(m.scroll.sh <= m.vh + 1 && m.scroll.sw <= m.vw + 1, `頁面不捲動 (scroll ${m.scroll.sw}×${m.scroll.sh} / 視窗 ${m.vw}×${m.vh})`);
  // 5) 觸控目標
  const minCircle = Math.min(...m.circles.map((c) => Math.min(c.w, c.h)));
  add(m.circles.length === 4 && minCircle >= 44, `圓形操作鈕 ${m.circles.length} 顆，最小 ${Math.round(minCircle)}px（≥44）`);
  const minIcon = Math.min(...m.iconBtns.map((c) => Math.min(c.w, c.h)));
  add(m.iconBtns.length === 2 && minIcon >= 44, `漢堡鈕 ${m.iconBtns.length} 顆，最小 ${Math.round(minIcon)}px（≥44）`);
  // 6) 鉸鏈：任何內容都不能壓在鉸鏈上
  if (hinge) {
    const check = { ...named };
    if (m.sidePanel) check["側欄面板"] = rectOf(m.sidePanel);
    if (m.drawer) check["抽屜"] = rectOf(m.drawer);
    if (m.modal) check["校正視窗"] = rectOf(m.modal);
    if (m.toast) check["提示條"] = rectOf(m.toast);
    for (const [k, r] of Object.entries(check)) {
      const a = inter(r, hinge);
      add(a < 1, `${k} 未壓到鉸鏈${a >= 1 ? `（重疊 ${Math.round(a)}px²）` : ""}`);
    }
  }
  return res;
}

async function runScenario(s) {
  // 每個情境使用全新的瀏覽器行程：假相機裝置在同一行程內連續開關頁面時來不及釋放，會造成偶發的相機失敗
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: browserArgs({ extra: ["--enable-blink-features=ViewportSegments,CSSFoldables,FoldableAPIs", "--hide-scrollbars"] }),
  });
  try {
    return await runScenarioIn(browser, s);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runScenarioIn(browser, s) {
  const context = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: s.dpr,
    isMobile: true,
    hasTouch: true,
    permissions: ["camera"],
    locale: "zh-TW",
  });
  await context.addInitScript(() => {
    if (!localStorage.getItem("bazigfun.v1")) {
      localStorage.setItem(
        "bazigfun.v1",
        JSON.stringify({
          schemaVersion: 1,
          persons: [
            { id: "p1", name: "張明遠", birthDate: "1991-06-15", birthTime: null, sex: "female", kua: 6, createdAt: new Date().toISOString() },
          ],
          settings: { northReference: "magnetic", manualOffsetDeg: 0, currentPersonId: "p1" },
        }),
      );
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: s.w,
    height: s.h,
    deviceScaleFactor: s.dpr,
    mobile: true,
    ...(s.fold ? { displayFeature: s.fold } : {}),
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector(".compass-svg", { timeout: 20000 });
  // 持續送入朝向事件（315°，iOS webkitCompassHeading 語義）讓畫面維持「感測即時」
  await page.evaluate(() => {
    window.__hdg = 315;
    setInterval(() => {
      const e = new Event("deviceorientation");
      e.webkitCompassHeading = window.__hdg;
      e.webkitCompassAccuracy = 5;
      e.alpha = 45;
      e.beta = 90;
      e.gamma = 0;
      window.dispatchEvent(e);
    }, 30);
  });
  const camReady = () =>
    page
      .waitForFunction(() => {
        const v = document.querySelector("video.scene-video");
        return v && v.videoWidth > 0;
      }, null, { timeout: 6000 })
      .then(() => true)
      .catch(() => false);
  let cameraRetried = false;
  if (!(await camReady())) {
    // 模擬使用者：相機沒起來就點狀態列的「相機失敗／開啟相機」重試
    const retry = page.locator("button.chip-btn", { hasText: /相機|開啟/ });
    if (await retry.count()) {
      cameraRetried = true;
      await retry.first().click();
      await camReady();
    }
  }
  await page.waitForTimeout(900);

  const results = [];
  const shots = [];
  const shot = async (name) => {
    const hinge = hingeRect(s);
    if (hinge) {
      await page.evaluate((h) => {
        document.getElementById("__hinge")?.remove();
        const d = document.createElement("div");
        d.id = "__hinge";
        d.style.cssText = `position:fixed;z-index:99999;pointer-events:none;background:rgba(255,0,200,.45);left:${h.x}px;top:${h.y}px;width:${h.r - h.x}px;height:${h.b - h.y}px`;
        document.body.appendChild(d);
      }, hinge);
    }
    const file = join(OUT, `${s.id}__${name}.png`);
    // 注意：不用 page.screenshot——Playwright 截圖會重設 DevTools 的摺疊（displayFeature）模擬；
    // 直接走 CDP 的 Page.captureScreenshot 沒有這個副作用。
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(data, "base64"));
    shots.push(file);
    if (hinge) await page.evaluate(() => document.getElementById("__hinge")?.remove());
  };

  // 狀態 A：預設
  let m = await measure(page);
  const info = { mqH2: m.mq.h2, mqV2: m.mq.v2, video: m.video, viewport: `${m.vw}×${m.vh}` };
  if (s.fold) {
    const want = s.fold.orientation === "vertical" ? m.mq.h2 : m.mq.v2;
    results.push({ ok: want, msg: `預設｜瀏覽器回報 ${s.fold.orientation === "vertical" ? "horizontal" : "vertical"}-viewport-segments: 2 為 ${want}（摺疊模擬生效）` });
  }
  results.push({ ok: !!m.video && m.video.w > 0, msg: `預設｜相機即時畫面運作中 (${m.video ? `${m.video.w}×${m.video.h}` : "無"}${cameraRetried ? "；自動重試後仍失敗，已手動重試" : ""}；狀態列：${m.camChip.replace(/\s+/g, " ")})` });
  results.push(...evaluate(s, m, "預設"));
  await shot("A-default");

  // 狀態 B：手動羅盤（多一條微調列，底部要仍然放得下）
  await page.click(".action-btn.accent");
  await page.waitForSelector(".manual-bar", { timeout: 3000 });
  await page.waitForTimeout(250);
  m = await measure(page);
  results.push(...evaluate(s, m, "手動"));
  await shot("B-manual");
  await page.click(".action-btn.accent");
  await page.waitForTimeout(200);

  // 狀態 C：分析面板（寬螢幕／摺疊＝側欄常駐；其餘＝底部抽屜）
  await page.click(".detail-pill");
  await page.waitForTimeout(450);
  m = await measure(page);
  const panelVisible = !!(m.sidePanel || m.drawer);
  results.push({ ok: panelVisible, msg: "面板｜分析面板可見" });
  if (m.drawer) {
    const d = rectOf(m.drawer);
    results.push({ ok: d.x >= -tol && d.r <= m.vw + tol && d.b <= m.vh + tol && d.y >= 0, msg: `面板｜抽屜在視窗內 (${Math.round(d.y)}→${Math.round(d.b)} / ${m.vh})` });
    results.push({ ok: !!m.drawerClose && m.drawerClose.w >= 30, msg: "面板｜抽屜有可見的關閉鈕" });
  }
  if (m.sidePanel) {
    const p = rectOf(m.sidePanel);
    results.push({ ok: p.x >= -tol && p.r <= m.vw + tol && p.b <= m.vh + tol && p.y >= -tol, msg: `面板｜側欄在視窗內 (${Math.round(p.x)},${Math.round(p.y)})-(${Math.round(p.r)},${Math.round(p.b)})` });
  }
  const hinge = hingeRect(s);
  if (hinge) {
    for (const [k, r] of [["抽屜", m.drawer], ["側欄", m.sidePanel]]) {
      if (r) {
        const a = inter(rectOf(r), hinge);
        results.push({ ok: a < 1, msg: `面板｜${k}未壓到鉸鏈${a >= 1 ? `（重疊 ${Math.round(a)}px²）` : ""}` });
      }
    }
  }
  await shot("C-panel");
  if (m.drawer) await page.click(".drawer-close").catch(() => {});

  // 狀態 D：校正視窗與提示條（置中浮層也不能壓到鉸鏈）
  await page.evaluate(() => {
    document.querySelector(".drawer-close")?.click();
  });
  await page.waitForTimeout(250);
  await page.click(".action-btn:nth-child(1)");
  await page.waitForSelector(".modal", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(250);
  m = await measure(page);
  if (m.modal) {
    const r = rectOf(m.modal);
    results.push({ ok: r.x >= -tol && r.y >= -tol && r.r <= m.vw + tol && r.b <= m.vh + tol, msg: `校正視窗｜在視窗內 (${Math.round(r.x)},${Math.round(r.y)})-(${Math.round(r.r)},${Math.round(r.b)})` });
    if (hinge) {
      const a = inter(r, hinge);
      results.push({ ok: a < 1, msg: `校正視窗｜未壓到鉸鏈${a >= 1 ? `（重疊 ${Math.round(a)}px²）` : ""}` });
    }
  } else results.push({ ok: false, msg: "校正視窗｜沒有出現" });
  await shot("D-modal");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.click("button.chip-btn", { timeout: 2000 }).catch(() => {}); // 「磁北」→ 跳出提示條
  await page.waitForTimeout(300);
  m = await measure(page);
  if (m.toast && hinge) {
    const a = inter(rectOf(m.toast), hinge);
    results.push({ ok: a < 1, msg: `提示條｜未壓到鉸鏈${a >= 1 ? `（重疊 ${Math.round(a)}px²）` : ""}` });
  }

  results.push({ ok: errors.length === 0, msg: `主控台無錯誤${errors.length ? `：${errors.slice(0, 2).join(" | ")}` : ""}` });
  await context.close();
  return { s, results, shots, info };
}

mkdirSync(OUT, { recursive: true });

console.log(`瀏覽器：${exe}\n網址：${URL}\n`);
const all = [];
for (const s of SCENARIOS) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  try {
    all.push(await runScenario(s));
  } catch (e) {
    all.push({ s, results: [{ ok: false, msg: `執行失敗：${e.message}` }], shots: [], info: {} });
  }
}
let failed = 0;
for (const { s, results, info } of all) {
  const bad = results.filter((r) => !r.ok);
  failed += bad.length;
  console.log(`${bad.length ? "✗" : "✓"} ${s.name}  [${s.w}×${s.h}${s.fold ? `，鉸鏈 ${s.fold.orientation} @${s.fold.offset}+${s.fold.maskLength}` : ""}]  ${results.length - bad.length}/${results.length} 項通過`);
  for (const r of bad) console.log(`    ✗ ${r.msg}`);
}
writeFileSync(join(OUT, "report.json"), JSON.stringify(all.map(({ s, results, info }) => ({ id: s.id, name: s.name, info, results })), null, 2));
console.log(`\n${failed === 0 ? "全部通過" : `共 ${failed} 項未通過`}。截圖與報告：${OUT}`);
process.exit(failed === 0 ? 0 : 1);
