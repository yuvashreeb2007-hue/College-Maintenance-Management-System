import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, '..', 'Frontend');

// CRC32 implementation
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, t, data, crc]);
}

function renderPng(width, height, pixelShader) {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter none
  ihdr[12] = 0; // no interlace

  const ihdrChunk = pngChunk('IHDR', ihdr);
  const raw = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;

  for (let y = 0; y < height; y++) {
    raw[pos++] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelShader(x, y, width, height);
      raw[pos++] = Math.max(0, Math.min(255, Math.round(r)));
      raw[pos++] = Math.max(0, Math.min(255, Math.round(g)));
      raw[pos++] = Math.max(0, Math.min(255, Math.round(b)));
      raw[pos++] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });
  const idatChunk = pngChunk('IDAT', idatData);
  const iendChunk = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Color blending helpers
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }

// Drawing function that renders the CampusFix brand mark
function makeShader(isMaskable) {
  return function(x, y, w, h) {
    const nx = (x / w) * 2 - 1; // -1 to 1
    const ny = (y / h) * 2 - 1; // -1 to 1

    // Background gradient: #0f172a (15, 23, 42) to #1e293b (30, 41, 59)
    const bgT = clamp((nx + ny + 2) / 4);
    let r = lerp(15, 30, bgT);
    let g = lerp(23, 41, bgT);
    let b = lerp(42, 59, bgT);
    let a = 255;

    // If standard icon (not maskable), apply rounded corners to canvas
    if (!isMaskable) {
      const cornerR = 0.22;
      const qx = Math.abs(nx) - (1 - cornerR);
      const qy = Math.abs(ny) - (1 - cornerR);
      if (qx > 0 && qy > 0) {
        const dist = Math.sqrt(qx * qx + qy * qy);
        if (dist > cornerR) {
          const edgeAlpha = clamp(1 - (dist - cornerR) * w * 0.5);
          return [0, 0, 0, Math.round(edgeAlpha * 255)];
        }
      }
    }

    // Scale coordinates according to safe area: maskable icons keep elements within 75%
    const scale = isMaskable ? 0.76 : 0.88;
    const sx = nx / scale;
    const sy = ny / scale;

    // Draw Shield contour:
    // Top flat curve from sx = -0.7 to 0.7, tapering to bottom point at sx = 0, sy = 0.82
    const shieldTop = -0.78;
    const inShieldX = Math.abs(sx) <= 0.74;
    let inShield = false;

    if (sy >= shieldTop && inShieldX) {
      if (sy <= 0.05) {
        inShield = true;
      } else {
        // Taper to bottom tip (0, 0.84)
        const taper = 0.74 * (1 - Math.pow((sy - 0.05) / 0.79, 1.25));
        if (Math.abs(sx) <= taper) {
          inShield = true;
        }
      }
    }

    if (inShield) {
      // Shield gradient: #2563eb (37, 99, 235) to #1d4ed8 (29, 78, 216)
      const st = clamp((sy - shieldTop) / 1.5);
      r = lerp(37, 29, st);
      g = lerp(99, 78, st);
      b = lerp(235, 216, st);

      // Campus classical building elements
      // Pediment triangle (Roof)
      const pedTop = -0.54;
      const pedBase = -0.32;
      const pedHalfW = 0.44;
      if (sy >= pedTop && sy <= pedBase) {
        const pedW = pedHalfW * ((sy - pedTop) / (pedBase - pedTop));
        if (Math.abs(sx) <= pedW) {
          // White roof
          r = 255; g = 255; b = 255;
        }
      }

      // Roof beam / Architrave
      if (sy >= -0.31 && sy <= -0.26 && Math.abs(sx) <= 0.46) {
        r = 255; g = 255; b = 255;
      }

      // 3 Classical Columns
      const colTop = -0.23;
      const colBottom = 0.16;
      const colHalfW = 0.045;
      if (sy >= colTop && sy <= colBottom) {
        // Center column
        if (Math.abs(sx) <= colHalfW) {
          r = 255; g = 255; b = 255;
        }
        // Left column
        if (Math.abs(sx + 0.28) <= colHalfW) {
          r = 255; g = 255; b = 255;
        }
        // Right column
        if (Math.abs(sx - 0.28) <= colHalfW) {
          r = 255; g = 255; b = 255;
        }
      }

      // Base stairs
      if (sy >= 0.18 && sy <= 0.24 && Math.abs(sx) <= 0.50) {
        r = 255; g = 255; b = 255;
      }
      if (sy >= 0.26 && sy <= 0.33 && Math.abs(sx) <= 0.56) {
        r = 255; g = 255; b = 255;
      }

      // Overlapping Repair Badge (Bottom Right circle with wrench & sparkle)
      const badgeCx = 0.32;
      const badgeCy = 0.24;
      const bdx = sx - badgeCx;
      const bdy = sy - badgeCy;
      const bDist = Math.sqrt(bdx * bdx + bdy * bdy);

      // Dark border ring around badge
      if (bDist <= 0.30 && bDist > 0.24) {
        r = 15; g = 23; b = 42;
      } else if (bDist <= 0.24) {
        // Cyan-blue badge disc: #38bdf8 (56, 189, 248) to #0284c7 (2, 132, 199)
        const discT = clamp((bdx + bdy + 0.3) / 0.6);
        r = lerp(56, 2, discT);
        g = lerp(189, 132, discT);
        b = lerp(248, 199, discT);

        // Stylized Repair Cross / Wrench Symbol in badge
        // Diagonal wrench bar
        const rotX = (bdx - bdy) * 0.7071;
        const rotY = (bdx + bdy) * 0.7071;
        if (Math.abs(rotX) <= 0.045 && Math.abs(rotY) <= 0.17) {
          r = 15; g = 23; b = 42;
        }
        // Wrench head notches
        if (Math.abs(rotY - 0.14) <= 0.05 && Math.abs(rotX) <= 0.09) {
          if (Math.abs(rotX) >= 0.035 || rotY > 0.16) {
            r = 15; g = 23; b = 42;
          }
        }
        if (Math.abs(rotY + 0.14) <= 0.05 && Math.abs(rotX) <= 0.09) {
          if (Math.abs(rotX) >= 0.035 || rotY < -0.16) {
            r = 15; g = 23; b = 42;
          }
        }
      }

      // Sparkle in top left
      const spDx = Math.abs(sx - (-0.38));
      const spDy = Math.abs(sy - (-0.56));
      if (spDx <= 0.08 && spDy <= 0.08) {
        const d4 = Math.pow(spDx, 0.7) + Math.pow(spDy, 0.7);
        if (d4 < 0.13) {
          r = 56; g = 189; b = 248;
        }
      }
    }

    return [r, g, b, a];
  };
}

console.log('Generating PWA Icons for CampusFix...');

const iconConfigs = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
  { file: 'favicon.png', size: 48, maskable: false }
];

for (const config of iconConfigs) {
  const destPath = path.join(outputDir, config.file);
  const shader = makeShader(config.maskable);
  const buffer = renderPng(config.size, config.size, shader);
  fs.writeFileSync(destPath, buffer);
  console.log(`✓ Generated ${config.file} (${config.size}x${config.size}, ${buffer.length} bytes)`);
}

console.log('All PWA icons generated successfully!');
