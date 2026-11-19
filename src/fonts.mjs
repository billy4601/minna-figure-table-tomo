// 字型預設集：對應 fonts.json 之 presets，字型由字型庫（minna-fonts-tomo）提供；字型不隨本 repo 散布。
// 字型庫無法取得時，改用電腦上安裝之同名字型（輸出可能與他處不同），並由呼叫端提出警告。

import { ensureFontLibrary, fontFaces, loadFontConfig } from "./font-library.mjs";

export const DEFAULT_FONT = "noto";

// 字型庫無法取得時之系統字型名稱（依預設集）。
const SYSTEM_FAMILIES = {
  noto: ["Noto Sans TC", "Noto Sans CJK TC"],
  "noto-serif": ["Noto Serif TC", "Noto Serif CJK TC"],
  kai: ["TW-Kai", "全字庫正楷體"],
  sung: ["TW-Sung", "全字庫正宋體"],
};

export function fontPresetNames(config = loadFontConfig()) {
  return Object.keys(config.presets);
}

export function cssFontFamily(names) {
  return names.map((name) => (/^(?:serif|sans-serif|monospace)$/u.test(name) ? name : `"${name}"`)).join(", ");
}

// 回傳 { name, label, families, faces, css, source, warning }；faces 為空表示使用系統字型。
export function resolveFont(name = DEFAULT_FONT, { config = loadFontConfig(), env = process.env } = {}) {
  const preset = config.presets[name];
  if (!preset) throw new Error(`不支援之字型「${name}」；可用：${Object.keys(config.presets).join("、")}。`);
  const ids = [...preset.fonts, ...(config.supplements ?? [])];
  const library = ensureFontLibrary(ids, { config, env });
  if (library.error) {
    const families = [...(SYSTEM_FAMILIES[name] ?? []), preset.fallback];
    return {
      name, label: preset.label, families, faces: [], css: cssFontFamily(families), source: "system",
      warning: `${library.error}改用電腦上安裝之字型，輸出可能與其他電腦不同。`,
    };
  }
  const { families, faces } = fontFaces(ids, library);
  return {
    name, label: preset.label, families: [...families, preset.fallback], faces,
    css: cssFontFamily([...families, preset.fallback]), source: library.source, warning: null,
  };
}
