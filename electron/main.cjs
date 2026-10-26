const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { APP_URL, isAppUrl, resolveAsset } = require('./protocol.cjs')
const { createExportStore, createSignatureStore } = require('./storage.cjs')
const { preserveUserDataDirectory } = require('./dataDirectory.cjs')

app.setName('映签')
preserveUserDataDirectory(app)

protocol.registerSchemesAsPrivileged([
  { scheme: 'photix', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let mainWindow
let exportStore
let signatureStore
const appWindows = new Set()

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || !appWindows.has(window)
      || event.senderFrame !== window.webContents.mainFrame || !isAppUrl(event.senderFrame.url)) {
      throw new Error('Untrusted IPC sender')
    }
    return callback(window, ...args)
  })
}

function openExternal(value) {
  try {
    const url = new URL(value)
    if (['https:', 'http:', 'mailto:'].includes(url.protocol)) {
      shell.openExternal(url.href).catch(error => console.error('Failed to open external link:', error))
    }
  } catch (error) {
    console.error('Invalid external link:', error)
  }
}

function secureWindow(window) {
  appWindows.add(window)
  window.once('closed', () => appWindows.delete(window))
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          title: '映签',
          width: 1100,
          height: 900,
          minWidth: 420,
          minHeight: 600,
          show: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
          }
        }
      }
    }
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('did-create-window', child => secureWindow(child))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternal(url)
    }
  })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`Renderer load failed (${code}): ${description}`)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '映签',
    width: 1440,
    height: 960,
    minWidth: 420,
    minHeight: 600,
    backgroundColor: '#ffffff',
    show: false,
    icon: path.join(__dirname, '../renderer/android-chrome-512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  secureWindow(mainWindow)
  mainWindow.on('closed', () => { mainWindow = undefined })
  mainWindow.loadURL(APP_URL)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(async () => {
    exportStore = await createExportStore(path.join(app.getPath('userData'), 'desktop-settings.json'), app.getPath('downloads'))
    signatureStore = createSignatureStore(path.join(app.getPath('userData'), 'signatures'), file => shell.trashItem(file))
    protocol.handle('photix', async request => {
      try {
        if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
        const filePath = resolveAsset(path.join(__dirname, '../renderer'), request.url)
        return await net.fetch(pathToFileURL(filePath).href)
      } catch (error) {
        console.error('Failed to serve app asset:', error)
        return new Response('Not found', { status: 404 })
      }
    })
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.webRequest.onHeadersReceived({ urls: ['photix://app/*'] }, (details, callback) => {
      callback({ responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'"]
      } })
    })
    handle('export:get-directory', () => exportStore.getDirectory())
    handle('export:choose-directory', async (window) => {
      const result = await dialog.showOpenDialog(window, {
        title: '选择导出目录',
        defaultPath: exportStore.getDirectory(),
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return exportStore.setDirectory(result.filePaths[0])
    })
    handle('export:reset-directory', () => exportStore.setDirectory(app.getPath('downloads')))
    handle('export:open-directory', async () => {
      const error = await shell.openPath(exportStore.getDirectory())
      if (error) throw new Error(error)
    })
    handle('export:save-file', (_window, file) => exportStore.saveFile(file))
    handle('signature:get', () => signatureStore.getSignature())
    handle('signature:save', (_window, file) => signatureStore.saveSignature(file))
    handle('signature:clear', () => signatureStore.clearSignature())
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ]))
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }).catch(error => {
    console.error('Failed to start Yingqian:', error)
    dialog.showErrorBox('映签 启动失败', '无法加载客户端，请检查应用文件和设置目录。')
    app.quit()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
