import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  createManualFormField,
  detectFormFieldCandidates,
  formCandidateToCreate,
  updateFormCreateGeometry,
  validateFormCreates,
  type FormFieldCandidate
} from "./formAuthoring";
import type { FormFieldCreate, FormFieldCreateType, SecurityFormField } from "../types/security";

interface Props {
  document: PDFDocumentProxy;
  existingFields: SecurityFormField[];
  drafts: FormFieldCreate[];
  currentPage: number;
  disabled: boolean;
  onDrafts: (value: FormFieldCreate[]) => void;
  onPage: (pageNumber: number) => void;
}

export function FormAuthoringPanel({ document, existingFields, drafts, currentPage, disabled, onDrafts, onPage }: Props) {
  const [scope, setScope] = useState<"page" | "document">("page");
  const [candidates, setCandidates] = useState<FormFieldCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const scanRef = useRef<AbortController | null>(null);
  useEffect(() => () => scanRef.current?.abort(), []);

  const validationErrors = useMemo(() => validateFormCreates(drafts, existingFields), [drafts, existingFields]);

  async function scan(): Promise<void> {
    if (disabled || scanning) return;
    const controller = new AbortController();
    scanRef.current?.abort();
    scanRef.current = controller;
    setScanning(true); setProgress("Starting scan…"); setError(""); setCandidates([]); setSelected(new Set());
    try {
      const found = await detectFormFieldCandidates(
        document,
        [...existingFields, ...drafts.map(toInspectionField)],
        scope === "page" ? [currentPage] : undefined,
        controller.signal,
        (completed, total) => setProgress(`Scanning page ${completed} of ${total}…`)
      );
      setCandidates(found);
      setSelected(new Set(found.filter((candidate) => candidate.confidence === "high").map((candidate) => candidate.id)));
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (scanRef.current === controller) scanRef.current = null;
      setScanning(false); setProgress("");
    }
  }

  function addManual(type: FormFieldCreateType): void {
    const draft = createManualFormField(currentPage, type, drafts.length);
    onDrafts([...drafts, draft]);
  }

  function acceptSelected(): void {
    const additions = candidates.filter((candidate) => selected.has(candidate.id)).map(formCandidateToCreate);
    if (!additions.length) return;
    onDrafts([...drafts, ...additions]);
    const accepted = new Set(additions.map((draft) => draft.id.replace("form-create:", "form-candidate:")));
    setCandidates((current) => current.filter((candidate) => !accepted.has(candidate.id)));
    setSelected(new Set());
  }

  function patch(id: string, update: Partial<FormFieldCreate>): void {
    onDrafts(drafts.map((draft) => draft.id === id ? { ...draft, ...update } : draft));
  }

  function patchGeometry(id: string, key: "x" | "y" | "width" | "height", value: number): void {
    onDrafts(drafts.map((draft) => draft.id === id
      ? updateFormCreateGeometry(draft, { [key]: Number.isFinite(value) ? value : undefined })
      : draft));
  }

  return <section className="p7-form-authoring" aria-label="Create interactive form fields">
    <header><div><h3>Create interactive fields</h3><p>Detect likely fields or add them manually. Suggestions never change the PDF until you export.</p></div><span>{drafts.length} new</span></header>

    <div className="p7-authoring-actions">
      <label><span>Detection scope</span><select disabled={disabled || scanning} value={scope} onChange={(event) => setScope(event.target.value as "page" | "document")}><option value="page">Current page</option><option value="document">Whole document</option></select></label>
      {scanning ? <button className="button button--secondary" onClick={() => scanRef.current?.abort()} type="button">Cancel scan</button> : <button className="button button--secondary" disabled={disabled} onClick={() => void scan()} type="button">Detect fields</button>}
      <button disabled={disabled} onClick={() => addManual("text")} type="button">+ Text field</button>
      <button disabled={disabled} onClick={() => addManual("checkbox")} type="button">+ Checkbox</button>
    </div>

    {progress ? <p className="quick-hint" role="status">{progress}</p> : null}
    {error ? <p className="selection-help selection-help--error" role="alert">{error}</p> : null}

    {candidates.length ? <div className="p7-candidate-review">
      <div className="p7-review-heading"><div><strong>{candidates.length} suggestion{candidates.length === 1 ? "" : "s"}</strong><span>Review before adding. High-confidence suggestions are selected initially.</span></div><div><button onClick={() => setSelected(new Set(candidates.map((candidate) => candidate.id)))} type="button">Select all</button><button onClick={() => setSelected(new Set())} type="button">Clear</button></div></div>
      <div className="p7-candidate-list">{candidates.map((candidate) => <label key={candidate.id} className="p7-candidate">
        <input checked={selected.has(candidate.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(candidate.id)) next.delete(candidate.id); else next.add(candidate.id); return next; })} type="checkbox" />
        <span><strong>{candidate.label}</strong><small>Page {candidate.pageNumber} · {candidate.type} · {candidate.confidence} confidence</small><small>{candidate.reason}</small></span>
        <button onClick={(event) => { event.preventDefault(); onPage(candidate.pageNumber); }} type="button">View</button>
      </label>)}</div>
      <button className="button" disabled={!selected.size || disabled} onClick={acceptSelected} type="button">Add {selected.size} selected field{selected.size === 1 ? "" : "s"}</button>
    </div> : null}

    {drafts.length ? <div className="p7-form-drafts">
      <div className="p7-review-heading"><div><strong>New interactive fields</strong><span>Text and checkbox fields are supported. The exported PDF is reopened and checked before release.</span></div></div>
      {validationErrors.length ? <div className="security-critical-note"><strong>Fix field setup before export</strong>{validationErrors.map((message) => <p key={message}>{message}</p>)}</div> : null}
      {drafts.map((draft) => <article className="p7-form-draft" key={draft.id}>
        <header><div><strong>{draft.label || draft.name || draft.type}</strong><small>Page {draft.pageNumber} · {draft.type}</small></div><div><button onClick={() => onPage(draft.pageNumber)} type="button">View</button><button disabled={disabled} onClick={() => onDrafts(drafts.filter((item) => item.id !== draft.id))} type="button">Remove</button></div></header>
        <div className="p7-form-draft__grid">
          <label><span>Label</span><input disabled={disabled} value={draft.label} onChange={(event) => patch(draft.id, { label: event.target.value })} /></label>
          <label><span>Field name</span><input disabled={disabled} value={draft.name} onChange={(event) => patch(draft.id, { name: event.target.value })} /></label>
          <label><span>X</span><input disabled={disabled} type="number" value={round(draft.rect.x0)} onChange={(event) => patchGeometry(draft.id, "x", Number(event.target.value))} /></label>
          <label><span>Y</span><input disabled={disabled} type="number" value={round(draft.rect.y0)} onChange={(event) => patchGeometry(draft.id, "y", Number(event.target.value))} /></label>
          <label><span>Width</span><input disabled={disabled} min="8" type="number" value={round(draft.rect.x1 - draft.rect.x0)} onChange={(event) => patchGeometry(draft.id, "width", Number(event.target.value))} /></label>
          <label><span>Height</span><input disabled={disabled} min="8" type="number" value={round(draft.rect.y1 - draft.rect.y0)} onChange={(event) => patchGeometry(draft.id, "height", Number(event.target.value))} /></label>
        </div>
        {draft.type === "text" ? <><label className="property-field"><span>Default value</span><input disabled={disabled} value={draft.defaultValue} onChange={(event) => patch(draft.id, { defaultValue: event.target.value })} /></label><label className="property-toggle"><input checked={draft.multiline} disabled={disabled} onChange={(event) => patch(draft.id, { multiline: event.target.checked })} type="checkbox" />Multiline text</label></> : null}
        <label className="property-toggle"><input checked={draft.required} disabled={disabled} onChange={(event) => patch(draft.id, { required: event.target.checked })} type="checkbox" />Required field</label>
      </article>)}
    </div> : <p className="property-note">No new interactive fields are staged.</p>}
  </section>;
}

function toInspectionField(draft: FormFieldCreate): SecurityFormField {
  return { id: draft.id, pageNumber: draft.pageNumber, widgetIndex: -1, type: draft.type, name: draft.name, label: draft.label, value: draft.defaultValue, options: [], rect: draft.rect, readOnly: false, multiline: draft.multiline, password: false, comb: false, signed: null };
}
function round(value: number): number { return Math.round(value * 10) / 10; }
