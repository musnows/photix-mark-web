const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { resolveUserDataDirectory, preserveUserDataDirectory } = require('../electron/dataDirectory.cjs')

test('desktop rebranding retains an existing signature and export profile', async () => {
  const parent = path.resolve('.ai-docs/yingqian-brand')
  await fs.mkdir(parent, { recursive: true })
  const appData = await fs.mkdtemp(path.join(parent, 'profile-'))
  const legacy = path.join(appData, 'Photix Mark')
  const current = path.join(appData, '映签')
  await fs.mkdir(current)
  await fs.mkdir(path.join(legacy, 'signatures'), { recursive: true })
  await fs.writeFile(path.join(legacy, 'signatures/current.json'), JSON.stringify({ file: 'original.png' }))
  assert.equal(resolveUserDataDirectory(appData, current), legacy)
  const changes = []
  preserveUserDataDirectory({ commandLine: { hasSwitch: () => false }, getPath: name => name === 'appData' ? appData : current, setPath: (key, value) => changes.push([key, value]) })
  assert.deepEqual(changes, [['userData', legacy], ['sessionData', legacy]])
  assert.equal(JSON.parse(await fs.readFile(path.join(legacy, 'signatures/current.json'), 'utf8')).file, 'original.png')
  await fs.writeFile(path.join(current, 'desktop-settings.json'), JSON.stringify({ exportDirectory: '/new/export' }))
  assert.equal(resolveUserDataDirectory(appData, current), current)
})

test('an explicit desktop test profile never falls back to personal data', () => {
  preserveUserDataDirectory({ commandLine: { hasSwitch: name => name === 'user-data-dir' }, getPath: () => { throw new Error('Personal profiles must not be inspected') } })
})

async function miniProgramBrand(values) {
  const storage = new Map(Object.entries(values))
  const module = { exports: {} }
  vm.runInNewContext(await fs.readFile(path.resolve('miniprogram/brand.js'), 'utf8'), {
    module,
    wx: {
      env: { USER_DATA_PATH: 'wxfile://usr' },
      getStorageSync: key => storage.has(key) ? storage.get(key) : '',
      setStorageSync: (key, value) => storage.set(key, value)
    }
  })
  return { ...module.exports, storage }
}

test('mini-program settings migrate without removing the previous values', async () => {
  const previous = { settings: { maxSide: 1280, preserveExif: false } }
  const brand = await miniProgramBrand({ 'photix-preferences-v1': previous })
  assert.equal(brand.readStoredSetting('preferences'), previous)
  assert.equal(brand.storage.get('yingqian-preferences-v1'), previous)
  assert.equal(brand.storage.get('photix-preferences-v1'), previous)
})

test('new preferences and cleared signatures take precedence over legacy storage', async () => {
  const current = { settings: { maxSide: 2560 } }
  const brand = await miniProgramBrand({ 'yingqian-preferences-v1': current, 'photix-preferences-v1': { settings: { maxSide: 1280 } }, 'yingqian-signature-v1': null, 'photix-signature-v1': { dataUrl: 'wxfile://usr/photix-signature-123-1.png' } })
  assert.equal(brand.readStoredSetting('preferences'), current)
  assert.equal(brand.readStoredSetting('signature'), null)
})

test('saved signatures accept both managed filename generations and reject unrelated paths', async () => {
  const previous = { dataUrl: 'wxfile://usr/photix-signature-123-1.png', enabled: true }
  const brand = await miniProgramBrand({ 'photix-signature-v1': previous })
  assert.equal(brand.readStoredSetting('signature'), previous)
  assert.equal(brand.isManagedSignature(previous.dataUrl), true)
  assert.equal(brand.isManagedSignature('wxfile://usr/yingqian-signature-456-2.png'), true)
  assert.equal(brand.isManagedSignature('wxfile://usr/yingqian-signature-123-1.png/../outside.png'), false)
  assert.equal(brand.isManagedSignature('wxfile://elsewhere/yingqian-signature-456-2.png'), false)
})
