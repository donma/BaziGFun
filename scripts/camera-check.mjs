/**
 * 相機、拍照與匯出實測：真實 Edge／Chrome（循環播放的假相機畫面＋DevTools 方向模擬）走完整流程。
 *
 * A) 相機串流：畫面是即時串流（不是靜態圖）、持續活著、不是黑畫面
 * B) 相機生命週期：外力中斷 → 介面如實標示並可重試；切到背景 → 關閉鏡頭、回前景 → 重開；
 *    啟動途中就被切到背景 → 鏡頭一取得立刻還回去（不會在背景偷偷開著相機）
 * C) 拍照：鏡頭朝西北 → 「拍照紀錄」→ JPEG 存進 IndexedDB、紀錄欄位正確；
 *    照片的寬高比與螢幕可見區一致、相機畫面是背景、羅盤畫在螢幕上的相同位置、底部有資訊卡
 * D) 匯出：右上漢堡 → 紀錄 → 匯出 ZIP → 解開後含 bazigfun-data.json 與同一張照片（位元組完全相同）
 *
 * 用法：npm run dev   然後   npm run test:camera   （--url=<網址> 指定網址；--out=<資料夾> 指定輸出）
 * 輸出：<out>/camera-photo.jpg（拍到的照片）、<out>/camera-screen.png（拍照當下的畫面）、<out>/camera-export.zip
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";
import path from "node:path";
import { browserArgs, requireBrowser, TEST_STORAGE } from "./lib/test-browser.mjs";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const APP_URL = opt("url", "http://localhost:5173/BaziGFun/");
const OUT = path.resolve(opt("out", "scripts/.cache/shots"));
mkdirSync(OUT, { recursive: true });
const exe = requireBrowser();

let failed = 0;
const line = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
};
const section = (t) => console.log(`\n【${t}】`);
const sha = (u8) => createHash("sha256").update(u8).digest("hex").slice(0, 12);

/** 每個段落用全新的瀏覽器行程，避免假相機裝置在同一行程內被連續開關而互相影響 */
async function withPage(fn, { init } = {}) {
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: browserArgs() });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      acceptDownloads: true,
      permissions: ["camera", "accelerometer", "gyroscope", "magnetometer"],
      locale: "zh-TW",
    });
    await ctx.addInitScript(
      ({ storage, extra }) => {
        if (!sessionStorage.getItem("__seeded")) {
          sessionStorage.setItem("__seeded", "1");
          localStorage.setItem("bazigfun.v1", JSON.stringify(storage));
        }
        // 記錄所有取得的串流，並可在第一次 getUserMedia 一送出就「切到背景」
        window.__streams = [];
        window.__hideOnFirstGum = false;
        const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (c) => {
          const p = orig(c);
          if (window.__hideOnFirstGum) {
            window.__hideOnFirstGum = false;
            setTimeout(() => {
              Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
              document.dispatchEvent(new Event("visibilitychange"));
            }, 0);
          }
          return p.then((s) => {
            window.__streams.push(s);
            return s;
          });
        };
        if (extra) new Function(extra)();
      },
      { storage: TEST_STORAGE, extra: init ?? "" },
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const cdp = await ctx.newCDPSession(page);
    return await fn({ page, cdp, errors });
  } finally {
    await browser.close().catch(() => {});
  }
}

/** 取 video 目前畫面的平均色（64×36 縮圖）與串流狀態 */
const probeVideo = (page) =>
  page.evaluate(() => {
    const v = document.querySelector(".scene video");
    if (!v) return null;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 36;
    const x = c.getContext("2d");
    x.drawImage(v, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data;
    let r = 0, g = 0, b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const t = v.srcObject?.getVideoTracks?.()[0];
    return { w: v.videoWidth, h: v.videoHeight, avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], track: t?.readyState ?? "none", hasStream: !!v.srcObject };
  });
const brightness = (c) => (c[0] + c[1] + c[2]) / 3;
const camChip = (page) => page.locator(".status-strip .chip", { hasText: /相機/ }).first();
const chipText = async (page) => ((await camChip(page).textContent().catch(() => "")) ?? "").trim();

/** 鏡頭朝西北（alpha=45, beta=90）→ 315°，乾六命＝伏位（吉） */
async function holdNW(page, cdp, n = 40) {
  for (let i = 0; i < n; i++) {
    const j = i % 2 ? 0.25 : -0.25;
    await cdp.send("DeviceOrientation.setDeviceOrientationOverride", { alpha: 45 + j, beta: 90 + j, gamma: j });
    await page.waitForTimeout(18);
  }
  await page.waitForTimeout(250);
}

async function openApp(page) {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.waitForSelector(".compass-svg");
  await page.waitForFunction(() => {
    const v = document.querySelector(".scene video");
    return v && v.videoWidth > 0 && v.readyState >= 2;
  }, null, { timeout: 15000 }).catch(() => {});
}

/* ===================== A) 相機串流 ===================== */
section("A 相機串流（即時畫面、不是靜態圖）");
await withPage(async ({ page, errors }) => {
  await openApp(page);
  const first = await probeVideo(page);
  line(!!first && first.w > 0 && first.track === "live", `串流運作中：${first ? `${first.w}×${first.h}、track=${first.track}` : "無 video"}`);
  line(!!first && brightness(first.avg) > 60, `畫面不是黑的：平均色 rgb(${first?.avg.join(",")})`);

  // 瀏覽器內建假相機約 3 秒就會自行結束；這裡等 6 秒，確認串流（與 App 的狀態）一直活著
  await page.waitForTimeout(6000);
  const later = await probeVideo(page);
  line(!!later && later.track === "live" && brightness(later.avg) > 60, `6 秒後仍是即時串流：track=${later?.track}、平均色 rgb(${later?.avg.join(",")})`);
  line((await chipText(page)) === "相機✓", `狀態列：「${await chipText(page)}」`);

  const noStatic = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(".scene, .scene *")) {
      const bg = getComputedStyle(el).backgroundImage;
      if (/url\(/.test(bg)) bad.push(`${el.className || el.tagName} → ${bg.slice(0, 40)}`);
    }
    const imgs = document.querySelectorAll(".scene-media img, .scene-media picture").length;
    return { bad, imgs };
  });
  line(noStatic.bad.length === 0 && noStatic.imgs === 0, `主畫面沒有任何靜態背景圖（url() 背景 ${noStatic.bad.length}、<img> ${noStatic.imgs}）`);
  line(errors.length === 0, `主控台無錯誤${errors.length ? "：" + errors.slice(0, 2).join(" | ") : ""}`);
});

/* ===================== B) 相機生命週期 ===================== */
section("B 相機生命週期（中斷、背景、取消）");
await withPage(async ({ page, errors }) => {
  await openApp(page);
  line((await chipText(page)) === "相機✓", `起始狀態：「${await chipText(page)}」`);

  // B1 外力中斷（其他 App 搶走相機）：track 發出 ended
  await page.evaluate(() => {
    const t = document.querySelector(".scene video").srcObject.getVideoTracks()[0];
    t.dispatchEvent(new Event("ended"));
  });
  await page.waitForTimeout(400);
  const afterEnd = {
    chip: await chipText(page),
    fallback: await page.locator(".scene-fallback").count(),
    stream: await page.evaluate(() => !!document.querySelector(".scene video")?.srcObject),
    toast: (await page.locator(".toast").textContent().catch(() => "")) ?? "",
  };
  line(afterEnd.chip === "相機中斷", `串流被外力結束 → 狀態列如實顯示「${afterEnd.chip}」（不再標示 相機✓）`);
  line(afterEnd.fallback === 1 && !afterEnd.stream, `死掉的串流已卸下，改顯示備用底色（fallback=${afterEnd.fallback}、srcObject=${afterEnd.stream ? "仍在" : "已移除"}）`);
  line(/相機畫面中斷/.test(afterEnd.toast), `出現提示：「${afterEnd.toast}」`);

  // B2 點狀態列重試 → 新串流
  await camChip(page).click();
  await page.waitForFunction(() => document.querySelector(".status-strip")?.textContent?.includes("相機✓"), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  const retried = await probeVideo(page);
  line((await chipText(page)) === "相機✓" && !!retried && retried.track === "live" && brightness(retried.avg) > 60, `點「相機中斷」重試後恢復：「${await chipText(page)}」、track=${retried?.track}、平均色 rgb(${retried?.avg.join(",")})`);

  // B3 切到背景 → 關閉鏡頭；回前景 → 重新開啟
  const liveBefore = await page.evaluate(() => window.__streams.filter((s) => s.getTracks().some((t) => t.readyState === "live")).length);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  const hiddenState = await page.evaluate(() => ({
    live: window.__streams.filter((s) => s.getTracks().some((t) => t.readyState === "live")).length,
    srcObject: !!document.querySelector(".scene video")?.srcObject,
  }));
  line(liveBefore >= 1 && hiddenState.live === 0 && !hiddenState.srcObject, `切到背景：作用中的鏡頭串流 ${liveBefore} → ${hiddenState.live}（隱私：背景不開鏡頭）`);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() => document.querySelector(".status-strip")?.textContent?.includes("相機✓"), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const back = await probeVideo(page);
  line((await chipText(page)) === "相機✓" && !!back && back.track === "live" && brightness(back.avg) > 60, `回到前景自動重開：「${await chipText(page)}」、track=${back?.track}`);
  line(errors.length === 0, `主控台無錯誤${errors.length ? "：" + errors.slice(0, 2).join(" | ") : ""}`);
});

await withPage(
  async ({ page, errors }) => {
    // B4 啟動途中（getUserMedia 還沒回來）就被切到背景：鏡頭一取得就必須還回去
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    await page.waitForSelector(".compass-svg");
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      streams: window.__streams.length,
      live: window.__streams.filter((s) => s.getTracks().some((t) => t.readyState === "live")).length,
      srcObject: !!document.querySelector(".scene video")?.srcObject,
    }));
    const chip = await chipText(page);
    line(r.streams >= 1 && r.live === 0 && !r.srcObject, `啟動途中被切到背景：取得 ${r.streams} 個串流、其中仍開著 ${r.live} 個（必須為 0）`);
    line(chip !== "相機✓", `且不會誤報「相機✓」：狀態列為「${chip}」`);
    line(errors.length === 0, `主控台無錯誤${errors.length ? "：" + errors.slice(0, 2).join(" | ") : ""}`);
  },
  { init: "window.__hideOnFirstGum = true;" },
);

/* ===================== C) 拍照 ===================== */
section("C 拍照（鏡頭朝西北 315°，乾六命＝伏位）");
let savedPhoto = null;
await withPage(async ({ page, cdp, errors }) => {
  await openApp(page);
  const video = await probeVideo(page);
  line(!!video && video.w > 0, `相機即時畫面運作中（${video ? `${video.w}×${video.h}` : "無"}）`);
  await holdNW(page, cdp);
  const big = (await page.textContent(".heading-big"))?.replace(/\s+/g, "") ?? "";
  const pill = (await page.textContent(".star-pill"))?.replace(/\s+/g, "") ?? "";
  line(/^315°西北$/.test(big) && pill.startsWith("伏位"), `拍照前畫面：${big} ${pill}`);

  const geo = await page.evaluate(() => {
    const b = document.querySelector(".scene").getBoundingClientRect();
    return { w: b.width, h: b.height };
  });
  writeFileSync(path.join(OUT, "camera-screen.png"), await page.screenshot());

  const captureBtn = page.locator(".action-btn").nth(2);
  line(await captureBtn.isEnabled(), "「拍照紀錄」可按（感測有效、方位可判定）");
  await captureBtn.click();
  await page.waitForSelector('.toast:has-text("已拍照並記錄")', { timeout: 15000 }).catch(() => {});
  line((await page.locator(".toast").textContent().catch(() => "")) === "已拍照並記錄", "出現提示「已拍照並記錄」");

  const stored = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open("bazigfun", 1);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const all = (store) =>
      new Promise((res, rej) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    const records = await all("records");
    const photos = await all("photos");
    const out = { records, photos: [] };
    for (const p of photos) {
      const buf = new Uint8Array(await p.blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const bmp = await createImageBitmap(p.blob);
      const cv = document.createElement("canvas");
      cv.width = bmp.width;
      cv.height = bmp.height;
      const cx = cv.getContext("2d");
      cx.drawImage(bmp, 0, 0);
      // 取樣：[x 比例, y 比例] → 該點 3×3 區域平均色
      const sample = (fx, fy) => {
        const x = Math.max(0, Math.min(bmp.width - 3, Math.round(bmp.width * fx) - 1));
        const y = Math.max(0, Math.min(bmp.height - 3, Math.round(bmp.height * fy) - 1));
        const d = cx.getImageData(x, y, 3, 3).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
      };
      out.photos.push({
        id: p.id,
        type: p.mimeType,
        blobType: p.blob.type,
        size: buf.length,
        w: bmp.width,
        h: bmp.height,
        b64: btoa(bin),
        samples: { topLeft: sample(0.06, 0.04), dialCenter: sample(0.5, 0.5), bottomCard: sample(0.5, 0.93) },
      });
    }
    return out;
  });

  line(stored.records.length === 1 && stored.photos.length === 1, `IndexedDB：紀錄 ${stored.records.length} 筆、照片 ${stored.photos.length} 張`);
  const rec = stored.records[0];
  const photo = stored.photos[0];
  if (rec && photo) {
    line(rec.photoId === photo.id, `紀錄的 photoId 對得上照片（${rec.photoId.slice(0, 8)}…）`);
    line(rec.northReference === "magnetic" && rec.source === "sensor", `紀錄基準與來源：northReference=${rec.northReference}、source=${rec.source}`);
    line(Math.abs(rec.azimuthDisplay - 315) <= 3 && rec.palace === "乾" && rec.star === "fuWei", `紀錄內容：${rec.azimuthDisplay}°、宮位 ${rec.palace}、星 ${rec.star}、可信度 ${rec.quality}`);

    const bytes = Buffer.from(photo.b64, "base64");
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    line(isJpeg && photo.type === "image/jpeg" && photo.blobType === "image/jpeg", `照片為合法 JPEG（${(photo.size / 1024).toFixed(1)} KiB、${photo.w}×${photo.h}）`);
    writeFileSync(path.join(OUT, "camera-photo.jpg"), bytes);

    const sceneAspect = geo.w / geo.h;
    const photoAspect = photo.w / photo.h;
    line(Math.abs(photoAspect - sceneAspect) / sceneAspect < 0.01, `照片寬高比 ${photoAspect.toFixed(3)} 與螢幕可見區 ${sceneAspect.toFixed(3)} 一致（同一套 cover 裁切）`);

    const { topLeft, dialCenter, bottomCard } = photo.samples;
    const warmWall = topLeft[0] > topLeft[1] && topLeft[1] > topLeft[2] && brightness(topLeft) > 120;
    line(warmWall, `背景是相機畫面（測試場景的米色牆）：左上角取樣 rgb(${topLeft.join(",")})`);
    line(brightness(dialCenter) < 70, `羅盤畫在螢幕上的相同位置：盤心取樣 rgb(${dialCenter.join(",")})（深色圓盤）`);
    const isCream = bottomCard[0] > 215 && bottomCard[1] > 205 && bottomCard[2] > 180;
    line(isCream, `底部資訊卡（米白底）：取樣 rgb(${bottomCard.join(",")})`);
    savedPhoto = { id: photo.id, sha: sha(bytes) };
  }

  /* ===================== D) 匯出 ===================== */
  section("D 匯出 ZIP（右上漢堡 → 紀錄 → 匯出 ZIP）");
  await page.click('button[aria-label="紀錄與匯出"]');
  const zipBtn = page.locator('button:has-text("匯出 ZIP"):visible').first();
  await zipBtn.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(400);
  line((await page.locator(".thumb:visible").count()) >= 1, "紀錄清單顯示縮圖");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), zipBtn.click()]);
  const zipPath = path.join(OUT, "camera-export.zip");
  await download.saveAs(zipPath);
  line(/^bazigfun-export-\d{8}\.zip$/.test(download.suggestedFilename()), `下載檔名 ${download.suggestedFilename()}`);

  const files = unzipSync(new Uint8Array(readFileSync(zipPath)));
  const names = Object.keys(files);
  line(names.includes("bazigfun-data.json") && names.some((n) => /^photos\/.+\.jpg$/.test(n)), `ZIP 內容：${names.join("、")}`);
  const json = JSON.parse(strFromU8(files["bazigfun-data.json"]));
  line(json.schemaVersion === 1 && json.persons.length === 1 && json.records.length === 1 && json.photos.length === 1, `JSON：schemaVersion=${json.schemaVersion}、人物 ${json.persons.length}、紀錄 ${json.records.length}、照片 ${json.photos.length}`);
  line(json.records[0]?.northReference === "magnetic" && json.settings?.northReference === "magnetic", "JSON 的北向基準為磁北");
  const zipped = savedPhoto ? files[`photos/${savedPhoto.id}.jpg`] : null;
  line(!!zipped && !!savedPhoto && sha(zipped) === savedPhoto.sha, `ZIP 內照片與拍到的照片位元組相同（sha256 ${zipped ? sha(zipped) : "無"}）`);

  line(errors.length === 0, `主控台無錯誤${errors.length ? "：" + errors.slice(0, 2).join(" | ") : ""}`);
});

console.log(failed === 0 ? "\n相機、拍照與匯出實測全部通過" : `\n共 ${failed} 項未通過`);
console.log(`輸出：${OUT}`);
process.exit(failed === 0 ? 0 : 1);
