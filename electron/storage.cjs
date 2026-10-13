const fs = require('node:fs/promises')
const path = require('node:path')

async function createExportStore(settingsPath, defaultDirectory) {
  let exportDirectory = defaultDirectory
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    if (typeof settings.exportDirectory === 'string' && path.isAbsolute(settings.exportDirectory)) {
      exportDirectory = settings.exportDirectory
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  async function setDirectory(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
      throw new Error('Export directory must be an absolute path')
    }
    if (!(await fs.stat(directory)).isDirectory()) throw new Error('Export path is not a directory')
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    const temporaryPath = `${settingsPath}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify({ exportDirectory: directory }), { mode: 0o600 })
    await fs.rename(temporaryPath, settingsPath)
    exportDirectory = directory
    return directory
  }

  async function saveFile({ name, bytes }) {
    if (typeof name !== 'string' || !name || /[\\/\0]/.test(name) || name === '.' || name === '..') {
      throw new Error('Invalid export filename')
    }
    let safeName = name.replace(/[<>:"|?*]/g, '_').replace(/[. ]+$/, '')
    if (!safeName) throw new Error('Invalid export filename')
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(safeName)) safeName = `_${safeName}`
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error('Empty export data')
    const directory = exportDirectory
    if (!(await fs.stat(directory)).isDirectory()) throw new Error('Export directory is unavailable')
    const extension = path.extname(safeName)
    const basename = path.basename(safeName, extension)
    for (let index = 0; index < 10000; index++) {
      const suffix = index === 0 ? '' : ` (${index})`
      let stem = basename
      while (Buffer.byteLength(`${stem}${suffix}${extension}`) > 255 && stem) {
        stem = Array.from(stem).slice(0, -1).join('')
      }
      if (!stem) throw new Error('Export filename is too long')
      const filename = `${stem}${suffix}${extension}`
      const outputPath = path.join(directory, filename)
      let handle
      try {
        handle = await fs.open(outputPath, 'wx', 0o600)
      } catch (error) {
        if (error.code === 'EEXIST') continue
        throw error
      }
      try {
        await handle.writeFile(bytes)
      } finally {
        await handle.close()
      }
      return outputPath
    }
    throw new Error('Too many files with the same export name')
  }

  return { getDirectory: () => exportDirectory, setDirectory, saveFile }
}

module.exports = { createExportStore }
