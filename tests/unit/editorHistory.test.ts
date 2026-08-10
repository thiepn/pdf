import { describe, expect, it } from "vitest";
import { commitHistory, createHistory, redoHistory, undoHistory } from "../../src/editor/editorHistory";
import { createObjectForTool } from "../../src/editor/editorModel";

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
