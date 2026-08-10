export type AffineMatrix = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number
];

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const EPSILON = 1e-12;

export function transformPoint(matrix: AffineMatrix, point: Point): Point {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f
  };
}

export function invertMatrix(matrix: AffineMatrix): AffineMatrix {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < EPSILON) {
    throw new Error("Coordinate transform is not invertible.");
  }

  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant
  ];
}

export function multiplyMatrices(left: AffineMatrix, right: AffineMatrix): AffineMatrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

export function transformRect(matrix: AffineMatrix, rect: Rect): Rect {
  const points = [
    transformPoint(matrix, { x: rect.x0, y: rect.y0 }),
    transformPoint(matrix, { x: rect.x1, y: rect.y0 }),
    transformPoint(matrix, { x: rect.x1, y: rect.y1 }),
    transformPoint(matrix, { x: rect.x0, y: rect.y1 })
  ];

  return {
    x0: Math.min(...points.map((point) => point.x)),
    y0: Math.min(...points.map((point) => point.y)),
    x1: Math.max(...points.map((point) => point.x)),
    y1: Math.max(...points.map((point) => point.y))
  };
}

export class CoordinateService {
  readonly pdfToViewportMatrix: AffineMatrix;
  readonly viewportToPdfMatrix: AffineMatrix;

  constructor(pdfToViewportMatrix: AffineMatrix) {
    this.pdfToViewportMatrix = pdfToViewportMatrix;
    this.viewportToPdfMatrix = invertMatrix(pdfToViewportMatrix);
  }

  pdfToViewport(point: Point): Point {
    return transformPoint(this.pdfToViewportMatrix, point);
  }

  viewportToPdf(point: Point): Point {
    return transformPoint(this.viewportToPdfMatrix, point);
  }

  pdfRectToViewport(rect: Rect): Rect {
    return transformRect(this.pdfToViewportMatrix, rect);
  }

  viewportRectToPdf(rect: Rect): Rect {
    return transformRect(this.viewportToPdfMatrix, rect);
  }
}

export function createPdfViewportMatrix(
  width: number,
  height: number,
  zoom: number,
  rotation: 0 | 90 | 180 | 270
): AffineMatrix {
  if (width <= 0 || height <= 0 || zoom <= 0) {
    throw new Error("Page dimensions and zoom must be positive.");
  }

  switch (rotation) {
    case 0:
      return [zoom, 0, 0, -zoom, 0, height * zoom];
    case 90:
      return [0, zoom, zoom, 0, 0, 0];
    case 180:
      return [-zoom, 0, 0, zoom, width * zoom, 0];
    case 270:
      return [0, -zoom, -zoom, 0, height * zoom, width * zoom];
  }
}
