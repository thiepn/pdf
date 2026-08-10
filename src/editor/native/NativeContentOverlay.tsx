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

export function NativeContentOverlay({ objects, zoom, selectedId, enabled, originX = 0, originY = 0, onSelect }: Props) {
  if (!enabled) return null;
  return <div className="native-content-overlay" aria-label="Existing PDF content">
    {objects.map((object, index) => {
      const style: CSSProperties = {
        left: (object.bounds.x - originX) * zoom,
        top: (object.bounds.y - originY) * zoom,
        width: Math.max(3, object.bounds.w * zoom),
        height: Math.max(3, object.bounds.h * zoom),
        // Text line bounds can overlap slightly. Keep document order stable so
        // a later sibling does not make an earlier visible line unclickable.
        zIndex: selectedId === object.id ? objects.length + 1 : objects.length - index
      };
      const label = nativeObjectLabel(object);
      return <button
        aria-label={`Select existing ${object.type}: ${label}`}
        className={`native-content-hitbox native-content-hitbox--${object.type} capability-level--${object.capability.level}${selectedId === object.id ? " active" : ""}`}
        data-native-object-id={object.id}
        key={object.id}
        onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => { event.stopPropagation(); }}
        onClick={(event) => { event.stopPropagation(); onSelect(object); }}
        style={style}
        title={`${object.capability.label} · ${Math.round(object.capability.confidence * 100)}% confidence`}
        type="button"
      ><span>{object.type === "form" ? "FORM" : object.type.toUpperCase()}</span></button>;
    })}
  </div>;
}

export function nativeObjectLabel(object: NativePageObject): string {
  if (object.type === "text") return object.text.slice(0, 42) || "Text";
  if (object.type === "table") return `${object.rows}×${object.columns} table`;
  if (object.type === "form") return object.label || object.name || object.fieldType;
  if (object.type === "image") return `${Math.round(object.bounds.w)}×${Math.round(object.bounds.h)} image`;
  return `${object.commands.length} path commands`;
}
