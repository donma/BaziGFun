# BaziGFun 八宅羅盤

> 禪意後天八卦實景羅盤 PWA — 以 iPhone Safari、iOS Chrome 與加入主畫面的 PWA 為主要使用端；Android Chrome、橫式與摺疊螢幕（如 Surface Duo）的版面也已針對性處理並以自動化實測。
>
> **本機優先・離線可用・不上傳任何個人資料。**

BaziGFun 透過後置相機即時背景、半透明禪意八卦羅盤、個人八宅命卦與手機方向感測，協助使用者量測室內各方向對不同人物的八宅吉凶。所有人物、照片與紀錄只存在於裝置本機，不需要登入，也不會傳到任何伺服器。

> ⚠️ **重要限制**：這是傳統文化參考的輔助測量工具，不是專業測量儀器，也不宣稱科學驗證。相機拍到物件不等於能測得物件本身的面向；畫面分清楚「相機水平朝向」與「門／床等物件的朝向」。方向資料可能被 iOS 瀏覽器限制、姿態不明確與磁場干擾影響，因此介面明確區分感測可信狀態，不顯示虛假精度。

---

## 目錄

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
| 實景羅盤 | 後置相機全螢幕即時畫面當背景（無任何靜態背景圖）；SVG 羅盤含太極、中央後天八卦、八方、360° 刻度、四吉四凶；扇區與刻度環半透明，實景可透出 |
| 方位感測 | iOS `webkitCompassHeading` 優先；Android `deviceorientationabsolute`／歐拉角以姿態幾何換算相機視線（直式、橫式、傾斜皆正確）；圓形濾波、遲滯、交界提示、朝天／地時凍結並標示 |
| 手動備援 | 手動羅盤（±1° 微調＋滑桿）、四方位偏移校正（顯示偏移量）、重置偏移 |
| 人物管理 | 新增／切換／刪除；每個人各自計算命卦與八方吉凶；僅存本機 |
| 拍照紀錄 | 依螢幕相同的 cover 規則裁切實景＋羅盤＋資訊卡 → JPEG；紀錄角度、來源、吉凶、可信狀態 |
| 分析面板 | 八宅命卦與方位（3×3 方位圖＋簡介）、人物、紀錄管理；手機底部抽屜／寬螢幕右側常駐面板 |
| 橫式與摺疊螢幕 | 橫式重新排版（羅盤＋資訊並排）；摺疊裝置依 CSS Viewport Segments 把「實景羅盤」與「分析面板」分在兩個螢幕，內容不跨鉸鏈；一律以 viewport 判斷，不硬綁裝置型號 |
| 匯出 | JSON＋單張照片分享／下載；批次 ZIP（JSON＋`photos/*.jpg`）；iOS Share API 降級為瀏覽器下載。**第一版無匯入** |
| 字體 | 內嵌 Noto Serif TC Bold 子集（SIL OFL）作顯示字，三平台一致、離線可用；禁用偽粗體 |
| PWA | 可安裝、版本化離線快取、更新提示、safe-area、RWD、減少動畫偏好、量測時螢幕保持不休眠 |

---

## 畫面說明

**直式手機（主要使用情境）**

```
┌───────────────────────────────┐
│ ☰   ☁ BaziGFun 八宅風水 [八宅]   ☰ │  ← 品牌列（左☰＝人物、右☰＝紀錄）
│         ( 完整八宅羅盤 )               │
│ ▤ 張明遠｜命卦：乾六命（西四命） 命盤詳情 › │
│   五行：金｜立春換年：1991 年            │
│      [感測✓] [磁北] [相機✓]            │  ← 狀態列
│        即時相機畫面（背景）             │
│      ┌────── 羅盤 ──────┐            │
│      │ 八方・吉凶名・吉／凶膠囊 │            │
│      │  後天八卦環 + 太極    │            │
│      └────────────────┘            │
│  ◎ 目前朝向 315° 西北 │ 伏位（吉方）    │
│     適合：休息、穩定、累積…              │
│  (校正指南針)(鎖定方位)(拍照紀錄)(切換羅盤) │  ← 圓形圖示鈕
└───────────────────────────────┘
```

**兩個漢堡選單與「命盤詳情」**——都是打開同一個底部抽屜，只是預設分頁不同：

| 按鈕 | 打開的分頁 | 內容 |
|---|---|---|
| 左上 ☰（人物選單） | 人物 | 切換／新增／刪除人物（選定人物後抽屜自動收合） |
| 右上 ☰（紀錄與匯出） | 紀錄 | 拍照紀錄清單、分享／刪除、匯出 JSON／ZIP（提示不支援匯入） |
| 命盤詳情 › | 命卦方位 | 個人命卦卡（卦象、東西四命、五行、立春計算年）＋上北下南 3×3 方位圖＋命卦與方位簡介 |

- 抽屜可用：點外側暗處、點頂端橫槓、右上角 ✕、鍵盤 Esc 關閉。
- 寬螢幕（≥920px）右側面板常駐，兩個漢堡只負責切換面板分頁。

**方位狀態如何標示（不偽造即時量測）**

| 情況 | 畫面 |
|---|---|
| 感測正常 | 綠色「感測✓」 |
| 只有相對方位（非絕對北） | 黃色「需校正」 |
| 鏡頭近乎朝天／地 | 「朝向不穩」＋盤面與數字**凍結在最後有效方位**、吉凶改為「暫停判定」 |
| 一段時間沒有感測資料 | 紅色「感測中斷」，顯示為最後讀數（變淡）。iOS 指南針固定頻率送出，3 秒沒資料即判定；Chrome 歐拉角只在姿態改變時才送，手機靜止時給 20 秒寬限，避免誤報 |
| 尚無感測 | 紅色「無感測」，以示範 0° 呈現並標註；iOS 會出現「啟用方向感測」按鈕 |
| 手動／鎖定 | 「手動」／「已鎖定」；套用校正偏移時顯示「偏移 +12°」 |

- 點某個方位扇區：高亮該扇區並跳出簡短說明。
- 距扇區邊界 ≤2° 顯示「接近方位交界」；吉凶顯示套用 1.5° 遲滯，避免紅綠閃爍。

**相機狀態與生命週期**（狀態列最右側的小膠囊）

| 情況 | 畫面與行為 |
|---|---|
| 正常 | 綠色「相機✓」；背景是後置相機的**即時串流**（沒有任何靜態背景圖） |
| 被外力中斷（其他 App 搶走相機、裝置中斷） | 黃色「相機中斷」＋提示；卸下死掉的串流、改顯示暖色底；點膠囊即重新開啟 |
| 權限被拒／找不到相機／啟動失敗 | 「相機拒絕」／「相機失敗」＋對應說明；可手動重試，或改用手動羅盤 |
| App 切到背景 | 立即關閉鏡頭（隱私與耗電）；回到前景自動重新開啟 |
| 啟動途中就被切到背景 | 鏡頭一取得就立刻還回去，不會在背景偷偷開著，也不會誤報「相機✓」 |
| 暫時性錯誤（相機剛被釋放、`NotReadableError`） | 自動重試一次 |

**橫式、寬螢幕與摺疊螢幕**

| 情境 | 版面 |
|---|---|
| 手機橫式（如 844×390、667×375） | 左：羅盤；右：品牌列＋人物卡＋朝向卡＋圓形按鈕，全部可見、不需捲動 |
| 寬螢幕／平板橫式（≥920×601 或 ≥1140 寬） | 左：實景羅盤；右：常駐分析面板（兩個漢堡只切換面板分頁） |
| 摺疊裝置・左右雙螢幕（`horizontal-viewport-segments: 2`） | 左螢幕＝實景羅盤，右螢幕＝分析面板；鉸鏈位置留空，彈窗／提示／引導都只置中在左螢幕 |
| 摺疊裝置・上下雙螢幕（`vertical-viewport-segments: 2`） | 上螢幕＝精簡橫式羅盤畫面，下螢幕＝分析面板 |
| 摺疊裝置・合起（單螢幕） | 與一般手機直式／橫式相同 |

- 版面以 viewport 與 CSS Viewport Segments 判斷，**不硬編任何裝置型號**；窄欄位（橫式右欄、半螢幕）的品牌列、人物卡、朝向卡用 container query 依自身寬度縮放，不裁字、不擠壓。
- 最小可點擊區域一律 44px（小膠囊以視覺 22px＋透明擴張點擊區達成）。
- 只支援標準 Viewport Segments；舊版 Edge 的 `spanning`／`env(fold-*)` 草案 API **不支援**。

**無感測資料時**

顯示「示範方位・未取得感測」標記並以 0° 北呈現，明確標示為示範，不冒充即時量測；拍照功能的真實角度紀錄仍保持停用。

---

## 快速開始

```bash
npm install
npm run dev            # http://localhost:5173/BaziGFun/
npm test               # 64 個單元測試（八宅引擎、方位幾何、版面規則）
npm run build          # 型別檢查 + 生產建置（dist/）+ Service Worker
npm run preview        # 預覽含 SW 的正式版本（http://localhost:4173/BaziGFun/）

# 以下三項是「真瀏覽器」自動化實測：先另開終端機執行 npm run dev（或 npm run preview），
# 要測其他網址就加參數，例如  npm run test:layout -- --url=http://localhost:4173/BaziGFun/
npm run test:layout    # 14 種視窗／摺疊情境 × 多種狀態的版面檢查（+ 截圖到 scripts/.cache/shots）
npm run test:sensor    # 用 Chrome／Edge 的方向感測模擬驗證陀螺儀 → 方位 → 吉凶全鏈路
npm run test:camera    # 相機串流與生命週期、拍照（JPEG／紀錄）、匯出 ZIP

npm run fonts          # 重新產生內嵌字體子集（改了介面文字時執行）
npm run icons          # 重新產生 PWA 圖示
```

需要 Node.js 20+（建議 22/24）。`test:layout`／`test:sensor`／`test:camera` 另需本機安裝 Edge 或 Chrome（可用環境變數 `BROWSER_PATH` 指定路徑）。

**手機實機測試**

```bash
npm run dev -- --host
# 手機與電腦同網段，開啟 http://<電腦IP>:5173/BaziGFun/（僅能測版面）
```

> 感測器與相機的 `getUserMedia` / `DeviceOrientationEvent.requestPermission()` 需要 **HTTPS 或 localhost**。因此手機實機測相機與方向感測，請直接用已部署的 HTTPS 網址 `https://donma.github.io/BaziGFun/`，不要用純 HTTP 的區網 IP。

---

## 專案結構

```
src/
  app/
    App.tsx              # 主畫面狀態機（鎖定／手動／即時／中斷／示範）、相機、拍照、抽屜、校正
    parts.tsx            # 品牌列、人物卡、朝向卡、狀態列、圓形按鈕等小元件
    panels.tsx           # 抽屜／側邊面板內容（人物、紀錄、命卦方位）
    Onboarding.tsx       # 首次引導：建立人物 → 請求相機與方向感測權限 → 進入羅盤
    layout.ts            # 「何時顯示常駐側欄」的判斷（與 CSS media query 同一份來源，有測試對照）
    version.ts           # 應用版本
  domain/
    bazhai/
      lichun.ts          # 立春交節天文計算 + 已查證精確值覆寫表
      mingGua.ts         # 男女命卦、五黃寄宮、干支年、卦性對照表
      bazhai.ts          # 後天八卦、大遊年歌、扇區/邊界、吉凶星表
      *.test.ts          # 人工核對表 + 性質測試
    compass/
      heading.ts         # 角度正規化、圓形濾波、遲滯、姿態幾何（歐拉角 → 相機朝向／仰角）
      heading.test.ts
  sensors/
    deviceOrientation.ts # 能力偵測、iOS 權限、事件解讀（含 deviceorientationabsolute）
    headingProcessor.ts  # 純邏輯：感測樣本 → HeadingState（來源語義、濾波、退化、可信度）
    useHeading.ts        # React hook：新鮮度（依來源）、校正偏移
    useStableSector.ts   # 扇區遲滯（避免交界紅綠閃爍）
  camera/
    cameraManager.ts     # getUserMedia、啟停、生命週期保證（見下）、影格擷取
    coverCrop.ts         # 與螢幕 object-fit: cover 相同的裁切計算
    composite.ts         # 拍照合成：實景＋羅盤＋資訊卡 → JPEG
  components/
    BaguaDial.tsx        # 羅盤 SVG（透明度集中在 DIAL_ALPHA；文字不描邊、不旋轉）
    Ornaments.tsx        # 雲紋、印章、卦象符號等裝飾
  analysis/
    MingGuaPanel.tsx     # 八宅命卦與方位分析面板
  storage/
    storage.ts           # localStorage + IndexedDB、schema v1、migration 入口
  export/
    exporter.ts          # JSON / JPEG / ZIP / Share 降級
  pwa/
    registerSW.ts        # Service Worker 註冊與更新提示
  assets/fonts/
    bz-serif-bold.woff2  # Noto Serif TC Bold 子集（SIL OFL，由 npm run fonts 產生）
  styles/
    base.css             # 設計 token、字體、無障礙、減少動畫
    screen.css           # 主畫面、橫式、側欄、摺疊螢幕版面
    panels.css           # 抽屜、彈窗、提示、引導
public/
  favicon.svg
  icon-192.png / icon-512.png / icon-maskable-512.png
scripts/
  layout-check.mjs       # 真瀏覽器版面實測（視窗／摺疊模擬）
  sensor-check.mjs       # 真瀏覽器方向感測實測（DevTools 方向模擬）
  camera-check.mjs       # 真瀏覽器相機／拍照／匯出實測
  lib/test-browser.mjs   # 三支實測共用：找瀏覽器、穩定的假相機畫面、啟動參數
  subset-fonts.mjs       # 字體子集化
  gen-icons.mjs          # PWA 圖示產生
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
- 狀態欄位：`rawHeading`（未平滑）、`displayHeading`（濾波後＋人工偏移）、`cameraAzimuth`（鏡頭近垂直時為 null）、`northReference`、`source`（sensor/manual）、`quality`（valid/uncertain/unavailable）、`semantic`（資料語義）、`elevation`（鏡頭仰角）、`boundaryDistance`。
- 資料語義明確區分三種來源，並在介面如實標示（`headingProcessor.ts`）：

  | 來源 | 條件 | 可信度 |
  |---|---|---|
  | `webkit-compass` | iOS `webkitCompassHeading` | 回報精度 >30° 或為負值 → 不確定；直立持機時視為鏡頭朝向，**需實機標定** |
  | `absolute-euler` | `deviceorientationabsolute`，或 `absolute=true` 的 alpha/beta/gamma | 有效（磁北基準） |
  | `relative-euler` | `absolute=false` 的歐拉角 | 一律「需校正」（相對方位不是北） |

- **相機水平朝向**由完整姿態（alpha/beta/gamma → 旋轉矩陣）算出「後鏡頭視線向量」的水平分量：直式、橫式、手機滾轉、鏡頭上仰／下俯都得到同一個水平朝向；不使用「`alpha` 直接當方位」的簡化公式（簡化公式在手機滾轉 30° 時會差 30°）。
- iOS：先做能力檢查，於使用者手勢中呼叫 `DeviceOrientationEvent.requestPermission()`；`webkitCompassHeading` 存在時優先使用，但**不假設其必為鏡頭朝向**。
- 濾波：一階圓形低通（0/360 跨越安全），平滑只改顯示值，不改寫原始測量；人工偏移在濾波之後才疊加。
- 遲滯：扇區切換需越過邊界 1.5°（目前扇區中心 ±24°）才更新，避免交界紅綠閃爍；交界 ≤2° 顯示警告。
- 退化：鏡頭仰角超過 65°（接近朝天／朝地）時水平朝向不可靠 → 標「朝向不穩」，**盤面與數字凍結在最後有效方位**、吉凶顯示「暫停判定」；正對天空／地面、完全無法換算水平朝向時不產生新的方位。
- 新鮮度：iOS 指南針固定頻率送出，3 秒沒資料即「感測中斷」；歐拉角事件只在姿態改變時才送，手機靜止時給 20 秒寬限；App 進背景時暫停相機與螢幕保持喚醒，回前景恢復。
- 真北：**尚未提供**（需要位置與磁偏角資料）。介面只顯示「磁北」標示（點擊會說明原因），拍照紀錄一律寫入 `northReference: "magnetic"`，不會默默以磁北冒充真北。`applyDeclination` 純函式已備妥，待有可靠資料來源再接上。

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

- `vite-plugin-pwa` `generateSW`：預先快取 App Shell、CSS、JS、圖示、內嵌字體與服務工作人員（15 個項目、約 390 KiB）。
- 首次快取完成才提示離線可用；「有新版本可用」採非強制更新提示，避免舊 bundle 與新資料結構衝突。
- 離線可：選人物、算八宅、看本機照片、拍照、手動或可用感測羅盤、JSON＋照片匯出。
- 不保證相機／感測器權限離線必然可取得，以裝置實測為準。
- 無後端 API、無帳號、無第三方分析 SDK；相機影格、出生資料、照片不離開裝置。

---

## 測試與驗收

### 1. 單元測試（`npm test`）

```text
Test Files  6 passed (6)
Tests      64 passed (64)
```

分別在 `TZ=UTC`、`America/Los_Angeles`、`Asia/Taipei`、`Pacific/Auckland` 下各跑一次，結果一致（計算不依裝置時區）；GitHub Actions 每次部署前也會先跑。涵蓋：

- 立春錨點（2000/2012/2023–2026 vs 天文機構公布值）與各年份收斂範圍
- 1990/1995/2000 等人工核對表、五黃寄宮、八命卦全覆蓋、人物切換
- 八卦方位映射 8/8、邊界 ±ε、0/360；大遊年八歌全對照、每命四吉四凶
- 圓形濾波、最短角差、扇區遲滯（含「一次只能走一個扇區」的回歸測試）、磁偏角換算
- 姿態幾何：歐拉角 → 相機水平朝向／仰角（直式、橫式、滾轉、上仰下俯、朝天／朝地）
- 感測樣本 → 狀態：iOS／絕對／相對三種來源語義、可信度、退化、感測中斷門檻
- 拍照與螢幕一致的 cover 裁切；CSS media query 與 `layout.ts` 的側欄判斷條件同步

### 2. 陀螺儀實測（`npm run test:sensor`，真實 Chrome／Edge）

透過 DevTools「Sensors → Orientation」同一條協定（CDP `DeviceOrientation.setDeviceOrientationOverride`），讓**瀏覽器自己送出真正的 `deviceorientation` 事件**，驗證 事件 → 姿態幾何 → 相機朝向 → 八宅吉凶 → 畫面 全鏈路（人物：1991 年生女性＝乾六命）。16 項全數通過：

| 姿態 | 畫面結果 |
|---|---|
| 直式，鏡頭朝 北／西／南／東／西北 | 0° 北 六煞凶／270° 西 生氣吉／180° 南 絕命凶／90° 東 五鬼凶／315° 西北 伏位吉 |
| 橫式握持，鏡頭朝西／朝東 | 270° 西 生氣吉／90° 東 五鬼凶 |
| 手機滾轉 30° | 330°（若直接用 `alpha`，這裡會差 30°） |
| 鏡頭上仰 30°／下俯 30° | 水平朝向不變，仍為 0° 北 |
| 鏡頭朝天、手機平放（鏡頭朝地） | 「朝向不穩」＋吉凶「暫停判定」＋警告，不亂跳 |
| DevTools 的相對方位 | 狀態列誠實標為「需校正」，不冒充「感測✓」 |
| 校正指南針：把朝北的鏡頭校成「東」 | 立即顯示 90° 東；「重置偏移」後回 0° 北 |
| 全程 | Console 零錯誤 |

> 這驗證的是「軟體對感測事件的換算與標示」，不是手機磁力計的實體準確度；見下方〈待實機驗收〉。

### 3. 相機、拍照與匯出實測（`npm run test:camera`，真實 Edge／Chrome）

走完整流程，共 4 段 37 項檢查，**開發版與正式建置版皆全數通過**：

| 段落 | 驗證內容 |
|---|---|
| A 相機串流 | 背景是**即時串流**（track=live、畫面不是黑的、6 秒後仍活著）；主畫面沒有任何 `url()` 背景或 `<img>`（無靜態背景圖） |
| B 生命週期 | 串流被外力結束 → 狀態列如實改為「相機中斷」、卸下死串流、出現提示、點一下即恢復；切到背景 → 作用中的鏡頭串流 1 → 0、回前景自動重開；**啟動途中就被切到背景 → 取得的串流全數關閉（0 個仍開著）、不誤報「相機✓」** |
| C 拍照 | 鏡頭朝西北 → 按「拍照紀錄」→ 合法 JPEG 存入 IndexedDB；紀錄欄位（315°、乾宮、伏位、`northReference=magnetic`、`source=sensor`）正確；照片寬高比與螢幕可見區一致（同一套 cover 裁切）；取樣確認背景是相機畫面、羅盤畫在螢幕上的相同位置、底部有資訊卡 |
| D 匯出 | 右上漢堡 → 紀錄 → 匯出 ZIP → 解開後含 `bazigfun-data.json` 與 `photos/<id>.jpg`；JSON 欄位正確；ZIP 內照片與拍到的照片**位元組完全相同** |

> **測試用的假相機**：Chromium 內建的假相機（綠色測試圖）會在啟動後數秒自行結束串流，之後畫面全黑（Edge 155、Chrome 156、有頭／無頭皆如此，單獨一個只有 `getUserMedia` 的空白頁也一樣，與本 App 無關）。所以三支實測改以 `--use-file-for-fake-video-capture` 餵一段循環播放的合成室內場景（`scripts/lib/test-browser.mjs` 產生於 `scripts/.cache/`，不進 App 也不進 `dist/`），串流不會自己結束，也能肉眼判斷半透明羅盤疊在亮窗、米牆、暗地板上的樣子。

### 4. 版面與摺疊螢幕實測（`npm run test:layout`，真實 Edge／Chrome）

14 個視窗情境 × 多種狀態（預設、手動羅盤、面板開啟、校正彈窗、提示條），每個情境 27–51 項檢查，**開發版與正式建置版皆全數通過**。

| 類別 | 視窗 |
|---|---|
| 手機直式 | iPhone 14 390×844、iPhone SE 375×667、小型 Android 360×640 |
| 手機橫式 | iPhone 14 844×390、iPhone 15 Pro Max 932×430、iPhone SE 667×375、小型 Android 640×360 |
| 平板／桌機 | iPad 768×1024、1024×768、桌機 1280×800 |
| Surface Duo | 合起直式 540×720、合起橫式 720×540、展開左右雙螢幕 1114×720（鉸鏈垂直，位置 540、寬 34）、展開上下雙螢幕 720×1114（鉸鏈水平，位置 540、寬 34） |

檢查項目：

- 品牌列、人物卡、羅盤、朝向卡、4 顆圓形按鈕等關鍵元素都在視窗內、互不重疊；羅盤直徑 ≥170px；頁面不捲動
- **文字不被裁切或溢出**（人名、命卦、吉凶膠囊、朝向卡）；漢堡鈕與圓形按鈕可點擊範圍 ≥44px
- 摺疊模擬確實生效（瀏覽器回報 `viewport-segments: 2`）；側欄、抽屜、彈窗、提示條、引導都**不壓到鉸鏈**
- 相機即時畫面運作中；Console 零錯誤
- 每個情境留存截圖到 `scripts/.cache/shots/`（摺疊情境以洋紅色帶標示鉸鏈）

### 5. 視覺檢查

- 字體：內嵌 Noto Serif TC Bold 子集載入成功；3 倍放大截圖確認筆畫邊緣平滑、無毛邊（SVG 文字不描邊、不旋轉，以文字後方的柔和暗暈取代描邊來維持可讀性）
- 透明度：扇區與中央盤半透明、刻度環更透；在「亮窗＋米牆＋暗地板」的合成場景上，大字與度數小字皆清楚可讀
- 兩個漢堡選單與抽屜的關閉方式、多人物切換、命盤詳情、校正彈窗、鎖定方位、手動微調皆正常

### 待實機驗收（阻斷性）

以下需要真實裝置與 HTTPS 部署（`https://donma.github.io/BaziGFun/`），無法以模擬器或合成事件取代：

1. iPhone Safari／Chrome／加入主畫面 PWA，以及 Android Chrome：相機與方向感測授權、拒絕、重新啟動、切換 App、直橫旋轉、離線啟動。
2. 以物理已知方位實測北／東／南／西與斜方向；直立、水平、不同 roll/pitch 比較「相機水平朝向」一致性；記錄原始 API 欄位與精度。
3. 可用感測器上不得顯示錯誤方位；若無可靠絕對朝向，必須明確降級至手動模式。
4. 實測後再訂誤差範圍，未達標前不宣稱「精準方位」。
5. **Surface Duo（或其他摺疊機）實機**：目前的摺疊版面只在 Edge／Chrome 以 DevTools 的雙螢幕模擬（`displayFeature`）驗證過，鉸鏈位置、寬度與實際的 `viewport-segments` 行為需以硬體確認。
6. **iOS Safari 的拍照合成**：羅盤是把 SVG（含內嵌字體）轉成圖片再畫進 canvas，Safari 對這個流程偶有「字體首次繪製尚未解碼」的差異，需在 iPhone 上實拍確認照片中的文字。
7. 實機相機畫面的解析度與對焦：照片解析度取決於裝置相機回傳的影格大小（螢幕 cover 裁切後輸出），自動化測試的合成畫面只有 960×540。

---

## 部署

### GitHub Pages（本專案已設定）

`.github/workflows/deploy.yml` 在每次 push 到 `main` 時自動 `npm ci` → `npm test` → `npm run build` → 部署 `dist/`；**單元測試不通過就不會部署**。

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

1. **iOS 指南針準確性需實機標定**：不同裝置的 `webkitCompassHeading` 語義與精度不同；Android 的 `deviceorientationabsolute` 雖以磁北為基準，仍易受金屬與電器干擾，使用前請以已知方位校正；只提供相對方位的裝置會標示「需校正」。
2. **沒有真北**：一律以磁北為基準（介面標示「磁北」，紀錄寫入 `northReference: "magnetic"`）；真北需要位置與磁偏角資料，尚未提供。
3. 低階立春天文計算對沒有覆寫值的年份可能有數分鐘誤差；交界提示會補足風險。
4. 本機資料可能因清理網站資料、儲存壓力、重新安裝或不同瀏覽器容器而遺失；請定期匯出 ZIP。
5. 不支援匯入還原、雲端同步、帳號、物件朝向的電腦視覺辨識或 SLAM 錨定。
6. 命理與吉凶為傳統文化規則，產品定位為文化參考，不宣稱科學驗證。
7. **摺疊螢幕僅經瀏覽器模擬驗證**（見〈待實機驗收〉）；只支援標準 CSS Viewport Segments，不支援舊版 Edge 的 `spanning`／`env(fold-*)` 草案 API；iOS Safari 沒有摺疊 API（iPhone 也沒有摺疊機型）。
8. 自動化實測驗證的是**軟體對感測事件與相機串流的處理**，不等於磁力計的實體準確度，也不等於各家手機相機的實際表現。

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
