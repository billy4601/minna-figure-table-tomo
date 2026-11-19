// 字型庫（minna-fonts-tomo）之取用：依 fonts.json 之提交編號，只取用到之字型資料夾。
// 字型不讀電腦上安裝者，一律由字型庫提供，使雲端與任何電腦之輸出相同。
//
// 字型庫位置之優先順序：
//   1. 環境變數 FIGURE_TABLE_TOMO_FONTS_DIR：本機已有之字型庫副本（不檢查提交編號）。
//   2. 快取：<快取資料夾>/figure-table-tomo/fonts/<提交編號>（已取得者直接使用）。
//   3. 以 git 部分 clone ＋ sparse checkout 取得至快取。
// 皆無法取得時回傳 null，由呼叫端改用系統字型並提出警告。

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadFontConfig(file = path.join(ROOT, "fonts.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function cacheDir({ env = process.env, platform = process.platform, homeDir = os.homedir() } = {}) {
  const base = platform === "darwin"
    ? path.join(homeDir, "Library", "Caches")
    : env.XDG_CACHE_HOME || path.join(homeDir, ".cache");
  return path.join(base, "figure-table-tomo", "fonts");
}

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
}

function readRegistry(dir) {
  const file = path.join(dir, "fonts.yaml");
  return fs.existsSync(file) ? yaml.load(fs.readFileSync(file, "utf8")) : null;
}

function hasFonts(dir, registry, ids) {
  return ids.every((id) => registry?.[id] && registry[id].files.every((name) => fs.existsSync(path.join(dir, registry[id].path, name))));
}

// 取得字型庫資料夾，並確保 ids 之字型檔齊全；回傳 { dir, registry, source } 或 { error }。
export function ensureFontLibrary(ids, { config = loadFontConfig(), env = process.env } = {}) {
  const local = env.FIGURE_TABLE_TOMO_FONTS_DIR?.trim();
  if (local) {
    const registry = readRegistry(local);
    if (!registry) return { error: `FIGURE_TABLE_TOMO_FONTS_DIR（${local}）不是字型庫資料夾（找不到 fonts.yaml）。` };
    const missing = ids.filter((id) => !hasFonts(local, registry, [id]));
    if (missing.length) return { error: `本機字型庫缺少：${missing.join("、")}。` };
    return { dir: local, registry, source: "local" };
  }

  // FIGURE_TABLE_TOMO_FONTS_REPOSITORY：改用其他網址（例：自己的字型庫分支）取得同一提交編號。
  const repository = env.FIGURE_TABLE_TOMO_FONTS_REPOSITORY?.trim() || config.repository;
  const dir = path.join(cacheDir({ env }), config.commit);
  let registry = readRegistry(dir);
  if (registry && hasFonts(dir, registry, ids)) return { dir, registry, source: "cache" };

  try {
    if (!fs.existsSync(path.join(dir, ".git"))) {
      fs.mkdirSync(dir, { recursive: true });
      git(["init", "-q"], dir);
      git(["remote", "add", "origin", repository], dir);
      git(["sparse-checkout", "set", "--no-cone", "fonts.yaml"], dir);
      git(["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", config.commit], dir);
      git(["checkout", "-q", "FETCH_HEAD"], dir);
      registry = readRegistry(dir);
    }
    const unknown = ids.filter((id) => !registry?.[id]);
    if (unknown.length) return { error: `字型庫（${config.commit.slice(0, 7)}）沒有登錄：${unknown.join("、")}。` };
    const paths = ids.map((id) => `${registry[id].path}/`);
    git(["sparse-checkout", "set", "--no-cone", "fonts.yaml", ...new Set(paths)], dir);
    if (!hasFonts(dir, registry, ids)) return { error: "字型庫取得後仍缺少字型檔。" };
    return { dir, registry, source: "fetched" };
  } catch (error) {
    const detail = String(error.stderr ?? error.message ?? error).trim().split("\n").pop();
    fs.rmSync(dir, { recursive: true, force: true });
    return { error: `無法取得字型庫（${repository}）：${detail}。` };
  }
}

// 讀取 TrueType 之字型家族名稱（name 表 ID 1，優先英文 Windows 平臺）。
export function readFamilyName(file) {
  const buffer = fs.readFileSync(file);
  const tableCount = buffer.readUInt16BE(4);
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16;
    if (buffer.toString("ascii", record, record + 4) !== "name") continue;
    const table = buffer.readUInt32BE(record + 8);
    const count = buffer.readUInt16BE(table + 2);
    const strings = table + buffer.readUInt16BE(table + 4);
    let fallback = null;
    for (let item = 0; item < count; item += 1) {
      const entry = table + 6 + item * 12;
      const [platform, , language, nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((at) => buffer.readUInt16BE(entry + at));
      if (nameId !== 1) continue;
      const raw = buffer.subarray(strings + offset, strings + offset + length);
      if (platform === 3) {
        const text = Buffer.from(raw).swap16().toString("utf16le");
        if (language === 0x0409) return text;
        fallback ??= text;
      } else if (platform === 1) {
        fallback ??= raw.toString("latin1");
      }
    }
    if (fallback) return fallback;
  }
  throw new Error(`讀不到字型名稱：${path.basename(file)}`);
}

// 依字型 id 產生 @font-face 清單：faces 列出者為各字重；未列者為補字（例：全字庫擴充區），各自成為一個家族接在後面。
// 回傳 { families: [家族名稱…], faces: [{ family, weight, style, file }] }。
export function fontFaces(ids, { dir, registry }) {
  const families = [];
  const faces = [];
  for (const id of ids) {
    const entry = registry[id];
    const listed = entry.faces ?? {};
    const files = entry.files;
    const primary = Object.keys(listed).length ? Object.keys(listed) : [files[0]];
    const familyFile = path.join(dir, entry.path, primary[0]);
    const family = readFamilyName(familyFile);
    families.push(family);
    for (const name of primary) {
      const [weight, style = "normal"] = String(listed[name] ?? "400").split(/\s+/u);
      faces.push({ family, weight, style, file: path.join(dir, entry.path, name) });
    }
    for (const name of files.filter((file) => !primary.includes(file))) {
      const file = path.join(dir, entry.path, name);
      const extra = readFamilyName(file);
      families.push(extra);
      faces.push({ family: extra, weight: "400", style: "normal", file });
    }
  }
  return { families: [...new Set(families)], faces };
}
