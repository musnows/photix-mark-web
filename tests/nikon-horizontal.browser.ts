import { MultiRichTextProcessor } from '../app/lib/processors/multiRichText'
import { RichTextProcessor } from '../app/lib/processors/richText'
import { ConcatProcessor } from '../app/lib/processors/concat'
import { AlignmentProcessor } from '../app/lib/processors/alignment'
import { nikonBlur } from '../app/lib/templates/nikonBlur'
import type { ProcessorContext } from '../app/lib/processors/types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function inkBounds(canvas: HTMLCanvasElement) {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  let left = canvas.width
  let right = -1
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3]) {
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
  }
  assert(right >= left, 'Expected visible model text')
  return { left, right, center: (left + right + 1) / 2 }
}

export async function runNikonHorizontalTests() {
  const steps = nikonBlur.processors as Record<string, any>[]
  const modelStep = steps.find(step => step.processor_name === 'multi_rich_text')!
  const paramsStep = steps.find(step => step.processor_name === 'rich_text')!
  const results = []
  for (const [width, height] of [[625, 416], [1080, 728], [728, 1080], [1080, 1080], [6016, 4016]]) {
    for (const Model of ['NIKON Z f', 'NIKON Zf', 'NIKON Z 6_2', 'NIKON Z6III', 'NIKON Z 9']) {
      for (const scale of [0.8, 1, 1.2]) {
        const source = document.createElement('canvas')
        source.width = width
        source.height = height
        const exif = { Model, LensModel: 'NIKKOR Z DX 16-50mm f/2.8 VR', FocalLength: '16mm', FNumber: 'f/2.8', ExposureTime: '1/1250s', ISO: 'ISO 100' }
        const ctx: ProcessorContext = { buffer: [source], exif, config: { ...modelStep, nikonZScale: scale } }
        await new MultiRichTextProcessor().process(ctx)
        const model = ctx.buffer[1]
        const bounds = inkBounds(model)
        assert(bounds.left === 0 && bounds.right === model.width - 1, 'The model row must have no asymmetric outer transparent margins')
        ctx.config = { ...paramsStep, showLens: true }
        new RichTextProcessor().process(ctx)
        ctx.config = { ...steps.find(step => step.processor_name === 'concat'), select: [1, 2] }
        new ConcatProcessor().process(ctx)
        ctx.config = { ...steps[steps.length - 1], select: [0, 3] }
        new AlignmentProcessor().process(ctx)
        const row = document.createElement('canvas')
        row.width = width
        row.height = model.height
        const top = Math.round(height - ctx.buffer[3].height - height * 0.08)
        row.getContext('2d')!.drawImage(ctx.buffer[4], 0, -top)
        const final = inkBounds(row)
        const error = Math.abs(final.center - width / 2)
        assert(error <= 1, `Visible model row must center on the final photo: ${JSON.stringify({ width, height, Model, scale, error })}`)
        results.push({ width, height, Model, scale, error })
      }
    }
  }
  return { status: 'PASS', cases: results.length, maximumError: Math.max(...results.map(row => row.error)), results }
}
