import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, stat } from 'node:fs/promises'
import { BUILTIN_LOGOS } from '../app/lib/editor/builtinLogos.ts'

test('every selectable built-in logo exists and the catalog covers all bundled logo files', async () => {
  const bundled = (await readdir(new URL('../public/logos/', import.meta.url))).filter(file => /\.(png|svg)$/.test(file))
  assert.equal(new Set(BUILTIN_LOGOS.map(logo => logo.path)).size, BUILTIN_LOGOS.length)
  assert.deepEqual(BUILTIN_LOGOS.map(logo => logo.path.split('/').pop()).sort(), bundled.sort())
  for (const logo of BUILTIN_LOGOS) {
    assert.ok((await stat(new URL(`../public${logo.path}`, import.meta.url))).size > 0, `Missing logo: ${logo.path}`)
  }
})
