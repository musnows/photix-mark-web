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
  const coverage = new Float64Array(canvas.height)
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4
      if (matches(...Array.from(pixels.slice(offset, offset + 4)) as [number, number, number, number])) {
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
        coverage[y] = Math.max(coverage[y], pixels[offset + 3])
      }
    }
  }
  assert(bottom >= top, 'Expected visible pixels')
  const half = Math.max(...coverage) / 2
  const first = coverage.findIndex(value => value >= half)
  let last = coverage.length - 1
  while (coverage[last] < half) last--
  const previous = coverage[first - 1] || 0
  const next = coverage[last + 1] || 0
  const upperEdge = first - 0.5 + (half - previous) / (coverage[first] - previous)
  const lowerEdge = last + 0.5 + (coverage[last] - half) / (coverage[last] - next)
  return { top, bottom, center: (upperEdge + lowerEdge) / 2 }
}

export async function runNikonAlignmentTests() {
  const steps = nikonBlur.processors as Record<string, any>[]
  const modelStep = steps.find(step => step.processor_name === 'multi_rich_text')!
  const defaults = getTemplateDefaultConfig(nikonBlur)
  assert(defaults.nikonZScale === 1 && modelStep.text_segments[1].image_scale === 1, 'Default Z size must be 1x in both settings and rendering')
  const exif = { Model: 'NIKON Z f', FocalLength: 50, FNumber: 2.8, ExposureTime: 1 / 125, ISO: 400 }
  const results = []

  for (const height of [400, 416, 728, 1000, 4000]) {
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
      const nikon = bounds(model, (r, g, b, a) => a > 0 && r > 200 && g < 30 && b < 30)
      const z = bounds(model, (r, g, b, a) => a > 0 && r > 200 && g > 200 && b > 200)
      const f = bounds(model, (r, g, b, a) => a > 0 && r < 30 && g > 200 && b > 200)
      assert(Math.abs(z.center - f.center) <= 0.05, `Z and f must be vertically centered at ${height}px, ${scale}x: ${JSON.stringify({ nikon, z, f })}`)
      assert(Math.abs(z.center - nikon.center) <= 0.05, `NIKON and Z must be vertically centered at ${height}px, ${scale}x`)
      assert(model.height === Math.floor(height * modelStep.height), 'Model layer must not contain fixed transparent padding')
      const backdrop = document.createElement('canvas')
      backdrop.width = model.width + 101
      backdrop.height = model.height + 101
      const params = document.createElement('canvas')
      params.width = model.width + 13
      params.height = 7
      const composed: ProcessorContext = { buffer: [backdrop, model, params], exif, config: { ...steps.find(step => step.processor_name === 'concat'), select: [1, 2] } }
      new ConcatProcessor().process(composed)
      composed.config = { ...steps[steps.length - 1], select: [0, 3] }
      new AlignmentProcessor().process(composed)
      const finalY = Math.round(backdrop.height - composed.buffer[3].height - backdrop.height * 0.08)
      const finalRow = document.createElement('canvas')
      finalRow.width = backdrop.width
      finalRow.height = model.height
      finalRow.getContext('2d')!.putImageData(composed.buffer[4].getContext('2d')!.getImageData(0, finalY, backdrop.width, model.height), 0, 0)
      const finalNikon = bounds(finalRow, (r, g, b, a) => a > 0 && r > 200 && g < 30 && b < 30)
      const finalZ = bounds(finalRow, (r, g, b, a) => a > 0 && r > 200 && g > 200 && b > 200)
      const finalF = bounds(finalRow, (r, g, b, a) => a > 0 && r < 30 && g > 200 && b > 200)
      assert(Math.abs(finalZ.center - finalF.center) <= 0.05 && Math.abs(finalZ.center - finalNikon.center) <= 0.05, 'Final composition must preserve visible vertical centers')
      const originalPixels = model.getContext('2d')!.getImageData(0, 0, model.width, model.height).data
      for (const color of ['#FFCC00', '#FF0000', '#000000']) {
        const colored: ProcessorContext = { buffer: [source], exif, config: { ...ctx.config, nikonZColor: color } }
        await new MultiRichTextProcessor().process(colored)
        const canvas = colored.buffer[1]
        assert(canvas.width === model.width && canvas.height === model.height, 'Changing color must preserve layout dimensions')
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        assert(pixels.every((value, index) => index % 4 !== 3 || value === originalPixels[index]), 'Changing color must preserve every visible pixel position')
      }
      results.push({ height, scale, centers: [nikon.center, z.center, f.center], finalCenters: [finalNikon.center, finalZ.center, finalF.center] })
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
