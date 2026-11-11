export declare function svgToDataUrl(svg: string): string;
export declare function svgToBlob(svg: string): Blob;

export interface RasterizeOptions {
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Multiplier applied to the SVG's width and height. Default 1. */
  scale?: number;
  /** 0–1, for JPEG and WebP. Default 0.92. */
  quality?: number;
  /** Fill colour behind the cover. JPEG defaults to white. */
  background?: string;
}

/** Render SVG markup to an image Blob. */
export declare function rasterize(svg: string, opts?: RasterizeOptions): Promise<Blob>;
/** Trigger a file download for a Blob. */
export declare function downloadBlob(blob: Blob, filename: string): void;

export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'jpg' | 'webp';
/** Download a cover; `basename` gets the right extension appended. */
export declare function downloadCover(
  svg: string,
  format?: ExportFormat,
  basename?: string,
  opts?: Omit<RasterizeOptions, 'type'>,
): Promise<void>;
/** Copy text to the clipboard, with a fallback for non-secure contexts. */
export declare function copyText(text: string): Promise<void>;
