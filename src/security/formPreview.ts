import type { SecurityFormField } from "../types/security";

export interface PreviewWidget { id: string; subtype?: string; fieldName?: string; exportValue?: string; buttonValue?: string; multiSelect?: boolean; }
/** Maps real PDF.js widget IDs, not our internal form IDs. No persistent writes. */
export function previewFormValues(widgets: PreviewWidget[], fields: SecurityFormField[], values: Record<string, string> = {}): Array<{ id: string; value: string | string[] | boolean }> {
  return widgets.filter((widget) => widget.subtype === "Widget").flatMap<{ id: string; value: string | string[] | boolean }>((widget, index) => {
    const field = widget.fieldName ? fields.find((item) => item.name === widget.fieldName) : fields.find((item) => !item.name && item.widgetIndex === index);
    if (!field || field.readOnly || ["signature", "button", "unknown"].includes(field.type)) return [];
    const value = values[field.id] ?? field.value;
    if (field.type === "checkbox" || field.type === "radiobutton") return [{ id: widget.id, value: value !== "Off" && value !== "" && value === (widget.exportValue ?? widget.buttonValue ?? "Yes") }];
    if (field.type === "listbox" || field.type === "combobox") return [{ id: widget.id, value: [value] }];
    return [{ id: widget.id, value }];
  });
}
