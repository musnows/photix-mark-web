import { readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let electron
try {
  electron = require('electron')
} catch (error) {
  console.log('Preparing Electron runtime')
  const installed = spawnSync(process.execPath, ['node_modules/electron/install.js'], { stdio: 'inherit' })
  if (installed.status !== 0) throw error
  electron = require('electron')
}
const { appDirectory } = JSON.parse(await readFile('.desktop/current.json', 'utf8'))
const child = spawn(electron, [appDirectory, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env })
child.on('error', error => {
  console.error('Failed to launch Electron:', error)
  process.exitCode = 1
})
child.on('exit', code => { process.exitCode = code ?? 1 })
