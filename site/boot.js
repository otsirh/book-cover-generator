// Runs before first paint (loaded as a blocking classic script): apply the cover
// format from a shared link so the preview has the right shape from the start.
(() => {
  // (The last of a repeated key, trimmed, as the app reads links: src/link.js.)
  const format = (new URLSearchParams(location.hash.slice(1)).getAll('format').at(-1) ?? '').trim();
  const root = document.documentElement;
  if (format === 'ebook' || format === 'square') root.dataset.coverFormat = format;
  // A size of its own, such as 1600x2560, if the library can make it (sizeLimits: 50 to 10,000 px,
  // 1:3 to 3:1), so the frame the app keeps is the one painted first.
  const size = /^([1-9]\d{1,4})x([1-9]\d{1,4})$/.exec(format);
  const [w, h] = size ? [Number(size[1]), Number(size[2])] : [0, 0];
  if (size && Math.min(w, h) >= 50 && Math.max(w, h) <= 10000 && w <= h * 3 && h <= w * 3) {
    root.dataset.coverFormat = 'custom';
    root.style.setProperty('--cover-w', size[1]);
    root.style.setProperty('--cover-h', size[2]);
  }
})();
