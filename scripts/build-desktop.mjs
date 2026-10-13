import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
if (process.platform === 'darwin') {
  const iconset = path.join('.desktop', `icon-${Date.now()}.iconset`)
  await mkdir(iconset, { recursive: true })
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const output = path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)
      const resized = spawnSync('sips', ['-z', String(size * scale), String(size * scale), 'public/android-chrome-512x512.png', '--out', output], { stdio: 'ignore' })
      if (resized.status !== 0) throw new Error('Failed to prepare app icon')
    }
  }
  const converted = spawnSync('iconutil', ['-c', 'icns', '-o', '.desktop/photix.icns', iconset], { stdio: 'inherit' })
  if (converted.status !== 0) throw new Error('Failed to convert app icon')
}
const build = spawnSync(process.execPath, ['node_modules/nuxt/bin/nuxt.mjs', 'generate'], {
  cwd: root,
  env: { ...process.env, PHOTIX_DESKTOP: '1' },
  stdio: 'inherit'
})
if (build.status !== 0) process.exit(build.status || 1)

const appDirectory = path.join('.desktop', `app-${Date.now()}`)
await mkdir(path.join(appDirectory, 'electron'), { recursive: true })
await mkdir(path.join(appDirectory, 'renderer'), { recursive: true })
for (const file of ['main.cjs', 'preload.cjs', 'protocol.cjs', 'storage.cjs']) {
  await cp(path.join('electron', file), path.join(appDirectory, 'electron', file))
}
const assets = [
  'index.html', '_nuxt', 'fonts', 'logos', 'demo', 'logo.svg',
  'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png',
  'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png', 'site.webmanifest'
]
for (const asset of assets) {
  await cp(path.join('.output/public', asset), path.join(appDirectory, 'renderer', asset), {
    recursive: true,
    filter: source => !source.endsWith('.map')
  })
}
const metadata = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(path.join(appDirectory, 'package.json'), JSON.stringify({
  name: 'photix-mark-desktop',
  version: metadata.version,
  productName: 'Photix Mark',
  description: 'Offline photo watermark editor',
  author: 'Photix Mark contributors',
  license: 'MIT',
  main: 'electron/main.cjs',
  dependencies: {}
}, null, 2))
await writeFile('.desktop/current.json', JSON.stringify({ appDirectory }))
console.log(`Desktop runtime staged at ${appDirectory}`)
