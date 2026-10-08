# F5 — Shared headless PDF action registry

## Why

PDF Studio has three execution surfaces: quick (file-first), batch (recipe pipeline) and individual workspaces. F5 establishes **one explicit registry**, reusing existing PDF engines rather than creating another worker. F5 is branched independently of unmerged F1–F4.

## Public in-app contract (v1)

- `src/actions/actionCatalog.ts`: ten stable `pdf.*` identifiers, human-readable descriptors, output kinds, structured options, risks, strict schema checking and dry-run planning.
- `src/actions/actionRunner.ts`: `runHeadlessAction(bytes, request, {signal, onProgress?})` and `runHeadlessSequence(bytes, requests, {signal, onProgress?})`. Returns bytes, MIME type, extension, output kind, validated page count or ZIP header, timing, warnings, optional per-step reports. **Never** navigates, downloads, mutates storage or calls a network service.
- `src/processing/batchPipeline.ts`: preserves public `runBatchRecipe` API but maps existing batch recipe steps into versioned registry requests; all ten step types now use shared action execution.
- `src/quick/quickOperations.ts`: routes lossless quick compression and metadata removal through the same runner. Other quick flows continue using their existing specialized adapters until equivalent parameter semantics are ready.
- All existing workers and UI components remain where they are. Execution is cancelled with `AbortSignal`, commands are allowlisted, and output size is capped at 256 MB in this registry.

Example (internal browser code, not an external API):

```ts
import { planHeadlessActions } from "./actions/actionCatalog";
import { runHeadlessSequence } from "./actions/actionRunner";
const requests = [
  {schemaVersion: 1, actionId: "pdf.rotate", params: { degrees: 90 }},
  {schemaVersion: 1, actionId: "pdf.optimize", params: {}}
];
const preview = planHeadlessActions(requests);
if (!preview.approved) throw new Error("Explicit user authorization required");
const result = await runHeadlessSequence(inputBytes, requests, { signal: controller.signal });
```

### Ten supported actions

`pdf.rotate`, `pdf.optimize`, `pdf.metadata.remove`, `pdf.crop`, `pdf.decorate`, `pdf.pages.blank`, `pdf.raster.compress`, `pdf.raster.grayscale`, `pdf.split.fixed`, `pdf.pages.images`.

No caller is allowed to pass arbitrary JS functions, file paths, URLs, code strings, shell commands or unknown options. Options are bounded and type checked before operations execute. Terminal exports (ZIP split and page images) must be last. A max of 32 actions can be composed.

### Safety and consent

Untrusted `runHeadlessAction` or `runHeadlessSequence` calls must contain explicit `approvedRisks` for `metadata-removal` and `rasterization`. The existing batch adapter emits those acknowledgements **only for already-selected recipe steps** when the user initiates the workflow; it never generates or guesses destructive actions. No LLM is granted blanket permission.

Every PDF output is independently reopened and checked for the expected page count before returning. ZIP outputs require a valid local file header. Results are new byte arrays; input PDF project data are never changed in place. Downstream UI retains responsibility for storage budgets, password-protected PDFs, downloads, and user notices.

### Limitations

- `pdf.optimize` is the **legacy** MuPDF optimize operation; it is **not** the unmerged F4 strict 15-category smart optimizer. The F4 action should only be exposed after that branch merges, with its own strict options/validation.
- Page count and ZIP signature checks are necessary but do not imply full PDF semantic fidelity, error-free rendering, or cryptographic validation.
- `pdf.rotate` uses the existing page-compilation engine; advanced document-level structures may be remapped as in the existing batch tool.
- F5 does not create a publicly accessible server, cross-origin API, autonomous agent, remote invocation permission, or external MCP tool. It provides an in-process contract suitable for later authorised adapters.
- A future phase can broaden adapters for forms, signing, sanitization and intelligent optimizer once their preservation and security contracts are qualified.

## Quality gates
- Strict schema, risk and terminal-order unit tests
- Mocked headless execution, expected-page validation, cancellation tests
- Existing batch recipe regressions
- Two Chromium quick-tool export and reopen checks
- Existing repository release and performance gates
