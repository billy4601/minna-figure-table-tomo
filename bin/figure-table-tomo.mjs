#!/usr/bin/env node
// 命令列：figure-table-tomo <檔案…> [選項]
// 表格（.md、.html）、Mermaid（.mmd）、Vega-Lite（.vl.json）一圖一檔，各輸出 PNG 及 SVG。

import path from "node:path";
import { Renderer } from "../src/browser.mjs";
import { convertFile, DEFAULTS } from "../src/convert.mjs";
import { fontPresetNames } from "../src/fonts.mjs";

const HELP = `用法：figure-table-tomo <檔案…> [選項]

原始檔（一圖一檔，依副檔名判斷）：
  .md         Markdown 表格（GFM；單純表格）
  .html       HTML 表格（合併儲存格 colspan／rowspan、多層表頭）
  .mmd        Mermaid 圖（流程圖、甘特圖、圓餅圖等）
  .vl.json    Vega-Lite 圖表（資料須內嵌）

選項：
  --out-dir <目錄>     輸出位置（預設：與原始檔相同）
  --width-cm <數字>    版心寬度，表格之寬度及圖之寬度上限（預設 ${DEFAULTS.widthCm}）
  --dpi <數字>         PNG 解析度（預設 ${DEFAULTS.dpi}）
  --font <名稱>        ${fontPresetNames().join("｜")}（預設 ${DEFAULTS.font}）
  --font-size <pt>     字級（預設 ${DEFAULTS.fontSizePt}）
  --format <格式>      png,svg（預設兩者）
  -h, --help           顯示本說明

表格原始檔可於開頭以前置資料覆寫：font、font-size、width-cm、widths（欄寬百分比）、width: auto（依內容寬度）。`;

function parseArgs(argv) {
  const files = [];
  const options = {};
  const take = (index, name) => {
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) throw new Error(`${name} 需要一個值。`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--out-dir") options.outDir = take(index++, arg);
    else if (arg === "--width-cm") options.widthCm = Number(take(index++, arg));
    else if (arg === "--dpi") options.dpi = Number(take(index++, arg));
    else if (arg === "--font") options.font = take(index++, arg);
    else if (arg === "--font-size") options.fontSizePt = Number(take(index++, arg));
    else if (arg === "--format") options.formats = take(index++, arg).split(",").map((item) => item.trim().toLowerCase());
    else if (arg.startsWith("--")) throw new Error(`不認得之選項：${arg}`);
    else files.push(arg);
  }
  if (options.widthCm != null && !(options.widthCm > 0 && options.widthCm <= 100)) throw new Error("--width-cm 須介於 0 至 100。");
  if (options.dpi != null && !(options.dpi >= 72 && options.dpi <= 1200)) throw new Error("--dpi 須介於 72 至 1200。");
  if (options.formats && !options.formats.every((item) => item === "png" || item === "svg")) throw new Error("--format 只接受 png、svg。");
  return { files, options };
}

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exit(2);
}
if (parsed.help || !parsed.files.length) {
  console.log(HELP);
  process.exit(parsed.help ? 0 : 2);
}

let failed = 0;
const renderer = await Renderer.launch().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
});
try {
  for (const file of parsed.files) {
    try {
      const result = await convertFile(renderer, path.resolve(file), parsed.options);
      for (const warning of result.warnings) console.log(`[WARN] ${file}：${warning}`);
      const size = `${result.widthCm.toFixed(2)} × ${result.heightCm.toFixed(2)} cm`;
      const shown = result.outputs.map((item) => {
        const relative = path.relative(process.cwd(), item);
        return relative && !relative.startsWith("..") ? relative : item;
      });
      console.log(`[OK] ${file} → ${shown.join("、")}（${size}）`);
    } catch (error) {
      failed += 1;
      console.error(`[ERROR] ${file}：${error.message}`);
    }
  }
} finally {
  await renderer.close();
}
process.exit(failed ? 1 : 0);
