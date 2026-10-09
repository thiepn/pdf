import type { SecurityFormField } from "../types/security";

/** Local-only, explicit CSV exchange. Protect against formulas in untrusted PDF data. */
export function formFieldsToCsv(fields: readonly SecurityFormField[]): string {
  const cell = (input: string): string => {
    const cleaned = input.replace(/\u0000/g, "");
    const safe = /^[\s\uFEFF]*[=+\-@]/u.test(cleaned) ? "'" + cleaned : cleaned;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const headers = ["page", "name", "label", "type", "value", "readOnly", "signed"];
  const rows = fields.map(field => [
    String(field.pageNumber), field.name, field.label, field.type,
    field.password ? "[password omitted]" :
      field.type === "signature" ? "[signature contents omitted]" : field.value,
    field.readOnly ? "true" : "false",
    field.signed === null ? "" : String(field.signed)
  ]);
  return "\uFEFF" + [headers, ...rows].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
