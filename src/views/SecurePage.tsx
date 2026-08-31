import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { routeHref } from "../core/appRouter";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { useModalFocus } from "../accessibility/modalFocus";
import { openPdfWithPdfJs } from "../engines/pdfjs";
import { listEditorAssets, readEditorState } from "../editor/editorRepository";
import { exportEditorPdf } from "../editor/editorExportClient";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { applySecurity, inspectSecurity } from "../security/securityClient";
import { createSecurityState } from "../security/securityModel";
import { readSecurityState, writeSecurityState } from "../security/securityRepository";
import { SecurityPreviewPage } from "../security/SecurityPreviewPage";
import { collectRedactionTokens, validateSecurityOutput, type SecurityValidationReport } from "../security/securityValidation";
import type { EditorAssetRecord, EditorDocumentState, EditorExportAsset, EditorObject, ImageEditorObject } from "../types/editor";
import type { ProjectManifest } from "../types/project";
import type { FormFieldUpdate, SecurityFormField, SecurityInspectionReport, SecurityProjectState } from "../types/security";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type SecurityTab = "overview" | "forms" | "redaction" | "signatures" | "sanitize" | "protect";

const tabs: Array<{ id: SecurityTab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "◇" },
  { id: "forms", label: "Forms", icon: "▤" },
  { id: "redaction", label: "Redaction", icon: "■" },
  { id: "signatures", label: "Signatures", icon: "✒" },
  { id: "sanitize", label: "Clean up", icon: "⌁" },
  { id: "protect", label: "Protect", icon: "▣" }
];

export function SecurePage({ projectId, onTitleChange }: Props) {
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const sourceBytesRef = useRef<Uint8Array | null>(null);
  const passwordRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [inspection, setInspection] = useState<SecurityInspectionReport | null>(null);
  const [editorState, setEditorState] = useState<EditorDocumentState | null>(null);
  const [assets, setAssets] = useState<EditorAssetRecord[]>([]);
  const [security, setSecurity] = useState<SecurityProjectState>(() => createSecurityState(projectId));
  const [tab, setTab] = useState<SecurityTab>("overview");
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>();
  const [status, setStatus] = useState("Opening protection tools…");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState("");
  const [validation, setValidation] = useState<SecurityValidationReport | null>(null);

  const redactionObjects = useMemo(() => (editorState?.objects ?? []).filter((object): object is Extract<EditorObject, { type: "redaction" }> => object.type === "redaction" && !object.hidden), [editorState]);
  const visualSignatures = useMemo(() => (editorState?.objects ?? []).filter((object): object is Extract<EditorObject, { type: "signature" }> => object.type === "signature" && !object.hidden), [editorState]);
  const initialFormValues = useMemo(() => Object.fromEntries((inspection?.formFields ?? []).map((field) => [field.id, field.value])), [inspection]);
  const changedFieldCount = useMemo(() => (inspection?.formFields ?? []).filter((field) => (security.formValues[field.id] ?? field.value) !== field.value).length, [inspection, security.formValues]);
  const totalRedactionMarkCount = redactionObjects.length + (inspection?.redactionMarkCount ?? 0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getProject(projectId);
        if (!manifest) throw new Error("Project not found.");
        const [bytes, storedEditor, storedAssets, storedSecurity] = await Promise.all([
          loadProjectBytes(manifest),
          readEditorState(projectId),
          listEditorAssets(projectId),
          readSecurityState(projectId)
        ]);
        if (cancelled) return;
        setProject(manifest);
        setEditorState(storedEditor);
        setAssets(storedAssets);
        setSecurity({ ...storedSecurity, currentPage: Math.max(1, Math.min(manifest.summary.pageCount, storedSecurity.currentPage)) });
        sourceBytesRef.current = bytes;
        await openDocument(manifest, bytes);
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      passwordRef.current = undefined;
      sourceBytesRef.current = null;
      const current = documentRef.current;
      documentRef.current = null;
      if (current) void current.loadingTask.destroy();
    };
  }, [projectId]);

  useEffect(() => {
    if (!project || !document || !inspection) return;
    const passwordFieldIds = new Set(inspection.formFields.filter((field) => field.password).map((field) => field.id));
    const persistentFormValues = Object.fromEntries(Object.entries(security.formValues).filter(([id]) => !passwordFieldIds.has(id)));
    const timer = window.setTimeout(() => void writeSecurityState({ ...security, formValues: persistentFormValues }).catch(() => undefined), 450);
    return () => clearTimeout(timer);
  }, [document, inspection, project, security]);

  async function openDocument(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string): Promise<void> {
    setStatus("Checking PDF protection…"); setError(null);
    try {
      const previous = documentRef.current;
      documentRef.current = null;
      if (previous) await previous.loadingTask.destroy();
      const [pdf, report] = await Promise.all([
        openPdfWithPdfJs(bytes, suppliedPassword),
        inspectSecurity(bytes, suppliedPassword)
      ]);
      documentRef.current = pdf;
      setDocument(pdf);
      setInspection(report);
      passwordRef.current = suppliedPassword;
      setPasswordRequired(false); setPassword(""); setStatus("Ready");
      setSecurity((state) => ({
        ...state,
        formValues: { ...Object.fromEntries(report.formFields.map((field) => [field.id, field.value])), ...state.formValues },
        currentPage: Math.max(1, Math.min(report.pageCount, state.currentPage))
      }));
      onTitleChange?.(`Secure · ${manifest.name}`, `${report.pageCount} pages · ${report.formFields.length} form fields · ${report.signatures.length} digital signature fields`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password. It is used only in this tab and is not saved."); }
      else throw reason;
    }
  }


  async function exportSecure(saveProject: boolean): Promise<void> {
    if (!project || !document || !inspection || !sourceBytesRef.current || !editorState) return;
    const sourceBytes = sourceBytesRef.current;
    if (security.redaction.enabled && totalRedactionMarkCount === 0) { setError("Redaction application is enabled, but no redaction regions exist. Place regions in the editor or open a PDF that already contains redaction marks."); setTab("redaction"); return; }
    if (!security.redaction.enabled && totalRedactionMarkCount > 0 && (security.sanitization.flattenAnnotations || security.sanitization.removeComments)) { setError("Applying comment removal or annotation flattening while unapplied redaction marks exist could leave only visual boxes. Apply redactions first or disable those sanitization options."); setTab("redaction"); return; }
    if (security.encryption.mode === "aes-256" && !security.encryption.ownerPassword) { setError("Enter an owner password before applying AES-256 protection."); setTab("protect"); return; }
    if (security.encryption.mode === "aes-256" && security.encryption.ownerPassword !== ownerPasswordConfirm) { setError("The owner-password confirmation does not match."); setTab("protect"); return; }

    setBusy(true); setError(null); setWarnings([]); setValidation(null); setStatus("Preparing protected PDF…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(project.id, { label: saveProject ? "Saving protected PDF" : "Exporting protected PDF", signal: controller.signal, reserveBytes: saveProject ? project.byteLength : undefined }, async ({ signal, update }) => {
      update({ detail: "Preparing protected PDF…", progress: 0.05 });
      const visibleObjects = editorState.objects.filter((object) => !object.hidden);
      const assetIds = new Set(visibleObjects.filter((object): object is ImageEditorObject => object.type === "image").map((object) => object.assetId));
      const exportAssets: EditorExportAsset[] = assets.filter((asset) => assetIds.has(asset.id)).map((asset) => ({ id: asset.id, mimeType: asset.mimeType, bytes: asset.bytes.slice(0) }));
      const redactionTokens = security.redaction.enabled ? await collectRedactionTokens(document, redactionObjects) : [];
      const redactionPages = redactionObjects.map((object) => object.pageNumber);
      const editorResult = visibleObjects.length
        ? await exportEditorPdf(sourceBytes, visibleObjects, exportAssets, signal, passwordRef.current)
        : { bytes: Uint8Array.from(sourceBytes), report: { warnings: [] as string[] } };
      setStatus("Applying forms, redactions, cleanup, and password settings…");
      update({ detail: "Applying forms, redactions, cleanup, and password settings…", progress: 0.45 });
      const formUpdates: FormFieldUpdate[] = inspection.formFields
        .filter((field) => !field.readOnly && (security.formValues[field.id] ?? field.value) !== field.value)
        .map((field) => ({ id: field.id, pageNumber: field.pageNumber, widgetIndex: field.widgetIndex, name: field.name, type: field.type, value: security.formValues[field.id] ?? "" }));
      const options = { formUpdates, redaction: security.redaction, sanitization: security.sanitization, encryption: security.encryption };
      const secured = await applySecurity(editorResult.bytes, options, passwordRef.current, signal);
      setStatus("Checking protected PDF…");
      update({ stage: "validating", detail: "Checking protected PDF before saving…", progress: 0.82 });
      const result = await validateSecurityOutput(secured.bytes, inspection.pageCount, options, passwordRef.current, redactionTokens, redactionPages);
      setValidation(result);
      const combinedWarnings = [...new Set([...(editorResult.report.warnings ?? []), ...secured.report.warnings, ...result.inspection.warnings])];
      setWarnings(combinedWarnings);
      if (!result.valid) throw new Error(`The protected PDF did not pass the final safety check: ${result.checks.filter((check) => !check.passed).map((check) => check.name).join(", ")}. No output was created.`);
      const filename = `${safeName(project.name)}_${security.redaction.enabled ? "redacted_" : ""}secured.pdf`;
      const outputPassword = security.encryption.mode === "aes-256" ? security.encryption.userPassword || security.encryption.ownerPassword : security.encryption.mode === "keep" ? passwordRef.current : undefined;
      if (saveProject) {
        update({ stage: "committing", detail: "Saving protected PDF as a new project…", progress: 0.94 });
        const created = await createDerivedProjectFromBytes(project.id, secured.bytes, filename, "secure-export", "application/pdf", outputPassword);
        window.location.hash = routeHref({ name: "viewer", projectId: created.id }).slice(1);
      } else {
        downloadBlob(new Blob([toOwnedArrayBuffer(secured.bytes)], { type: "application/pdf" }), filename);
        setStatus(`Protected PDF downloaded · ${formatBytes(secured.report.outputBytes)}`);
      }
      update({ progress: 1 });
      });
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Ready");
    } finally { setBusy(false); abortRef.current = null; }
  }

  async function retryPassword(): Promise<void> {
    if (!project || !sourceBytesRef.current || !password) return;
    try { await openDocument(project, sourceBytesRef.current, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  if (!project) return <div className="viewer-loading"><span className="spinner" /><strong>{error ?? status}</strong></div>;
  if (!document || !inspection || !editorState) return <div className="security-app"><div className="viewer-loading"><span className="spinner" /><strong>{status}</strong></div>{passwordRequired ? <PasswordDialog error={error} password={password} onChange={setPassword} onSubmit={() => void retryPassword()} projectId={projectId} /> : null}</div>;

  const selectedField = inspection.formFields.find((field) => field.id === selectedFieldId);
  const securityObjects = editorState.objects.filter((object) => object.type === "redaction" || object.type === "signature");

  return <div className="security-app">
    <header className="security-commandbar">
      <div className="editor-file-group"><a className="icon-button" href={routeHref({ name: "viewer", projectId })}>←</a><div><strong>{project.name}</strong><span>{status} · your original PDF is kept unchanged</span></div></div>
      <div className="security-page-controls"><button disabled={security.currentPage <= 1} onClick={() => setSecurity((state) => ({ ...state, currentPage: state.currentPage - 1 }))} type="button">‹</button><label><input max={inspection.pageCount} min="1" onChange={(event) => setSecurity((state) => ({ ...state, currentPage: Math.max(1, Math.min(inspection.pageCount, Number(event.target.value))) }))} type="number" value={security.currentPage} /><span>/ {inspection.pageCount}</span></label><button disabled={security.currentPage >= inspection.pageCount} onClick={() => setSecurity((state) => ({ ...state, currentPage: state.currentPage + 1 }))} type="button">›</button><button onClick={() => setSecurity((state) => ({ ...state, zoom: Math.max(.5, state.zoom - .25) }))} type="button">−</button><select onChange={(event) => setSecurity((state) => ({ ...state, zoom: Number(event.target.value) }))} value={security.zoom}><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select><button onClick={() => setSecurity((state) => ({ ...state, zoom: Math.min(2, state.zoom + .25) }))} type="button">+</button></div>
      <div className="editor-commandbar__actions"><button className="button button--ghost button--small" disabled={busy} onClick={() => void exportSecure(false)} type="button">Download protected PDF</button><button className="button button--small" disabled={busy} onClick={() => void exportSecure(true)} type="button">Save as project</button>{busy ? <button className="button button--danger-ghost button--small" onClick={() => abortRef.current?.abort()} type="button">Cancel</button> : null}</div>
    </header>

    <div className="security-notices">{error ? <div className="editor-banner error-banner"><strong>Protection action blocked</strong><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}{warnings.length ? <div className="editor-banner warning-banner"><strong>Warnings</strong><span>{warnings.join(" ")}</span><button onClick={() => setWarnings([])} type="button">Dismiss</button></div> : null}</div>

    <div className="security-layout">
      <nav className="security-tabs" aria-label="Secure workspace sections">{tabs.map((item) => <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button"><span>{item.icon}</span><strong>{item.label}</strong>{item.id === "forms" && changedFieldCount ? <small>{changedFieldCount}</small> : item.id === "redaction" && totalRedactionMarkCount ? <small>{totalRedactionMarkCount}</small> : item.id === "signatures" && (visualSignatures.length + inspection.signatures.length) ? <small>{visualSignatures.length + inspection.signatures.length}</small> : null}</button>)}</nav>
      <aside className="security-panel">{renderPanel(tab, { projectId, inspection, security, setSecurity, initialFormValues, selectedField, setSelectedFieldId, redactionObjects, visualSignatures, ownerPasswordConfirm, setOwnerPasswordConfirm })}</aside>
      <main className="security-stage"><SecurityPreviewPage document={document} fields={inspection.formFields} objects={securityObjects} onSelectField={(field) => { setSelectedFieldId(field.id); setTab("forms"); setSecurity((state) => ({ ...state, currentPage: field.pageNumber })); }} pageNumber={security.currentPage} selectedFieldId={selectedFieldId} zoom={security.zoom} /></main>
      <aside className="security-validation-panel"><ValidationPanel validation={validation} inspection={inspection} /></aside>
    </div>
  </div>;
}

interface PanelContext {
  projectId: string;
  inspection: SecurityInspectionReport;
  security: SecurityProjectState;
  setSecurity: Dispatch<SetStateAction<SecurityProjectState>>;
  initialFormValues: Record<string, string>;
  selectedField?: SecurityFormField;
  setSelectedFieldId: (id: string | undefined) => void;
  redactionObjects: Array<Extract<EditorObject, { type: "redaction" }>>;
  visualSignatures: Array<Extract<EditorObject, { type: "signature" }>>;
  ownerPasswordConfirm: string;
  setOwnerPasswordConfirm: (value: string) => void;
}

function renderPanel(tab: SecurityTab, context: PanelContext) {
  const { inspection, security, setSecurity } = context;
  if (tab === "overview") return <div className="security-panel-body"><PanelTitle title="Protection overview" subtitle="Current document state before you create a protected copy" /><div className="security-fact-grid"><Fact label="Encryption" value={inspection.encryptionDescription} /><Fact label="Authentication" value={inspection.authentication} /><Fact label="Saved PDF versions" value={String(inspection.versionCount)} /><Fact label="Forms" value={String(inspection.formFields.length)} /><Fact label="Signatures" value={String(inspection.signatures.length)} /><Fact label="Attachments" value={String(inspection.attachmentCount)} /><Fact label="JavaScript" value={inspection.hasJavaScript ? "Detected" : "None detected"} danger={inspection.hasJavaScript} /><Fact label="Automatic actions" value={inspection.hasOpenAction || inspection.hasAdditionalActions ? "Detected" : "None detected"} danger={inspection.hasOpenAction || inspection.hasAdditionalActions} /></div><section className="security-section"><h3>Permissions</h3><div className="permission-list">{Object.entries(inspection.permissions).map(([key, value]) => <span className={value ? "allowed" : "blocked"} key={key}>{value ? "✓" : "×"} {humanize(key)}</span>)}</div></section><section className="security-section"><h3>Metadata</h3>{Object.keys(inspection.metadata).length ? <dl className="security-metadata">{Object.entries(inspection.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl> : <p className="property-note">No standard metadata fields were detected.</p>}</section></div>;
  if (tab === "forms") return <FormsPanel {...context} />;
  if (tab === "redaction") return <div className="security-panel-body"><PanelTitle title="Permanent redaction" subtitle="Remove marked page content during secure export" /><div className="security-critical-note"><strong>A black rectangle is not enough.</strong><p>Only Apply redactions removes the underlying text, images, and shapes. PDF Studio then rewrites the output so removed content is not retained.</p></div><a className="button button--ghost button--block" href={routeHref({ name: "editor", projectId: context.projectId })}>Open editor to place redaction regions</a><section className="security-section"><label className="property-toggle"><input checked={security.redaction.enabled} onChange={(event) => setSecurity((state) => ({ ...state, redaction: { ...state.redaction, enabled: event.target.checked } }))} type="checkbox" />Apply {context.redactionObjects.length + context.inspection.redactionMarkCount} marked region{context.redactionObjects.length + context.inspection.redactionMarkCount === 1 ? "" : "s"}</label><label className="property-toggle"><input checked={security.redaction.blackBoxes} onChange={(event) => setSecurity((state) => ({ ...state, redaction: { ...state.redaction, blackBoxes: event.target.checked } }))} type="checkbox" />Render black boxes after removal</label><label className="property-toggle"><input checked={security.redaction.removeText} onChange={(event) => setSecurity((state) => ({ ...state, redaction: { ...state.redaction, removeText: event.target.checked } }))} type="checkbox" />Remove intersecting text</label><label className="property-field"><span>Images</span><select onChange={(event) => setSecurity((state) => ({ ...state, redaction: { ...state.redaction, imageMode: event.target.value as typeof state.redaction.imageMode } }))} value={security.redaction.imageMode}><option value="pixels">Remove covered pixels</option><option value="remove">Remove entire touched image</option><option value="unless-invisible">Remove visible touched images</option><option value="none">Do not alter images</option></select></label><label className="property-field"><span>Lines and shapes</span><select onChange={(event) => setSecurity((state) => ({ ...state, redaction: { ...state.redaction, lineArtMode: event.target.value as typeof state.redaction.lineArtMode } }))} value={security.redaction.lineArtMode}><option value="covered">Remove fully covered objects</option><option value="touched">Remove any touched object</option><option value="none">Do not alter line art</option></select></label></section></div>;
  if (tab === "signatures") return <SignaturesPanel {...context} />;
  if (tab === "sanitize") return <SanitizePanel security={security} setSecurity={setSecurity} inspection={inspection} />;
  return <ProtectPanel security={security} setSecurity={setSecurity} ownerPasswordConfirm={context.ownerPasswordConfirm} setOwnerPasswordConfirm={context.setOwnerPasswordConfirm} />;
}

function FormsPanel(context: PanelContext) {
  const fields = context.inspection.formFields;
  if (!fields.length) return <div className="security-panel-body"><PanelTitle title="Forms" subtitle="Fill existing PDF form fields" /><div className="security-empty"><strong>No fillable form fields detected</strong><p>PDF Studio can edit supported fields that already exist in a PDF. Creating new form fields is not supported yet.</p></div></div>;
  return <div className="security-panel-body"><PanelTitle title="Form values" subtitle={`${fields.length} existing fields · PDF scripts are not run`} /><div className="security-form-list">{fields.map((field) => <FormControl field={field} key={field.id} selected={context.selectedField?.id === field.id} value={context.security.formValues[field.id] ?? field.value} onChange={(value) => context.setSecurity((state) => ({ ...state, formValues: { ...state.formValues, [field.id]: value }, currentPage: field.pageNumber }))} onSelect={() => context.setSelectedFieldId(field.id)} />)}</div><button className="button button--ghost button--block" onClick={() => context.setSecurity((state) => ({ ...state, formValues: { ...context.initialFormValues } }))} type="button">Reset pending values</button><p className="property-note">Read-only and digital signature fields are displayed but cannot be changed here.</p></div>;
}

function FormControl({ field, value, selected, onChange, onSelect }: { field: SecurityFormField; value: string; selected: boolean; onChange: (value: string) => void; onSelect: () => void }) {
  const title = field.label || field.name || `${field.type} field`;
  const disabled = field.readOnly || field.type === "signature" || field.type === "button";
  const control = field.type === "checkbox" || field.type === "radiobutton"
    ? <label className="security-checkbox"><input checked={isOn(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? field.options.find((option) => option.toLocaleLowerCase() !== "off") ?? "Yes" : "Off")} type="checkbox" /><span>{isOn(value) ? "Selected" : "Not selected"}</span></label>
    : field.type === "combobox" || field.type === "listbox"
      ? <select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}><option value="">—</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
      : <input disabled={disabled} onChange={(event) => onChange(event.target.value)} type={field.password ? "password" : "text"} value={value} />;
  return <article className={`security-form-field${selected ? " active" : ""}`} onClick={onSelect}><header><div><strong>{title}</strong><small>Page {field.pageNumber} · {field.type}{field.readOnly ? " · read-only" : ""}</small></div><button onClick={(event) => { event.stopPropagation(); onSelect(); }} type="button">View</button></header>{control}</article>;
}

function SignaturesPanel(context: PanelContext) {
  return <div className="security-panel-body"><PanelTitle title="Signatures" subtitle="Visual signature marks and existing digital signature fields" /><div className="security-critical-note security-critical-note--neutral"><strong>Visual and digital signatures are different.</strong><p>Visual signatures are appearance marks. Cryptographic signatures contain a certificate and can be invalidated by later changes.</p></div><a className="button button--ghost button--block" href={routeHref({ name: "editor", projectId: context.projectId })}>Open editor to place a visual signature</a><section className="security-section"><h3>Visual signatures ({context.visualSignatures.length})</h3>{context.visualSignatures.length ? context.visualSignatures.map((signature) => <div className="security-signature-row" key={signature.id}><span>✒</span><div><strong>{signature.signerName || "Signature"}</strong><small>Page {signature.pageNumber} · appearance only</small></div></div>) : <p className="property-note">No visual signature marks are pending.</p>}</section><section className="security-section"><h3>Digital signature fields ({context.inspection.signatures.length})</h3>{context.inspection.signatures.length ? context.inspection.signatures.map((signature) => <div className="security-signature-row" key={signature.id}><span>{signature.signed ? "✓" : "○"}</span><div><strong>{signature.name}</strong><small>Page {signature.pageNumber} · {signature.signed ? signature.signatory || "signed" : "unsigned"}</small>{signature.digestStatus ? <em>{signature.digestStatus}</em> : null}</div></div>) : <p className="property-note">No digital signature fields were detected.</p>}<p className="property-note">Certificate-based signing is not available in the browser build yet. PDF Studio does not substitute an image and call it a digital signature.</p></section></div>;
}

function SanitizePanel({ security, setSecurity, inspection }: { security: SecurityProjectState; setSecurity: PanelContext["setSecurity"]; inspection: SecurityInspectionReport }) {
  const options: Array<{ key: keyof SecurityProjectState["sanitization"]; label: string; detail: string }> = [
    { key: "removeMetadata", label: "Remove metadata", detail: `${Object.keys(inspection.metadata).length} standard fields detected` },
    { key: "removeJavaScript", label: "Remove embedded scripts", detail: inspection.hasJavaScript ? "Active scripts detected" : "No scripts detected" },
    { key: "removeOpenActions", label: "Remove automatic document actions", detail: inspection.hasOpenAction || inspection.hasAdditionalActions ? "Automatic actions detected" : "No automatic actions detected" },
    { key: "removeAttachments", label: "Remove embedded files", detail: `${inspection.attachmentCount} embedded file${inspection.attachmentCount === 1 ? "" : "s"} detected` },
    { key: "removeLinks", label: "Remove all page links", detail: "Deletes internal and external links" },
    { key: "removeComments", label: "Remove page annotations and comments", detail: "Also removes ordinary editor annotations" },
    { key: "clearFormValues", label: "Clear all form values", detail: "Does not clear signed signature fields" },
    { key: "flattenForms", label: "Flatten form fields", detail: "Keeps appearance but removes interactivity" },
    { key: "flattenAnnotations", label: "Flatten annotations", detail: "Keeps appearance but removes editability" },
    { key: "collapseRevisionHistory", label: "Remove previous saved PDF versions", detail: `${inspection.versionCount} stored version${inspection.versionCount === 1 ? "" : "s"}` }
  ];
  return <div className="security-panel-body"><PanelTitle title="Clean up document" subtitle="Remove private, active, or collaborative content" /><div className="security-option-list">{options.map((option) => <label key={option.key}><input checked={security.sanitization[option.key]} onChange={(event) => setSecurity((state) => ({ ...state, sanitization: { ...state.sanitization, [option.key]: event.target.checked } }))} type="checkbox" /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</div></div>;
}

function ProtectPanel({ security, setSecurity, ownerPasswordConfirm, setOwnerPasswordConfirm }: { security: SecurityProjectState; setSecurity: PanelContext["setSecurity"]; ownerPasswordConfirm: string; setOwnerPasswordConfirm: (value: string) => void }) {
  return <div className="security-panel-body"><PanelTitle title="Passwords and permissions" subtitle="Passwords are used for this operation and are not saved" /><label className="property-field"><span>Password protection</span><select onChange={(event) => setSecurity((state) => ({ ...state, encryption: { ...state.encryption, mode: event.target.value as typeof state.encryption.mode } }))} value={security.encryption.mode}><option value="keep">Keep current password protection</option><option value="remove">Remove password protection</option><option value="aes-256">Protect with a password (AES-256)</option></select></label>{security.encryption.mode === "aes-256" ? <><label className="property-field"><span>Open password</span><input autoComplete="new-password" onChange={(event) => setSecurity((state) => ({ ...state, encryption: { ...state.encryption, userPassword: event.target.value } }))} placeholder="Optional; blank allows opening" type="password" value={security.encryption.userPassword} /></label><label className="property-field"><span>Owner password</span><input autoComplete="new-password" onChange={(event) => setSecurity((state) => ({ ...state, encryption: { ...state.encryption, ownerPassword: event.target.value } }))} type="password" value={security.encryption.ownerPassword} /></label><label className="property-field"><span>Confirm owner password</span><input autoComplete="new-password" onChange={(event) => setOwnerPasswordConfirm(event.target.value)} type="password" value={ownerPasswordConfirm} /></label><section className="security-section"><h3>Granted permissions</h3><div className="security-option-list security-option-list--compact">{Object.keys(security.encryption.permissions).map((key) => <label key={key}><input checked={security.encryption.permissions[key as keyof typeof security.encryption.permissions]} onChange={(event) => setSecurity((state) => ({ ...state, encryption: { ...state.encryption, permissions: { ...state.encryption.permissions, [key]: event.target.checked } } }))} type="checkbox" /><span><strong>{humanize(key)}</strong></span></label>)}</div></section></> : null}<div className="security-critical-note security-critical-note--neutral"><strong>PDF permissions depend on the reader.</strong><p>They tell compatible PDF readers which actions should be allowed. The open password is the actual encryption barrier.</p></div></div>;
}

function ValidationPanel({ validation, inspection }: { validation: SecurityValidationReport | null; inspection: SecurityInspectionReport }) {
  return <div className="security-validation-body"><PanelTitle title="Final check" subtitle="PDF Studio does not release output when a required safety check fails" />{validation ? <><div className={`security-validation-summary ${validation.valid ? "passed" : "failed"}`}><strong>{validation.valid ? "Passed" : "Failed"}</strong><span>{validation.checks.filter((check) => check.passed).length}/{validation.checks.length} checks</span></div><details><summary>Check details</summary><div className="security-check-list">{validation.checks.map((check) => <div className={check.passed ? "passed" : "failed"} key={check.name}><span>{check.passed ? "✓" : "×"}</span><div><strong>{check.name}</strong><small>{check.detail}</small></div></div>)}</div></details></> : <div className="security-empty"><strong>No protected output checked yet</strong><p>When you export, PDF Studio reopens the result and checks its structure, protection settings, removed content, and redactions before download.</p></div>}<section className="security-section"><h3>Source risk summary</h3><ul className="security-risk-list"><li className={inspection.encrypted ? "warn" : "ok"}>{inspection.encrypted ? "Encrypted source" : "Unencrypted source"}</li><li className={inspection.hasJavaScript || inspection.hasOpenAction ? "warn" : "ok"}>{inspection.hasJavaScript || inspection.hasOpenAction ? "Active content detected" : "No active content detected"}</li><li className={inspection.signatures.some((signature) => signature.signed) ? "warn" : "ok"}>{inspection.signatures.some((signature) => signature.signed) ? "Signed document; changes may invalidate signatures" : "No signed fields detected"}</li><li className={inspection.repaired ? "warn" : "ok"}>{inspection.repaired ? "Document required repair" : "No repair reported"}</li></ul></section></div>;
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) { return <header className="security-panel-title"><h2>{title}</h2><p>{subtitle}</p></header>; }
function Fact({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className={danger ? "security-fact danger" : "security-fact"}><span>{label}</span><strong>{value}</strong></div>; }
function isOn(value: string): boolean { return !["", "off", "false", "0", "no"].includes(value.toLocaleLowerCase()); }
function humanize(value: string): string { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase()); }
function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document"; }
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

function PasswordDialog({ error, password, onChange, onSubmit, projectId }: { error: string | null; password: string; onChange: (value: string) => void; onSubmit: () => void; projectId: string }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const close = useCallback(() => { window.location.hash = routeHref({ name: "viewer", projectId }).slice(1); }, [projectId]);
  useModalFocus(true, dialogRef, close, inputRef);
  return <div className="viewer-password-overlay" role="presentation"><div aria-describedby="secure-password-description" aria-labelledby="secure-password-title" aria-modal="true" className="viewer-password-dialog" ref={dialogRef} role="dialog"><p className="eyebrow">Protected document</p><h2 id="secure-password-title">Password required</h2><p id="secure-password-description">Your password is used only in this tab to open and protect the PDF. It is not saved.</p><label className="visually-hidden" htmlFor="secure-password-input">PDF password</label><input autoComplete="off" id="secure-password-input" onChange={(event) => onChange(event.target.value)} placeholder="PDF password" ref={inputRef} type="password" value={password} /><button className="button" disabled={!password} onClick={onSubmit} type="button">Open protection tools</button><a className="button button--ghost" href={routeHref({ name: "viewer", projectId })}>Return to viewer</a>{error ? <span aria-live="assertive" className="selection-help selection-help--error" role="alert">{error}</span> : null}</div></div>;
}
