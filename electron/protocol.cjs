const path = require('node:path')

const APP_URL = 'photix://app/'

function isAppUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'photix:' && url.host === 'app' && !url.username && !url.password
  } catch {
    return false
  }
}

function resolveAsset(root, value) {
  if (!isAppUrl(value)) throw new Error('Untrusted app URL')
  const pathname = decodeURIComponent(new URL(value).pathname)
  if (pathname.includes('\\') || pathname.includes('\0')) throw new Error('Invalid asset path')
  const filePath = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  const relativePath = path.relative(root, filePath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Asset path escapes the app bundle')
  }
  return filePath
}

module.exports = { APP_URL, isAppUrl, resolveAsset }
