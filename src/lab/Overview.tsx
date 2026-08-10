import { Panel } from "../components/Panel";

const gates = [
  ["P0-01", "Build, routing, workers, PWA and GitHub Pages"],
  ["P0-02", "PDF.js rendering, text extraction and cancellation"],
  ["P0-03", "MuPDF WebAssembly loading and mutable document probe"],
  ["P0-04", "Canonical PDF/view coordinate transform"],
  ["P0-05", "Export, reopen and semantic validation"],
  ["P0-12", "OPFS, IndexedDB and interruption-safe recovery"]
];

export function Overview() {
  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">Architecture before interface</p>
        <h2>Prove the hard parts before building the editor.</h2>
        <p>
          This laboratory intentionally exposes raw capabilities, timing, errors and generated evidence. Its UI is disposable; its engine adapters, worker contracts, validators and storage rules are not.
        </p>
      </section>

      <div className="metric-grid">
        <article className="metric-card">
          <span>Processing</span>
          <strong>100% local</strong>
          <p>Files remain in the browser process and origin-private storage.</p>
        </article>
        <article className="metric-card">
          <span>Deployment</span>
          <strong>Static</strong>
          <p>Designed for GitHub Pages without a server runtime.</p>
        </article>
        <article className="metric-card">
          <span>Current scope</span>
          <strong>Engineering baseline</strong>
          <p>Feasibility gates, not production editing workflows.</p>
        </article>
      </div>

      <Panel title="Active engineering gates" eyebrow="Implementation sequence">
        <div className="gate-grid">
          {gates.map(([code, label]) => (
            <article className="gate-card" key={code}>
              <span>{code}</span>
              <strong>{label}</strong>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Current implementation boundary" eyebrow="What this build already contains">
        <ul className="feature-list">
          <li>Hash-based static routing that survives GitHub Pages refreshes.</li>
          <li>Browser capability and generic worker diagnostics.</li>
          <li>PDF.js file loading, rendering, text extraction and page controls.</li>
          <li>MuPDF module and document-opening probe inside a dedicated worker.</li>
          <li>Canonical affine coordinate service with 24 rotation/zoom round-trip test groups.</li>
          <li>OPFS and IndexedDB write/read/delete tests.</li>
          <li>Basic PDF byte validation plus independent PDF.js reopen of MuPDF output.</li>
        </ul>
      </Panel>
    </div>
  );
}
