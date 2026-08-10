import { useMemo, useState } from "react";
import { Panel } from "../../components/Panel";
import { DiagnosticList } from "../../components/DiagnosticList";
import { CoordinateService, createPdfViewportMatrix, type Point } from "../../core/coordinates";
import type { DiagnosticCheck } from "../../lab/types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const rotations = [0, 90, 180, 270] as const;
const zooms = [0.25, 0.5, 1, 1.5, 2, 4] as const;

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function CoordinatesLab() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [rotation, setRotation] = useState<(typeof rotations)[number]>(0);
  const [zoom, setZoom] = useState(0.75);
  const [probe, setProbe] = useState<Point>({ x: 144, y: 648 });

  const service = useMemo(
    () => new CoordinateService(createPdfViewportMatrix(PAGE_WIDTH, PAGE_HEIGHT, zoom, rotation)),
    [rotation, zoom]
  );
  const viewportProbe = service.pdfToViewport(probe);
  const viewportSize = rotation === 90 || rotation === 270
    ? { width: PAGE_HEIGHT * zoom, height: PAGE_WIDTH * zoom }
    : { width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom };

  function runMatrix(): void {
    const results: DiagnosticCheck[] = [];
    for (const currentRotation of rotations) {
      for (const currentZoom of zooms) {
        const current = new CoordinateService(
          createPdfViewportMatrix(PAGE_WIDTH, PAGE_HEIGHT, currentZoom, currentRotation)
        );
        let maxError = 0;
        for (let index = 0; index < 500; index += 1) {
          const point = {
            x: (index * 97.31) % PAGE_WIDTH,
            y: (index * 53.17) % PAGE_HEIGHT
          };
          const roundTrip = current.viewportToPdf(current.pdfToViewport(point));
          maxError = Math.max(maxError, distance(point, roundTrip));
        }

        results.push({
          id: `${currentRotation}-${currentZoom}`,
          label: `${currentRotation}° at ${Math.round(currentZoom * 100)}%`,
          status: maxError <= 1e-8 ? "passed" : "failed",
          detail: `500 point round trips; maximum error ${maxError.toExponential(3)} PDF points.`
        });
      }
    }
    setChecks(results);
  }

  function moveProbe(event: { currentTarget: HTMLDivElement; clientX: number; clientY: number }): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const viewportPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const pdfPoint = service.viewportToPdf(viewportPoint);
    setProbe({
      x: Math.max(0, Math.min(PAGE_WIDTH, pdfPoint.x)),
      y: Math.max(0, Math.min(PAGE_HEIGHT, pdfPoint.y))
    });
  }

  return (
    <div className="stack">
      <Panel
        title="Canonical coordinate transform"
        eyebrow="P0-04"
        actions={<button className="button" onClick={runMatrix} type="button">Run transform matrix</button>}
      >
        <p className="panel-intro">
          Uses one affine transform service for PDF points, viewport coordinates and rectangles. The laboratory checks invertibility across every page rotation and planned zoom range.
        </p>

        <div className="coordinate-controls">
          <label>
            Rotation
            <select value={rotation} onChange={(event: { target: HTMLSelectElement }) => setRotation(Number(event.target.value) as typeof rotation)}>
              {rotations.map((value) => <option key={value} value={value}>{value}°</option>)}
            </select>
          </label>
          <label>
            Zoom
            <select value={zoom} onChange={(event: { target: HTMLSelectElement }) => setZoom(Number(event.target.value))}>
              {zooms.map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
            </select>
          </label>
          <span>PDF point: {probe.x.toFixed(2)}, {probe.y.toFixed(2)}</span>
          <span>Viewport: {viewportProbe.x.toFixed(2)}, {viewportProbe.y.toFixed(2)}</span>
        </div>

        <div className="coordinate-stage">
          <div
            className="synthetic-page"
            onClick={moveProbe}
            style={{ width: viewportSize.width, height: viewportSize.height }}
          >
            <span className="axis-label axis-label--top">viewport 0,0</span>
            <span
              className="coordinate-probe"
              style={{ transform: `translate(${viewportProbe.x}px, ${viewportProbe.y}px)` }}
            />
          </div>
        </div>

        <DiagnosticList checks={checks} />
      </Panel>
    </div>
  );
}
