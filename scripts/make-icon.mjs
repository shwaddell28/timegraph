/**
 * Rasterise the app icon to PNG without a native SVG toolchain.
 *
 * The icon is four analytic shapes, so signed-distance functions plus
 * supersampling give clean antialiased edges in a few lines and keep the
 * project free of an image dependency it would otherwise need only here.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SIZE = 512
const SS = 4 // samples per axis

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const BG = hex('#1a1a19')
const BLUE = hex('#3987e5')
const INK = hex('#fcfcfb')

const sdRoundRect = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const sdRing = (px, py, cx, cy, r, halfWidth) => Math.abs(Math.hypot(px - cx, py - cy) - r) - halfWidth
const sdDisc = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r
const sdCapsule = (px, py, ax, ay, bx, by, r) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - dx * t, py - ay - dy * t) - r
}

const rgb = new Uint8Array(SIZE * SIZE * 3)

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0
    let g = 0
    let b = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS
        const py = y + (sy + 0.5) / SS
        // Start on the page plane so the rounded corners fade into it.
        let c = [13, 13, 12]
        const paint = (d, color) => {
          const a = Math.max(0, Math.min(1, 0.5 - d))
          if (a > 0) c = c.map((v, i) => v * (1 - a) + color[i] * a)
        }
        paint(sdRoundRect(px, py, 256, 256, 256, 256, 112), BG)
        paint(sdRing(px, py, 256, 256, 170, 10), BLUE)
        paint(sdCapsule(px, py, 256, 132, 256, 256, 11), INK)
        paint(sdCapsule(px, py, 256, 256, 342, 308, 11), INK)
        paint(sdDisc(px, py, 256, 256, 18), BLUE)
        r += c[0]
        g += c[1]
        b += c[2]
      }
    }
    const n = SS * SS
    const i = (y * SIZE + x) * 3
    rgb[i] = Math.round(r / n)
    rgb[i + 1] = Math.round(g / n)
    rgb[i + 2] = Math.round(b / n)
  }
}

// --- minimal PNG container ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // truecolour
// Each scanline is prefixed with its filter type; 0 means none.
const stride = SIZE * 3
const raw = Buffer.alloc(SIZE * (stride + 1))
const pixels = Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength)
for (let y = 0; y < SIZE; y++) {
  raw[y * (stride + 1)] = 0
  pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(new URL('../public/icon.png', import.meta.url), png)
console.log(`wrote public/icon.png (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} kB)`)
