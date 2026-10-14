<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger as-child>
      <button type="button" :aria-label="`${brand || '无品牌'}：选择内置 Logo`" class="mt-2 w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-[11px] font-medium text-secondary-foreground transition-colors hover:bg-accent">选择内置 Logo</button>
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl" @interact-outside="preserveDialogOnThemeToggle">
        <div class="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <DialogTitle class="text-lg font-semibold">选择内置 Logo</DialogTitle>
            <DialogDescription class="mt-1 text-xs leading-relaxed text-muted-foreground">为“{{ brand || '无品牌信息' }}”图片选择 Logo。只替换图标，保留照片原有拍摄信息。</DialogDescription>
          </div>
          <DialogClose class="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="关闭内置 Logo 选择">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 6l12 12M6 18L18 6" /></svg>
          </DialogClose>
        </div>
        <div class="p-4">
          <label :for="searchId" class="sr-only">搜索内置 Logo</label>
          <input :id="searchId" v-model="query" type="search" placeholder="搜索品牌或配色，如 Nikon、索尼、白色" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div class="min-h-0 overflow-y-auto px-4 pb-4">
          <p v-if="!logos.length" class="py-8 text-center text-sm text-muted-foreground">没有匹配的内置 Logo</p>
          <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <button v-for="logo in logos" :key="logo.path" type="button" :aria-label="`使用 ${logo.name}`" :aria-pressed="selected === logo.path" :class="['min-w-0 rounded-xl border p-2 text-xs transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected === logo.path ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground']" @click="select(logo.path)">
              <span class="logo-preview flex h-16 items-center justify-center rounded-lg p-2"><img :src="logo.path" :alt="logo.name" class="max-h-full max-w-full object-contain" /></span>
              <span class="mt-2 block break-words leading-relaxed">{{ logo.name }}</span>
              <span v-if="selected === logo.path" class="mt-1 block text-primary">当前选择</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'radix-vue'
import { BUILTIN_LOGOS } from '~/lib/editor/builtinLogos'
import { preserveDialogOnThemeToggle } from '~/utils/theme'

defineProps<{ brand: string; selected?: string | null }>()
const emit = defineEmits<{ select: [path: string] }>()
const open = ref(false)
const query = ref('')
const searchId = useId()
const logos = computed(() => BUILTIN_LOGOS.filter(logo => logo.name.toLowerCase().includes(query.value.trim().toLowerCase())))
watch(open, () => { query.value = '' })
function select(path: string) {
  emit('select', path)
  open.value = false
}
</script>

<style scoped>
.logo-preview {
  background-color: #737982;
  background-image: conic-gradient(#8c929a 25%, transparent 0 50%, #8c929a 0 75%, transparent 0);
  background-size: 12px 12px;
}
</style>
