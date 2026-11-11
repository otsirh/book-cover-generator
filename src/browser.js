// Browser-only helpers for exporting covers: copy, download, rasterise.

/** SVG markup to a `data:` URL usable as an <img> src. */
export function svgToDataUrl(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function svgToBlob(svg) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

function svgSize(svg) {
  const w = /<svg[^>]*\swidth="([\d.]+)"/.exec(svg);
  const h = /<svg[^>]*\sheight="([\d.]+)"/.exec(svg);
  return [w ? +w[1] : 600, h ? +h[1] : 900];
}

/**
 * Render SVG markup to a PNG/JPEG/WebP Blob.
 * @param {string} svg
 * @param {{ type?: string, scale?: number, quality?: number, background?: string }} [opts]
 */
export async function rasterize(svg, { type = 'image/png', scale = 1, quality = 0.92, background } = {}) {
  const [sw, sh] = svgSize(svg);
  const img = new Image();
  img.decoding = 'async';
  img.src = svgToDataUrl(svg);
  await img.decode();
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
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), type, quality);
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
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('Copy failed');
}
