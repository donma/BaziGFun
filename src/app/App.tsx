/**
 * 主應用：啟動引導、即時相機羅盤、人物管理、拍照、抽屜／側欄分析、匯出。
 *
 * 背景永遠是後置相機的即時畫面；沒有任何靜態背景圖。
 * 方位來源有五種顯示狀態（kind）：locked 鎖定、manual 手動、live 感測即時、
 * stale 感測中斷（只顯示最後讀數、明確標示非即時）、demo 尚無感測（示範 0°，明確標示）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KUA_TABLE, computeMingGua, kuaTitle } from "../domain/bazhai/mingGua";
import {
  BOUNDARY_WARN_DEG,
  PALACES,
  STARS,
  bazhaiWheel,
  isGoodStar,
  type DirectionDeg,
  type StarKey,
} from "../domain/bazhai/bazhai";
import { boundaryDistanceDeg, normalizeDeg, type Quality } from "../domain/compass/heading";
import { useHeading } from "../sensors/useHeading";
import { useStableSector } from "../sensors/useStableSector";
import { detectCapabilities } from "../sensors/deviceOrientation";
import { createCameraManager, type CameraManager } from "../camera/cameraManager";
import { composeCapture } from "../camera/composite";
import {
  SCHEMA_VERSION,
  deletePhoto,
  deleteRecord,
  getPhoto,
  listRecords,
  loadLS,
  putPhoto,
  putRecord,
  saveLS,
  uuid,
  type LSData,
  type Person,
  type PhotoRecordMeta,
} from "../storage/storage";
import { buildExportJSON, exportSinglePhotoJpeg, exportZip, shareOrDownload } from "../export/exporter";
import { BaguaDial } from "../components/BaguaDial";
import { OnboardingScreen } from "./Onboarding";
import { hasPersistentSidePanel } from "./layout";
import { SidePanel, type PanelTab } from "./panels";
import { ActionRow, BrandBar, HeadingCard, PersonCard, SchemePill, type ActionDef } from "./parts";

type Screen = "onboarding" | "compass";
type ViewKind = "locked" | "manual" | "live" | "stale" | "demo";

interface Reading {
  heading: number;
  raw: number | null;
  source: "sensor" | "manual";
  quality: Quality;
}

/** 吉凶說明（傳統文化參考，非科學驗證） */
const STAR_DESC: Record<StarKey, string> = {
  fuWei: "適合：休息、穩定、累積。利於守成、養氣、提升整體運勢。",
  shengQi: "適合：積極、開創、活力。有利於事業拓展與人脈。",
  tianYi: "適合：健康、療癒、人際和諧。有利於身心調養。",
  yanNian: "適合：和諧、長久、穩定。有利於感情與合作。",
  liuSha: "留意：人際是非與情緒波動，重要座位宜避開。",
  wuGui: "留意：變動、口舌與專注力受干擾，配置宜謹慎。",
  huoHai: "留意：壓力與是非，長期停留容易疲憊。",
  jueMing: "留意：阻礙與決策風險，重要座位宜避開。",
};

function signedOffset(deg: number): string {
  const d = ((deg + 540) % 360) - 180; // → (-180, 180]
  const r = Math.round(d);
  return `${r > 0 ? "+" : ""}${r}°`;
}

export default function App() {
  const [ls, setLs] = useState<LSData>(() => loadLS());
  const [screen, setScreen] = useState<Screen>(() => (loadLS().persons.length === 0 ? "onboarding" : "compass"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("sectors");
  const [highlightDeg, setHighlightDeg] = useState<DirectionDeg | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualDeg, setManualDeg] = useState(0);
  const [locked, setLocked] = useState<Reading | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [pendingCapture, setPendingCapture] = useState(false);
  const [records, setRecords] = useState<PhotoRecordMeta[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [camStatus, setCamStatus] = useState<"idle" | "running" | "denied" | "failed" | "ended">("idle");

  const camRef = useRef<CameraManager | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const videoHostRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const urlsRef = useRef<string[]>([]);
  const lastGoodHeading = useRef<number | null>(null);

  const caps = useMemo(() => detectCapabilities(), []);
  // 真北需要位置與磁偏角資料，第一版尚未提供：一律以磁北為基準（不默默以磁北冒充真北）
  const heading = useHeading(screen === "compass" && !manualMode, "magnetic");
  const hs = heading.state;

  /* ---------- 人物與命卦 ---------- */

  const currentPerson: Person | null =
    ls.persons.find((p) => p.id === ls.settings.currentPersonId) ?? ls.persons[0] ?? null;

  const mingGua = useMemo(() => {
    if (!currentPerson) return null;
    try {
      return computeMingGua({
        birthDate: currentPerson.birthDate,
        birthTime: currentPerson.birthTime,
        sex: currentPerson.sex,
      });
    } catch {
      return null;
    }
  }, [currentPerson]);

  const wheel = useMemo(() => (mingGua ? bazhaiWheel(mingGua.kua) : null), [mingGua]);
  const kuaInfo = mingGua ? KUA_TABLE[mingGua.kua] : null;

  /* ---------- 方位狀態 ---------- */

  const sensorLive = hs.displayHeading !== null && hs.quality !== "unavailable";
  const sensorStale = hs.displayHeading !== null && hs.quality === "unavailable";
  const liveReading: Reading | null = manualMode
    ? { heading: manualDeg, raw: null, source: "manual", quality: "valid" }
    : sensorLive
      ? { heading: hs.displayHeading as number, raw: hs.rawHeading, source: "sensor", quality: hs.quality }
      : null;
  const reading = locked ?? liveReading;
  const kind: ViewKind = locked ? "locked" : manualMode ? "manual" : sensorLive ? "live" : sensorStale ? "stale" : "demo";
  const trusted = kind === "live" || kind === "manual" || kind === "locked";
  const degraded = kind === "live" && hs.tiltDegraded;
  // 鏡頭朝天／地時水平朝向不可靠：盤面與數字凍結在最後一次有效方位（並明確標示），不跟著亂轉
  if (kind === "live" && !hs.tiltDegraded) lastGoodHeading.current = hs.displayHeading;
  const rawView = reading ? reading.heading : sensorStale ? (hs.displayHeading as number) : 0;
  const viewHeading = degraded && lastGoodHeading.current !== null ? lastGoodHeading.current : rawView;

  const stableSector = useStableSector(viewHeading, degraded || kind === "stale");
  const star: StarKey | null = stableSector !== null && wheel ? wheel[stableSector] : null;
  const palace = stableSector !== null ? (PALACES.find((p) => p.deg === stableSector) ?? null) : null;
  const boundaryDist = boundaryDistanceDeg(viewHeading);
  const nearBoundary = trusted && !degraded && boundaryDist <= BOUNDARY_WARN_DEG;
  const capturable = trusted && !degraded && star !== null && !pendingCapture;

  /* ---------- 提示 ---------- */

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /* ---------- 紀錄與縮圖 ---------- */

  useEffect(() => {
    listRecords()
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      const created: string[] = [];
      for (const r of records.slice(0, 30)) {
        if (!r.photoId) continue;
        const ph = await getPhoto(r.photoId).catch(() => undefined);
        if (ph) {
          const u = URL.createObjectURL(ph.blob);
          urls[r.photoId] = u;
          created.push(u);
        }
      }
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = created;
      setPhotoUrls(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [records]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  /* ---------- 相機 ---------- */

  const startCamera = useCallback(
    async (isRetry = false): Promise<void> => {
      try {
        if (!camRef.current) {
          const cam = createCameraManager();
          // 串流被外力結束（其他 App 搶走相機、裝置中斷）：不在死畫面上繼續標示「相機✓」
          cam.onEnded = () => {
            setCamStatus("ended");
            showToast("相機畫面中斷（可能被其他 App 使用）。點狀態列「相機中斷」重新開啟");
          };
          camRef.current = cam;
        }
        const host = videoHostRef.current;
        const video = camRef.current.video;
        if (host && video && !video.parentElement) {
          video.className = "scene-video";
          host.prepend(video);
        }
        // false＝啟動途中被 stop() 取消（例如使用者剛好切到背景）：維持 idle，不當成成功
        if (await camRef.current.start()) setCamStatus("running");
      } catch (err) {
        const name = (err as DOMException)?.name ?? "";
        // 暫時性錯誤（相機剛被別的頁面／App 釋放、iOS 從背景回到前景）：自動重試一次
        if (!isRetry && (name === "NotReadableError" || name === "AbortError")) {
          await new Promise((r) => setTimeout(r, 700));
          return startCamera(true);
        }
        console.warn("[BaziGFun] 相機啟動失敗：", name, (err as Error)?.message);
        setCamStatus(name === "NotAllowedError" ? "denied" : "failed");
        showToast(
          name === "NotAllowedError"
            ? "相機權限被拒絕：請在瀏覽器網址列允許相機，或改用手動羅盤"
            : name === "NotFoundError"
              ? "找不到可用相機（此裝置可能沒有後置鏡頭）"
              : name === "NotReadableError"
                ? "相機被其他 App 或頁面佔用，請關閉後點狀態列的「相機失敗」重試"
                : "相機無法啟動：請確認使用 HTTPS 與 Safari/Chrome，或改用手動羅盤",
        );
      }
    },
    [showToast],
  );

  const stopCamera = useCallback(() => {
    camRef.current?.stop();
    setCamStatus("idle");
  }, []);

  // 進入羅盤即啟動相機（重新開啟 App 時不依賴引導流程）
  useEffect(() => {
    if (screen === "compass" && camStatus === "idle" && !document.hidden) void startCamera();
  }, [screen, camStatus, startCamera]);

  // 頁面隱藏時暫停相機；回到前景時重新啟動（規格 8）
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stopCamera();
      else if (screen === "compass") void startCamera();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [screen, startCamera, stopCamera]);

  // 量測時保持螢幕不休眠（瞄準時手機不會自己變暗）
  useEffect(() => {
    if (screen !== "compass" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        /* 不支援或被拒絕：略過 */
      }
    };
    void acquire();
    const onVis = () => {
      if (!document.hidden) void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release();
    };
  }, [screen]);

  // 狀態列／網址列顏色跟著畫面：引導頁是米色，相機羅盤是深色
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", screen === "compass" ? "#241c0f" : "#f6f1e7");
  }, [screen]);

  /* ---------- 人物 ---------- */

  const persist = useCallback(
    (next: LSData) => {
      setLs(next);
      try {
        saveLS(next);
      } catch {
        showToast("無法寫入本機儲存空間，變更可能不會保留");
      }
    },
    [showToast],
  );

  const addPerson = useCallback(
    (name: string, birthDate: string, birthTime: string | null, sex: "male" | "female") => {
      const r = computeMingGua({ birthDate, birthTime, sex });
      const person: Person = {
        id: uuid(),
        name,
        birthDate,
        birthTime,
        sex,
        kua: r.kua,
        createdAt: new Date().toISOString(),
      };
      persist({
        ...ls,
        persons: [...ls.persons, person],
        settings: { ...ls.settings, currentPersonId: person.id },
      });
      if (r.boundaryUncertain) showToast("生日接近立春交界，建議補出生時間以確定命卦");
      return person;
    },
    [ls, persist, showToast],
  );

  const removePerson = useCallback(
    (id: string) => {
      persist({
        ...ls,
        persons: ls.persons.filter((p) => p.id !== id),
        settings: {
          ...ls.settings,
          currentPersonId: ls.settings.currentPersonId === id ? null : ls.settings.currentPersonId,
        },
      });
    },
    [ls, persist],
  );

  // 最後一位人物被刪除 → 回到引導
  useEffect(() => {
    if (screen === "compass" && ls.persons.length === 0) {
      setDrawerOpen(false);
      setScreen("onboarding");
    }
  }, [screen, ls.persons.length]);

  const selectPerson = useCallback(
    (id: string) => persist({ ...ls, settings: { ...ls.settings, currentPersonId: id } }),
    [ls, persist],
  );

  /* ---------- 操作 ---------- */

  // 鍵盤 Esc 關閉抽屜／校正視窗
  useEffect(() => {
    if (!drawerOpen && !showCalibration) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        setShowCalibration(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, showCalibration]);
  const openPanel = useCallback((tab: PanelTab) => {
    setPanelTab(tab);
    // 有常駐面板（寬螢幕／摺疊雙螢幕）時只需切換分頁；不要把（看不見的）抽屜標成開啟，
    // 否則視窗縮回手機寬度時抽屜會突然彈出來
    if (!hasPersistentSidePanel()) setDrawerOpen(true);
  }, []);

  const onSectorClick = useCallback(
    (deg: DirectionDeg) => {
      setHighlightDeg((prev) => (prev === deg ? null : deg));
      const p = PALACES.find((x) => x.deg === deg);
      const s = wheel?.[deg];
      if (p && s) showToast(`${p.branch}方：${STARS[s].name}（${isGoodStar(s) ? "吉方" : "凶方"}）`);
    },
    [wheel, showToast],
  );

  const toggleLock = () => {
    if (locked) {
      setLocked(null);
      return;
    }
    if (!reading) {
      showToast("尚無可鎖定的方位");
      return;
    }
    setLocked(reading);
  };

  const toggleManual = () => {
    setLocked(null);
    if (!manualMode) setManualDeg(Math.round(viewHeading)); // 從目前方位開始微調，不跳回 0°
    setManualMode(!manualMode);
  };

  const openCalibration = async () => {
    if (manualMode) {
      showToast("手動羅盤不需要校正；返回感測後再校正");
      return;
    }
    await heading.requestPermission();
    setShowCalibration(true);
  };

  const calibrate = (targetDeg: number, label: string) => {
    setShowCalibration(false);
    if (hs.tiltDegraded) {
      showToast("鏡頭接近朝天／地，請水平對準後再校正");
      return;
    }
    if (heading.calibrateTo(targetDeg)) showToast(`已校正：目前朝向視為${label}（${targetDeg}°）`);
    else showToast("尚無即時感測資料，無法校正");
  };

  const enableSensor = async () => {
    const res = await heading.requestPermission();
    if (res === "denied") {
      showToast("方向感測權限被拒絕：請到 設定 → Safari → 動作與方向存取 允許後重新載入");
    } else if (res === "unsupported") {
      showToast("此瀏覽器不支援方向感測，請改用手動羅盤");
    }
  };

  /* ---------- 拍照 ---------- */

  const capture = useCallback(async () => {
    if (!currentPerson || !mingGua || !kuaInfo || !star || !palace || !reading || !sceneRef.current) return;
    setPendingCapture(true);
    try {
      const good = isGoodStar(star);
      const now = new Date();
      const sourceLabel = reading.source === "manual" ? "手動" : locked ? "感測（已鎖定）" : "感測";
      const qualityLabel =
        reading.source === "manual" ? "" : reading.quality === "valid" ? "" : "｜感測可信度：弱";
      const blob = await composeCapture({
        video: camRef.current?.state === "running" ? camRef.current.video : null,
        sceneEl: sceneRef.current,
        dialEl: sceneRef.current.querySelector<SVGSVGElement>(".compass-svg"),
        info: {
          headline: `${currentPerson.name}｜${kuaTitle(mingGua.kua)}（${kuaInfo.group === "east4" ? "東四命" : "西四命"}）`,
          main: `${Math.round(viewHeading)}° ${palace.branch}　${STARS[star].name}（${good ? "吉方" : "凶方"}）`,
          meta: `${now.toLocaleString()}｜磁北｜${sourceLabel}${qualityLabel}`,
          tone: good ? "good" : "bad",
          warn: nearBoundary ? `接近方位交界（距邊界 ${boundaryDist.toFixed(1)}°），吉凶可能跳動` : undefined,
        },
      });
      const photoId = uuid();
      try {
        await putPhoto(photoId, blob, "image/jpeg");
      } catch (e) {
        showToast((e as DOMException)?.name === "QuotaExceededError" ? "儲存空間不足，照片未能保存" : "照片儲存失敗");
        return;
      }
      const rec: PhotoRecordMeta = {
        id: uuid(),
        personId: currentPerson.id,
        title: `${palace.branch}・${STARS[star].name}`,
        note: "",
        capturedAt: now.toISOString(),
        azimuthRaw: reading.raw,
        azimuthDisplay: Math.round(viewHeading * 10) / 10,
        source: reading.source,
        northReference: "magnetic",
        palace: palace.name,
        star,
        quality: reading.quality,
        nearBoundary,
        photoId,
        schemaVersion: SCHEMA_VERSION,
      };
      await putRecord(rec);
      setRecords(await listRecords());
      showToast("已拍照並記錄");
    } catch (e) {
      showToast(`拍照失敗：${(e as Error).message}`);
    } finally {
      setPendingCapture(false);
    }
  }, [currentPerson, mingGua, kuaInfo, star, palace, reading, locked, viewHeading, nearBoundary, boundaryDist, showToast]);

  const deleteRecordAndPhoto = useCallback(
    async (id: string) => {
      const rec = records.find((r) => r.id === id);
      if (rec?.photoId) await deletePhoto(rec.photoId);
      await deleteRecord(id);
      setRecords(await listRecords());
      showToast("紀錄已刪除");
    },
    [records, showToast],
  );

  const doExportZip = useCallback(async () => {
    const res = await exportZip();
    await shareOrDownload(res.filename, res.blob);
    showToast("匯出完成（此版本不支援匯入還原）");
  }, [showToast]);

  const doExportJson = useCallback(async () => {
    await shareOrDownload("bazigfun-data.json", buildExportJSON(records));
    showToast("JSON 已匯出");
  }, [records, showToast]);

  const doExportOne = useCallback(
    async (photoId: string) => {
      const res = await exportSinglePhotoJpeg(photoId);
      if (res) {
        await shareOrDownload(res.filename, res.blob);
        showToast("照片已匯出");
      }
    },
    [showToast],
  );

  /* ---------- 引導畫面 ---------- */

  if (screen === "onboarding") {
    return (
      <OnboardingScreen
        onFinish={() => setScreen("compass")}
        onAddPerson={addPerson}
        personCount={ls.persons.length}
        onRequestPerm={async () => {
          await heading.requestPermission();
          await startCamera();
        }}
        caps={caps}
      />
    );
  }

  /* ---------- 主畫面所需的顯示文字 ---------- */

  const sensorChip: { text: string; tone: string; title: string } = (() => {
    if (kind === "locked") return { text: "已鎖定", tone: "warn", title: "方位已鎖定，不隨手機轉動" };
    if (kind === "manual") return { text: "手動", tone: "", title: "手動羅盤模式" };
    if (kind === "stale") return { text: "感測中斷", tone: "bad", title: "一段時間沒有方向資料，顯示的是最後讀數" };
    if (kind === "demo") return { text: "無感測", tone: "bad", title: "尚未取得方向感測資料" };
    if (hs.tiltDegraded) return { text: "朝向不穩", tone: "warn", title: "鏡頭接近垂直，水平朝向不可靠" };
    if (hs.semantic === "relative-euler") return { text: "需校正", tone: "warn", title: "此裝置只提供相對方位（不是絕對北），請先校正" };
    if (hs.quality === "uncertain") return { text: "感測弱", tone: "warn", title: "感測精度不足，建議離開金屬或電器並校正" };
    return { text: "感測✓", tone: "good", title: "方向感測正常（精度仍需實機標定）" };
  })();

  const tags: Array<{ text: string; tone?: "bad" }> = [];
  if (kind === "demo") tags.push({ text: "示範方位・未取得感測" });
  if (kind === "stale") tags.push({ text: "最後讀數・感測中斷", tone: "bad" });
  if (degraded) tags.push({ text: "最後有效方位", tone: "bad" });
  if (kind === "locked") tags.push({ text: "已鎖定" });
  if (kind === "manual") tags.push({ text: "手動" });

  const needPermission = caps.hasRequestPermission && heading.permission !== "granted";
  let desc: string;
  let cta: { text: string; onClick: () => void } | null = null;
  if (degraded) {
    desc = "請將手機拿正，讓鏡頭對準水平方向。";
  } else if (kind === "demo") {
    if (!caps.hasDeviceOrientation) {
      desc = "此裝置不支援方向感測，請用「切換羅盤」手動對準。";
    } else if (heading.permission === "denied") {
      desc = "方向感測權限被拒絕。請到 設定 → Safari → 動作與方向存取 允許後重新載入頁面，或用「切換羅盤」手動對準。";
    } else if (needPermission) {
      desc = "尚未取得方向感測。請按下方按鈕啟用，或用「切換羅盤」手動對準。";
      cta = { text: "啟用方向感測", onClick: () => void enableSensor() };
    } else {
      desc = "等待方向感測資料…桌面瀏覽器通常沒有方向感測器，請用「切換羅盤」手動對準。";
    }
  } else if (kind === "stale") {
    desc = "這是最後一次讀數，不是即時量測。手機完全靜止時部分瀏覽器不再送資料，輕輕轉動手機即可恢復；也可改用「切換羅盤」手動對準。";
  } else if (kind === "live" && hs.semantic === "relative-euler") {
    desc = "此裝置只提供相對方位（不是絕對北）。請按「校正指南針」對準已知方位，或改用手動羅盤。";
  } else {
    desc = star ? STAR_DESC[star] : "";
  }

  const warn = degraded
    ? { text: "鏡頭接近垂直朝天／地，水平朝向不可靠，已暫停吉凶判定。", tone: "bad" as const }
    : nearBoundary
      ? { text: `接近方位交界（距邊界 ${boundaryDist.toFixed(1)}°），吉凶可能跳動。` }
      : null;

  const pill = degraded
    ? { name: "暫停判定", sub: "", tone: "muted" as const, dim: false }
    : star
      ? {
          name: STARS[star].name,
          sub: isGoodStar(star) ? "（吉方）" : "（凶方）",
          tone: isGoodStar(star) ? ("good" as const) : ("bad" as const),
          dim: kind === "demo" || kind === "stale",
        }
      : null;

  const offsetActive = Math.abs(((heading.manualOffsetDeg + 540) % 360) - 180) >= 0.5;

  const actions: ActionDef[] = [
    { key: "calibrate", label: "校正指南針", icon: "calibrate", onClick: () => void openCalibration() },
    {
      key: "lock",
      label: locked ? "解鎖方位" : "鎖定方位",
      icon: locked ? "unlock" : "lock",
      on: !!locked,
      disabled: !locked && !reading,
      onClick: toggleLock,
    },
    {
      key: "capture",
      label: pendingCapture ? "處理中…" : "拍照紀錄",
      icon: "camera",
      disabled: !capturable,
      onClick: () => void capture(),
    },
    {
      key: "mode",
      label: manualMode ? "返回感測" : "切換羅盤",
      icon: "expand",
      accent: true,
      on: manualMode,
      onClick: toggleManual,
    },
  ];

  const sidePanel = (
    <SidePanel
      tab={panelTab}
      setTab={setPanelTab}
      person={currentPerson}
      mingGua={mingGua}
      wheel={wheel}
      highlightDeg={highlightDeg}
      setHighlightDeg={setHighlightDeg}
      ls={ls}
      selectPerson={(id) => {
        selectPerson(id);
        setDrawerOpen(false);
      }}
      removePerson={removePerson}
      addPerson={addPerson}
      records={records}
      photoUrls={photoUrls}
      onExportZip={doExportZip}
      onExportJson={doExportJson}
      onExportOne={doExportOne}
      onDeleteRecord={deleteRecordAndPhoto}
    />
  );

  return (
    <div className="scene" ref={sceneRef}>
      <div ref={videoHostRef} className="scene-media">
        {camStatus !== "running" && <div className="scene-fallback" />}
      </div>
      <div className="scene-scrim top" />
      <div className="scene-scrim bottom" />

      <div className="layout-wide">
        <div className="scene-overlay">
          <BrandBar onLeft={() => openPanel("persons")} onRight={() => openPanel("records")} />
          <SchemePill />

          {currentPerson && mingGua && kuaInfo ? (
            <PersonCard
              name={currentPerson.name}
              kuaText={kuaTitle(mingGua.kua)}
              groupText={kuaInfo.group === "east4" ? "東四命" : "西四命"}
              element={kuaInfo.element}
              guaYear={mingGua.guaYear}
              uncertain={mingGua.boundaryUncertain}
              lines={kuaInfo.trigramLines}
              onDetail={() => openPanel("sectors")}
            />
          ) : (
            <div className="person-card">請先建立人物</div>
          )}

          <div className="status-strip">
            <span className={`chip ${sensorChip.tone}`} title={sensorChip.title}>
              {sensorChip.text}
            </span>
            <button
              className="chip chip-btn"
              title="真北需要位置與磁偏角資料，尚未提供；目前一律以磁北為基準"
              onClick={() => showToast("目前以磁北為基準；真北需要位置與磁偏角資料，尚未提供")}
            >
              磁北
            </button>
            {camStatus === "running" ? (
              <span className="chip good">相機✓</span>
            ) : (
              <button
                className={`chip chip-btn ${camStatus === "idle" ? "" : "warn"}`}
                title={camStatus === "ended" ? "相機畫面已中斷，點此重新開啟後置相機" : "重新啟動後置相機"}
                onClick={() => void startCamera()}
              >
                {camStatus === "denied"
                  ? "相機拒絕"
                  : camStatus === "failed"
                    ? "相機失敗"
                    : camStatus === "ended"
                      ? "相機中斷"
                      : "開啟相機"}
              </button>
            )}
            {offsetActive && (
              <button className="chip chip-btn warn" title="已套用人工校正偏移，點此重新校正" onClick={() => void openCalibration()}>
                偏移 {signedOffset(heading.manualOffsetDeg)}
              </button>
            )}
          </div>

          <div className="compass-wrap">
            {wheel ? (
              <BaguaDial
                displayHeading={viewHeading}
                wheel={wheel}
                activeDeg={stableSector}
                highlightDeg={highlightDeg}
                dimmed={degraded || kind === "stale"}
                onSectorClick={onSectorClick}
              />
            ) : (
              <div className="compass-empty">請先建立人物</div>
            )}
          </div>

          <div className="bottombar">
            <HeadingCard
              label="目前朝向"
              degText={`${Math.round(normalizeDeg(viewHeading)) % 360}°`}
              dirText={palace?.branch ?? "—"}
              tags={tags}
              pill={pill}
              warn={warn}
              desc={desc}
              cta={cta}
            />
            {manualMode && (
              <div className="manual-bar">
                <button className="nudge" aria-label="減 1 度" onClick={() => setManualDeg((d) => normalizeDeg(d - 1))}>
                  −1°
                </button>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={Math.round(manualDeg) % 360}
                  onChange={(e) => setManualDeg(Number(e.target.value))}
                  aria-label="手動調整方位"
                />
                <button className="nudge" aria-label="加 1 度" onClick={() => setManualDeg((d) => normalizeDeg(d + 1))}>
                  +1°
                </button>
              </div>
            )}
            <ActionRow actions={actions} />
          </div>
        </div>

        <aside className="side-panel glass">{sidePanel}</aside>
      </div>

      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
      <div
        className={`drawer glass glass-strong ${drawerOpen ? "" : "closed"}`}
        role="dialog"
        aria-modal="true"
        aria-label="人物、命卦與紀錄"
        aria-hidden={!drawerOpen}
      >
        <div className="drawer-head">
          <button className="drawer-grab" aria-label="收合" onClick={() => setDrawerOpen(false)}>
            <span className="drawer-handle" />
          </button>
          <button className="drawer-close" aria-label="關閉" onClick={() => setDrawerOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>
        {sidePanel}
      </div>

      {showCalibration && (
        <div className="modal-backdrop" onClick={() => setShowCalibration(false)}>
          <div className="modal glass glass-strong" onClick={(e) => e.stopPropagation()}>
            <h2>校正指南針</h2>
            <p>
              將鏡頭水平對準已知方位後，按下對應按鈕，系統會設定角度偏移（目前偏移 {signedOffset(heading.manualOffsetDeg)}）。
              這只補償顯示基準，不保證完成硬體磁力計校正；金屬與電器旁的磁場也會影響方位。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 12 }}>
              {(
                [
                  [0, "北"],
                  [90, "東"],
                  [180, "南"],
                  [270, "西"],
                ] as Array<[number, string]>
              ).map(([deg, label]) => (
                <button key={deg} className="btn" onClick={() => calibrate(deg, label)}>
                  對準{label}
                </button>
              ))}
            </div>
            <button
              className="btn"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => {
                heading.setManualOffsetDeg(0);
                setShowCalibration(false);
                showToast("偏移已重置");
              }}
            >
              重置偏移
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {/* 給螢幕閱讀器：只在扇區改變時播報 */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {trusted && star && palace ? `${palace.branch}方 ${STARS[star].name} ${isGoodStar(star) ? "吉方" : "凶方"}` : ""}
      </div>
    </div>
  );
}
