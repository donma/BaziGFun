/**
 * 羅盤 SVG：疊在即時相機畫面上，不含任何背景圖。
 *
 * 結構（由外而內）：金色外圈 → 半透明深色度數環（360° 刻度，每 30° 標度數）
 * → 八方扇區（綠＝吉、紅＝凶；方位／吉凶名／吉凶膠囊）→ 深色中央盤（金色後天八卦＋太極）。
 * 盤面依 displayHeading 反向旋轉，使「相機正前方」的扇區位於頂端紅色三角之下。
 *
 * 文字清晰度（解決「毛邊」）：
 * - 文字層在旋轉群組之外，位置直接以三角函數算出絕對座標，文字本身**沒有任何 rotate 變換**，
 *   瀏覽器才會用純縮放＋平移的方式繪字（巢狀旋轉互相抵銷會留下浮點誤差，字邊會糊）。
 * - 文字不描邊：CJK 筆畫轉角多，SVG 預設的尖角（miter）接合會長出尖刺；
 *   可讀性改由扇區／度數環的實色底提供。
 * - 只使用內嵌襯線體 Bold（700）與系統無襯線體，不觸發偽粗體。
 *
 * 效能：不使用 SVG filter／CSS drop-shadow（旋轉時每幀重繪成本高），光暈以多層半透明描邊模擬。
 */
import { memo } from "react";
import { PALACES, isGoodStar, STARS, type DirectionDeg, type PalaceDef, type StarKey } from "../domain/bazhai/bazhai";

export interface BaguaDialProps {
  /** 相機水平朝向（度）；null 時以 0° 呈現 */
  displayHeading: number | null;
  /** 各方位吉凶（key 為扇區中心角）；null 時只畫方位 */
  wheel: Record<DirectionDeg, StarKey> | null;
  /** 目前面向的扇區（經遲滯穩定後） */
  activeDeg: DirectionDeg | null;
  /** 使用者點選高亮的扇區 */
  highlightDeg: DirectionDeg | null;
  /** 水平朝向不可靠時淡化盤面 */
  dimmed?: boolean;
  onSectorClick?: (deg: DirectionDeg) => void;
}

const SIZE = 500;
const C = SIZE / 2;
const R_RING = 238;
const R_BAND_IN = 204;
const R_SEC_IN = 108;
const R_TAI = 40;
const R_TRI = 74;
const R_BLOCK = 156;

const GOLD = "#e3c982";
const GOLD_DEEP = "#b8913f";
const CREAM = "#fbf1d8";
const INK = "#1d160a";
const GOOD_PILL = "#2f7d32";
const BAD_PILL = "#c23b2e";

/**
 * 羅盤透明度設定（0＝全透明、1＝不透明）。想調整透視感只需改這裡。
 * - 扇區／中央盤：實景可透出，但仍需足夠色度讓白字清楚。
 * - 刻度環：底色與刻度線都更透，只當作輕量的方位尺；
 * - halo：文字後方極淡的暗暈（取代文字描邊），透明度變高時仍保有可讀性，且不會讓字邊長毛刺。
 */
export const DIAL_ALPHA = {
  sectorInner: 0.76,
  sectorOuter: 0.68,
  centerInner: 0.72,
  centerOuter: 0.66,
  band: 0.24,
  tickMinor: 0.4,
  tickMid: 0.56,
  tickMajor: 0.72,
  ringInner: 0.5,
  halo: 0.44,
} as const;

/** 與 base.css 的 --font-serif／--font-sans 同步；最後一律落到無襯線體，絕不落到細明體 */
export const DIAL_SERIF =
  "'BZ Serif','Songti TC','Noto Serif CJK TC','Source Han Serif TC','PingFang TC','Microsoft JhengHei',sans-serif";
const SERIF = DIAL_SERIF;
const SANS = "'PingFang TC','Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei','Heiti TC',system-ui,sans-serif";

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function f(n: number): string {
  return n.toFixed(2);
}

function wedgePath(centerDeg: number, rIn: number, rOut: number): string {
  const a0 = centerDeg - 22.5;
  const a1 = centerDeg + 22.5;
  const [x0, y0] = polar(rOut, a0);
  const [x1, y1] = polar(rOut, a1);
  const [x2, y2] = polar(rIn, a1);
  const [x3, y3] = polar(rIn, a0);
  return `M${f(x0)} ${f(y0)}A${rOut} ${rOut} 0 0 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${rIn} ${rIn} 0 0 0 ${f(x3)} ${f(y3)}Z`;
}

/* ---------- 靜態幾何（只算一次） ---------- */

const TICKS = (() => {
  const minor: string[] = [];
  const mid: string[] = [];
  const major: string[] = [];
  for (let d = 0; d < 360; d += 5) {
    const isMajor = d % 30 === 0;
    const isMid = !isMajor && d % 15 === 0;
    const len = isMajor ? 11 : isMid ? 7 : 4;
    const [x0, y0] = polar(R_RING - 2, d);
    const [x1, y1] = polar(R_RING - 2 - len, d);
    const seg = `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
    (isMajor ? major : isMid ? mid : minor).push(seg);
  }
  return { minor: minor.join(""), mid: mid.join(""), major: major.join("") };
})();

const DIVIDERS = (() => {
  const segs: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = 22.5 + 45 * k;
    const [x0, y0] = polar(R_SEC_IN, a);
    const [x1, y1] = polar(R_BAND_IN, a);
    segs.push(`M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`);
  }
  return segs.join("");
})();

const DEG_LABELS = Array.from({ length: 12 }, (_, i) => ({ d: i * 30 }));

/** 卦象三爻（粗線）：本地座標上方＝朝外，第 0 爻（最下）靠近圓心 */
function Trigram({ p }: { p: PalaceDef }) {
  const [x, y] = polar(R_TRI, p.deg);
  const W = 30;
  const H = 6;
  const GAP = 9.5;
  return (
    <g transform={`translate(${f(x)} ${f(y)}) rotate(${p.deg})`} fill={GOLD}>
      {p.lines.map((yang, i) => {
        const cy = GAP - i * GAP;
        return yang ? (
          <rect key={i} x={-W / 2} y={cy - H / 2} width={W} height={H} rx={1.4} />
        ) : (
          <g key={i}>
            <rect x={-W / 2} y={cy - H / 2} width={12.5} height={H} rx={1.4} />
            <rect x={W / 2 - 12.5} y={cy - H / 2} width={12.5} height={H} rx={1.4} />
          </g>
        );
      })}
    </g>
  );
}

const Trigrams = memo(function Trigrams() {
  return (
    <g>
      {PALACES.map((p) => (
        <Trigram key={p.deg} p={p} />
      ))}
    </g>
  );
});

const Defs = memo(function Defs() {
  return (
    <defs>
      <linearGradient id="gold-ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f3dca0" />
        <stop offset="0.5" stopColor={GOLD_DEEP} />
        <stop offset="1" stopColor="#f0d28e" />
      </linearGradient>
      <radialGradient id="sec-good" cx={C} cy={C} r={R_BAND_IN} gradientUnits="userSpaceOnUse">
        <stop offset={R_SEC_IN / R_BAND_IN} stopColor="rgb(42,104,44)" stopOpacity={DIAL_ALPHA.sectorInner} />
        <stop offset="1" stopColor="rgb(72,146,66)" stopOpacity={DIAL_ALPHA.sectorOuter} />
      </radialGradient>
      <radialGradient id="sec-bad" cx={C} cy={C} r={R_BAND_IN} gradientUnits="userSpaceOnUse">
        <stop offset={R_SEC_IN / R_BAND_IN} stopColor="rgb(150,40,34)" stopOpacity={DIAL_ALPHA.sectorInner} />
        <stop offset="1" stopColor="rgb(190,66,54)" stopOpacity={DIAL_ALPHA.sectorOuter} />
      </radialGradient>
      <radialGradient id="center-disc" cx={C} cy={C} r={R_SEC_IN} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="rgb(52,40,20)" stopOpacity={DIAL_ALPHA.centerInner} />
        <stop offset="1" stopColor="rgb(26,20,10)" stopOpacity={DIAL_ALPHA.centerOuter} />
      </radialGradient>
      {/* 文字後方的柔和暗暈：取代描邊，維持可讀性又不傷字邊。中段保持平台，讓小字也落在夠暗的區域 */}
      <radialGradient id="text-halo">
        <stop offset="0" stopColor="#120c04" stopOpacity={DIAL_ALPHA.halo} />
        <stop offset="0.55" stopColor="#120c04" stopOpacity={DIAL_ALPHA.halo * 0.78} />
        <stop offset="1" stopColor="#120c04" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
});

/** 外圈、度數環底、刻度（隨盤旋轉，但與文字分開）— 靜態幾何，內容不隨 props 變 */
const RingArt = memo(function RingArt() {
  return (
    <g>
      <circle
        cx={C}
        cy={C}
        r={(R_RING + R_BAND_IN) / 2}
        fill="none"
        stroke={`rgba(24,18,8,${DIAL_ALPHA.band})`}
        strokeWidth={R_RING - R_BAND_IN}
      />
      <path d={TICKS.minor} stroke={`rgba(251,241,216,${DIAL_ALPHA.tickMinor})`} strokeWidth={1} fill="none" />
      <path d={TICKS.mid} stroke={`rgba(251,241,216,${DIAL_ALPHA.tickMid})`} strokeWidth={1.4} fill="none" />
      <path
        d={TICKS.major}
        stroke={GOLD}
        strokeOpacity={DIAL_ALPHA.tickMajor}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={C} cy={C} r={R_BAND_IN} fill="none" stroke={GOLD} strokeWidth={1.6} opacity={DIAL_ALPHA.ringInner} />
    </g>
  );
});

export const BaguaDial = memo(function BaguaDial({
  displayHeading,
  wheel,
  activeDeg = null,
  highlightDeg = null,
  dimmed = false,
  onSectorClick,
}: BaguaDialProps) {
  const heading = displayHeading ?? 0;
  const rot = -heading;

  return (
    <svg
      className="compass-svg"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={`八宅羅盤，目前朝向 ${Math.round(heading)} 度`}
    >
      <Defs />

      {/* 外圈光暈（多層半透明描邊，不用 filter） */}
      <circle cx={C} cy={C} r={R_RING} fill="none" stroke={GOLD} strokeOpacity={0.1} strokeWidth={22} />
      <circle cx={C} cy={C} r={R_RING} fill="none" stroke={GOLD} strokeOpacity={0.18} strokeWidth={12} />
      <circle cx={C} cy={C} r={R_RING} fill="none" stroke="url(#gold-ring)" strokeWidth={3.2} />

      <g transform={`rotate(${f(rot)} ${C} ${C})`} opacity={dimmed ? 0.5 : 1}>
        <RingArt />

        {/* 八方扇區 */}
        {PALACES.map((p) => {
          const star = wheel?.[p.deg];
          const good = star ? isGoodStar(star) : null;
          const label = star
            ? `${p.branch}方 ${STARS[star].name} ${good ? "吉方" : "凶方"}`
            : `${p.branch}方`;
          return (
            <path
              key={p.deg}
              d={wedgePath(p.deg, R_SEC_IN, R_BAND_IN)}
              fill={star ? (good ? "url(#sec-good)" : "url(#sec-bad)") : "rgba(251,241,216,0.18)"}
              data-sector={p.deg}
              role={onSectorClick ? "button" : undefined}
              tabIndex={onSectorClick ? 0 : undefined}
              aria-label={label}
              onClick={onSectorClick ? () => onSectorClick(p.deg) : undefined}
              onKeyDown={
                onSectorClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSectorClick(p.deg);
                      }
                    }
                  : undefined
              }
              style={onSectorClick ? { cursor: "pointer", outline: "none" } : undefined}
            />
          );
        })}

        {/* 金色分隔線 */}
        <path d={DIVIDERS} stroke={GOLD} strokeWidth={1.7} opacity={0.92} fill="none" pointerEvents="none" />

        {/* 目前面向扇區：淡白填色＋亮邊 */}
        {activeDeg !== null && (
          <path
            d={wedgePath(activeDeg, R_SEC_IN + 1, R_BAND_IN - 1)}
            fill="rgba(255,255,255,0.1)"
            stroke="#fff3cf"
            strokeWidth={2.4}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}

        {/* 使用者點選的扇區：金色粗邊 */}
        {highlightDeg !== null && (
          <path
            d={wedgePath(highlightDeg, R_SEC_IN + 1, R_BAND_IN - 1)}
            fill="rgba(227,201,130,0.16)"
            stroke={GOLD}
            strokeWidth={4}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}

        {/* 中央盤：深色玻璃＋金環＋後天八卦 */}
        <circle cx={C} cy={C} r={R_SEC_IN} fill="url(#center-disc)" />
        <circle cx={C} cy={C} r={R_SEC_IN} fill="none" stroke="url(#gold-ring)" strokeWidth={3.4} />
        <circle cx={C} cy={C} r={R_SEC_IN - 8} fill="none" stroke={GOLD} strokeOpacity={0.5} strokeWidth={1} />
        <circle cx={C} cy={C} r={R_TAI + 12} fill="none" stroke={GOLD} strokeOpacity={0.45} strokeWidth={1} />
        <Trigrams />
      </g>

      {/* 文字層：不在旋轉群組內，座標直接算出，文字本身沒有 rotate 變換（保持銳利） */}
      <g pointerEvents="none" opacity={dimmed ? 0.55 : 1}>
        {DEG_LABELS.map(({ d }) => {
          const [x, y] = polar(R_RING - 23, d - heading);
          return (
            <g key={d}>
              <ellipse cx={f(x)} cy={f(y)} rx={(String(d).length * 7 + 5) / 2 + 8} ry={13} fill="url(#text-halo)" />
              <text
                x={f(x)}
                y={f(y)}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={SANS}
                fontSize={d === 0 ? 14 : 12.5}
                fontWeight={700}
                fill={d === 0 ? "#ffd48a" : CREAM}
              >
                {d}°
              </text>
            </g>
          );
        })}

        {PALACES.map((p) => {
          const star = wheel?.[p.deg];
          const good = star ? isGoodStar(star) : false;
          const [bx, by] = polar(R_BLOCK, p.deg - heading);
          return (
            <g key={p.deg}>
              {star && <ellipse cx={f(bx)} cy={f(by + 1)} rx={44} ry={46} fill="url(#text-halo)" />}
              <text
                x={f(bx)}
                y={f(by + (star ? -25 : 0))}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={SANS}
                fontSize={13.5}
                fontWeight={700}
                fill={CREAM}
              >
                {p.branch}
              </text>
              {star && (
                <>
                  <text
                    x={f(bx)}
                    y={f(by - 1)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily={SERIF}
                    fontSize={27}
                    fontWeight={700}
                    fill="#ffffff"
                    letterSpacing={1}
                  >
                    {STARS[star].name}
                  </text>
                  <rect
                    x={f(bx - 16)}
                    y={f(by + 15)}
                    width={32}
                    height={20}
                    rx={5.5}
                    fill={good ? GOOD_PILL : BAD_PILL}
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                  />
                  <text
                    x={f(bx)}
                    y={f(by + 25)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily={SANS}
                    fontSize={14}
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    {good ? "吉" : "凶"}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </g>

      {/* 太極（不隨盤旋轉） */}
      <g pointerEvents="none">
        <circle cx={C} cy={C} r={R_TAI + 3} fill="rgba(20,14,6,0.55)" stroke={GOLD} strokeWidth={1.6} />
        <circle cx={C} cy={C} r={R_TAI} fill="#f3ead3" />
        <path
          d={`M${C} ${C - R_TAI}A${R_TAI / 2} ${R_TAI / 2} 0 0 1 ${C} ${C}A${R_TAI / 2} ${R_TAI / 2} 0 0 0 ${C} ${C + R_TAI}A${R_TAI} ${R_TAI} 0 0 1 ${C} ${C - R_TAI}Z`}
          fill={INK}
        />
        <circle cx={C} cy={C - R_TAI / 2} r={R_TAI / 7} fill="#f3ead3" />
        <circle cx={C} cy={C + R_TAI / 2} r={R_TAI / 7} fill={INK} />
      </g>

      {/* 頂端固定朝向三角：相機正前方 */}
      <polygon
        points={`${C - 10},1 ${C + 10},1 ${C},21`}
        fill="#e0432f"
        stroke="#fff3d6"
        strokeWidth={1.6}
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </svg>
  );
});
