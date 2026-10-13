const { readFileSync } = require('node:fs')
const { appDirectory } = JSON.parse(readFileSync('.desktop/current.json', 'utf8'))

module.exports = {
  appId: 'cc.photix.mark.desktop',
  productName: 'Photix Mark',
  directories: { app: appDirectory, output: 'release' },
  files: ['package.json', 'electron/*.cjs', 'renderer/**/*', '!**/*.map', '!node_modules/**/*'],
  asar: true,
  npmRebuild: false,
  compression: 'maximum',
  electronLanguages: ['en', 'zh_CN', 'zh_TW'],
  artifactName: 'Photix-Mark-${version}-${os}-${arch}.${ext}',
  mac: {
    category: 'public.app-category.photography',
    identity: process.env.CSC_NAME || '-',
    icon: process.platform === 'darwin' ? '.desktop/photix.icns' : 'public/android-chrome-512x512.png',
    target: ['dmg', 'zip']
  },
  win: { icon: 'public/android-chrome-512x512.png', target: ['nsis'] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
  linux: { icon: 'public/android-chrome-512x512.png', category: 'Graphics', target: ['AppImage'] }
}
