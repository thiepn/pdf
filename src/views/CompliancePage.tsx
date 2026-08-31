import { useEffect, useMemo, useState } from "react";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { applyCompliance, inspectCompliance } from "../compliance/complianceClient";
import { defaultComplianceOptions, readComplianceState, writeComplianceState } from "../compliance/complianceRepository";
import { createDetachedSignatureEvidence, verifyDetachedSignatureEvidence } from "../compliance/signatureSession";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import type {
  AccessibilityRepair,
  ComplianceExportReport,
  ComplianceFieldDraft,
  ComplianceInspection,
  ComplianceOptions,
  DetachedSignatureEvidence,
  PdfAProfile,
  PreflightFinding,
  PreflightProfile,
  StructureElementInfo
} from "../types/compliance";
import type { ProjectManifest } from "../types/project";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type Tab = "forms" | "signatures" | "archive" | "accessibility" | "preflight";

const tabLabels: Record<Tab, string> = {
  preflight: "Standards check",
  archive: "Archive / PDF-A",
  accessibility: "Accessibility",
  signatures: "Digital signatures",
  forms: "Forms"
};
const profileLabels: Record<PreflightProfile, string> = {
  archival: "Archive readiness", accessibility: "Accessibility", print: "Print preparation", security: "Security", signatures: "Digital signatures"
};

const fieldDefault: Omit<ComplianceFieldDraft, "id"> = {
  pageNumber: 1, type: "text", name: "field_1", tooltip: "", bounds: { x: 72, y: 72, w: 180, h: 24 }, defaultValue: "", required: false, readOnly: false, options: [], fontSize: 10
};

export function CompliancePage({ projectId, onTitleChange }: Props) {
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [source, setSource] = useState<Uint8Array | null>(null);
  const [inspection, setInspection] = useState<ComplianceInspection | null>(null);
  const [tab, setTab] = useState<Tab>("accessibility");
  const [fields, setFields] = useState<ComplianceFieldDraft[]>([]);
  const [draft, setDraft] = useState<Omit<ComplianceFieldDraft, "id">>(fieldDefault);
  const [options, setOptions] = useState<ComplianceOptions>({ ...defaultComplianceOptions });
  const [result, setResult] = useState<{ bytes: Uint8Array; report: ComplianceExportReport } | null>(null);
  const [evidence, setEvidence] = useState<DetachedSignatureEvidence | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        setLoaded(false); setError(null); setPassword(""); setPasswordRequired(false);
        const manifest = await getProject(projectId); if (!manifest) throw new Error("Project not found.");
        const [bytes, state] = await Promise.all([loadProjectBytes(manifest), readComplianceState(projectId)]);
        if (disposed) return;
        setProject(manifest); setSource(bytes); setFields(state.draftFields);
        setOptions({ ...state.options, fields: state.draftFields, setTitle: state.options.setTitle || manifest.name });
        setLoaded(true);
        try {
          const report = await inspectCompliance(bytes);
          if (disposed) return;
          acceptInspection(report, manifest);
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          if (/password|encrypted|authenticate/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password. It is used only in this tab and is not saved."); }
          else throw reason;
        }
      } catch (reason) { if (!disposed) setError(reason instanceof Error ? reason.message : String(reason)); }
    })();
    return () => { disposed = true; };
  }, [projectId, onTitleChange]);

  function acceptInspection(report: ComplianceInspection, manifest: ProjectManifest): void {
    const topLevelIds = report.structureElements.filter(item => item.depth === 0).map(item => item.id);
    setInspection(report); setPasswordRequired(false); setError(null);
    setOptions(value => ({ ...value, setTitle: value.setTitle || report.metadata.Title || manifest.name, setLanguage: value.setLanguage || report.accessibility.language || "en", topLevelReadingOrder: value.topLevelReadingOrder.length ? value.topLevelReadingOrder : topLevelIds }));
    setDraft(value => ({ ...value, pageNumber: Math.min(value.pageNumber, report.pageCount), name: `field_${report.fields.length + 1}` }));
    onTitleChange?.(manifest.name, "Archive readiness, accessibility, digital signatures, standards checks, and forms");
  }

  async function unlockDocument(): Promise<void> {
    if (!source || !project || !password) return;
    setBusy(true); setError(null);
    try { acceptInspection(await inspectCompliance(source, password), project); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!loaded) return;
    void writeComplianceState({ projectId, schemaVersion: 2, draftFields: fields, options: { ...options, fields }, updatedAt: Date.now() });
  }, [fields, loaded, options, projectId]);

  const grouped = useMemo(() => groupFindings(inspection?.findings ?? []), [inspection]);
  const orderedTopLevel = useMemo(() => {
    const top = inspection?.structureElements.filter(item => item.depth === 0) ?? [], map = new Map(top.map(item => [item.id, item]));
    const ordered = options.topLevelReadingOrder.map(id => map.get(id)).filter(Boolean) as StructureElementInfo[];
    for (const item of top) if (!ordered.some(value => value.id === item.id)) ordered.push(item);
    return ordered;
  }, [inspection, options.topLevelReadingOrder]);

  function addField(): void {
    const item = { ...draft, id: crypto.randomUUID() };
    setFields(value => [...value, item]); setDraft(value => ({ ...value, name: `field_${fields.length + 2}` }));
  }
  async function exportPdf(): Promise<void> {
    if (!source || !project) return; setBusy(true); setError(null);
    try {
      await runProjectOperation(project.id, { label: "Preparing standards-compliant copy" }, async ({ signal, update }) => {
        update({ detail: "Applying archival and accessibility changes…", progress: 0.08 });
        const next = await applyCompliance(source, { ...options, fields }, password || undefined, signal);
        update({ stage: "validating", detail: "Checking the standards-ready PDF…", progress: 0.9 });
        setResult(next);
        update({ progress: 1 });
      });
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function signEvidence(): Promise<void> {
    const bytes = result?.bytes ?? source; if (!bytes || !project) return; setBusy(true); setError(null);
    try { const next = await createDetachedSignatureEvidence(bytes, result ? `${project.name}-compliance.pdf` : project.sourceFilename); if (!await verifyDetachedSignatureEvidence(bytes, next)) throw new Error("Detached signature self-verification failed."); setEvidence(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function saveProject(): Promise<void> {
    if (!result || !project) return;
    try {
      await runProjectOperation(project.id, { label: "Saving standards-ready PDF", cancellable: false, reserveBytes: project.byteLength }, async ({ update }) => {
        update({ stage: "committing", detail: "Checking local storage and saving as a new project…", progress: 0.4 });
        await createDerivedProjectFromBytes(project.id, result.bytes, `${project.name}-compliance.pdf`, "compliance-export", "application/pdf", options.prepareArchival ? undefined : (password || undefined));
        update({ progress: 1 });
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  function setRepair(elementId: string, patch: Partial<AccessibilityRepair>): void {
    setOptions(value => {
      const repairs = [...value.accessibilityRepairs], index = repairs.findIndex(item => item.elementId === elementId);
      const next = { ...(index >= 0 ? repairs[index] : { elementId }), ...patch };
      if (index >= 0) repairs[index] = next; else repairs.push(next);
      return { ...value, accessibilityRepairs: repairs };
    });
  }
  function repairValue(element: StructureElementInfo, key: "altText" | "language"): string {
    const repair = options.accessibilityRepairs.find(item => item.elementId === element.id); return String(repair?.[key] ?? element[key] ?? "");
  }
  function moveTopLevel(id: string, delta: -1 | 1): void {
    const ids = orderedTopLevel.map(item => item.id), index = ids.indexOf(id), target = index + delta; if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]]; setOptions(value => ({ ...value, topLevelReadingOrder: ids }));
  }

  return <div className="compliance-page">
    <header className="compliance-header"><div><p className="eyebrow">Accessibility & document standards</p><h2>{project?.name ?? "Opening…"}</h2><p>Start with accessibility and supported fixes. Archive, signature, print, security, and technical standards details remain available when you need them.</p></div><button className="button" disabled={busy || !source} onClick={() => void exportPdf()} type="button">Create standards-ready copy</button></header>
    {error ? <div className="error-banner"><strong>Could not create standards-ready copy</strong><span>{error}</span></div> : null}
    {passwordRequired ? <div className="password-panel phase19-password"><input autoComplete="off" onChange={event => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={busy || !password} onClick={() => void unlockDocument()} type="button">Unlock locally</button><span>The password is used only in this tab and is not saved.</span></div> : null}
    <nav className="professional-tabs">{(["preflight", "archive", "accessibility", "signatures", "forms"] as Tab[]).map(item => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">{tabLabels[item]}</button>)}</nav>

    {tab === "preflight" ? <section className="phase19-preflight">
      <div className="archival-summary">
        <Summary value={inspection?.pdfVersion ?? "—"} label="Format"/><Summary value={String(inspection?.fontEmbedded ?? 0) + "/" + String(inspection?.fontTotal ?? 0)} label="Embedded fonts"/><Summary value={inspection?.accessibility.structureQuality ?? "—"} label="Tag quality"/><Summary value={String(inspection?.outputIntents.length ?? 0)} label="Color profiles"/><Summary value={String(inspection?.signatures.length ?? 0)} label="Signatures"/><Summary value={String(inspection?.versionCount ?? 0)} label="Saved PDF versions"/>
      </div>
      <div className="preflight-columns">{(["archival", "accessibility", "print", "security", "signatures"] as PreflightProfile[]).map(profile => <FindingPanel findings={grouped[profile]} key={profile} title={profileLabels[profile]}/>)}</div>
      <article className="professional-panel"><p className="eyebrow">Print preparation details</p><h3>Page boxes and graphics</h3><div className="phase19-page-table"><div className="phase19-page-row phase19-page-row--head"><span>Page</span><span>Trim</span><span>Bleed</span><span>Transparency</span><span>Overprint</span><span>Annotations</span></div>{inspection?.pages.slice(0, 100).map(page => <div className="phase19-page-row" key={page.pageNumber}><span>{page.pageNumber}</span><span>{page.trimBox ? "Yes" : "Missing"}</span><span>{page.bleedBox ? "Yes" : "Missing"}</span><span>{page.transparency ? "Detected" : "No"}</span><span>{page.overprint ? "Detected" : "No"}</span><span>{page.annotationCount}</span></div>)}</div>{(inspection?.pages.length ?? 0) > 100 ? <p className="scope-note">Showing the first 100 pages. The findings above cover the full document.</p> : null}</article>
    </section> : null}

    {tab === "archive" ? <section className="compliance-grid">
      <article className="professional-panel"><p className="eyebrow">Archive-ready copy</p><h3>Archive-ready PDF (PDF/A)</h3><label>Target profile<select value={options.archivalLevel} onChange={event => { const archivalLevel = event.target.value as PdfAProfile; setOptions(value => ({ ...value, archivalLevel, prepareArchival: archivalLevel !== "none" })); }}><option value="none">No PDF/A preparation</option><option value="PDF/A-1b">PDF/A-1b candidate</option><option value="PDF/A-2b">PDF/A-2b candidate</option><option value="PDF/A-3b">PDF/A-3b candidate</option></select></label><label className="check-row"><input checked={options.removeActiveContent} onChange={event => setOptions(value => ({ ...value, removeActiveContent: event.target.checked }))} type="checkbox"/>Remove unsafe automatic actions</label><label className="check-row"><input checked={options.addOutputIntent} onChange={event => setOptions(value => ({ ...value, addOutputIntent: event.target.checked }))} type="checkbox"/>Embed standard sRGB print color profile</label><label className="check-row"><input checked={options.normalizeXmp} onChange={event => setOptions(value => ({ ...value, normalizeXmp: event.target.checked }))} type="checkbox"/>Write PDF/A identification metadata</label><div className="warning-banner"><strong>Independent validation remains mandatory</strong><span>This workflow performs real structural preparation—unencrypted save, standard sRGB print color profile and PDF/A identification metadata, active-content cleanup, and font subsetting—but the app does not call itself a conformance validator. A candidate can still fail profile-specific ISO requirements.</span></div></article>
      <article className="professional-panel"><p className="eyebrow">Detected archival state</p><h3>{inspection?.pdfaClaim.claimed ? inspection.pdfaClaim.profile : "No PDF/A claim"}</h3><dl><dt>Encrypted</dt><dd>{inspection?.encrypted ? "Yes" : "No"}</dd><dt>Output intents</dt><dd>{inspection?.outputIntents.length ?? 0}</dd><dt>Attachments</dt><dd>{inspection?.attachmentCount ?? 0}</dd><dt>Layers</dt><dd>{inspection?.layerCount ?? 0}</dd><dt>Unsafe actions</dt><dd>{inspection?.hasUnsafeActions ? "Detected" : "None detected"}</dd></dl>{inspection?.outputIntents.map((intent, index) => <div className="phase19-intent" key={`${intent.outputConditionIdentifier}-${index}`}><strong>{intent.outputConditionIdentifier || intent.info || `Output intent ${index + 1}`}</strong><span>{intent.subtype || "Unknown subtype"} · ICC {intent.embeddedProfile ? "embedded" : "missing"} · {intent.components ?? "?"} component(s)</span></div>)}</article>
    </section> : null}

    {tab === "accessibility" ? <section className="compliance-grid">
      <article className="professional-panel"><p className="eyebrow">Document accessibility</p><h3>{inspection?.accessibility.structureQuality ?? "Unknown"} structure</h3><label>Document language<input value={options.setLanguage} onChange={event => setOptions(value => ({ ...value, setLanguage: event.target.value }))}/></label><label>Document title<input value={options.setTitle} onChange={event => setOptions(value => ({ ...value, setTitle: event.target.value }))}/></label><label className="check-row"><input checked={options.createBaselineTags} onChange={event => setOptions(value => ({ ...value, createBaselineTags: event.target.checked }))} type="checkbox"/>Add a basic accessibility structure when none exists</label><label className="check-row"><input checked={options.repairMissingFormTooltips} onChange={event => setOptions(value => ({ ...value, repairMissingFormTooltips: event.target.checked }))} type="checkbox"/>Use field names as missing form descriptions</label><dl><dt>Tagged accessibility elements</dt><dd>{inspection?.accessibility.structureElementCount ?? 0}</dd><dt>Reading order</dt><dd>{inspection?.accessibility.readingOrderStatus ?? "missing"}</dd><dt>Headings</dt><dd>{inspection?.accessibility.headingCount ?? 0}</dd><dt>Tables</dt><dd>{inspection?.accessibility.tableCount ?? 0}</dd><dt>Images missing descriptions</dt><dd>{inspection?.accessibility.figuresWithoutAltText ?? 0}</dd></dl><p className="scope-note">A basic structure alone does not make a PDF accessible. Existing tags can be repaired, but this tool does not pretend to fully tag an untagged document automatically.</p></article>
      <article className="professional-panel"><p className="eyebrow">Top-level reading order</p><h3>Structure order</h3>{orderedTopLevel.length ? <div className="phase19-structure-list">{orderedTopLevel.map((element, index) => <div className="phase19-structure-card" key={element.id}><div><strong>{element.tag}{element.title ? ` · ${element.title}` : ""}</strong><span>{element.pageNumber ? `Page ${element.pageNumber}` : "No direct page reference"}</span></div><div className="button-row"><button disabled={index === 0} onClick={() => moveTopLevel(element.id, -1)} type="button">↑</button><button disabled={index === orderedTopLevel.length - 1} onClick={() => moveTopLevel(element.id, 1)} type="button">↓</button></div></div>)}</div> : <p className="muted">No top-level semantic structure elements are available to reorder.</p>}</article>
      <article className="professional-panel phase19-wide"><p className="eyebrow">Structure tree repair</p><h3>Alternative text and language</h3>{inspection?.structureElements.length ? <div className="phase19-structure-editor">{inspection.structureElements.map(element => <div className="phase19-structure-edit" key={element.id} style={{ paddingLeft: `${Math.min(element.depth, 6) * 16}px` }}><div><strong>{element.tag}</strong><span>{element.title || element.id} · {element.pageNumber ? `page ${element.pageNumber}` : "document structure"}</span></div>{element.tag === "Figure" ? <label>Alt text<input value={repairValue(element, "altText")} onChange={event => setRepair(element.id, { altText: event.target.value })}/></label> : null}<label>Language<input placeholder="inherit" value={repairValue(element, "language")} onChange={event => setRepair(element.id, { language: event.target.value })}/></label></div>)}</div> : <p className="muted">No semantic structure tree is available for repair.</p>}</article>
    </section> : null}

    {tab === "signatures" ? <section className="compliance-grid">
      <article className="professional-panel phase19-wide"><p className="eyebrow">Digital signatures</p><h3>{inspection?.signatures.length ?? 0} signature field(s)</h3>{inspection?.signatures.length ? <div className="phase19-signatures">{inspection.signatures.map((item, index) => <article className={`phase19-signature phase19-signature--${item.status}`} key={`${item.pageNumber}-${item.name}-${index}`}><div><strong>{item.name}</strong><span>Page {item.pageNumber} · {item.signed ? "signed" : "unsigned"}</span></div><dl><dt>Signed-file coverage</dt><dd>{item.reasonSummary}</dd><dt>SubFilter</dt><dd>{item.subFilter || "Not reported"}</dd><dt>Filter</dt><dd>{item.filter || "Not reported"}</dd><dt>Signing time</dt><dd>{item.signingTime || "Not reported"}</dd><dt>Reason</dt><dd>{item.reason || "Not reported"}</dd><dt>Location</dt><dd>{item.location || "Not reported"}</dd>{item.byteRange ? <><dt>Technical byte ranges</dt><dd><code>{item.byteRange.join(" ")}</code></dd></> : null}</dl></article>)}</div> : <p className="muted">No signature field exists. Add one from Forms if needed.</p>}<div className="warning-banner"><strong>What this check verifies</strong><span>The app checks whether each signature covers the current file or only an earlier revision. Certificate trust, revocation, timestamp authority, and full cryptographic validation still require a qualified verifier.</span></div></article>
      <article className="professional-panel"><p className="eyebrow">Local cryptographic evidence</p><h3>ECDSA detached proof</h3><p>Create locally verified evidence for the exact current PDF bytes. This remains deliberately separate from embedded PDF signatures.</p><button className="button" disabled={busy || !source} onClick={() => void signEvidence()} type="button">Create and verify evidence</button>{evidence ? <div className="signature-evidence"><strong>{evidence.verified ? "Verified" : "Failed"}</strong><code>{evidence.documentSha256}</code><button className="button button--secondary" onClick={() => downloadBlob(new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }), `${evidence.filename}.signature.json`)} type="button">Download evidence</button></div> : null}</article>
      <article className="professional-panel"><p className="eyebrow">Certificate signing integration</p><h3>Advanced integration details</h3><p>This app can inspect embedded signatures, but creating certificate-backed signatures requires an external signing integration. No certificate is generated or trusted automatically.</p><ul className="scope-list"><li>PAdES-B-B and B-T are the supported technical signing targets.</li><li>An external signer must return a complete signed PDF.</li><li>The returned PDF is checked again before it can be saved as a project revision.</li></ul></article>
    </section> : null}

    {tab === "forms" ? <section className="compliance-grid"><article className="professional-panel"><p className="eyebrow">Interactive PDF form fields</p><h3>Add a field</h3><div className="form-grid"><label>Type<select value={draft.type} onChange={event => setDraft(value => ({ ...value, type: event.target.value as ComplianceFieldDraft["type"] }))}>{["text", "multiline", "password", "checkbox", "radio", "combo", "list", "button", "signature"].map(type => <option key={type}>{type}</option>)}</select></label><label>Name<input value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))}/></label><label>Field description (tooltip)<input value={draft.tooltip} onChange={event => setDraft(value => ({ ...value, tooltip: event.target.value }))}/></label><label>Page<input min="1" max={inspection?.pageCount ?? 1} type="number" value={draft.pageNumber} onChange={event => setDraft(value => ({ ...value, pageNumber: Number(event.target.value) }))}/></label><label>X position<input type="number" value={draft.bounds.x} onChange={event => setDraft(value => ({ ...value, bounds: { ...value.bounds, x: Number(event.target.value) } }))}/></label><label>Y position<input type="number" value={draft.bounds.y} onChange={event => setDraft(value => ({ ...value, bounds: { ...value.bounds, y: Number(event.target.value) } }))}/></label><label>Width<input type="number" value={draft.bounds.w} onChange={event => setDraft(value => ({ ...value, bounds: { ...value.bounds, w: Number(event.target.value) } }))}/></label><label>Height<input type="number" value={draft.bounds.h} onChange={event => setDraft(value => ({ ...value, bounds: { ...value.bounds, h: Number(event.target.value) } }))}/></label></div><label className="check-row"><input checked={draft.required} onChange={event => setDraft(value => ({ ...value, required: event.target.checked }))} type="checkbox"/>Required</label><label className="check-row"><input checked={draft.readOnly} onChange={event => setDraft(value => ({ ...value, readOnly: event.target.checked }))} type="checkbox"/>Read only</label><button className="button" disabled={!draft.name.trim()} onClick={addField} type="button">Queue field</button></article><article className="professional-panel"><p className="eyebrow">Form structure</p><h3>{fields.length} queued · {inspection?.fields.length ?? 0} existing</h3>{fields.length ? <ul className="compliance-field-list">{fields.map(field => <li key={field.id}><div><strong>{field.name}</strong><span>{field.type} · page {field.pageNumber}</span></div><button onClick={() => setFields(value => value.filter(item => item.id !== field.id))} type="button">Remove</button></li>)}</ul> : <p className="muted">No new fields queued.</p>}<label className="check-row"><input checked={options.flattenForms} onChange={event => setOptions(value => ({ ...value, flattenForms: event.target.checked }))} type="checkbox"/>Flatten all form widgets in output</label></article></section> : null}

    {result ? <section className="professional-panel result-card"><header><div><p className="eyebrow">Validated local output</p><h2>{result.report.archivalProfile !== "none" ? `${result.report.archivalProfile} candidate` : "Compliance copy"}</h2></div><div className="button-row"><button className="button" onClick={() => downloadBlob(new Blob([toOwnedArrayBuffer(result.bytes)], { type: "application/pdf" }), `${project?.name ?? "document"}-compliance.pdf`)} type="button">Download PDF</button><button className="button button--secondary" onClick={() => void saveProject()} type="button">Save as project</button></div></header><div className="archival-summary"><Summary value={result.report.outputIntentEmbedded ? "Yes" : "No"} label="ICC intent"/><Summary value={result.report.xmpNormalized ? "Yes" : "No"} label="PDF/A XMP"/><Summary value={result.report.encryptionRemoved ? "Yes" : "No"} label="Decrypted"/><Summary value={String(result.report.accessibilityRepairsApplied)} label="Tag repairs"/><Summary value={String(result.report.formTooltipsRepaired)} label="Tooltips repaired"/></div>{result.report.warnings.map(warning => <p className="scope-note" key={warning}>{warning}</p>)}</section> : null}
  </div>;
}

function Summary({ value, label }: { value: string; label: string }) { return <div><strong>{value}</strong><span>{label}</span></div>; }
function groupFindings(findings: PreflightFinding[]): Record<PreflightProfile, PreflightFinding[]> { return { archival: findings.filter(f => f.profile === "archival"), accessibility: findings.filter(f => f.profile === "accessibility"), print: findings.filter(f => f.profile === "print"), security: findings.filter(f => f.profile === "security"), signatures: findings.filter(f => f.profile === "signatures") }; }
function FindingPanel({ title, findings }: { title: string; findings: PreflightFinding[] }) { return <article className="professional-panel"><p className="eyebrow">Standards check</p><h3>{title}</h3><div className="finding-list">{findings.map(finding => <article className={`finding finding--${finding.severity}`} key={finding.id}><span>{finding.severity}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p></div></article>)}</div></article>; }
