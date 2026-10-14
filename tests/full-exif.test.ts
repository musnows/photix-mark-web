import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metadataRows, readFullExif } from '../app/lib/editor/fullExif.ts'
import { metadataFixture } from './metadata-fixture.mjs'

test('full metadata retains non-shooting tags, original values, GPS, XMP and binary data', async () => {
  const file = metadataFixture()
  const pending = readFullExif(file as any)
  assert.equal(readFullExif(file as any), pending)
  const result = await pending
  assert.equal(result.ifd0.Make, 'NIKON CORPORATION')
  assert.equal(result.ifd0.Software, 'Metadata fixture editor')
  assert.equal(result.ifd0.Copyright, 'Copyright Photix 2026')
  assert.equal(result.ifd0.Artist, 'Photix test photographer')
  assert.equal(result.exif.DateTimeOriginal, '2026:10:15 12:34:56')
  assert.deepEqual(Array.from(result.exif.MakerNote), [0x4e, 0x69, 0x6b, 0x6f, 0x6e, 0, 0xfe, 0xff])
  assert.ok(result.exif.UserComment)
  assert.deepEqual(result.gps.GPSLatitude, [31, 13, 0])
  assert.deepEqual(result.gps.GPSLongitude, [121, 28, 0])
  const rows = metadataRows(result)
  assert.ok(rows.some(row => row.value === 'Full metadata search fixture'))
  assert.ok(rows.some(row => row.key === 'exif.MakerNote' && row.binary && row.value === '4e 69 6b 6f 6e 00 fe ff'))
})

test('metadata values retain nested entries, zeros, empty data and full binary buffers', () => {
  const rows = metadataRows({ test: { zero: 0, flag: false, empty: '', nil: null, values: [1, 2], bytes: new Uint8Array([0, 255]), buffer: new Uint8Array([10]).buffer } })
  assert.equal(rows.length, 8)
  assert.equal(rows.find(row => row.key === 'test.zero')?.value, '0')
  assert.equal(rows.find(row => row.key === 'test.flag')?.value, 'false')
  assert.equal(rows.find(row => row.key === 'test.nil')?.value, 'null')
  assert.equal(rows.find(row => row.key === 'test.values.1')?.value, '2')
  assert.equal(rows.find(row => row.key === 'test.buffer')?.value, '0a')
})

test('metadata-free JPEG has no tags; invalid files can be retried', async () => {
  assert.deepEqual(await readFullExif(Buffer.from([0xff, 0xd8, 0xff, 0xd9]) as any), {})
  const invalid = Buffer.from('invalid image')
  const pending = readFullExif(invalid as any)
  await assert.rejects(pending)
  const retry = readFullExif(invalid as any)
  assert.notEqual(pending, retry)
  await assert.rejects(retry)
})
