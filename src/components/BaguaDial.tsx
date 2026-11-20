/**
 * 羅盤 SVG 元件：太極＋中央八卦、八方扇區（方位／吉凶名／吉凶標記）、
 * 360° 刻度與 30° 度數標籤。隨 displayHeading 旋轉，文字反向旋轉保持可讀。
 */
import { memo } from "react";
import { PALACES, type DirectionDeg, type StarKey } from "../domain/bazhai/bazhai";

export interface BaguaDialProps {
  /** 顯示航向（相機朝向），盤面依此旋轉 */
  displayHeading: number | null;
  /** 各方位吉凶（key 為扇區中心角） */
  wheel: Record<DirectionDeg, StarKey> | null;
  /** 高亮扇區（互動） */
  highlightDeg: DirectionDeg | null;
  onSectorClick?: (deg: DirectionDeg) => void;
  size?: number;
}

const STAR_CHAR: Record<StarKey, string> = {
  shengQi: "生氣",
  tianYi: "天醫",
  yanNian: "延年",
  fuWei: "伏位",
  huoHai: "禍害",
  liuSha: "六煞",
  wuGui: "五鬼",
  jueMing: "絕命",
};

const GOOD_STARS: StarKey[] = ["shengQi", "tianYi", "yanNian", "fuWei"];

/** 後天八卦符號（依宮位角度） */
const TRIGRAM_BY_DEG: Record<number, string> = {
  0: "☵", // 坎
  45: "☶", // 艮
  90: "☳", // 震
  135: "☴", // 巽
  180: "☲", // 離
  225: "☷", // 坤
  270: "☱", // 兌
  315: "☰", // 乾
};

const STAR_COLOR: Record<StarKey, string> = {
  shengQi: "#3c7a2e",
  tianYi: "#4c8a38",
  yanNian: "#5f974b",
  fuWei: "#7a9a6d",
  huoHai: "#c07a63",
  liuSha: "#b56754",
  wuGui: "#a45140",
  jueMing: "#933c2e",
};

const SECTOR_BG: Record<StarKey, string> = {
  shengQi: "rgba(122,154,109,0.42)",
  tianYi: "rgba(122,154,109,0.34)",
  yanNian: "rgba(122,154,109,0.26)",
  fuWei: "rgba(122,154,109,0.20)",
  huoHai: "rgba(181,106,92,0.22)",
  liuSha: "rgba(181,106,92,0.30)",
  wuGui: "rgba(181,106,92,0.38)",
  jueMing: "rgba(181,106,92,0.46)",
};

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function sectorPath(cx: number, cy: number, r1: number, r2: number, centerDeg: number): string {
  const a0 = centerDeg - 22.5 + 0.5;
  const a1 = centerDeg + 22.5 - 0.5;
  const [x0, y0] = polar(cx, cy, r2, a0);
  const [x1, y1] = polar(cx, cy, r2, a1);
  const [x2, y2] = polar(cx, cy, r1, a1);
  const [x3, y3] = polar(cx, cy, r1, a0);
  return `M ${x0} ${y0} A ${r2} ${r2} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r1} ${r1} 0 0 0 ${x3} ${y3} Z`;
}

export const BaguaDial = memo(function BaguaDial({
  displayHeading,
  wheel,
  highlightDeg,
  onSectorClick,
  size = 480,
}: BaguaDialProps) {
  const C = size / 2;
  const R = size / 2 - 2;
  const rOuter = R;
  const rTickInner = R * 0.86;
  const rSectorOuter = R * 0.85;
  const rSectorInner = R * 0.34;
  const rTrigram = R * 0.245;
  const rTaiChi = R * 0.16;
  const rotation = -(displayHeading ?? 0);

  // 刻度：每 5° 短線、每 30° 長線
  const ticks = [];
  for (let d = 0; d < 360; d += 5) {
    const isMajor = d % 30 === 0;
    const len = isMajor ? R * 0.085 : R * 0.035;
    const [x0, y0] = polar(C, C, rOuter, d);
    const [x1, y1] = polar(C, C, rOuter - len, d);
    ticks.push(
      <line
        key={`t${d}`}
        x1={x0}
        y1={y0}
        x2={x1}
        y2={y1}
        stroke={isMajor ? "#8a7a52" : "#c3b28a"}
        strokeWidth={isMajor ? 1.8 : 0.9}
      />,
    );
  }

  // 每 30° 度數標籤
  const degLabels = [];
  for (let d = 0; d < 360; d += 30) {
    const [x, y] = polar(C, C, rOuter - R * 0.155, d);
    degLabels.push(
      <text
        key={`dl${d}`}
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={R * 0.05}
        fontWeight={600}
        fill="#8a7a52"
        className="dial-text"
        transform={`rotate(${-rotation} ${x} ${y})`}
      >
        {d}°
      </text>,
    );
  }

  return (
    <svg
      className="compass-svg"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`羅盤：目前朝向 ${Math.round(displayHeading ?? 0)} 度`}
    >
      <defs>
        <radialGradient id="dial-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(246,241,231,0.94)" />
          <stop offset="78%" stopColor="rgba(246,241,231,0.80)" />
          <stop offset="100%" stopColor="rgba(239,231,214,0.66)" />
        </radialGradient>
        <filter id="dial-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#3d3423" floodOpacity="0.18" />
        </filter>
      </defs>

      <circle cx={C} cy={C} r={rOuter} fill="url(#dial-bg)" stroke="#a88950" strokeWidth="2.5" />
      <circle cx={C} cy={C} r={rTickInner} fill="none" stroke="#c3b28a" strokeWidth="1" />
      <circle cx={C} cy={C} r={rSectorInner} fill="none" stroke="#c3b28a" strokeWidth="1" />

      <g transform={`rotate(${rotation} ${C} ${C})`}>
        {/* 吉凶扇區 */}
        {PALACES.map((p) => {
          const star = wheel?.[p.deg];
          const good = star ? GOOD_STARS.includes(star) : false;
          return (
            <path
              key={`s${p.deg}`}
              d={sectorPath(C, C, rSectorInner, rSectorOuter, p.deg)}
              fill={star ? SECTOR_BG[star] : "transparent"}
              stroke={highlightDeg === p.deg ? "#a88950" : "rgba(201,185,143,0.65)"}
              strokeWidth={highlightDeg === p.deg ? 3 : 1}
              onClick={onSectorClick ? () => onSectorClick(p.deg) : undefined}
              style={onSectorClick ? { cursor: "pointer" } : undefined}
            />
          );
        })}

        {ticks}
        {degLabels}

        {/* 八方內容：方位／吉凶名／吉凶標記 */}
        {PALACES.map((p) => {
          const star = wheel?.[p.deg];
          const good = star ? GOOD_STARS.includes(star) : false;
          const [dx, dy] = polar(C, C, rSectorOuter - R * 0.12, p.deg);
          const [sx, sy] = polar(C, C, rSectorOuter - R * 0.30, p.deg);
          const [lx, ly] = polar(C, C, rSectorOuter - R * 0.45, p.deg);
          return (
            <g key={`p${p.deg}`}>
              <text
                x={dx}
                y={dy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={R * 0.072}
                fill="#5c5038"
                className="dial-text"
                transform={`rotate(${-rotation} ${dx} ${dy})`}
              >
                {p.branch}
              </text>
              {star && (
                <>
                  <text
                    x={sx}
                    y={sy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={R * 0.092}
                    fontWeight={700}
                    fill={STAR_COLOR[star]}
                    fontFamily="Songti TC, Noto Serif TC, serif"
                    className="dial-text"
                    transform={`rotate(${-rotation} ${sx} ${sy})`}
                  >
                    {STAR_CHAR[star]}
                  </text>
                  <g transform={`translate(${lx} ${ly}) rotate(${-rotation})`}>
                    <rect
                      x={-R * 0.052}
                      y={-R * 0.043}
                      width={R * 0.104}
                      height={R * 0.086}
                      rx={R * 0.02}
                      fill={good ? "#4f8a3f" : "#a84836"}
                    />
                    <text
                      x={0}
                      y={0}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={R * 0.055}
                      fontWeight={700}
                      fill="#fff"
                      fontFamily="sans-serif"
                    >
                      {good ? "吉" : "凶"}
                    </text>
                  </g>
                </>
              )}
            </g>
          );
        })}

        {/* 中央八卦符號（不隨盤轉，保持可讀） */}
        {PALACES.map((p) => {
          const [x, y] = polar(C, C, rTrigram, p.deg);
          return (
            <g key={`g${p.deg}`}>
              <circle cx={x} cy={y} r={R * 0.078} fill="rgba(246,241,231,0.92)" stroke="#c3b28a" strokeWidth="0.8" />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={R * 0.115}
                fontWeight={700}
                fill="#3d3423"
                fontFamily="Songti TC, Noto Serif TC, serif"
              >
                {TRIGRAM_BY_DEG[p.deg]}
              </text>
            </g>
          );
        })}

        {/* 指北標記（靠近外圈，不遮疊扇區吉凶標記） */}
        <g filter="url(#dial-shadow)">
          <polygon
            points={`${C},${C - rSectorOuter + R * 0.01} ${C - R * 0.03},${C - rSectorOuter + R * 0.19} ${C + R * 0.03},${C - rSectorOuter + R * 0.19}`}
            fill="#b04a2f"
          />
        </g>
      </g>

      {/* 太極（不隨盤旋轉） */}
      <g filter="url(#dial-shadow)">
        <circle cx={C} cy={C} r={rTaiChi} fill="#f6f1e7" stroke="#3d3423" strokeWidth="1.5" />
        <path
          d={`M ${C} ${C - rTaiChi} A ${rTaiChi / 2} ${rTaiChi / 2} 0 0 1 ${C} ${C} A ${rTaiChi / 2} ${rTaiChi / 2} 0 0 0 ${C} ${C + rTaiChi} A ${rTaiChi} ${rTaiChi} 0 0 1 ${C} ${C - rTaiChi} Z`}
          fill="#3d3423"
        />
        <circle cx={C} cy={C - rTaiChi / 2} r={rTaiChi / 6} fill="#f6f1e7" />
        <circle cx={C} cy={C + rTaiChi / 2} r={rTaiChi / 6} fill="#3d3423" />
      </g>
    </svg>
  );
});
