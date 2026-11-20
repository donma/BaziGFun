/**
 * 方位引擎：角度正規化、圓形濾波、遲滯、扇區分類、退化狀態。
 * 純函式，可完整單元測試。
 */

import { PALACES, sectorCenterDeg, boundaryDistanceDeg as boundaryDistanceDegImpl, BOUNDARY_WARN_DEG, type DirectionDeg, type StarKey } from "../bazhai/bazhai";

export type NorthReference = "magnetic" | "true";
export type HeadingSource = "sensor" | "manual";
export type Quality = "valid" | "uncertain" | "unavailable";

export interface HeadingState {
  /** 原始測量值（未平滑），度 0–360 */
  rawHeading: number | null;
  /** 平滑顯示值，度 0–360 */
  displayHeading: number | null;
  /** 相機水平朝向（若鏡頭非水平投影退化則 null） */
  cameraAzimuth: number | null;
  northReference: NorthReference;
  source: HeadingSource;
  quality: Quality;
  /** 距最近扇區邊界的角度 */
  boundaryDistance: number | null;
  /** 距邊界過近，吉凶交界提示 */
  nearBoundary: boolean;
  /** 水平投影退化（鏡頭近垂直朝天/地） */
  tiltDegraded: boolean;
  /** pitch（度，0=水平，正=朝天） */
  pitch: number | null;
  /** roll（度） */
  roll: number | null;
}

/** 角度正規化至 0–360 */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 兩角度最短角差（-180..180） */
export function shortestAngleDiff(a: number, b: number): number {
  let d = normalizeDeg(a - b);
  if (d > 180) d -= 360;
  return d;
}

/** 圓形插值（最短角路徑） */
export function circularLerp(from: number, to: number, t: number): number {
  return normalizeDeg(from + shortestAngleDiff(to, from) * t);
}

/** 一階低通圓形濾波器 */
export class CircularLowPass {
  private value: number | null = null;
  constructor(private alpha: number) {}
  push(raw: number): number {
    if (this.value === null) {
      this.value = normalizeDeg(raw);
    } else {
      this.value = circularLerp(this.value, raw, this.alpha);
    }
    return this.value;
  }
  reset(): void {
    this.value = null;
  }
  get(): number | null {
    return this.value;
  }
}

/** 吉凶遲滯器：扇區切換需越過邊界 + hysteresis 度才更新，避免 UI 閃爍 */
export class SectorHysteresis {
  private current: DirectionDeg | null = null;
  constructor(private hysteresisDeg = 1.5) {}
  /**
   * @param heading 顯示角度
   * @param lastStable 上一次穩定輸出（null 起始）
   * @returns 穩定後的扇區中心角
   */
  update(heading: number): { sector: DirectionDeg | null; changed: boolean; forced: boolean } {
    const raw = sectorCenterDeg(heading);
    if (raw === null) return { sector: this.current, changed: false, forced: false };
    if (this.current === null) {
      this.current = raw;
      return { sector: raw, changed: true, forced: false };
    }
    if (raw === this.current) return { sector: this.current, changed: false, forced: false };
    // 需越過邊界 hysteresisDeg 才切換
    const dist = boundaryDistanceDeg(heading);
    if (dist <= this.hysteresisDeg) {
      // 在遲滯帶內，保持
      return { sector: this.current, changed: false, forced: false };
    }
    const prev = this.current;
    this.current = raw;
    return { sector: raw, changed: true, forced: false, ...{} as { prev?: DirectionDeg }, prev } as { sector: DirectionDeg | null; changed: boolean; forced: boolean; prev?: DirectionDeg };
  }
  reset(): void {
    this.current = null;
  }
  get(): DirectionDeg | null {
    return this.current;
  }
}

/** 距扇區邊界的角距離（重新導出供本模組與 UI 使用） */
export function boundaryDistanceDeg(deg: number): number {
  return boundaryDistanceDegImpl(deg);
}

/** 鏡頭近垂直（朝天或朝地）時水平投影退化 */
export function isTiltDegraded(pitchDeg: number, rollDeg: number): boolean {
  const p = Math.abs(pitchDeg);
  return p > 60;
}

/** 由 DeviceOrientation 原始值換算相機水平朝向（後置鏡頭）。
 *  iOS webkitCompassHeading 已是「裝置頂部朝向」的指南針值（直立、鏡頭朝前時）。
 *  當裝置姿態改變（pitch/roll），需要幾何補償：
 *  heading_cam = compassHeading + screenOrientation 語義校正（此處簡化：webkit 已含螢幕校正）
 */
export function computeCameraAzimuth(
  compassHeading: number,
  alpha: number | null,
  screenOrientationDeg: number,
  useWebkit: boolean,
): number {
  if (useWebkit) {
    // webkitCompassHeading：與 window.orientation 對齊的「北與裝置頂方向夾角」
    // 相機朝向 = webkitCompassHeading（後置鏡頭與裝置頂同向）
    return normalizeDeg(compassHeading);
  }
  // 標準 alpha：逆時針，且需螢幕方向校正
  if (alpha === null) return NaN;
  return normalizeDeg(360 - alpha - screenOrientationDeg);
}

/** 磁北 ↔ 真北換算（declination = 真北 - 磁北，東偏為正） */
export function applyDeclination(headingDeg: number, declinationDeg: number): number {
  return normalizeDeg(headingDeg + declinationDeg);
}

export interface DirectionalReading {
  deg: number;
  palace: string;
  branch: string;
  star: StarKey | null;
  nearBoundary: boolean;
}

/** 由角度得到方位閱讀（宮位、吉凶、交界提示） */
export function directionalReading(
  deg: number,
  starFn: (deg: DirectionDeg) => StarKey,
): DirectionalReading {
  const sector = sectorCenterDeg(deg);
  const bd = boundaryDistanceDeg(deg);
  const p = PALACES.find((x) => x.deg === sector);
  return {
    deg: normalizeDeg(deg),
    palace: p?.name ?? "—",
    branch: p?.branch ?? "—",
    star: sector !== null ? starFn(sector) : null,
    nearBoundary: bd <= BOUNDARY_WARN_DEG,
  };
}
