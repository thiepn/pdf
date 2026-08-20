import { useEffect, useMemo, useState } from "react";
import { cjkLanguageForScript, detectScript } from "../../native/nativeModel";
import type {
  NativeEditableFontFamily,
  NativeRect,
  NativeTableEdit,
  NativeTableEditCell,
  NativeTableHorizontalAlign,
  NativeTableObject,
  NativeTableVerticalAlign
} from "../../types/nativeEditor";

interface Props {
  object: NativeTableObject;
  queued?: NativeTableEdit;
  onQueue: (edit: NativeTableEdit) => void;
}

function familyForText(text: string, fallback?: NativeEditableFontFamily): NativeEditableFontFamily {
  return cjkLanguageForScript(detectScript(text)) ?? fallback ?? "Helvetica";
}

function sourceCell(cell: NativeTableObject["cells"][number]): NativeTableEditCell {
  return {
    id: cell.id,
    row: cell.row,
    column: cell.column,
    rowSpan: Math.max(1, cell.rowSpan ?? 1),
    columnSpan: Math.max(1, cell.columnSpan ?? 1),
    text: cell.text,
    fontSize: Math.max(4, cell.fontSize ?? 10),
    fontFamily: familyForText(cell.text, cell.fontFamily),
    align: cell.align ?? "left",
    verticalAlign: cell.verticalAlign ?? "middle",
    fillColor: cell.fillColor,
    textColor: cell.textColor ?? "#111111"
  };
}

function blankCell(objectId: string, row: number, column: number): NativeTableEditCell {
  return {
    id: `${objectId}:new:r${row}:c${column}:${crypto.randomUUID()}`,
    row,
    column,
    rowSpan: 1,
    columnSpan: 1,
    text: "",
    fontSize: 10,
    fontFamily: "Helvetica",
    align: "left",
    verticalAlign: "middle",
    textColor: "#111111"
  };
}

function defaultSizes(values: number[] | undefined, count: number, total: number): number[] {
  if (values?.length === count && values.every((value) => Number.isFinite(value) && value > 0)) return [...values];
  return Array.from({ length: count }, () => total / Math.max(1, count));
}

function initialEdit(object: NativeTableObject): NativeTableEdit {
  return {
    id: crypto.randomUUID(),
    kind: "table",
    objectId: object.id,
    pageNumber: object.pageNumber,
    action: "rebuild",
    sourceBounds: object.bounds,
    bounds: object.bounds,
    rows: object.rows,
    columns: object.columns,
    rowHeights: defaultSizes(object.rowHeights, object.rows, object.bounds.h),
    columnWidths: defaultSizes(object.columnWidths, object.columns, object.bounds.w),
    headerRows: object.headerRows ?? 0,
    borderColor: object.borderColor ?? "#444444",
    borderWidth: object.borderWidth ?? 1,
    borderStyle: "solid",
    cellPadding: object.cellPadding ?? 4,
    cells: object.cells.map(sourceCell)
  };
}

function coveredByOther(cells: NativeTableEditCell[], row: number, column: number, exceptId?: string): boolean {
  return cells.some((cell) => cell.id !== exceptId
    && row >= cell.row && row < cell.row + Math.max(1, cell.rowSpan)
    && column >= cell.column && column < cell.column + Math.max(1, cell.columnSpan));
}

function fillMissingCells(edit: NativeTableEdit): NativeTableEdit {
  const cells = [...edit.cells];
  for (let row = 0; row < edit.rows; row += 1) for (let column = 0; column < edit.columns; column += 1) {
    if (!coveredByOther(cells, row, column)) cells.push(blankCell(edit.objectId, row, column));
  }
  return { ...edit, cells };
}

function normalizeGrid(edit: NativeTableEdit): NativeTableEdit {
  const cells = edit.cells
    .filter((cell) => cell.row >= 0 && cell.column >= 0 && cell.row < edit.rows && cell.column < edit.columns)
    .map((cell) => ({
      ...cell,
      rowSpan: Math.max(1, Math.min(cell.rowSpan, edit.rows - cell.row)),
      columnSpan: Math.max(1, Math.min(cell.columnSpan, edit.columns - cell.column))
    }));
  return fillMissingCells({ ...edit, cells });
}

function gridError(edit: NativeTableEdit): string | null {
  const occupied = new Map<string, string>();
  for (const cell of edit.cells) {
    for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) for (let column = cell.column; column < cell.column + cell.columnSpan; column += 1) {
      const key = `${row}:${column}`;
      const previous = occupied.get(key);
      if (previous && previous !== cell.id) return `Cell R${cell.row + 1} C${cell.column + 1} overlaps another merged cell.`;
      occupied.set(key, cell.id);
    }
  }
  if (occupied.size !== edit.rows * edit.columns) return "Every grid position must belong to exactly one cell before export.";
  return null;
}

function scriptError(edit: NativeTableEdit): string | null {
  for (const cell of edit.cells) {
    const script = detectScript(cell.text);
    if (script === "complex" || script === "unknown") return `Cell R${cell.row + 1} C${cell.column + 1} uses text that the current static table reconstruction cannot shape safely.`;
  }
  return null;
}

function sizeCellRows(cells: NativeTableEditCell[], rows: number): NativeTableEditCell[] {
  return cells.filter((cell) => cell.row < rows).map((cell) => ({ ...cell, rowSpan: Math.min(cell.rowSpan, rows - cell.row) }));
}

function sizeCellColumns(cells: NativeTableEditCell[], columns: number): NativeTableEditCell[] {
  return cells.filter((cell) => cell.column < columns).map((cell) => ({ ...cell, columnSpan: Math.min(cell.columnSpan, columns - cell.column) }));
}

function anchorInside(cell: NativeTableEditCell, target: NativeTableEditCell): boolean {
  return cell.row >= target.row
    && cell.row < target.row + target.rowSpan
    && cell.column >= target.column
    && cell.column < target.column + target.columnSpan;
}

export function NativeTablePropertiesPanel({ object, queued, onQueue }: Props) {
  const [edit, setEdit] = useState<NativeTableEdit>(() => queued ?? initialEdit(object));

  useEffect(() => setEdit(queued ?? initialEdit(object)), [object.id]);

  const error = useMemo(() => edit.action === "delete" ? null : gridError(edit) ?? scriptError(edit), [edit]);
  const unsupported = object.editability === "unsupported" || object.complexContent === true;

  function updateCell(id: string, patch: Partial<NativeTableEditCell>): void {
    setEdit((current) => {
      const source = current.cells.find((cell) => cell.id === id);
      if (!source) return current;
      const next: NativeTableEditCell = {
        ...source,
        ...patch,
        rowSpan: Math.max(1, Math.min(Math.floor(patch.rowSpan ?? source.rowSpan), current.rows - source.row)),
        columnSpan: Math.max(1, Math.min(Math.floor(patch.columnSpan ?? source.columnSpan), current.columns - source.column))
      };
      const spanChanged = next.rowSpan !== source.rowSpan || next.columnSpan !== source.columnSpan;
      const remaining = current.cells.filter((cell) => cell.id !== id && (!spanChanged || !anchorInside(cell, next)));
      return normalizeGrid({ ...current, cells: [next, ...remaining] });
    });
  }

  function addRow(): void {
    setEdit((current) => {
      const rows = current.rows + 1;
      const average = current.rowHeights.reduce((sum, value) => sum + value, 0) / Math.max(1, current.rowHeights.length);
      return normalizeGrid({ ...current, rows, rowHeights: [...current.rowHeights, Math.max(12, average)] });
    });
  }

  function removeRow(): void {
    setEdit((current) => {
      if (current.rows <= 1) return current;
      const rows = current.rows - 1;
      return normalizeGrid({ ...current, rows, rowHeights: current.rowHeights.slice(0, rows), cells: sizeCellRows(current.cells, rows), headerRows: Math.min(current.headerRows, rows) });
    });
  }

  function addColumn(): void {
    setEdit((current) => {
      const columns = current.columns + 1;
      const average = current.columnWidths.reduce((sum, value) => sum + value, 0) / Math.max(1, current.columnWidths.length);
      return normalizeGrid({ ...current, columns, columnWidths: [...current.columnWidths, Math.max(18, average)] });
    });
  }

  function removeColumn(): void {
    setEdit((current) => {
      if (current.columns <= 1) return current;
      const columns = current.columns - 1;
      return normalizeGrid({ ...current, columns, columnWidths: current.columnWidths.slice(0, columns), cells: sizeCellColumns(current.cells, columns) });
    });
  }

  function queue(): void {
    if (unsupported || error) return;
    const cells = edit.cells.map((cell) => ({ ...cell, fontFamily: familyForText(cell.text, cell.fontFamily) }));
    onQueue({ ...edit, id: queued?.id ?? edit.id, cells, sourceBounds: object.bounds });
  }

  return <section className="property-section property-stack">
    <p className="eyebrow">Existing table · P5</p>
    <h3>Table editing</h3>
    <dl className="native-object-facts">
      <dt>Detected grid</dt><dd>{object.rows} rows × {object.columns} columns</dd>
      <dt>Detection</dt><dd>{object.detectionSource ?? "aligned-text"}</dd>
      <dt>Merged cells</dt><dd>{object.mergedCells ?? 0}</dd>
      <dt>Confidence</dt><dd>{Math.round(object.confidence * 100)}%</dd>
    </dl>

    {unsupported ? <div className="warning-banner"><strong>Structured editing blocked</strong><span>This table contains images or non-grid artwork inside its detected boundary. PDF Studio leaves it unchanged rather than removing embedded content during reconstruction.</span></div> : <>
      <label className="property-field"><span>Operation</span><select aria-label="Table operation" value={edit.action} onChange={(event) => setEdit((current) => ({ ...current, action: event.target.value as NativeTableEdit["action"] }))}><option value="rebuild">Edit structured table</option><option value="delete">Delete table</option></select></label>

      {edit.action === "delete" ? <div className="warning-banner"><strong>Permanent table deletion</strong><span>The detected table text and grid line art are removed from this table boundary. Images are explicitly preserved.</span></div> : <>
        <h4>Table geometry</h4>
        <GeometryEditor bounds={edit.bounds} onChange={(bounds) => setEdit((current) => ({ ...current, bounds }))} />
        <div className="property-grid-two">
          <button className="button button--secondary button--small" type="button" onClick={addRow}>Add row</button>
          <button className="button button--secondary button--small" type="button" onClick={removeRow} disabled={edit.rows <= 1}>Remove last row</button>
          <button className="button button--secondary button--small" type="button" onClick={addColumn}>Add column</button>
          <button className="button button--secondary button--small" type="button" onClick={removeColumn} disabled={edit.columns <= 1}>Remove last column</button>
        </div>
        <p className="property-note">Current structure: {edit.rows} rows × {edit.columns} columns. Row and column measurements are proportionally normalized to the table box at export.</p>

        <details open>
          <summary>Row & column sizes</summary>
          <div className="property-stack">
            {edit.rowHeights.map((height, index) => <NumberInput key={`row-${index}`} label={`Row ${index + 1} height`} value={height} min={4} step={1} onChange={(value) => setEdit((current) => ({ ...current, rowHeights: current.rowHeights.map((item, itemIndex) => itemIndex === index ? value : item) }))} />)}
            {edit.columnWidths.map((width, index) => <NumberInput key={`column-${index}`} label={`Column ${index + 1} width`} value={width} min={4} step={1} onChange={(value) => setEdit((current) => ({ ...current, columnWidths: current.columnWidths.map((item, itemIndex) => itemIndex === index ? value : item) }))} />)}
          </div>
        </details>

        <h4>Table appearance</h4>
        <div className="property-grid-two"><ColorInput label="Border" value={edit.borderColor} onChange={(borderColor) => setEdit((current) => ({ ...current, borderColor }))} /><NumberInput label="Border width" value={edit.borderWidth} min={0} max={20} step={0.25} onChange={(borderWidth) => setEdit((current) => ({ ...current, borderWidth }))} /></div>
        <div className="property-grid-two"><label className="property-field"><span>Border style</span><select aria-label="Table border style" value={edit.borderStyle} onChange={(event) => setEdit((current) => ({ ...current, borderStyle: event.target.value as NativeTableEdit["borderStyle"] }))}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="none">None</option></select></label><NumberInput label="Cell padding" value={edit.cellPadding} min={0} max={50} step={0.5} onChange={(cellPadding) => setEdit((current) => ({ ...current, cellPadding }))} /></div>

        <h4>Cells</h4>
        <p className="property-note">Increase a cell's row or column span to merge the covered cells into it. The selected cell keeps its content; covered cell content is removed. Reduce the span again to split the area back into editable cells.</p>
        <div className="native-table-editor" style={{ gridTemplateColumns: `repeat(${Math.max(1, edit.columns)}, minmax(110px, 1fr))` }}>
          {[...edit.cells].sort((a, b) => a.row - b.row || a.column - b.column).map((cell) => <label key={cell.id} style={{ gridColumn: `${cell.column + 1} / span ${cell.columnSpan}`, gridRow: `${cell.row + 1} / span ${cell.rowSpan}` }}>
            <small>R{cell.row + 1} C{cell.column + 1}{cell.rowSpan > 1 || cell.columnSpan > 1 ? ` · ${cell.rowSpan}×${cell.columnSpan}` : ""}</small>
            <textarea aria-label={`Cell R${cell.row + 1} C${cell.column + 1}`} rows={3} value={cell.text} onChange={(event) => updateCell(cell.id, { text: event.target.value })} />
            <div className="property-grid-two"><label className="property-field"><span>Horizontal</span><select aria-label={`Cell R${cell.row + 1} C${cell.column + 1} horizontal alignment`} value={cell.align} onChange={(event) => updateCell(cell.id, { align: event.target.value as NativeTableHorizontalAlign })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label className="property-field"><span>Vertical</span><select aria-label={`Cell R${cell.row + 1} C${cell.column + 1} vertical alignment`} value={cell.verticalAlign} onChange={(event) => updateCell(cell.id, { verticalAlign: event.target.value as NativeTableVerticalAlign })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label></div>
            <div className="property-grid-two"><NumberInput label="Row span" value={cell.rowSpan} min={1} max={edit.rows - cell.row} step={1} onChange={(rowSpan) => updateCell(cell.id, { rowSpan: Math.floor(rowSpan) })} /><NumberInput label="Column span" value={cell.columnSpan} min={1} max={edit.columns - cell.column} step={1} onChange={(columnSpan) => updateCell(cell.id, { columnSpan: Math.floor(columnSpan) })} /></div>
            <div className="property-grid-two"><NumberInput label="Font size" value={cell.fontSize} min={4} max={72} step={0.5} onChange={(fontSize) => updateCell(cell.id, { fontSize })} /><label className="property-field"><span>Font</span><select value={cell.fontFamily} onChange={(event) => updateCell(cell.id, { fontFamily: event.target.value as NativeEditableFontFamily })}><option value="Helvetica">Helvetica</option><option value="Times-Roman">Times</option><option value="Courier">Courier</option><option value="ko">Korean</option><option value="ja">Japanese</option><option value="zh-Hans">Chinese Simplified</option><option value="zh-Hant">Chinese Traditional</option></select></label></div>
            <div className="property-grid-two"><ColorInput label="Text" value={cell.textColor} onChange={(textColor) => updateCell(cell.id, { textColor })} /><ColorInput label="Fill" value={cell.fillColor ?? "#ffffff"} onChange={(fillColor) => updateCell(cell.id, { fillColor })} /></div>
            {cell.fillColor ? <button className="button button--secondary button--small" type="button" onClick={() => updateCell(cell.id, { fillColor: undefined })}>Clear cell fill</button> : null}
          </label>)}
        </div>

        {error ? <div className="warning-banner"><strong>Table cannot be queued yet</strong><span>{error}</span></div> : <p className="property-note">P5 will remove only the detected table text/grid region, preserve images, rebuild the structured cells locally, then reopen the output and verify edited cell text.</p>}
      </>}

      <button className={edit.action === "delete" ? "button button--danger" : "button"} disabled={Boolean(error)} onClick={queue} type="button">{queued ? "Update table change" : edit.action === "delete" ? "Delete existing table" : "Apply structured table edit"}</button>
    </>}
  </section>;
}

function GeometryEditor({ bounds, onChange }: { bounds: NativeRect; onChange: (bounds: NativeRect) => void }) {
  return <div className="property-grid-two"><NumberInput label="X" value={bounds.x} step={1} onChange={(x) => onChange({ ...bounds, x })} /><NumberInput label="Y" value={bounds.y} step={1} onChange={(y) => onChange({ ...bounds, y })} /><NumberInput label="Width" value={bounds.w} min={1} step={1} onChange={(w) => onChange({ ...bounds, w })} /><NumberInput label="Height" value={bounds.h} min={1} step={1} onChange={(h) => onChange({ ...bounds, h })} /></div>;
}

function NumberInput({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="property-field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="property-color"><span>{label}</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value)} /><code>{value}</code></label>;
}
