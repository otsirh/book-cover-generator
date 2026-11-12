// A minimal PDF: one page of JPEG images, with its bleed and trim boxes, which is what a print
// service takes as a cover file. No DOM here (./browser draws the images), so Node tests it.

/** A number as PDF writes it: at most three decimals. @param {number} v */
const num = (v) => String(Math.round(v * 1000) / 1000);

/** Text as a PDF string in UTF-16 (any language), hex-encoded. @param {string} text */
function pdfText(text) {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

/**
 * @typedef {object} PdfImage  A JPEG on the page.
 * @property {Uint8Array} jpeg  the JPEG file (RGB, as a canvas makes it)
 * @property {number} pixelWidth  its width in pixels
 * @property {number} pixelHeight  its height in pixels
 * @property {number} x  where its left edge goes, in points from the page's left
 * @property {number} y  where its top edge goes, in points from the page's top
 * @property {number} width  its width on the page, in points
 * @property {number} height  its height on the page, in points
 */

/**
 * One page of JPEG images as a PDF file. The page's size is in points (72 to the inch); `bleed`
 * (points) sets the trim box that far inside it on every side.
 * @param {{ width: number, height: number, bleed?: number, title?: string, images: PdfImage[] }} page
 * @returns {Uint8Array}
 */
export function pdfPage({ width, height, bleed = 0, title = '', images }) {
  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const parts = [];
  let length = 0;
  /** @param {string | Uint8Array} data */
  const write = (data) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  /** @type {number[]} */
  const offsets = [];
  /** @param {number} id @param {string} body @param {Uint8Array} [stream] */
  const object = (id, body, stream) => {
    offsets[id] = length;
    write(`${id} 0 obj\n${body}\n`);
    if (stream) {
      write('stream\n');
      write(stream);
      write('\nendstream\n');
    }
    write('endobj\n');
  };

  // (The second line's bytes above 127 tell tools the file holds binary data.)
  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const first = 6;
  const names = images.map((_, i) => `/Im${i} ${first + i} 0 R`).join(' ');
  const content = encoder.encode(
    images
      .map(
        (im, i) =>
          `q ${num(im.width)} 0 0 ${num(im.height)} ${num(im.x)} ${num(height - im.y - im.height)} cm /Im${i} Do Q`,
      )
      .join('\n'),
  );
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const box = `[0 0 ${num(width)} ${num(height)}]`;
  const trim = `[${num(bleed)} ${num(bleed)} ${num(width - bleed)} ${num(height - bleed)}]`;
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox ${box} /BleedBox ${box} /TrimBox ${trim} ` +
      `/Resources << /XObject << ${names} >> >> /Contents 4 0 R >>`,
  );
  object(4, `<< /Length ${content.length} >>`, content);
  object(5, `<< /Title ${pdfText(title)} /Producer (Book Cover Generator) >>`);
  images.forEach((im, i) =>
    object(
      first + i,
      `<< /Type /XObject /Subtype /Image /Width ${im.pixelWidth} /Height ${im.pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>`,
      im.jpeg,
    ),
  );
  const xref = length;
  const count = first + images.length;
  write(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
