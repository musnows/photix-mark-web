<template>
  <div class="rounded-xl border border-border bg-gradient-to-br from-card via-muted/30 to-muted/80 p-3 shadow-sm sm:rounded-2xl sm:p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-[13px] font-semibold text-foreground sm:text-sm">隐藏水印</h3>
          <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">可选</span>
        </div>
        <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
          把标识重复写入画面像素。裁掉参数栏或再次裁剪主图后，仍可使用检测工具读取。
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label="启用隐藏水印"
        :aria-checked="enabled"
        :class="toggleClass"
        @click="toggleEnabled"
      >
        <span :class="toggleKnobClass" />
      </button>
    </div>

    <Transition name="fade">
      <div v-if="enabled" class="mt-3 space-y-2 border-t border-border/60 pt-3">
        <div class="flex items-center justify-between gap-2">
          <label for="hidden-watermark-text" class="text-[12px] font-medium text-foreground sm:text-sm">水印标识</label>
          <span :class="byteCount > maxBytes ? 'text-destructive' : 'text-muted-foreground'" class="text-[11px] tabular-nums">
            {{ byteCount }} / {{ maxBytes }} 字节
          </span>
        </div>
        <input
          id="hidden-watermark-text"
          :value="marker"
          type="text"
          maxlength="120"
          autocomplete="off"
          spellcheck="false"
          placeholder="例如：Photix Mark / 摄影师名称"
          class="w-full rounded-xl border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring sm:rounded-2xl sm:text-sm"
          @input="updateMarker(($event.target as HTMLInputElement).value)"
        />
        <p v-if="byteCount > maxBytes" class="text-[11px] leading-relaxed text-destructive">
          标识超出长度限制，请缩短后再处理图片。
        </p>
        <p v-else class="text-[10px] leading-relaxed text-muted-foreground">
          标识作为纯文本写入，不会显示在画面上。支持中英文、数字与符号，最多 {{ maxBytes }} 个 UTF-8 字节。
        </p>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { HIDDEN_WATERMARK_MAX_BYTES } from '~/lib/watermark/hiddenWatermarkCore'

const props = defineProps<{
  modelValue: Record<string, any>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const maxBytes = HIDDEN_WATERMARK_MAX_BYTES
const encoder = new TextEncoder()

const enabled = computed(() => props.modelValue.hiddenWatermarkEnabled === true)
const marker = computed(() => String(props.modelValue.hiddenWatermarkText || ''))
const byteCount = computed(() => encoder.encode(marker.value.trim()).length)

const toggleClass = computed(() => [
  'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition sm:h-6 sm:w-11',
  enabled.value
    ? 'border-foreground bg-foreground'
    : 'border-border bg-muted'
])

const toggleKnobClass = computed(() => [
  'inline-block h-[14px] w-[14px] rounded-full bg-card transition sm:h-4 sm:w-4',
  enabled.value ? 'translate-x-[18px] sm:translate-x-6' : 'translate-x-0.5 sm:translate-x-1'
])

function updateConfig(key: string, value: any) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value
  })
}

function toggleEnabled() {
  if (!enabled.value && !marker.value.trim()) {
    emit('update:modelValue', {
      ...props.modelValue,
      hiddenWatermarkEnabled: true,
      hiddenWatermarkText: 'Photix Mark'
    })
    return
  }
  updateConfig('hiddenWatermarkEnabled', !enabled.value)
}

function updateMarker(value: string) {
  updateConfig('hiddenWatermarkText', value)
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
