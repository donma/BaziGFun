/**
 * 側欄／抽屜共用面板：命卦方位、人物管理、拍照紀錄。
 * 人名與備註是使用者輸入的文字，一律用系統無襯線體（不依賴內嵌字體的子集）。
 */
import { useState } from "react";
import { MingGuaPanel } from "../analysis/MingGuaPanel";
import { KUA_TABLE, kuaTitle, type MingGuaResult } from "../domain/bazhai/mingGua";
import { STARS, type DirectionDeg, type StarKey } from "../domain/bazhai/bazhai";
import type { LSData, Person, PhotoRecordMeta } from "../storage/storage";

export type PanelTab = "sectors" | "persons" | "records";
export type AddPerson = (name: string, birthDate: string, birthTime: string | null, sex: "male" | "female") => Person;

export interface SidePanelProps {
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
  addPerson: AddPerson;
  records: PhotoRecordMeta[];
  photoUrls: Record<string, string>;
  onExportZip: () => void;
  onExportJson: () => void;
  onExportOne: (photoId: string) => void;
  onDeleteRecord: (id: string) => void;
  onOpenPhoto: (photoId: string) => void;
}

const TABS: Array<[PanelTab, string]> = [
  ["sectors", "命卦方位"],
  ["persons", "人物"],
  ["records", "紀錄"],
];

export function SidePanel(p: SidePanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="panel-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={p.tab === k}
            className={`btn ${p.tab === k ? "primary" : ""}`}
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
          onOpenPhoto={p.onOpenPhoto}
        />
      )}
    </div>
  );
}

/* ---------- 人物 ---------- */

function PersonPanel({
  ls,
  selectPerson,
  removePerson,
  addPerson,
}: {
  ls: LSData;
  selectPerson: (id: string) => void;
  removePerson: (id: string) => void;
  addPerson: AddPerson;
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
            className={`glass list-card ${person.id === ls.settings.currentPersonId ? "is-current" : ""}`}
          >
            <div className="list-main" onClick={() => selectPerson(person.id)}>
              <div className="list-title">{person.name}</div>
              <div className="list-sub">
                {person.birthDate}・{kuaTitle(person.kua)}・{info.group === "east4" ? "東四命" : "西四命"}
              </div>
            </div>
            <button className="btn mini-btn" onClick={() => removePerson(person.id)}>
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
          <PersonFields {...{ name, setName, date, setDate, time, setTime, sex, setSex }} />
          <p className="hint">年界以立春交節時刻判定（時區：Asia/Taipei）</p>
          {err && <div className="form-err">{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn good" style={{ flex: 1 }} onClick={submit}>
              確認
            </button>
            <button className="btn" onClick={() => setShowForm(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PersonFields(p: {
  name: string;
  setName: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  sex: "male" | "female";
  setSex: (v: "male" | "female") => void;
}) {
  return (
    <>
      <div className="field">
        <label>名稱</label>
        <input value={p.name} onChange={(e) => p.setName(e.target.value)} placeholder="例：媽媽" />
      </div>
      <div className="field">
        <label>國曆生日（必填）</label>
        <input type="date" value={p.date} onChange={(e) => p.setDate(e.target.value)} />
      </div>
      <div className="field">
        <label>出生時間（選填，立春臨界建議填）</label>
        <input type="time" value={p.time} onChange={(e) => p.setTime(e.target.value)} />
      </div>
      <div className="field">
        <label>性別</label>
        <select value={p.sex} onChange={(e) => p.setSex(e.target.value as "male" | "female")}>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </div>
    </>
  );
}

/* ---------- 紀錄 ---------- */

function RecordsPanel({
  records,
  photoUrls,
  onExportZip,
  onExportJson,
  onExportOne,
  onDelete,
  onOpenPhoto,
}: {
  records: PhotoRecordMeta[];
  photoUrls: Record<string, string>;
  onExportZip: () => void;
  onExportJson: () => void;
  onExportOne: (photoId: string) => void;
  onDelete: (id: string) => void;
  onOpenPhoto: (photoId: string) => void;
}) {
  return (
    <div>
      <div className="panel-title">拍照紀錄（{records.length}）</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button className="btn" style={{ flex: 1, fontSize: 12 }} onClick={onExportJson}>
          匯出 JSON
        </button>
        <button className="btn primary" style={{ flex: 1, fontSize: 12 }} onClick={onExportZip}>
          匯出 ZIP
        </button>
      </div>
      <p className="hint">⚠️ 此版本僅供匯出保存，不支援匯入還原</p>
      {records.map((r) => {
        const star = STARS[r.star as StarKey];
        return (
          <div key={r.id} className="glass list-card">
            <button
              type="button"
              className="record-open"
              aria-label={`查看${r.title}的完整照片與詳情`}
              onClick={() => onOpenPhoto(r.photoId)}
            >
              {photoUrls[r.photoId] ? (
                <img className="thumb" src={photoUrls[r.photoId]} alt={r.title} />
              ) : (
                <div className="thumb" />
              )}
              <div className="list-main">
                <div className="list-title">{r.title}</div>
                <div className="list-sub">
                  {new Date(r.capturedAt).toLocaleString()}・{Math.round(r.azimuthDisplay)}°・{r.palace}・
                  <span className={star ? `star-${star.luck}` : undefined}>{star?.name ?? r.star}</span>
                </div>
              </div>
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button className="btn mini-btn" onClick={() => onExportOne(r.photoId)}>
                分享
              </button>
              <button className="btn mini-btn" onClick={() => onDelete(r.id)}>
                刪除
              </button>
            </div>
          </div>
        );
      })}
      {records.length === 0 && <p className="hint">尚無紀錄</p>}
    </div>
  );
}
