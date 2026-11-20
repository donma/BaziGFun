# BaziGFun 八宅羅盤

> 禪意後天八卦實景羅盤 PWA — 以 iPhone Safari、iOS Chrome 與加入主畫面的 PWA 為主要使用端。
>
> **本機優先・離線可用・不上傳任何個人資料。**

BaziGFun 透過後置相機即時背景、半透明禪意八卦羅盤、個人八宅命卦與手機方向感測，協助使用者量測室內各方向對不同人物的八宅吉凶。所有人物、照片與紀錄只存在於裝置本機，不需要登入，也不會傳到任何伺服器。

> ⚠️ **重要限制**：這是傳統文化參考的輔助測量工具，不是專業測量儀器，也不宣稱科學驗證。相機拍到物件不等於能測得物件本身的面向；畫面分清楚「相機水平朝向」與「門／床等物件的朝向」。方向資料可能被 iOS 瀏覽器限制、姿態不明確與磁場干擾影響，因此介面明確區分感測可信狀態，不顯示虛假精度。

---

## 目录

- [功能概覽](#功能概覽)
- [畫面說明](#畫面說明)
- [快速開始](#快速開始)
- [專案結構](#專案結構)
- [核心演算法](#核心演算法)
- [感測器與方位引擎](#感測器與方位引擎)
- [本機資料與 schema](#本機資料與-schema)
- [匯出格式](#匯出格式)
- [離線 PWA 與隱私](#離線-pwa-與隱私)
- [測試與驗收](#測試與驗收)
- [部署](#部署)
- [已知限制](#已知限制)
- [版本與 API 參考](#版本與-api-參考)

---

## 功能概覽

| 功能 | 說明 |
|---|---|
| 八宅命卦引擎 | 立春交節換年、男女命卦、五黃寄宮、大遊年八宅吉凶，全部集中版本化並有人工核對測試表 |
| 實景羅盤 | 後置相機全螢幕背景；SVG 羅盤含太極、中央後天八卦、八方、360° 刻度、四吉四凶 |
| 方位感測 | `webkitCompassHeading`（iOS）優先、標準 `alpha` 備援；圓形濾波、遲滯、交界提示、朝天／地退化警告 |
| 手動備援 | 手動羅盤（±5° 微調＋滑桿）、四方位偏移校正、重置偏移 |
| 人物管理 | 新增／編輯切换／刪除；每個人各自計算命卦與八方吉凶；僅存本機 |
| 拍照紀錄 | Canvas 合成實景＋羅盤＋資訊卡 → JPEG；紀錄角度、來源、吉凶、可信狀態 |
| 分析面板 | 八宅命卦與方位（3×3 方位圖＋簡介）、人物比較、紀錄管理；手機抽屜／寬螢幕雙欄 |
| 匯出 | JSON＋單張照片分享／下載；批次 ZIP（JSON＋`photos/*.jpg`）；iOS Share API 降級為瀏覽器下載。**第一版無匯入** |
| PWA | 可安裝、版本化離線快取、更新提示、safe-area、RWD、减少動畫偏好 |

---

## 畫面說明

**直式手機（主要使用情境）**

```
┌───────────────────────────────┐
│ ☰  張明道  命卦: 乾6命(西四命) 命盤詳情 › │
│    五行: 金 ｜ 立春換年: 1991年          │
│         [無感測] [磁北]                  │
│                                       │
│           實景相機背景                   │
│      ┌────── 羅盤 ──────┐            │
│      │  西北伏位吉 北六煞凶 … │            │
│      │   中央八卦 + 太極   │            │
│      └────────────────┘            │
│  ⌖ 目前朝向  0° 北   〔六煞（凶方）〕     │
│     尚未取得感測資料…                    │
│  [校正指南針][鎖定方位][拍照紀錄][切換羅盤] │
└───────────────────────────────┘
```

- 點右上角「命盤詳情 ›」或左上「☰」可開啟分析抽屜，内含：
  - **命卦方位**：個人命卦卡（卦象、卦名、東西四命、五行、立春計算年）＋上北下南 3×3 方位圖＋命卦與方位簡介
  - **人物**：新增／切換／刪除
  - **紀錄**：查看、分享／下載、刪除、匯出 JSON／ZIP

**橫式與寬螢幕（≥920px）**

- 橫式：重新排版，羅盤縮小並保留所有操作
- 寬螢幕／摺疊展開：左側實景羅盤＋右側可收合分析面板（viewport 為依據，不硬綁裝置型號）

**無感測資料時**

顯示「示範方位・未取得感測」標記並以 0° 北呈現，明確標示為示範，不冒充即時量測；拍照功能的真實角度紀錄仍保持停用。

---

## 快速開始

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 28 個單元測試
npm run build        # 型別檢查 + 生產建置（dist/）+ Service Worker
npm run preview      # 預覽含 SW 的正式版本
```

需要 Node.js 20+（建議 22/24）。

**iOS 實機測試**

```bash
npm run dev -- --host
# 手機與電腦同網段，Safari 開啟 http://<電腦IP>:5173
```

> 感測器與相機的 `getUserMedia` / `DeviceOrientationEvent.requestPermission()` 需要 **HTTPS 或 localhost**。因此 iPhone 實機請部署到 Cloudflare Pages（HTTPS）後測試，不要用純 HTTP 的區網 IP。

---

## 專案結構

```
src/
  app/
    App.tsx              # 主畫面、引導、相機/感測整合、抽屜、匯出、校正
    version.ts           # 應用版本
  domain/
    bazhai/
      lichun.ts          # 立春交節天文計算 + 已查證精確值覆寫表
      mingGua.ts         # 男女命卦、五黃寄宮、干支年、卦性對照表
      bazhai.ts          # 後天八卦、大遊年歌、扇區/邊界、吉凶星表
      *.test.ts          # 人工核對表 + 性質測試
    compass/
      heading.ts         # 角度正規化、圓形濾波、遲滯、退化、磁偏角
      heading.test.ts
  sensors/
    deviceOrientation.ts # 能力偵測、iOS 權限、事件解讀
    useHeading.ts        # React hook：濾波 / 新鮮度 / 校正偏移
  camera/
    cameraManager.ts     # getUserMedia、啟停、影格擷取
  components/
    BaguaDial.tsx        # 羅盤 SVG
  analysis/
    MingGuaPanel.tsx     # 八宅命卦與方位分析面板
  storage/
    storage.ts           # localStorage + IndexedDB、schema v1、migration 入口
  export/
    exporter.ts          # JSON / JPEG / ZIP / Share 降級
  pwa/
    registerSW.ts        # Service Worker 註冊與更新提示
  styles/
    theme.css            # 禪意 token、RWD、safe-area、無障礙
public/
  favicon.svg
  icon-192.png / icon-512.png / icon-maskable-512.png
```

核心計算皆為**純函式**，UI 不直接把原始瀏覽器 `alpha` 當成相機真方位。

---

## 核心演算法

### 1. 立春年界（`lichun.ts`）

- 以 Meeus《Astronomical Algorithms》的低階太陽視黃經公式，牛頓迭代求太陽視黃經 = 315°（立春）的瞬間。
- 以公開天文機構／官方媒體公布的時刻建立**版本化測試錨點**與**精確值覆寫表**：
  - 2000/02/04 20:40:24 CST、2012/02/04 18:22 CST
  - 2023/02/04 10:42:21 CST
  - 2024/02/04 16:26:53 CST
  - 2025/02/03 22:10:13 CST
  - 2026/02/04 04:01:51 CST
- 近年命中覆寫表（秒級）；其餘年份用天文計算，並誠實標註低階理論與公布值差可達數分鐘。
- 生日落在立春交界且缺出生時間時，`boundaryUncertain = true`，UI 提示補時間，**不靜默猜測**。

### 2. 命卦（`mingGua.ts`）

- 出生時間／立春時區：第一版固定 `Asia/Taipei`（UTC+8），介面有標註。
- 以西元年（立春換年後）各位數縮減：
  - 男：`11 − 位數和`，女：`4 + 位數和`，結果正規化到 1–9
  - 5 為五黃：男寄坤二、女寄艮八
- 卦性對照：坎1水、坤2土、震3木、巽4木、乾6金、兌7金、艮8土、離9火
- 東四命：坎、離、震、巽；西四命：乾、坤、艮、兌
- 引擎版本：`minggua-bazhai-1.0.0`

### 3. 八宅吉凶（`bazhai.ts`）

- 以「大遊年歌」版本化編碼，八卦依順時針圓序：坎北(0°)、艮東北(45°)、震東(90°)、巽東南(135°)、離南(180°)、坤西南(225°)、兌西(270°)、乾西北(315°)。
- 每卦歌訣首字為本宮伏位，其後七字對應順時針下一宮起：
  - 乾六天五禍絕延生／坎五天生延絕禍六／艮六絕禍生延天五／震延生禍絕五天六
  - 巽天五六禍生絕延／離六五絕延禍生天／坤天延絕生禍五六／兌生禍延絕六五天
- 四吉：生氣、天醫、延年、伏位；四凶：禍害、六煞、五鬼、絕命。
- 扇區中心為 0/45/…315°，邊界為 22.5° 的奇數倍；`boundaryDistanceDeg` 提供交界距離。
- 對照表版本：`bazhai-dayou-1.0.0`

---

## 感測器與方位引擎

- 方位定義：北 0°、東 90°、南 180°、西 270°。
- 狀態欄位：`rawHeading`、`displayHeading`、`cameraAzimuth`、`northReference`、`source`（sensor/manual）、`quality`（valid/uncertain/unavailable）、`boundaryDistance`。
- iOS：先做能力檢查，於使用者手勢中呼叫 `DeviceOrientationEvent.requestPermission()`；`webkitCompassHeading` 存在時優先使用，但**不假設其必然存在、必為磁北或等於鏡頭朝向**。
- Android／一般瀏覽器：用 `alpha` 配合螢幕方向角換算，標記為「感測弱」，建議以已知方位校正。
- 濾波：一階圓形低通（0/360 跨越安全），平滑只改顯示值，不改寫原始測量。
- 遲滯：扇區切換需越過邊界 + 1.5° 才更新，避免交界紅綠閃爍；交界 ≤2° 顯示警告。
- 退化：鏡頭近垂直朝天／地（beta 近 ±180°）顯示「水平朝向不可靠」，暫停決定性展示。
- 新鮮度：超過 3 秒無樣本降為 `uncertain`，App 背景化時暫停相機。
- 真北：**第一版僅提供顯示切換，未內建磁偏角換算**；無可靠資料時不得默默以磁北冒充真北。

---

## 本機資料與 schema

| 資料 | 存放位置 | 說明 |
|---|---|---|
| 人物、`currentPersonId`、設定 | `localStorage`（key `bazigfun.v1`） | `schemaVersion: 1`，含 migration 入口 |
| 照片 Blob | IndexedDB `photos` | `{ id, blob, mimeType, createdAt }`，不存 base64 到 localStorage |
| 拍照紀錄 | IndexedDB `records` | `personId`、`capturedAt` 索引；UUID、`photoId` 關聯 |

- 照片以 JPEG 品質 0.88 輸出；提供 `navigator.storage.estimate()` 容量查詢與 `QuotaExceededError` 提示。
- 未經使用者允許不自動刪除照片。
- 清除網站資料、系統儲存壓力、重新安裝或不同瀏覽器／主畫面容器都可能造成資料不存在；Safari、Chrome 與主畫面 PWA 的儲存容器不互通。

---

## 匯出格式

呼叫分析面板「紀錄 → 匯出 ZIP」或「匯出 JSON」：

- `bazigfun-data.json`
  - `schemaVersion`、`exportedAt`、`appVersion`
  - `persons[]`（id、name、birthDate、birthTime、sex、timezone `Asia/Taipei`、kua）
  - `records[]`（id、personId、title、方位原始／顯示值、northReference、source、quality、palace、star、nearBoundary、photoId、note、capturedAt）
  - `photos[]`（id、`photos/<photoId>.jpg`、mimeType，不內嵌二進位）
  - `settings`
- `photos/<photoId>.jpg`：以 photoId 唯一命名，避免重名覆蓋
- 批次：`bazigfun-export-YYYYMMDD.zip`（JSON＋照片資料夾）
- 單張：Web Share API Level 2（`canShare` 檢查）→ 失敗降級為瀏覽器下載

> ⚠️ 第一版**不支援匯入還原**，也沒有合併／覆蓋／去重流程；匯出僅供保存或未來相容工具使用。介面已明確提示。

---

## 離線 PWA 與隱私

- `vite-plugin-pwa` `generateSW`：預先快取 App Shell、CSS、JS、圖示與服務工作人員（8 個項目）。
- 首次快取完成才提示離線可用；「有新版本可用」採非強制更新提示，避免舊 bundle 與新資料結構衝突。
- 離線可：選人物、算八宅、看本機照片、拍照、手動或可用感測羅盤、JSON＋照片匯出。
- 不保證相機／感測器權限離線必然可取得，以裝置實測為準。
- 無後端 API、無帳號、無第三方分析 SDK；相機影格、出生資料、照片不離開裝置。

---

## 測試與驗收

### 已通過（自動化）

```text
Test Files  3 passed (3)
Tests      28 passed (28)
```

涵蓋：

- 立春錨點（2000/2012/2023–2026 vs 天文機構公布值）與各年份收斂範圍
- 1990/1995/2000 等人工核對表、五黃寄宮、八命卦全覆蓋、人物切換
- 八卦方位映射 8/8、邊界 ±ε、0/360
- 大遊年八歌全對照、每命四吉四凶
- 圓形濾波、最短角差、遲滯、磁偏角換算、退化判定

### 瀏覽器整合實測（Chrome 桌面，合成 `webkitCompassHeading`）

- 0°→90°→180°→270°→359°→0° 全鏈路：UI 角度、宮位、吉凶、盤面旋轉皆正確
- 0/360 跨越收斂正常；交界 23° 警告正確
- 邊界 21°↔24° 抖動 10 次，吉凶僅最後切換一次（無閃爍）
- 朝天（beta=175°）退化警告出現／恢復水平後消失
- 拍照：1080×1920 合法 JPEG 存入 IndexedDB，`photoId` 關聯一致
- ZIP 匯出：內含 `bazigfun-data.json` 與 `photos/*.jpg`
- 多人物切換、命盤詳情、校正彈窗、鎖定方位、手動微調皆正常；Console 零錯誤

### 待實機驗收（阻斷性）

以下需要真實 iPhone 與 HTTPS 部署，無法以模擬器或合成事件取代：

1. Safari／Chrome／加入主畫面 PWA 的相機與方向感測授權、拒絕、重新啟動、切換 App、直橫旋轉、離線啟動。
2. 以物理已知方位實測北／東／南／西與斜方向；直立、水平、不同 roll/pitch 比較「相機水平朝向」一致性；記錄原始 API 欄位與精度。
3. 可用感測器上不得顯示錯誤方位；若無可靠絕對朝向，必須明確降級至手動模式。
4. 實測後再訂誤差範圍，未達標前不宣稱「精準方位」。

---

## 部署

### GitHub Pages（本專案已設定）

`.github/workflows/deploy.yml` 在每次 push 到 `main` 時自動 `npm ci` → `npm run build` → 部署 `dist/`。

**一次性設定**：到 repo 的 `Settings → Pages → Build and deployment`，把 **Source 設為「GitHub Actions」**（不要選「Deploy from a branch／main」，否則 Pages 會直接提供未編譯的 `index.html`，瀏覽器載入 `/src/main.tsx` 而顯示空白頁）。

完成後網址：`https://donma.github.io/BaziGFun/`

> `vite.config.ts` 已設定 `base: "/BaziGFun/"`，manifest 的 `start_url`／`scope` 與 Service Worker 的 `navigateFallback` 也一併指向子路徑。

### Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy dist --project-name=bazigfun
```

或連動 Git 儲存庫：

- Build command：`npm run build`
- Build output directory：`dist`
- 不需要 D1、R2、KV、Cloudflare AI 或身份服務

---

## 已知限制

1. **iOS 指南針準確性需實機標定**：不同裝置的 `webkitCompassHeading` 語義與精度不同；標準 `alpha` 多為相對初始方向。
2. 真北模式目前僅切換標記，**未做磁偏角換算**。
3. 低階立春天文計算對沒有覆寫值的年份可能有數分鐘誤差；交界提示會補足風險。
4. 本機資料可能因清理網站資料、儲存壓力、重新安裝或不同瀏覽器容器而遺失；請定期匯出 ZIP。
5. 不支援匯入還原、雲端同步、帳號、物件朝向的電腦視覺辨識或 SLAM 錨定。
6. 命理與吉凶為傳統文化規則，產品定位為文化參考，不宣稱科學驗證。

---

## 版本與 API 參考

- App：`1.0.0`
- 命卦引擎：`minggua-bazhai-1.0.0`
- 八宅對照：`bazhai-dayou-1.0.0`
- 立春資料：`lichun-astro-1.0.0`
- Schema：`1`

參考資料：

- [MDN — DeviceOrientationEvent.requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
- [MDN — DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)
- [MDN — getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN — 由相機擷取靜態影格](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Taking_still_photos)
- [web.dev — PWA offline data](https://web.dev/learn/pwa/offline-data)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)

---

**施工底線**：真正的 iOS 指南針準確性必須由實機驗證；網頁可實作的 UI 效果與能取得可信絕對方位，是兩個不同的驗收項目。
