import type { FormFieldEditorObject } from "../types/editor";

/** F2's bounded, declarative AcroForm contract. No JavaScript/XFA or dynamic actions. */
export const FORM_FIELD_KINDS = ["text", "multiline", "checkbox", "dropdown", "listbox"] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export function fieldNameFromId(id: string): string {
  return `Field_${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "New"}`;
}

export function makeFormField(base: Omit<FormFieldEditorObject, "type" | "kind" | "name" | "tooltip" | "required" | "readOnly" | "defaultValue" | "options" | "maxLength" | "fontSize">): FormFieldEditorObject {
  return {
    ...base,
    type: "form-field",
    kind: "text",
    name: fieldNameFromId(base.id),
    tooltip: "",
    required: false,
    readOnly: false,
    defaultValue: "",
    options: [],
    maxLength: 0,
    fontSize: 11
  };
}

const NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const ASCII = /^[\x20-\x7e]*$/;

export function validateFormField(field: FormFieldEditorObject): string[] {
  const errors: string[] = [];
  if (!FORM_FIELD_KINDS.includes(field.kind)) errors.push("Unsupported field type.");
  if (!NAME.test(field.name)) errors.push("Field name must be 1–64 ASCII letters, digits, underscore or hyphen, beginning with a letter or underscore.");
  if (!Number.isInteger(field.pageNumber) || field.pageNumber < 1) errors.push("Page number is invalid.");
  if (![field.bounds.x0, field.bounds.y0, field.bounds.x1, field.bounds.y1].every(Number.isFinite)
    || field.bounds.x1 - field.bounds.x0 < 12 || field.bounds.y1 - field.bounds.y0 < 12) errors.push("Field must be at least 12 × 12 PDF points.");
  if (field.rotation !== 0 || field.opacity !== 1) errors.push("Form fields do not support rotation or opacity in this designer.");
  if (!Number.isFinite(field.fontSize) || field.fontSize < 6 || field.fontSize > 32) errors.push("Font size must be between 6 and 32.");
  if (!Number.isInteger(field.maxLength) || field.maxLength < 0 || field.maxLength > 10000) errors.push("Maximum characters must be 0–10000.");
  if (field.name.length > 64 || field.tooltip.length > 256 || field.defaultValue.length > 10000) errors.push("Field text exceeds its length limit.");
  if (field.kind !== "checkbox" && !ASCII.test(field.defaultValue)) errors.push("Default display value currently supports printable Latin ASCII only.");
  if (field.maxLength && field.defaultValue.length > field.maxLength && (field.kind === "text" || field.kind === "multiline")) errors.push("Default value exceeds maximum characters.");
  if (field.kind === "dropdown" || field.kind === "listbox") {
    if (!field.options.length || field.options.length > 50) errors.push("Choice fields require 1–50 options.");
    if (field.options.some((value) => !value || value.length > 100 || !ASCII.test(value))) errors.push("Choice options must be non-empty, printable Latin ASCII and at most 100 characters.");
    if (new Set(field.options).size !== field.options.length) errors.push("Choice options must be unique.");
    if (field.defaultValue && !field.options.includes(field.defaultValue)) errors.push("Default choice must match an option.");
  } else if (field.options.length) errors.push("Only choice fields may contain options.");
  if (field.kind === "checkbox" && field.defaultValue && field.defaultValue !== "Yes") errors.push("Checkbox default must be blank or Yes.");
  return errors;
}

export function validateFormFields(fields: FormFieldEditorObject[], existingNames: Iterable<string> = []): void {
  if (fields.length > 100) throw new Error("A single export supports up to 100 new form fields.");
  const names = new Set(existingNames);
  for (const field of fields) {
    const errors = validateFormField(field);
    if (errors.length) throw new Error(`Field ${field.name || "(unnamed)"}: ${errors.join(" ")}`);
    if (names.has(field.name)) throw new Error(`Duplicate form field name: ${field.name}. Use a unique field name.`);
    names.add(field.name);
  }
}
