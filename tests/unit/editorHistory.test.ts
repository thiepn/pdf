import { describe, expect, it } from "vitest";
import { commitHistory, createHistory, historyRevisionIsDirty, redoHistory, sealHistoryMergeBoundary, undoHistory, withHistorySelection } from "../../src/editor/editorHistory";
import { createObjectForTool } from "../../src/editor/editorModel";
import type { NativeEdit } from "../../src/types/nativeEditor";

describe("editor history", () => {
  it("undoes and redoes object additions", () => {
    const object = createObjectForTool({ tool: "text", pageNumber: 1, bounds: { x0: 0, y0: 0, x1: 100, y1: 40 }, author: "Test", zIndex: 1 });
    if (!object) throw new Error("Fixture creation failed");
    const initial = createHistory();
    const committed = commitHistory(initial, "Add text", [object], [object.id]);
    expect(committed.present.objects).toHaveLength(1);
    const undone = undoHistory(committed);
    expect(undone.present.objects).toHaveLength(0);
    expect(redoHistory(undone).present.objects).toHaveLength(1);
  });

  it("undoes and redoes existing-PDF edits in the same history", () => {
    const nativeEdit: NativeEdit = {
      id: "native-text-1",
      kind: "text",
      objectId: "source-text-1",
      pageNumber: 1,
      originalText: "Before",
      text: "After",
      bounds: { x: 10, y: 20, w: 100, h: 20 },
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#000000",
      backgroundColor: "#ffffff",
      align: "left",
      mode: "replace",
      wrap: true,
      fontSource: "built-in"
    };
    const initial = createHistory();
    const committed = commitHistory(initial, "Edit existing PDF content", [], [], undefined, [nativeEdit]);
    expect(committed.present.nativeEdits).toHaveLength(1);
    expect(undoHistory(committed).present.nativeEdits).toHaveLength(0);
    expect(redoHistory(undoHistory(committed)).present.nativeEdits[0]).toMatchObject({ kind: "text", text: "After" });
  });

  it("does not duplicate embedded native font bytes across ordinary history steps", () => {
    const fontBytes = new Uint8Array([1, 2, 3, 4]);
    const nativeEdit: NativeEdit = {
      id: "native-text-font",
      kind: "text",
      objectId: "source-text-font",
      pageNumber: 1,
      originalText: "Before",
      text: "After",
      bounds: { x: 10, y: 20, w: 100, h: 20 },
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#000000",
      backgroundColor: "#ffffff",
      align: "left",
      mode: "replace",
      wrap: true,
      fontSource: "imported-latin",
      fontBytes
    };
    const withNative = commitHistory(createHistory(), "Native text", [], [], undefined, [nativeEdit]);
    const object = createObjectForTool({ tool: "text", pageNumber: 1, bounds: { x0: 0, y0: 0, x1: 100, y1: 40 }, author: "Test", zIndex: 1 });
    if (!object) throw new Error("Fixture creation failed");
    const withOverlay = commitHistory(withNative, "Add text", [object], [object.id]);
    const queued = withOverlay.present.nativeEdits[0];
    expect(queued).toBe(nativeEdit);
    expect(queued.kind === "text" ? queued.fontBytes : undefined).toBe(fontBytes);
  });

  it("keeps native edits while overlay edits are committed and undone", () => {
    const nativeEdit: NativeEdit = {
      id: "native-text-1",
      kind: "text",
      objectId: "source-text-1",
      pageNumber: 1,
      originalText: "Before",
      text: "After",
      bounds: { x: 10, y: 20, w: 100, h: 20 },
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#000000",
      backgroundColor: "#ffffff",
      align: "left",
      mode: "replace",
      wrap: true,
      fontSource: "built-in"
    };
    const object = createObjectForTool({ tool: "text", pageNumber: 1, bounds: { x0: 0, y0: 0, x1: 100, y1: 40 }, author: "Test", zIndex: 1 });
    if (!object) throw new Error("Fixture creation failed");
    const withNative = commitHistory(createHistory(), "Edit existing PDF content", [], [], undefined, [nativeEdit]);
    const withOverlay = commitHistory(withNative, "Add text", [object], [object.id]);
    expect(withOverlay.present.nativeEdits).toHaveLength(1);
    const undone = undoHistory(withOverlay);
    expect(undone.present.objects).toHaveLength(0);
    expect(undone.present.nativeEdits).toHaveLength(1);
  });

  it("restores both added-object and existing-PDF selections across a transaction", () => {
    const object = createObjectForTool({ tool: "text", pageNumber: 1, bounds: { x0: 0, y0: 0, x1: 100, y1: 40 }, author: "Test", zIndex: 1 });
    if (!object) throw new Error("Fixture creation failed");
    const selected = withHistorySelection(createHistory([object], [], 2), [object.id], ["native-image-1"], "native-image-1", 2);
    const deleted = commitHistory(selected, "Delete selection", [], [], undefined, [], [], undefined);
    expect(deleted.present.selectedIds).toEqual([]);
    expect(deleted.present.selectedNativeIds).toEqual([]);

    const undone = undoHistory(deleted);
    expect(undone.present.selectedIds).toEqual([object.id]);
    expect(undone.present.selectedNativeIds).toEqual(["native-image-1"]);
    expect(undone.present.selectedNativeId).toBe("native-image-1");
    expect(undone.present.pageNumber).toBe(2);

    const redone = redoHistory(undone);
    expect(redone.present.selectedIds).toEqual([]);
    expect(redone.present.selectedNativeIds).toEqual([]);
    expect(redone.present.selectedNativeId).toBeUndefined();
    expect(redone.present.pageNumber).toBe(2);
  });

  it("tracks a saved revision independently of selection and page context", () => {
    const initial = createHistory([], [], 2);
    const savedRevision = initial.present.revisionId;
    expect(historyRevisionIsDirty(initial, savedRevision)).toBe(false);

    const selected = withHistorySelection(initial, [], ["native-1"], "native-1", 3);
    expect(selected.present.revisionId).toBe(savedRevision);
    expect(historyRevisionIsDirty(selected, savedRevision)).toBe(false);

    const changed = commitHistory(selected, "Change", [], [], "property:test");
    expect(changed.present.revisionId).not.toBe(savedRevision);
    expect(historyRevisionIsDirty(changed, savedRevision)).toBe(true);
    expect(historyRevisionIsDirty(undoHistory(changed), savedRevision)).toBe(false);
  });

  it("seals a saved history entry so a rapid post-export edit cannot merge across it", () => {
    const initial = createHistory();
    const first = commitHistory(initial, "Edit", [], [], "property:text");
    const savedRevision = first.present.revisionId;
    const sealed = sealHistoryMergeBoundary(first);
    expect(sealed.present.revisionId).toBe(savedRevision);
    expect(sealed.present.mergeKey).toBeUndefined();

    const afterExportEdit = commitHistory(sealed, "Edit", [], [], "property:text");
    expect(afterExportEdit.past.at(-1)?.revisionId).toBe(savedRevision);
    expect(undoHistory(afterExportEdit).present.revisionId).toBe(savedRevision);
  });

  it("merges rapid property edits into one undo step", () => {
    const object = createObjectForTool({ tool: "text", pageNumber: 1, bounds: { x0: 0, y0: 0, x1: 100, y1: 40 }, author: "Test", zIndex: 1 });
    if (!object || object.type !== "text") throw new Error("Fixture creation failed");
    const first = commitHistory(createHistory([object]), "Edit text", [{ ...object, text: "A" }], [object.id], `text:${object.id}`);
    const second = commitHistory(first, "Edit text", [{ ...object, text: "AB" }], [object.id], `text:${object.id}`);
    expect(second.past).toHaveLength(1);
    expect((second.present.objects[0] as typeof object).text).toBe("AB");
    expect((undoHistory(second).present.objects[0] as typeof object).text).toBe(object.text);
  });
});
