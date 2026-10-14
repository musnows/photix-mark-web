<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger as-child>
      <button type="button" class="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent">查看全部</button>
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[10001] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl" @interact-outside="preserveDialogOnThemeToggle">
        <div class="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div class="min-w-0">
            <DialogTitle class="text-lg font-semibold">完整 EXIF 与元数据</DialogTitle>
            <DialogDescription class="mt-1 break-all text-xs leading-relaxed text-muted-foreground">
              {{ file.name }} · 原始文件信息，不受手动拍摄参数修改影响。包含 EXIF、GPS、XMP、IPTC、ICC 等文件实际携带的标签；厂商私有数据以完整十六进制显示。
            </DialogDescription>
          </div>
          <DialogClose class="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="关闭完整 EXIF">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 6l12 12M6 18L18 6" /></svg>
          </DialogClose>
        </div>
        <div class="border-b border-border p-4">
          <label class="sr-only" :for="searchId">搜索全部元数据</label>
          <input :id="searchId" v-model="query" type="search" placeholder="搜索标签或内容，如 GPS、Copyright、Software" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <p class="mt-2 text-xs text-muted-foreground" aria-live="polite">{{ filteredRows.length }} / {{ rows.length }} 项</p>
        </div>
        <div class="min-h-0 overflow-y-auto p-4" aria-live="polite" :aria-busy="loading">
          <p v-if="loading" class="py-8 text-center text-sm text-muted-foreground">正在读取完整元数据…</p>
          <div v-else-if="error" role="alert" class="space-y-3 py-6 text-center text-sm text-muted-foreground">
            <p>{{ error }}</p>
            <button type="button" class="rounded-lg border border-border px-3 py-2 hover:bg-accent" @click="load">重试</button>
          </div>
          <template v-else>
            <p v-if="!tagCount" class="mb-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">此文件没有可读取的内嵌元数据，以下为文件基本信息。</p>
            <p v-if="!filteredRows.length" class="py-8 text-center text-sm text-muted-foreground">没有匹配的标签或内容</p>
            <dl v-else class="divide-y divide-border text-xs">
              <div v-for="row in filteredRows" :key="row.key" class="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                <dt class="break-all font-mono font-medium text-muted-foreground">{{ row.key }}</dt>
                <dd class="min-w-0 select-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  <details v-if="row.binary">
                    <summary class="cursor-pointer text-primary">二进制数据 · {{ row.value ? (row.value.length + 1) / 3 : 0 }} 字节 · 展开全部</summary>
                    <pre class="mt-2 whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono">{{ row.value }}</pre>
                  </details>
                  <span v-else>{{ row.value }}</span>
                </dd>
              </div>
            </dl>
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'radix-vue'
import { metadataRows, readFullExif, type MetadataRow } from '~/lib/editor/fullExif'
import { preserveDialogOnThemeToggle } from '~/utils/theme'

const props = defineProps<{ file: File }>()
const open = ref(false)
const query = ref('')
const loading = ref(false)
const error = ref('')
const rows = shallowRef<MetadataRow[]>([])
const tagCount = ref(0)
const searchId = useId()
let requestId = 0
const filteredRows = computed(() => {
  const search = query.value.trim().toLowerCase()
  return rows.value.filter(row => `${row.key} ${row.value}`.toLowerCase().includes(search))
})

async function load() {
  const request = ++requestId
  const file = props.file
  loading.value = true
  error.value = ''
  rows.value = []
  try {
    const metadata = await readFullExif(file)
    if (request !== requestId) return
    const tags = metadataRows(metadata)
    tagCount.value = tags.length
    rows.value = [
      ...metadataRows({ 'File.Name': file.name, 'File.Type': file.type || 'unknown', 'File.Size': `${file.size} bytes`, 'File.LastModified': new Date(file.lastModified) }),
      ...tags
    ]
  } catch (cause) {
    if (request !== requestId) return
    console.error('[FullExifDialog] Failed to read metadata:', cause)
    error.value = '无法读取此文件的完整元数据，请重试或使用其他图片。'
  } finally {
    if (request === requestId) loading.value = false
  }
}

watch([open, () => props.file], () => {
  query.value = ''
  if (open.value) void load()
  else requestId++
})
</script>
