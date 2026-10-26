import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'branding/yingqian-logo.png')
const icons = [
  ['yingqian-logo.png', 512],
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512]
]
for (const [filename, size] of icons) {
  await sharp(source).resize(size, size).ensureAlpha().png({ palette: true }).toFile(path.join(root, 'public', filename))
}
const logo = await readFile(path.join(root, 'public/yingqian-logo.png'))
await writeFile(path.join(root, 'public/logo.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>映签</title><image width="512" height="512" href="data:image/png;base64,${logo.toString('base64')}"/></svg>\n`)

const frames = await Promise.all([16, 32].map(size => readFile(path.join(root, 'public', `favicon-${size}x${size}.png`))))
const header = Buffer.alloc(6 + frames.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)
let offset = header.length
frames.forEach((frame, index) => {
  const entry = 6 + index * 16
  const size = index === 0 ? 16 : 32
  header[entry] = size
  header[entry + 1] = size
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
})
await writeFile(path.join(root, 'public/favicon.ico'), Buffer.concat([header, ...frames]))

const previewLogo = await sharp(source).resize(420, 420).png().toBuffer()
const text = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><text x="550" y="280" font-family="PingFang SC, sans-serif" font-size="88" font-weight="600" fill="#24241f">映签</text><text x="552" y="348" font-family="PingFang SC, sans-serif" font-size="28" fill="#977126">为摄影作品，留下你的印记</text><text x="554" y="405" font-family="Menlo, monospace" font-size="19" letter-spacing="4" fill="#8b8980">YINGQIAN</text></svg>')
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#fdf9ef' } })
  .composite([{ input: previewLogo, left: 70, top: 105 }, { input: text }])
  .jpeg({ quality: 92 }).toFile(path.join(root, 'public/og-image.jpg'))
console.log('Yingqian brand assets generated from the supplied logo')
