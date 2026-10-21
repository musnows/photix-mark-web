<template>
  <section class="space-y-3" aria-label="自定义 PNG 签名">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold">自定义签名</h3>
        <p class="mt-1 text-[11px] leading-5 text-muted-foreground">推荐上传透明背景、白色文字的 PNG，便于适配深浅模板。</p>
      </div>
      <button v-if="signature.dataUrl" type="button" role="switch" aria-label="启用签名" :aria-checked="signature.enabled" class="shrink-0 rounded-full border px-3 py-1 text-xs" :class="signature.enabled ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'" @click="update({ enabled: !signature.enabled })">
        {{ signature.enabled ? '已开启' : '已关闭' }}
      </button>
    </div>

    <input ref="fileInput" type="file" accept="image/png,.png" class="hidden" aria-label="上传签名 PNG" @change="upload" />
    <div v-if="signature.dataUrl" class="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <div class="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-zinc-700 p-2">
        <img :src="signature.dataUrl" :alt="signature.name || '签名素材'" class="max-h-full max-w-full object-contain" />
      </div>
      <div class="min-w-0 flex-1">
        <label class="block text-[11px] text-muted-foreground">签名名称
          <input :value="signature.name" maxlength="80" placeholder="为签名命名" class="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-ring focus:outline-none" @input="update({ name: ($event.target as HTMLInputElement).value })" />
        </label>
        <p class="mt-1 text-[10px] text-muted-foreground">名称仅用于识别素材</p>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" :disabled="uploading || persistenceBusy" class="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium transition hover:border-primary hover:text-primary disabled:opacity-50" @click="fileInput?.click()">{{ uploading ? '读取中…' : signature.dataUrl ? '更换 PNG' : '上传签名 PNG' }}</button>
      <button v-if="signature.dataUrl" type="button" :disabled="uploading || persistenceBusy" class="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50" @click="emit('update:modelValue', undefined)">移除签名</button>
    </div>
    <p v-if="persistenceMessage" :role="persistenceError ? 'alert' : 'status'" class="text-[11px] leading-5" :class="persistenceError ? 'text-destructive' : 'text-muted-foreground'">{{ persistenceMessage }}</p>
    <p v-if="uploadError" role="alert" class="text-xs leading-5 text-destructive">{{ uploadError }}</p>

    <div v-if="signature.dataUrl" class="space-y-4 border-t border-border pt-3" :class="{ 'opacity-60': !signature.enabled }">
      <fieldset class="space-y-2">
        <legend class="text-xs font-medium">签名位置</legend>
        <div class="flex flex-wrap gap-2">
          <button type="button" :aria-pressed="signature.position === 'template' && selectedAnchor === 'camera'" :class="pill(signature.position === 'template' && selectedAnchor === 'camera')" @click="update({ position: 'template', anchor: 'camera' })">相机旁边</button>
          <button type="button" :aria-pressed="signature.position === 'template' && selectedAnchor === 'params'" :class="pill(signature.position === 'template' && selectedAnchor === 'params')" @click="update({ position: 'template', anchor: 'params' })">参数旁边</button>
          <button type="button" :aria-pressed="signature.position === 'custom'" :class="pill(signature.position === 'custom')" @click="update({ position: 'custom' })">自由拖动</button>
        </div>
        <p class="text-[11px] leading-5 text-muted-foreground">{{ signature.position === 'template' ? selectedAnchor === 'camera' ? '跟随相机名称显示；经典版式放在左侧相机信息区，艺术版式和 Z 专版默认使用此位置。' : '跟随拍摄参数显示；经典版式放在右侧参数信息区。' : '拖动预览中的签名调整位置，拖动右下角手柄等比例缩放。支持触屏。' }}</p>
      </fieldset>

      <fieldset class="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
        <legend class="px-1 text-xs font-medium">水印大小</legend>
        <div class="flex items-center gap-2">
          <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-lg disabled:opacity-40" aria-label="缩小水印" :disabled="signature.width <= MIN_SIGNATURE_WIDTH" @click="setSize(signature.width - 0.05)">−</button>
          <label class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background px-2">
            <input type="number" min="1" max="100" step="1" :value="sizePercent" class="h-9 w-full min-w-0 bg-transparent text-center font-mono text-sm text-foreground focus:outline-none" aria-label="水印大小百分比" @input="changeSizeInput" @blur="($event.target as HTMLInputElement).value = String(sizePercent)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            <span class="text-xs text-muted-foreground">%</span>
          </label>
          <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-lg disabled:opacity-40" aria-label="放大水印" :disabled="signature.width >= MAX_SIGNATURE_WIDTH" @click="setSize(signature.width + 0.05)">+</button>
        </div>
        <input type="range" :min="MIN_SIGNATURE_WIDTH" :max="MAX_SIGNATURE_WIDTH" step="0.01" :value="signature.width" class="block w-full accent-primary" aria-label="水印大小" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
        <div class="grid grid-cols-3 gap-2">
          <button v-for="percent in sizePresets" :key="percent" type="button" class="rounded-lg border px-2 py-1.5 font-mono text-[11px] transition" :class="signature.position === 'custom' && sizePercent === percent ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-muted-foreground hover:text-foreground'" :aria-pressed="signature.position === 'custom' && sizePercent === percent" @click="setSize(percent / 100)">{{ percent }}%</button>
        </div>
        <p class="text-[10px] leading-5 text-muted-foreground">{{ signature.position === 'template' ? '当前使用模板默认大小。手动调整后进入自由拖动模式，大小按图片宽度的 1%–100% 设置。' : '按图片宽度等比例缩放，支持输入百分比、拖动滑块或预览右下角手柄；超出图片高度时会自动适应。' }}</p>
      </fieldset>

      <fieldset class="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
        <legend class="px-1 text-xs font-medium">水印不透明度</legend>
        <div class="flex items-center gap-2">
          <label class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2">
            <input type="number" min="0" max="100" step="1" :value="opacityPercent" class="h-9 w-full min-w-0 bg-transparent text-center font-mono text-sm text-foreground focus:outline-none" aria-label="水印不透明度百分比" @input="changeOpacityInput" @blur="($event.target as HTMLInputElement).value = String(opacityPercent)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            <span class="text-xs text-muted-foreground">%</span>
          </label>
          <button type="button" class="h-9 shrink-0 rounded-lg border border-border bg-background px-3 text-[11px] text-muted-foreground transition hover:text-foreground disabled:opacity-40" :disabled="opacityPercent === 100" @click="setOpacity(1)">恢复 100%</button>
        </div>
        <input type="range" min="0" max="1" step="0.01" :value="clampSignatureOpacity(signature.opacity)" class="block w-full accent-primary" aria-label="水印不透明度" @input="setOpacity(Number(($event.target as HTMLInputElement).value))" />
        <p class="text-[10px] leading-5 text-muted-foreground">0% 完全透明，100% 保留 PNG 原始效果；原有透明区域和半透明笔画会保留。</p>
      </fieldset>

      <fieldset class="space-y-2">
        <legend class="text-xs font-medium">PNG 遮罩</legend>
        <div class="flex flex-wrap gap-2">
          <button v-for="option in maskOptions" :key="option.value" type="button" :aria-pressed="signature.mask === option.value" :class="pill(signature.mask === option.value)" @click="update({ mask: option.value })">{{ option.label }}</button>
        </div>
        <div v-if="signature.mask === 'custom'" class="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2">
          <span class="text-xs text-muted-foreground">遮罩颜色</span>
          <ColorPickerField :model-value="signature.color" label="签名遮罩颜色" @update:model-value="update({ color: $event })" />
        </div>
        <p class="text-[11px] leading-5 text-muted-foreground">{{ signature.mask === 'original' ? '保留 PNG 原有颜色与透明度。' : signature.mask === 'auto' ? '按透明轮廓填色：浅色模板用黑色，深色模板用白色。' : '仅改变可见部分的颜色，保留透明背景与笔画透明度。' }}</p>
      </fieldset>

      <button type="button" class="rounded-lg border border-border px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground" @click="resetLayout">恢复默认位置和大小</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEFAULT_SIGNATURE, MIN_SIGNATURE_WIDTH, MAX_SIGNATURE_WIDTH, clampSignatureOpacity, clampSignatureWidth, setSignatureWidth, type SignatureAnchor, type SignatureOptions } from '~/lib/editor/signature'
import { readSignaturePng } from '~/utils/signature'

const props = defineProps<{ modelValue?: SignatureOptions; defaultAnchor?: SignatureAnchor; persistenceMessage?: string; persistenceError?: boolean; persistenceBusy?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: SignatureOptions | undefined]; import: [file: File] }>()
const signature = computed(() => ({ ...DEFAULT_SIGNATURE, ...props.modelValue }))
const selectedAnchor = computed(() => signature.value.anchor ?? props.defaultAnchor ?? 'params')
const sizePercent = computed(() => Math.round(clampSignatureWidth(signature.value.width) * 100))
const opacityPercent = computed(() => Math.round(clampSignatureOpacity(signature.value.opacity) * 100))
const sizePresets = [10, 25, 50]
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const maskOptions = [
  { value: 'auto', label: '自动黑白' },
  { value: 'custom', label: '自选颜色' },
  { value: 'original', label: '保留原色' }
] as const

function pill(active: boolean) {
  return ['rounded-full border px-3 py-1.5 text-[11px] font-medium transition', active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:border-input hover:text-foreground']
}

function update(value: Partial<SignatureOptions>) {
  emit('update:modelValue', { ...signature.value, ...value })
}

function setSize(width: number) {
  emit('update:modelValue', setSignatureWidth(signature.value, Math.round(width * 100) / 100))
}

function changeSizeInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.value.trim() || !Number.isFinite(input.valueAsNumber)) return
  const width = clampSignatureWidth(input.valueAsNumber / 100)
  setSize(width)
  input.value = String(Math.round(width * 100))
}

function setOpacity(opacity: number) {
  update({ opacity: clampSignatureOpacity(Math.round(opacity * 100) / 100) })
}

function changeOpacityInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.value.trim() || !Number.isFinite(input.valueAsNumber)) return
  const opacity = clampSignatureOpacity(input.valueAsNumber / 100)
  setOpacity(opacity)
  input.value = String(Math.round(opacity * 100))
}

function resetLayout() {
  update({ position: DEFAULT_SIGNATURE.position, anchor: undefined, width: DEFAULT_SIGNATURE.width, x: DEFAULT_SIGNATURE.x, y: DEFAULT_SIGNATURE.y })
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  uploadError.value = ''
  try {
    const asset = await readSignaturePng(file)
    update({ ...asset, enabled: true })
    emit('import', file)
  } catch (error) {
    console.error('Failed to import signature PNG:', error)
    uploadError.value = '无法读取签名。请上传含可见内容的有效 PNG（不超过 10 MB、1600 万像素）。'
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>
