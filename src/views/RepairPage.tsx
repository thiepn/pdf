import { useEffect, useRef, useState } from "react";
import { routeHref } from "../core/appRouter";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { inspectPdfBytes } from "../engines/pdfjs";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { repairPdf } from "../processing/processingClient";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import type { ProjectManifest } from "../types/project";

interface Props {
  projectId: string;
  onTitleChange?: (title: string, subtitle?: string) => void;
}

export function RepairPage({ projectId, onTitleChange }: Props) {
  const abortRef = useRef<AbortController | null>(null);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [status, setStatus] = useState("Opening…");
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<Uint8Array | null>(null);
  const [report, setReport] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    void getProject(projectId)
      .then((manifest) => {
        if (!manifest) throw new Error("Project not found.");
        setProject(manifest);
        setStatus("Ready");
        onTitleChange?.(`Repair · ${manifest.name}`, "Create a clean repaired copy without overwriting the source.");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    return () => abortRef.current?.abort();
  }, [projectId, onTitleChange]);

  async function run() {
    if (!project) return;
    const activeProject = project;
    setProcessing(true);
    setError(null);
    setStatus("Repairing and rewriting…");
    abortRef.current = new AbortController();
    try {
      await runProjectOperation(
        activeProject.id,
        { label: "Repairing PDF", signal: abortRef.current.signal, cancellable: true },
        async ({ signal, update }) => {
          update({ detail: "Loading source document…", progress: 0.08 });
          const source = await loadProjectBytes(activeProject);
          update({ detail: "Rewriting document structure…", progress: 0.2 });
          const result = await repairPdf(source, password || undefined, signal);
          update({ stage: "validating", detail: "Validating repaired output…", progress: 0.86 });
          const summary = await inspectPdfBytes(result.bytes, password || undefined);
          if (summary.pageCount !== activeProject.summary.pageCount) throw new Error("Repair validation failed: page count changed.");
          setOutput(result.bytes);
          setReport(result.report);
          setStatus("Repaired copy validated");
          update({ progress: 1 });
        }
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setStatus(reason instanceof DOMException && reason.name === "AbortError" ? "Cancelled" : "Failed");
    } finally {
      setProcessing(false);
    }
  }

  async function save(asProject: boolean) {
    if (!output || !project) return;
    const activeOutput = output;
    const activeProject = project;
    if (!asProject) {
      downloadBlob(new Blob([toOwnedArrayBuffer(activeOutput)], { type: "application/pdf" }), `${activeProject.name}-repaired.pdf`);
      return;
    }
    try {
      const created = await runProjectOperation(
        activeProject.id,
        {
          label: "Saving repaired revision",
          cancellable: false,
          reserveBytes: activeOutput.byteLength,
          storagePurpose: "save the repaired revision"
        },
        async ({ update }) => {
          update({ stage: "committing", detail: "Committing repaired revision…", progress: 0.9 });
          const next = await createDerivedProjectFromBytes(
            activeProject.id,
            activeOutput,
            `${activeProject.name}-repaired.pdf`,
            "repair",
            "application/pdf",
            password || undefined
          );
          update({ progress: 1 });
          return next;
        }
      );
      window.location.hash = routeHref({ name: "workspace", projectId: created.id, mode: "viewer" }).slice(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <div className="repair-page">
      <section className="repair-card">
        <p className="eyebrow">Repair PDF</p>
        <h2>Rewrite a clean copy</h2>
        <p>MuPDF opens the document, repairs parsable structural damage, collapses revisions, compresses streams, and writes a separate output. The source is never overwritten.</p>
        {error ? <div className="error-banner"><strong>Repair issue</strong><span>{error}</span></div> : null}
        <label>PDF password, when required<input autoComplete="off" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label>
        <button className="button button--wide" disabled={!project || processing} onClick={() => void run()} type="button">{processing ? "Repairing…" : "Create repaired copy"}</button>
        {processing ? <button className="button button--secondary button--wide" onClick={() => abortRef.current?.abort()} type="button">Cancel</button> : null}
      </section>
      <main className="repair-result">
        <div className="processing-header"><div><strong>{status}</strong><span>{project?.sourceFilename}</span></div></div>
        {report ? (
          <section className="inspection-grid"><article><h3>Repair result</h3><dl>
            <div><dt>Source repaired on open</dt><dd>{report.repaired ? "Yes" : "No structural repair reported"}</dd></div>
            <div><dt>Previous revisions</dt><dd>{report.versionsBefore}</dd></div>
            <div><dt>Input</dt><dd>{(report.inputBytes / 1_000_000).toFixed(2)} MB</dd></div>
            <div><dt>Output</dt><dd>{(report.outputBytes / 1_000_000).toFixed(2)} MB</dd></div>
          </dl></article></section>
        ) : <div className="empty-state"><strong>No repaired output yet</strong><p>Run the repair process, then review the validation result.</p></div>}
        {output ? (
          <footer className="output-bar">
            <div><strong>Output validated</strong><span>{(output.byteLength / 1_000_000).toFixed(2)} MB</span></div>
            <button className="button button--secondary" onClick={() => void save(false)} type="button">Download</button>
            <button className="button" onClick={() => void save(true)} type="button">Save as project</button>
          </footer>
        ) : null}
      </main>
    </div>
  );
}
