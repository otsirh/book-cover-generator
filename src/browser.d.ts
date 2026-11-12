export declare function svgToDataUrl(svg: string): string;
export declare function svgToBlob(svg: string): Blob;

export interface RasterizeOptions {
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Multiplier applied to the SVG's width and height. Default 1. Ignored when `width` or `height` is given. */
  scale?: number;
  /** The image's exact width in px. Alone, the height follows the SVG's shape. */
  width?: number;
  /** The image's exact height in px. Alone, the width follows the SVG's shape. */
  height?: number;
  /** Pixels per inch to record in PNG and JPEG files (what print software reads for the printed size). */
  dpi?: number;
  /** 0–1, for JPEG and WebP. Default 0.92. */
  quality?: number;
  /** Fill colour behind the cover. JPEG defaults to white. */
  background?: string;
}

/** Render SVG markup to an image Blob. Browsers that can't encode `type` return PNG; check `blob.type`. */
export declare function rasterize(svg: string, opts?: RasterizeOptions): Promise<Blob>;
/** Trigger a file download for a Blob. */
export declare function downloadBlob(blob: Blob, filename: string): void;

export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'jpg' | 'webp';
/**
 * Download a cover; `basename` gets the right extension appended. Resolves to the file name,
 * whose extension says what was made (browsers that can't encode WebP make a PNG).
 */
export declare function downloadCover(
  svg: string,
  format?: ExportFormat,
  basename?: string,
  opts?: Omit<RasterizeOptions, 'type'>,
): Promise<string>;
/** `'png'`, `'jpg'` or `'webp'` for an image Blob of that type, else undefined. */
export declare function extensionOf(blob: Blob): 'png' | 'jpg' | 'webp' | undefined;
/** A copy of a PNG or JPEG Blob that records `dpi` pixels per inch. Other types come back unchanged. Works in Node too. */
export declare function setDpi(blob: Blob, dpi: number): Promise<Blob>;
/** A ZIP archive (stored, not compressed) of the given files. Names are UTF-8 and should be unique. Works in Node too. */
export declare function zipFiles(
  files: ReadonlyArray<{ name: string; data: Blob | Uint8Array | string }>,
): Promise<Blob>;
/** Copy a cover to the clipboard as a PNG. Rejects where `canCopyImage()` is false. */
export declare function copyImage(
  svg: string,
  opts?: Omit<RasterizeOptions, 'type' | 'quality' | 'dpi'>,
): Promise<void>;
/** Whether this browser can copy images to the clipboard on this page. */
export declare function canCopyImage(): boolean;
/** Copy text to the clipboard, with a fallback for non-secure contexts. */
export declare function copyText(text: string): Promise<void>;
