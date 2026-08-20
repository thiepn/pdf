import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { NativePageObject } from "../../types/nativeEditor";

interface Props {
  objects: NativePageObject[];
  zoom: number;
  selectedId?: string;
  enabled: boolean;
  originX?: number;
  originY?: number;
  onSelect: (object: NativePageObject) => void;
}

function objectZIndex(object: NativePageObject, index: number, count: number, selectedId?: string): number {
  if (selectedId === object.id) return count * 3 + 1;
  // A detected table structurally owns the text and grid paths inside its
  // bounded region. Put the table hitbox above those child objects so users
  // can select the table directly on canvas instead of accidentally selecting
  // a cell's reconstructed text or one of its border paths.
  if (object.type === "table") return count * 2 - index;
  return count - index;
}

export function NativeContentOverlay({ objects, zoom, selectedId, enabled, originX = 0, originY = 0, onSelect }: Props) {
  if (!enabled) return null;
  return <div className="native-content-overlay" aria-label="Existing PDF content">
    {objects.map((object, index) => {
      const style: CSSProperties = {
        left: (object.bounds.x - originX) * zoom,
        top: (object.bounds.y - originY) * zoom,
        width: Math.max(3, object.bounds.w * zoom),
        height: Math.max(3, object.bounds.h * zoom),
        zIndex: objectZIndex(object, index, objects.length, selectedId)
      };
      const label = nativeObjectLabel(object);
      const typeLabel = object.type === "text" && object.paragraph && (object.lineCount ?? 1) > 1 ? "paragraph" : object.type;
      return <button
        aria-label={`Select existing ${typeLabel}: ${label}`}
        className={`native-content-hitbox native-content-hitbox--${object.type} capability-level--${object.capability.level}${selectedId === object.id ? " active" : ""}`}
        data-native-object-id={object.id}
        key={object.id}
        onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => { event.stopPropagation(); }}
        onClick={(event) => { event.stopPropagation(); onSelect(object); }}
        style={style}
        title={`${object.capability.label} · ${Math.round(object.capability.confidence * 100)}% confidence`}
        type="button"
      ><span>{typeLabel.toUpperCase()}</span></button>;
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
