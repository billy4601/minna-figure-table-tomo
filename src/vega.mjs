// Vega-Lite 圖表：於 Node 端編譯並輸出 SVG，不需瀏覽器（PNG 另由瀏覽器點陣化）。
// 只接受內嵌資料（data.values）；任何外部讀取一律拒絕。

import * as vega from "vega";
import * as vegaLite from "vega-lite";

const WIDE_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}⺀-⿿　-〿＀-｠￠-￦]/u;

// 無 canvas 時 Vega 以每字 0.8em 估算文字寬度，中文會估得太窄；改以字元類別估算（同 jibun-markdown-pdf-tomo）。
function estimateTextWidth(item, text) {
  const value = text ?? item.text;
  const content = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  const fontSize = Number(item.fontSize ?? 11);
  let em = 0;
  for (const character of content) {
    if (WIDE_CHARACTER.test(character)) em += 1;
    else if (/[A-Z0-9#%&@MW]/u.test(character)) em += 0.65;
    else if (/[\s.,:;'|!il]/u.test(character)) em += 0.3;
    else em += 0.55;
  }
  const bold = /^(?:bold|[6-9]00)$/u.test(String(item.fontWeight ?? ""));
  return em * fontSize * (bold ? 1.05 : 1);
}

vega.textMetrics.width = estimateTextWidth;
vega.textMetrics.estimateWidth = estimateTextWidth;

const blockedLoader = {
  load: async () => { throw new Error("圖表只接受內嵌資料（data.values），不讀取外部檔案或網址。"); },
  sanitize: async () => ({}),
  http: async () => { throw new Error("圖表不得讀取網址。"); },
  file: async () => { throw new Error("圖表不得讀取外部檔案。"); },
};

// 字型、字級及色票套入 Vega-Lite 之 config；規格自身之 config 優先。
export function vegaConfig({ fontCss, fontSizePx, palette }) {
  const small = Math.round(fontSizePx * 0.9 * 100) / 100;
  return {
    font: fontCss,
    background: "#ffffff",
    axis: { labelFont: fontCss, titleFont: fontCss, labelFontSize: small, titleFontSize: fontSizePx, labelColor: "#000000", titleColor: "#000000" },
    legend: { labelFont: fontCss, titleFont: fontCss, labelFontSize: small, titleFontSize: fontSizePx, labelColor: "#000000", titleColor: "#000000" },
    header: { labelFont: fontCss, titleFont: fontCss, labelFontSize: fontSizePx, titleFontSize: fontSizePx },
    title: { font: fontCss, fontSize: fontSizePx * 1.1, color: "#000000" },
    text: { font: fontCss, fontSize: small },
    // 單一顏色之圖形（未以 color 編碼者）用色票第一色。
    mark: { font: fontCss, ...(palette?.length ? { color: palette[0] } : {}) },
    range: palette?.length ? { category: palette } : undefined,
  };
}

function mergeConfig(base, own = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(own ?? {})) {
    result[key] = value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object"
      ? { ...base[key], ...value }
      : value;
  }
  return result;
}

export async function renderVegaLite(spec, options) {
  if (!spec || typeof spec !== "object") throw new Error("Vega-Lite 規格須為 JSON 物件。");
  const withConfig = { ...spec, config: mergeConfig(vegaConfig(options), spec.config) };
  const { spec: vegaSpec } = vegaLite.compile(withConfig);
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none", loader: blockedLoader });
  try {
    await view.runAsync();
    const svg = await view.toSVG();
    const width = Number(/\swidth="([\d.]+)"/u.exec(svg)?.[1]);
    const height = Number(/\sheight="([\d.]+)"/u.exec(svg)?.[1]);
    return { svg, viewBox: { x: 0, y: 0, width, height } };
  } finally {
    view.finalize();
  }
}
