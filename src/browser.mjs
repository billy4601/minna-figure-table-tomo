// 瀏覽器層：以 Chrome（puppeteer-core）排版表格、繪製 Mermaid，並將 SVG 轉為 PNG。
// 全程離線：所有網路請求一律攔截，只允許 data: 及 about:。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);

const LAUNCH_TIMEOUT_MS = 60000;
// 字型檔以此虛擬網址提供給頁面（由請求攔截回應檔案內容），不開放頁面讀取本機檔案。
const FONT_ORIGIN = "https://fonts.figure-table-tomo.invalid/";
// MathJax 及其數學字型由 node_modules 以此虛擬網址提供（動態載入之字型擴充亦同），不連網。
const MATHJAX_ORIGIN = "https://mathjax.figure-table-tomo.invalid/";
const RENDER_TIMEOUT_MS = 30000;

// 尋找 Chrome：環境變數 → 系統安裝之 Chrome／Chromium → Vivliostyle 下載之 Chrome（與 jibun-markdown-pdf-tomo 共用）。
export function findChromeExecutable({ env = process.env, platform = process.platform, homeDir = os.homedir() } = {}) {
  for (const key of ["FIGURE_TABLE_TOMO_CHROME", "MARKDOWN_PDF_TOMO_CHROME", "PUPPETEER_EXECUTABLE_PATH"]) {
    const value = env[key]?.trim();
    if (value) return fs.existsSync(value) ? value : null;
  }
  const candidates = platform === "darwin"
    ? [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(homeDir, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    ]
    : platform === "win32"
      ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;

  const cacheRoot = platform === "darwin"
    ? path.join(homeDir, "Library/Caches/vivliostyle/browsers/chrome")
    : path.join(env.XDG_CACHE_HOME || path.join(homeDir, ".cache"), "vivliostyle/browsers/chrome");
  if (fs.existsSync(cacheRoot)) {
    const relative = platform === "darwin"
      ? [`chrome-mac-${process.arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`]
      : ["chrome-linux64/chrome"];
    const versions = fs.readdirSync(cacheRoot).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      for (const item of relative) {
        const candidate = path.join(cacheRoot, version, item);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} 逾時（${ms / 1000} 秒）`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function mathPageHtml() {
  const config = {
    // 只載入 TeX 輸入及 SVG 輸出；不載入選單、語音朗讀等無障礙元件（會在背景載入資料並與繪製競爭）。
    loader: { load: ["input/tex", "output/svg"], paths: { mathjax: `${MATHJAX_ORIGIN}mathjax`, "mathjax-newcm": `${MATHJAX_ORIGIN}mathjax-newcm-font` } },
    tex: { packages: { "[+]": ["ams"] } },
    svg: { fontCache: "none", mtextInheritFont: true },
    options: { enableMenu: false, enableEnrichment: false, enableSpeech: false, enableBraille: false, enableExplorer: false, enableComplexity: false },
    startup: { typeset: false },
  };
  return `<!doctype html><html><head><meta charset="utf-8"><script>window.MathJax = ${JSON.stringify(config)};</script><script src="${MATHJAX_ORIGIN}mathjax/startup.js"></script></head><body><div id="host"></div></body></html>`;
}

function mathjaxDirs() {
  return {
    mathjax: path.dirname(require.resolve("mathjax/package.json")),
    "mathjax-newcm-font": path.dirname(require.resolve("@mathjax/mathjax-newcm-font/package.json")),
  };
}

export function mermaidBundlePath() {
  return path.join(path.dirname(require.resolve("mermaid/package.json")), "dist", "mermaid.min.js");
}

export class Renderer {
  static async launch({ chromePath = findChromeExecutable() } = {}) {
    if (!chromePath) {
      throw new Error("找不到 Chrome。請安裝 Google Chrome，或以環境變數 FIGURE_TABLE_TOMO_CHROME 指定執行檔。");
    }
    const browser = await withTimeout(
      puppeteer.launch({ executablePath: chromePath, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] }),
      LAUNCH_TIMEOUT_MS,
      "Chrome 啟動",
    );
    return new Renderer(browser);
  }

  constructor(browser) {
    this.browser = browser;
    this.mermaidPage = null;
    this.mermaidFonts = null;
    this.fontFiles = new Map();
    this.fontBytes = new Map();
  }

  // 登錄字型之 @font-face，回傳供 installFonts 使用之清單（url 為虛擬網址）。
  registerFonts(font) {
    return font.faces.map((face) => {
      const key = `${this.fontFiles.size}`;
      const existing = [...this.fontFiles.entries()].find(([, file]) => file === face.file);
      const id = existing ? existing[0] : key;
      if (!existing) this.fontFiles.set(id, face.file);
      return { family: face.family, weight: face.weight, style: face.style, url: `${FONT_ORIGIN}${id}` };
    });
  }

  // 在頁面中載入字型（FontFace API）並等待完成，之後排版或量測文字才會使用正確之字型。
  async installFonts(page, font) {
    const faces = this.registerFonts(font);
    if (!faces.length) return;
    await withTimeout(page.evaluate(async (list) => {
      await Promise.all(list.map(async (item) => {
        const face = new FontFace(item.family, `url("${item.url}")`, { weight: item.weight, style: item.style });
        await face.load();
        document.fonts.add(face);
      }));
    }, faces), LAUNCH_TIMEOUT_MS, "字型載入");
  }

  async close() {
    await this.browser.close().catch(() => {});
  }

  async newPage() {
    const page = await this.browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith(FONT_ORIGIN)) {
        const file = this.fontFiles.get(url.slice(FONT_ORIGIN.length));
        if (!file) return request.abort();
        if (!this.fontBytes.has(file)) this.fontBytes.set(file, fs.readFileSync(file));
        return request.respond({ status: 200, contentType: "font/ttf", headers: { "Access-Control-Allow-Origin": "*" }, body: this.fontBytes.get(file) });
      }
      if (url === `${MATHJAX_ORIGIN}page/index.html`) {
        return request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: mathPageHtml() });
      }
      if (url.startsWith(MATHJAX_ORIGIN)) {
        const [name, ...rest] = decodeURIComponent(new URL(url).pathname).slice(1).split("/");
        const root = mathjaxDirs()[name];
        const file = root && path.resolve(root, ...rest);
        if (!file || !file.startsWith(root + path.sep) || !fs.existsSync(file)) return request.abort();
        return request.respond({ status: 200, contentType: file.endsWith(".json") ? "application/json" : "application/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: fs.readFileSync(file) });
      }
      if (url.startsWith("data:") || url.startsWith("about:")) request.continue();
      else request.abort();
    });
    return page;
  }

  // 檢查字型是否已安裝：比較以該字型及後備字型排出之文字寬度，兩組後備字型皆相同即視為未安裝。
  async isFontAvailable(family) {
    const page = await this.newPage();
    try {
      await page.setContent("<!doctype html><meta charset='utf-8'><body></body>");
      return await page.evaluate((name) => {
        const sample = "國字表格圖 mmmmmwwwwwiiiii 0123";
        const measure = (font) => {
          const span = document.createElement("span");
          span.style.font = `40px ${font}`;
          span.textContent = sample;
          document.body.append(span);
          const width = span.getBoundingClientRect().width;
          span.remove();
          return width;
        };
        return ["monospace", "serif", "sans-serif"].some((base) => measure(`"${name}", ${base}`) !== measure(base));
      }, family);
    } finally {
      await page.close();
    }
  }

  // 表格：以 HTML 排版，回傳 PNG（截圖）及 SVG（依排版結果以向量重建：底色、框線、逐行文字）。
  async renderTable(tableHtml, { widthPx, auto = false, font, fontSizePt, deviceScaleFactor }) {
    const page = await this.newPage();
    try {
      await page.setViewport({ width: Math.ceil(widthPx) + 4, height: 800, deviceScaleFactor });
      await page.setContent(tableDocument(tableHtml, { widthPx, auto, font, fontSizePt }), { waitUntil: "load" });
      await this.installFonts(page, font);
      await page.evaluate(() => document.fonts.ready);
      const layout = await withTimeout(page.evaluate(extractTableLayout), RENDER_TIMEOUT_MS, "表格排版");
      const wrap = await page.$("#wrap");
      const png = await wrap.screenshot({ type: "png", omitBackground: false });
      return { png, svg: tableLayoutToSvg(layout), widthPx: layout.width, heightPx: layout.height, overflow: layout.overflow };
    } finally {
      await page.close();
    }
  }

  // Mermaid：回傳 SVG 字串及其 viewBox（CSS px）。
  async renderMermaid(source, config, font) {
    if (!this.mermaidPage) {
      this.mermaidPage = await this.newPage();
      await this.mermaidPage.setContent("<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>");
      await this.mermaidPage.addScriptTag({ path: mermaidBundlePath() });
      this.mermaidFonts = new Set();
    }
    const page = this.mermaidPage;
    // Mermaid 依實際字型量測文字寬度以決定框之大小，須先載入字型。
    if (!this.mermaidFonts.has(font.name)) {
      await this.installFonts(page, font);
      this.mermaidFonts.add(font.name);
    }
    await page.evaluate((options) => window.mermaid.initialize(options), config);
    const result = await withTimeout(page.evaluate(renderMermaidInPage, source, `figure-${Date.now()}`), RENDER_TIMEOUT_MS, "Mermaid 繪製");
    if (result.error) throw new Error(`Mermaid 語法錯誤：${result.error}`);
    return result;
  }

  // 數學公式：在瀏覽器中以 MathJax 繪製，公式內之文字（\text{…}）依實際字型量測寬度。
  // 回傳 { svg, viewBox }（CSS px；1 ex 取字級之一半）。
  async renderMath(tex, { font, fontSizePx }) {
    if (!this.mathPage) {
      this.mathPage = await this.newPage();
      this.mathFonts = new Set();
      // 頁面本身亦由虛擬網址提供（about:blank 不允許 localStorage，MathJax 會停在啟動階段）。
      await this.mathPage.goto(`${MATHJAX_ORIGIN}page/index.html`, { waitUntil: "load" });
      await withTimeout(this.mathPage.waitForFunction(() => Boolean(window.MathJax?.startup?.promise)), RENDER_TIMEOUT_MS, "MathJax 載入");
      await this.mathPage.evaluate(() => window.MathJax.startup.promise);
    }
    const page = this.mathPage;
    if (!this.mathFonts.has(font.name)) {
      await this.installFonts(page, font);
      this.mathFonts.add(font.name);
    }
    const result = await withTimeout(page.evaluate(async (source, css, px) => {
      const host = document.getElementById("host");
      host.style.fontFamily = css;
      host.style.fontSize = `${px}px`;
      try {
        const node = await window.MathJax.tex2svgPromise(source, { display: true, em: px, ex: px / 2, containerWidth: 100000 });
        host.replaceChildren(node);
        const svg = node.querySelector("svg");
        const error = node.querySelector("[data-mjx-error]");
        if (error) return { error: error.getAttribute("data-mjx-error") };
        for (const text of svg.querySelectorAll("text")) text.setAttribute("font-family", css);
        const ex = (name) => parseFloat(svg.getAttribute(name));
        return { svg: svg.outerHTML, width: ex("width") * px / 2, height: ex("height") * px / 2 };
      } catch (error) {
        return { error: String(error?.message ?? error) };
      }
    }, tex, font.css, fontSizePx), RENDER_TIMEOUT_MS, "公式繪製");
    if (result.error) throw new Error(`LaTeX 語法錯誤：${result.error}`);
    return { svg: result.svg, viewBox: { x: 0, y: 0, width: result.width, height: result.height } };
  }

  // 將 SVG 以指定之 CSS 尺寸點陣化為 PNG（白底）。
  async rasterizeSvg(svg, { widthPx, heightPx, deviceScaleFactor, font }) {
    const page = await this.newPage();
    try {
      const width = Math.ceil(widthPx);
      const height = Math.ceil(heightPx);
      await page.setViewport({ width, height, deviceScaleFactor });
      const sized = String(svg).replace(/<svg\b/u, `<svg data-raster="1"`);
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}#box{width:${width}px;height:${height}px;overflow:hidden}#box>svg{display:block;width:${widthPx}px;height:${heightPx}px;max-width:none}</style></head><body><div id="box">${sized}</div></body></html>`,
        { waitUntil: "load" },
      );
      if (font) await this.installFonts(page, font);
      await page.evaluate(() => document.fonts.ready);
      const box = await page.$("#box");
      return await box.screenshot({ type: "png", omitBackground: false });
    } finally {
      await page.close();
    }
  }
}

// 表格之排版頁面。框線 0.75 pt、表頭淺灰底粗體置中；儲存格可用 style、class 覆寫。
function tableDocument(tableHtml, { widthPx, auto, font, fontSizePt }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#fff}
#wrap{display:inline-block;padding:1px;background:#fff}
#wrap>table{border-collapse:collapse;${auto ? `width:auto;max-width:${widthPx - 2}px` : `width:${widthPx - 2}px`};table-layout:auto;font-family:${font.css};font-size:${fontSizePt}pt;line-height:1.35;color:#000;font-kerning:none}
th,td{border:0.75pt solid #000;padding:2pt 4pt;vertical-align:middle;text-align:left;overflow-wrap:anywhere}
th{background:#e6e6e6;font-weight:bold;text-align:center}
caption{display:none}
</style></head><body><div id="wrap">${tableHtml}</div></body></html>`;
}

// 在瀏覽器中執行：量測表格之底色、框線與每一行文字之位置（以 #wrap 左上角為原點）。
function extractTableLayout() {
  const wrap = document.getElementById("wrap");
  const table = wrap.querySelector("table");
  const origin = wrap.getBoundingClientRect();
  const ox = origin.left;
  const oy = origin.top;
  const round = (value) => Math.round(value * 100) / 100;
  const transparent = (color) => !color || color === "transparent" || /rgba\([^)]*,\s*0\)$/u.test(color);
  const layout = { width: round(origin.width), height: round(origin.height), rects: [], lines: [], texts: [], overflow: false };
  layout.overflow = table.scrollWidth > table.getBoundingClientRect().width + 1;

  const tableStyle = getComputedStyle(table);
  if (!transparent(tableStyle.backgroundColor)) {
    const box = table.getBoundingClientRect();
    layout.rects.push({ x: round(box.left - ox), y: round(box.top - oy), w: round(box.width), h: round(box.height), fill: tableStyle.backgroundColor });
  }

  // 底色以儲存格為單位：儲存格自身 → 所在列 → 所在列群組（thead、tbody）。
  // 不畫整列之矩形，以免蓋過由上方列合併下來之儲存格（rowspan）。
  for (const cell of table.querySelectorAll("th, td")) {
    const fill = [cell, cell.parentElement, cell.parentElement?.parentElement]
      .map((element) => element && getComputedStyle(element).backgroundColor)
      .find((color) => !transparent(color));
    if (!fill) continue;
    const box = cell.getBoundingClientRect();
    layout.rects.push({ x: round(box.left - ox), y: round(box.top - oy), w: round(box.width), h: round(box.height), fill });
  }

  // 框線：border-collapse 時儲存格之邊緣即框線中心；同一位置只畫一次。
  const seen = new Set();
  const pushLine = (x1, y1, x2, y2, width, color) => {
    const key = [x1, y1, x2, y2].map((value) => Math.round(value * 2)).join(",");
    if (seen.has(key)) return;
    seen.add(key);
    layout.lines.push({ x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), width: round(width), color });
  };
  for (const cell of table.querySelectorAll("th, td")) {
    const style = getComputedStyle(cell);
    const box = cell.getBoundingClientRect();
    const [l, t, r, b] = [box.left - ox, box.top - oy, box.right - ox, box.bottom - oy];
    const sides = [
      ["Top", l, t, r, t], ["Bottom", l, b, r, b], ["Left", l, t, l, b], ["Right", r, t, r, b],
    ];
    for (const [side, x1, y1, x2, y2] of sides) {
      const width = parseFloat(style[`border${side}Width`]);
      if (style[`border${side}Style`] === "none" || !(width > 0)) continue;
      pushLine(x1, y1, x2, y2, width, style[`border${side}Color`]);
    }
  }

  // 基線：以高度為 0 之 inline-block 量測該字型之基線位置（占文字框高之比例），依字型及字級快取。
  const baselineCache = new Map();
  const baselineRatio = (style) => {
    const key = `${style.fontFamily}|${style.fontSize}|${style.fontWeight}|${style.fontStyle}`;
    if (baselineCache.has(key)) return baselineCache.get(key);
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;font-family:${style.fontFamily};font-size:${style.fontSize};font-weight:${style.fontWeight};font-style:${style.fontStyle};line-height:normal`;
    const text = document.createElement("span");
    text.textContent = "國Ag";
    const marker = document.createElement("span");
    marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    probe.append(text, marker);
    document.body.append(probe);
    const textBox = text.getBoundingClientRect();
    const ratio = (marker.getBoundingClientRect().top - textBox.top) / textBox.height;
    probe.remove();
    baselineCache.set(key, ratio);
    return ratio;
  };

  // 文字：逐字量測位置，依行切成片段；每一片段在 SVG 中為一個 <text>。
  const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest("caption")) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const ratio = baselineRatio(style);
    const text = node.textContent;
    let segment = null;
    const flush = () => {
      if (segment && segment.text.trim()) {
        layout.texts.push({
          x: round(segment.left - ox),
          y: round(segment.top + segment.height * ratio - oy),
          width: round(segment.right - segment.left),
          text: segment.text.replace(/\s+$/u, ""),
          fontFamily: style.fontFamily,
          fontSize: parseFloat(style.fontSize),
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          color: style.color,
        });
      }
      segment = null;
    };
    for (let index = 0; index < text.length; index += 1) {
      const codePoint = text.codePointAt(index);
      const length = codePoint > 0xffff ? 2 : 1;
      range.setStart(node, index);
      range.setEnd(node, index + length);
      const rect = [...range.getClientRects()].find((item) => item.width > 0 || item.height > 0);
      const character = text.slice(index, index + length);
      index += length - 1;
      if (!rect) continue;
      const newLine = !segment || Math.abs(rect.top - segment.top) > 1 || rect.left < segment.right - 1;
      if (newLine) {
        flush();
        if (/\s/u.test(character)) continue;
        segment = { left: rect.left, right: rect.right, top: rect.top, height: rect.height, text: character };
      } else {
        segment.text += /\s/u.test(character) ? " " : character;
        segment.right = rect.right;
      }
    }
    flush();
  }
  return layout;
}

function escapeXml(text) {
  return String(text).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

export function tableLayoutToSvg(layout) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}">`,
    `<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="#ffffff"/>`,
  ];
  for (const rect of layout.rects) {
    parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${rect.fill}"/>`);
  }
  for (const line of layout.lines) {
    parts.push(`<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${line.color}" stroke-width="${line.width}" stroke-linecap="square"/>`);
  }
  for (const item of layout.texts) {
    const weight = item.fontWeight && item.fontWeight !== "400" && item.fontWeight !== "normal" ? ` font-weight="${item.fontWeight}"` : "";
    const italic = item.fontStyle === "italic" ? ` font-style="italic"` : "";
    const fill = item.color && item.color !== "rgb(0, 0, 0)" ? ` fill="${item.color}"` : "";
    parts.push(
      `<text x="${item.x}" y="${item.y}" font-family="${escapeXml(item.fontFamily)}" font-size="${item.fontSize}"${weight}${italic}${fill} textLength="${item.width}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${escapeXml(item.text)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

// 在瀏覽器中執行：繪製一張 Mermaid 圖，回傳 SVG 及 viewBox。
async function renderMermaidInPage(text, id) {
  try {
    let { svg } = await window.mermaid.render(id, text);
    const host = document.createElement("div");
    host.style.position = "absolute";
    host.innerHTML = svg;
    document.body.append(host);
    try {
      const root = host.querySelector("svg");
      if (!root.getAttribute("viewBox")) {
        const box = root.getBBox();
        root.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
        svg = svg.replace("<svg", `<svg viewBox="${box.x} ${box.y} ${box.width} ${box.height}"`);
      }
      const vb = root.viewBox.baseVal;
      return { svg, viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height } };
    } finally {
      host.remove();
    }
  } catch (error) {
    document.querySelectorAll(`[id^="d${id}"], #${id}`).forEach((element) => element.remove());
    return { error: String(error?.message ?? error).split("\n")[0] };
  }
}
