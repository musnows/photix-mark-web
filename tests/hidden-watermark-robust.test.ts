import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import sharp from 'sharp'
import { decodeRobustWatermark, encodeRobustWatermark } from '../app/lib/watermark/hiddenWatermarkCodec.ts'
import { detectHiddenWatermarkInRgba, embedHiddenWatermarkInRgba } from '../app/lib/watermark/hiddenWatermarkCore.ts'

const demoDirectory = new URL('../public/demo/', import.meta.url)
const marker = 'musnows / 叙界 2026'
const longestMarker = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const kernels = ['lanczos3', 'cubic', 'mks2021'] as const

async function pixels(input: string | URL | Buffer) {
  const { data, info } = await sharp(input instanceof URL ? fileURLToPath(input) : input)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: 4 as const }
}

async function exportedPhoto(file: string, text: string, width?: number) {
  const original = await sharp(fileURLToPath(new URL(file, demoDirectory)))
    .resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const raw = { width: original.info.width, height: original.info.height, channels: 4 as const }
  const marked = new Uint8Array(original.data)
  embedHiddenWatermarkInRgba(marked, raw.width, raw.height, text)
  const jpeg = await sharp(marked, { raw }).jpeg({ quality: 98, chromaSubsampling: '4:2:0' }).toBuffer()
  return { jpeg, raw, marked, original: original.data }
}

test('V2 corrects bit errors and erasures across all payload capacity boundaries', () => {
  for (const text of ['a', 'x'.repeat(16), marker, 'x'.repeat(32), 'x'.repeat(33), longestMarker, '水'.repeat(21) + 'a']) {
    const code = encodeRobustWatermark(text)
    const evidence = Float32Array.from(code, bit => bit * 2 - 1)
    assert.equal(decodeRobustWatermark(evidence), text)
    for (let index = 9; index < evidence.length; index += 23) evidence[index]! *= -1
    for (let index = 4; index < evidence.length; index += 7) evidence[index] = 0
    assert.equal(decodeRobustWatermark(evidence), text)
  }
})

test('V2 rejects invalid payloads and unverified signals', () => {
  assert.throws(() => encodeRobustWatermark(''))
  assert.throws(() => encodeRobustWatermark('水'.repeat(22)))
  assert.throws(() => encodeRobustWatermark('x'.repeat(65)))
  assert.equal(decodeRobustWatermark(new Float32Array(7)), null)
  const code = encodeRobustWatermark(marker)
  assert.equal(decodeRobustWatermark(new Float32Array(code.length)), null)
  const noise = Float32Array.from(code, (_, index) => Math.sin(index * 7927.17))
  assert.equal(decodeRobustWatermark(noise), null)
})

test('detects a V1 fixture made by the original encoder', async () => {
  const { data, width, height } = await pixels(new URL('./fixtures/hidden-watermark-v1.png', import.meta.url))
  const result = detectHiddenWatermarkInRgba(data, width, height)
  assert.equal(result?.marker, 'Photix Mark V1 / musnows')
  assert.equal(result?.version, 1)
})

test('all ten native demo layouts survive quarter-size JPEG recompression', async t => {
  // These are ten layouts of the same scene, not ten independent photographs.
  for (const file of await readdir(demoDirectory)) {
    await t.test(file, async () => {
      const { jpeg, raw } = await exportedPhoto(file, marker)
      for (const kernel of kernels) {
        for (const quality of [80, 60]) {
          const received = await sharp(jpeg)
            .resize(Math.round(raw.width / 4), Math.round(raw.height / 4), { fit: 'fill', kernel })
            .jpeg({ quality, chromaSubsampling: '4:2:0' }).toBuffer()
          const image = await pixels(received)
          assert.equal(image.width, Math.round(raw.width / 4))
          assert.equal(image.height, Math.round(raw.height / 4))
          const result = detectHiddenWatermarkInRgba(image.data, image.width, image.height)
          assert.equal(result?.marker, marker, `${file}, ${kernel}, JPEG ${quality}`)
          assert.equal(result?.version, 2)
        }
      }
    })
  }
})

test('64-byte payload survives quarter-size exports with a final short edge of at least 256 pixels', async t => {
  for (const file of await readdir(demoDirectory)) {
    await t.test(file, async () => {
      const metadata = await sharp(fileURLToPath(new URL(file, demoDirectory))).metadata()
      const exportWidth = Math.ceil(1056 * metadata.width! / metadata.height!)
      const { jpeg, raw } = await exportedPhoto(file, longestMarker, exportWidth)
      for (const kernel of kernels) {
        const received = await sharp(jpeg)
          .resize(Math.round(raw.width / 4), Math.round(raw.height / 4), { fit: 'fill', kernel })
          .jpeg({ quality: 60, chromaSubsampling: '4:2:0' }).toBuffer()
        const image = await pixels(received)
        assert.ok(Math.min(image.width, image.height) >= 256)
        assert.equal(detectHiddenWatermarkInRgba(image.data, image.width, image.height)?.marker, longestMarker, `${file}, ${kernel}`)
      }
    })
  }
})

test('non-integer resizing, portrait images and multiple JPEG generations remain readable', async () => {
  const { jpeg, raw } = await exportedPhoto('4_标准水印.JPG', marker, 2048)
  for (const scale of [1, 1.75, 2, 3.3, 4]) {
    const first = await sharp(jpeg).resize(Math.round(raw.width / scale), Math.round(raw.height / scale), { fit: 'fill' })
      .jpeg({ quality: 75 }).toBuffer()
    const second = await sharp(first).jpeg({ quality: 60 }).toBuffer()
    const image = await pixels(second)
    assert.equal(detectHiddenWatermarkInRgba(image.data, image.width, image.height)?.marker, marker, `scale ${scale}`)
  }
  // Rotate before embedding: detection need not know the original orientation.
  const portrait = await sharp(jpeg).rotate(90).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const portraitRaw = { width: portrait.info.width, height: portrait.info.height, channels: 4 as const }
  embedHiddenWatermarkInRgba(portrait.data, portraitRaw.width, portraitRaw.height, 'portrait / 竖图')
  const resized = await sharp(portrait.data, { raw: portraitRaw })
    .resize(Math.round(portraitRaw.width / 4), Math.round(portraitRaw.height / 4), { fit: 'fill' })
    .jpeg({ quality: 60 }).toBuffer()
  const image = await pixels(resized)
  assert.equal(detectHiddenWatermarkInRgba(image.data, image.width, image.height)?.marker, 'portrait / 竖图')
})

test('independent synthetic textures survive quarter-size JPEG at square and portrait boundaries', async () => {
  for (const [width, height, seed] of [[2048, 1365, 1], [1365, 2048, 17], [1024, 1024, 83]] as const) {
    const data = new Uint8Array(width * height * 4)
    let state: number = seed
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        const offset = (y * width + x) * 4
        data[offset] = 80 + Math.round(50 * Math.sin(x / 37) + 25 * Math.cos(y / 23) + state % 19)
        data[offset + 1] = 120 + Math.round(45 * Math.sin((x + y) / 71) + state % 11)
        data[offset + 2] = 90 + Math.round(30 * Math.cos((x - y) / 43) + state % 17)
        data[offset + 3] = 255
      }
    }
    embedHiddenWatermarkInRgba(data, width, height, longestMarker)
    const exported = await sharp(data, { raw: { width, height, channels: 4 } }).jpeg({ quality: 98 }).toBuffer()
    const received = await sharp(exported).resize(Math.round(width / 4), Math.round(height / 4), { fit: 'fill' })
      .jpeg({ quality: 60 }).toBuffer()
    const image = await pixels(received)
    assert.equal(detectHiddenWatermarkInRgba(image.data, image.width, image.height)?.marker, longestMarker)
  }
})

test('V2 limits pixel changes, preserves alpha and retains legacy unscaled crop detection', async () => {
  const { raw, marked, original } = await exportedPhoto('4_标准水印.JPG', marker, 1600)
  let squared = 0
  let peak = 0
  for (let index = 0; index < marked.length; index++) {
    if ((index & 3) === 3) {
      assert.equal(marked[index], original[index])
      continue
    }
    const difference = Math.abs(marked[index]! - original[index]!)
    squared += difference * difference
    peak = Math.max(peak, difference)
  }
  const psnr = 10 * Math.log10(255 ** 2 / (squared / (raw.width * raw.height * 3)))
  assert.ok(peak <= 20, `Peak RGB change: ${peak}`)
  assert.ok(psnr >= 38, `PSNR: ${psnr}`)
  const cropped = await sharp(marked, { raw }).extract({ left: 113, top: 77, width: 640, height: 480 })
    .raw().toBuffer()
  const result = detectHiddenWatermarkInRgba(cropped, 640, 480)
  assert.equal(result?.marker, marker)
  assert.equal(result?.version, 1)
})

test('clean photos, compressed photos and flat images do not produce a marker', async () => {
  for (const file of ['4_标准水印.JPG', '7_居中样式2.JPG', '10_个性文字.jpg']) {
    const jpeg = await sharp(fileURLToPath(new URL(file, demoDirectory))).resize(360).jpeg({ quality: 60 }).toBuffer()
    const image = await pixels(jpeg)
    assert.equal(detectHiddenWatermarkInRgba(image.data, image.width, image.height), null)
  }
  for (const value of [0, 127, 255]) {
    const data = new Uint8Array(256 * 256 * 4).fill(value)
    for (let index = 3; index < data.length; index += 4) data[index] = 255
    assert.equal(detectHiddenWatermarkInRgba(data, 256, 256), null)
  }
})
