# figure-and-table-tomo

把表格及圖表各自畫成單純之圖片（PNG 及 SVG），再插入 Word 等文件。文件之排版只剩文字及圖片兩種元素，表格及圖表不會因開啟之軟體或字型不同而跑版。

一張圖一個原始檔；原始檔是純文字，日後要改內容時改原始檔、重新輸出即可。

## 1 原始檔

依副檔名判斷類型：

| 副檔名 | 內容 | 適用 |
|---|---|---|
| `.md` | Markdown 表格（GFM） | 單純之表格 |
| `.html` | HTML 表格 | 合併儲存格（`colspan`、`rowspan`）、多層表頭、個別儲存格之底色或對齊 |
| `.mmd` | Mermaid 圖 | 流程圖、甘特圖、圓餅圖、象限圖等 |
| `.vl.json` | Vega-Lite 圖表 | 長條圖、折線圖等數據圖；資料須以 `values` 寫在檔內 |

範例見 [`examples/`](examples/)。

### 1.1 Markdown 表格

一個檔案只放一張表格。儲存格內可用 `**粗體**` 及 `<br>`（換行）。對齊列之 `:---:` 置中、`---:` 靠右。

### 1.2 HTML 表格

只取檔案中第一個 `<table>…</table>`；腳本、圖片、連結及外部資源一律移除。表頭用 `<th>`（淺灰底、粗體、置中），欄寬可用 `<colgroup><col style="width:20%">…</colgroup>`。

### 1.3 表格之前置資料

`.md`、`.html` 之開頭可加前置資料，只作用於該張表格：

```yaml
---
widths: 15%, 35%, 25%, 25%   # 欄寬，數量須等於欄數，總和 100%
font: noto-serif             # 字型，見第 3 節
font-size: 9                 # 字級（pt）
width-cm: 16                 # 表格寬度
width: auto                  # 依內容寬度，不撐滿版心
---
```

## 2 使用方式

需要 Node.js 22 以上、Git 及 Google Chrome。

```sh
npm install
./bin/figure-and-table-tomo.mjs 表1.html 圖2.mmd 圖3.vl.json --out-dir 輸出
```

| 選項 | 預設 | 說明 |
|---|---|---|
| `--out-dir` | 與原始檔相同 | 輸出位置；檔名同原始檔（例：`表1.png`、`表1.svg`） |
| `--width-cm` | 16 | 版心寬度。表格撐滿此寬度；圖超過此寬度時等比例縮小 |
| `--dpi` | 300 | PNG 解析度 |
| `--font` | `noto` | 字型，見第 3 節 |
| `--font-size` | 10 | 字級（pt） |
| `--format` | `png,svg` | 只要其中一種時指定 |

終端機以 `[OK]`、`[WARN]`、`[ERROR]` 標示結果。圖寬超過版心而縮小、字型未安裝等情形以 `[WARN]` 提醒。

找不到 Chrome 時，以環境變數 `FIGURE_AND_TABLE_TOMO_CHROME` 指定執行檔；也會使用 jibun-markdown-pdf-tomo（Vivliostyle）已下載之 Chrome。

## 3 字型

字型不讀電腦上安裝的字型，一律取自字型庫 [minna-fonts-tomo](https://github.com/billy4601/minna-fonts-tomo)，所以雲端與任何電腦輸出之圖相同。字型庫之網址及**提交編號**寫在 [`fonts.json`](fonts.json)；同一編號永遠取得相同的字型，舊圖可重新產生。

| `--font` | 字型 | 字型庫 id | 授權 |
|---|---|---|---|
| `noto`（預設） | Noto Sans TC（黑體） | `noto-sans-tc-ttf` | SIL OFL 1.1 |
| `noto-serif` | Noto Serif TC（明體） | `noto-serif-tc-ttf` | SIL OFL 1.1 |
| `kai` | 全字庫正楷體（代替標楷體） | `tw-kai-ttf` | 政府資料開放授權條款第 1 版 |
| `sung` | 全字庫正宋體（代替新細明體） | `tw-sung-ttf` | 政府資料開放授權條款第 1 版 |

各預設集另加 Noto Sans Symbols 2（`noto-sans-symbols2-ttf`），補 ✓ ✗ ■ □ 等符號。

### 3.1 取得方式

第一次使用某個字型時，以 Git 的部分 clone 及 sparse checkout，只取該字型之資料夾到快取（macOS：`~/Library/Caches/figure-and-table-tomo/fonts/<提交編號>`；Linux：`~/.cache/…`），不下載整個字型庫。之後直接使用快取。

| 環境變數 | 用途 |
|---|---|
| `FIGURE_AND_TABLE_TOMO_FONTS_DIR` | 改用本機已有之字型庫副本（例：離線、GitHub 無法連線時）；不檢查提交編號 |
| `FIGURE_AND_TABLE_TOMO_FONTS_REPOSITORY` | 改由其他網址取得同一提交編號（例：自己的字型庫分支） |

字型庫無法取得時，改用電腦上安裝之同名字型並以 `[WARN]` 提醒；此時輸出可能與其他電腦不同。

### 3.2 更換字型庫版本

字型庫新增或更換字型後，把 `fonts.json` 之 `commit` 改為新的提交編號（`version` 寫 `vYYMMDD` 供辨識），重新輸出並檢視。

## 4 輸出

- **PNG**：寫入解析度（pHYs），Word 插入時即為實際尺寸（例：寬 16 cm）。字型已畫進圖裡，在任何電腦上看起來都一樣，建議插入 Word 時使用。
- **SVG**：寬高以 mm 標示，可無限放大。文字仍是文字，以字型之正式名稱（例：`Noto Sans TC`、`TW-Kai`）標示，顯示時用該電腦上的字型；未安裝相同字型之電腦會以其他字型顯示（表格之文字以 `textLength` 固定寬度，不會超出儲存格）。標籤一律為 SVG 文字，不使用 `foreignObject`。
- 圖號及圖名（例：「表 1　需求對應表」）不畫進圖裡，留在文件內文，以便文件編目錄。

## 5 注意事項

- 圖片內之文字無法在 Word 中修改、選取或搜尋；要改內容時改原始檔重新輸出。
- 未設定寬度之 Mermaid、Vega-Lite 圖以原尺寸輸出，字級與表格一致；圖太寬時會縮小，字也會變小，此時宜改為直向排列或拆成數張圖。
- 配色為灰階（與 jibun-markdown-pdf-tomo 之 base 範本相同），黑白列印亦可分辨；Vega-Lite 規格內之 `config` 可覆寫。
- 繪圖時離線：Mermaid 隨套件安裝，頁面之網路請求一律攔截（字型由程式直接提供）；Vega-Lite 不讀取外部資料。只有第一次取得字型時會連線到字型庫。
- 全字庫正楷體沒有粗體，表頭等粗體字由瀏覽器加粗模擬。

## 6 授權及相依套件

本工具以 MIT 授權釋出，見 [`LICENSE`](LICENSE)。相依套件：

| 套件 | 版本 | 授權 | 用途 |
|---|---|---|---|
| mermaid | 12.1.0 | MIT | Mermaid 圖 |
| vega、vega-lite | 6.4.0、6.5.0 | BSD-3-Clause | Vega-Lite 圖表 |
| puppeteer-core | 25.1.0 | Apache-2.0 | 控制 Chrome 排版表格及點陣化 |
| js-yaml | 5.5.0 | MIT | 讀取字型庫之 fonts.yaml |
