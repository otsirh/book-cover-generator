// The PDF writer: a file readers can find their way through (every offset right), with the page's boxes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfPage } from '../src/pdf.js';

/** The file as text (its JPEG bytes as they are: only the structure is read). @param {Uint8Array} bytes */
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

test('a one-page PDF of JPEG strips, with every offset where its table says', () => {
  const jpeg = (/** @type {number} */ n) => new Uint8Array([0xff, 0xd8, ...Array(n).fill(0x41), 0xff, 0xd9]);
  const bytes = pdfPage({
    width: 939.6,
    height: 666,
    bleed: 9,
    title: 'Ночь — 夜 🌙',
    images: [
      { jpeg: jpeg(10), pixelWidth: 1958, pixelHeight: 2775, x: 0, y: 0, width: 469.8, height: 666 },
      { jpeg: jpeg(20), pixelWidth: 1957, pixelHeight: 2775, x: 469.8, y: 0, width: 469.8, height: 666 },
    ],
  });
  const text = latin1(bytes);
  assert.match(text, /^%PDF-1\.4\n%\xe2\xe3\xcf\xd3\n/);
  assert.match(text, /%%EOF\n$/);
  // The cross-reference table: each object starts where it says.
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1]);
  assert.equal(text.slice(startxref, startxref + 5), 'xref\n');
  const table = /xref\n0 (\d+)\n0000000000 65535 f \n((?:\d{10} 00000 n \n)+)trailer/.exec(text);
  assert.ok(table);
  const offsets = (table[2].match(/\d{10}/g) ?? []).map(Number);
  assert.equal(offsets.length, Number(table[1]) - 1);
  offsets.forEach((at, i) =>
    assert.equal(text.slice(at, at + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1}`),
  );
  assert.match(text, /trailer\n<< \/Size 8 \/Root 1 0 R \/Info 5 0 R >>/);
  // The page, its boxes, and the strips placed side by side (PDF's y runs up from the bottom).
  assert.match(text, /\/MediaBox \[0 0 939\.6 666\] \/BleedBox \[0 0 939\.6 666\] \/TrimBox \[9 9 930\.6 657\]/);
  assert.match(text, /q 469\.8 0 0 666 0 0 cm \/Im0 Do Q\nq 469\.8 0 0 666 469\.8 0 cm \/Im1 Do Q/);
  assert.match(text, /\/XObject << \/Im0 6 0 R \/Im1 7 0 R >>/);
  assert.match(
    text,
    /\/Width 1957 \/Height 2775 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length 24 >>\nstream\n\xff\xd8A{20}\xff\xd9\nendstream/,
  );
  // A stream's length is its bytes'.
  const content = /4 0 obj\n<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(text);
  assert.equal(Number(content?.[1]), content?.[2].length);
  // The title in UTF-16, so any language survives (and an emoji as its surrogate pair).
  assert.match(text, /\/Title <FEFF041D043E0447044C002020140020591C0020D83CDF19>/);
});

test('a page of one image, no bleed, no title', () => {
  const text = latin1(
    pdfPage({
      width: 100,
      height: 50,
      images: [{ jpeg: new Uint8Array([1, 2]), pixelWidth: 4, pixelHeight: 2, x: 0, y: 0, width: 100, height: 50 }],
    }),
  );
  assert.match(text, /\/TrimBox \[0 0 100 50\]/);
  assert.match(text, /\/Title <FEFF>/);
  assert.match(text, /\/Size 7 /);
});
