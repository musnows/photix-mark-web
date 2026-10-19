import { DEFAULT_SIGNATURE, signatureBounds } from '../app/lib/editor/signature'
import { drawSignature, prepareSignature, readSignaturePng, signatureColor, signatureImage } from '../app/utils/signature'
import { useImageProcessor } from '../app/composables/useImageProcessor'
import { initProcessors } from '../app/lib/processors'
import * as templates from '../app/lib/templates'
import type { TemplateConfig } from '../app/lib/templates/types'

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

function solidCanvas(width: number, height: number, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  return canvas
}

async function canvasFile(canvas: HTMLCanvasElement, name = 'signature.png') {
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'))
  return new File([blob], name, { type: 'image/png' })
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
  return [...canvas.getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data]
}

function magentaBounds(canvas: HTMLCanvasElement) {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  let count = 0
  let left = canvas.width
  let right = 0
  let top = canvas.height
  let bottom = 0
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (data[i] > 230 && data[i + 1] < 30 && data[i + 2] > 230) {
        count++
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
  }
  return { count, left, right, top, bottom }
}

export async function runSignatureBrowserTests(onResult: (text: string, canvas?: HTMLCanvasElement) => void) {
  const padded = solidCanvas(100, 40, 'transparent')
  const pctx = padded.getContext('2d')!
  pctx.fillStyle = 'rgba(255,255,255,0.5)'
  pctx.fillRect(10, 10, 80, 20)
  const asset = await readSignaturePng(await canvasFile(padded, 'My Signature.PNG'))
  const cropped = await signatureImage(asset.dataUrl)
  assert(cropped.width === 80 && cropped.height === 20, 'Transparent padding must be removed')
  assert(asset.name === 'My Signature', 'PNG filename must initialize the editable asset name')
  const black = await signatureImage(asset.dataUrl, '#000000')
  const blackPixel = pixel(black, 20, 10)
  assert(blackPixel[0] === 0 && blackPixel[3] >= 127 && blackPixel[3] <= 128, 'Masking must preserve stroke alpha')
  const white = await signatureImage(asset.dataUrl, '#FFFFFF')
  assert(pixel(white, 20, 10)[0] === 255, 'White masking must fill visible pixels')
  assert(signatureColor(DEFAULT_SIGNATURE, '#FFFFFF') === '#000000', 'Light templates require black signatures')
  assert(signatureColor(DEFAULT_SIGNATURE, '#121212') === '#FFFFFF', 'Dark templates require white signatures')
  assert(signatureColor(DEFAULT_SIGNATURE, '#FFFFFF', true) === '#FFFFFF', 'Photo overlays require the light template foreground')
  assert(signatureColor({ ...DEFAULT_SIGNATURE, mask: 'original' }) === null, 'Original colors must bypass masking')
  for (const invalid of [new File(['invalid'], 'fake.png', { type: 'image/png' }), await canvasFile(solidCanvas(10, 10, 'transparent'))]) {
    let rejected = false
    try { await readSignaturePng(invalid) } catch { rejected = true }
    assert(rejected, 'Invalid and fully transparent PNGs must be rejected')
  }
  onResult('PASS: PNG validation, crop, asset name, alpha preservation and automatic black/white masking')

  for (const mask of ['auto', 'original', 'custom'] as const) {
    for (const opacity of [0, 0.25, 0.5, 1]) {
      const runtime = await prepareSignature({ signature: { ...DEFAULT_SIGNATURE, ...asset, mask, color: '#FF00FF', opacity } })
      assert(runtime, 'Opacity checks require a prepared signature')
      const target = solidCanvas(100, 40, 'transparent')
      const targetCtx = target.getContext('2d')!
      targetCtx.globalAlpha = 0.8
      drawSignature(targetCtx, runtime, 10, 10, 80, 20)
      assert(Math.abs(pixel(target, 20, 20)[3] - pixel(cropped, 10, 10)[3] * opacity * 0.8) <= 1, `${mask}: opacity must multiply the PNG alpha exactly once`)
      assert(Math.abs(targetCtx.globalAlpha - 0.8) < 0.00001, 'Signature rendering must restore the previous canvas alpha')
      targetCtx.fillStyle = '#FF0000'
      targetCtx.fillRect(0, 0, 5, 5)
      assert(Math.abs(pixel(target, 2, 2)[3] - 204) <= 1, 'Signature opacity must not affect subsequent layers')
      assert(pixel(target, 99, 39)[3] === 0, 'Transparent pixels outside the signature must stay transparent')
    }
  }
  onResult('PASS: 0/25/50/100 percent opacity, all mask modes, original alpha multiplication and canvas state restoration')

  initProcessors()
  const { processImage } = useImageProcessor()
  const mark = solidCanvas(80, 20, '#FFFFFF')
  const signature = { ...DEFAULT_SIGNATURE, dataUrl: mark.toDataURL(), aspectRatio: 4, mask: 'custom' as const, color: '#FF00FF' }
  const exif = { Make: 'NIKON', Model: 'NIKON Z 6_2', LensModel: 'NIKKOR Z 24-70mm f/4 S', FocalLength: 50, FNumber: 4, ExposureTime: 0.008, ISO: 100, DateTimeOriginal: '2026:10:20 08:30:00' }
  const processorErrors: unknown[][] = []
  const originalError = console.error
  console.error = (...args) => {
    if (String(args[0]).startsWith('Error in processor')) processorErrors.push(args)
    originalError(...args)
  }
  try {
    for (const [width, height] of [[640, 420], [420, 640], [500, 500]]) {
      const file = await canvasFile(solidCanvas(width, height, '#557788'), 'photo.png')
      const defaults = new Map<string, HTMLCanvasElement>()
      for (const template of Object.values(templates) as TemplateConfig[]) {
        if (!template?.id) continue
        const result = await processImage(file, template.processors, { signature }, exif)
        defaults.set(template.id, result)
        const found = magentaBounds(result)
        assert(found.count > 4, `${template.id} ${width}x${height}: signature must be visible`)
        assert(found.top > result.height * 0.55, `${template.id}: default signature must stay in the metadata area`)
        assert(found.left >= 0 && found.right < result.width && found.bottom < result.height, `${template.id}: signature must stay inside the output`)
        const hidden = await processImage(file, template.processors, { signature: { ...signature, opacity: 0 } }, exif)
        const halfway = await processImage(file, template.processors, { signature: { ...signature, opacity: 0.5 } }, exif)
        assert(hidden.width === result.width && hidden.height === result.height && halfway.width === result.width && halfway.height === result.height, `${template.id}: opacity must preserve the layout dimensions`)
        assert(magentaBounds(hidden).count === 0, `${template.id}: zero opacity must hide the signature`)
        const sampleX = Math.floor((found.left + found.right) / 2)
        const sampleY = Math.floor((found.top + found.bottom) / 2)
        const foreground = pixel(result, sampleX, sampleY)
        const background = pixel(hidden, sampleX, sampleY)
        const blended = pixel(halfway, sampleX, sampleY)
        for (let channel = 0; channel < 3; channel++) {
          assert(Math.abs(blended[channel] - (foreground[channel] + background[channel]) / 2) <= 2, `${template.id}: half opacity must blend the signature with its existing background`)
        }
        onResult(`PASS: ${template.id} ${width}x${height}`, result)
      }

      for (const template of [templates.blurBackground, templates.nikonBlur, templates.standard1, templates.standard2, templates.centeredWatermark, templates.centeredWatermark2, templates.sidebarWatermark]) {
        const camera = await processImage(file, template.processors, { signature: { ...signature, anchor: 'camera' } }, exif)
        const params = await processImage(file, template.processors, { signature: { ...signature, anchor: 'params' } }, exif)
        const cameraBox = magentaBounds(camera)
        const paramsBox = magentaBounds(params)
        const defaultBox = magentaBounds(defaults.get(template.id)!)
        assert(cameraBox.count > 4 && paramsBox.count > 4, `${template.id}: both anchors must render the signature`)
        assert(camera.width === params.width && camera.height === params.height, `${template.id}: anchor changes must preserve output dimensions`)
        if (template.id === 'blurBackground' || template.id === 'nikonBlur') {
          assert(cameraBox.top < paramsBox.top, `${template.id}: camera anchor must use the upper camera row`)
          assert(cameraBox.bottom - cameraBox.top > (paramsBox.bottom - paramsBox.top) * 1.15, `${template.id}: camera-row signatures must be visibly larger than parameter-row signatures`)
          assert(JSON.stringify(defaultBox) === JSON.stringify(cameraBox), `${template.id}: the default must resolve to the camera anchor`)
        } else if (template.id === 'standard1' || template.id === 'standard2') {
          assert(cameraBox.left < paramsBox.left && cameraBox.left < camera.width * 0.4, `${template.id}: camera anchor must use the left information group`)
          assert(JSON.stringify(defaultBox) === JSON.stringify(paramsBox), `${template.id}: the parameter anchor must preserve the previous default signature placement`)
        } else if (template.id === 'sidebarWatermark') {
          assert(cameraBox.top > paramsBox.top, 'Sidebar camera anchor must move closer to the camera name')
        } else {
          assert(cameraBox.top < paramsBox.top, `${template.id}: the selected row must control signature placement`)
        }
        const decoded = await signatureImage(camera.toDataURL('image/png'))
        assert(magentaBounds(decoded).left === cameraBox.left && magentaBounds(decoded).top === cameraBox.top, `${template.id}: encoded exports must preserve the selected anchor`)
      }
      onResult(`PASS: ${width}x${height} camera/parameter anchors, template defaults, larger camera row and encoded exports`)

      const custom = { ...signature, position: 'custom' as const, x: 0.23, y: 0.36, width: 0.25 }
      const template = templates.standard1
      const base = await processImage(file, template.processors, {}, exif)
      const preview = await processImage(file, template.processors, { signature: custom, _signaturePreview: true }, exif)
      assert(base.toDataURL() === preview.toDataURL(), 'Interactive preview must not contain a second baked signature')
      const exported = await processImage(file, template.processors, { signature: custom }, exif)
      const bounds = signatureBounds(custom, exported.width, exported.height)
      const found = magentaBounds(exported)
      assert(Math.abs(found.left - bounds.x) < 2 && Math.abs(found.top - bounds.y) < 2, 'Export placement must match normalized preview coordinates')
      const decoded = await signatureImage(exported.toDataURL('image/png'))
      assert(magentaBounds(decoded).count === found.count, 'Encoded export must preserve the visible signature')
      const disabled = await processImage(file, template.processors, { signature: { ...custom, enabled: false } }, exif)
      assert(base.toDataURL() === disabled.toDataURL(), 'Disabling a signature must restore the original template output')
      const hiddenCustom = await processImage(file, template.processors, { signature: { ...custom, opacity: 0 } }, exif)
      assert(base.toDataURL() === hiddenCustom.toDataURL(), 'A fully transparent custom signature must preserve the base image')
      const halfCustom = await processImage(file, template.processors, { signature: { ...custom, opacity: 0.5 } }, exif)
      const customX = Math.floor(bounds.x + bounds.width / 2)
      const customY = Math.floor(bounds.y + bounds.height / 2)
      for (let channel = 0; channel < 3; channel++) {
        assert(Math.abs(pixel(halfCustom, customX, customY)[channel] - (pixel(base, customX, customY)[channel] + pixel(exported, customX, customY)[channel]) / 2) <= 2, 'Custom exports must use the same opacity as the interactive overlay')
      }
      const original = await prepareSignature({ signature: { ...custom, mask: 'original' } })
      assert(original && pixel(original.image, 10, 10)[0] === 255, 'Original PNG colors must survive preparation')
      onResult(`PASS: ${width}x${height} preview/export parity, encoded export, original color and disabled state`)
    }
    assert(processorErrors.length === 0, `Processor pipeline errors: ${processorErrors.map(args => args.join(' ')).join('; ')}`)
  } finally {
    console.error = originalError
  }
  return 'PASS: all signature browser checks'
}
