import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPngWithPaperplane(size) {
  const width = size;
  const height = size;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    let crc = 0xffffffff;
    const chunkToCheck = buf.subarray(4, 8 + len);
    for (let i = 0; i < chunkToCheck.length; i++) {
      let byte = chunkToCheck[i];
      crc ^= byte;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const ihdr = makeChunk('IHDR', ihdrData);
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  // Draw smooth black background with rounded corners and white paperplane in the center
  const cx = width / 2;
  const cy = height / 2;
  const cornerRadius = size * 0.22;

  // Normalized paperplane coordinates (scale from -1 to 1)
  // Nose: (0.45, -0.45), Left wing: (-0.55, -0.05), Tail: (-0.1, 0.45), Body fold: (-0.15, 0.05)
  function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const v0x = cx - ax, v0y = cy - ay;
    const v1x = bx - ax, v1y = by - ay;
    const v2x = px - ax, v2y = py - ay;
    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;
    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    return u >= 0 && v >= 0 && (u + v < 1);
  }

  // Define paperplane vertices scaled to image
  const scale = size * 0.42;
  const noseX = cx + 0.5 * scale, noseY = cy - 0.55 * scale;
  const leftX = cx - 0.55 * scale, leftY = cy - 0.05 * scale;
  const tailX = cx - 0.05 * scale, tailY = cy + 0.55 * scale;
  const foldX = cx - 0.12 * scale, foldY = cy + 0.05 * scale;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;

      // Rounded rect boundary check
      const dx = Math.max(Math.abs(x - cx) - (width / 2 - cornerRadius), 0);
      const dy = Math.max(Math.abs(y - cy) - (height / 2 - cornerRadius), 0);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= cornerRadius) {
        // Inside icon background (pure black)
        // Check if inside paperplane triangle 1 (top wing) or triangle 2 (bottom wing)
        const inWing1 = pointInTriangle(x, y, noseX, noseY, leftX, leftY, foldX, foldY);
        const inWing2 = pointInTriangle(x, y, noseX, noseY, foldX, foldY, tailX, tailY);
        const inCenterFold = pointInTriangle(x, y, noseX, noseY, leftX, leftY, tailX, tailY);

        if (inWing1 || inWing2 || inCenterFold) {
          // Crisp white
          rawData[px] = 255;
          rawData[px + 1] = 255;
          rawData[px + 2] = 255;
          rawData[px + 3] = 255;
        } else {
          // Crisp dark background
          rawData[px] = 18;
          rawData[px + 1] = 18;
          rawData[px + 2] = 22;
          rawData[px + 3] = 255;
        }
      } else {
        // Transparent outside rounded corners
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressedData);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const iconPng64 = createPngWithPaperplane(64);
const iconPng192 = createPngWithPaperplane(192);
const iconPng512 = createPngWithPaperplane(512);

fs.writeFileSync(path.join(publicDir, 'icon.png'), iconPng64);
fs.writeFileSync(path.join(publicDir, 'favicon.png'), iconPng64);
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), iconPng192);
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), iconPng512);

console.log('Successfully generated PNG icons for favicon and PWA');
