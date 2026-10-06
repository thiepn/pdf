declare module "bidi-js" {
  export interface BidiEmbeddingLevels {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  }

  export interface BidiApi {
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl" | "auto"): BidiEmbeddingLevels;
    getReorderedIndices(text: string, levels: BidiEmbeddingLevels, start?: number, end?: number): number[];
    getMirroredCharactersMap(text: string, levels: Uint8Array, start?: number, end?: number): Map<number, string>;
  }

  export default function bidiFactory(): BidiApi;
}

declare module "harfbuzzjs" {
  export const Direction: {
    readonly INVALID: 0;
    readonly LTR: 4;
    readonly RTL: 5;
    readonly TTB: 6;
    readonly BTT: 7;
  };

  export class Blob {
    constructor(data: Uint8Array | ArrayBuffer);
  }

  export class Face {
    constructor(blob: Blob, index?: number);
    readonly upem: number;
  }

  export class Font {
    constructor(face: Face);
    setScale(xScale: number, yScale: number): void;
  }

  export interface GlyphInfo {
    codepoint: number;
    cluster: number;
    flags: number;
  }

  export interface GlyphPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }

  export class Buffer {
    constructor();
    addText(text: string, itemOffset?: number, itemLength?: number): void;
    setDirection(direction: number): void;
    guessSegmentProperties(): void;
    getGlyphInfos(): GlyphInfo[];
    getGlyphPositions(): GlyphPosition[];
  }

  export function shape(font: Font, buffer: Buffer): void;
}
