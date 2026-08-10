import { useEffect, useRef, useState } from "react";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { imposeVectorPages, inspectPreservationGraph, optimizePreservedPdf } from "../preservation/preservationClient";
import type { ImpositionSettings, PreservationGraph, PreservationResult } from "../types/preservation";
import type { ProjectManifest } from "../types/project";

interface Props {
  projectId: string;
  onTitleChange?: (title: string, subtitle?: string) => void;
}

const PT_PER_MM = 72 / 25.4;
const mmToPt = (value: number) => value * PT_PER_MM;
const ptToMm = (value: number) => value / PT_PER_MM;
const defaultImpose: ImpositionSettings = { layout: "2-up", pageSize: "a4", margin: 18, gutter: 12, borders: true };

export function PreservationPage({ projectId, onTitleChange }: Props) {
  const abortRef = useRef<AbortController | null>(null);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [graph, setGraph] = useState<PreservationGraph | null>(null);
  const [result, setResult] = useState<PreservationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(defaultImpose);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const manifest = await getProject(projectId);
        if (!manifest) throw new Error("Project not found.");
        const source = await loadProjectBytes(manifest);
        const next = await inspectPreservationGraph(source);
        if (disposed) return;
        setProject(manifest);
        setBytes(source);
        setGraph(next);
        onTitleChange?.(manifest.name, "Advanced structure checks and vector print layout");
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
    return () => {
      disposed = true;
      abortRef.current?.abort();
    };
  }, [projectId, onTitleChange]);

  async function run(kind: "optimize" | "impose") {
    if (!bytes || !project) return;
    const source = bytes;
    const activeProject = project;
    setBusy(true);
    setError(null);
    setResult(null);
    abortRef.current = new AbortController();
    try {
      const next = await runProjectOperation(
        activeProject.id,
        {
          label: kind === "optimize" ? "Creating structure-safe PDF" : "Creating vector print layout",
          signal: abortRef.current.signal,
          cancellable: true
        },
        async ({ signal, update }) => {
          update({ detail: kind === "optimize" ? "Cleaning the PDF while checking important structures…" : "Placing source pages onto new print sheets…", progress: 0.12 });
          const processed = kind === "optimize"
            ? await optimizePreservedPdf(source, { subsetFonts: true, removeMetadata: false }, undefined, signal)
            : await imposeVectorPages(source, settings, undefined, signal);
          update({ stage: "validating", detail: "Checking the output for unexpected structural loss…", progress: 0.9 });
          return processed;
        }
      );
      setResult(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveProject() {
    if (!result || !project) return;
    const activeResult = result;
    const activeProject = project;
    try {
      await runProjectOperation(
        activeProject.id,
        {
          label: "Saving structure-safe revision",
          cancellable: false,
          reserveBytes: activeResult.bytes.byteLength,
          storagePurpose: "save the structure-safe revision"
        },
        async ({ update }) => {
          update({ stage: "committing", detail: "Committing validated revision…", progress: 0.9 });
          await createDerivedProjectFromBytes(activeProject.id, activeResult.bytes, `${activeProject.name}-preserved.pdf`, activeResult.report.operation);
          update({ progress: 1 });
        }
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <div className="preservation-page">
      <header className="professional-panel"><div><p className="eyebrow">PDF structure details</p><h2>See exactly what a structural operation keeps or rebuilds</h2><p>This advanced view compares document structure before and after an operation and reports unexpected losses.</p></div></header>
      {error ? <div className="error-banner"><strong>Document-structure action failed</strong><span>{error}</span></div> : null}
      <section className="professional-panel">
        <header><div><p className="eyebrow">Document structure summary</p><h2>{graph ? `${graph.pageCount} pages · ${graph.counts.text} text lines · ${graph.counts.images} images` : "Inspecting…"}</h2></div>{graph ? <button className="button button--secondary" onClick={() => downloadBlob(new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" }), `${project?.name ?? "document"}-graph.json`)} type="button">Export technical report</button> : null}</header>
        {graph ? <div className="archival-summary">{Object.entries(graph.counts).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{key}</span></div>)}</div> : null}
      </section>
      <section className="professional-panel">
        <header><div><p className="eyebrow">Structure-safe optimization</p><h2>Clean the PDF without turning pages into images</h2></div><button className="button" disabled={busy || !bytes} onClick={() => void run("optimize")} type="button">Create structure-safe copy</button></header>
        <p className="scope-note">The app checks important document structures before the output is accepted. If an unexpected structural loss is detected, the output is blocked.</p>
      </section>
      <section className="professional-panel">
        <header><div><p className="eyebrow">Vector print layout</p><h2>Place multiple original pages on each print sheet</h2></div><button className="button" disabled={busy || !bytes} onClick={() => void run("impose")} type="button">Create vector print-layout copy</button></header>
        <div className="form-grid">
          <label>Layout<select value={settings.layout} onChange={(event) => setSettings((value) => ({ ...value, layout: event.target.value as ImpositionSettings["layout"] }))}><option value="2-up">2-up</option><option value="4-up">4-up</option></select></label>
          <label>Sheet<select value={settings.pageSize} onChange={(event) => setSettings((value) => ({ ...value, pageSize: event.target.value as ImpositionSettings["pageSize"] }))}><option value="a4">A4</option><option value="letter">Letter</option></select></label>
          <label>Margin (mm)<input min="0" step="0.5" type="number" value={Number(ptToMm(settings.margin).toFixed(1))} onChange={(event) => setSettings((value) => ({ ...value, margin: mmToPt(Math.max(0, Number(event.target.value) || 0)) }))} /></label>
          <label>Gap between pages (mm)<input min="0" step="0.5" type="number" value={Number(ptToMm(settings.gutter).toFixed(1))} onChange={(event) => setSettings((value) => ({ ...value, gutter: mmToPt(Math.max(0, Number(event.target.value) || 0)) }))} /></label>
        </div>
        <p className="scope-note">Page graphics stay sharp and vector-based. Interactive items such as links, forms, annotations, signatures, bookmarks, and tagged reading order cannot be moved reliably onto the new sheets; the app reports these limitations before you use the output.</p>
      </section>
      {result ? (
        <section className="professional-panel result-card">
          <header><div><p className="eyebrow">Validated output</p><h2>{result.report.passed ? "Structure check passed" : "Output blocked"}</h2></div><div className="button-row"><button className="button" onClick={() => downloadBlob(new Blob([toOwnedArrayBuffer(result.bytes)], { type: "application/pdf" }), `${project?.name ?? "document"}-${result.report.operation}.pdf`)} type="button">Download PDF</button><button className="button button--secondary" onClick={() => void saveProject()} type="button">Save as project</button></div></header>
          <p>{result.report.warnings.join(" ") || "No unexpected structural loss detected."}</p>
        </section>
      ) : null}
    </div>
  );
}
