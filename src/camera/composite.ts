/**
 * 拍照合成：把「畫面上看到的」存成 JPEG。
 *
 * 規格要求「使用與螢幕一致的裁切規則」：相機畫面在螢幕上是 object-fit: cover，
 * 所以這裡以同樣的 cover 規則由 video 取出可見區域，羅盤也放在它在螢幕上的相同位置與大小。
 * 輸出尺寸以可見區域的原生解析度為準，最長邊上限 maxEdge（控制記憶體）。
 *
 * 字體：SVG 轉成圖片後無法使用頁面上的 @font-face，因此把內嵌字體以 data URI 寫進 SVG，
 * 讓照片裡的羅盤文字與螢幕上一致；資訊卡用 canvas 繪字，使用已載入的頁面字體。
 */
import fontUrl from "../assets/fonts/bz-serif-bold.woff2?url";
import { DIAL_SERIF } from "../components/BaguaDial";
import { computeCoverCrop } from "./coverCrop";

export interface CaptureInfo {
  /** 第一行：人物與命卦 */
  headline: string;
  /** 主行：角度、方位、吉凶 */
  main: string;
  /** 小字：時間、基準、來源、可信狀態 */
  meta: string;
  tone: "good" | "bad";
  /** 接近交界提示 */
  warn?: string;
}

export interface CompositeInput {
  /** 正在播放的相機 video；null＝沒有相機（以暖色底代替） */
  video: HTMLVideoElement | null;
  /** .scene 元素（決定可見區域與寬高比） */
  sceneEl: HTMLElement;
  /** 羅盤 SVG */
  dialEl: SVGSVGElement | null;
  info: CaptureInfo;
  maxEdge?: number;
  quality?: number;
}

let fontDataUri: Promise<string> | null = null;

function loadFontDataUri(): Promise<string> {
  if (!fontDataUri) {
    fontDataUri = fetch(fontUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return `data:font/woff2;base64,${btoa(bin)}`;
      });
  }
  return fontDataUri;
}

async function dialToImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const dataUri = await loadFontDataUri();
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `@font-face{font-family:'BZ Serif';font-weight:700;font-style:normal;src:url(${dataUri}) format('woff2');}`;
  clone.insertBefore(style, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("羅盤圖片載入失敗"));
      img.src = url;
    });
    return img;
  } finally {
    // 圖片已解碼進記憶體後即可釋放（drawImage 前仍持有 img 物件）
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export async function composeCapture(input: CompositeInput): Promise<Blob> {
  const { video, sceneEl, dialEl, info } = input;
  const maxEdge = input.maxEdge ?? 2048;
  const sr = sceneEl.getBoundingClientRect();
  const W = sr.width;
  const H = sr.height;

  // 1) 背景：相機畫面依 cover 規則裁切
  let outW: number;
  let outH: number;
  let src: { sx: number; sy: number; sw: number; sh: number } | null = null;
  const hasVideo = !!video && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2;
  if (hasVideo && video) {
    const crop = computeCoverCrop(video.videoWidth, video.videoHeight, W, H);
    src = { sx: crop.sx, sy: crop.sy, sw: crop.sw, sh: crop.sh };
    outW = crop.sw;
    outH = crop.sh;
  } else {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    outW = W * dpr;
    outH = H * dpr;
  }
  const down = Math.min(1, maxEdge / Math.max(outW, outH));
  const cw = Math.round(outW * down);
  const ch = Math.round(outH * down);
  const k = cw / W; // 螢幕 CSS px → 畫布 px

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法建立畫布（可能記憶體不足）");

  if (src && video) {
    ctx.drawImage(video, src.sx, src.sy, src.sw, src.sh, 0, 0, cw, ch);
  } else {
    const g = ctx.createRadialGradient(cw / 2, ch * 0.38, 0, cw / 2, ch * 0.38, Math.max(cw, ch) * 0.8);
    g.addColorStop(0, "#8c7852");
    g.addColorStop(0.55, "#5f5039");
    g.addColorStop(1, "#3a2f20");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }

  // 2) 羅盤：放在它在螢幕上的相同位置與大小
  if (dialEl) {
    const dr = dialEl.getBoundingClientRect();
    const img = await dialToImage(dialEl, Math.round(dr.width * k), Math.round(dr.height * k));
    ctx.drawImage(img, (dr.left - sr.left) * k, (dr.top - sr.top) * k, dr.width * k, dr.height * k);
  }

  // 3) 資訊卡（底部）
  try {
    await document.fonts.load(`700 ${Math.round(cw * 0.05)}px "BZ Serif"`, info.main);
  } catch {
    /* 字體載入失敗時退回系統字體 */
  }
  const m = cw * 0.04;
  const cardW = cw - m * 2;
  const pad = cw * 0.035;
  const fsHead = cw * 0.032;
  const fsMain = cw * 0.058;
  const fsMeta = cw * 0.026;
  const cardH = pad * 2 + fsHead * 1.25 + fsMain * 1.35 + fsMeta * 1.4 + (info.warn ? fsMeta * 1.5 : 0);
  const cardX = m;
  const cardY = ch - m - cardH;

  roundRect(ctx, cardX, cardY, cardW, cardH, cw * 0.03);
  ctx.fillStyle = "rgba(250,245,232,0.93)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, cw * 0.0025);
  ctx.strokeStyle = "rgba(201,164,92,0.85)";
  ctx.stroke();

  const sans = `"PingFang TC","Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei","Heiti TC",system-ui,sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let y = cardY + pad;
  ctx.fillStyle = "#5a4d33";
  ctx.font = `700 ${fsHead}px ${sans}`;
  ctx.fillText(info.headline, cardX + pad, y, cardW - pad * 2);
  y += fsHead * 1.25;

  ctx.fillStyle = info.tone === "good" ? "#2b6a33" : "#a3342a";
  ctx.font = `700 ${fsMain}px ${DIAL_SERIF.replace(/'/g, '"')}`;
  ctx.fillText(info.main, cardX + pad, y, cardW - pad * 2);
  y += fsMain * 1.35;

  ctx.fillStyle = "#6b5d3f";
  ctx.font = `600 ${fsMeta}px ${sans}`;
  ctx.fillText(info.meta, cardX + pad, y, cardW - pad * 2);
  if (info.warn) {
    y += fsMeta * 1.5;
    ctx.fillStyle = "#9a5a08";
    ctx.fillText(info.warn, cardX + pad, y, cardW - pad * 2);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG 輸出失敗（可能記憶體不足）"))),
      "image/jpeg",
      input.quality ?? 0.88,
    );
  });
}
