// 實際繪製範例（需要 Chrome）；找不到 Chrome 時略過。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findChromeExecutable, Renderer } from "../src/browser.mjs";
import { convertFile } from "../src/convert.mjs";
import { readPngInfo } from "../src/image-size.mjs";

const examples = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "examples");
const chrome = findChromeExecutable();

test("範例：各種原始檔皆輸出 PNG（300 dpi）及 SVG（mm）", { skip: chrome ? false : "找不到 Chrome" }, async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "figure-table-tomo-"));
  const renderer = await Renderer.launch({ chromePath: chrome });
  try {
    for (const name of ["simple-table.md", "complex-table.html", "flow.mmd", "orgchart.mmd", "bar.vl.json", "formula.tex"]) {
      const result = await convertFile(renderer, path.join(examples, name), { outDir });
      const [pngPath, svgPath] = result.outputs;
      const png = readPngInfo(fs.readFileSync(pngPath));
      assert.equal(png.dpi, 300, name);
      assert.ok(result.widthCm <= 16.01, `${name} 寬度不得超過版心`);
      // 像素寬度 ≈ 實體寬度 × 300 dpi（截圖取整可差數個像素）。
      assert.ok(Math.abs(png.width - (result.widthCm / 2.54) * 300) < 8, `${name} 像素寬度與 dpi 不符`);
      const svg = fs.readFileSync(svgPath, "utf8");
      assert.match(svg, /<svg[^>]*width="[\d.]+mm"/u, name);
      assert.doesNotMatch(svg, /foreignObject/u, `${name} 之 SVG 不得含 foreignObject`);
      if (name.endsWith(".html")) assert.match(svg, /對應之服務內容/u);
    }
  } finally {
    await renderer.close();
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("語法錯誤之 Mermaid 回報錯誤", { skip: chrome ? false : "找不到 Chrome" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "figure-table-tomo-"));
  const file = path.join(dir, "bad.mmd");
  fs.writeFileSync(file, "flowchart LR\n  A --> \n  ((((");
  const renderer = await Renderer.launch({ chromePath: chrome });
  try {
    await assert.rejects(convertFile(renderer, file, { outDir: dir }), /Mermaid/u);
  } finally {
    await renderer.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("語法錯誤之 LaTeX 回報錯誤", { skip: chrome ? false : "找不到 Chrome" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "figure-table-tomo-"));
  const file = path.join(dir, "bad.tex");
  fs.writeFileSync(file, "\\frac{1}{");
  const renderer = await Renderer.launch({ chromePath: chrome });
  try {
    await assert.rejects(convertFile(renderer, file, { outDir: dir }), /LaTeX/u);
  } finally {
    await renderer.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
