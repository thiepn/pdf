import { getReleaseInformation } from "../core/release";
import { routeHref } from "../core/appRouter";

const capabilities = [
  ["Read and manage local projects", "Available", "Open, search, back up, restore, and reopen PDFs without uploading them."],
  ["Edit & annotate", "Available", "Add content and annotations, and edit supported existing text, images, vectors, table cells, and form values."],
  ["Pages", "Available", "Reorder, rotate, duplicate, delete, reverse, extract, split, crop, insert blank pages, and merge PDFs."],
  ["Protect & forms", "Available", "Fill forms, permanently apply redactions, remove risky active content, flatten supported structures, and add password protection."],
  ["OCR and scanning", "Available with limits", "Printed-text OCR can create searchable raster PDFs. Image-based reconstruction does not preserve every interactive PDF structure."],
  ["Convert & optimize", "Available", "Lossless cleanup, stronger image-based compression, metadata editing/removal, grayscale output, and local text/Markdown/HTML/page-image exports."],
  ["Create & compare", "Available", "Create PDFs from Markdown, text, or simple HTML, or compare text and scanned PDFs with automatic page matching."],
  ["Review & accessibility", "Advanced", "Check accessibility, prepare print layouts, add Bates numbering, review archive readiness, and inspect specialist document findings. Formal standards certification remains external."],
  ["Certificate-backed signing", "Not built in", "The app can inspect embedded signatures and create visual signatures, but signing with a trusted digital certificate requires an external signing integration."],
  ["Offline/PWA", "Available", "The app can be installed, cached for offline use, and hosted statically on GitHub Pages without a backend."]
] as const;

export function ReleasePage() {
  const release = getReleaseInformation();
  return <div className="release-page stack">
    <section className="release-hero">
      <div><p className="eyebrow">About this app</p><h2>PDF Studio {release.version}</h2><p>A local-first PDF workspace that runs in your browser. Files stay on this device unless you explicitly download an OCR language pack or open an external source link.</p></div>
      <div className="release-build"><span>Release status</span><strong>{release.channel === "stable" ? "Stable" : "Release candidate"}</strong><span>Build</span><strong>{release.buildTimestamp === "development" ? "Development source" : new Date(release.buildTimestamp).toLocaleString()}</strong></div>
    </section>

    <section className="release-section"><header><div><p className="eyebrow">Capabilities</p><h2>What you can rely on</h2><p>Every major capability is listed here in plain language. Advanced technical details remain available through Help and troubleshooting tools.</p></div></header>
      <div className="maturity-table">{capabilities.map(([name,status,description]) => <article key={name}><div><strong>{name}</strong><span className="maturity maturity--stable">{status}</span></div><p>{description}</p></article>)}</div>
    </section>

    <section className="release-grid">
      <article><p className="eyebrow">Privacy</p><h3>No document-upload endpoint</h3><p>PDF bytes, extracted text, project state, OCR results, form values, passwords, and generated outputs remain in browser-local processing.</p></article>
      <article><p className="eyebrow">Backups</p><h3>Integrity-checked project files</h3><p><code>.lpsproject</code> backups include the source PDF and supported local state. Damaged or inconsistent packages are rejected instead of being silently restored.</p></article>
      <article><p className="eyebrow">Browser support</p><h3>Optional APIs have fallbacks</h3><p>Direct filesystem access, camera capture, install/share integration, and persistent storage are used only when the browser supports them. Normal file pickers and downloads remain available.</p></article>
      <article><p className="eyebrow">Licence</p><h3>AGPL-3.0-or-later</h3><p>The source remains public and redistributable under the repository licence.</p></article>
    </section>

    <section className="release-actions">
      <a className="button" href={routeHref({ name: "help" })}>Open user guide</a>
      <a className="button button--secondary" href={routeHref({ name: "settings" })}>Open settings</a>
      <details className="help-advanced-actions"><summary>Advanced support tools</summary><div><a className="button button--ghost" href={routeHref({ name: "maintenance" })}>Troubleshooting & recovery</a><a className="button button--ghost" href={routeHref({ name: "validation" })}>Run app self-check</a><a className="button button--ghost" href={routeHref({ name: "diagnostics", lab: "system" })}>System diagnostics</a></div></details>
      {release.sourceUrl ? <a className="button button--ghost" href={release.sourceUrl} rel="noreferrer" target="_blank">View source</a> : null}
    </section>
  </div>;
}
