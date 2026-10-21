const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { createSignatureStore } = require('../electron/storage.cjs')

async function fixture() {
  const parent = path.resolve('.ai-docs/test-data')
  await fs.mkdir(parent, { recursive: true })
  const root = await fs.mkdtemp(path.join(parent, 'signature-'))
  const directory = path.join(root, 'user-data', 'signatures')
  const trash = path.join(root, 'trash')
  await fs.mkdir(trash)
  let trashed = 0
  const trashItem = source => fs.rename(source, path.join(trash, `${trashed++}-${path.basename(source)}`))
  const bytes = await fs.readFile(path.resolve('tests/fixtures/hidden-watermark-v1.png'))
  return { root, directory, trash, bytes, trashItem, store: createSignatureStore(directory, trashItem) }
}

test('saved signatures are independent PNG copies and survive moving the source and reopening', async () => {
  const { root, directory, bytes, trashItem, store } = await fixture()
  assert.equal(await store.getSignature(), null)
  await store.clearSignature()
  const source = path.join(root, '用户签名.PNG')
  await fs.writeFile(source, bytes)
  await store.saveSignature({ name: path.basename(source), bytes: new Uint8Array(await fs.readFile(source)) })
  await fs.rename(source, path.join(root, 'moved-original.png'))

  const reopened = createSignatureStore(directory, trashItem)
  const saved = await reopened.getSignature()
  assert.equal(saved.name, '用户签名.PNG')
  assert.deepEqual(Buffer.from(saved.bytes), bytes)
  const settings = JSON.parse(await fs.readFile(path.join(directory, 'current.json'), 'utf8'))
  assert.deepEqual(await fs.readFile(path.join(directory, settings.file)), bytes)
  assert.equal(JSON.stringify(settings).includes(source), false)
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(path.join(directory, settings.file))).mode & 0o777, 0o600)
  }
})

test('replacing a signature remembers the latest copy and moves the previous managed copy to Trash', async () => {
  const { root, directory, trash, bytes, store } = await fixture()
  const replacement = Buffer.concat([bytes, Buffer.from('replacement')])
  await fs.writeFile(path.join(root, 'original.png'), bytes)
  await store.saveSignature({ name: 'Same name.png', bytes })
  await store.saveSignature({ name: 'Same name.png', bytes: replacement })
  const saved = await store.getSignature()
  assert.deepEqual(Buffer.from(saved.bytes), replacement)
  assert.equal((await fs.readdir(directory)).filter(name => name.endsWith('.png')).length, 1)
  const trashed = await fs.readdir(trash)
  assert.equal(trashed.length, 1)
  assert.deepEqual(await fs.readFile(path.join(trash, trashed[0])), bytes)
  assert.deepEqual(await fs.readFile(path.join(root, 'original.png')), bytes)
})

test('invalid signature imports preserve the saved file and do not poison subsequent operations', async () => {
  const { bytes, store } = await fixture()
  await store.saveSignature({ name: 'valid.png', bytes })
  const invalidDimensions = Buffer.from(bytes)
  invalidDimensions.writeUInt32BE(16000001, 16)
  const invalidFiles = [
    null,
    { name: '../escape.png', bytes },
    { name: '..\\escape.png', bytes },
    { name: '', bytes },
    { name: 'empty.png', bytes: new Uint8Array() },
    { name: 'text.png', bytes: new Uint8Array(40) },
    { name: 'large.png', bytes: new Uint8Array(10 * 1024 * 1024 + 1) },
    { name: 'dimensions.png', bytes: invalidDimensions }
  ]
  for (const file of invalidFiles) await assert.rejects(store.saveSignature(file))
  assert.equal((await store.getSignature()).name, 'valid.png')
  assert.deepEqual(Buffer.from((await store.getSignature()).bytes), bytes)
  await store.saveSignature({ name: 'renamed.png', bytes })
  assert.equal((await store.getSignature()).name, 'renamed.png')
})

test('damaged saved files and unsafe metadata are rejected and a new import restores usability', async () => {
  const { directory, bytes, store } = await fixture()
  await store.saveSignature({ name: 'valid.png', bytes })
  const settingsPath = path.join(directory, 'current.json')
  const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
  await fs.writeFile(path.join(directory, settings.file), Buffer.concat([bytes, Buffer.from('damaged')]))
  await assert.rejects(store.getSignature(), /damaged/)
  await store.saveSignature({ name: 'recovered.png', bytes })
  assert.equal((await store.getSignature()).name, 'recovered.png')
  await fs.writeFile(settingsPath, JSON.stringify({ name: 'unsafe.png', file: '../outside.png' }))
  await assert.rejects(store.getSignature(), /Invalid saved signature settings/)
  await store.saveSignature({ name: 'recovered again.png', bytes })
  assert.equal((await store.getSignature()).name, 'recovered again.png')
})

test('a failed settings write preserves the previously remembered signature', async () => {
  const { directory, bytes, store } = await fixture()
  await store.saveSignature({ name: 'original.png', bytes })
  await fs.mkdir(path.join(directory, 'current.json.tmp'))
  await assert.rejects(store.saveSignature({ name: 'replacement.png', bytes: Buffer.concat([bytes, Buffer.from('replacement')]) }))
  const saved = await store.getSignature()
  assert.equal(saved.name, 'original.png')
  assert.deepEqual(Buffer.from(saved.bytes), bytes)
})

test('queued saves and removal finish in order and removal survives reopening without touching originals', async () => {
  const { root, directory, bytes, trashItem, store } = await fixture()
  const source = path.join(root, 'original.png')
  await fs.writeFile(source, bytes)
  await Promise.all([
    store.saveSignature({ name: 'first.png', bytes }),
    store.saveSignature({ name: 'second.png', bytes }),
    store.clearSignature()
  ])
  assert.equal(await store.getSignature(), null)
  assert.equal(await createSignatureStore(directory, trashItem).getSignature(), null)
  assert.deepEqual(await fs.readFile(source), bytes)
  await store.saveSignature({ name: 'third.png', bytes })
  assert.equal((await store.getSignature()).name, 'third.png')
})

test('preload exposes only the expected signature IPC methods and forwards the file bytes', async () => {
  const calls = []
  let desktop
  vm.runInNewContext(await fs.readFile(path.resolve('electron/preload.cjs'), 'utf8'), {
    require: name => {
      assert.equal(name, 'electron')
      return {
        contextBridge: { exposeInMainWorld: (key, value) => { assert.equal(key, 'photixDesktop'); desktop = value } },
        ipcRenderer: { invoke: async (channel, ...args) => { calls.push({ channel, args }) } }
      }
    }
  })
  const file = { name: 'Signature.png', bytes: new Uint8Array([1, 2, 3]) }
  await desktop.getSavedSignature()
  await desktop.saveSignature(file)
  await desktop.clearSavedSignature()
  assert.deepEqual(calls, [
    { channel: 'signature:get', args: [] },
    { channel: 'signature:save', args: [file] },
    { channel: 'signature:clear', args: [] }
  ])
})
