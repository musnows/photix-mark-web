<template>
  <NuxtLink
    to="/detect"
    :target="newTab ? '_blank' : undefined"
    :rel="newTab ? 'noopener' : undefined"
    aria-label="隐藏水印检测"
    :title="newTab ? '隐藏水印检测（新标签页）' : '隐藏水印检测'"
    class="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3"
  >
    <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
    </svg>
    <span class="hidden text-xs font-medium sm:inline">水印检测</span>
  </NuxtLink>
</template>

<script setup lang="ts">
defineProps<{ newTab?: boolean }>()
</script>
