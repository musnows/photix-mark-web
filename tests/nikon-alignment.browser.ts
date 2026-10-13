import { MultiRichTextProcessor } from '../app/lib/processors/multiRichText'
import { RoundedCornerProcessor } from '../app/lib/processors/roundedCorner'
import { ShadowProcessor } from '../app/lib/processors/shadow'
import { RichTextProcessor } from '../app/lib/processors/richText'
import { ConcatProcessor } from '../app/lib/processors/concat'
import { BlurProcessor } from '../app/lib/processors/blur'
import { ResizeProcessor } from '../app/lib/processors/resize'
import { AlignmentProcessor } from '../app/lib/processors/alignment'
import type { ProcessorContext } from '../app/lib/processors/types'
import { nikonBlur } from '../app/lib/templates/nikonBlur'
import { getTemplateDefaultConfig } from '../app/lib/templates/userOptions'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function bounds(canvas: HTMLCanvasElement, matches: (r: number, g: number, b: number, a: number) => boolean) {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  let top = canvas.height
  let bottom = -1
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4
      if (matches(...Array.from(pixels.slice(offset, offset + 4)) as [number, number, number, number])) {
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
  }
  assert(bottom >= top, 'Expected visible pixels')
  return { top, bottom, center: (top + bottom) / 2 }
}

export async function runNikonAlignmentTests() {
  const steps = nikonBlur.processors as Record<string, any>[]
  const modelStep = steps.find(step => step.processor_name === 'multi_rich_text')!
  const defaults = getTemplateDefaultConfig(nikonBlur)
  assert(defaults.nikonZScale === 1 && modelStep.text_segments[1].image_scale === 1, 'Default Z size must be 1x in both settings and rendering')
  const exif = { Model: 'NIKON Z f', FocalLength: 50, FNumber: 2.8, ExposureTime: 1 / 125, ISO: 400 }
  const results = []

  for (const height of [400, 1000, 4000]) {
    const source = document.createElement('canvas')
    source.width = Math.round(height * 1.625)
    source.height = height
    const sCtx = source.getContext('2d')!
    sCtx.fillStyle = 'rgb(220,200,180)'
    sCtx.fillRect(0, 0, source.width, source.height)

    for (const scale of [0.8, 1, 1.2]) {
      const ctx: ProcessorContext = {
        buffer: [source], exif,
        config: {
          ...modelStep, nikonZScale: scale, nikonZColor: '#FFFFFF',
          text_segments: modelStep.text_segments.map((seg: any, index: number) => ({ ...seg, color: index === 0 ? '#FF0000' : index === 2 ? '#00FFFF' : '#FFFFFF' }))
        }
      }
      await new MultiRichTextProcessor().process(ctx)
      const model = ctx.buffer[1]
      const nikon = bounds(model, (r, g, b, a) => a > 100 && r > 200 && g < 30 && b < 30)
      const z = bounds(model, (r, g, b, a) => a > 100 && r > 200 && g > 200 && b > 200)
      const f = bounds(model, (r, g, b, a) => a > 100 && r < 30 && g > 200 && b > 200)
      assert(Math.abs(z.center - f.center) <= 1, `Z and f must be vertically centered at ${height}px, ${scale}x`)
      assert(Math.abs(z.center - nikon.center) <= 1, `NIKON and Z must be vertically centered at ${height}px, ${scale}x`)
      assert(model.height === Math.floor(height * modelStep.height), 'Model layer must not contain fixed transparent padding')
      const originalPixels = model.getContext('2d')!.getImageData(0, 0, model.width, model.height).data
      for (const color of ['#FFCC00', '#FF0000', '#000000']) {
        const colored: ProcessorContext = { buffer: [source], exif, config: { ...ctx.config, nikonZColor: color } }
        await new MultiRichTextProcessor().process(colored)
        const canvas = colored.buffer[1]
        assert(canvas.width === model.width && canvas.height === model.height, 'Changing color must preserve layout dimensions')
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        assert(pixels.every((value, index) => index % 4 !== 3 || value === originalPixels[index]), 'Changing color must preserve every visible pixel position')
      }
      results.push({ height, scale, centers: [nikon.center, z.center, f.center] })
    }

    const processors = new Map([
      ['rounded_corner', new RoundedCornerProcessor()], ['shadow', new ShadowProcessor()],
      ['multi_rich_text', new MultiRichTextProcessor()], ['rich_text', new RichTextProcessor()],
      ['concat', new ConcatProcessor()], ['blur', new BlurProcessor()],
      ['resize', new ResizeProcessor()], ['alignment', new AlignmentProcessor()]
    ])
    const ctx: ProcessorContext = { sourceCanvas: source, buffer: [source], exif, config: {} }
    for (const step of steps) {
      ctx.config = { ...step, ...defaults }
      await processors.get(step.processor_name)!.process(ctx)
    }
    const backgroundHeight = ctx.buffer[4].height
    const foregroundBottom = (backgroundHeight - ctx.buffer[0].height) / 2 - backgroundHeight * 0.05 + ctx.buffer[0].height
    const modelBounds = bounds(ctx.buffer[1], (_r, _g, _b, a) => a > 100)
    const modelTop = backgroundHeight - ctx.buffer[3].height - backgroundHeight * 0.08 + modelBounds.top
    assert(modelTop > foregroundBottom, `Model row must stay below the photo at ${height}px`)
    results.push({ height, foregroundBottom, modelTop })
  }

  return { status: 'PASS', results }
}
