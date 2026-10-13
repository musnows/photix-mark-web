const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { APP_URL, isAppUrl, resolveAsset } = require('./protocol.cjs')
const { createExportStore } = require('./storage.cjs')

protocol.registerSchemesAsPrivileged([
  { scheme: 'photix', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let mainWindow
let exportStore

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents
      || event.senderFrame !== mainWindow.webContents.mainFrame || !isAppUrl(event.senderFrame.url)) {
      throw new Error('Untrusted IPC sender')
    }
    return callback(...args)
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

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Photix Mark',
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternal(url)
    }
  })
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault())
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`Renderer load failed (${code}): ${description}`)
  })
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
    handle('export:choose-directory', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
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
    handle('export:save-file', file => exportStore.saveFile(file))
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
    console.error('Failed to start Photix Mark:', error)
    dialog.showErrorBox('Photix Mark 启动失败', '无法加载客户端，请检查应用文件和设置目录。')
    app.quit()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
