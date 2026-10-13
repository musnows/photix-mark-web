<template>
  <div v-if="desktop" class="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-medium text-foreground">导出目录</span>
      <Button variant="outline" size="sm" :disabled="busy" @click="chooseDirectory">选择目录</Button>
    </div>
    <p class="break-all font-mono text-xs leading-5 text-muted-foreground" :title="directory">{{ directory || '正在读取目录…' }}</p>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <button class="text-xs text-primary hover:underline disabled:opacity-50" :disabled="busy || !directory" @click="openDirectory">打开目录</button>
      <button class="text-xs text-muted-foreground hover:underline disabled:opacity-50" :disabled="busy" @click="resetDirectory">恢复默认</button>
    </div>
    <p class="text-xs leading-5 text-muted-foreground">单张保存为图片，多张保存为 ZIP；同名文件自动加序号。</p>
  </div>
</template>

<script setup lang="ts">
import Button from '~/components/ui/Button.vue'

const desktop = ref(false)
const directory = useState('desktop-export-directory', () => '')
const busy = ref(false)
const { error: showError } = useToast()

onMounted(async () => {
  desktop.value = Boolean(window.photixDesktop)
  if (!desktop.value) return
  try {
    directory.value = await window.photixDesktop!.getExportDirectory()
  } catch (error) {
    console.error('Failed to read export directory:', error)
    showError('读取导出目录失败，请重新选择目录')
  }
})

async function updateDirectory(reset = false) {
  busy.value = true
  try {
    const selected = reset
      ? await window.photixDesktop!.resetExportDirectory()
      : await window.photixDesktop!.chooseExportDirectory()
    if (selected) directory.value = selected
  } catch (error) {
    console.error('Failed to update export directory:', error)
    showError('无法设置导出目录，请检查目录是否可用')
  } finally {
    busy.value = false
  }
}

const chooseDirectory = () => updateDirectory()
const resetDirectory = () => updateDirectory(true)

async function openDirectory() {
  try {
    await window.photixDesktop!.openExportDirectory()
  } catch (error) {
    console.error('Failed to open export directory:', error)
    showError('无法打开导出目录，请重新选择目录')
  }
}
</script>
