import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { NativePageObject, NativeRect } from "../../types/nativeEditor";
import "../p6.css";

export type NativeResizeHandle = "nw" | "ne" | "sw" | "se";
export type NativeTransformMode = "move" | "resize";

interface Props {
  objects: NativePageObject[];
  zoom: number;
  selectedId?: string;
  selectedIds?: Set<string>;
  enabled: boolean;
  originX?: number;
  originY?: number;
  pageSize?: { width: number; height: number };
  effectiveBounds?: Map<string, NativeRect>;
  transformableIds?: Set<string>;
  snapEnabled?: boolean;
  gridSize?: number;
  onSelect: (object: NativePageObject, additive: boolean) => void;
  onTransform?: (object: NativePageObject, bounds: NativeRect, mode: NativeTransformMode) => void;
}

interface DragState {
  object: NativePageObject;
  source: NativeRect;
  startX: number;
  startY: number;
  pointerId: number;
  mode: NativeTransformMode;
  handle?: NativeResizeHandle;
}

function objectZIndex(object: NativePageObject, index: number, count: number, selected: boolean): number {
  if (selected) return count * 3 + 1;
  if (object.type === "table") return count * 2 - index;
  return count - index;
}

function modifier(event: ReactPointerEvent): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey;
}

function effectiveRect(object: NativePageObject, bounds?: Map<string, NativeRect>): NativeRect {
  return bounds?.get(object.id) ?? object.bounds;
}

function clampRect(rect: NativeRect, originX: number, originY: number, pageSize?: { width: number; height: number }): NativeRect {
  if (!pageSize) return { ...rect, w: Math.max(2, rect.w), h: Math.max(2, rect.h) };
  const w = Math.min(Math.max(2, rect.w), Math.max(2, pageSize.width));
  const h = Math.min(Math.max(2, rect.h), Math.max(2, pageSize.height));
  return {
    x: Math.max(originX, Math.min(originX + pageSize.width - w, rect.x)),
    y: Math.max(originY, Math.min(originY + pageSize.height - h, rect.y)),
    w,
    h
  };
}

function snapMove(rect: NativeRect, movingId: string, objects: NativePageObject[], effectiveBounds: Map<string, NativeRect> | undefined, selectedIds: Set<string>, originX: number, originY: number, pageSize: { width: number; height: number } | undefined, gridSize: number): NativeRect {
  const tolerance = 5;
  let x = Math.round((rect.x - originX) / Math.max(1, gridSize)) * Math.max(1, gridSize) + originX;
  let y = Math.round((rect.y - originY) / Math.max(1, gridSize)) * Math.max(1, gridSize) + originY;
  const width = rect.w;
  const height = rect.h;
  const snapX = (target: number, source: number) => { if (Math.abs(source - target) <= tolerance) x += target - source; };
  const snapY = (target: number, source: number) => { if (Math.abs(source - target) <= tolerance) y += target - source; };

  if (pageSize) {
    const right = originX + pageSize.width;
    const bottom = originY + pageSize.height;
    const centerX = originX + pageSize.width / 2;
    const centerY = originY + pageSize.height / 2;
    const sourceCenterX = x + width / 2;
    const sourceCenterY = y + height / 2;
    if (Math.abs(x - originX) <= tolerance) x = originX;
    else if (Math.abs(x + width - right) <= tolerance) x = right - width;
    else if (Math.abs(sourceCenterX - centerX) <= tolerance) x = centerX - width / 2;
    if (Math.abs(y - originY) <= tolerance) y = originY;
    else if (Math.abs(y + height - bottom) <= tolerance) y = bottom - height;
    else if (Math.abs(sourceCenterY - centerY) <= tolerance) y = centerY - height / 2;
  }

  for (const other of objects) {
    if (other.id === movingId || selectedIds.has(other.id)) continue;
    const bounds = effectiveRect(other, effectiveBounds);
    const sourcesX = [x, x + width / 2, x + width];
    const targetsX = [bounds.x, bounds.x + bounds.w / 2, bounds.x + bounds.w];
    let snapped = false;
    for (const source of sourcesX) {
      for (const target of targetsX) {
        if (Math.abs(source - target) <= tolerance) { snapX(target, source); snapped = true; break; }
      }
      if (snapped) break;
    }
    const sourcesY = [y, y + height / 2, y + height];
    const targetsY = [bounds.y, bounds.y + bounds.h / 2, bounds.y + bounds.h];
    snapped = false;
    for (const source of sourcesY) {
      for (const target of targetsY) {
        if (Math.abs(source - target) <= tolerance) { snapY(target, source); snapped = true; break; }
      }
      if (snapped) break;
    }
  }
  return clampRect({ x, y, w: width, h: height }, originX, originY, pageSize);
}

function resizeRect(source: NativeRect, dx: number, dy: number, handle: NativeResizeHandle): NativeRect {
  let left = source.x;
  let top = source.y;
  let right = source.x + source.w;
  let bottom = source.y + source.h;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;
  if (right < left) [left, right] = [right, left];
  if (bottom < top) [top, bottom] = [bottom, top];
  if (right - left < 2) right = left + 2;
  if (bottom - top < 2) bottom = top + 2;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function NativeContentOverlay({ objects, zoom, selectedId, selectedIds, enabled, originX = 0, originY = 0, pageSize, effectiveBounds, transformableIds, snapEnabled = true, gridSize = 8, onSelect, onTransform }: Props) {
  const dragRef = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<Map<string, NativeRect>>(() => new Map());
  if (!enabled) return null;
  const selectedSet = selectedIds ?? new Set(selectedId ? [selectedId] : []);

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, object: NativePageObject): void {
    event.stopPropagation();
    if (event.button !== 0) return;
    const additive = modifier(event);
    onSelect(object, additive);
    if (!onTransform || !transformableIds?.has(object.id)) return;
    const source = effectiveRect(object, effectiveBounds);
    dragRef.current = { object, source: { ...source }, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, mode: "move" };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginResize(event: ReactPointerEvent<HTMLSpanElement>, object: NativePageObject, handle: NativeResizeHandle): void {
    event.preventDefault();
    event.stopPropagation();
    if (!onTransform || !transformableIds?.has(object.id)) return;
    const source = effectiveRect(object, effectiveBounds);
    dragRef.current = { object, source: { ...source }, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, mode: "resize", handle };
    (event.currentTarget.parentElement as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) / Math.max(.05, zoom);
    const dy = (event.clientY - drag.startY) / Math.max(.05, zoom);
    let next = drag.mode === "move"
      ? { ...drag.source, x: drag.source.x + dx, y: drag.source.y + dy }
      : resizeRect(drag.source, dx, dy, drag.handle ?? "se");
    if (drag.mode === "move" && snapEnabled) next = snapMove(next, drag.object.id, objects, effectiveBounds, selectedSet, originX, originY, pageSize, gridSize);
    else next = clampRect(next, originX, originY, pageSize);
    setPreview(new Map([[drag.object.id, next]]));
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = preview.get(drag.object.id) ?? drag.source;
    dragRef.current = null;
    setPreview(new Map());
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (Math.abs(next.x - drag.source.x) > .01 || Math.abs(next.y - drag.source.y) > .01 || Math.abs(next.w - drag.source.w) > .01 || Math.abs(next.h - drag.source.h) > .01) onTransform?.(drag.object, next, drag.mode);
  }

  return <div className="native-content-overlay" aria-label="Existing PDF content">
    {objects.map((object, index) => {
      const bounds = preview.get(object.id) ?? effectiveRect(object, effectiveBounds);
      const selected = selectedSet.has(object.id);
      const style: CSSProperties = {
        left: (bounds.x - originX) * zoom,
        top: (bounds.y - originY) * zoom,
        width: Math.max(3, bounds.w * zoom),
        height: Math.max(3, bounds.h * zoom),
        zIndex: objectZIndex(object, index, objects.length, selected)
      };
      const label = nativeObjectLabel(object);
      const typeLabel = object.type === "text" && object.paragraph && (object.lineCount ?? 1) > 1 ? "paragraph" : object.type;
      const transformable = Boolean(onTransform && transformableIds?.has(object.id));
      return <button
        aria-label={`Select existing ${typeLabel}: ${label}`}
        className={`native-content-hitbox native-content-hitbox--${object.type} capability-level--${object.capability.level}${selected ? " active" : ""}${transformable ? " p6-transformable" : ""}`}
        data-native-object-id={object.id}
        key={object.id}
        onClick={(event) => { event.stopPropagation(); if (event.detail === 0) onSelect(object, event.ctrlKey || event.metaKey || event.shiftKey); }}
        onPointerDown={(event) => beginDrag(event, object)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => { dragRef.current = null; setPreview(new Map()); }}
        style={style}
        title={`${object.capability.label} · ${Math.round(object.capability.confidence * 100)}% confidence${transformable ? " · drag to move" : ""}`}
        type="button"
      ><span>{typeLabel.toUpperCase()}</span>{selected && transformable ? ("nw ne sw se".split(" ") as NativeResizeHandle[]).map((handle) => <span aria-hidden="true" className={`native-resize-handle native-resize-handle--${handle}`} key={handle} onPointerDown={(event) => beginResize(event, object, handle)} />) : null}</button>;
    })}
  </div>;
}

export function nativeObjectLabel(object: NativePageObject): string {
  if (object.type === "text") {
    const prefix = object.paragraph && (object.lineCount ?? 1) > 1 ? `${object.lineCount} lines · ` : "";
    return `${prefix}${object.text.slice(0, 42) || "Text"}`;
  }
  if (object.type === "table") return `${object.rows}×${object.columns} table`;
  if (object.type === "form") return object.label || object.name || object.fieldType;
  if (object.type === "image") return `${Math.round(object.bounds.w)}×${Math.round(object.bounds.h)} image`;
  return `${object.commands.length} path commands`;
}
