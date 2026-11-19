// 字型預設集：皆為開源或政府開放授權之字型，由使用者自行安裝；本 repo 不散布字型檔。

export const FONT_PRESETS = Object.freeze({
  // Noto Sans CJK TC（SIL OFL 1.1）：黑體，預設；與 jibun-markdown-pdf-tomo 一致。
  noto: { label: "Noto Sans CJK TC", families: ["Noto Sans CJK TC", "Noto Sans TC"], fallback: "sans-serif" },
  // Noto Serif CJK TC（SIL OFL 1.1）：明體。
  "noto-serif": { label: "Noto Serif CJK TC", families: ["Noto Serif CJK TC", "Noto Serif TC"], fallback: "serif" },
  // 全字庫正楷體（政府資料開放授權）：接近公文之楷書。
  kai: { label: "全字庫正楷體", families: ["TW-Kai", "全字庫正楷體"], fallback: "serif" },
});

export const DEFAULT_FONT = "noto";

export function resolveFont(name = DEFAULT_FONT) {
  const preset = FONT_PRESETS[name];
  if (!preset) {
    throw new Error(`不支援之字型「${name}」；可用：${Object.keys(FONT_PRESETS).join("、")}。`);
  }
  return { name, ...preset, css: cssFontFamily([...preset.families, preset.fallback]) };
}

export function cssFontFamily(names) {
  return names.map((name) => (/^(?:serif|sans-serif|monospace)$/u.test(name) ? name : `"${name}"`)).join(", ");
}
