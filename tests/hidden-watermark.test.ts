import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectHiddenWatermarkInRgba,
  embedHiddenWatermarkInRgba,
  HIDDEN_WATERMARK_MAX_BYTES
} from '../app/lib/watermark/hiddenWatermarkCore.ts'

function createPhoto(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      data[offset] = Math.round(78 + 92 * x / width + 18 * Math.sin(y / 17))
      data[offset + 1] = Math.round(88 + 74 * y / height + 14 * Math.sin((x + y) / 11))
      data[offset + 2] = Math.round(104 + 42 * Math.cos((x - y) / 37))
      data[offset + 3] = 255
    }
  }
  return data
}

function crop(data: Uint8ClampedArray, width: number, x0: number, y0: number, cropWidth: number, cropHeight: number) {
  const result = new Uint8ClampedArray(cropWidth * cropHeight * 4)
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < cropWidth; x++) {
      const source = ((y + y0) * width + x + x0) * 4
      const target = (y * cropWidth + x) * 4
      result[target] = data[source]
      result[target + 1] = data[source + 1]
      result[target + 2] = data[source + 2]
      result[target + 3] = 255
    }
  }
  return result
}

test('hidden watermark survives full image and an unaligned crop', () => {
  const width = 640
  const height = 480
  const data = createPhoto(width, height)
  const marker = 'musnows / 叙界 2026'

  embedHiddenWatermarkInRgba(data, width, height, marker)

  const full = detectHiddenWatermarkInRgba(data, width, height)
  assert.equal(full?.marker, marker)
  assert.equal(full?.version, 3)
  assert.ok((full?.confidence || 0) > 0.5)

  const cropped = crop(data, width, 113, 77, 360, 300)
  const cropResult = detectHiddenWatermarkInRgba(cropped, 360, 300)
  assert.equal(cropResult?.marker, marker)
  assert.ok((cropResult?.confidence || 0) > 0.25)

  const smallCrop = crop(data, width, 151, 103, 240, 240)
  assert.equal(detectHiddenWatermarkInRgba(smallCrop, 240, 240)?.marker, marker)
})

test('hidden watermark is not reported for a clean image', () => {
  const width = 480
  const height = 360
  const data = createPhoto(width, height)
  assert.equal(detectHiddenWatermarkInRgba(data, width, height), null)
})

test('damaged quality-first watermarks never return an unverified identifier', () => {
  const width = 600
  const height = 440
  const data = createPhoto(width, height)
  embedHiddenWatermarkInRgba(data, width, height, 'noise-test-42')
  assert.equal(detectHiddenWatermarkInRgba(data, width, height)?.marker, 'noise-test-42')

  let state = 0x12345678
  for (let i = 0; i < data.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const noise = (state % 5) - 2
    data[i] = Math.max(0, Math.min(255, data[i] + noise))
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
  }

  const cropped = crop(data, width, 91, 67, 410, 320)
  const result = detectHiddenWatermarkInRgba(cropped, 410, 320)
  assert.ok(result === null || result.marker === 'noise-test-42')
})

test('hidden watermark validates marker length', () => {
  const width = 64
  const height = 64
  const data = createPhoto(width, height)
  assert.throws(() => embedHiddenWatermarkInRgba(data, width, height, ''))
  assert.throws(() => embedHiddenWatermarkInRgba(data, width, height, 'x'.repeat(HIDDEN_WATERMARK_MAX_BYTES + 1)))
})

test('hidden watermark changes pixels only slightly', () => {
  const width = 320
  const height = 240
  const original = createPhoto(width, height)
  const embedded = new Uint8ClampedArray(original)
  embedHiddenWatermarkInRgba(embedded, width, height, 'quality-check')

  let maxDifference = 0
  for (let i = 0; i < original.length; i++) {
    if ((i & 3) === 3) continue
    maxDifference = Math.max(maxDifference, Math.abs(original[i] - embedded[i]))
  }
  assert.ok(maxDifference <= 1, `unexpected pixel change: ${maxDifference}`)
})
