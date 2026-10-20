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
  const context = getReadableContext(canvas)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const worker = new Worker(new URL('./hiddenWatermark.worker.ts', import.meta.url), { type: 'module' })
  let result: HiddenWatermarkDetection | null
  try {
    result = await new Promise<HiddenWatermarkDetection | null>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<HiddenWatermarkDetection | null>) => resolve(event.data)
      worker.onerror = (event) => reject(new Error(event.message || 'Hidden watermark worker failed'))
      worker.postMessage({ data: imageData.data, width: canvas.width, height: canvas.height }, [imageData.data.buffer])
    })
  } finally {
    worker.terminate()
  }
  return {
    result,
    width: canvas.width,
    height: canvas.height
  }
}
