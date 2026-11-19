// 數學公式之純轉換：原始檔可只寫公式本身，或以 $$…$$、\\[…\\]、$…$ 包住。
// 實際繪製在瀏覽器中以 MathJax 進行（見 src/browser.mjs 之 renderMath），以便依實際字型量測公式內之文字。

export function stripMathDelimiters(source) {
  const text = String(source).trim();
  const pairs = [["$$", "$$"], ["\\[", "\\]"], ["$", "$"]];
  for (const [open, close] of pairs) {
    if (text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length) {
      return text.slice(open.length, text.length - close.length).trim();
    }
  }
  return text;
}
