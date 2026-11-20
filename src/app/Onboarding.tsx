/**
 * 首次引導：建立人物 → 說明並請求權限 → 進入羅盤。
 */
import { useState } from "react";
import { APP_VERSION } from "./version";
import { PersonFields, type AddPerson } from "./panels";
import type { detectCapabilities } from "../sensors/deviceOrientation";

export function OnboardingScreen({
  onFinish,
  onAddPerson,
  personCount,
  onRequestPerm,
  caps,
}: {
  onFinish: () => void;
  onAddPerson: AddPerson;
  personCount: number;
  onRequestPerm: () => Promise<void>;
  caps: ReturnType<typeof detectCapabilities>;
}) {
  const [step, setStep] = useState(0);
  return (
    <div className="onboarding">
      <div className="onboarding-brand">BaziGFun</div>
      <div className="onboarding-sub">禪意八宅實景羅盤 v{APP_VERSION}</div>
      <div className="glass onboarding-card">
        {step === 0 && (
          <>
            <h2>1・建立人物</h2>
            <p>先建立量測對象（資料只存在這台裝置，不會上傳）。</p>
            <CreatePerson onAdd={onAddPerson} count={personCount} />
          </>
        )}
        {step === 1 && (
          <>
            <h2>2・權限與感測</h2>
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
            <h2>3・開始量測</h2>
            <p>手持手機水平，確認上方感測狀態為「感測✓」後，抬起鏡頭對準要測的方向。方位可隨時切手動模式校正。</p>
            <button className="btn good" style={{ width: "100%" }} onClick={onFinish}>
              進入羅盤
            </button>
          </>
        )}
      </div>
      {step === 0 && personCount > 0 && (
        <button className="btn" onClick={() => setStep(1)}>
          下一步 →
        </button>
      )}
    </div>
  );
}

function CreatePerson({ onAdd, count }: { onAdd: AddPerson; count: number }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  return (
    <div>
      <PersonFields {...{ name, setName, date, setDate, time, setTime, sex, setSex }} />
      <button
        className="btn primary"
        style={{ width: "100%" }}
        onClick={() => {
          if (name.trim() && date) onAdd(name.trim(), date, time || null, sex);
        }}
      >
        建立（已有 {count} 人）
      </button>
    </div>
  );
}
