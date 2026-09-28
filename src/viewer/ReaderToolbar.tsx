import { useState } from "react";
import { Icon } from "../components/Icon";
import { routeHref } from "../core/appRouter";
import type { ViewerPreferences } from "../types/project";
import type { ViewerPreferenceChanges } from "./restorePreferences";
import { pageNumberFromDraft } from "./readerControls";

export function ReaderPageInput({ page, total, disabled, onChange }: { page: number; total: number; disabled?: boolean; onChange: (page: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    const next = pageNumberFromDraft(draft ?? String(page), total, page, true);
    setDraft(null);
    if (next !== null && next !== page) onChange(next);
  }
  return <label className="page-input"><span className="visually-hidden">Current page</span><input aria-label="Current page" disabled={disabled} min="1" max={total} type="number" inputMode="numeric" value={draft ?? page}
    onChange={event => { const value = event.target.value; const next = pageNumberFromDraft(value, total, page); setDraft(next === null ? value : null); if (next !== null) onChange(next); }}
    onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(null); } }} /><span>/ {total}</span></label>;
}

interface Props {
  preferences: ViewerPreferences;
  pageCount: number;
  ready: boolean;
  onPreferences: (patch: ViewerPreferenceChanges) => void;
  onPage: (page: number) => void;
  onFit: (mode: "width" | "page") => void;
  onFind: () => void;
  onDownload: () => void;
  onBackup: () => void;
}

/** All everyday reader actions stay visible; only project backup is secondary. */
export function ReaderToolbar({ preferences: p, pageCount, ready, onPreferences, onPage, onFit, onFind, onDownload, onBackup }: Props) {
  const zooms = [...new Set([...Array.from({ length: 16 }, (_, index) => (index + 1) / 4), p.zoom])].sort((a, b) => a - b);
  return <div className="viewer-commandbar reader-commandbar">
    <div className="reader-page-controls">
      <button aria-label="Previous page" className="icon-button" disabled={!ready || p.pageNumber <= 1} onClick={() => onPage(p.pageNumber - 1)} type="button"><Icon name="chevron-left" /></button>
      <ReaderPageInput page={p.pageNumber} total={pageCount} disabled={!ready} onChange={onPage} />
      <button aria-label="Next page" className="icon-button" disabled={!ready || p.pageNumber >= pageCount} onClick={() => onPage(p.pageNumber + 1)} type="button"><Icon name="chevron-right" /></button>
      <button aria-expanded={p.sidebarOpen} aria-controls="viewer-sidebar" className="viewer-mobile-panel-toggle" onClick={() => onPreferences({ sidebarOpen: !p.sidebarOpen })} type="button">{p.sidebarOpen ? "Close panel" : "Pages / search"}</button>
      <button className="reader-find" aria-label="Find text" onClick={onFind} disabled={!ready} type="button" title="Find text (Ctrl+F / Command+F)"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg><span>Find text</span></button>
    </div>
    <div className="reader-zoom-controls">
      <button aria-label="Zoom out" className="icon-button" disabled={!ready || p.zoom <= 0.01} onClick={() => onPreferences({ zoom: Math.max(0.01, p.zoom - 0.25) })} type="button"><Icon name="minus" /></button>
      <select aria-label="Zoom" disabled={!ready} onChange={event => onPreferences({ zoom: Number(event.target.value) })} value={p.zoom}>{zooms.map(zoom => <option key={zoom} value={zoom}>{Math.round(zoom * 100)}%</option>)}</select>
      <button aria-label="Zoom in" className="icon-button" disabled={!ready || p.zoom >= 4} onClick={() => onPreferences({ zoom: Math.min(4, p.zoom + 0.25) })} type="button"><Icon name="plus" /></button>
      <button disabled={!ready} onClick={() => onFit("width")} type="button">Fit width</button>
      <button disabled={!ready} onClick={() => onFit("page")} type="button">Fit page</button>
    </div>
    <div className="reader-view-controls" aria-label="Page layout">
      <button aria-pressed={p.viewMode === "single"} className="view-toggle" onClick={() => onPreferences({ viewMode: "single" })} type="button">Single</button>
      <button aria-pressed={p.viewMode === "continuous"} className="view-toggle" onClick={() => onPreferences({ viewMode: "continuous" })} type="button">Continuous</button>
    </div>
    <div className="reader-download-controls">
      <button className="button button--small" aria-label="Download original PDF" disabled={!ready} onClick={onDownload} type="button"><Icon name="download" />Download original</button>
      <details className="viewer-document-actions"><summary aria-label="More reader actions">More</summary><div><button onClick={onBackup} type="button">Back up project</button><a href={routeHref({ name: "projects" })}>Open another PDF</a></div></details>
    </div>
  </div>;
}
