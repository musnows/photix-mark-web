<template>
  <div class="space-y-5">
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleInputChange"
    />

    <div
      class="group relative overflow-hidden rounded-2xl border border-dashed border-border bg-card transition hover:border-primary/60 hover:bg-primary/[0.03]"
      :class="dragActive ? 'border-primary bg-primary/[0.05]' : ''"
      @dragenter.prevent="dragActive = true"
      @dragover.prevent="dragActive = true"
      @dragleave.prevent="dragActive = false"
      @drop.prevent="handleDrop"
    >
      <button
        type="button"
        class="flex w-full flex-col items-center justify-center px-6 py-12 text-center sm:py-16"
        @click="openFilePicker"
      >
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
        </span>
        <span class="mt-4 text-base font-semibold text-foreground">选择或拖入需要检测的图片</span>
        <span class="mt-1 text-xs text-muted-foreground sm:text-sm">支持裁掉边框后的主图、局部裁切图和 JPEG 成片</span>
      </button>
    </div>

    <div v-if="previewUrl" class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
      <div class="overflow-hidden rounded-2xl border border-border bg-muted/40">
        <div class="flex h-56 items-center justify-center p-3 sm:h-72">
          <img :src="previewUrl" :alt="fileName" class="max-h-full max-w-full object-contain" />
        </div>
        <div class="border-t border-border bg-card px-4 py-3">
          <p class="truncate text-sm font-medium text-foreground" :title="fileName">{{ fileName }}</p>
          <p class="mt-1 text-xs text-muted-foreground">{{ dimensionsText }}</p>
        </div>
      </div>

      <div class="rounded-2xl border border-border bg-card p-4">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">检测状态</p>
        <div v-if="processing" class="mt-4 flex items-center gap-2 text-sm text-foreground">
          <svg class="h-4 w-4 animate-spin text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          正在分析像素
        </div>
        <template v-else-if="result === null">
          <p class="mt-3 text-sm font-semibold text-foreground">未检测到隐藏水印</p>
          <p class="mt-2 text-xs leading-relaxed text-muted-foreground">图片中可能没有通过本工具写入的标识，或经过了大比例缩放与重压缩。</p>
        </template>
        <template v-else-if="errorMessage">
          <p class="mt-3 text-sm font-semibold text-destructive">检测失败</p>
          <p class="mt-2 text-xs leading-relaxed text-muted-foreground">{{ errorMessage }}</p>
        </template>
        <button
          v-if="!processing"
          type="button"
          class="mt-4 w-full rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:border-input hover:bg-muted/60"
          @click="runDetection"
        >
          重新检测
        </button>
      </div>
    </div>

    <div v-if="result" class="overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06]">
      <div class="flex items-center gap-2 border-b border-emerald-500/20 px-4 py-3 sm:px-5">
        <span class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <div>
          <p class="text-sm font-semibold text-foreground">检测成功</p>
          <p class="text-[11px] text-muted-foreground">已从重复信号和校验码中恢复标识</p>
        </div>
      </div>
      <div class="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
        <div>
          <p class="text-xs font-medium text-muted-foreground">检测到的水印标识</p>
          <code class="mt-2 block break-all rounded-xl border border-border bg-background/90 px-3 py-3 font-mono text-base font-semibold text-foreground sm:text-lg">
            {{ result.marker }}
          </code>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
            <p class="text-muted-foreground">信号置信度</p>
            <p class="mt-1 font-mono font-semibold text-foreground">{{ confidenceText }}</p>
          </div>
          <div class="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
            <p class="text-muted-foreground">参与分析区块</p>
            <p class="mt-1 font-mono font-semibold text-foreground">{{ result.blockCount.toLocaleString() }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-2xl border border-border bg-muted/35 px-4 py-4 text-xs leading-relaxed text-muted-foreground sm:px-5">
      <p class="font-medium text-foreground">检测说明</p>
      <p class="mt-1.5">检测完全在浏览器本地完成。工具会搜索 8x8 像素块中的重复频域信号，因此裁掉相机参数栏、裁取主图局部后仍有机会恢复。严重降采样、低质量重压缩或大范围涂抹会降低成功率。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { detectHiddenWatermarkInFile } from '~/lib/watermark/hiddenWatermarkCanvas'
import type { HiddenWatermarkDetection } from '~/lib/watermark/hiddenWatermarkCore'

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const processing = ref(false)
const dragActive = ref(false)
const result = ref<HiddenWatermarkDetection | null | undefined>(undefined)
const errorMessage = ref('')
const imageWidth = ref(0)
const imageHeight = ref(0)

const fileName = computed(() => selectedFile.value?.name || '')
const dimensionsText = computed(() => {
  if (!imageWidth.value || !imageHeight.value) return '正在读取尺寸'
  return `${imageWidth.value.toLocaleString()} x ${imageHeight.value.toLocaleString()} px`
})
const confidenceText = computed(() => {
  if (!result.value) return ''
  return `${Math.round(result.value.confidence * 100)}%`
})

function openFilePicker() {
  fileInput.value?.click()
}

function clearPreviewUrl() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function handleInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    void selectFile(file)
  }
  input.value = ''
}

function handleDrop(event: DragEvent) {
  dragActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    void selectFile(file)
  }
}

async function selectFile(file: File) {
  if (!file.type.startsWith('image/')) {
    errorMessage.value = '请选择图片文件。'
    return
  }

  clearPreviewUrl()
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
  result.value = undefined
  errorMessage.value = ''
  imageWidth.value = 0
  imageHeight.value = 0
  await runDetection()
}

async function runDetection() {
  if (!selectedFile.value || processing.value) return

  processing.value = true
  errorMessage.value = ''
  result.value = undefined

  try {
    const detection = await detectHiddenWatermarkInFile(selectedFile.value)
    imageWidth.value = detection.width
    imageHeight.value = detection.height
    result.value = detection.result
  } catch (error) {
    console.error('[HiddenWatermarkDetector] Detection failed:', error)
    errorMessage.value = '无法读取图片像素，请更换图片后重试。'
    result.value = undefined
  } finally {
    processing.value = false
  }
}

onUnmounted(clearPreviewUrl)
</script>
