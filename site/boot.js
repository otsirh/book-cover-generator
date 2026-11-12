// Runs before first paint (loaded as a blocking classic script): apply the cover
// format from a shared link so the preview has the right shape from the start.
(() => {
  const format = new URLSearchParams(location.hash.slice(1)).get('format') ?? '';
  const root = document.documentElement;
  if (format === 'ebook' || format === 'square') root.dataset.coverFormat = format;
  // A size of its own, such as 1600x2560 (the app checks it is one it can make).
  const size = /^([1-9]\d{1,4})x([1-9]\d{1,4})$/.exec(format);
  if (size) {
    root.dataset.coverFormat = 'custom';
    root.style.setProperty('--cover-w', size[1]);
    root.style.setProperty('--cover-h', size[2]);
  }
})();
