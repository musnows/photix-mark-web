<template>
  <div class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-foreground">保留原始 EXIF</p>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">{{ photographyOnly ? '导出时仅保留水印所需的摄影参数，不保留 GPS。' : '导出时保留原图的拍摄参数、时间、GPS 等信息。' }}适用于当前图片和全部图片。</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-label="保留原始 EXIF"
      :aria-checked="modelValue"
      :class="[
        'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        modelValue ? 'border-foreground bg-foreground' : 'border-border bg-muted'
      ]"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span :class="['inline-block h-4 w-4 rounded-full bg-card transition', modelValue ? 'translate-x-6' : 'translate-x-1']" />
    </button>
    <label v-if="modelValue" class="flex w-full cursor-pointer items-start gap-2 border-t border-border pt-3">
      <input
        type="checkbox"
        :checked="photographyOnly"
        aria-label="仅保留摄影参数"
        class="mt-0.5 h-4 w-4 shrink-0 accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @change="$emit('update:photographyOnly', ($event.target as HTMLInputElement).checked)"
      />
      <span class="min-w-0">
        <span class="block text-sm font-medium text-foreground">仅保留摄影参数</span>
        <span class="mt-1 block text-xs leading-5 text-muted-foreground">保留相机和镜头品牌型号、快门、光圈、ISO、焦距、拍摄时间及图片尺寸方向。移除 GPS、快门计数、序列号及其他无关信息。</span>
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; photographyOnly: boolean }>()
defineEmits<{
  'update:modelValue': [value: boolean]
  'update:photographyOnly': [value: boolean]
}>()
</script>
