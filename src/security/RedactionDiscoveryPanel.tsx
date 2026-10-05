import { useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  discoverRedactionCandidates,
  maskSensitivePreview,
  redactionCandidateToEditorObject,
  type RedactionCandidate,
  type RedactionSearchMode,
  type SensitivePattern
} from "./redactionDiscovery";
import type { RedactionEditorObject } from "../types/editor";

interface Props {
  document: PDFDocumentProxy;
  currentPage: number;
  disabled: boolean;
  existingMarks: RedactionEditorObject[];
  onAccept: (objects: RedactionEditorObject[]) => Promise<void> | void;
  onPage: (pageNumber: number) => void;
}

const sensitiveOptions: Array<{ id: SensitivePattern; label: string }> = [
  { id: "email", label: "Email addresses" },
  { id: "phone", label: "Phone numbers" },
  { id: "iban", label: "IBANs" },
  { id: "payment-card", label: "Payment cards" }
];

export function RedactionDiscoveryPanel({ document, currentPage, disabled, existingMarks, onAccept, onPage }: Props) {
  const [mode, setMode] = useState<RedactionSearchMode>("text");
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scope, setScope] = useState<"page" | "document">("document");
  const [sensitive, setSensitive] = useState<Set<SensitivePattern>>(new Set(["email", "phone", "iban", "payment-card"]));
  const [candidates, setCandidates] = useState<RedactionCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  const selectedCount = selected.size;
  const groupedPages = useMemo(() => new Set(candidates.map((candidate) => candidate.pageNumber)).size, [candidates]);

  async function scan(): Promise<void> {
    if (disabled || scanning) return;
    setScanning(true); setError(""); setCandidates([]); setSelected(new Set());
    try {
      const found = await discoverRedactionCandidates(document, {
        mode,
        query,
        caseSensitive,
        sensitive: [...sensitive],
        pages: scope === "page" ? [currentPage] : undefined
      });
      setCandidates(found);
      setSelected(new Set(found.map((candidate) => candidate.id)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setScanning(false); }
  }

  async function accept(): Promise<void> {
    const chosen = candidates.filter((candidate) => selected.has(candidate.id));
    if (!chosen.length || accepting) return;
    setAccepting(true); setError("");
    try {
      let zIndex = Math.max(0, ...existingMarks.map((mark) => mark.zIndex));
      const objects = chosen.map((candidate) => redactionCandidateToEditorObject(candidate, ++zIndex));
      await onAccept(objects);
      const accepted = new Set(chosen.map((candidate) => candidate.id));
      setCandidates((current) => current.filter((candidate) => !accepted.has(candidate.id)));
      setSelected(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setAccepting(false); }
  }

  return <section className="p7-redaction-discovery" aria-label="Find content to redact">
    <header><div><h3>Find content to redact</h3><p>Scanning only proposes marks. Nothing is removed until you review the marks and export with Apply redactions enabled.</p></div></header>
    <div className="p7-redaction-query">
      <label><span>Find by</span><select disabled={disabled || scanning} value={mode} onChange={(event) => setMode(event.target.value as RedactionSearchMode)}><option value="text">Exact text</option><option value="regex">Regular expression</option><option value="sensitive">Sensitive data</option></select></label>
      {mode !== "sensitive" ? <label className="p7-redaction-query__text"><span>{mode === "regex" ? "Pattern" : "Text"}</span><input disabled={disabled || scanning} placeholder={mode === "regex" ? "e.g. ID-\\d{6}" : "Text to mark"} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void scan(); } }} /></label> : null}
      <label><span>Scope</span><select disabled={disabled || scanning} value={scope} onChange={(event) => setScope(event.target.value as "page" | "document")}><option value="page">Current page</option><option value="document">Whole document</option></select></label>
      <button className="button" disabled={disabled || scanning || (mode !== "sensitive" && !query.trim()) || (mode === "sensitive" && !sensitive.size)} onClick={() => void scan()} type="button">{scanning ? "Scanning…" : "Scan"}</button>
    </div>

    {mode === "sensitive" ? <div className="p7-sensitive-patterns">{sensitiveOptions.map((option) => <label key={option.id}><input checked={sensitive.has(option.id)} disabled={disabled || scanning} onChange={() => setSensitive((current) => { const next = new Set(current); if (next.has(option.id)) next.delete(option.id); else next.add(option.id); return next; })} type="checkbox" /><span>{option.label}</span></label>)}</div> : <label className="property-toggle"><input checked={caseSensitive} disabled={disabled || scanning} onChange={(event) => setCaseSensitive(event.target.checked)} type="checkbox" />Case-sensitive matching</label>}

    {error ? <p className="selection-help selection-help--error" role="alert">{error}</p> : null}

    {candidates.length ? <div className="p7-candidate-review">
      <div className="p7-review-heading"><div><strong>{candidates.length} potential match{candidates.length === 1 ? "" : "es"} on {groupedPages} page{groupedPages === 1 ? "" : "s"}</strong><span>Verify each match before creating redaction marks.</span></div><div><button onClick={() => setSelected(new Set(candidates.map((candidate) => candidate.id)))} type="button">Select all</button><button onClick={() => setSelected(new Set())} type="button">Clear</button></div></div>
      <div className="p7-candidate-list">{candidates.map((candidate) => <label className="p7-candidate p7-redaction-candidate" key={candidate.id}>
        <input checked={selected.has(candidate.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(candidate.id)) next.delete(candidate.id); else next.add(candidate.id); return next; })} type="checkbox" />
        <span><strong>{maskSensitivePreview(candidate.text)}</strong><small>Page {candidate.pageNumber} · {candidate.kind} · {candidate.confidence} confidence</small></span>
        <button onClick={(event) => { event.preventDefault(); onPage(candidate.pageNumber); }} type="button">View</button>
      </label>)}</div>
      <button className="button" disabled={disabled || accepting || !selectedCount} onClick={() => void accept()} type="button">{accepting ? "Adding marks…" : `Mark ${selectedCount} selected for redaction`}</button>
    </div> : null}
  </section>;
}
