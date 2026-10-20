const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { createExportStore } = require('../electron/storage.cjs')
const { APP_URL, isAppUrl, resolveAsset } = require('../electron/protocol.cjs')

test('local protocol resolves assets and rejects foreign origins and traversal', () => {
  const root = path.resolve('renderer')
  assert.equal(resolveAsset(root, APP_URL), path.join(root, 'index.html'))
  assert.equal(resolveAsset(root, 'photix://app/detect'), path.join(root, 'index.html'))
  assert.equal(resolveAsset(root, 'photix://app/detect/?source=editor'), path.join(root, 'index.html'))
  assert.equal(resolveAsset(root, 'photix://app/demo/%E7%85%A7%E7%89%87.JPG'), path.join(root, 'demo/照片.JPG'))
  assert.equal(isAppUrl('https://app/'), false)
  assert.equal(isAppUrl('photix://app.evil/'), false)
  assert.equal(isAppUrl('photix://user@app/'), false)
  assert.throws(() => resolveAsset(root, 'photix://app/..%2fsecret.txt'))
  assert.throws(() => resolveAsset(root, 'photix://app/%5csecret.txt'))
  assert.throws(() => resolveAsset(root, 'file:///etc/passwd'))
})

test('directory settings persist, invalid changes preserve settings, and exports never overwrite', async () => {
  const parent = path.resolve('.ai-docs/test-data')
  await fs.mkdir(parent, { recursive: true })
  const root = await fs.mkdtemp(path.join(parent, 'export-'))
  const directory = path.join(root, '照片 导出')
  await fs.mkdir(directory)
  const settings = path.join(root, 'settings', 'desktop-settings.json')
  const store = await createExportStore(settings, root)
  assert.equal(store.getDirectory(), root)
  await store.setDirectory(directory)
  const reopened = await createExportStore(settings, root)
  assert.equal(reopened.getDirectory(), directory)
  const data = new Uint8Array([255, 216, 255, 217])
  const saved = await Promise.all([reopened.saveFile({ name: '测试.jpg', bytes: data }), reopened.saveFile({ name: '测试.jpg', bytes: data })])
  assert.equal(new Set(saved).size, 2)
  for (const file of saved) assert.deepEqual(await fs.readFile(file), Buffer.from(data))
  assert.deepEqual((await fs.readdir(directory)).sort(), ['测试 (1).jpg', '测试.jpg'])
  assert.equal(path.dirname(await reopened.saveFile({ name: 'batch.zip', bytes: new Uint8Array([80, 75, 3, 4]) })), directory)
  await assert.rejects(reopened.setDirectory(path.join(root, 'missing')))
  assert.equal(reopened.getDirectory(), directory)
  await assert.rejects(reopened.setDirectory('relative'))
  for (const name of ['../escape.jpg', '..\\escape.jpg', '', '..']) {
    await assert.rejects(reopened.saveFile({ name, bytes: data }))
  }
  assert.equal(path.basename(await reopened.saveFile({ name: 'CON.jpg', bytes: data })), '_CON.jpg')
  assert.equal(path.basename(await reopened.saveFile({ name: 'a:b?.jpg', bytes: data })), 'a_b_.jpg')
  const longName = `${'照'.repeat(83)}.jpg`
  const longPaths = await Promise.all([reopened.saveFile({ name: longName, bytes: data }), reopened.saveFile({ name: longName, bytes: data })])
  assert.equal(new Set(longPaths).size, 2)
  for (const file of longPaths) assert.ok(Buffer.byteLength(path.basename(file)) <= 255)
  await assert.rejects(reopened.saveFile({ name: 'empty.jpg', bytes: new Uint8Array() }))
  await reopened.setDirectory(root)
  assert.equal((await createExportStore(settings, directory)).getDirectory(), root)
})

test('internal detector windows retain navigation and IPC isolation', async () => {
  const windows = []
  const handlers = new Map()
  const externalLinks = []
  let dialogOwner
  let savedFile
  class TestWindow extends EventEmitter {
    constructor() {
      super()
      this.webContents = new EventEmitter()
      this.webContents.mainFrame = { url: APP_URL }
      this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler }
      windows.push(this)
    }
    loadURL(url) { this.webContents.mainFrame.url = url }
    static fromWebContents(contents) { return windows.find(window => window.webContents === contents) }
    static getAllWindows() { return windows }
  }
  const app = Object.assign(new EventEmitter(), {
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    getPath: name => `/test/${name}`
  })
  const electron = {
    app,
    BrowserWindow: TestWindow,
    dialog: { showOpenDialog: async window => { dialogOwner = window; return { canceled: true, filePaths: [] } } },
    ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) },
    Menu: { buildFromTemplate: value => value, setApplicationMenu: () => {} },
    net: {},
    protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
    session: { defaultSession: {
      setPermissionRequestHandler: () => {},
      setPermissionCheckHandler: () => {},
      webRequest: { onHeadersReceived: () => {} }
    } },
    shell: { openExternal: async url => { externalLinks.push(url) } }
  }
  vm.runInNewContext(await fs.readFile(path.resolve('electron/main.cjs'), 'utf8'), {
    __dirname: path.resolve('electron'),
    console,
    URL,
    process: { platform: 'darwin' },
    require: name => {
      if (name === 'electron') return electron
      if (name === './protocol.cjs') return require('../electron/protocol.cjs')
      if (name === './storage.cjs') return { createExportStore: async () => ({
        getDirectory: () => '/test/exports',
        saveFile: file => { savedFile = file; return '/test/exports/photo.jpg' }
      }) }
      return require(name)
    }
  }, { filename: 'electron/main.cjs' })
  await new Promise(resolve => setImmediate(resolve))
  const main = windows[0]
  const opened = main.openHandler({ url: 'photix://app/detect' })
  assert.equal(opened.action, 'allow')
  assert.equal(opened.overrideBrowserWindowOptions.webPreferences.sandbox, true)
  assert.equal(opened.overrideBrowserWindowOptions.webPreferences.contextIsolation, true)
  assert.equal(opened.overrideBrowserWindowOptions.webPreferences.nodeIntegration, false)
  for (const url of ['https://example.com/', 'file:///etc/passwd', 'photix://app.evil/detect', 'javascript:alert(1)']) {
    assert.equal(main.openHandler({ url }).action, 'deny')
  }
  assert.deepEqual(externalLinks, ['https://example.com/'])

  const child = new TestWindow()
  child.loadURL('photix://app/detect')
  main.webContents.emit('did-create-window', child)
  const event = { sender: child.webContents, senderFrame: child.webContents.mainFrame }
  assert.equal(await handlers.get('export:get-directory')(event), '/test/exports')
  assert.equal(await handlers.get('export:choose-directory')(event), null)
  assert.equal(dialogOwner, child)
  const file = { name: 'photo.jpg', bytes: new Uint8Array([1]) }
  assert.equal(await handlers.get('export:save-file')(event, file), '/test/exports/photo.jpg')
  assert.equal(savedFile, file)
  assert.equal(child.openHandler({ url: 'file:///etc/passwd' }).action, 'deny')
  await assert.rejects(handlers.get('export:get-directory')({ ...event, senderFrame: { url: APP_URL } }), /Untrusted IPC sender/)
  const unregistered = new TestWindow()
  await assert.rejects(handlers.get('export:get-directory')({ sender: unregistered.webContents, senderFrame: unregistered.webContents.mainFrame }), /Untrusted IPC sender/)
  child.webContents.mainFrame.url = 'https://example.com/'
  await assert.rejects(handlers.get('export:get-directory')(event), /Untrusted IPC sender/)
  child.webContents.mainFrame.url = 'photix://app/detect'
  child.emit('closed')
  await assert.rejects(handlers.get('export:get-directory')(event), /Untrusted IPC sender/)
})
