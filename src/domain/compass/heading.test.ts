import { describe, it, expect } from "vitest";
import {
  normalizeDeg,
  shortestAngleDiff,
  circularLerp,
  CircularLowPass,
  SectorHysteresis,
  isTiltDegraded,
  computeCameraAzimuth,
  applyDeclination,
  directionalReading,
} from "./heading";
import { starFor } from "../bazhai/bazhai";

describe("角度工具", () => {
  it("正規化", () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(450)).toBe(90);
    expect(normalizeDeg(359.5)).toBe(359.5);
  });
  it("最短角差與插值", () => {
    expect(shortestAngleDiff(350, 10)).toBe(-20);
    expect(shortestAngleDiff(10, 350)).toBe(20);
    expect(circularLerp(350, 10, 0.5)).toBe(0);
    expect(circularLerp(0, 90, 0.25)).toBeCloseTo(22.5);
  });
  it("低通濾波 0/360 跨越", () => {
    const f = new CircularLowPass(0.4);
    f.push(358);
    f.push(2);
    const v = f.get()!;
    // 應落在 356–364（環繞）區間，不應被拉成 180
    const unwrapped = v > 180 ? v : v + 360; // 359.6 → 359.6
    expect(unwrapped).toBeGreaterThan(356);
    expect(unwrapped).toBeLessThan(364);
  });
});

describe("扇區遲滯", () => {
  it("遲滯帶內不切換，越過後切換", () => {
    const h = new SectorHysteresis(1.5);
    h.update(30); // 30 → 扇區 45
    expect(h.get()).toBe(45);
    // 走向邊界 22.5，仍在遲滯帶（距邊界 1.5）→ 保持 45
    const r1 = h.update(24);
    expect(r1.sector).toBe(45);
    // 越過遲滯帶（距邊界 1.5 以上且已進入另一扇區）→ 切換 0
    const r2 = h.update(20);
    expect(r2.sector).toBe(0);
    expect(r2.changed).toBe(true);
  });
});

describe("退化與換算", () => {
  it("近朝天/朝地退化", () => {
    expect(isTiltDegraded(80, 0)).toBe(true);
    expect(isTiltDegraded(-75, 10)).toBe(true);
    expect(isTiltDegraded(20, 40)).toBe(false);
  });
  it("webkit 標頭直接作為相機方位", () => {
    expect(computeCameraAzimuth(315, null, 0, true)).toBe(315);
    expect(computeCameraAzimuth(3, null, 0, true)).toBe(3);
  });
  it("標準 alpha 換算（含螢幕方向）", () => {
    expect(computeCameraAzimuth(NaN, 90, 0, false)).toBe(270);
    expect(computeCameraAzimuth(NaN, 10, 90, false)).toBe(260);
  });
  it("磁偏角換算（東偏正）", () => {
    expect(applyDeclination(10, 5)).toBe(15);
    expect(applyDeclination(358, 5)).toBe(3);
    expect(applyDeclination(5, -6)).toBe(359);
  });
});

describe("方位閱讀", () => {
  it("宮位與吉凶", () => {
    const r = directionalReading(0, (d) => starFor(1, d)); // 坎命北＝伏位
    expect(r.palace).toBe("坎");
    expect(r.branch).toBe("北");
    expect(r.star).toBe("fuWei");
    expect(r.nearBoundary).toBe(false);
  });
  it("交界提示", () => {
    const r = directionalReading(23, (d) => starFor(1, d));
    expect(r.nearBoundary).toBe(true);
    expect(r.palace).toBe("艮");
  });
});
