import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cacheDir, ensureFontLibrary, fontFaces, loadFontConfig } from "../src/font-library.mjs";
import { resolveFont } from "../src/fonts.mjs";

const config = loadFontConfig();

test("fonts.json：固定提交編號，預設集皆有字型 id", () => {
  assert.match(config.commit, /^[0-9a-f]{40}$/u);
  for (const preset of Object.values(config.presets)) assert.ok(preset.fonts.length > 0);
});

test("快取位置依平臺", () => {
  assert.equal(cacheDir({ platform: "darwin", homeDir: "/h", env: {} }), path.join("/h", "Library", "Caches", "figure-table-tomo", "fonts"));
  assert.equal(cacheDir({ platform: "linux", homeDir: "/h", env: { XDG_CACHE_HOME: "/c" } }), path.join("/c", "figure-table-tomo", "fonts"));
});

test("本機字型庫不存在時回報錯誤，字型改用系統字型並提出警告", () => {
  const env = { FIGURE_TABLE_TOMO_FONTS_DIR: path.join(os.tmpdir(), "no-such-fonts-dir") };
  assert.match(ensureFontLibrary(["noto-sans-tc-ttf"], { config, env }).error, /fonts\.yaml/u);
  const font = resolveFont("noto", { config, env });
  assert.equal(font.source, "system");
  assert.equal(font.faces.length, 0);
  assert.match(font.warning, /電腦上安裝/u);
  assert.throws(() => resolveFont("unknown", { config, env }), /不支援/u);
});

// 已取得字型庫（本機副本或快取）時，檢查字型檔及字型名稱；否則略過。
const localDir = process.env.FIGURE_TABLE_TOMO_FONTS_DIR || path.join(cacheDir(), config.commit);
const available = fs.existsSync(path.join(localDir, "fonts.yaml"));

test("字型庫：字型名稱、字重及補字家族", { skip: available ? false : "尚未取得字型庫" }, () => {
  const library = ensureFontLibrary(["noto-sans-tc-ttf", "noto-sans-symbols2-ttf"], { config, env: { FIGURE_TABLE_TOMO_FONTS_DIR: localDir } });
  if (library.error) return;
  const { families, faces } = fontFaces(["noto-sans-tc-ttf", "noto-sans-symbols2-ttf"], library);
  assert.deepEqual(families, ["Noto Sans TC", "Noto Sans Symbols 2"]);
  assert.deepEqual(faces.filter((face) => face.family === "Noto Sans TC").map((face) => face.weight), ["400", "500", "700", "900"]);
});

test("GitHub 無法連線時：~/Repositories/minna-fonts-tomo 為本機備案；皆無時回報錯誤", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ftt-fonts-"));
  const env = { XDG_CACHE_HOME: path.join(home, "cache") };
  assert.match(ensureFontLibrary(["noto-sans-tc-ttf"], { config, env, homeDir: home, fetch: false }).error, /本機沒有字型庫副本/u);
  const dir = path.join(home, "Repositories", "minna-fonts-tomo");
  fs.mkdirSync(path.join(dir, "sans", "noto-sans-tc-ttf"), { recursive: true });
  fs.writeFileSync(path.join(dir, "sans", "noto-sans-tc-ttf", "A.ttf"), "");
  fs.writeFileSync(path.join(dir, "fonts.yaml"), "noto-sans-tc-ttf:\n  path: sans/noto-sans-tc-ttf\n  files: [A.ttf]\n");
  const result = ensureFontLibrary(["noto-sans-tc-ttf"], { config, env, homeDir: home, fetch: false });
  assert.equal(result.source, "local");
  assert.equal(result.dir, dir);
  fs.rmSync(home, { recursive: true, force: true });
});
