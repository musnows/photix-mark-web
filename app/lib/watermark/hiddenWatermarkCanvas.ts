import {
  detectHiddenWatermarkInRgba,
  embedHiddenWatermarkInRgba,
  type HiddenWatermarkDetection
} from './hiddenWatermarkCore'
import { loadImageToCanvas } from '~/utils/canvas'

function getReadableContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Cannot get 2d context')
  }
  return context
}

export function embedHiddenWatermarkInCanvas(canvas: HTMLCanvasElement, marker: string) {
  const context = getReadableContext(canvas)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  embedHiddenWatermarkInRgba(imageData.data, canvas.width, canvas.height, marker)
  context.putImageData(imageData, 0, 0)
}

export function detectHiddenWatermarkInCanvas(canvas: HTMLCanvasElement): HiddenWatermarkDetection | null {
  const context = getReadableContext(canvas)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  return detectHiddenWatermarkInRgba(imageData.data, canvas.width, canvas.height)
}

export async function detectHiddenWatermarkInFile(file: File) {
  const canvas = await loadImageToCanvas(file)
  return {
    result: detectHiddenWatermarkInCanvas(canvas),
    width: canvas.width,
    height: canvas.height
  }
}
