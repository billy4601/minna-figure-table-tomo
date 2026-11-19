// 一圖一檔之轉換：依原始檔類型繪製，輸出 PNG（含 dpi）及 SVG（含實體尺寸）。

import fs from "node:fs";
import path from "node:path";
import { resolveFont } from "./fonts.mjs";
import { cmToCssPx, setPngDpi, setSvgPhysicalSize } from "./image-size.mjs";
import { detectKind, markdownTableToHtml, outputStem, parseFrontMatter, sanitizeHtmlTable } from "./table-source.mjs";
import { stripMathDelimiters } from "./math.mjs";
import { renderVegaLite } from "./vega.mjs";

// 版面預設集：寬度及高度上限（cm）、字級及最小可讀字級（pt）。
// a4：A4 直式版心（寬 16 cm；高度留圖名及上下段落之空間）。a4-half：A4 半欄，兩張圖並排（中間留 0.4 cm）。
// slide：16:9 簡報（PowerPoint 預設 33.87 × 19.05 cm）扣除左右邊界及標題列後之內容區。
export const LAYOUTS = Object.freeze({
  a4: { label: "A4 整欄", widthCm: 16, heightCm: 22, fontSizePt: 10, minFontPt: 8 },
  "a4-half": { label: "A4 半欄", widthCm: 7.8, heightCm: 11, fontSizePt: 10, minFontPt: 8 },
  slide: { label: "16:9 簡報", widthCm: 29, heightCm: 13.5, fontSizePt: 18, minFontPt: 14 },
});

export const DEFAULTS = Object.freeze({
  layout: "a4",
  dpi: 300,
  font: "noto",
  formats: ["png", "svg"],
});

// 灰階色票：與 jibun-markdown-pdf-tomo 之 base 範本相同；黑白列印亦可分辨。
export const DEFAULT_PALETTE = ["#333333", "#808080", "#b3b3b3", "#555555", "#999999", "#1a1a1a", "#cccccc", "#666666"];

const ptToPx = (pt) => (pt * 96) / 72;

function mixHex(color, other, ratio) {
  const parse = (hex) => {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? [...value].map((digit) => digit + digit).join("") : value;
    return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
  };
  const [from, to] = [parse(color), parse(other)];
  return `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio).toString(16).padStart(2, "0")).join("")}`;
}

// Mermaid 設定：標籤為 SVG 文字（不用 foreignObject，Word 等軟體才畫得出來）；配色同 jibun-markdown-pdf-tomo。
export function mermaidConfig({ fontCss, fontSizePx, palette = DEFAULT_PALETTE, widthPx = 604, heightPx = 831 }) {
  const [primary] = palette;
  return {
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    fontFamily: fontCss,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
    state: { htmlLabels: false },
    er: { htmlLabels: false },
    // 甘特圖及 xychart 預設以固定之寬畫布繪製再整張縮小，字會變得很小；改為直接以版面寬度排版。
    // 甘特圖之時間軸只標年月，避免日期標籤重疊；原始碼內之 axisFormat 優先。
    gantt: { axisFormat: "%Y/%m", useWidth: Math.floor(widthPx), fontSize: fontSizePx, sectionFontSize: fontSizePx, barHeight: Math.round(fontSizePx * 1.6), barGap: Math.round(fontSizePx * 0.4), leftPadding: Math.round(fontSizePx * 6), rightPadding: Math.round(fontSizePx * 2) },
    xyChart: { width: Math.floor(widthPx), height: Math.floor(Math.min(widthPx * 0.6, heightPx)) },
    theme: "base",
    themeVariables: {
      fontFamily: fontCss,
      fontSize: `${fontSizePx}px`,
      primaryColor: mixHex(primary, "#ffffff", 0.88),
      primaryBorderColor: primary,
      primaryTextColor: "#000000",
      textColor: "#000000",
      lineColor: primary,
      secondaryColor: mixHex(palette[1] ?? primary, "#ffffff", 0.75),
      tertiaryColor: "#ffffff",
      background: "#ffffff",
      pieStrokeColor: "#ffffff",
      pieOuterStrokeColor: primary,
      ...Object.fromEntries(palette.slice(0, 12).map((color, index) => [`pie${index + 1}`, color])),
      xyChart: { plotColorPalette: palette.join(", "), titleColor: "#000000", xAxisLabelColor: "#000000", yAxisLabelColor: "#000000", xAxisTitleColor: "#000000", yAxisTitleColor: "#000000", xAxisLineColor: "#000000", yAxisLineColor: "#000000", xAxisTickColor: "#000000", yAxisTickColor: "#000000" },
    },
  };
}

// 圖寬超過版心時等比例縮小；未超過時維持原尺寸，使各圖之字級一致。
// 甘特圖預設會畫出「今天」之標線，同一原始檔在不同日期輸出之圖會不同；未指定時一律關閉。
export function prepareMermaidSource(source) {
  const text = String(source);
  const lines = text.split(/\r?\n/u);
  const head = lines.findIndex((line) => line.trim() && !line.trim().startsWith("%%"));
  if (head < 0 || !/^gantt\b/u.test(lines[head].trim()) || /^\s*todayMarker\b/mu.test(text)) return text;
  lines.splice(head + 1, 0, "  todayMarker off");
  return lines.join("\n");
}

// 圖超過版面之寬或高時等比例縮小；未超過時維持原尺寸，使各圖之字級一致。
export function fitSize(viewBox, maxWidthPx, maxHeightPx = Infinity) {
  const scale = Math.min(1, maxWidthPx / viewBox.width, maxHeightPx / viewBox.height);
  return { widthPx: viewBox.width * scale, heightPx: viewBox.height * scale, scale };
}

// 版面設定：前置資料 > 命令列選項 > 版面預設集。
export function resolveLayout(settings, meta = {}) {
  const name = meta.layout ?? settings.layout ?? "a4";
  const layout = LAYOUTS[name];
  if (!layout) throw new Error(`不支援之版面「${name}」；可用：${Object.keys(LAYOUTS).join("、")}。`);
  const pick = (metaKey, optionKey) => Number(meta[metaKey] ?? settings[optionKey] ?? layout[optionKey]);
  return {
    name,
    label: layout.label,
    widthCm: pick("width-cm", "widthCm"),
    heightCm: pick("height-cm", "heightCm"),
    fontSizePt: pick("font-size", "fontSizePt"),
    minFontPt: layout.minFontPt,
  };
}

export async function convertFile(renderer, inputPath, options = {}) {
  const settings = { ...DEFAULTS, ...Object.fromEntries(Object.entries(options).filter(([, value]) => value != null)) };
  const kind = detectKind(inputPath);
  if (!kind) throw new Error("無法判斷檔案類型；支援 .md、.html、.mmd、.vl.json、.tex。");
  const raw = fs.readFileSync(inputPath, "utf8");
  const { meta, body } = kind.startsWith("table") ? parseFrontMatter(raw) : { meta: {}, body: raw };

  const font = resolveFont(meta.font ?? settings.font);
  const layout = resolveLayout(settings, meta);
  const { fontSizePt } = layout;
  if (!(fontSizePt >= 6 && fontSizePt <= 36)) throw new Error("字級須介於 6 至 36 pt。");
  const maxWidthPx = cmToCssPx(layout.widthCm);
  const maxHeightPx = cmToCssPx(layout.heightCm);
  let scale = 1;
  const deviceScaleFactor = settings.dpi / 96;
  const warnings = [];

  if (font.warning) warnings.push(font.warning);
  if (font.source === "system" && !(await renderer.isFontAvailable(font.families[0])) && !(font.families[1] && (await renderer.isFontAvailable(font.families[1])))) {
    warnings.push(`電腦上也沒有安裝「${font.label}」，已改用系統後備字型。`);
  }

  let png;
  let svg;
  let widthPx;
  let heightPx;
  if (kind === "table-markdown" || kind === "table-html") {
    const tableHtml = kind === "table-markdown"
      ? markdownTableToHtml(body, { widths: meta.widths })
      : sanitizeHtmlTable(body, { widths: meta.widths });
    const result = await renderer.renderTable(tableHtml, {
      widthPx: maxWidthPx,
      auto: meta.width === "auto",
      font,
      fontSizePt,
      deviceScaleFactor,
    });
    if (result.overflow) warnings.push("表格內容超出版心寬度，右側可能被截斷；請縮小字級或調整欄寬。");
    ({ png, widthPx, heightPx } = result);
    if (heightPx > maxHeightPx + 0.5) {
      warnings.push(`表格高 ${(heightPx / cmToCssPx(1)).toFixed(1)} cm，超過${layout.label}之高度上限 ${layout.heightCm} cm；宜拆成數張表。`);
    }
    svg = setSvgPhysicalSize(result.svg, { widthPx, heightPx });
  } else {
    const style = { fontCss: font.css, fontSizePx: ptToPx(fontSizePt), palette: DEFAULT_PALETTE };
    let rendered;
    if (kind === "mermaid") {
      rendered = await renderer.renderMermaid(prepareMermaidSource(body), mermaidConfig({ ...style, widthPx: maxWidthPx, heightPx: maxHeightPx }), font);
    } else if (kind === "math") {
      const tex = stripMathDelimiters(body);
      if (!tex) throw new Error("公式是空的。");
      rendered = await renderer.renderMath(tex, { font, fontSizePx: style.fontSizePx });
    } else {
      let spec;
      try {
        spec = JSON.parse(body);
      } catch (error) {
        throw new Error(`Vega-Lite 規格不是有效之 JSON：${error.message}`);
      }
      rendered = await renderVegaLite(spec, style);
    }
    const size = fitSize(rendered.viewBox, maxWidthPx, maxHeightPx);
    ({ widthPx, heightPx, scale } = size);
    const effective = fontSizePt * scale;
    if (effective < layout.minFontPt - 0.05) {
      warnings.push(scale < 1
        ? `圖超過${layout.label}之版面，縮小為 ${Math.round(scale * 100)}%，字級約 ${effective.toFixed(1)} pt，低於可讀下限 ${layout.minFontPt} pt；宜拆圖或改變方向。`
        : `字級 ${effective.toFixed(1)} pt 低於${layout.label}之可讀下限 ${layout.minFontPt} pt。`);
    }
    svg = setSvgPhysicalSize(rendered.svg, { widthPx, heightPx, viewBox: rendered.viewBox });
    png = await renderer.rasterizeSvg(svg, { widthPx, heightPx, deviceScaleFactor, font });
  }

  const outDir = settings.outDir ?? path.dirname(inputPath);
  fs.mkdirSync(outDir, { recursive: true });
  const stem = outputStem(path.basename(inputPath));
  const outputs = [];
  if (settings.formats.includes("png")) {
    const file = path.join(outDir, `${stem}.png`);
    fs.writeFileSync(file, setPngDpi(png, settings.dpi));
    outputs.push(file);
  }
  if (settings.formats.includes("svg")) {
    const file = path.join(outDir, `${stem}.svg`);
    fs.writeFileSync(file, svg.startsWith("<?xml") ? svg : `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, "utf8");
    outputs.push(file);
  }
  return {
    kind, outputs, warnings, layout: layout.name, scale,
    effectiveFontPt: kind.startsWith("table") ? fontSizePt : fontSizePt * scale,
    widthCm: widthPx / cmToCssPx(1), heightCm: heightPx / cmToCssPx(1),
  };
}
