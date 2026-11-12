// Browser-only helpers for exporting covers: copy, download, rasterise.

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
 * Render SVG markup to a PNG/JPEG/WebP Blob.
 * @param {string} svg
 * @param {{ type?: string, scale?: number, quality?: number, background?: string }} [opts]
 */
export async function rasterize(svg, { type = 'image/png', scale = 1, quality = 0.92, background } = {}) {
  const img = new Image();
  img.decoding = 'async';
  img.src = svgToDataUrl(svg);
  await img.decode();
  // Without a usable size in the markup, use the size the browser gives the image.
  const [sw, sh] = svgSize(svg) ?? [img.naturalWidth || 300, img.naturalHeight || 150];
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
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
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // Free the canvas memory now: Safari caps the total, and a 4× export is tens of MB.
        canvas.width = canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed'));
      },
      type,
      quality,
    );
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
 * Download a cover in the given format.
 * @param {string} svg
 * @param {'svg'|'png'|'jpeg'|'jpg'|'webp'} [format='svg']
 * @param {string} [basename='cover']
 * @param {{ scale?: number, quality?: number }} [opts]
 */
export async function downloadCover(svg, format = 'svg', basename = 'cover', opts = {}) {
  if (format === 'svg') return downloadBlob(svgToBlob(svg), `${basename}.svg`);
  const ext = format === 'jpeg' || format === 'jpg' ? 'jpg' : format;
  const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const blob = await rasterize(svg, { type, ...opts });
  // Browsers that can't encode a type (e.g. WebP in Safari) return PNG instead; name the file after what we got.
  const actual = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] ?? ext;
  return downloadBlob(blob, `${basename}.${actual}`);
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
