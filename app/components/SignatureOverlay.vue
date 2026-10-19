<template>
  <div ref="surface" class="pointer-events-none absolute inset-0" @click.stop>
    <div
      v-if="imageRect.width && ready"
      class="signature-drag pointer-events-auto absolute cursor-move outline outline-1 outline-dashed outline-primary focus:ring-2 focus:ring-primary"
      :style="boxStyle"
      role="button"
      tabindex="0"
      aria-label="拖动签名，方向键微调位置"
      @pointerdown.stop.prevent="start($event, 'move')"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="cancel"
      @lostpointercapture="cancel"
      @keydown="moveWithKeyboard"
      @click.stop
    >
      <canvas ref="canvas" class="pointer-events-none block h-full w-full" :style="{ opacity: clampSignatureOpacity(modelValue.opacity) }" />
      <button type="button" class="signature-drag absolute -bottom-3 -right-3 h-8 w-8 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow-sm focus:ring-2 focus:ring-primary sm:-bottom-2 sm:-right-2 sm:h-5 sm:w-5" aria-label="缩放签名，方向键调整大小" @pointerdown.stop.prevent="start($event, 'resize')" @keydown.stop="resizeWithKeyboard" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { clampSignatureOpacity, clampSignatureWidth, draggedSignatureWidth, signatureBounds, type SignatureOptions } from '~/lib/editor/signature'
import { signatureColor, signatureImage } from '~/utils/signature'

const props = defineProps<{ modelValue: SignatureOptions; imageElement: HTMLImageElement | null; background?: string; lightText?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: SignatureOptions] }>()
const surface = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const draft = ref({ ...props.modelValue })
const imageRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const ready = ref(false)
let renderVersion = 0
let gesture: { mode: 'move' | 'resize'; x: number; y: number; options: SignatureOptions; target: HTMLElement; pointerId: number } | undefined

function measure() {
  if (!props.imageElement || !surface.value) return
  const image = props.imageElement.getBoundingClientRect()
  const parent = surface.value.getBoundingClientRect()
  imageRect.value = { x: image.left - parent.left, y: image.top - parent.top, width: image.width, height: image.height }
}

useResizeObserver(surface, measure)
useResizeObserver(() => props.imageElement, measure)
watch(() => props.imageElement, () => nextTick(measure))
watch(() => props.modelValue, value => {
  if (!gesture) draft.value = { ...value }
}, { deep: true })

watch(() => [props.modelValue.dataUrl, props.modelValue.mask, props.modelValue.color, props.background, props.lightText], async () => {
  const version = ++renderVersion
  try {
    const image = await signatureImage(props.modelValue.dataUrl, signatureColor(props.modelValue, props.background, props.lightText))
    if (version !== renderVersion) return
    ready.value = true
    await nextTick()
    if (!canvas.value) return
    canvas.value.width = image.width
    canvas.value.height = image.height
    canvas.value.getContext('2d')!.drawImage(image, 0, 0)
    measure()
  } catch (error) {
    console.error('Failed to display signature:', error)
    ready.value = false
  }
}, { immediate: true })

const bounds = computed(() => signatureBounds(draft.value, imageRect.value.width, imageRect.value.height))
const boxStyle = computed(() => ({
  left: `${imageRect.value.x + bounds.value.x}px`,
  top: `${imageRect.value.y + bounds.value.y}px`,
  width: `${bounds.value.width}px`,
  height: `${bounds.value.height}px`
}))

function start(event: PointerEvent, mode: 'move' | 'resize') {
  if (event.button !== 0 || !event.isPrimary) return
  const target = event.currentTarget as HTMLElement
  const normalized = { ...draft.value, x: bounds.value.x / imageRect.value.width, y: bounds.value.y / imageRect.value.height, width: bounds.value.width / imageRect.value.width }
  gesture = { mode, x: event.clientX, y: event.clientY, options: normalized, target, pointerId: event.pointerId }
  target.setPointerCapture(event.pointerId)
}

function normalize(value: SignatureOptions) {
  const box = signatureBounds(value, imageRect.value.width, imageRect.value.height)
  return { ...value, x: box.x / imageRect.value.width, y: box.y / imageRect.value.height, width: box.width / imageRect.value.width }
}

function move(event: PointerEvent) {
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const dx = (event.clientX - gesture.x) / imageRect.value.width
  const dy = (event.clientY - gesture.y) / imageRect.value.height
  const value = { ...gesture.options }
  if (gesture.mode === 'move') {
    value.x += dx
    value.y += dy
  } else {
    value.width = draggedSignatureWidth(value, event.clientX - gesture.x, event.clientY - gesture.y, imageRect.value.width, imageRect.value.height)
  }
  draft.value = normalize(value)
}

function finish(event: PointerEvent) {
  if (!gesture || gesture.pointerId !== event.pointerId) return
  move(event)
  const { target, pointerId } = gesture
  gesture = undefined
  if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
  emit('update:modelValue', { ...draft.value })
}

function cancel() {
  if (!gesture) return
  gesture = undefined
  draft.value = { ...props.modelValue }
}

function moveWithKeyboard(event: KeyboardEvent) {
  const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const offset = offsets[event.key]
  if (!offset) return
  event.preventDefault()
  const step = event.shiftKey ? 0.025 : 0.005
  draft.value = normalize({ ...draft.value, x: draft.value.x + offset[0] * step, y: draft.value.y + offset[1] * step })
  emit('update:modelValue', { ...draft.value })
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1
  draft.value = normalize({ ...draft.value, width: clampSignatureWidth(draft.value.width + direction * 0.01) })
  emit('update:modelValue', { ...draft.value })
}
</script>

<style scoped>
.signature-drag {
  touch-action: none;
  user-select: none;
}
</style>
