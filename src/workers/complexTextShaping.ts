import * as hb from "harfbuzzjs";
import { mirroredRunText, planBidiLine } from "../native/complexBidi";

export interface ShapedGlyph {
  gid: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

export interface ShapedVisualRun {
  direction: "ltr" | "rtl";
  logicalText: string;
  glyphs: ShapedGlyph[];
  width: number;
}

export interface ShapedComplexLine {
  logicalText: string;
  runs: ShapedVisualRun[];
  width: number;
}

export interface ShapedComplexLayout {
  lines: ShapedComplexLine[];
  lineHeight: number;
  requiredHeight: number;
  maxLineWidth: number;
}

class HarfBuzzFont {
  readonly blob: hb.Blob;
  readonly face: hb.Face;
  readonly font: hb.Font;
  readonly upem: number;

  constructor(bytes: Uint8Array) {
    this.blob = new hb.Blob(bytes);
    this.face = new hb.Face(this.blob);
    this.font = new hb.Font(this.face);
    this.upem = Math.max(1, this.face.upem || 1000);
    this.font.setScale(this.upem, this.upem);
  }
}

function shapeRun(font: HarfBuzzFont, text: string, direction: "ltr" | "rtl", fontSize: number): ShapedVisualRun {
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.setDirection(direction === "rtl" ? hb.Direction.RTL : hb.Direction.LTR);
  buffer.guessSegmentProperties();
  hb.shape(font.font, buffer);
  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  const scale = Math.max(1, fontSize) / font.upem;
  const glyphs = infos.map((info, index) => {
    const position = positions[index] ?? { xAdvance: 0, yAdvance: 0, xOffset: 0, yOffset: 0 };
    return {
      gid: info.codepoint,
      xAdvance: position.xAdvance * scale,
      yAdvance: position.yAdvance * scale,
      xOffset: position.xOffset * scale,
      yOffset: position.yOffset * scale
    };
  });
  return {
    direction,
    logicalText: text,
    glyphs,
    width: glyphs.reduce((sum, glyph) => sum + Math.abs(glyph.xAdvance), 0)
  };
}

export function shapeComplexLine(font: HarfBuzzFont, text: string, fontSize: number, baseDirection: "ltr" | "rtl" = "rtl"): ShapedComplexLine {
  const bidi = planBidiLine(text, baseDirection);
  const runs = bidi.visualRuns.map((run) => shapeRun(font, mirroredRunText(bidi, run), run.direction, fontSize));
  return { logicalText: text, runs, width: runs.reduce((sum, run) => sum + run.width, 0) };
}

function splitLongToken(font: HarfBuzzFont, token: string, fontSize: number, width: number, baseDirection: "ltr" | "rtl"): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const character of [...token]) {
    const next = current + character;
    if (current && shapeComplexLine(font, next, fontSize, baseDirection).width > width) {
      pieces.push(current);
      current = character;
    } else current = next;
  }
  if (current || !pieces.length) pieces.push(current);
  return pieces;
}

function wrapParagraph(font: HarfBuzzFont, text: string, fontSize: number, width: number, baseDirection: "ltr" | "rtl"): string[] {
  if (!text.trim()) return [""];
  const words = text.trim().split(/\s+/u).flatMap((token) =>
    shapeComplexLine(font, token, fontSize, baseDirection).width > width
      ? splitLongToken(font, token, fontSize, width, baseDirection)
      : [token]
  );
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && shapeComplexLine(font, candidate, fontSize, baseDirection).width > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current || !lines.length) lines.push(current);
  return lines;
}

export function shapeComplexText(
  fontBytes: Uint8Array,
  text: string,
  fontSize: number,
  width: number,
  wrap: boolean,
  lineHeight?: number,
  baseDirection: "ltr" | "rtl" = "rtl"
): ShapedComplexLayout {
  if (!fontBytes.byteLength) throw new Error("Arabic/RTL reconstruction requires a validated imported font.");
  const font = new HarfBuzzFont(fontBytes);
  const logicalLines = text.replace(/\r\n?/g, "\n").split("\n").flatMap((line) =>
    wrap ? wrapParagraph(font, line, fontSize, Math.max(1, width - 3), baseDirection) : [line]
  );
  const lines = logicalLines.map((line) => shapeComplexLine(font, line, fontSize, baseDirection));
  const spacing = Math.max(Math.max(1, fontSize), Number(lineHeight) || Math.max(1, fontSize) * 1.2);
  return {
    lines,
    lineHeight: spacing,
    requiredHeight: Math.max(spacing, lines.length * spacing),
    maxLineWidth: Math.max(0, ...lines.map((line) => line.width))
  };
}
