import { describe, expect, it } from "vitest";
import { NATIVE_EDITOR_SCHEMA_VERSION, type NativeTableEdit } from "../../src/types/nativeEditor";

describe("P5 structured table edit schema", () => {
  it("stores grid geometry, merged cells and appearance in one table-scoped edit", () => {
    const edit: NativeTableEdit = {
      id: "table-edit",
      kind: "table",
      objectId: "table:1:0",
      pageNumber: 1,
      action: "rebuild",
      sourceBounds: { x: 72, y: 378, w: 288, h: 84 },
      bounds: { x: 80, y: 380, w: 320, h: 96 },
      rows: 2,
      columns: 2,
      rowHeights: [40, 56],
      columnWidths: [160, 160],
      headerRows: 1,
      borderColor: "#333333",
      borderWidth: 1.5,
      borderStyle: "dashed",
      cellPadding: 5,
      cells: [
        { id: "head", row: 0, column: 0, rowSpan: 1, columnSpan: 2, text: "Summary", fontSize: 11, fontFamily: "Helvetica", align: "center", verticalAlign: "middle", fillColor: "#eeeeee", textColor: "#111111" },
        { id: "left", row: 1, column: 0, rowSpan: 1, columnSpan: 1, text: "A", fontSize: 10, fontFamily: "Helvetica", align: "left", verticalAlign: "middle", textColor: "#111111" },
        { id: "right", row: 1, column: 1, rowSpan: 1, columnSpan: 1, text: "B", fontSize: 10, fontFamily: "Helvetica", align: "right", verticalAlign: "bottom", textColor: "#111111" }
      ]
    };

    expect(NATIVE_EDITOR_SCHEMA_VERSION).toBe(5);
    expect(edit.kind).toBe("table");
    expect(edit.cells[0].columnSpan).toBe(2);
    expect(edit.borderStyle).toBe("dashed");
  });

  it("supports table-scoped deletion without synthetic cell edits", () => {
    const edit: NativeTableEdit = {
      id: "table-delete",
      kind: "table",
      objectId: "table:1:0",
      pageNumber: 1,
      action: "delete",
      sourceBounds: { x: 72, y: 378, w: 288, h: 84 },
      bounds: { x: 72, y: 378, w: 288, h: 84 },
      rows: 3,
      columns: 3,
      rowHeights: [28, 28, 28],
      columnWidths: [96, 96, 96],
      headerRows: 1,
      borderColor: "#444444",
      borderWidth: 1,
      borderStyle: "solid",
      cellPadding: 4,
      cells: []
    };
    expect(edit.action).toBe("delete");
    expect(edit.cells).toHaveLength(0);
  });
});
