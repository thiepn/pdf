import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Rect } from "../../core/coordinates";
import type { EditorObject } from "../../types/editor";
import { rectHeight, rectWidth } from "../editorModel";

interface Props {
  object: EditorObject;
  viewportBounds: Rect;
  selected: boolean;
  assetUrl?: string;
  viewportScale: number;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, object: EditorObject) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>, object: EditorObject, handle: ResizeHandle) => void;
  onDoubleClick?: (object: EditorObject) => void;
}

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

export function EditorObjectView({ object, viewportBounds, selected, assetUrl, viewportScale, onPointerDown, onResizePointerDown, onDoubleClick }: Props) {
  const width = Math.max(1, rectWidth(viewportBounds));
  const height = Math.max(1, rectHeight(viewportBounds));
  const style: CSSProperties = {
    left: viewportBounds.x0,
    top: viewportBounds.y0,
    width,
    height,
    zIndex: object.zIndex,
    opacity: object.opacity,
    transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
    transformOrigin: "center"
  };

  return (
    <div
      className={`editor-object editor-object--${object.type}${selected ? " editor-object--selected" : ""}${object.locked ? " editor-object--locked" : ""}`}
      data-object-id={object.id}
      onDoubleClick={() => onDoubleClick?.(object)}
      onPointerDown={(event) => onPointerDown(event, object)}
      style={style}
    >
      <ObjectContent assetUrl={assetUrl} object={object} viewportScale={viewportScale} />
      {selected && !object.locked ? ("nw ne sw se".split(" ") as ResizeHandle[]).map((handle) => (
        <button
          aria-label={`Resize ${handle}`}
          className={`editor-resize-handle editor-resize-handle--${handle}`}
          key={handle}
          onPointerDown={(event) => onResizePointerDown(event, object, handle)}
          type="button"
        />
      )) : null}
      {selected ? <span className="editor-object-label">{object.type}</span> : null}
    </div>
  );
}

function ObjectContent({ object, assetUrl, viewportScale }: { object: EditorObject; assetUrl?: string; viewportScale: number }) {
  switch (object.type) {
    case "text": return (
      <div
        className="editor-text-object"
        style={{
          color: object.color,
          background: object.backgroundColor,
          border: object.borderWidth ? `${object.borderWidth * viewportScale}px solid ${object.borderColor}` : undefined,
          fontFamily: fontStack(object.fontFamily),
          fontSize: object.fontSize * viewportScale,
          fontStyle: object.fontStyle,
          fontWeight: object.fontWeight,
          lineHeight: object.lineHeight,
          padding: object.padding * viewportScale,
          textAlign: object.textAlign
        }}
      >{object.text}</div>
    );
    case "image": return assetUrl ? <img alt={object.altText} draggable={false} src={assetUrl} /> : <div className="editor-image-missing">Missing image</div>;
    case "shape": return <ShapeContent object={object} viewportScale={viewportScale} />;
    case "ink": return <InkContent object={object} viewportScale={viewportScale} />;
    case "highlight": return object.style === "highlight"
      ? <div className="editor-highlight-object" style={{ background: object.color }} />
      : <div className={`editor-markup-object editor-markup-object--${object.style}`} style={{ color: object.color }} />;
    case "note": return <div className={`editor-note-object${object.resolved ? " editor-note-object--resolved" : ""}`} style={{ background: object.color }}>●<span>{object.contents}</span></div>;
    case "link": return <div className="editor-link-object" style={{ borderColor: object.borderColor, borderWidth: object.borderWidth * viewportScale }}><span>{object.target || "Link"}</span></div>;
    case "stamp": return <div className="editor-stamp-object" style={{ color: object.color, background: object.backgroundColor, borderColor: object.borderColor }}>{object.label}</div>;
    case "signature": return <div className="editor-signature-object" style={{ color: object.color }}><strong>{object.signerName || "Signature"}</strong>{object.showDate ? <small>{new Date(object.signedAt).toLocaleDateString()}</small> : null}{object.showLabels && object.reason ? <span>{object.reason}</span> : null}</div>;
    case "redaction": return <div className="editor-redaction-object" style={{ background: object.fillColor }}><span>{object.overlayText || "REDACTED"}</span></div>;
  }
}

function ShapeContent({ object, viewportScale }: { object: Extract<EditorObject, { type: "shape" }>; viewportScale: number }) {
  const dash = object.dash === "dashed" ? "8 5" : object.dash === "dotted" ? "2 4" : undefined;
  if (object.shape === "rectangle") return <div className="editor-shape-box" style={{ borderColor: object.strokeColor, borderWidth: object.strokeWidth * viewportScale, borderStyle: object.dash === "solid" ? "solid" : object.dash, background: object.fillColor }} />;
  if (object.shape === "ellipse") return <div className="editor-shape-box editor-shape-box--ellipse" style={{ borderColor: object.strokeColor, borderWidth: object.strokeWidth * viewportScale, borderStyle: object.dash === "solid" ? "solid" : object.dash, background: object.fillColor }} />;
  return (
    <svg className="editor-shape-line" preserveAspectRatio="none" viewBox="0 0 100 100">
      <defs><marker id={`arrow-${object.id}`} markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4"><path d="M0,0 L8,4 L0,8 z" fill={object.strokeColor} /></marker></defs>
      <line x1="2" y1="98" x2="98" y2="2" stroke={object.strokeColor} strokeDasharray={dash} strokeWidth={Math.max(1, object.strokeWidth * viewportScale)} vectorEffect="non-scaling-stroke" markerEnd={object.shape === "arrow" ? `url(#arrow-${object.id})` : undefined} />
    </svg>
  );
}

function InkContent({ object, viewportScale }: { object: Extract<EditorObject, { type: "ink" }>; viewportScale: number }) {
  const width = Math.max(1, object.bounds.x1 - object.bounds.x0);
  const height = Math.max(1, object.bounds.y1 - object.bounds.y0);
  return (
    <svg className="editor-ink-object" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      {object.strokes.map((stroke, index) => (
        <polyline
          fill="none"
          key={index}
          points={stroke.map((point) => `${point.x - object.bounds.x0},${object.bounds.y1 - point.y}`).join(" ")}
          stroke={object.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={object.strokeWidth * viewportScale}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function fontStack(font: string): string {
  if (font === "Times-Roman") return '"Times New Roman", Times, serif';
  if (font === "Courier") return '"Courier New", Courier, monospace';
  return "Arial, Helvetica, sans-serif";
}
