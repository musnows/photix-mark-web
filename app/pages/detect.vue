<template>
  <div class="min-h-screen bg-background">
    <header class="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-xl">
      <div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:h-16 sm:px-6">
        <NuxtLink
          to="/"
          class="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-input hover:text-foreground"
          aria-label="返回首页"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </NuxtLink>
        <NuxtLink to="/" class="flex min-w-0 items-center gap-2.5">
          <img src="/logo.svg" alt="映签" class="h-8 w-8 object-contain" />
          <span class="truncate text-sm font-semibold text-foreground sm:text-base">映签</span>
        </NuxtLink>
        <span class="hidden rounded-full border border-border bg-muted/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">隐藏水印检测</span>
        <div class="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <HiddenWatermarkButton />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div class="mb-7 sm:mb-9">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Watermark Reader</p>
        <h1 class="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">反水印检测</h1>
        <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          读取 映签 写入图片像素的隐藏标识。新版优先保护画质，建议检测原尺寸导出文件；同时兼容旧版水印。
        </p>
      </div>

      <HiddenWatermarkDetector />
    </main>
  </div>
</template>

<script setup lang="ts">
import HiddenWatermarkDetector from '~/components/HiddenWatermarkDetector.vue'

definePageMeta({
  ssr: false
})
</script>
