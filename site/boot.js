// Runs before first paint (loaded as a blocking classic script): apply the cover
// format from a shared link so the preview has the right shape from the start.
(() => {
  const format = new URLSearchParams(location.hash.slice(1)).get('format');
  if (format === 'ebook' || format === 'square') document.documentElement.dataset.coverFormat = format;
})();
