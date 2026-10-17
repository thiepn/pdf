import type { FormFieldEditorObject } from "../types/editor";
import { FORM_FIELD_KINDS, validateFormField, type FormFieldKind } from "./formModel";

interface Props {
  field: FormFieldEditorObject;
  onPatch: (changes: Partial<FormFieldEditorObject>, label?: string, mergeKey?: string) => void;
}
const labels: Record<FormFieldKind, string> = {
  text: "Single-line text", multiline: "Paragraph text", checkbox: "Checkbox", dropdown: "Dropdown menu", listbox: "List of choices"
};
export function FormFieldProperties({ field, onPatch }: Props) {
  const issues = validateFormField(field);
  const changeKind = (kind: FormFieldKind) => {
    const choices = kind === "dropdown" || kind === "listbox";
    onPatch({
      kind, options: choices ? (field.options.length ? field.options : ["Option 1", "Option 2"]) : [],
      defaultValue: "", maxLength: 0
    }, "Change field type", undefined);
  };
  return <section className="property-section f2-field-properties" aria-label="Interactive PDF form field properties">
    <h3>Interactive form field</h3>
    <p className="property-note">Creates a real, fillable PDF form widget on download. The blue outline is an editor guide, not printed content.</p>
    <label className="property-field"><span>Field type</span>
      <select aria-label="Form field type" value={field.kind} onChange={(event) => changeKind(event.target.value as FormFieldKind)}>
        {FORM_FIELD_KINDS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
      </select>
    </label>
    <label className="property-field"><span>Field name (unique)</span>
      <input aria-label="Form field name" maxLength={64} value={field.name} onChange={(event) => onPatch({ name: event.target.value }, "Rename form field", `form-name:${field.id}`)} spellCheck={false} />
    </label>
    <label className="property-field"><span>Tooltip / accessible description</span>
      <input maxLength={256} value={field.tooltip} onChange={(event) => onPatch({ tooltip: event.target.value }, "Change field tooltip", `form-tooltip:${field.id}`)} />
    </label>
    <label className="property-toggle"><input type="checkbox" checked={field.required} onChange={(event) => onPatch({ required: event.target.checked }, "Set required field", undefined)} />Required</label>
    <label className="property-toggle"><input type="checkbox" checked={field.readOnly} onChange={(event) => onPatch({ readOnly: event.target.checked }, "Set read-only field", undefined)} />Read-only</label>
    {(field.kind === "dropdown" || field.kind === "listbox") ? <>
      <label className="property-field"><span>Choices (one per line)</span>
        <textarea aria-label="Form field options" rows={5} value={field.options.join("\n")}
          onChange={(event) => onPatch({ options: event.target.value.split(/\r?\n/) }, "Edit form choices", `form-options:${field.id}`)} />
      </label>
      <label className="property-field"><span>Default option</span>
        <select value={field.defaultValue} onChange={(event) => onPatch({ defaultValue: event.target.value }, "Set default choice", undefined)}>
          <option value="">None</option>{field.options.filter(Boolean).map((option, index) => <option key={index} value={option}>{option}</option>)}
        </select>
      </label>
    </> : field.kind === "checkbox" ?
      <label className="property-toggle"><input type="checkbox" checked={field.defaultValue === "Yes"} onChange={(event) => onPatch({ defaultValue: event.target.checked ? "Yes" : "" }, "Set initial checkbox", undefined)} />Initially checked</label>
      : <>
        <label className="property-field"><span>Default value</span>
          {field.kind === "multiline" ?
            <textarea rows={3} value={field.defaultValue} onChange={(event) => onPatch({ defaultValue: event.target.value }, "Set default text", `form-default:${field.id}`)} /> :
            <input value={field.defaultValue} onChange={(event) => onPatch({ defaultValue: event.target.value }, "Set default text", `form-default:${field.id}`)} />}
        </label>
        <label className="property-field"><span>Maximum characters (0 = unlimited)</span>
          <input type="number" min={0} max={10000} step={1} value={field.maxLength} onChange={(event) => onPatch({ maxLength: Number(event.target.value) }, "Set form text limit", undefined)} />
        </label>
      </>
    }
    <label className="property-field"><span>Text size</span>
      <input type="number" min={6} max={32} step={1} value={field.fontSize} onChange={(event) => onPatch({ fontSize: Number(event.target.value) }, "Change form text size", undefined)} />
    </label>
    {issues.length ? <div role="alert" className="property-note f2-field-errors"><strong>Fix before exporting:</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : <p className="property-note">Field configuration is valid. Export also checks collisions with existing fields.</p>}
  </section>;
}
