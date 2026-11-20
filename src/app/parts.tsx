/**
 * 主畫面的呈現元件（只負責畫面，不含狀態邏輯）。
 */
import type { ReactNode } from "react";
import { ActionIcon, CloudOrnament, CompassGlyph, KuaGlyph, MenuIcon, SealMark, type ActionIconName } from "../components/Ornaments";

export function BrandBar({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
  return (
    <header className="brand-bar">
      <button className="icon-btn" aria-label="人物選單" onClick={onLeft}>
        <MenuIcon />
      </button>
      <h1 className="brand-title">
        <CloudOrnament />
        <span className="brand-text">
          <span>BaziGFun</span>
          <span>八宅風水</span>
        </span>
        <SealMark />
      </h1>
      <button className="icon-btn" aria-label="紀錄與匯出" onClick={onRight}>
        <MenuIcon />
      </button>
    </header>
  );
}

export function SchemePill() {
  return (
    <div className="scheme-row">
      <CloudOrnament width={46} />
      <span className="scheme-pill">完整八宅羅盤</span>
      <CloudOrnament width={46} flip />
    </div>
  );
}

export interface PersonCardProps {
  name: string;
  kuaText: string;
  groupText: string;
  element: string;
  guaYear: number;
  uncertain: boolean;
  lines: [number, number, number];
  onDetail: () => void;
}

export function PersonCard(p: PersonCardProps) {
  return (
    <div className="person-card">
      <KuaGlyph lines={p.lines} />
      <div className="person-meta">
        <div className="person-line1">
          <b className="person-name">{p.name}</b>
          <span className="kua-line">
            <span className="sep">｜</span>
            命卦：{p.kuaText}（{p.groupText}）
          </span>
        </div>
        <div className="person-line2">
          五行：{p.element}
          <span className="sep">｜</span>立春換年：{p.guaYear} 年
          {p.uncertain && (
            <span className="warn-mark" title="生日接近立春交界，建議補出生時間">
              ⚠
            </span>
          )}
        </div>
      </div>
      <button className="detail-pill" onClick={p.onDetail}>
        命盤詳情 ›
      </button>
    </div>
  );
}

export interface HeadingCardProps {
  label: string;
  /** 角度數字，如 "315°" */
  degText: string;
  dirText: string;
  tags: Array<{ text: string; tone?: "bad" }>;
  pill: { name: string; sub: string; tone: "good" | "bad" | "muted"; dim: boolean } | null;
  warn?: { text: string; tone?: "bad" } | null;
  desc: ReactNode;
  cta?: { text: string; onClick: () => void } | null;
}

export function HeadingCard(p: HeadingCardProps) {
  return (
    <div className="heading-card">
      <div className="heading-main">
        <span className="heading-icon">
          <CompassGlyph />
        </span>
        <div className="heading-text">
          <div className="heading-sub">
            <span>{p.label}</span>
            {p.tags.map((t) => (
              <span key={t.text} className={`tag ${t.tone ?? ""}`}>
                {t.text}
              </span>
            ))}
          </div>
          <div className="heading-big">
            {p.degText}
            <span className="dir">{p.dirText}</span>
          </div>
        </div>
        <span className="heading-divider" />
        {p.pill && (
          <span className={`star-pill ${p.pill.tone} ${p.pill.dim ? "is-dim" : ""}`}>
            {p.pill.name}
            {p.pill.sub && <span className="pill-sub">{p.pill.sub}</span>}
          </span>
        )}
      </div>
      <div className="heading-desc">
        {p.warn && <div className={`heading-warn ${p.warn.tone ?? ""}`}>{p.warn.text}</div>}
        <div>{p.desc}</div>
        {p.cta && (
          <button className="cta-btn" onClick={p.cta.onClick}>
            {p.cta.text}
          </button>
        )}
      </div>
    </div>
  );
}

export interface ActionDef {
  key: string;
  label: string;
  icon: ActionIconName;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  on?: boolean;
}

export function ActionRow({ actions }: { actions: ActionDef[] }) {
  return (
    <div className="action-row">
      {actions.map((a) => (
        <button
          key={a.key}
          className={`action-btn ${a.accent ? "accent" : ""} ${a.on ? "is-on" : ""}`}
          onClick={a.onClick}
          disabled={a.disabled}
        >
          <span className="action-circle">
            <ActionIcon name={a.icon} />
          </span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
