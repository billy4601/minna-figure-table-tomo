// 圖檔之實體尺寸：PNG 寫入解析度（pHYs），SVG 寫入以 mm 為單位之寬高。
// Word 等軟體依此決定插入時之大小；PNG 沒有 pHYs 時多以 96 dpi 解讀，圖會變得很大。

import zlib from "node:zlib";

export const CSS_PX_PER_MM = 96 / 25.4;

export function cmToCssPx(cm) {
  return cm * 10 * CSS_PX_PER_MM;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData) >>> 0);
  return Buffer.concat([length, typeAndData, crc]);
}

// 以 dpi 設定 PNG 之 pHYs（每公尺像素數）；已有 pHYs 者取代之。
export function setPngDpi(buffer, dpi) {
  const png = Buffer.from(buffer);
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("不是 PNG 檔。");
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  const data = Buffer.alloc(9);
  data.writeUInt32BE(pixelsPerMetre, 0);
  data.writeUInt32BE(pixelsPerMetre, 4);
  data.writeUInt8(1, 8);

  const parts = [PNG_SIGNATURE];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (type !== "pHYs") parts.push(png.subarray(offset, end));
    if (type === "IHDR") parts.push(chunk("pHYs", data));
    offset = end;
  }
  return Buffer.concat(parts);
}

// 讀取 PNG 之像素寬高及 dpi（pHYs），供測試及檢查用。
export function readPngInfo(buffer) {
  const png = Buffer.from(buffer);
  const info = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), dpi: null };
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "pHYs" && png.readUInt8(offset + 16) === 1) {
      info.dpi = Math.round(png.readUInt32BE(offset + 8) * 0.0254);
    }
    offset += 12 + length;
  }
  return info;
}

const round = (value) => Math.round(value * 100) / 100;

// 將 SVG 根元素之 width、height 改為 mm（依 CSS px 換算），並確保有 viewBox；
// 移除 Mermaid 加在根元素上之 max-width 樣式，使其以實體尺寸顯示。
export function setSvgPhysicalSize(svg, { widthPx, heightPx, viewBox = null }) {
  const source = String(svg);
  const start = source.indexOf("<svg");
  if (start < 0) throw new Error("不是 SVG。");
  const end = source.indexOf(">", start);
  let tag = source.slice(start, end);
  tag = tag
    .replace(/\s(?:width|height)="[^"]*"/gu, "")
    .replace(/\sstyle="[^"]*"/u, "");
  if (!/\sviewBox="/u.test(tag)) {
    const box = viewBox ?? { x: 0, y: 0, width: widthPx, height: heightPx };
    tag += ` viewBox="${box.x} ${box.y} ${box.width} ${box.height}"`;
  }
  tag += ` width="${round(widthPx / CSS_PX_PER_MM)}mm" height="${round(heightPx / CSS_PX_PER_MM)}mm"`;
  return source.slice(0, start) + tag + source.slice(end);
}
