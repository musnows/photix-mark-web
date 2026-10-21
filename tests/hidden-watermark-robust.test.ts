import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import sharp from 'sharp'
import { decodeRobustWatermark, encodeRobustWatermark } from '../app/lib/watermark/hiddenWatermarkCodec.ts'
import { detectHiddenWatermarkInRgba, embedHiddenWatermarkInRgba } from '../app/lib/watermark/hiddenWatermarkCore.ts'
import { embedRobustWatermark } from '../app/lib/watermark/hiddenWatermarkRobust.ts'

const demoDirectory = new URL('../public/demo/', import.meta.url)
const marker = 'musnows / 叙界 2026'
const longestMarker = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const kernels = ['lanczos3', 'cubic', 'mks2021'] as const

async function pixels(input: string | URL | Buffer) {
  const { data, info } = await sharp(input instanceof URL ? fileURLToPath(input) : input)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: 4 as const }
}

async function exportedPhoto(file: string, text: string, width?: number, embed = embedRobustWatermark) {
  const original = await sharp(fileURLToPath(new URL(file, demoDirectory)))
    .resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const raw = { width: original.info.width, height: original.info.height, channels: 4 as const }
  const marked = new Uint8Array(original.data)
  embed(marked, raw.width, raw.height, text)
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

test('legacy V2 detection retains quarter-size JPEG support for all ten demo layouts', async t => {
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

test('legacy V2 detection retains 64-byte quarter-size JPEG support', async t => {
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

test('legacy V2 non-integer resizing, portrait images and multiple JPEG generations remain readable', async () => {
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
  embedRobustWatermark(portrait.data, portraitRaw.width, portraitRaw.height, 'portrait / 竖图')
  const resized = await sharp(portrait.data, { raw: portraitRaw })
    .resize(Math.round(portraitRaw.width / 4), Math.round(portraitRaw.height / 4), { fit: 'fill' })
    .jpeg({ quality: 60 }).toBuffer()
  const image = await pixels(resized)
  assert.equal(detectHiddenWatermarkInRgba(image.data, image.width, image.height)?.marker, 'portrait / 竖图')
})

test('legacy V2 synthetic textures remain readable after quarter-size JPEG compression', async () => {
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
    embedRobustWatermark(data, width, height, longestMarker)
    const exported = await sharp(data, { raw: { width, height, channels: 4 } }).jpeg({ quality: 98 }).toBuffer()
    const received = await sharp(exported).resize(Math.round(width / 4), Math.round(height / 4), { fit: 'fill' })
      .jpeg({ quality: 60 }).toBuffer()
    const image = await pixels(received)
    assert.equal(detectHiddenWatermarkInRgba(image.data, image.width, image.height)?.marker, longestMarker)
  }
})

test('V3 limits pixel changes to one level, preserves alpha and supports an unscaled crop', async () => {
  const { raw, marked, original } = await exportedPhoto('4_标准水印.JPG', marker, 1600, embedHiddenWatermarkInRgba)
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
  assert.ok(peak <= 1, `Peak RGB change: ${peak}`)
  assert.ok(psnr >= 48, `PSNR: ${psnr}`)
  const cropped = await sharp(marked, { raw }).extract({ left: 113, top: 77, width: 640, height: 480 })
    .raw().toBuffer()
  const result = detectHiddenWatermarkInRgba(cropped, 640, 480)
  assert.equal(result?.marker, marker)
  assert.equal(result?.version, 3)
})

test('V3 reads short, multilingual and 64-byte identifiers from original-size JPEG exports', async t => {
  for (const file of await readdir(demoDirectory)) {
    await t.test(file, async () => {
      for (const text of ['Photix Mark', marker, longestMarker]) {
        const { jpeg, raw, marked } = await exportedPhoto(file, text, undefined, embedHiddenWatermarkInRgba)
        const lossless = detectHiddenWatermarkInRgba(marked, raw.width, raw.height)
        assert.equal(lossless?.marker, text, `${file}, original pixels`)
        assert.equal(lossless?.version, 3)
        const image = await pixels(jpeg)
        const result = detectHiddenWatermarkInRgba(image.data, image.width, image.height)
        assert.equal(result?.marker, text, `${file}, JPEG 98`)
        assert.equal(result?.version, 3)
      }
    })
  }
})

test('V3 preserves smooth skies, neutral gradients, clipped borders and alpha within one RGB level', () => {
  for (const [width, height] of [[1024, 768], [768, 1024]]) {
    const data = new Uint8ClampedArray(width! * height! * 4)
    for (let y = 0; y < height!; y++) {
      for (let x = 0; x < width!; x++) {
        const offset = (y * width! + x) * 4
        const value = Math.round(255 * x / (width! - 1))
        data[offset] = value
        data[offset + 1] = y < height! / 2 ? Math.min(255, value + 20) : value
        data[offset + 2] = y < height! / 2 ? Math.min(255, value + 80) : value
        data[offset + 3] = (x + y) % 256
      }
    }
    const original = new Uint8ClampedArray(data)
    embedHiddenWatermarkInRgba(data, width!, height!, longestMarker)
    let squared = 0
    for (let index = 0; index < data.length; index++) {
      const difference = data[index]! - original[index]!
      assert.ok(Math.abs(difference) <= ((index & 3) === 3 ? 0 : 1), `Pixel change at ${index}: ${difference}`)
      squared += difference * difference
    }
    const psnr = 10 * Math.log10(255 ** 2 / (squared / (width! * height! * 3)))
    assert.ok(psnr >= 48, `PSNR: ${psnr}`)
    // A full carrier tile spans 224 pixels. Large-area brightness must stay
    // neutral instead of forming the low-frequency patches seen in V2.
    for (let top = 0; top + 32 <= height!; top += 32) {
      for (let left = 0; left + 32 <= width!; left += 32) {
        let shift = 0
        for (let y = top; y < top + 32; y++) {
          for (let x = left; x < left + 32; x++) {
            const offset = (y * width! + x) * 4
            shift += data[offset]! - original[offset]!
          }
        }
        assert.ok(Math.abs(shift / 1024) <= 0.1, `Patch brightness shift: ${shift / 1024}`)
      }
    }
    assert.equal(detectHiddenWatermarkInRgba(data, width!, height!)?.marker, longestMarker)
  }
})

test('a new V3 identifier takes precedence when the source already contains V2', async () => {
  const { marked, raw } = await exportedPhoto('4_标准水印.JPG', 'previous V2 identifier', 1600)
  embedHiddenWatermarkInRgba(marked, raw.width, raw.height, marker)
  const result = detectHiddenWatermarkInRgba(marked, raw.width, raw.height)
  assert.equal(result?.marker, marker)
  assert.equal(result?.version, 3)
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
