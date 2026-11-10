import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1);
    table[i] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makePng(width, height, drawPixel) {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }
  const idatData = zlib.deflateSync(rawData);
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const typeAndData = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Brand icon drawer: Onyx Black background (#0F1015), Coral Orange pin & circle (#FF5E2B), white center
function createIconDrawer(isMaskable = false) {
  return (x, y, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const scale = isMaskable ? 0.75 : 0.9;
    const dx = (x - cx) / (w * scale);
    const dy = (y - cy) / (h * scale);
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Default Onyx Black #0F1015
    let r = 15;
    let g = 16;
    let b = 21;
    let a = 255;

    // Outer glow ring
    if (dist >= 0.44 && dist <= 0.48) {
      // #FF5E2B alpha blended
      return [255, 94, 43, 180];
    }

    // Pin Head / Main Circle
    const pinCenterY = -0.06;
    const pinDist = Math.sqrt(dx * dx + (dy - pinCenterY) * (dy - pinCenterY));

    if (pinDist <= 0.32) {
      // Inner circle white center hole
      if (pinDist <= 0.12) {
        return [255, 255, 255, 255];
      }
      // Inner ring coral
      return [255, 94, 43, 255];
    }

    // Pin Point bottom triangle
    if (dy > pinCenterY && dy < 0.38) {
      const halfWidthAtY = (0.38 - dy) * 0.7;
      if (Math.abs(dx) <= halfWidthAtY) {
        return [255, 94, 43, 255];
      }
    }

    // Gentle radial vignette toward borders
    const borderDist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / (w * 0.5);
    if (borderDist > 0.85) {
      r = 10;
      g = 11;
      b = 14;
    }

    return [r, g, b, a];
  };
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate icons
const sizes = [
  { name: 'pwa-192x192.png', size: 192, maskable: false },
  { name: 'pwa-512x512.png', size: 512, maskable: false },
  { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const s of sizes) {
  const filePath = path.join(publicDir, s.name);
  const buf = makePng(s.size, s.size, createIconDrawer(s.maskable));
  fs.writeFileSync(filePath, buf);
  console.log(`Generated ${s.name} (${s.size}x${s.size})`);
}
