# minna-figure-table-tomo

透過 HTML 建立結構複雜之表格，並以 Mermaid、Vega-Lite、MathJax 等開放原始碼專案繪製圖表及數學公式，輸出為 SVG 及 PNG，插入 Word 等文書排版軟體使用；可由 AI 代理操作。

把表格及圖表各自畫成單純之圖片（PNG 及 SVG），再插入 Word 等文件。文件之排版只剩文字及圖片兩種元素，表格及圖表不會因開啟之軟體或字型不同而跑版。

一張圖一個原始檔；原始檔是純文字，日後要改內容時改原始檔、重新輸出即可。

## 1 原始檔

依副檔名判斷類型：

| 副檔名 | 內容 | 適用 |
|---|---|---|
| `.md` | Markdown 表格（GFM） | 單純之表格 |
| `.html` | HTML 表格 | 合併儲存格（`colspan`、`rowspan`）、多層表頭、個別儲存格之底色或對齊 |
| `.mmd` | Mermaid 圖 | 流程圖、組織圖、甘特圖、圓餅圖、象限圖等；與 Vega-Lite 之分工見 1.5 |
| `.vl.json` | Vega-Lite 圖表 | 長條圖、折線圖等數據圖；資料須以 `values` 寫在檔內 |
| `.tex` | 數學公式（LaTeX） | 計算式；以 MathJax 繪製 |

範例見 [`examples/`](examples/)。

### 1.1 Markdown 表格

一個檔案只放一張表格。儲存格內可用 `**粗體**` 及 `<br>`（換行）。對齊列之 `:---:` 置中、`---:` 靠右。

### 1.2 HTML 表格

只取檔案中第一個 `<table>…</table>`；腳本、圖片、連結及外部資源一律移除。表頭用 `<th>`（淺灰底、粗體、置中），欄寬可用 `<colgroup><col style="width:20%">…</colgroup>`。

### 1.3 Mermaid 圖

流程圖、組織圖（`flowchart TD`，由上而下之樹狀）、架構圖（`flowchart` 加 `subgraph`）、甘特圖、圓餅圖、象限圖等，語法依 Mermaid 12.1.0。

### 1.4 數學公式

一個檔案寫一條公式（LaTeX），可只寫公式本身，或以 `$$…$$`、`\[…\]` 包住；含 AMS 擴充（例：`aligned` 多行對齊）。

```tex
\text{排放量} = \sum_{i=1}^{n} \left( \text{活動數據}_i \times \text{排放係數}_i \times GWP_i \right)
```

數學符號為向量外框，不依賴字型；公式內之文字（`\text{…}`，例：中文）套用所選字型，依實際字寬排版。

### 1.5 選用 Mermaid 或 Vega-Lite

兩者可畫之圖有部分重疊。「優先」為建議採用者，「可畫」為能畫但效果較差者，「—」為不支援。依 2026-11-19 之實測（Mermaid 12.1.0、Vega-Lite 6.5.0，版心 16 cm、字級 10 pt）：

| 圖之種類 | Mermaid | Vega-Lite | 說明 |
|---|---|---|---|
| 流程圖 | 優先 | — | 直向流程每一步約占 2.2 cm 高，A4 一頁約 10 步，步驟更多時宜拆圖 |
| 組織圖、樹狀圖 | 優先 | — | `flowchart TD`；同一層之節點越多，圖越寬、縮得越小（實測：3 個子節點縮為 81%，30 個縮為 11% 已無法閱讀），宜分層拆圖 |
| 架構圖 | 優先 | — | `flowchart` 加 `subgraph` |
| 循序圖 | 優先 | — | `sequenceDiagram` |
| 心智圖 | 優先 | — | `mindmap` |
| 時間軸（里程碑） | 優先 | 可畫 | `timeline` |
| 甘特圖 | 優先 | 可畫 | Mermaid 可寫相依關係（`after`）及里程碑；時間軸只標年月，不畫「今天」標線。Vega-Lite 之時間軸較整齊，但須自行算出起訖日 |
| 象限圖（風險矩陣） | 優先 | 可畫 | `quadrantChart`；Vega-Lite 須自行疊加分隔線及標籤 |
| 圓餅圖 | 優先 | 可畫 | Mermaid 自動標示百分比；色票為 8 種灰階，超過 8 類時顏色重複，兩者皆宜併為「其他」 |
| 長條圖、折線圖 | 可畫 | 優先 | Mermaid `xychart-beta` 只適合十餘個資料點；Vega-Lite 之座標軸及刻度較精確 |
| 大量資料（數百點） | — | 優先 | 實測 365 點：Mermaid 之 X 軸標籤全部重疊；Vega-Lite 自動調整刻度 |
| 堆疊、群組長條圖 | — | 優先 | |
| 散布圖 | — | 優先 | |
| 熱力圖 | — | 優先 | |
| 桑基圖 | — | — | Mermaid `sankey-beta` 無法解析中文標籤（實測） |
| 數學公式 | — | — | 用 `.tex`（MathJax），見 1.4 |
| 複雜表格 | — | — | 用 `.html`，見 1.2 |

### 1.6 表格之前置資料

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
./bin/figure-table-tomo.mjs 表1.html 圖2.mmd 圖3.vl.json --out-dir 輸出
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

找不到 Chrome 時，以環境變數 `FIGURE_TABLE_TOMO_CHROME` 指定執行檔；也會使用 jibun-markdown-pdf-tomo（Vivliostyle）已下載之 Chrome。

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

第一次使用某個字型時，以 Git 的部分 clone 及 sparse checkout，只取該字型之資料夾到快取（macOS：`~/Library/Caches/figure-table-tomo/fonts/<提交編號>`；Linux：`~/.cache/…`），不下載整個字型庫。之後直接使用快取。

| 環境變數 | 用途 |
|---|---|
| `FIGURE_TABLE_TOMO_FONTS_DIR` | 改用本機已有之字型庫副本（例：離線、GitHub 無法連線時）；不檢查提交編號 |
| `FIGURE_TABLE_TOMO_FONTS_REPOSITORY` | 改由其他網址取得同一提交編號（例：自己的字型庫分支） |

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
- 繪圖時離線：Mermaid、MathJax 隨套件安裝，頁面之網路請求一律攔截（字型由程式直接提供）；Vega-Lite 不讀取外部資料。只有第一次取得字型時會連線到字型庫。
- 全字庫正楷體沒有粗體，表頭等粗體字由瀏覽器加粗模擬。

## 6 授權及相依套件

本工具以 MIT 授權釋出，見 [`LICENSE`](LICENSE)。相依套件：

| 套件 | 版本 | 授權 | 用途 |
|---|---|---|---|
| mermaid | 12.1.0 | MIT | Mermaid 圖 |
| mathjax | 4.1.3 | Apache-2.0 | 數學公式（含 MathJax New Computer Modern 數學字型） |
| vega、vega-lite | 6.4.0、6.5.0 | BSD-3-Clause | Vega-Lite 圖表 |
| puppeteer-core | 25.1.0 | Apache-2.0 | 控制 Chrome 排版表格及點陣化 |
| js-yaml | 5.5.0 | MIT | 讀取字型庫之 fonts.yaml |
