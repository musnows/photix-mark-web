import { blurBackground } from '../app/utils/blurBackground'
import { BlurProcessor } from '../app/lib/processors/blur'
import { nikonBlur } from '../app/lib/templates/nikonBlur'
import { blurBackground as otherTemplate } from '../app/lib/templates/blurBackground'
import { getTemplateDefaultConfig } from '../app/lib/templates/userOptions'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
  return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data]
}

export function runNikonTemplateTests() {
  const defaults = getTemplateDefaultConfig(nikonBlur)
  assert(defaults.nikonZColor === '#FFFFFF', 'Nikon Z must default to white')
  assert(defaults.vignetteEnabled && defaults.vignetteStrength === 0.3, 'Vignette defaults must match the controls')
  assert(otherTemplate.userOptions.blur?.vignetteStrength === undefined, 'Other templates must not opt into vignette rendering')

  for (const [width, height] of [[240, 160], [160, 240], [200, 200]]) {
    const source = solidCanvas(width, height, 'rgb(200,200,200)')
    const off = blurBackground(source, width, height, 12, 0)
    const medium = blurBackground(source, width, height, 12, 0.5)
    const strong = blurBackground(source, width, height, 12, 1)
    assert(pixel(off, 0, 0).join() === '200,200,200,255', 'Disabled vignette must leave opaque, bright corners')
    assert(pixel(strong, 0, 0)[0] < pixel(medium, 0, 0)[0] && pixel(medium, 0, 0)[0] < pixel(off, 0, 0)[0], 'Increasing strength must darken corners')
    assert(pixel(strong, width / 2, height / 2).join() === pixel(off, width / 2, height / 2).join(), 'Vignette must preserve the center')
    assert(pixel(source, 0, 0).join() === '200,200,200,255', 'Rendering must not modify the original image')
    assert(pixel(blurBackground(source, width, height, 0, -1), 0, 0).join() === '200,200,200,255', 'Negative strength must clamp to zero')
  }

  const source = solidCanvas(240, 160, 'white')
  const foreground = solidCanvas(250, 170, 'black')
  const ctx = {
    sourceCanvas: source,
    buffer: [foreground],
    exif: {},
    config: { vignette_strength: 0.3, vignetteStrength: 1, vignetteEnabled: false, blurRadius: 0.05 }
  }
  new BlurProcessor().process(ctx)
  assert(ctx.buffer.length === 2 && ctx.buffer[0] === foreground, 'Background rendering must preserve the foreground layer')
  assert(ctx.buffer[1].width === 250 && ctx.buffer[1].height === 170, 'Background rendering must preserve layout dimensions')
  assert(pixel(ctx.buffer[1], 0, 0).join() === '255,255,255,255', 'The off switch must override nonzero strength and avoid foreground shadows')

  return 'PASS: defaults, landscape/portrait/square corners, strength, center, zero blur, original preservation, switch override and layout dimensions'
}
