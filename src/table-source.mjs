// 表格原始檔之純轉換：Markdown（GFM 表格）或 HTML 表格 → 供瀏覽器排版之 HTML。
// 本檔不接觸瀏覽器，可單獨測試。

// 前置資料（front matter）：檔案開頭 --- 至 --- 之間之「鍵: 值」，只取單行字串值。
export function parseFrontMatter(text) {
  const source = String(text).replace(/^﻿/u, "").replace(/\r\n/gu, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/u.exec(source);
  if (!match) return { meta: {}, body: source };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/u.exec(line.trim());
    if (pair) meta[pair[1]] = pair[2].replace(/^["']|["']$/gu, "").trim();
  }
  return { meta, body: source.slice(match[0].length) };
}

// 欄寬：「20%, 30%, 50%」→ [20, 30, 50]；數量須等於欄數，總和須為 100。
export function parseWidths(value, columnCount) {
  if (value == null || value === "") return null;
  const parts = String(value).split(/[,，\s]+/u).filter(Boolean);
  const numbers = parts.map((part) => {
    const match = /^(\d+(?:\.\d+)?)%$/u.exec(part);
    if (!match) throw new Error(`widths 只接受百分比（例：20%, 80%），無法解讀「${part}」。`);
    return Number(match[1]);
  });
  if (columnCount != null && numbers.length !== columnCount) {
    throw new Error(`widths 有 ${numbers.length} 個值，但表格有 ${columnCount} 欄。`);
  }
  const total = numbers.reduce((sum, number) => sum + number, 0);
  if (Math.abs(total - 100) > 0.01) throw new Error(`widths 總和須為 100%，目前為 ${total}%。`);
  return numbers;
}

// 以未跳脫之「|」切割表格列；「\|」為字面之直線。
export function splitRow(line) {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells = [];
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\" && text[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

const ALIGN_CELL = /^:?-{1,}:?$/u;

// GFM 表格 → { header: [...], align: [...], rows: [[...]] }。
// 檔案中只能有一張表格；表格以外之文字一律視為錯誤，以免漏畫內容。
export function parseMarkdownTable(body) {
  const lines = String(body).split("\n").map((line) => line.trimEnd());
  const tableLines = lines.filter((line) => line.trim() !== "");
  if (tableLines.length < 2) throw new Error("找不到 Markdown 表格（至少需要表頭列及對齊列）。");
  const stray = tableLines.find((line) => !line.trim().startsWith("|"));
  if (stray) throw new Error(`檔案中只能有一張表格，每列以「|」開頭；無法解讀「${stray.trim()}」。`);

  const header = splitRow(tableLines[0]);
  const alignCells = splitRow(tableLines[1]);
  if (!alignCells.every((cell) => ALIGN_CELL.test(cell.replace(/\s/gu, "")))) {
    throw new Error("第二列須為對齊列（例：| --- | :---: |）。");
  }
  if (alignCells.length !== header.length) throw new Error("對齊列之欄數與表頭不同。");
  const align = alignCells.map((cell) => {
    const value = cell.replace(/\s/gu, "");
    if (value.startsWith(":") && value.endsWith(":")) return "center";
    if (value.endsWith(":")) return "right";
    if (value.startsWith(":")) return "left";
    return null;
  });
  const rows = tableLines.slice(2).map((line, index) => {
    const cells = splitRow(line);
    if (cells.length > header.length) {
      throw new Error(`第 ${index + 1} 列資料有 ${cells.length} 格，超過表頭之 ${header.length} 欄。`);
    }
    while (cells.length < header.length) cells.push("");
    return cells;
  });
  return { header, align, rows };
}

export function escapeHtml(text) {
  return String(text).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

// 儲存格內之行內語法：**粗體**、<br> 換行；其餘一律當純文字。
export function inlineMarkdown(text) {
  const parts = String(text).split(/<br\s*\/?>/iu);
  return parts.map((part) => escapeHtml(part).replace(/\*\*(.+?)\*\*/gu, "<strong>$1</strong>")).join("<br>");
}

export function markdownTableToHtml(body, { widths = null } = {}) {
  const table = parseMarkdownTable(body);
  const columnWidths = parseWidths(widths, table.header.length);
  const alignAttr = (index) => (table.align[index] ? ` style="text-align:${table.align[index]}"` : "");
  const colgroup = columnWidths
    ? `<colgroup>${columnWidths.map((width) => `<col style="width:${width}%">`).join("")}</colgroup>`
    : "";
  const head = `<thead><tr>${table.header.map((cell, index) => `<th${alignAttr(index)}>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>`;
  const rows = table.rows
    .map((row) => `<tr>${row.map((cell, index) => `<td${alignAttr(index)}>${inlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${colgroup}${head}<tbody>${rows}</tbody></table>`;
}

// HTML 表格：取第一個 <table>…</table>，移除腳本、外部資源及事件屬性。
// 合併儲存格（colspan、rowspan）、多層表頭（多列 <th>）等複雜表格以此格式撰寫。
export function sanitizeHtmlTable(html, { widths = null } = {}) {
  const source = String(html);
  const match = /<table[\s>][\s\S]*<\/table>/iu.exec(source);
  if (!match) throw new Error("找不到 <table>…</table>。");
  let table = match[0]
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style|iframe|object|svg|video|audio|form|template)\b[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<\/?(?:script|style|iframe|object|embed|link|meta|img|svg|video|audio|form|input|template|base)\b[^>]*>/giu, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\s+(?:href|src|srcset|action|background)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/url\s*\([^)]*\)/giu, "none");
  if (widths) {
    const columnWidths = parseWidths(widths, null);
    const colgroup = `<colgroup>${columnWidths.map((width) => `<col style="width:${width}%">`).join("")}</colgroup>`;
    table = table.replace(/<colgroup[\s\S]*?<\/colgroup>/giu, "").replace(/^<table([^>]*)>/iu, `<table$1>${colgroup}`);
  }
  return table;
}

// 依副檔名判斷原始檔之類型。
export function detectKind(filePath) {
  const name = String(filePath).toLowerCase();
  if (/\.(?:md|markdown)$/u.test(name)) return "table-markdown";
  if (/\.html?$/u.test(name)) return "table-html";
  if (/\.(?:mmd|mermaid)$/u.test(name)) return "mermaid";
  if (/\.(?:vl\.json|vega-lite\.json|vl)$/u.test(name)) return "vega-lite";
  if (/\.tex$/u.test(name)) return "math";
  return null;
}

// 輸出檔名之主檔名：去掉原始檔之副檔名（含 .vl.json 等雙重副檔名）。
export function outputStem(fileName) {
  return String(fileName).replace(/\.(?:vl\.json|vega-lite\.json|vl|mmd|mermaid|md|markdown|html?|tex)$/iu, "");
}
