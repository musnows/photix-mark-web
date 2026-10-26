const { existsSync } = require('node:fs')
const path = require('node:path')

function resolveUserDataDirectory(appData, currentDirectory) {
  const containsSettings = directory => ['desktop-settings.json', 'signatures/current.json', 'Local Storage'].some(file => existsSync(path.join(directory, file)))
  if (containsSettings(currentDirectory)) return currentDirectory
  for (const name of ['Photix Mark', 'photix-mark-desktop']) {
    const legacyDirectory = path.join(appData, name)
    if (containsSettings(legacyDirectory)) return legacyDirectory
  }
  return currentDirectory
}

function preserveUserDataDirectory(app) {
  if (app.commandLine.hasSwitch('user-data-dir')) return
  const current = app.getPath('userData')
  const directory = resolveUserDataDirectory(app.getPath('appData'), current)
  if (directory !== current) {
    app.setPath('userData', directory)
    app.setPath('sessionData', directory)
  }
}

module.exports = { resolveUserDataDirectory, preserveUserDataDirectory }
