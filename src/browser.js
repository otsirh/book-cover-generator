/* @ts-self-types="./browser.d.ts" */
// Browser helpers for exporting covers: copy, download, rasterise, zip, print PDF. (`setDpi` and
// `zipFiles` also work in Node.)
import { pdfPage } from './pdf.js';

/** SVG markup to a `data:` URL usable as an <img> src. */
export function svgToDataUrl(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function svgToBlob(svg) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * The SVG's size: its width/height attributes (unitless or px), else its viewBox.
 * @param {string} svg
 * @returns {[number, number] | null}
 */
function svgSize(svg) {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const attr = (/** @type {string} */ name) => {
    const m = new RegExp(`\\s${name}="\\s*([\\d.]+)(px)?\\s*"`).exec(tag);
    return m ? Number(m[1]) : NaN;
  };
  const w = attr('width');
  const h = attr('height');
  if (w > 0 && h > 0) return [w, h];
  const box = /\sviewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(tag);
  return box && Number(box[1]) > 0 && Number(box[2]) > 0 ? [Number(box[1]), Number(box[2])] : null;
}

/**
 * Render SVG markup to a PNG/JPEG/WebP Blob, `scale` times the SVG's size, or at exactly
 * `width` × `height` px (one of them alone keeps the SVG's shape). `dpi` is written into PNG
 * and JPEG files, for print.
 * @param {string} svg
 * @param {{ type?: string, scale?: number, width?: number, height?: number, quality?: number, background?: string, dpi?: number }} [opts]
 */
export async function rasterize(
  svg,
  { type = 'image/png', scale = 1, width, height, quality = 0.92, background, dpi } = {},
) {
  for (const [name, value] of /** @type {const} */ ([
    ['scale', scale],
    ['width', width],
    ['height', height],
    ['dpi', dpi],
  ])) {
    if (value !== undefined && !(Number.isFinite(value) && value > 0)) {
      throw new RangeError(`rasterize: ${name} must be a positive number, got ${String(value)}`);
    }
  }
  const img = new Image();
  img.decoding = 'async';
  img.src = svgToDataUrl(svg);
  await img.decode();
  // Without a usable size in the markup, use the size the browser gives the image.
  const [sw, sh] = svgSize(svg) ?? [img.naturalWidth || 300, img.naturalHeight || 150];
  const w = Math.max(1, Math.round(width ?? (height ? (height * sw) / sh : sw * scale)));
  const h = Math.max(1, Math.round(height ?? (width ? (width * sh) / sw : sh * scale)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  if (background || type === 'image/jpeg') {
    ctx.fillStyle = background || '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  /** @type {Blob} */
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        // Free the canvas memory now: Safari caps the total, and a 4× export is tens of MB.
        canvas.width = canvas.height = 0;
        if (result) resolve(result);
        else reject(new Error('Canvas export failed'));
      },
      type,
      quality,
    );
  });
  return dpi ? setDpi(blob, dpi) : blob;
}

/**
 * A print-ready PDF of an SVG whose px are CSS px (96 to the inch), as `createPrintCover` makes:
 * one page at its size, drawn at `dpi` (300 by default, what printers ask for) as JPEG, with its
 * trim box `bleed` inches inside the page. A page too large for one canvas (browsers cap their
 * size; iPhones and iPads at 16.7 million pixels) is drawn in strips, side by side.
 * @param {string} svg
 * @param {{ dpi?: number, quality?: number, bleed?: number, title?: string, maxPixels?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function svgToPdf(svg, { dpi = 300, quality = 0.95, bleed = 0, title = '', maxPixels = 16_777_216 } = {}) {
  const size = svgSize(svg);
  if (!size) throw new RangeError('svgToPdf: the SVG needs a width and height (or a viewBox)');
  // Its size in CSS px (or unitless): a size in mm, in, pt or % would make a page of the wrong size.
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  for (const name of ['width', 'height']) {
    const unit = new RegExp(`\\s${name}="\\s*[\\d.]+\\s*([a-z%]+)\\s*"`, 'i').exec(tag)?.[1];
    if (unit && unit.toLowerCase() !== 'px') {
      throw new RangeError(`svgToPdf: the SVG's ${name} is in ${unit}; give it in px, 96 to the inch`);
    }
  }
  for (const [name, value] of /** @type {const} */ ([
    ['dpi', dpi],
    ['quality', quality],
    ['maxPixels', maxPixels],
  ])) {
    if (!(Number.isFinite(value) && value > 0)) throw new RangeError(`svgToPdf: ${name} must be a positive number`);
  }
  const [sw, sh] = size;
  if (!(Number.isFinite(bleed) && bleed >= 0 && 2 * bleed < Math.min(sw, sh) / 96)) {
    throw new RangeError(`svgToPdf: bleed must be a number of inches from 0, less than half the page, got ${bleed}`);
  }
  const [pageW, pageH] = [(sw / 96) * 72, (sh / 96) * 72];
  const [pw, ph] = [Math.max(1, Math.round((sw / 96) * dpi)), Math.max(1, Math.round((sh / 96) * dpi))];
  // Strips as wide as fit maxPixels at the page's height, so none is over it.
  const stripPixels = Math.min(pw, Math.floor(maxPixels / ph));
  if (stripPixels < 1) throw new RangeError(`svgToPdf: a page ${ph} px tall can't be drawn in ${maxPixels} pixels`);
  const strips = Math.ceil(pw / stripPixels);
  // The root's viewBox, which each strip narrows to its own part.
  const box = /\sviewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(tag);
  const [vx, vy, vw, vh] = box ? box.slice(1, 5).map(Number) : [0, 0, sw, sh];
  /** @type {import('./pdf.js').PdfImage[]} */
  const images = [];
  for (let x0 = 0; x0 < pw; x0 += stripPixels) {
    const w = Math.min(stripPixels, pw - x0);
    const part =
      strips === 1
        ? svg
        : svg.replace(
            tag,
            // (A function, so a "$&" in the tag's text isn't read as a replacement pattern.)
            () =>
              tag
                .replace(/\s(width|height|viewBox)="[^"]*"/g, '')
                .replace(
                  /^<svg\b/i,
                  `<svg width="${(w / pw) * sw}" height="${sh}" viewBox="${vx + (x0 / pw) * vw} ${vy} ${(w / pw) * vw} ${vh}"`,
                ),
          );
    const jpeg = await rasterize(part, { type: 'image/jpeg', width: w, height: ph, quality, background: '#ffffff' });
    images.push({
      jpeg: new Uint8Array(await jpeg.arrayBuffer()),
      pixelWidth: w,
      pixelHeight: ph,
      x: (x0 / pw) * pageW,
      y: 0,
      width: (w / pw) * pageW,
      height: pageH,
    });
  }
  const pdf = pdfPage({ width: pageW, height: pageH, bleed: bleed * 72, title, images });
  return new Blob([/** @type {BlobPart} */ (pdf)], { type: 'application/pdf' });
}

/* ----------------------------------------------------------- bytes and files */

/** @type {Uint32Array | undefined} */
let crcTable;

/** CRC-32 (as in PNG and ZIP) of some bytes. @param {Uint8Array} bytes */
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** @param {Uint8Array[]} parts */
function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG with its pixel density set (a pHYs chunk after the header, replacing any other). @param {Uint8Array} png @param {number} dpi */
function pngWithDpi(png, dpi) {
  if (!PNG_SIGNATURE.every((b, i) => png[i] === b)) return png;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const phys = new Uint8Array(21);
  const pv = new DataView(phys.buffer);
  const perMetre = Math.round(dpi / 0.0254);
  pv.setUint32(0, 9);
  phys.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  pv.setUint32(8, perMetre);
  pv.setUint32(12, perMetre);
  phys[16] = 1; // the unit is the metre
  pv.setUint32(17, crc32(phys.subarray(4, 17)));
  /** @type {Uint8Array[]} */
  const parts = [png.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= png.length) {
    const end = i + 12 + view.getUint32(i);
    if (end > png.length) return png;
    const type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    if (type !== 'pHYs') parts.push(png.subarray(i, end));
    if (type === 'IHDR') parts.push(phys);
    i = end;
  }
  return concat(parts);
}

/** A JPEG with its pixel density set in the JFIF header (added if missing). @param {Uint8Array} jpeg @param {number} dpi */
function jpegWithDpi(jpeg, dpi) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const d = Math.min(65535, Math.round(dpi));
  const jfif = jpeg[2] === 0xff && jpeg[3] === 0xe0 && String.fromCharCode(...jpeg.subarray(6, 11)) === 'JFIF\0';
  if (jfif && jpeg.length > 18) {
    const out = jpeg.slice();
    out[13] = 1; // dots per inch
    out.set([d >> 8, d & 255, d >> 8, d & 255], 14);
    return out;
  }
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 255, d >> 8, d & 255, 0, 0];
  return concat([jpeg.subarray(0, 2), new Uint8Array(app0), jpeg.subarray(2)]);
}

/**
 * A copy of a PNG or JPEG Blob that says it has `dpi` pixels per inch (what print software reads
 * for the printed size). Other types come back unchanged.
 * @param {Blob} blob @param {number} dpi
 * @returns {Promise<Blob>}
 */
export async function setDpi(blob, dpi) {
  if (!(Number.isFinite(dpi) && dpi > 0)) throw new RangeError(`setDpi: dpi must be a positive number, got ${dpi}`);
  if (blob.type !== 'image/png' && blob.type !== 'image/jpeg') return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = blob.type === 'image/png' ? pngWithDpi(bytes, dpi) : jpegWithDpi(bytes, dpi);
  return new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (out)], { type: blob.type });
}

/**
 * A ZIP archive (stored, not compressed: images are compressed already) of the given files.
 * Names are UTF-8; give each file a unique name.
 * @param {{ name: string, data: Blob | Uint8Array | string }[]} files
 * @returns {Promise<Blob>}
 */
export async function zipFiles(files) {
  if (files.length > 0xffff) throw new RangeError('zipFiles: at most 65535 files');
  const encoder = new TextEncoder();
  const now = new Date();
  // MS-DOS time and date, in local time as zip tools expect (two-second steps, from 1980).
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = (Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  /** @type {(Uint8Array | Blob)[]} */
  const parts = [];
  /** @type {Uint8Array[]} */
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const blob = file.data instanceof Blob ? file.data : null;
    const bytes = blob
      ? null
      : typeof file.data === 'string'
        ? encoder.encode(file.data)
        : /** @type {Uint8Array} */ (file.data);
    const size = blob ? blob.size : /** @type {Uint8Array} */ (bytes).length;
    if (offset + 30 + name.length + size > 0xffffffff) throw new RangeError('zipFiles: over 4 GB');
    // (A Blob is read only for its checksum, and the archive holds the Blob itself, not a copy.)
    const crc = crc32(bytes ?? new Uint8Array(await /** @type {Blob} */ (blob).arrayBuffer()));
    const local = new Uint8Array(30);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed: 2.0
    lv.setUint16(6, 0x0800, true); // names are UTF-8
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    parts.push(local, name, blob ?? /** @type {Uint8Array} */ (bytes));
    const entry = new Uint8Array(46);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.push(entry, name);
    offset += 30 + name.length + size;
  }
  const size = central.reduce((sum, p) => sum + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  return new Blob(/** @type {(Uint8Array<ArrayBuffer> | Blob)[]} */ ([...parts, ...central, end]), {
    type: 'application/zip',
  });
}

/** Trigger a file download for a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers (iOS Safari) fetch the file only after the user confirms the download.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

/**
 * Download a cover in the given format. Resolves to the file name it saved, whose extension
 * says what was made: browsers that can't encode WebP (Safari) make a PNG.
 * @param {string} svg
 * @param {'svg'|'png'|'jpeg'|'jpg'|'webp'} [format='svg']
 * @param {string} [basename='cover']
 * @param {{ scale?: number, width?: number, height?: number, quality?: number, background?: string, dpi?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function downloadCover(svg, format = 'svg', basename = 'cover', opts = {}) {
  if (format === 'svg') {
    downloadBlob(svgToBlob(svg), `${basename}.svg`);
    return `${basename}.svg`;
  }
  const ext = format === 'jpeg' || format === 'jpg' ? 'jpg' : format;
  const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const blob = await rasterize(svg, { ...opts, type });
  // Browsers that can't encode a type (e.g. WebP in Safari) return PNG instead; name the file after what we got.
  const name = `${basename}.${extensionOf(blob) ?? ext}`;
  downloadBlob(blob, name);
  return name;
}

/** The file extension for an image Blob's type, if it is one of ours. @param {Blob} blob */
export function extensionOf(blob) {
  return /** @type {Record<string, string>} */ ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[
    blob.type
  ];
}

/**
 * Copy a cover to the clipboard as a PNG image (`scale`, `width`, `height` as for `rasterize`).
 * Needs a secure page and a browser that can write images to the clipboard (check `canCopyImage()`).
 * @param {string} svg
 * @param {{ scale?: number, width?: number, height?: number, background?: string }} [opts]
 */
export async function copyImage(svg, opts = {}) {
  if (!canCopyImage()) throw new Error('This browser cannot copy images');
  const png = rasterize(svg, { ...opts, type: 'image/png' });
  // Handled below; without this, a failed render would also be reported as unhandled.
  png.catch(() => {});
  /** @type {ClipboardItem} */
  let item;
  try {
    // A promise of the image, so Safari still counts the copy as part of the click.
    item = new ClipboardItem({ 'image/png': png });
  } catch {
    // Browsers that want the image itself.
    item = new ClipboardItem({ 'image/png': await png });
  }
  await navigator.clipboard.write([item]);
}

/** Whether `copyImage` can work here. */
export function canCopyImage() {
  return typeof ClipboardItem === 'function' && Boolean(navigator.clipboard?.write) && window.isSecureContext;
}

/** Copy text (e.g. SVG markup) to the clipboard, with a fallback for older browsers. */
export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      // Refused (permissions policy, an unfocused page, an iframe without clipboard-write):
      // the older copy command below often still works.
      if (!copyWithCommand(text)) throw err;
      return;
    }
  }
  if (!copyWithCommand(text)) throw new Error('Copy failed');
}

/** Copy through a hidden textarea and the copy command; whether it worked. @param {string} text */
function copyWithCommand(text) {
  // Selecting the textarea moves focus to it; give focus back afterwards.
  const focused = document.activeElement;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand('copy');
  } finally {
    ta.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}
