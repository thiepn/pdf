import { useRef, useState } from "react";
import { inspectPdfBytes } from "../engines/pdfjs";
import { downloadBlob } from "../projects/download";
import { createProjectFromBytes } from "../projects/projectRepository";
import { routeHref } from "../core/appRouter";
import { mergePdfSources } from "../tools/pageOperationsClient";

interface MergeEntry { id: string; file: File; pageCount: number; byteLength: number; bytes: Uint8Array }

export function MergeToolPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [entries, setEntries] = useState<MergeEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function addFiles(files: FileList | File[]): Promise<void> {
    setBusy(true); setError(null); setStatus("Inspecting PDFs…");
    try {
      const next: MergeEntry[] = [];
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const summary = await inspectPdfBytes(bytes);
        next.push({ id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`, file, pageCount: summary.pageCount, byteLength: bytes.byteLength, bytes });
      }
      setEntries((current) => [...current, ...next]);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(/password|encrypted/i.test(message) ? "Password-protected inputs require opening and saving an authenticated copy before merging." : message);
    } finally { setBusy(false); setStatus(null); }
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries]; [next[index], next[target]] = [next[target], next[index]]; setEntries(next);
  }

  async function run(saveProject: boolean): Promise<void> {
    if (!entries.length) return;
    setBusy(true); setError(null); setWarnings([]); setStatus("Merging local PDFs…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const result = await mergePdfSources(entries.map((entry) => ({ name: entry.file.name, bytes: entry.bytes })), controller.signal);
      const summary = await inspectPdfBytes(result.bytes);
      const expected = entries.reduce((sum, entry) => sum + entry.pageCount, 0);
      if (summary.pageCount !== expected) throw new Error(`Validation failed: expected ${expected} pages, received ${summary.pageCount}.`);
      setWarnings(result.warnings);
      if (saveProject) {
        const project = await createProjectFromBytes(result.bytes, "merged.pdf");
        window.location.hash = routeHref({ name: "viewer", projectId: project.id }).slice(1);
      } else {
        downloadBlob(new Blob([Uint8Array.from(result.bytes).buffer], { type: "application/pdf" }), "merged.pdf");
        setStatus(`Validated ${summary.pageCount}-page merged PDF.`);
      }
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); abortRef.current = null; }
  }

  return (
    <div className="tool-workspace">
      <section className="tool-intro"><p className="eyebrow">Organize</p><h2>Merge PDFs locally</h2><p>Combine complete PDFs in the chosen order. The source files remain unchanged and are never uploaded.</p></section>
      <section className="tool-card">
        <div className="tool-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}>
          <strong>Drop PDF files here</strong><span>or choose several local files</span><button className="button" disabled={busy} onClick={() => inputRef.current?.click()} type="button">Add PDFs</button>
          <input ref={inputRef} hidden multiple accept="application/pdf,.pdf" onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ""; }} type="file" />
        </div>
        <div className="warning-banner"><strong>What may change</strong><span>Merging rebuilds the document page tree. Bookmarks, signatures, attachments, and complex form relationships are not yet guaranteed.</span></div>
        {entries.length ? <div className="merge-list">{entries.map((entry, index) => <article className="merge-item" key={entry.id}><span className="merge-item__index">{index + 1}</span><div><strong>{entry.file.name}</strong><span>{entry.pageCount} pages · {formatBytes(entry.byteLength)}</span></div><div className="merge-item__actions"><button disabled={index === 0 || busy} onClick={() => move(index, -1)} type="button">↑</button><button disabled={index === entries.length - 1 || busy} onClick={() => move(index, 1)} type="button">↓</button><button disabled={busy} onClick={() => setEntries(entries.filter((item) => item.id !== entry.id))} type="button">Remove</button></div></article>)}</div> : null}
        {error ? <div className="error-banner"><strong>Merge failed</strong><span>{error}</span></div> : null}
        {warnings.length ? <div className="warning-banner"><strong>Output warning</strong><span>{warnings.join(" ")}</span></div> : null}
        <div className="tool-footer"><span>{status ?? `${entries.length} files · ${entries.reduce((sum, entry) => sum + entry.pageCount, 0)} total pages`}</span><div><button className="button button--ghost" disabled={!entries.length || busy} onClick={() => setEntries([])} type="button">Clear</button><button className="button button--secondary" disabled={!entries.length || busy} onClick={() => void run(false)} type="button">Download merged PDF</button><button className="button" disabled={!entries.length || busy} onClick={() => void run(true)} type="button">Save as project</button>{busy && abortRef.current ? <button className="button button--danger-ghost" onClick={() => abortRef.current?.abort()} type="button">Cancel</button> : null}</div></div>
      </section>
    </div>
  );
}

function formatBytes(value: number): string { return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
