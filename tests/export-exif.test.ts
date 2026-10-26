import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { ExifExportError, preserveExportExif } from '../app/lib/editor/exportExif.ts'
import { readFullExif } from '../app/lib/editor/fullExif.ts'
import { metadataFixture } from './metadata-fixture.mjs'

const jpeg = () => sharp({ create: { width: 120, height: 80, channels: 3, background: '#a45b32' } }).jpeg().toBuffer()
const read = async (blob: Blob) => readFullExif(Buffer.from(await blob.arrayBuffer()) as any)
const tiffFromFixture = () => {
  const source = metadataFixture()
  return source.subarray(12, 4 + source.readUInt16BE(4))
}

function withTiff(image: Buffer, tiff: Buffer) {
  const header = Buffer.from([0xff, 0xe1, 0, 0, 69, 120, 105, 102, 0, 0])
  header.writeUInt16BE(tiff.length + 8, 2)
  return Buffer.concat([image.subarray(0, 2), header, tiff, image.subarray(2)])
}

function propertyTiff(littleEndian: boolean) {
  const buffer = Buffer.alloc(128)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  buffer.write(littleEndian ? 'II' : 'MM')
  const short = (offset: number, value: number) => view.setUint16(offset, value, littleEndian)
  const long = (offset: number, value: number) => view.setUint32(offset, value, littleEndian)
  short(2, 42)
  long(4, 8)
  function directory(offset: number, entries: number[][], next = 0) {
    short(offset, entries.length)
    entries.forEach(([tag, type, value], index) => {
      const entry = offset + 2 + index * 12
      short(entry, tag!)
      short(entry + 2, type!)
      long(entry + 4, 1)
      if (type === 3) short(entry + 8, value!)
      else long(entry + 8, value!)
    })
    long(offset + 2 + entries.length * 12, next)
  }
  directory(8, [[0x0100, 3, 400], [0x0101, 4, 300], [0x0112, 3, 6], [0x8769, 4, 62]], 104)
  directory(62, [[0xa001, 3, 65535], [0xa002, 4, 400], [0xa003, 3, 300]])
  directory(104, [[0x0112, 3, 6]])
  return buffer
}

function heifFixture(tiff: Buffer, brand: string) {
  function box(type: string, data: Buffer) {
    const header = Buffer.alloc(8)
    header.writeUInt32BE(data.length + 8)
    header.write(type, 4)
    return Buffer.concat([header, data])
  }
  const ftyp = box('ftyp', Buffer.concat([Buffer.from(brand), Buffer.alloc(4), Buffer.from(brand)]))
  const infe = box('infe', Buffer.from([2, 0, 0, 0, 0, 1, 0, 0, 69, 120, 105, 102, 0]))
  const iinf = box('iinf', Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1]), infe]))
  const location = Buffer.alloc(22)
  location.set([0, 0, 0, 0, 0x44, 0, 0, 1, 0, 1, 0, 0, 0, 1])
  const makeMeta = () => box('meta', Buffer.concat([Buffer.alloc(4), iinf, box('iloc', location)]))
  location.writeUInt32BE(ftyp.length + makeMeta().length + 8, 14)
  location.writeUInt32BE(tiff.length + 4, 18)
  return Buffer.concat([ftyp, makeMeta(), box('mdat', Buffer.concat([Buffer.alloc(4), tiff]))])
}

test('exports original EXIF by default, preserving GPS, copyright, MakerNote and image pixels', async () => {
  const image = await jpeg()
  const source = new Blob([metadataFixture(image)])
  const output = new Blob([image], { type: 'image/jpeg' })
  const exported = await preserveExportExif(output, source)
  const original = await read(source)
  const result = await read(exported)
  assert.deepEqual(result.ifd0, original.ifd0)
  assert.deepEqual(result.exif, original.exif)
  assert.deepEqual(result.gps, original.gps)
  assert.equal(result.ifd0.Model, 'NIKON Zf')
  assert.equal(result.ifd0.Copyright, 'Copyright Yingqian 2026')
  assert.equal(exported.type, 'image/jpeg')
  assert.deepEqual(await sharp(Buffer.from(await exported.arrayBuffer())).raw().toBuffer(), await sharp(image).raw().toBuffer())
  assert.deepEqual(await source.arrayBuffer(), await new Blob([metadataFixture(image)]).arrayBuffer())
})

test('opting out and toggling back on never contaminates the cached image or original metadata', async () => {
  const image = await jpeg()
  const output = new Blob([image], { type: 'image/jpeg' })
  const source = new Blob([metadataFixture(image)])
  const enabled = await preserveExportExif(output, source)
  assert.equal(await preserveExportExif(output, source, false), output)
  assert.equal((await read(output)).exif, undefined)
  assert.deepEqual(await (await preserveExportExif(output, source)).arrayBuffer(), await enabled.arrayBuffer())
  assert.deepEqual(await (await preserveExportExif(enabled, source)).arrayBuffer(), await enabled.arrayBuffer())
})

test('corrects orientation, dimensions and color space in both TIFF byte orders and detaches stale thumbnails', async () => {
  for (const littleEndian of [true, false]) {
    const image = await jpeg()
    const source = new Blob([withTiff(image, propertyTiff(littleEndian))])
    const exported = await preserveExportExif(new Blob([image]), source)
    const result = await read(exported)
    assert.equal(result.ifd0.Orientation, 1)
    assert.equal(result.ifd0.ImageWidth, 120)
    assert.equal(result.ifd0.ImageHeight, 80)
    assert.equal(result.exif.ExifImageWidth, 120)
    assert.equal(result.exif.ExifImageHeight, 80)
    assert.equal(result.exif.ColorSpace, 1)
    assert.equal(result.ifd1, undefined)
    assert.equal((await read(source)).ifd0.Orientation, 6)
    const decoded = await sharp(Buffer.from(await exported.arrayBuffer())).autoOrient().metadata()
    assert.equal(decoded.width, 120)
    assert.equal(decoded.height, 80)
  }
})

test('preserves EXIF from PNG and WebP sources', async () => {
  const output = new Blob([await jpeg()])
  for (const format of ['png', 'webp'] as const) {
    const source = new Blob([await sharp(metadataFixture(await jpeg())).keepExif().toFormat(format).toBuffer()])
    const original = await sharp(Buffer.from(await source.arrayBuffer())).metadata()
    assert.ok(original.exif)
    const exported = await read(await preserveExportExif(output, source))
    assert.equal(exported.ifd0.Model, 'NIKON Zf')
    assert.equal(exported.ifd0.Copyright, 'Copyright Yingqian 2026')
    assert.deepEqual(exported.gps.GPSLatitude, [31, 13, 0])
    assert.deepEqual(Array.from(exported.exif.MakerNote), [78, 105, 107, 111, 110, 0, 254, 255])
  }
})

test('locates original EXIF in HEIC and AVIF containers', async () => {
  const output = new Blob([await jpeg()])
  for (const brand of ['heic', 'avif']) {
    const source = new Blob([heifFixture(tiffFromFixture(), brand)])
    const exported = await read(await preserveExportExif(output, source))
    assert.equal(exported.ifd0.Model, 'NIKON Zf')
    assert.deepEqual(exported.gps.GPSLongitude, [121, 28, 0])
    assert.deepEqual(Array.from(exported.exif.MakerNote), [78, 105, 107, 111, 110, 0, 254, 255])
  }
})

test('metadata-free images remain exportable without fabricated EXIF', async () => {
  const output = new Blob([await jpeg()])
  for (const format of ['jpeg', 'png', 'webp', 'gif'] as const) {
    const source = new Blob([await sharp(await jpeg()).toFormat(format).toBuffer()])
    assert.equal(await preserveExportExif(output, source), output)
  }
})

test('reports malformed and oversized metadata instead of silently dropping it', async () => {
  const image = await jpeg()
  const output = new Blob([image])
  const invalid = propertyTiff(true)
  invalid.writeUInt32LE(0xffffffff, 4)
  const cyclic = propertyTiff(true)
  cyclic.writeUInt32LE(8, 54)
  const png = Buffer.alloc(12 + 65536)
  png.writeUInt32BE(65536)
  png.write('eXIf', 4)
  const oversized = new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), png])
  for (const source of [new Blob([withTiff(image, invalid)]), new Blob([withTiff(image, cyclic)]), oversized]) {
    await assert.rejects(preserveExportExif(output, source), ExifExportError)
    assert.equal(await preserveExportExif(output, source, false), output)
  }
})
