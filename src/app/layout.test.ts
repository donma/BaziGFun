import { describe, it, expect } from "vitest";
import screenCssRaw from "../styles/screen.css?raw";
import panelsCssRaw from "../styles/panels.css?raw";
import { SIDE_PANEL_MEDIA_PARTS, SIDE_PANEL_QUERY } from "./layout";

describe("側欄常駐條件：TS 與 CSS 不得漂移", () => {
  const normalize = (s: string) => s.replace(/\s+/g, " ");
  const screen = normalize(screenCssRaw);
  const panels = normalize(panelsCssRaw);

  it("每個條件片段都出現在 screen.css（側欄版面）與 panels.css（隱藏抽屜）", () => {
    for (const part of SIDE_PANEL_MEDIA_PARTS) {
      expect(screen, `screen.css 缺少 ${part}`).toContain(part);
      expect(panels, `panels.css 缺少 ${part}`).toContain(part);
    }
  });

  it("查詢字串由所有片段以逗號（OR）組成", () => {
    expect(SIDE_PANEL_QUERY.split(", ")).toHaveLength(SIDE_PANEL_MEDIA_PARTS.length);
  });

  it("短螢幕 920–1139px（如 932×430）不會被判為側欄版面：條件要求高度>600 或寬度≥1140", () => {
    expect(SIDE_PANEL_MEDIA_PARTS[0]).toContain("min-height: 601px");
    expect(SIDE_PANEL_MEDIA_PARTS[1]).toContain("min-width: 1140px");
  });
});
