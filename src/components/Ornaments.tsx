/**
 * 介面裝飾與圖示（純 SVG，無外部資源）。
 * 配色取自禪意視覺母版：金色線條、朱紅印章與卦象。
 */
import type { ReactNode } from "react";

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function MenuIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" {...base} strokeWidth={2.2}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** 祥雲裝飾；flip 為鏡像（右側使用） */
export function CloudOrnament({ flip = false, width = 58 }: { flip?: boolean; width?: number }) {
  return (
    <svg
      width={width}
      height={(width * 22) / 64}
      viewBox="0 0 64 22"
      aria-hidden="true"
      className="ornament"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 15c-1.2 3 1.6 5 4.4 3.4" />
        <path d="M3 15c0-4.2 4-6.4 7.4-4.4 1-4.2 7.4-5.4 9.6-1.2 2.2-3.4 8.4-2.4 8.6 1.8 3.2-1 6 1.2 5.4 4.2" />
        <path d="M34 15.5c6 0 8-4 14-4h14" />
        <path d="M10 15.5h24" opacity={0.55} />
      </g>
    </svg>
  );
}

/** 品牌印章：朱紅方章「八宅」 */
export function SealMark() {
  return (
    <span className="seal" aria-hidden="true">
      <span>八</span>
      <span>宅</span>
    </span>
  );
}

/** 命卦卡圖示：三爻（上爻在上），陽爻實線、陰爻斷線，朱紅漸層 */
export function KuaGlyph({ lines }: { lines: [number, number, number] }) {
  const rows = [...lines].reverse(); // 上爻在最上
  const colors = ["#c4382a", "#d4572c", "#e08436"];
  return (
    <svg width={34} height={30} viewBox="0 0 34 30" aria-hidden="true" className="kua-glyph">
      {rows.map((yang, i) => {
        const y = 3 + i * 10;
        return yang ? (
          <rect key={i} x={1} y={y} width={32} height={6} rx={1.8} fill={colors[i]} />
        ) : (
          <g key={i} fill={colors[i]}>
            <rect x={1} y={y} width={13.5} height={6} rx={1.8} />
            <rect x={19.5} y={y} width={13.5} height={6} rx={1.8} />
          </g>
        );
      })}
    </svg>
  );
}

export function CompassGlyph() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" {...base} strokeWidth={1.6}>
      <circle cx={12} cy={12} r={9.2} />
      <path d="M15.8 8.2 13.3 13.3 8.2 15.8 10.7 10.7Z" fill="currentColor" stroke="none" />
      <circle cx={12} cy={12} r={1.1} fill="#1d160a" stroke="none" />
    </svg>
  );
}

export type ActionIconName = "calibrate" | "lock" | "unlock" | "camera" | "expand";

export function ActionIcon({ name }: { name: ActionIconName }): ReactNode {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", ...base };
  switch (name) {
    case "calibrate":
      return (
        <svg {...common}>
          <circle cx={12} cy={12} r={6.5} />
          <circle cx={12} cy={12} r={1.6} fill="currentColor" stroke="none" />
          <path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x={5.5} y={10.5} width={13} height={9.5} rx={2.2} />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
          <circle cx={12} cy={15.2} r={1} fill="currentColor" stroke="none" />
        </svg>
      );
    case "unlock":
      return (
        <svg {...common}>
          <rect x={5.5} y={10.5} width={13} height={9.5} rx={2.2} />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.6-1.7" />
          <circle cx={12} cy={15.2} r={1} fill="currentColor" stroke="none" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common}>
          <path d="M3.5 8.5h3.6l1.4-2h7l1.4 2h3.6v10.5h-17z" />
          <circle cx={12} cy={13.7} r={3.3} />
        </svg>
      );
    case "expand":
      return (
        <svg {...common}>
          <path d="M4 9.5V4h5.5M20 9.5V4h-5.5M4 14.5V20h5.5M20 14.5V20h-5.5" />
          <path d="M4.5 4.5 9 9M19.5 4.5 15 9M4.5 19.5 9 15M19.5 19.5 15 15" opacity={0.7} />
        </svg>
      );
  }
}
