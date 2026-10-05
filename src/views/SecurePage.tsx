import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { registerPreparedDocumentSnapshot, type DocumentSnapshot } from "../product/documentSnapshot";
import { readProjectSessionPassword, rememberProjectSessionPassword } from "../security/sessionPasswords";
import { routeHref } from "../core/appRouter";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { useModalFocus } from "../accessibility/modalFocus";
import { openPdfWithPdfJs } from "../engines/pdfjs";
import { listEditorAssets, readEditorState, writeEditorState } from "../editor/editorRepository";
import { exportEditorPdf } from "../editor/editorExportClient";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { applySecurity, inspectSecurity } from "../security/securityClient";
import { createSecurityState } from "../security/securityModel";
import { readSecurityState, writeSecurityState } from "../security/securityRepository";
import { SecurityPreviewPage } from "../security/SecurityPreviewPage";
import { FormAuthoringPanel } from "../security/FormAuthoringPanel";
import { RedactionDiscoveryPanel } from "../security/RedactionDiscoveryPanel";
import type { RedactionCandidate } from "../security/redactionDiscovery";
import { validateFormCreates } from "../security/formAuthoring";
import { collectRedactionTokens, validateSecurityOutput, type SecurityValidationReport } from "../security/securityValidation";
import type { EditorAssetRecord, EditorDocumentState, EditorExportAsset, EditorObject, ImageEditorObject, RedactionEditorObject } from "../types/editor";
import type { ProjectManifest } from "../types/project";
import type { FormFieldCreate, FormFieldUpdate, SecurityFormField, SecurityInspectionReport, SecurityProjectState } from "../types/security";

interface Props { taskId?: string; projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type SecurityTab = "overview" | "forms" | "redaction" | "signatures" | "sanitize" | "protect";

const securityTasks: Array<{ id: SecurityTab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "◇" },
  { id: "forms", label: "Forms", icon: "▤" },
  { id: "redaction", label: "Redaction", icon: "■" },
  { id: "signatures", label: "Signatures", icon: "✒" },
  { id: "sanitize", label: "Clean up", icon: "⌁" },
  { id: "protect", label: "Protect", icon: "▣" }
];

export function SecurePage({ projectId, taskId, onTitleChange }: Props) {
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
  const taskPanel = (id?: string): SecurityTab => id === "fill-forms" ? "forms" : id === "apply-redactions" ? "redaction" : ["sanitize-pdf", "flatten-pdf"].includes(id ?? "") ? "sanitize" : id === "password-protect" ? "protect" : "overview";
  const [tab, setTab] = useState<SecurityTab>(() => taskPanel(taskId));
  useEffect(() => { setTab(taskPanel(taskId)); }, [taskId]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>();
  const [selectedDraftId, setSelectedDraftId] = useState<string | undefined>();
  const [formCreates, setFormCreates] = useState<FormFieldCreate[]>([]);
  const [redactionPreview, setRedactionPreview] = useState<RedactionCandidate | null>(null);
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
  const changedFieldCount = useMemo(() => (inspection?.formFields ?? []).filter((field) => (security.formValues[field.id] ?? field.value) !== field.value).length + formCreates.length, [inspection, security.formValues, formCreates.length]);
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
        await openDocument(manifest, bytes, readProjectSessionPassword(projectId));
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
      if (suppliedPassword) rememberProjectSessionPassword(projectId, suppliedPassword);
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


  async function buildSecurityOutput(signal?: AbortSignal): Promise<DocumentSnapshot> {
    if (!project || !document || !inspection || !sourceBytesRef.current || !editorState) throw new Error("Wait for the document safety check before continuing.");
    const sourceBytes = sourceBytesRef.current;
    const formCreateErrors = validateFormCreates(formCreates, inspection.formFields);
    if (formCreateErrors.length) throw new Error(`Fix the new interactive fields before export: ${formCreateErrors.join(" ")}`);
    if (security.redaction.enabled && totalRedactionMarkCount === 0) { throw new Error("Redaction application is enabled, but no redaction regions exist. Place regions in the editor or open a PDF that already contains redaction marks."); }
    if (!security.redaction.enabled && totalRedactionMarkCount > 0 && (security.sanitization.flattenAnnotations || security.sanitization.removeComments)) { throw new Error("Applying comment removal or annotation flattening while unapplied redaction marks exist could leave only visual boxes. Apply redactions first or disable those sanitization options."); }
    if (security.encryption.mode === "aes-256" && !security.encryption.ownerPassword) { throw new Error("Enter an owner password before applying AES-256 protection."); }
    if (security.encryption.mode === "aes-256" && security.encryption.ownerPassword !== ownerPasswordConfirm) { throw new Error("The owner-password confirmation does not match."); }

      const visibleObjects = editorState.objects.filter((object) => !object.hidden);
      const assetIds = new Set(visibleObjects.filter((object): object is ImageEditorObject => object.type === "image").map((object) => object.assetId));
      const exportAssets: EditorExportAsset[] = assets.filter((asset) => assetIds.has(asset.id)).map((asset) => ({ id: asset.id, mimeType: asset.mimeType, bytes: asset.bytes.slice(0) }));
      const redactionTokens = security.redaction.enabled ? await collectRedactionTokens(document, redactionObjects) : [];
      const redactionPages = redactionObjects.map((object) => object.pageNumber);
      const editorResult = visibleObjects.length
        ? await exportEditorPdf(sourceBytes, visibleObjects, exportAssets, signal, passwordRef.current)
        : { bytes: Uint8Array.from(sourceBytes), report: { warnings: [] as string[] } };
      setStatus("Applying forms, redactions, cleanup, and password settings…");
      const formUpdates: FormFieldUpdate[] = inspection.formFields
        .filter((field) => !field.readOnly && (security.formValues[field.id] ?? field.value) !== field.value)
        .map((field) => ({ id: field.id, pageNumber: field.pageNumber, widgetIndex: field.widgetIndex, name: field.name, type: field.type, value: security.formValues[field.id] ?? "" }));
      const options = { formUpdates, formCreates, redaction: security.redaction, sanitization: security.sanitization, encryption: security.encryption };
      const secured = await applySecurity(editorResult.bytes, options, passwordRef.current, signal);
      setStatus("Checking protected PDF…");
      const result = await validateSecurityOutput(secured.bytes, inspection.pageCount, options, passwordRef.current, redactionTokens, redactionPages);
      setValidation(result);
      const combinedWarnings = [...new Set([...(editorResult.report.warnings ?? []), ...secured.report.warnings, ...result.inspection.warnings])];
      setWarnings(combinedWarnings);
      if (!result.valid) throw new Error(`The protected PDF did not pass the final safety check: ${result.checks.filter((check) => !check.passed).map((check) => check.name).join(", ")}. No output was created.`);
      const filename = `${safeName(project.name)}_${security.redaction.enabled ? "redacted_" : ""}secured.pdf`;
      const outputPassword = security.encryption.mode === "aes-256" ? security.encryption.userPassword || security.encryption.ownerPassword : security.encryption.mode === "keep" ? passwordRef.current : undefined;
      signal?.throwIfAborted();
      return { bytes: secured.bytes, file: new File([toOwnedArrayBuffer(secured.bytes)], filename, { type: "application/pdf" }), password: outputPassword, warnings: combinedWarnings, changed: true };
  }
  const preparedRef = useRef<(signal?: AbortSignal) => Promise<DocumentSnapshot>>(buildSecurityOutput);
  preparedRef.current = buildSecurityOutput;
  useEffect(() => registerPreparedDocumentSnapshot(projectId, async (signal) => {
    setBusy(true); setError(null);
    try { return await preparedRef.current(signal); }
    finally { setBusy(false); }
  }), [projectId]);

  async function exportSecure(saveProject: boolean): Promise<void> {
    if (!project || busy) return;
    setBusy(true); setError(null); setWarnings([]); setValidation(null);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(project.id, { label: saveProject ? "Saving updated PDF" : "Exporting updated PDF", signal: controller.signal, reserveBytes: saveProject ? project.byteLength : undefined }, async ({ signal, update }) => {
        update({ detail: "Applying and verifying your document settings…", progress: 0.1 });
        const output = await buildSecurityOutput(signal);
        if (saveProject) {
          update({ stage: "committing", detail: "Saving a separate project copy…", progress: 0.94 });
          const created = await createDerivedProjectFromBytes(project.id, output.bytes, output.file.name, "secure-export", "application/pdf", output.password);
          if (output.password) rememberProjectSessionPassword(created.id, output.password);
          window.location.hash = routeHref({ name: "viewer", projectId: created.id }).slice(1);
        } else { downloadBlob(output.file, output.file.name); setStatus(`PDF checked and downloaded · ${formatBytes(output.bytes.byteLength)}`); }
        update({ progress: 1 });
      });
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Ready");
    } finally { setBusy(false); abortRef.current = null; }
  }

  async function acceptAutomaticRedactions(objects: RedactionEditorObject[]): Promise<void> {
    if (!editorState || !objects.length) return;
    const next: EditorDocumentState = { ...editorState, objects: [...editorState.objects, ...objects], dirty: true, updatedAt: Date.now() };
    await writeEditorState(next);
    setEditorState(next);
    setSecurity((state) => ({ ...state, redaction: { ...state.redaction, enabled: true } }));
    setStatus(`${objects.length} redaction mark${objects.length === 1 ? "" : "s"} added · review the marked pages before export`);
  }

  async function retryPassword(): Promise<void> {
    if (!project || !sourceBytesRef.current || !password) return;
    try { await openDocument(project, sourceBytesRef.current, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  if (!project) return <div className="viewer-loading"><span className="spinner" /><strong>{error ?? status}</strong></div>;
  if (!document || !inspection || !editorState) return <div className="security-app"><div className="viewer-loading"><span className="spinner" /><strong>{status}</strong></div>{passwordRequired ? <PasswordDialog error={error} password={password} onChange={setPassword} onSubmit={() => void retryPassword()} projectId={projectId} /> : null}</div>;

  const selectedField = inspection.formFields.find((field) => field.id === selectedFieldId);
  const selectedDraft = formCreates.find((field) => field.id === selectedDraftId);
  const securityObjects = editorState.objects.filter((object) => object.type === "redaction" || object.type === "signature");

  return <div className="security-app security-task-workflow" data-security-task={tab}>
    <header className="security-commandbar">
      <div className="editor-file-group"><div><strong>{taskId === "flatten-pdf" ? "Flatten PDF" : tab === "forms" ? "Fill or create PDF forms" : tab === "redaction" ? "Find & apply redactions" : tab === "sanitize" ? "Clean up PDF" : tab === "protect" ? "Protect PDF" : "Document safety"}</strong><span>{status} · your original PDF is kept unchanged</span></div></div>
      <div className="security-page-controls"><button aria-label="Previous form page" disabled={security.currentPage <= 1} onClick={() => setSecurity((state) => ({ ...state, currentPage: state.currentPage - 1 }))} type="button">‹</button><label><input aria-label="Form page" max={inspection.pageCount} min="1" onChange={(event) => setSecurity((state) => ({ ...state, currentPage: Math.max(1, Math.min(inspection.pageCount, Number(event.target.value))) }))} type="number" value={security.currentPage} /><span>/ {inspection.pageCount}</span></label><button aria-label="Next form page" disabled={security.currentPage >= inspection.pageCount} onClick={() => setSecurity((state) => ({ ...state, currentPage: state.currentPage + 1 }))} type="button">›</button><button aria-label="Zoom out" onClick={() => setSecurity((state) => ({ ...state, zoom: Math.max(.5, state.zoom - .25) }))} type="button">−</button><select aria-label="Form zoom" onChange={(event) => setSecurity((state) => ({ ...state, zoom: Number(event.target.value) }))} value={security.zoom}><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="1.75">175%</option><option value="2">200%</option></select><button aria-label="Zoom in" onClick={() => setSecurity((state) => ({ ...state, zoom: Math.min(2, state.zoom + .25) }))} type="button">+</button></div>
      <div className="editor-commandbar__actions"><button className="button" disabled={busy} onClick={() => void exportSecure(false)} type="button">Download PDF</button><details className="editor-save-options"><summary aria-label="More save options">More</summary><button className="button button--secondary" disabled={busy} onClick={() => void exportSecure(true)} type="button">Save project copy</button></details>{busy ? <button className="button button--danger-ghost button--small" onClick={() => abortRef.current?.abort()} type="button">Cancel</button> : null}</div>
    </header>

    <div className="security-notices">{error ? <div className="editor-banner error-banner"><strong>Protection action blocked</strong><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}{warnings.length ? <div className="editor-banner warning-banner"><strong>Warnings</strong><span>{warnings.join(" ")}</span><button onClick={() => setWarnings([])} type="button">Dismiss</button></div> : null}</div>

    <div className="security-layout">

      <aside className="security-panel"><fieldset disabled={busy} className="security-settings"><legend className="visually-hidden">Document settings</legend>{renderPanel(tab, { projectId, document, inspection, security, setSecurity, initialFormValues, selectedField, setSelectedFieldId, formCreates, setFormCreates, selectedDraftId, setSelectedDraftId, redactionObjects, onAcceptRedactions: acceptAutomaticRedactions, onPreviewRedaction: setRedactionPreview, visualSignatures, ownerPasswordConfirm, setOwnerPasswordConfirm })}</fieldset><details className="security-other-tasks"><summary>Related document settings</summary><label>Settings to show<select value={tab} disabled={busy} onChange={(event) => setTab(event.target.value as SecurityTab)}>{securityTasks.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p>All selected changes are included in the output. Review the final check before sharing.</p></details></aside>
      <main className="security-stage"><SecurityPreviewPage document={document} draftFields={formCreates} fields={inspection.formFields} objects={securityObjects} values={security.formValues} onSelectDraft={(field) => { setSelectedDraftId(field.id); setSelectedFieldId(undefined); setTab("forms"); setSecurity((state) => ({ ...state, currentPage: field.pageNumber })); }} onSelectField={(field) => { setSelectedFieldId(field.id); setSelectedDraftId(undefined); setTab("forms"); setSecurity((state) => ({ ...state, currentPage: field.pageNumber })); }} pageNumber={security.currentPage} redactionCandidate={redactionPreview} selectedDraftId={selectedDraft?.id} selectedFieldId={selectedFieldId} zoom={security.zoom} /></main>
      <aside className="security-validation-panel"><details open={validation?.valid === false}><summary>{validation ? validation.valid ? "Output verified · view checks" : "Output blocked · review checks" : "Safety checks & document details"}</summary><ValidationPanel validation={validation} inspection={inspection} /></details></aside>
    </div>
  </div>;
}

interface PanelContext {
  projectId: string;
  document: PDFDocumentProxy;
  inspection: SecurityInspectionReport;
  security: SecurityProjectState;
  setSecurity: Dispatch<SetStateAction<SecurityProjectState>>;
  initialFormValues: Record<string, string>;
  selectedField?: SecurityFormField;
  setSelectedFieldId: (id: string | undefined) => void;
  formCreates: FormFieldCreate[];
  setFormCreates: (value: FormFieldCreate[]) => void;
  selectedDraftId?: string;
  setSelectedDraftId: (id: string | undefined) => void;
  redactionObjects: Array<Extract<EditorObject, { type: "redaction" }>>;
  onAcceptRedactions: (objects: RedactionEditorObject[]) => Promise<void>;
  onPreviewRedaction: (candidate: RedactionCandidate | null) => void;
  visualSignatures: Array<Extract<EditorObject, { type: "signature" }>>;
  ownerPasswordConfirm: string;
  setOwnerPasswordConfirm: (value: string) => void;
}

function renderPanel(tab: SecurityTab, context: PanelContext) {
  const { inspection, security, setSecurity } = context;
  if (tab === "overview") return <div className="security-panel-body"><PanelTitle title="Protection overview" subtitle="Current document state before you create a protected copy" /><div className="security-fact-grid"><Fact label="Encryption" value={inspection.encryptionDescription} /><Fact label="Authentication" value={inspection.authentication} /><Fact label="Saved PDF versions" value={String(inspection.versionCount)} /><Fact label="Forms" value={String(inspection.formFields.length)} /><Fact label="Signatures" value={String(inspection.signatures.length)} /><Fact label="Attachments" value={String(inspection.attachmentCount)} /><Fact label="JavaScript" value={inspection.hasJavaScript ? "Detected" : "None detected"} danger={inspection.hasJavaScript} /><Fact label="Automatic actions" value={inspection.hasOpenAction || inspection.hasAdditionalActions ? "Detected" : "None detected"} danger={inspection.hasOpenAction || inspection.hasAdditionalActions} /></div><section className="security-section"><h3>Permissions</h3><div className="permission-list">{Object.entries(inspection.permissions).map(([key, value]) => <span className={value ? "allowed" : "blocked"} key={key}>{value ? "✓" : "×"} {humanize(key)}</span>)}</div></section><section className="security-section"><h3>Metadata</h3>{Object.keys(inspection.metadata).length ? <dl className="security-metadata">{Object.entries(inspection.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl> : <p className="property-note">No standard metadata fields were detected.</p>}</section></div>;
  if (tab === "forms") return <FormsPanel {...context} />;
  if (tab === "redaction") return <RedactionPanel {...context} />;
  if (tab === "signatures") return <SignaturesPanel {...context} />;
  if (tab === "sanitize") return <SanitizePanel security={security} setSecurity={setSecurity} inspection={inspection} />;
  return <ProtectPanel security={security} setSecurity={setSecurity} ownerPasswordConfirm={context.ownerPasswordConfirm} setOwnerPasswordConfirm={context.setOwnerPasswordConfirm} />;
}

function FormsPanel(context: PanelContext) {
  const fields = context.inspection.formFields;
  const editable = fields.filter((field) => !field.readOnly && field.type !== "signature" && field.type !== "button");
  return <div className="security-panel-body">
    <PanelTitle title="Forms" subtitle={`${fields.length} existing · ${context.formCreates.length} new · PDF scripts are not run`} />
    {editable.length ? <><div className="security-form-list">{fields.map((field) => <FormControl field={field} key={field.id} selected={context.selectedField?.id === field.id} value={context.security.formValues[field.id] ?? field.value} onChange={(value) => context.setSecurity((state) => ({ ...state, formValues: { ...state.formValues, [field.id]: value }, currentPage: field.pageNumber }))} onSelect={() => { context.setSelectedFieldId(field.id); context.setSelectedDraftId(undefined); }} />)}</div><button className="button button--ghost button--block" onClick={() => context.setSecurity((state) => ({ ...state, formValues: { ...context.initialFormValues } }))} type="button">Reset pending values</button><p className="property-note">Read-only and digital signature fields are displayed but cannot be changed here.</p></> : <div className="security-empty"><strong>No fillable fields detected</strong><p>You can create supported interactive text and checkbox fields below. Existing visual content is not automatically converted without review.</p></div>}
    <FormAuthoringPanel currentPage={context.security.currentPage} disabled={false} document={context.document} drafts={context.formCreates} existingFields={fields} onDrafts={context.setFormCreates} onPage={(pageNumber) => context.setSecurity((state) => ({ ...state, currentPage: pageNumber }))} />
  </div>;
}

function FormControl({ field, value, selected, onChange, onSelect }: { field: SecurityFormField; value: string; selected: boolean; onChange: (value: string) => void; onSelect: () => void }) {
  const title = field.label || field.name || `${field.type} field`;
  const disabled = field.readOnly || field.type === "signature" || field.type === "button";
  const control = field.type === "checkbox" || field.type === "radiobutton"
    ? <label className="security-checkbox"><input aria-label={title} checked={isOn(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? field.options.find((option) => option.toLocaleLowerCase() !== "off") ?? "Yes" : "Off")} type="checkbox" /><span>{isOn(value) ? "Selected" : "Not selected"}</span></label>
    : field.type === "combobox" || field.type === "listbox"
      ? <select aria-label={title} disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}><option value="">—</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
      : <input aria-label={title} disabled={disabled} onChange={(event) => onChange(event.target.value)} type={field.password ? "password" : "text"} value={value} />;
  return <article className={`security-form-field${selected ? " active" : ""}`} onClick={onSelect}><header><div><strong>{title}</strong><small>Page {field.pageNumber} · {field.type}{field.readOnly ? " · read-only" : ""}</small></div><button onClick={(event) => { event.stopPropagation(); onSelect(); }} type="button">View</button></header>{control}</article>;
}

function RedactionPanel(context: PanelContext) {
  const count = context.redactionObjects.length + context.inspection.redactionMarkCount;
  return <div className="security-panel-body">
    <PanelTitle title="Permanent redaction" subtitle="Find, review, mark, then permanently remove content" />
    <div className="security-critical-note"><strong>A black rectangle is not enough.</strong><p>Automatic matching only creates reviewable redaction marks. Underlying content is removed only when Apply redactions is enabled and the verified secure export succeeds.</p></div>
    <RedactionDiscoveryPanel currentPage={context.security.currentPage} disabled={false} document={context.document} existingMarks={context.redactionObjects} onAccept={context.onAcceptRedactions} onPage={(pageNumber) => context.setSecurity((state) => ({ ...state, currentPage: pageNumber }))} onPreview={context.onPreviewRedaction} />
    <a className="button button--ghost button--block" href={routeHref({ name: "editor", projectId: context.projectId })}>Open editor for manual redaction marks</a>
    <section className="security-section"><label className="property-toggle"><input checked={context.security.redaction.enabled} onChange={(event) => context.setSecurity((state) => ({ ...state, redaction: { ...state.redaction, enabled: event.target.checked } }))} type="checkbox" />Apply {count} marked region{count === 1 ? "" : "s"}</label><label className="property-toggle"><input checked={context.security.redaction.blackBoxes} onChange={(event) => context.setSecurity((state) => ({ ...state, redaction: { ...state.redaction, blackBoxes: event.target.checked } }))} type="checkbox" />Render black boxes after removal</label><label className="property-toggle"><input checked={context.security.redaction.removeText} onChange={(event) => context.setSecurity((state) => ({ ...state, redaction: { ...state.redaction, removeText: event.target.checked } }))} type="checkbox" />Remove intersecting text</label><label className="property-field"><span>Images</span><select onChange={(event) => context.setSecurity((state) => ({ ...state, redaction: { ...state.redaction, imageMode: event.target.value as typeof state.redaction.imageMode } }))} value={context.security.redaction.imageMode}><option value="pixels">Remove covered pixels</option><option value="remove">Remove entire touched image</option><option value="unless-invisible">Remove visible touched images</option><option value="none">Do not alter images</option></select></label><label className="property-field"><span>Lines and shapes</span><select onChange={(event) => context.setSecurity((state) => ({ ...state, redaction: { ...state.redaction, lineArtMode: event.target.value as typeof state.redaction.lineArtMode } }))} value={context.security.redaction.lineArtMode}><option value="covered">Remove fully covered objects</option><option value="touched">Remove any touched object</option><option value="none">Do not alter line art</option></select></label></section>
  </div>;
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
