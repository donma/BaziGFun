/**
 * 主應用：啟動引導、相機實景羅盤、人物管理、拍照、抽屜分析、寬螢幕面板、匯出。
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { APP_VERSION } from "./version";
import { MingGuaPanel } from "../analysis/MingGuaPanel";
import { KUA_TABLE, computeMingGua, type KuaNumber, type MingGuaResult } from "../domain/bazhai/mingGua";
import {
  bazhaiWheel,
  starFor,
  PALACES,
  sectorCenterDeg,
  STARS,
  type DirectionDeg,
  type StarKey,
} from "../domain/bazhai/bazhai";
import { boundaryDistanceDeg } from "../domain/compass/heading";
import { useHeading } from "../sensors/useHeading";
import { detectCapabilities } from "../sensors/deviceOrientation";
import { createCameraManager, type CameraManager } from "../camera/cameraManager";
import {
  loadLS,
  saveLS,
  putPhoto,
  getPhoto,
  putRecord,
  listRecords,
  deleteRecord,
  uuid,
  SCHEMA_VERSION,
  type Person,
  type PhotoRecordMeta,
  type LSData,
} from "../storage/storage";
import { buildExportJSON, exportZip, exportSinglePhotoJpeg, shareOrDownload } from "../export/exporter";
import { BaguaDial } from "../components/BaguaDial";

type Screen = "onboarding" | "compass";
type PanelTab = "sectors" | "persons" | "records";

const STAR_NAME: Record<StarKey, string> = Object.fromEntries(
  Object.entries(STARS).map(([k, v]) => [k, v.name]),
) as Record<StarKey, string>;

/** 吉凶說明（傳統文化参考，非科學驗證） */
const STAR_DESC: Record<StarKey, string> = {
  fuWei: "適合：休息、穩定、累積、有利於守成、儲蓄、提升整體運勢。",
  shengQi: "適合：積極、開創、活力、有利於事業拓展與人脈。",
  tianYi: "適合：健康、療癒、人際和諧、有利於身心調養。",
  yanNian: "適合：和諧、長久、穩定、有利於感情與合作。",
  liuSha: "留意：人際是非與情緒波動，重要座位宜避開。",
  wuGui: "留意：變動、口舌與專注力受干擾，配置宜謹慎。",
  huoHai: "留意：壓力與是非，長期停留容易疲憊。",
  jueMing: "留意：阻礙與決策風險，重要座位宜避開。",
};

export default function App() {
  const [ls, setLs] = useState<LSData>(() => loadLS());
  const [screen, setScreen] = useState<Screen>(() => (loadLS().persons.length === 0 ? "onboarding" : "compass"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("sectors");
  const [highlightDeg, setHighlightDeg] = useState<DirectionDeg | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualDeg, setManualDeg] = useState(0);
  const [pendingCapture, setPendingCapture] = useState(false);
  const [records, setRecords] = useState<PhotoRecordMeta[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [showOnboardingPerm, setShowOnboardingPerm] = useState(false);
  const [camStatus, setCamStatus] = useState<"idle" | "running" | "denied" | "failed">("idle");
  const [lockedHeading, setLockedHeading] = useState<number | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);

  const camRef = useRef<CameraManager | null>(null);
  const videoHostRef = useRef<HTMLDivElement | null>(null);
  const caps = useMemo(() => detectCapabilities(), []);
  const heading = useHeading(screen === "compass" && !manualMode, ls.settings.northReference);

  const currentPerson = ls.persons.find((p) => p.id === ls.settings.currentPersonId) ?? ls.persons[0] ?? null;

  // 命卦重算（引擎版本變更時自動跟隨）
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

  const personKua = useMemo<{ kua: KuaNumber; uncertain: boolean } | null>(() => {
    if (!mingGua) return null;
    return { kua: mingGua.kua, uncertain: mingGua.boundaryUncertain };
  }, [mingGua]);

  const wheel = useMemo(() => (personKua ? bazhaiWheel(personKua.kua) : null), [personKua]);

  const headingNow = lockedHeading ?? (manualMode ? manualDeg : heading.state.displayHeading);
  /** 無感測時以示範方位呈現，明確標示避免偽造精度 */
  const usingFallback = headingNow === null;
  const displayHeading = usingFallback ? 0 : headingNow;
  const displaySector = sectorCenterDeg(displayHeading);
  const displayStar = displaySector !== null && wheel ? wheel[displaySector] : null;
  const currentSector = headingNow !== null ? sectorCenterDeg(headingNow) : null;
  const currentStar = currentSector !== null && wheel ? wheel[currentSector] : null;
  const boundaryDist = headingNow !== null ? boundaryDistanceDeg(headingNow) : null;
  const nearBoundary = boundaryDist !== null && boundaryDist <= 2;

  useEffect(() => {
    listRecords().then(setRecords);
  }, []);

  // 載入照片縮圖 URL
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const r of records.slice(0, 30)) {
        if (!r.photoId) continue;
        const ph = await getPhoto(r.photoId);
        if (ph && !cancelled) urls[r.photoId] = URL.createObjectURL(ph.blob);
      }
      if (!cancelled) setPhotoUrls(urls);
    })();
    return () => {
      cancelled = true;
      Object.values(photoUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // 相機啟動（使用者進入羅盤頁後手勢觸發）
  const startCamera = useCallback(async () => {
    try {
      if (!camRef.current) camRef.current = createCameraManager();
      const host = videoHostRef.current;
      if (host && camRef.current.video && !camRef.current.video.parentElement) {
        camRef.current.video.className = "scene-video";
        host.prepend(camRef.current.video);
      }
      await camRef.current.start();
      setCamStatus("running");
    } catch (err) {
      const name = (err as DOMException)?.name;
      setCamStatus(name === "NotAllowedError" ? "denied" : "failed");
      showToast(
        name === "NotAllowedError"
          ? "相機權限被拒絕，可改用手動羅盤模式"
          : "相機無法啟動，可改用手動羅盤模式",
      );
    }
  }, [showToast]);

  const stopCamera = useCallback(() => {
    camRef.current?.stop();
    setCamStatus("idle");
  }, []);

  // 頁面隱藏時暫停相機與感測（規格 8）
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        stopCamera();
      } else if (screen === "compass" && camRef.current?.state !== "running" && camStatus === "running") {
        startCamera();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [screen, camStatus, startCamera, stopCamera]);

  const persist = useCallback((next: LSData) => {
    setLs(next);
    saveLS(next);
  }, []);

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
      const next: LSData = {
        ...ls,
        persons: [...ls.persons, person],
        settings: { ...ls.settings, currentPersonId: person.id },
      };
      persist(next);
      if (r.boundaryUncertain) {
        showToast("生日接近立春交界，建議補出生時間以確定命卦");
      }
      return person;
    },
    [ls, persist, showToast],
  );

  const removePerson = useCallback(
    (id: string) => {
      const next: LSData = {
        ...ls,
        persons: ls.persons.filter((p) => p.id !== id),
        settings: {
          ...ls.settings,
          currentPersonId: ls.settings.currentPersonId === id ? null : ls.settings.currentPersonId,
        },
      };
      persist(next);
    },
    [ls, persist],
  );

  const selectPerson = useCallback(
    (id: string) => {
      persist({ ...ls, settings: { ...ls.settings, currentPersonId: id } });
    },
    [ls, persist],
  );

  // 拍照合成
  const capture = useCallback(async () => {
    if (!currentPerson || !personKua || !wheel || headingNow === null) return;
    setPendingCapture(true);
    try {
      const cam = camRef.current;
      const frame = cam?.captureFrame();
      const W = frame?.width ?? 1080;
      const H = frame?.height ?? 1920;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      if (frame) {
        ctx.drawImage(frame, 0, 0, W, H);
      } else {
        ctx.fillStyle = "#efe7d6";
        ctx.fillRect(0, 0, W, H);
      }
      // 疊上羅盤（以畫面中央 55% 大小）
      const dialSize = Math.floor(Math.min(W, H) * 0.55);
      const svg = document.querySelector(".compass-svg") as SVGElement | null;
      if (svg) {
        const xml = new XMLSerializer().serializeToString(svg);
        const img = new Image();
        const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        });
        ctx.globalAlpha = 0.88;
        ctx.drawImage(img, (W - dialSize) / 2, (H - dialSize) / 2, dialSize, dialSize);
        ctx.globalAlpha = 1;
        URL.revokeObjectURL(url);
      }
      // 資訊卡
      const pad = Math.floor(W * 0.04);
      ctx.font = `${Math.floor(W * 0.045)}px "PingFang TC", sans-serif`;
      ctx.fillStyle = "rgba(246,241,231,0.85)";
      const sector = sectorCenterDeg(headingNow)!;
      const star = wheel[sector];
      const info = `${currentPerson.name}・${KUA_TABLE[personKua.kua].name}命｜${Math.round(headingNow)}° ${PALACES.find((p) => p.deg === sector)?.branch ?? ""}・${STAR_NAME[star]}`;
      ctx.fillText(info, pad, H - pad * 2);
      const ts = new Date().toISOString();
      ctx.font = `${Math.floor(W * 0.032)}px sans-serif`;
      ctx.fillStyle = "rgba(246,241,231,0.7)";
      ctx.fillText(`${ts}｜${ls.settings.northReference === "magnetic" ? "磁北" : "真北"}｜${manualMode ? "手動" : "感測"}`, pad, H - pad);

      const photoId = uuid();
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.88),
      );
      try {
        await putPhoto(photoId, blob, "image/jpeg");
      } catch {
        showToast("儲存空間不足，照片未能保存");
        setPendingCapture(false);
        return;
      }
      const rec: PhotoRecordMeta = {
        id: uuid(),
        personId: currentPerson.id,
        title: `${PALACES.find((p) => p.deg === sector)?.branch ?? ""}・${STAR_NAME[star]}`,
        note: "",
        capturedAt: ts,
        azimuthRaw: manualMode ? null : heading.state.rawHeading,
        azimuthDisplay: Math.round(headingNow * 10) / 10,
        source: manualMode ? "manual" : "sensor",
        northReference: ls.settings.northReference,
        palace: PALACES.find((p) => p.deg === sector)?.name ?? "",
        star,
        quality: manualMode ? "valid" : heading.state.quality,
        nearBoundary,
        photoId,
        schemaVersion: SCHEMA_VERSION,
      };
      await putRecord(rec);
      setRecords(await listRecords());
      showToast("已拍照並記錄");
    } finally {
      setPendingCapture(false);
    }
  }, [currentPerson, personKua, wheel, headingNow, heading.state, manualMode, nearBoundary, ls.settings.northReference, showToast]);

  const deleteRecordAndPhoto = useCallback(async (id: string) => {
    const { deletePhoto } = await import("../storage/storage");
    const rec = records.find((r) => r.id === id);
    if (rec?.photoId) await deletePhoto(rec.photoId);
    await deleteRecord(id);
    setRecords(await listRecords());
    showToast("紀錄已刪除");
  }, [records, showToast]);

  const doExportZip = useCallback(async () => {
    const res = await exportZip();
    await shareOrDownload(res.filename, res.blob);
    showToast("匯出完成（此版本不支援匯入還原）");
  }, [showToast]);

  const doExportJson = useCallback(async () => {
    const blob = buildExportJSON(records);
    await shareOrDownload("bazigfun-data.json", blob);
    showToast("JSON 已匯出");
  }, [records, showToast]);

  const doExportOne = useCallback(async (photoId: string) => {
    const res = await exportSinglePhotoJpeg(photoId);
    if (res) {
      await shareOrDownload(res.filename, res.blob);
      showToast("照片已匯出");
    }
  }, [showToast]);

  /* ---------- 畫面 ---------- */

  if (screen === "onboarding") {
    return (
      <OnboardingScreen
        onFinish={() => setScreen("compass")}
        onAddPerson={addPerson}
        personCount={ls.persons.length}
        onRequestPerm={async () => {
          setShowOnboardingPerm(true);
          await heading.requestPermission();
          await startCamera();
        }}
        caps={caps}
      />
    );
  }

  const kuaInfo = personKua ? KUA_TABLE[personKua.kua] : null;
  const starCls = currentStar
    ? STARS[currentStar].luck === "good"
      ? "star-good"
      : STARS[currentStar].luck === "bad"
        ? "star-bad"
        : "star-neutral"
    : "";

  return (
    <div className="scene">
      <div ref={videoHostRef} style={{ position: "absolute", inset: 0 }}>
        {camStatus !== "running" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, #efe7d6 0%, #e6dcc4 55%, #d8c9a5 100%)",
            }}
          />
        )}
      </div>

      <div className="layout-wide">
        <div className="scene-overlay">
          {/* 頂部：人物命卦資訊 */}
          <div className="glass topbar topbar-detail">
            <button
              className="btn"
              style={{ padding: "6px 12px", minHeight: 36 }}
              onClick={() => { setPanelTab("persons"); setDrawerOpen(true); }}
              aria-label="開啟人物選單"
            >
              ☰
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="topbar-line1">
                <span className="person-name">{currentPerson?.name ?? "未選人物"}</span>
                <span className="kua-inline">
                  {kuaInfo ? `命卦: ${kuaInfo.name}${personKua?.kua}命（${kuaInfo.group === "east4" ? "東四命" : "西四命"}）` : "—"}
                </span>
              </div>
              <div className="kua-badge">
                {kuaInfo ? `五行: ${kuaInfo.element} ｜ 立春換年: ${mingGua?.guaYear ?? "—"}年` : "—"}
                {personKua?.uncertain && " ⚠️立春交界"}
              </div>
            </div>
            <button
              className="chip detail-btn"
              onClick={() => { setPanelTab("sectors"); setDrawerOpen(true); }}
            >
              命盤詳情 ›
            </button>
          </div>
          <div className="status-strip">
            <span className={`chip ${heading.state.quality === "valid" ? "good" : heading.state.quality === "uncertain" ? "warn" : "bad"}`}>
              {manualMode
                ? "手動"
                : heading.state.quality === "valid"
                  ? "感測✓"
                  : heading.state.quality === "uncertain"
                    ? "感測弱"
                    : "無感測"}
            </span>
            <button
              className="chip chip-btn"
              title="切換磁北／真北"
              onClick={() =>
                persist({ ...ls, settings: { ...ls.settings, northReference: ls.settings.northReference === "magnetic" ? "true" : "magnetic" } })
              }
            >
              {ls.settings.northReference === "magnetic" ? "磁北" : "真北"}
            </button>
            {lockedHeading !== null && <span className="chip warn">已鎖定</span>}
          </div>

          {/* 羅盤 */}
          <div className="compass-wrap">
            {wheel ? (
              <BaguaDial
                displayHeading={displayHeading}
                wheel={wheel}
                highlightDeg={highlightDeg}
                onSectorClick={(d) => {
                  setHighlightDeg(d);
                  setPanelTab("sectors");
                }}
              />
            ) : (
              <p style={{ color: "var(--c-ink-soft)" }}>請先建立人物</p>
            )}
          </div>

          {/* 底部狀態與操作 */}
          <div className="bottombar">
            {heading.state.tiltDegraded && (
              <div className="glass" style={{ padding: "8px 14px", textAlign: "center", color: "var(--c-bad-strong)", fontSize: 13 }}>
                ⚠️ 手機接近垂直朝天／地，水平朝向不可靠，暫停吉凶判定
              </div>
            )}
            {nearBoundary && !heading.state.tiltDegraded && (
              <div className="glass" style={{ padding: "8px 14px", textAlign: "center", color: "#8a6d1f", fontSize: 13 }}>
                ⚠️ 接近方位交界（距邊界 {boundaryDist?.toFixed(1)}°），吉凶可能跳動
              </div>
            )}
            {/* 目前朝向與吉凶說明 */}
            <div className="glass heading-card">
              <div className="heading-card-main">
                <span className="action-icon"><ActionIcon name="calibrate" /></span>
                <div style={{ flex: 1 }}>
                  <div className="heading-sub">
                    目前朝向{lockedHeading !== null ? "（已鎖定）" : ""}
                    {usingFallback && <span className="fallback-tag">示範方位・未取得感測</span>}
                  </div>
                  <div className="heading-big">
                    {Math.round(displayHeading)}°
                    <span className="heading-dir">
                      {displaySector !== null ? PALACES.find((p) => p.deg === displaySector)?.branch : "—"}
                    </span>
                  </div>
                </div>
                {displayStar && (
                  <span className={`heading-star-pill ${STARS[displayStar].luck === "good" ? "good" : STARS[displayStar].luck === "bad" ? "bad" : "neutral"}`}>
                    {STAR_NAME[displayStar]}（{STARS[displayStar].luck === "good" ? "吉方" : STARS[displayStar].luck === "bad" ? "凶方" : "本命方"}）
                  </span>
                )}
              </div>
              <div className="heading-desc">
                {usingFallback
                  ? "尚未取得感測資料，目前示範北向。可點「切換羅盤」手動對準，或授予感測權限。"
                  : displayStar
                    ? STAR_DESC[displayStar]
                    : "請確認感測器狀態或切換手動羅盤"}
              </div>
            </div>
            <div className="action-row action-row-icon">
              <button className="btn action-btn" onClick={async () => { await heading.requestPermission(); setShowCalibration(true); }}>
                <span className="action-icon"><ActionIcon name="calibrate" /></span>
                <span>校正指南針</span>
              </button>
              <button
                className={`btn action-btn ${lockedHeading !== null ? "primary" : ""}`}
                onClick={() => setLockedHeading(lockedHeading === null ? displayHeading : null)}
              >
                <span className="action-icon"><ActionIcon name={lockedHeading !== null ? "unlock" : "lock"} /></span>
                <span>{lockedHeading !== null ? "解鎖方位" : "鎖定方位"}</span>
              </button>
              <button className="btn action-btn good" onClick={capture} disabled={pendingCapture || headingNow === null}>
                <span className="action-icon"><ActionIcon name="camera" /></span>
                <span>{pendingCapture ? "處理中…" : "拍照紀錄"}</span>
              </button>
              <button className="btn action-btn" onClick={() => setManualMode((m) => !m)}>
                <span className="action-icon"><ActionIcon name="switch" /></span>
                <span>{manualMode ? "返回感測" : "切換羅盤"}</span>
              </button>
            </div>
            {manualMode && (
              <>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={Math.round(manualDeg)}
                  onChange={(e) => setManualDeg(Number(e.target.value))}
                  aria-label="手動調整方位"
                  style={{ accentColor: "#b08d4f" }}
                />
                <div className="manual-nudge">
                  <button className="btn" onClick={() => setManualDeg((d) => normalize(d - 5))}>−5°</button>
                  <button className="btn" onClick={() => setManualDeg((d) => normalize(d + 5))}>+5°</button>
                </div>
              </>
            )}
            {/* 磁北／真北切換已置於上方狀態列 */}
          </div>
        </div>

        {/* 寬螢幕側欄 */}
        <aside className="side-panel glass">
          <SidePanel
            tab={panelTab}
            setTab={setPanelTab}
            person={currentPerson}
            mingGua={mingGua}
            wheel={wheel}
            highlightDeg={highlightDeg}
            setHighlightDeg={setHighlightDeg}
            ls={ls}
            selectPerson={selectPerson}
            removePerson={removePerson}
            addPerson={addPerson}
            records={records}
            photoUrls={photoUrls}
            onExportZip={doExportZip}
            onExportJson={doExportJson}
            onExportOne={doExportOne}
            onDeleteRecord={deleteRecordAndPhoto}
          />
        </aside>
      </div>

      {/* 一般手機抽屜 */}
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
      <div className={`drawer glass glass-strong ${drawerOpen ? "" : "closed"}`} aria-hidden={!drawerOpen}>
        <div className="drawer-handle" />
        <SidePanel
          tab={panelTab}
          setTab={setPanelTab}
          person={currentPerson}
          mingGua={mingGua}
          wheel={wheel}
          highlightDeg={highlightDeg}
          setHighlightDeg={setHighlightDeg}
          ls={ls}
          selectPerson={(id) => { selectPerson(id); setDrawerOpen(false); }}
          removePerson={removePerson}
          addPerson={addPerson}
          records={records}
          photoUrls={photoUrls}
          onExportZip={doExportZip}
          onExportJson={doExportJson}
          onExportOne={doExportOne}
          onDeleteRecord={deleteRecordAndPhoto}
        />
      </div>

      {/* 校正指南針：以已知方位設定偏移 */}
      {showCalibration && (
        <div className="modal-backdrop" onClick={() => setShowCalibration(false)}>
          <div className="modal glass glass-strong" onClick={(e) => e.stopPropagation()}>
            <h2>校正指南針</h2>
            <p>
              將鏡頭水平對準已知方位後按下對應按鈕，系統會自動設定角度偏移（目前偏移 {Math.round(heading.manualOffsetDeg)}°）。
              此動作僅補償感測基準，不保證完成硬體磁力計校正。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 12 }}>
              {[
                [0, "北"], [90, "東"], [180, "南"], [270, "西"],
              ].map(([deg, label]) => (
                <button
                  key={deg as number}
                  className="btn"
                  onClick={() => {
                    const h = headingNow ?? heading.state.displayHeading ?? 0;
                    heading.setManualOffsetDeg(normalize((deg as number) - h));
                    setShowCalibration(false);
                    showToast(`已校正偏移：${label}＝${deg}°`);
                  }}
                >
                  對準{label}
                </button>
              ))}
            </div>
            <button
              className="btn"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => { heading.setManualOffsetDeg(0); setShowCalibration(false); showToast("偏移已重置"); }}
            >
              重置偏移
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="glass glass-strong"
          style={{
            position: "fixed",
            bottom: "calc(var(--sab) + 84px)",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 18px",
            zIndex: 80,
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function normalize(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** 操作列線條圖示（取代 emoji，風格一致） */
function ActionIcon({ name }: { name: "calibrate" | "lock" | "unlock" | "camera" | "switch" }) {
  const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "calibrate":
      return <svg {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
    case "lock":
      return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case "unlock":
      return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7-2.6" /></svg>;
    case "camera":
      return <svg {...common}><path d="M3 8h4l1.5-2h7L17 8h4v11H3z" /><circle cx="12" cy="13.5" r="3.2" /></svg>;
    case "switch":
      return <svg {...common}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>;
  }
}

/* ---------- 側欄／抽屜共用面板 ---------- */

interface SidePanelProps {
  tab: PanelTab;
  setTab: (t: PanelTab) => void;
  person: Person | null;
  mingGua: MingGuaResult | null;
  wheel: Record<DirectionDeg, StarKey> | null;
  highlightDeg: DirectionDeg | null;
  setHighlightDeg: (d: DirectionDeg | null) => void;
  ls: LSData;
  selectPerson: (id: string) => void;
  removePerson: (id: string) => void;
  addPerson: (name: string, birthDate: string, birthTime: string | null, sex: "male" | "female") => Person;
  records: PhotoRecordMeta[];
  photoUrls: Record<string, string>;
  onExportZip: () => void;
  onExportJson: () => void;
  onExportOne: (photoId: string) => void;
  onDeleteRecord: (id: string) => void;
}

function SidePanel(p: SidePanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {(
          [
            ["sectors", "命卦方位"],
            ["persons", "人物"],
            ["records", "紀錄"],
          ] as Array<[PanelTab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            className={`btn ${p.tab === k ? "primary" : ""}`}
            style={{ flex: 1, minHeight: 38, fontSize: 13 }}
            onClick={() => p.setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {p.tab === "sectors" && (
        <MingGuaPanel
          person={p.person}
          mingGua={p.mingGua}
          wheel={p.wheel}
          highlightDeg={p.highlightDeg}
          onHighlight={p.setHighlightDeg}
        />
      )}

      {p.tab === "persons" && (
        <PersonPanel ls={p.ls} selectPerson={p.selectPerson} removePerson={p.removePerson} addPerson={p.addPerson} />
      )}

      {p.tab === "records" && (
        <RecordsPanel
          records={p.records}
          photoUrls={p.photoUrls}
          onExportZip={p.onExportZip}
          onExportJson={p.onExportJson}
          onExportOne={p.onExportOne}
          onDelete={p.onDeleteRecord}
        />
      )}
    </div>
  );
}

/* ---------- 人物面板 ---------- */

function PersonPanel({
  ls,
  selectPerson,
  removePerson,
  addPerson,
}: {
  ls: LSData;
  selectPerson: (id: string) => void;
  removePerson: (id: string) => void;
  addPerson: (name: string, birthDate: string, birthTime: string | null, sex: "male" | "female") => Person;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErr("請填寫名稱與國曆生日（YYYY-MM-DD）");
      return;
    }
    try {
      addPerson(name.trim(), date, time || null, sex);
      setShowForm(false);
      setName("");
      setDate("");
      setTime("");
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div>
      <div className="panel-title">人物（僅存本機）</div>
      {ls.persons.map((person) => {
        const info = KUA_TABLE[person.kua];
        return (
          <div
            key={person.id}
            className="glass"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              marginBottom: 8,
              outline: person.id === ls.settings.currentPersonId ? "2px solid var(--c-gold)" : "none",
            }}
          >
            <div style={{ flex: 1, cursor: "pointer" }} onClick={() => selectPerson(person.id)}>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}>{person.name}</div>
              <div style={{ fontSize: 12, color: "var(--c-ink-soft)" }}>
                {person.birthDate}・{info.name}命{info.group === "east4" ? "・東四" : "・西四"}
              </div>
            </div>
            <button className="btn" style={{ minHeight: 32, padding: "4px 10px", fontSize: 12 }} onClick={() => removePerson(person.id)}>
              刪除
            </button>
          </div>
        );
      })}
      {!showForm && (
        <button className="btn primary" style={{ width: "100%" }} onClick={() => setShowForm(true)}>
          ＋ 新增人物
        </button>
      )}
      {showForm && (
        <div className="glass" style={{ padding: 12 }}>
          <div className="field">
            <label>名稱</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：媽媽" />
          </div>
          <div className="field">
            <label>國曆生日（必填）</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>出生時間（選填，立春臨界建議填）</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="field">
            <label>性別</label>
            <select value={sex} onChange={(e) => setSex(e.target.value as "male" | "female")}>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>
          <div style={{ fontSize: 12, color: "var(--c-ink-soft)", marginBottom: 8 }}>
            年界以立春交節時刻判定（時區：Asia/Taipei）
          </div>
          {err && <div style={{ color: "var(--c-bad-strong)", fontSize: 13, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn good" style={{ flex: 1 }} onClick={submit}>確認</button>
            <button className="btn" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 紀錄面板 ---------- */

function RecordsPanel({
  records,
  photoUrls,
  onExportZip,
  onExportJson,
  onExportOne,
  onDelete,
}: {
  records: PhotoRecordMeta[];
  photoUrls: Record<string, string>;
  onExportZip: () => void;
  onExportJson: () => void;
  onExportOne: (photoId: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="panel-title">拍照紀錄（{records.length}）</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button className="btn" style={{ flex: 1, fontSize: 12 }} onClick={onExportJson}>匯出 JSON</button>
        <button className="btn primary" style={{ flex: 1, fontSize: 12 }} onClick={onExportZip}>匯出 ZIP</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--c-ink-soft)", marginBottom: 10 }}>
        ⚠️ 此版本僅供匯出保存，不支援匯入還原
      </div>
      {records.map((r) => (
        <div key={r.id} className="glass" style={{ display: "flex", gap: 10, padding: 10, marginBottom: 8, alignItems: "center" }}>
          {photoUrls[r.photoId] ? (
            <img src={photoUrls[r.photoId]} alt={r.title} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 8, background: "var(--c-cream-2)" }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
            <div style={{ fontSize: 11, color: "var(--c-ink-soft)" }}>
              {new Date(r.capturedAt).toLocaleString()}・{Math.round(r.azimuthDisplay)}°・{r.palace}・
              <span className={`star-${STARS[r.star as StarKey]?.luck ?? "neutral"}`}>{STAR_NAME[r.star as StarKey] ?? r.star}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button className="btn" style={{ minHeight: 28, padding: "2px 8px", fontSize: 11 }} onClick={() => onExportOne(r.photoId)}>
              分享
            </button>
            <button className="btn" style={{ minHeight: 28, padding: "2px 8px", fontSize: 11 }} onClick={() => onDelete(r.id)}>
              刪除
            </button>
          </div>
        </div>
      ))}
      {records.length === 0 && <p style={{ fontSize: 13, color: "var(--c-ink-soft)" }}>尚無紀錄</p>}
    </div>
  );
}

/* ---------- 引導頁 ---------- */

function OnboardingScreen({
  onFinish,
  onAddPerson,
  personCount,
  onRequestPerm,
  caps,
}: {
  onFinish: () => void;
  onAddPerson: (name: string, birthDate: string, birthTime: string | null, sex: "male" | "female") => Person;
  personCount: number;
  onRequestPerm: () => Promise<void>;
  caps: ReturnType<typeof detectCapabilities>;
}) {
  const [step, setStep] = useState(0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--c-cream)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700 }}>BaziGFun</div>
      <div style={{ fontSize: 13, color: "var(--c-ink-soft)" }}>禪意八宅實景羅盤 v{APP_VERSION}</div>
      <div className="glass" style={{ maxWidth: 420, width: "100%", padding: 20 }}>
        {step === 0 && (
          <>
            <h2 style={{ fontFamily: "var(--font-serif)" }}>1・建立人物</h2>
            <p>先建立量測對象（資料只存在這台裝置，不會上傳）。</p>
            <PersonPanelCompact onAdd={onAddPerson} count={personCount} />
          </>
        )}
        {step === 1 && (
          <>
            <h2 style={{ fontFamily: "var(--font-serif)" }}>2・權限與感測</h2>
            <p>
              接下來會請求「動作與方向」感測器權限與相機權限。取得後即可用實景羅盤量測八方吉凶。
              {!caps.isSecureContext && " ⚠️ 目前非 HTTPS，感測器與相機可能無法使用。"}
            </p>
            <button className="btn primary" style={{ width: "100%" }} onClick={() => onRequestPerm().then(() => setStep(2))}>
              請求權限
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h2 style={{ fontFamily: "var(--font-serif)" }}>3・開始量測</h2>
            <p>手持手機水平，確認上方感測狀態為「感測✓」後，抬起鏡頭對準要測的方向。方位可隨時切手動模式校正。</p>
            <button className="btn good" style={{ width: "100%" }} onClick={onFinish}>
              進入羅盤
            </button>
          </>
        )}
      </div>
      {step === 0 && personCount > 0 && (
        <button className="btn" onClick={() => setStep(1)}>下一步 →</button>
      )}
    </div>
  );
}

function PersonPanelCompact({
  onAdd,
  count,
}: {
  onAdd: (name: string, birthDate: string, birthTime: string | null, sex: "male" | "female") => Person;
  count: number;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  return (
    <div>
      <div className="field">
        <label>名稱</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：自己" />
      </div>
      <div className="field">
        <label>國曆生日</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field">
        <label>出生時間（選填）</label>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="field">
        <label>性別</label>
        <select value={sex} onChange={(e) => setSex(e.target.value as "male" | "female")}>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </div>
      <button
        className="btn primary"
        style={{ width: "100%" }}
        onClick={() => {
          if (name.trim() && date) {
            onAdd(name.trim(), date, time || null, sex);
          }
        }}
      >
        建立（已有 {count} 人）
      </button>
    </div>
  );
}
