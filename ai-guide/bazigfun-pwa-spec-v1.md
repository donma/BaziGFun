# BaziGFun — PWA 第一版施工規格

版本：1.0 規格凍結草案 ｜ 日期：2026-11-20 ｜ 需求訪談 21 題，理解度 99.95%（需求完整度估計，不代表實機驗收）

## 1. 產品目標

以 iPhone Safari、iOS Chrome 和加入主畫面的 PWA 為主要使用端。透過後置相機即時背景、半透明禪意後天八卦羅盤、個人八宅命卦及手機方向感測，讓使用者測量室內各方向對不同人物的八宅吉凶。手機本機管理人物與照片，離線可用，不需登入、不將出生資料或照片傳給伺服器。

**重要限制**：這是輔助測量工具，不是專業測量儀器。相機拍到物件不等於能測得物件面向，畫面須分清楚「相機水平朝向」與「門／床等物件本身的朝向」。方向資料可能受 iOS 瀏覽器限制、姿態不明確與磁場干擾影響，禁止顯示虛假精度。

## 2. 已定 21 項決策

1. 實景優先：選擇人物後預設導入相機實景羅盤；權限不足時保留一般／手動羅盤。
2. 命卦：傳統八宅；國曆日期、性別，立春交節換年。
3. 出生資料：年月日必填，出生時分選填；立春臨界時提醒補時間。
4. 多人物：新增、編輯、刪除、切換；人物資料僅儲存在裝置本機。
5. 方位：自動感測優先，支援手動調整／校正；來源狀態明示。
6. 實景羅盤方位：依真實方向旋轉，方位與相機水平朝向對應。
7. 拍照＋紀錄：合成實景與羅盤，依人物記錄名稱、備註、角度、吉凶、時間。
8. 完整羅盤：太極、後天八卦符號、八方、360 度刻度、四吉四凶名稱全部可見。
9. 水平確認指南針＋垂直實景；持續處理三軸姿態，不得沿用未補償的水平數字。
10. 首次引導式授權啟動；再次使用盡量減少教學。
11. 原訂完整 ZIP 備份還原；**已被第 20–21 題修訂**，第一版只有匯出，沒有匯入還原。
12. 使用後天八卦排列：北坎、東北艮、東震、東南巽、南離、西南坤、西兌、西北乾。
13. 磁北／真北切換，預設磁北；磁偏角不得硬編碼。
14. 交界提示＋角度平滑＋遲滯，避免吉凶閃爍，不偽造精度。
15. 直式與橫式均完整支援。
16. 完整離線 PWA，首次快取完成後不需網路即可使用本機核心功能。
17. 摺疊／寬螢幕採雙欄＋可收合的專業分析面板；布局以 viewport 為依據，不硬綁裝置型號。
18. 專業面板含八方解析、多人物比較、拍照紀錄，點擊方向可高亮扇區。
19. 一般 iPhone 與大螢幕功能完全一致；一般手機用抽屜／完整分析頁呈現。
20. 第一版不製作匯入還原，也無合併、覆蓋、去重匯入流程。
21. 第一版匯出 JSON＋獨立照片；單張分享／下載，批次可選 ZIP 包含 JSON＋照片；不使用 CSV。

## 3. 技術選型與部署

- 建議：Vite + TypeScript + React（或等價輕量元件框架），SVG 羅盤，CSS Grid/Container Queries，Web APIs。
- 靜態部署 Cloudflare Pages 或 Workers Static Assets；第一版不使用 D1、R2、KV、Cloudflare AI 或身份服務。
- `manifest.webmanifest`、可安裝圖示、Service Worker 快取版本化的 App Shell、CSS、JS、字型、圖案及計算所需的離線資料；不快取相機影格。
- 本機：人物、當前人物 ID、設定使用 localStorage；照片 Blob、影像紀錄元資料使用 IndexedDB。具備 schema version 與遷移策略。
- 所有相機、感測器與地理定位權限必須以 HTTPS、適當使用者手勢及瀏覽器實際能力檢查處理。
- 禁止任何圖片或個人資料的後端 API 上傳；首頁亦不得引入會收集個資的第三方分析 SDK。

## 4. 核心程式結構

```text
src/
  app/             # 路由、主狀態、啟動引導、錯誤界面
  domain/bazhai/   # 立春年界、男女命卦、五黃寄宮、八方吉凶、版本測試
  domain/compass/  # 北方基準、姿態換算、角度正規化、濾波、遲滯、可信狀態
  sensors/         # DeviceOrientation adapter、裝置能力偵測與權限
  camera/          # getUserMedia、前後景與重新啟動、影格拍照
  components/      # CameraScene、BaguaDial、StatusPanel、PersonPicker
  analysis/        # 八方解析、多人物比較、照片列表
  storage/         # localStorage、IndexedDB、Schema migrations
  export/          # JSON、JPEG、ZIP 匯出
  pwa/             # Service Worker、安裝／離線／更新提示
  styles/          # 淺色禪意 token、直橫 RWD、safe-area
  tests/           # unit/integration/e2e
```

使用純函式做命卦、角度及吉凶計算；UI 不得直接依賴原始瀏覽器 `alpha` 當作必然的相機真方位。

## 5. 命卦運算規範

- 輸入：人物名稱、國曆出生年月日、性別、選填出生時分。時間／立春界線以明確設定的出生地時區處理（第一版預設 Asia/Taipei，介面須標註）。
- 年界：使用可信且經測試的立春交節時刻資料或可驗證天文計算；不能用固定每年 2/4 00:00 假裝精確。
- 日期不在立春附近時，可依日期安全判斷年界；在跨年界且缺出生時間時提示不確定並要求選擇／補資料，不得靜默猜測。
- 傳統男女命卦、五黃寄宮與八宅四吉四凶對照表集中版本化，不允許 UI 個別硬編碼結果。不同派別存在差異時採同一套明示版本，建立人工核對測試表。
- 必測：連續年份、跨世紀年、立春前／後／臨界時刻、男女、五黃、八個命卦、八方向、人物切換。
- 命理判讀與吉凶為傳統文化規則，產品資訊以文化參考定位，不宣稱科學驗證。

## 6. 感測器／方位引擎

- 方位定義：北 0°、東 90°、南 180°、西 270°；以 45° 每扇區、中心方位在 0/45/.../315°；邊界為 22.5° 的奇數倍。
- 區分 `rawHeading`、`displayHeading`、`cameraAzimuth`、`northReference`、`source`（sensor/manual）、`quality`（valid/uncertain/unavailable）、`boundaryDistance`。
- 先進行 iOS Safari 與 Chrome 的能力檢查；可使用 `DeviceOrientationEvent.requestPermission()`（存在時）及 `webkitCompassHeading`（存在且語義已實測時），但不得無條件假設這些欄位存在、一定是磁北或直接等於鏡頭朝向。
- 使用姿態／螢幕角度／後置相機方向的幾何變換推算水平朝向；**原型階段先用已知方位基準進行四向與多姿態標定**，未通過不能宣稱準確。
- 水平儀式為使用者確認指南針與感測狀態，不保證完成硬體磁力計校正；提供人工角度偏移、重置偏移、手動旋轉模式。
- 真北僅在可靠方位語義與磁偏角資料可用時啟用；磁偏角需位置與日期（或預先離線可靠資料），無法計算時明示不可用，不能默默以磁北替代。
- 原始 0/360 跨越使用 circular filtering / shortest-angle interpolation；顯示平滑不改寫原始測量。
- 吉凶分類根據明確的判斷角度與對照表，靠近邊界顯示不確定提醒；遲滯只針對 UI 顯示穩定，需避免悄悄讓已超界角度被當作準確另一方。
- 鏡頭幾乎朝正上／正下時水平投影退化：顯示「水平朝向不可靠」，暫停決定性的吉凶更新。
- 在失去感測器數據、app 背景化、旋轉螢幕等情形，不得保留失效的數據假裝是即時量測。

## 7. UI／UX 與 RWD

- 以使用者指定的禪意視覺母版為唯一美術基準：真實相機全螢幕背景、米白淡金、柔綠吉方與柔紅凶方、半透明玻璃卡、中央太極與後天八卦同心圓。
- 頂部：人物、命卦、五行、東四命／西四命，北方基準及來源狀態；中間：完整 8 扇區與刻度；底部：目前角度、方位、吉凶名稱與說明；操作：校正、鎖定、拍照、切換羅盤。
- 方向指示固定於 UI 可辨識位置；方位刻度與八宅吉凶隨真實朝向正確旋轉。若需顯示旋轉動畫，文字可做反向旋轉保持可讀，且方位語義不得變。
- 一般手機直式：全畫面相機羅盤＋底部抽屜；橫式：重新排版且保留所有操作；寬視窗／摺疊展開：左實景右側可收合八方解析／人物比較／紀錄 tabs。
- 功能不依螢幕限制。用安全區 `env(safe-area-inset-*)`、動態 viewport 單位與容器查詢適配；不要依賴未確定的摺疊裝置實際型號／畫面尺寸。
- 新用戶流程：建立／選擇人物 → 說明並請求權限 → 水平確認 → 抬起鏡頭實景。權限失敗時顯示明確原因與手動替代。
- 所有字體與按鈕須在日光、複雜室內背景下足夠可讀，維持相機背景可見；支援 VoiceOver 和減少動畫偏好。

## 8. 拍照、紀錄與本機資料

- 擷取實際 `video` 幀至 Canvas，使用與螢幕一致的裁切規則，繪製羅盤、方向、吉凶、人物與當時參考基準，再匯出 JPEG。需處理裝置像素比、方向、鏡像、可用記憶體。
- 建立紀錄：UUID、personId、標題、備註、拍攝時間 ISO 8601、方位原始值／顯示值、來源、磁／真北、八宅方向、吉凶、感測可信狀態、交界提示、photoId、schemaVersion。
- 紀錄支援查看、修改標題／備註、刪除、下載、分享；照片 IndexedDB Blob，不存 base64 至 localStorage。
- 避免 IndexedDB 存量無限成長：縮圖、JPEG 品質設計、儲存量提示、`QuotaExceededError` 處理；未經允許不得自動刪除照片。
- 相機、感測器於畫面隱藏／切換場景時妥善暫停與重啟；已拍照但尚未完成儲存須有狀態提示。

## 9. JSON 與照片匯出（第一版，不匯入）

- `bazigfun-data.json`：`schemaVersion`、`exportedAt`、`appVersion`、`persons[]`、`records[]`、`settings`、`photos[]`（列出 photoId、檔名、媒體型別、關聯記錄，不內嵌二進位）。
- 每張相片個別輸出 `.jpg`；照片檔名以 photoId 為唯一識別，防止重名覆蓋。
- 單筆圖片分享／下載；批次可提供 `bazigfun-export-YYYYMMDD.zip`，內容包含 JSON 與 `photos/*.jpg`；檔案很大時先估算容量、限制單次大量佔用記憶體並提示分批匯出。
- 匯出時明確提示：目前版本 **不支援匯入還原**，JSON + 圖片僅供保存或未來相容工具使用。
- 匯出全部在裝置執行；iOS 分享與儲存 API 不可用時降級為瀏覽器下載。

示例 JSON（僅示意資料結構，非使用者資料）：

```json
{
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-11-20T00:00:00.000Z",
  "persons": [
    {"id":"p-001","name":"範例人物","birthDate":"1990-05-12","birthTime":null,"sex":"female","timezone":"Asia/Taipei","kua":"computed-by-versioned-engine"}
  ],
  "records": [
    {"id":"r-001","personId":"p-001","title":"客廳大門","azimuthDeg":315,"northReference":"magnetic","source":"sensor","quality":"valid","photoId":"img-001","note":"","capturedAt":"2026-11-20T00:00:00.000Z"}
  ],
  "photos": [{"id":"img-001","file":"photos/img-001.jpg","mimeType":"image/jpeg"}],
  "settings": {"northReference":"magnetic"}
}
```

## 10. 離線 PWA 和隱私

- Service Worker 預先快取核心 app assets；首次快取完成才提示離線可用。更新採版本化更新提示，避免舊 bundle 和新資料結構衝突。
- 離線：已安裝／已快取狀態下可選人物、計算八宅、看本地照片、拍照、手動或可用感測羅盤、JSON＋照片匯出。
- 絕不承諾相機或感測器權限離線必然可取得：以裝置／瀏覽器實測為準。
- 本機資料可能因清理網站資料、系統儲存空間壓力、重新安裝或不同瀏覽器／主畫面容器而不存在；向使用者告知風險。Safari、Chrome 與主畫面 PWA 可能使用不同的儲存容器，不可保證互通。
- 如需定位以換算真北，僅在使用者主動啟用時請求，無需儲存精確位置；無法取得時降級提示。

## 11. 必做測試與驗收

### A. 演算法（自動化）
- 八卦方位映射 8/8 完整，邊界 ± epsilon 及 0/360 正確；磁北／真北換算符號正確；多人物分別使用各自吉凶。
- 立春前後、跨世紀、男女及五黃寄宮全覆蓋，實際交節時刻有可追溯測試依據。
- 資料升級／照片 ID 關聯、JSON 匯出格式正確；不能匯入。

### B. iOS 實機（阻斷性驗收）
- Safari、Chrome、加入主畫面的 PWA 皆測試：相機授權、方向感測權限、拒絕、重新啟動、切換 app、直橫旋轉、離線啟動。
- 用物理已知方位，測北／東／南／西與斜方向；直立、水平、不同 roll/pitch 比較「相機水平朝向」是否一致。記錄原始 API 欄位與精度，不用模擬器結果代替實機。
- 要求產品在可用感測器上不顯示錯誤方位；若無可靠絕對朝向，必須明確降級至手動模式，不可假裝通過。
- 不指定未經驗證的度數精度 SLA。實測後再訂測量誤差範圍，未達標時不能宣稱「精準方位」。
- 邊界抖動無快速紅綠閃爍，交界警告正確；手機朝天／地的退化狀態有警告。
- 主畫面 PWA 離線經重啟仍可查人、看紀錄、使用可用相機及感測器；低儲存空間時不損壞既有資料。

### C. UI 與 RWD
- 一般直式、橫式、小螢幕／大螢幕及摺疊近似 viewport 全部有功能、可用、無遮擋；真機折疊適配在硬體可取得時補測。
- 專業分析頁在一般 iPhone 可用，展開後右側面板可收合；點選方向高亮正確扇區。
- 拍照輸出和螢幕所見匹配，照片與 JSON photoId 關聯完全一致。

## 12. Coding Agent 施工順序

1. 建立專案、設計 token、RWD 靜態 UI、假相機背景原型；先確認是否忠於母版。
2. 實作八宅命卦 domain 與單元測試，連同立春年界及完整資料表。
3. 實作感測器診斷頁，於 iOS Safari／Chrome 實機取樣測權限、真／磁北語義和鏡頭姿態換算。此步是重大品質關卡。
4. 串接相機、羅盤 SVG、方位映射、平滑、交界提示及手動備援。
5. 人物與本機記錄、拍照合成、IndexedDB 儲存。
6. 八方解析、多人物比較、紀錄管理、一般手機抽屜及寬螢幕面板。
7. JSON＋JPEG＋ZIP 匯出與 iOS Share 降級。
8. Service Worker 離線、安裝引導、版本更新及 Cloudflare 正式部署。
9. 全面自動化＋iOS 實機驗收與修正；交付原始碼、README、測試紀錄、部署指引、已知限制清單。

## 13. 不納入第一版

- ZIP／JSON 匯入、資料還原或衝突合併。
- 帳號、雲端同步、D1/R2、遠端照片託管與付費功能。
- 對物件真實朝向的電腦視覺辨識、SLAM 錨定、專業風水儀器精度保證。
- 未經驗證的裝置專屬硬體 API 或強制要求特定摺疊手機型號。

## 14. 重要 API 參考

- MDN DeviceOrientation permission: https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static
- MDN DeviceOrientationEvent: https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent
- MDN getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN 由相機擷取靜態影格: https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Taking_still_photos
- web.dev PWA offline data: https://web.dev/learn/pwa/offline-data
- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/

**施工底線**：真正的 iOS 指南針準確性必須由實機驗證；網頁可實作的 UI 效果與能取得可信絕對方位，是兩個不同的驗收項目。
