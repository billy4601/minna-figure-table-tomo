import assert from "node:assert/strict";
import test from "node:test";
import { stripMathDelimiters } from "../src/math.mjs";
import {
  detectKind, inlineMarkdown, markdownTableToHtml, outputStem, parseFrontMatter, parseMarkdownTable, parseWidths, sanitizeHtmlTable, splitRow,
} from "../src/table-source.mjs";

test("前置資料：取出鍵值並回傳其後之內容", () => {
  const { meta, body } = parseFrontMatter("---\nwidths: 20%, 80%\nfont: kai\n---\n| a | b |\n");
  assert.deepEqual(meta, { widths: "20%, 80%", font: "kai" });
  assert.equal(body, "| a | b |\n");
  assert.deepEqual(parseFrontMatter("| a |").meta, {});
});

test("欄寬：百分比、數量及總和", () => {
  assert.deepEqual(parseWidths("20%, 30%, 50%", 3), [20, 30, 50]);
  assert.equal(parseWidths("", 3), null);
  assert.throws(() => parseWidths("20, 80", 2), /百分比/u);
  assert.throws(() => parseWidths("20%, 80%", 3), /3 欄/u);
  assert.throws(() => parseWidths("20%, 70%", 2), /100%/u);
});

test("表格列：以未跳脫之直線切割", () => {
  assert.deepEqual(splitRow("| a | b \\| c | d |"), ["a", "b | c", "d"]);
});

test("Markdown 表格：對齊、補足空白格、拒絕表格外之文字", () => {
  const table = parseMarkdownTable("| a | b | c |\n| :--- | :---: | ---: |\n| 1 |\n");
  assert.deepEqual(table.align, ["left", "center", "right"]);
  assert.deepEqual(table.rows, [["1", "", ""]]);
  assert.throws(() => parseMarkdownTable("說明文字\n| a |\n| --- |"), /只能有一張表格/u);
  assert.throws(() => parseMarkdownTable("| a | b |\n| --- | --- |\n| 1 | 2 | 3 |"), /超過表頭/u);
});

test("儲存格行內語法：粗體、換行，其餘跳脫", () => {
  assert.equal(inlineMarkdown("**甲**<br>乙 <i>"), "<strong>甲</strong><br>乙 &lt;i&gt;");
});

test("Markdown 表格轉 HTML：含欄寬", () => {
  const html = markdownTableToHtml("| a | b |\n| --- | :---: |\n| 1 | 2 |", { widths: "30%, 70%" });
  assert.match(html, /<col style="width:30%">/u);
  assert.match(html, /<th style="text-align:center">b<\/th>/u);
});

test("HTML 表格：移除腳本、事件及外部資源，保留合併儲存格", () => {
  const html = sanitizeHtmlTable('<p>x</p><table onclick="x()"><tr><td colspan="2" style="background:url(http://a)">甲</td><script>alert(1)</script><td><img src="http://a/b.png"></td></tr></table>');
  assert.match(html, /colspan="2"/u);
  assert.doesNotMatch(html, /onclick|script|img|http/u);
  assert.throws(() => sanitizeHtmlTable("<div></div>"), /找不到/u);
});

test("類型判斷及輸出主檔名", () => {
  assert.equal(detectKind("a.md"), "table-markdown");
  assert.equal(detectKind("a.HTML"), "table-html");
  assert.equal(detectKind("a.mmd"), "mermaid");
  assert.equal(detectKind("a.vl.json"), "vega-lite");
  assert.equal(detectKind("a.tex"), "math");
  assert.equal(detectKind("a.json"), null);
  assert.equal(outputStem("式1.tex"), "式1");
  assert.equal(outputStem("表1-2.vl.json"), "表1-2");
  assert.equal(outputStem("圖3.mmd"), "圖3");
});

test("公式之定界符號可有可無", () => {
  assert.equal(stripMathDelimiters("$$ x^2 $$"), "x^2");
  assert.equal(stripMathDelimiters("\\[ x^2 \\]"), "x^2");
  assert.equal(stripMathDelimiters("$x$"), "x");
  assert.equal(stripMathDelimiters(" x^2 "), "x^2");
});
