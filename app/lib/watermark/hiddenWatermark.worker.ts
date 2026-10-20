import { detectHiddenWatermarkInRgba } from './hiddenWatermarkCore'

self.onmessage = (event: MessageEvent<{ data: Uint8ClampedArray; width: number; height: number }>) => {
  const { data, width, height } = event.data
  self.postMessage(detectHiddenWatermarkInRgba(data, width, height))
}
