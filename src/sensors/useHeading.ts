/**
 * 方位感測 React hook：訂閱 DeviceOrientation，輸出 HeadingState。
 * 整合濾波、遲滯、退化判定、磁偏角（真北需位置，第一版預設磁北）。
 */
import { useEffect, useRef, useState } from "react";
import { subscribeOrientation, requestOrientationPermission, type SensorPermission, type OrientationSample } from "../sensors/deviceOrientation";
import { CircularLowPass, SectorHysteresis, isTiltDegraded, normalizeDeg, type HeadingState, type NorthReference } from "../domain/compass/heading";

export interface UseHeadingResult {
  state: HeadingState;
  permission: SensorPermission;
  requestPermission: () => Promise<SensorPermission>;
  /** 收到樣本的頻率（每秒） */
  sampleRate: number;
  /** 最近原始樣本（診斷頁用） */
  lastSample: OrientationSample | null;
  /** 手動偏移（度） */
  manualOffsetDeg: number;
  setManualOffsetDeg: (d: number) => void;
}

export function useHeading(enabled: boolean, northReference: NorthReference = "magnetic"): UseHeadingResult {
  const [state, setState] = useState<HeadingState>({
    rawHeading: null,
    displayHeading: null,
    cameraAzimuth: null,
    northReference,
    source: "sensor",
    quality: "unavailable",
    boundaryDistance: null,
    nearBoundary: false,
    tiltDegraded: false,
    pitch: null,
    roll: null,
  });
  const [permission, setPermission] = useState<SensorPermission>("prompt");
  const [sampleRate, setSampleRate] = useState(0);
  const [lastSample, setLastSample] = useState<OrientationSample | null>(null);
  const [manualOffsetDeg, setManualOffsetDeg] = useState(0);

  const filter = useRef(new CircularLowPass(0.22));
  const hysteresis = useRef(new SectorHysteresis(1.5));
  const countRef = useRef(0);
  const lastRateTs = useRef(Date.now());
  const sampleTsRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeOrientation((s) => {
      setLastSample(s);
      countRef.current++;
      const now = Date.now();
      if (now - lastRateTs.current >= 1000) {
        setSampleRate(countRef.current);
        countRef.current = 0;
        lastRateTs.current = now;
      }
      sampleTsRef.current = s.timestamp;

      const hasWebkit = s.heading !== null;
      let raw: number | null;
      if (hasWebkit) {
        raw = normalizeDeg(s.heading! + manualOffsetDeg);
      } else if (s.alpha !== null) {
        // 標準 alpha（逆時針、相對裝置座標）→ 順時針航向，含螢幕方向與手動偏移
        raw = normalizeDeg(360 - s.alpha - s.screenOrientation + manualOffsetDeg);
      } else {
        raw = null;
      }

      if (raw === null) {
        setState((prev) => ({ ...prev, quality: "unavailable", rawHeading: null }));
        return;
      }

      const smoothed = filter.current.push(raw);
      const pitch = s.beta ?? 0;
      const roll = s.gamma ?? 0;
      // 螢幕法線與重力夾角近似：beta>90 代表手機翻轉（鏡頭朝天），映射回傾角
      // 朝天：beta→±180；朝地：beta→-180 側。以「螢幕面與水平面夾角」判定：
      // 螢幕朝上且 beta 近 ±180，實際鏡頭朝天 → 投影退化
      const effectivePitch = pitch > 90 ? 180 - pitch : pitch < -90 ? -180 - pitch : pitch;
      const isDegraded = Math.abs(effectivePitch) < 20 || Math.abs(roll) > 45;
      // beta≈0（螢幕垂直立起、鏡頭水平朝前）是正常使用姿態；beta 近 ±180（平放朝天）才退化
      void isTiltDegraded;

      // 資料新鮮度：超過 3 秒無樣本視為失效
      const stale = now - sampleTsRef.current > 3000;

      setState((prev) => ({
        ...prev,
        rawHeading: raw,
        displayHeading: smoothed,
        cameraAzimuth: smoothed,
        pitch,
        roll,
        tiltDegraded: isDegraded,
        quality: stale ? "uncertain" : hasWebkit ? "valid" : "uncertain",
        northReference,
        source: "sensor",
      }));
    });
    return unsub;
  }, [enabled, northReference, manualOffsetDeg]);

  // 樣本停滯偵測（背景化後恢復）
  useEffect(() => {
    const t = setInterval(() => {
      setState((prev) => {
        if (prev.rawHeading === null) return prev;
        const stale = Date.now() - sampleTsRef.current > 3000;
        if (stale && prev.quality !== "uncertain") {
          return { ...prev, quality: "uncertain" as const };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const requestPermission = async () => {
    const res = await requestOrientationPermission();
    setPermission(res);
    return res;
  };

  return { state, permission, requestPermission, sampleRate, lastSample, manualOffsetDeg, setManualOffsetDeg };
}
