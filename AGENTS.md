# figure-and-table-tomo 專案指引

本專案把表格及圖表各自畫成 PNG 及 SVG，供插入 Word 等文件。給使用者看的說明寫在 `README.md`；本檔只寫代理（coding agent）須遵守之規則，不另建特定代理工具專用之指引檔。

## 邊界

- 公開 repo：不得寫入絕對路徑、個人或機器特有之名稱、客戶資料或文件內容；範例一律使用虛構之內容。
- Git 只管理程式、範例、文件及測試，不提交輸出之圖檔或使用者之原始檔。
- 一圖一檔：每個原始檔只輸出一張圖；不加入「一個檔案多張圖」之功能，除非使用者明確要求。
- 圖號及圖名不畫進圖裡。

## 技術方向

- Node.js ESM（22 以上）；純轉換放在 `src/table-source.mjs`、`src/image-size.mjs`，可單獨測試；瀏覽器操作只放在 `src/browser.mjs`。
- 字型一律取自字型庫 minna-fonts-tomo，依 `fonts.json` 之提交編號固定版本；不讀電腦上安裝的字型（字型庫無法取得時之後備除外），不得改以專有字型（例：標楷體、微軟正黑體）為預設；字型不隨本 repo 散布。
- 更換字型庫之提交編號時，重新輸出 `examples/` 並檢視。
- 繪圖時離線：不從 CDN 載入，瀏覽器之網路請求一律攔截；字型以虛擬網址由程式回應檔案內容，不開放頁面讀取本機檔案。
- SVG 不得含 `foreignObject`（Word 等軟體畫不出來）。
- 繪圖方式及配色沿用 jibun-markdown-pdf-tomo；兩者有差異時以本 repo 之 README 為準，並在 README 說明。

## 修改後之驗證

- 執行 `npm test`（`test/render.test.mjs` 需要 Chrome，找不到時略過）。
- 修改排版或繪圖時，實際輸出 `examples/` 之四個範例，逐張檢視 PNG；SVG 另以非 Chrome 之程式（例：`rsvg-convert`）點陣化檢視，確認在其他軟體中亦正確。
- 終端機輸出以 `[OK]`、`[WARN]`、`[ERROR]` 等純文字標示，不使用表情符號。

## Commit

代理提交時，作者及提交者皆為代理本身（Claude 為 `Claude <noreply@anthropic.com>`），commit 訊息最後保留共同作者標示及 session 連結。
