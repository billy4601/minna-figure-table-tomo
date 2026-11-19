import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { fitSize, LAYOUTS, resolveLayout } from "../src/convert.mjs";
import { cmToCssPx, readPngInfo, setPngDpi, setSvgPhysicalSize } from "../src/image-size.mjs";

function tinyPng() {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(0, 9);
  const raw = Buffer.from([0, 255, 255]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("PNG 寫入 dpi，重寫時取代原有之 pHYs", () => {
  const once = setPngDpi(tinyPng(), 300);
  assert.deepEqual(readPngInfo(once), { width: 2, height: 1, dpi: 300 });
  const twice = setPngDpi(once, 150);
  assert.equal(readPngInfo(twice).dpi, 150);
  assert.equal(twice.length, once.length);
  assert.throws(() => setPngDpi(Buffer.from("not png"), 300), /PNG/u);
});

test("16 cm 換算為 CSS px", () => {
  assert.ok(Math.abs(cmToCssPx(16) - 604.72) < 0.01);
});

test("SVG 寫入 mm 寬高、補 viewBox、移除根元素樣式", () => {
  const svg = setSvgPhysicalSize('<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 300px;"><g/></svg>', {
    widthPx: cmToCssPx(16), heightPx: cmToCssPx(4),
  });
  assert.match(svg, /width="160mm" height="40mm"/u);
  assert.match(svg, /viewBox="0 0 /u);
  assert.doesNotMatch(svg, /max-width|100%/u);
});

test("版面：預設集、命令列及前置資料之覆寫順序", () => {
  assert.equal(resolveLayout({}).widthCm, 16);
  assert.equal(resolveLayout({ layout: "slide" }).fontSizePt, 18);
  assert.equal(resolveLayout({ layout: "a4-half" }).widthCm, (16 - 0.4) / 2);
  assert.equal(resolveLayout({ layout: "a4", widthCm: 12 }).widthCm, 12);
  assert.equal(resolveLayout({ layout: "a4", widthCm: 12 }, { "width-cm": "10", layout: "slide" }).widthCm, 10);
  assert.throws(() => resolveLayout({ layout: "a3" }), /不支援/u);
  assert.deepEqual(Object.keys(LAYOUTS), ["a4", "a4-half", "slide"]);
});

test("縮放：依寬或高中較嚴者等比例縮小，不放大", () => {
  assert.equal(fitSize({ width: 100, height: 50 }, 200, 200).scale, 1);
  assert.equal(fitSize({ width: 400, height: 50 }, 200, 200).scale, 0.5);
  assert.equal(fitSize({ width: 100, height: 800 }, 200, 200).scale, 0.25);
});
