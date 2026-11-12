// The parts of the browser helpers that also run in Node: DPI metadata and ZIP archives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDpi, zipFiles, extensionOf } from '../src/browser.js';

/** @param {Uint8Array} bytes */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A PNG chunk. @param {string} type @param {number[]} data */
function chunk(type, data) {
  const body = new Uint8Array([...Buffer.from(type, 'latin1'), ...data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.set(body, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return [...out];
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0, 0, 0, 2, 0, 1]);
const IEND = chunk('IEND', []);

/** The chunks of a PNG, with their types and CRCs checked. @param {Buffer} png */
function chunks(png) {
  assert.deepEqual([...png.subarray(0, 8)], SIGNATURE);
  /** @type {{ type: string, data: Buffer }[]} */
  const out = [];
  for (let i = 8; i < png.length;) {
    const len = png.readUInt32BE(i);
    const type = png.toString('latin1', i + 4, i + 8);
    const data = png.subarray(i + 8, i + 8 + len);
    assert.equal(png.readUInt32BE(i + 8 + len), crc32(png.subarray(i + 4, i + 8 + len)), `${type} CRC`);
    out.push({ type, data });
    i += 12 + len;
  }
  return out;
}

/** @param {Blob} blob */
const bytesOf = async (blob) => Buffer.from(await blob.arrayBuffer());

test('setDpi writes the density into a PNG, after the header and replacing any other', async () => {
  const png = new Blob([new Uint8Array([...SIGNATURE, ...IHDR, ...IDAT, ...IEND])], { type: 'image/png' });
  const out = await setDpi(png, 300);
  assert.equal(out.type, 'image/png');
  const list = chunks(await bytesOf(out));
  assert.deepEqual(
    list.map((c) => c.type),
    ['IHDR', 'pHYs', 'IDAT', 'IEND'],
  );
  const phys = list[1].data;
  assert.equal(phys.readUInt32BE(0), 11811); // 300 dpi in pixels per metre
  assert.equal(phys.readUInt32BE(4), 11811);
  assert.equal(phys[8], 1);
  // Again, at another density: still one pHYs.
  const again = chunks(await bytesOf(await setDpi(out, 72)));
  assert.deepEqual(
    again.map((c) => c.type),
    ['IHDR', 'pHYs', 'IDAT', 'IEND'],
  );
  assert.equal(again[1].data.readUInt32BE(0), 2835);
});

test('setDpi patches the JFIF header of a JPEG, or adds one', async () => {
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xd9])], { type: 'image/jpeg' });
  const out = await bytesOf(await setDpi(jpeg, 300));
  assert.equal(out.length, 22);
  assert.equal(out[13], 1);
  assert.equal(out.readUInt16BE(14), 300);
  assert.equal(out.readUInt16BE(16), 300);
  const bare = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  const added = await bytesOf(await setDpi(bare, 600));
  assert.equal(added.toString('latin1', 6, 11), 'JFIF\0');
  assert.equal(added[13], 1);
  assert.equal(added.readUInt16BE(14), 600);
  assert.deepEqual([...added.subarray(-2)], [0xff, 0xd9]);
});

test('setDpi leaves other files alone and rejects a bad density', async () => {
  const webp = new Blob(['RIFF'], { type: 'image/webp' });
  assert.equal(await setDpi(webp, 300), webp);
  const notPng = new Blob(['not a png'], { type: 'image/png' });
  assert.equal((await bytesOf(await setDpi(notPng, 300))).toString(), 'not a png');
  await assert.rejects(setDpi(webp, 0), RangeError);
  await assert.rejects(setDpi(webp, Number.NaN), RangeError);
});

test('zipFiles makes an archive that lists every file with its name and contents', async () => {
  const zip = await bytesOf(
    await zipFiles([
      { name: 'one.svg', data: '<svg/>' },
      { name: 'Война и мир.png', data: new Uint8Array([1, 2, 3]) },
      { name: 'b.txt', data: new Blob(['blob']) },
    ]),
  );
  // The end of the central directory: three entries, and where they are.
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 3);
  let at = zip.readUInt32LE(end + 16);
  /** @type {[string, string][]} */
  const found = [];
  for (let k = 0; k < 3; k++) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50);
    assert.equal(zip.readUInt16LE(at + 8) & 0x0800, 0x0800, 'UTF-8 names');
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const local = zip.readUInt32LE(at + 42);
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    const data = zip.subarray(
      local + 30 + zip.readUInt16LE(local + 26),
      local + 30 + zip.readUInt16LE(local + 26) + size,
    );
    assert.equal(zip.readUInt32LE(at + 16), crc32(data), `${name} CRC`);
    found.push([name, data.toString('latin1')]);
    at += 46 + nameLength;
  }
  assert.deepEqual(found, [
    ['one.svg', '<svg/>'],
    ['Война и мир.png', '\x01\x02\x03'],
    ['b.txt', 'blob'],
  ]);
  const empty = await bytesOf(await zipFiles([]));
  assert.equal(empty.length, 22);
});

test('extensionOf names image types', () => {
  assert.equal(extensionOf(new Blob([], { type: 'image/jpeg' })), 'jpg');
  assert.equal(extensionOf(new Blob([], { type: 'image/webp' })), 'webp');
  assert.equal(extensionOf(new Blob([], { type: 'text/plain' })), undefined);
});
