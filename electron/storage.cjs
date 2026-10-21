const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')

function validateSignatureFile(file) {
  if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 255 || /[\\/\0]/.test(file.name)) {
    throw new Error('Invalid signature filename')
  }
  if (!(file.bytes instanceof Uint8Array) || file.bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error('Invalid signature file size')
  }
  const bytes = Buffer.from(file.bytes)
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Invalid signature PNG')
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (!width || !height || width * height > 16000000) throw new Error('Signature PNG dimensions are too large')
  return bytes
}

function createSignatureStore(directory, trashItem) {
  const settingsPath = path.join(directory, 'current.json')
  let pending = Promise.resolve()

  function serialize(callback) {
    const result = pending.then(callback)
    pending = result.catch(() => {})
    return result
  }

  async function readSettings() {
    let settings
    try {
      settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
    if (!settings || typeof settings.file !== 'string' || !/^[a-f0-9]{64}\.png$/.test(settings.file)) throw new Error('Invalid saved signature settings')
    return settings
  }

  function getSignature() {
    return serialize(async () => {
      const settings = await readSettings()
      if (!settings) return null
      const bytes = validateSignatureFile({ name: settings.name, bytes: await fs.readFile(path.join(directory, settings.file)) })
      if (`${createHash('sha256').update(bytes).digest('hex')}.png` !== settings.file) {
        throw new Error('Saved signature file is damaged')
      }
      return { name: settings.name, bytes: new Uint8Array(bytes) }
    })
  }

  function saveSignature(file) {
    return serialize(async () => {
      const bytes = validateSignatureFile(file)
      const filename = `${createHash('sha256').update(bytes).digest('hex')}.png`
      let previous
      try {
        previous = await readSettings()
      } catch (error) {
        console.error('Failed to read previous signature settings:', error)
      }
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      await fs.writeFile(path.join(directory, filename), bytes, { mode: 0o600 })
      const temporaryPath = `${settingsPath}.tmp`
      await fs.writeFile(temporaryPath, JSON.stringify({ name: file.name, file: filename }), { mode: 0o600 })
      await fs.rename(temporaryPath, settingsPath)
      if (previous && previous.file !== filename) {
        try {
          await trashItem(path.join(directory, previous.file))
        } catch (error) {
          console.error('Failed to move previous signature to Trash:', error)
        }
      }
    })
  }

  function clearSignature() {
    return serialize(async () => {
      try {
        await fs.stat(directory)
      } catch (error) {
        if (error.code === 'ENOENT') return
        throw error
      }
      await trashItem(directory)
    })
  }

  return { getSignature, saveSignature, clearSignature }
}

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

module.exports = { createExportStore, createSignatureStore }
