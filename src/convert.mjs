// 一圖一檔之轉換：依原始檔類型繪製，輸出 PNG（含 dpi）及 SVG（含實體尺寸）。

import fs from "node:fs";
import path from "node:path";
import { resolveFont } from "./fonts.mjs";
import { cmToCssPx, setPngDpi, setSvgPhysicalSize } from "./image-size.mjs";
import { detectKind, markdownTableToHtml, outputStem, parseFrontMatter, sanitizeHtmlTable } from "./table-source.mjs";
import { renderVegaLite } from "./vega.mjs";

export const DEFAULTS = Object.freeze({
  widthCm: 16,
  dpi: 300,
  font: "noto",
  fontSizePt: 10,
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
export function mermaidConfig({ fontCss, fontSizePx, palette = DEFAULT_PALETTE }) {
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
    },
  };
}

// 圖寬超過版心時等比例縮小；未超過時維持原尺寸，使各圖之字級一致。
export function fitSize(viewBox, maxWidthPx) {
  const scale = viewBox.width > maxWidthPx ? maxWidthPx / viewBox.width : 1;
  return { widthPx: viewBox.width * scale, heightPx: viewBox.height * scale, scale };
}

export async function convertFile(renderer, inputPath, options = {}) {
  const settings = { ...DEFAULTS, ...Object.fromEntries(Object.entries(options).filter(([, value]) => value != null)) };
  const kind = detectKind(inputPath);
  if (!kind) throw new Error("無法判斷檔案類型；支援 .md、.html、.mmd、.vl.json。");
  const raw = fs.readFileSync(inputPath, "utf8");
  const { meta, body } = kind.startsWith("table") ? parseFrontMatter(raw) : { meta: {}, body: raw };

  const font = resolveFont(meta.font ?? settings.font);
  const fontSizePt = Number(meta["font-size"] ?? settings.fontSizePt);
  if (!(fontSizePt >= 6 && fontSizePt <= 24)) throw new Error("字級須介於 6 至 24 pt。");
  const maxWidthPx = cmToCssPx(Number(meta["width-cm"] ?? settings.widthCm));
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
    svg = setSvgPhysicalSize(result.svg, { widthPx, heightPx });
  } else {
    const style = { fontCss: font.css, fontSizePx: ptToPx(fontSizePt), palette: DEFAULT_PALETTE };
    let rendered;
    if (kind === "mermaid") {
      rendered = await renderer.renderMermaid(body, mermaidConfig(style), font);
    } else {
      let spec;
      try {
        spec = JSON.parse(body);
      } catch (error) {
        throw new Error(`Vega-Lite 規格不是有效之 JSON：${error.message}`);
      }
      rendered = await renderVegaLite(spec, style);
    }
    const size = fitSize(rendered.viewBox, maxWidthPx);
    if (size.scale < 1) warnings.push(`圖寬超過版心，已縮小為 ${Math.round(size.scale * 100)}%（字也會跟著變小）。`);
    ({ widthPx, heightPx } = size);
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
  return { kind, outputs, warnings, widthCm: widthPx / cmToCssPx(1), heightCm: heightPx / cmToCssPx(1) };
}
