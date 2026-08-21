import type { UnifiedAlign, UnifiedDistributionAxis, UnifiedLayoutItem } from "../unifiedLayout";

interface Props {
  items: UnifiedLayoutItem[];
  primaryKey?: string;
  overlayCount: number;
  nativeCount: number;
  onAlign: (mode: UnifiedAlign, target: "selection" | "page") => void;
  onDistribute: (axis: UnifiedDistributionAxis) => void;
  onMatchSize: (dimension: "width" | "height" | "both") => void;
  onRotate: (degrees: number) => void;
  onDelete: () => void;
  onDuplicateOverlays: () => void;
  onGroupOverlays: () => void;
  onUngroupOverlays: () => void;
}

export function UnifiedLayoutPropertiesPanel({ items, primaryKey, overlayCount, nativeCount, onAlign, onDistribute, onMatchSize, onRotate, onDelete, onDuplicateOverlays, onGroupOverlays, onUngroupOverlays }: Props) {
  const movable = items.filter((item) => item.movable).length;
  const resizable = items.filter((item) => item.resizable).length;
  const rotatable = items.filter((item) => item.rotatable).length;
  const blocked = items.filter((item) => !item.movable && !item.resizable);
  return <aside className="editor-properties native-unified-properties p6-layout-properties">
    <section className="property-section native-capability-card">
      <div className="native-capability-card__heading"><div><p className="eyebrow">P6 · Unified layout</p><h2>{items.length} selected objects</h2></div><span className="capability-chip capability-chip--safe-reconstruction">Mixed selection</span></div>
      <p>Existing PDF content and added editor objects share one page-layout selection. Geometry changes are routed back through the qualified P1–P5 writer for each source type.</p>
      <dl className="native-object-facts"><dt>Existing PDF</dt><dd>{nativeCount}</dd><dt>Added objects</dt><dd>{overlayCount}</dd><dt>Movable</dt><dd>{movable}/{items.length}</dd><dt>Resizable</dt><dd>{resizable}/{items.length}</dd></dl>
      {blocked.length ? <div className="warning-banner"><strong>{blocked.length} protected object{blocked.length === 1 ? "" : "s"}</strong><span>{blocked.map((item) => `${item.type}: ${item.reason ?? "geometry is protected"}`).join(" ")}</span></div> : null}
    </section>

    <section className="property-section property-stack">
      <h3>Align selection</h3>
      <div className="property-grid-two">
        <button type="button" onClick={() => onAlign("left", "selection")}>Left</button>
        <button type="button" onClick={() => onAlign("center", "selection")}>Center</button>
        <button type="button" onClick={() => onAlign("right", "selection")}>Right</button>
        <button type="button" onClick={() => onAlign("top", "selection")}>Top</button>
        <button type="button" onClick={() => onAlign("middle", "selection")}>Middle</button>
        <button type="button" onClick={() => onAlign("bottom", "selection")}>Bottom</button>
      </div>
      {items.length >= 3 ? <div className="property-grid-two"><button type="button" onClick={() => onDistribute("horizontal")}>Distribute horizontally</button><button type="button" onClick={() => onDistribute("vertical")}>Distribute vertically</button></div> : null}
    </section>

    <section className="property-section property-stack">
      <h3>Align to page</h3>
      <div className="property-grid-two">
        <button type="button" onClick={() => onAlign("left", "page")}>Page left</button>
        <button type="button" onClick={() => onAlign("center", "page")}>Page center X</button>
        <button type="button" onClick={() => onAlign("right", "page")}>Page right</button>
        <button type="button" onClick={() => onAlign("top", "page")}>Page top</button>
        <button type="button" onClick={() => onAlign("middle", "page")}>Page center Y</button>
        <button type="button" onClick={() => onAlign("bottom", "page")}>Page bottom</button>
      </div>
    </section>

    <section className="property-section property-stack">
      <h3>Size & rotation</h3>
      <p className="property-note">Same-size operations use the most recently selected object as the reference{primaryKey ? "." : " when available."}</p>
      <div className="property-grid-two"><button disabled={resizable < 2} type="button" onClick={() => onMatchSize("width")}>Same width</button><button disabled={resizable < 2} type="button" onClick={() => onMatchSize("height")}>Same height</button><button disabled={resizable < 2} type="button" onClick={() => onMatchSize("both")}>Same size</button><span /></div>
      <div className="property-grid-two"><button disabled={!rotatable} type="button" onClick={() => onRotate(-90)}>Rotate −90°</button><button disabled={!rotatable} type="button" onClick={() => onRotate(90)}>Rotate +90°</button></div>
      <p className="property-note">Existing images rotate in 90° source-preserving steps. Existing vectors keep P4's arbitrary rotation model. Text, tables, and interactive form geometry are not falsely rotated.</p>
    </section>

    <section className="property-section property-stack">
      <h3>Selection actions</h3>
      <div className="property-grid-two"><button disabled={!overlayCount} type="button" onClick={onDuplicateOverlays}>Duplicate added objects</button><button disabled={overlayCount < 2} type="button" onClick={onGroupOverlays}>Group added objects</button><button disabled={!overlayCount} type="button" onClick={onUngroupOverlays}>Ungroup added objects</button><button className="danger" type="button" onClick={onDelete}>Delete supported</button></div>
      {nativeCount ? <p className="property-note">Source-object duplication and PDF painting-order mutation are intentionally not synthesized in P6. Existing objects remain tied to their P1–P5 source identities; P7 handles deeper nested/content-order cases.</p> : null}
    </section>
  </aside>;
}
