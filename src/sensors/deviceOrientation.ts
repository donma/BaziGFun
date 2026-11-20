/**
 * DeviceOrientation adapter：能力偵測、iOS 權限、事件解讀。
 * 不假設 webkitCompassHeading 一定存在或語義正確——以存在性與實測標定為前提。
 */

export interface OrientationSample {
  /** 指南針航向（若有可靠語義），0–360 */
  heading: number | null;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  /** webkitCompassHeading 原始值（存在時） */
  webkitHeading: number | null;
  /** webkitCompassAccuracy 原始值（存在時） */
  webkitAccuracy: number | null;
  /** 螢幕方向角（0/90/180/270） */
  screenOrientation: number;
  timestamp: number;
}

export type SensorPermission = "granted" | "denied" | "prompt" | "unsupported";

export interface SensorCapabilities {
  hasDeviceOrientation: boolean;
  hasRequestPermission: boolean; // iOS 13+ DeviceOrientationEvent.requestPermission
  hasWebkitCompassHeading: boolean; // 需實際事件後才可確認；此為 API 靜態偵測
  isIOS: boolean;
  isSecureContext: boolean;
}

export function detectCapabilities(): SensorCapabilities {
  const d = window as unknown as Record<string, unknown>;
  const DeviceOrientationEvent = d.DeviceOrientationEvent as
    | (typeof globalThis & { requestPermission?: () => Promise<"granted" | "denied"> })
    | undefined;
  return {
    hasDeviceOrientation: typeof DeviceOrientationEvent !== "undefined",
    hasRequestPermission:
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function",
    hasWebkitCompassHeading: false, // 僅能在事件中確認
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform ?? "")),
    isSecureContext: window.isSecureContext,
  };
}

/** 請求方向感測器權限（iOS 13+ 需手勢中呼叫） */
export async function requestOrientationPermission(): Promise<SensorPermission> {
  const d = window as unknown as Record<string, unknown>;
  const DeviceOrientationEvent = d.DeviceOrientationEvent as
    | (typeof globalThis & { requestPermission?: () => Promise<"granted" | "denied"> })
    | undefined;
  if (typeof DeviceOrientationEvent === "undefined") return "unsupported";
  if (typeof DeviceOrientationEvent.requestPermission !== "function") {
    // 非 iOS 13+：Android/桌面直接嘗試監聽
    return "granted";
  }
  try {
    const res = await DeviceOrientationEvent.requestPermission();
    return res === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/** 解讀 DeviceOrientationEvent → 樣本 */
export function parseOrientationEvent(e: DeviceOrientationEvent): OrientationSample {
  const w = e as DeviceOrientationEvent & {
    webkitCompassHeading?: number;
    webkitCompassAccuracy?: number;
  };
  return {
    heading: typeof w.webkitCompassHeading === "number" && Number.isFinite(w.webkitCompassHeading)
      ? w.webkitCompassHeading
      : null,
    alpha: Number.isFinite(e.alpha ?? NaN) ? e.alpha : null,
    beta: Number.isFinite(e.beta ?? NaN) ? e.beta : null,
    gamma: Number.isFinite(e.gamma ?? NaN) ? e.gamma : null,
    webkitHeading: typeof w.webkitCompassHeading === "number" ? w.webkitCompassHeading : null,
    webkitAccuracy: typeof w.webkitCompassAccuracy === "number" ? w.webkitCompassAccuracy : null,
    screenOrientation: typeof screen.orientation === "object" ? screen.orientation.angle : (window.orientation as number) ?? 0,
    timestamp: Date.now(),
  };
}

/** 監聽器訂閱 */
export function subscribeOrientation(cb: (s: OrientationSample) => void): () => void {
  const handler = (e: DeviceOrientationEvent) => {
    const absolute = (e as DeviceOrientationEvent & { absolute?: boolean }).absolute;
    void absolute;
    cb(parseOrientationEvent(e));
  };
  window.addEventListener("deviceorientation", handler, true);
  return () => window.removeEventListener("deviceorientation", handler, true);
}
