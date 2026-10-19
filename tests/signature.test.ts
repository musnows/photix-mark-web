import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SIGNATURE, clampSignatureOpacity, clampSignatureWidth, draggedSignatureWidth, fitSignature, getDefaultSignatureAnchor, hasSignature, setSignatureWidth, signatureBounds } from '../app/lib/editor/signature.ts'

test('signature availability requires both visible content and an enabled setting', () => {
  assert.equal(hasSignature({}), false)
  assert.equal(hasSignature({ signature: { ...DEFAULT_SIGNATURE } }), false)
  assert.equal(hasSignature({ signature: { ...DEFAULT_SIGNATURE, dataUrl: 'data:image/png;base64,example' } }), true)
  assert.equal(hasSignature({ signature: { ...DEFAULT_SIGNATURE, dataUrl: 'example', enabled: false } }), false)
})

test('dragged signatures remain within landscape, portrait, and square exports at every edge', () => {
  for (const [width, height] of [[1600, 900], [900, 1600], [1000, 1000]]) {
    for (const aspectRatio of [0.2, 1, 5]) {
      for (const [x, y] of [[-1, -1], [0.4, 0.5], [2, 2]]) {
        const box = signatureBounds({ ...DEFAULT_SIGNATURE, x, y, width: 0.75, aspectRatio }, width, height)
        assert.ok(box.x >= 0 && box.y >= 0)
        assert.ok(box.x + box.width <= width + 0.001)
        assert.ok(box.y + box.height <= height + 0.001)
        assert.ok(Math.abs(box.width / box.height - aspectRatio) < 0.00001)
      }
    }
  }
})

test('normalized placement scales identically between preview and full size export', () => {
  const options = { ...DEFAULT_SIGNATURE, x: 0.27, y: 0.42, aspectRatio: 4.5, width: 0.28 }
  const preview = signatureBounds(options, 400, 600)
  const exported = signatureBounds(options, 4000, 6000)
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    assert.ok(Math.abs(exported[key] - preview[key] * 10) < 0.0001)
  }
})

test('default layout fits extreme PNG proportions without stretching the signature', () => {
  const tall = fitSignature(120, 30, 0.2, 100)
  assert.deepEqual(tall, { width: 6, height: 30 })
  const wide = fitSignature(120, 30, 10, 300)
  assert.deepEqual(wide, { width: 120, height: 12 })
})

test('manual sizing escapes the template slot and preserves the signature asset and appearance', () => {
  const original = { ...DEFAULT_SIGNATURE, dataUrl: 'data:image/png;base64,example', name: 'My signature', mask: 'custom' as const, color: '#123456', aspectRatio: 4 }
  const resized = setSignatureWidth(original, 0.5)
  assert.equal(resized.position, 'custom')
  assert.equal(resized.width, 0.5)
  assert.deepEqual({ ...resized, position: original.position, width: original.width }, original)
  const box = signatureBounds(resized, 2000, 1200)
  assert.equal(box.width, 1000)
  assert.equal(box.height, 250)
  assert.equal(original.width, DEFAULT_SIGNATURE.width)
})

test('size controls cover one to one hundred percent and safely clamp invalid input', () => {
  assert.equal(clampSignatureWidth(-1), 0.01)
  assert.equal(clampSignatureWidth(0), 0.01)
  assert.equal(clampSignatureWidth(3), 1)
  assert.equal(clampSignatureWidth(Number.NaN), DEFAULT_SIGNATURE.width)
  for (const percent of [1, 10, 25, 50, 75, 100]) {
    const box = signatureBounds(setSignatureWidth({ ...DEFAULT_SIGNATURE, aspectRatio: 5 }, percent / 100), 2000, 1200)
    assert.equal(box.width, percent * 20)
    assert.equal(box.width / box.height, 5)
  }
})

test('horizontal and vertical resize gestures resize equally and respect image boundaries', () => {
  const options = { ...DEFAULT_SIGNATURE, position: 'custom' as const, width: 0.2, x: 0.1, y: 0.1, aspectRatio: 4 }
  assert.ok(Math.abs(draggedSignatureWidth(options, 100, 0, 1000, 600) - 0.3) < 0.00001)
  assert.ok(Math.abs(draggedSignatureWidth(options, 0, 25, 1000, 600) - 0.3) < 0.00001)
  assert.equal(draggedSignatureWidth(options, -1000, 0, 1000, 600), 0.01)
  assert.equal(draggedSignatureWidth(options, 10000, 10000, 1000, 600), 0.9)
})

test('camera-row templates default beside the camera while footer and sidebar templates default beside parameters', () => {
  assert.equal(getDefaultSignatureAnchor([{ processor_name: 'rich_text', auto_camera: true }, { processor_name: 'rich_text' }]), 'camera')
  assert.equal(getDefaultSignatureAnchor([{ processor_name: 'multi_rich_text' }, { processor_name: 'rich_text' }]), 'camera')
  assert.equal(getDefaultSignatureAnchor([{ processor_name: 'watermark' }]), 'params')
  assert.equal(getDefaultSignatureAnchor({ landscape: [{ processor_name: 'flex_layout' }], portrait: [{ processor_name: 'flex_layout' }] }), 'params')
  assert.equal(getDefaultSignatureAnchor([]), 'params')
})

test('manual resizing preserves an explicitly selected anchor without imposing one on new signatures', () => {
  assert.equal(DEFAULT_SIGNATURE.anchor, undefined)
  assert.equal(setSignatureWidth({ ...DEFAULT_SIGNATURE, anchor: 'camera' }, 0.4).anchor, 'camera')
  assert.equal(setSignatureWidth({ ...DEFAULT_SIGNATURE, anchor: 'params' }, 0.4).anchor, 'params')
})

test('opacity supports fully transparent signatures and defaults older configurations to the original appearance', () => {
  assert.equal(DEFAULT_SIGNATURE.opacity, 1)
  assert.equal(clampSignatureOpacity(undefined), 1)
  assert.equal(clampSignatureOpacity(Number.NaN), 1)
  assert.equal(clampSignatureOpacity(0), 0)
  assert.equal(clampSignatureOpacity(0.37), 0.37)
  assert.equal(clampSignatureOpacity(-1), 0)
  assert.equal(clampSignatureOpacity(2), 1)
  const resized = setSignatureWidth({ ...DEFAULT_SIGNATURE, anchor: 'camera', opacity: 0.35 }, 0.5)
  assert.equal(resized.opacity, 0.35)
  assert.equal(resized.anchor, 'camera')
})
