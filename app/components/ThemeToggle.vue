<template>
  <button
    type="button"
    data-theme-toggle
    class="pointer-events-auto fixed right-3 top-3 z-[10020] flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    :aria-label="isDark ? '切换到白天模式' : '切换到黑夜模式'"
    :title="isDark ? '切换到白天模式' : '切换到黑夜模式'"
    :aria-pressed="isDark"
    @click="colorMode.preference = isDark ? 'light' : 'dark'"
  >
    <svg v-if="isDark" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path stroke-linecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </svg>
    <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M20.5 13A8.5 8.5 0 0111 3.5 8.5 8.5 0 1020.5 13z" />
    </svg>
  </button>
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
</script>
