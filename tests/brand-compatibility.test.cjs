const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
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
