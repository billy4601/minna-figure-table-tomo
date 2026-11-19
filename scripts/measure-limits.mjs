#!/usr/bin/env node
// 極限值測試：各版面之下，各類圖之數量增加到多少時需要縮小、縮到低於可讀字級（或超過高度上限）。
// 用法：node scripts/measure-limits.mjs [暫存資料夾]；結果以 Markdown 表格印出，供 README 使用。
// 每格為「不縮小之上限／可讀之上限」：前者為原尺寸即可放入版面，後者為縮小後字級仍不低於可讀下限。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Renderer } from "../src/browser.mjs";
import { convertFile, LAYOUTS } from "../src/convert.mjs";

const dir = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), "figure-table-tomo-limits-"));
fs.mkdirSync(dir, { recursive: true });

const steps = (direction) => (n) => [
  `flowchart ${direction}`,
  ...(n === 1 ? ["  N0[第1步驟]"] : Array.from({ length: n - 1 }, (_, i) => `  N${i}[第${i + 1}步驟] --> N${i + 1}[第${i + 2}步驟]`)),
].join("\n");

const cases = {
  "直向流程圖（步數）": { ext: "mmd", make: steps("TD") },
  "橫向流程圖（步數）": { ext: "mmd", make: steps("LR") },
  "組織圖（同一層節點數）": { ext: "mmd", make: (n) => ["flowchart TD", ...Array.from({ length: n }, (_, i) => `  R[專案經理] --> C${i}[第${i + 1}組]`)].join("\n") },
  "甘特圖（工作項目數）": { ext: "mmd", make: (n) => ["gantt", "  dateFormat YYYY-MM-DD", ...Array.from({ length: n }, (_, i) => `  工作項目${i + 1} :t${i}, 2027-${String(1 + (i % 12)).padStart(2, "0")}-01, 60d`)].join("\n") },
  "表格（列數，4 欄、每格一行）": { ext: "md", make: (n) => ["| 項次 | 工作項目 | 負責人員 | 完成期限 |", "| --- | --- | --- | --- |", ...Array.from({ length: n }, (_, i) => `| ${i + 1} | 網站弱點掃描 | 資安工程師 | 每季 |`)].join("\n") },
};

const renderer = await Renderer.launch();
const rows = [];
try {
  for (const [title, item] of Object.entries(cases)) {
    const result = { title };
    for (const layout of Object.keys(LAYOUTS)) {
      const limit = LAYOUTS[layout];
      let noShrink = 0;
      let readable = 0;
      for (let n = 1; n <= 80; n += 1) {
        const file = path.join(dir, `${layout}-${n}.${item.ext}`);
        fs.writeFileSync(file, item.make(n));
        const out = await convertFile(renderer, file, { layout, outDir: dir, formats: [] });
        const fitsHeight = out.heightCm <= limit.heightCm + 0.01;
        const ok = out.effectiveFontPt >= limit.minFontPt - 0.05 && fitsHeight;
        if (out.scale >= 0.999 && fitsHeight) noShrink = n;
        if (ok) readable = n;
        else if (n > readable + 2) break;
      }
      result[layout] = { noShrink, readable };
    }
    rows.push(result);
    console.error(`[OK] ${title}`);
  }
} finally {
  await renderer.close();
}

const layouts = Object.keys(LAYOUTS);
console.log(`| 圖之種類 | ${layouts.map((key) => `${LAYOUTS[key].label}（${LAYOUTS[key].widthCm} × ${LAYOUTS[key].heightCm} cm，${LAYOUTS[key].fontSizePt} pt）`).join(" | ")} |`);
console.log(`|---|${layouts.map(() => "---").join("|")}|`);
for (const row of rows) {
  console.log(`| ${row.title} | ${layouts.map((key) => `${row[key].noShrink}／${row[key].readable}`).join(" | ")} |`);
}
