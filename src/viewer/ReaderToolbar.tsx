import { useCallback, useEffect, useRef, useState } from "react";
import { useModalFocus } from "../accessibility/modalFocus";
import { CompactDocumentActions, CompactDocumentHome, useCompactDocumentControls, useDocumentControls } from "../product/CompactDocumentControls";
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

/** A single row on phones; secondary controls are disclosed, never squeezed. */
export function ReaderToolbar({ preferences: p, pageCount, ready, onPreferences, onPage, onFit, onFind, onDownload, onBackup }: Props) {
  const compact = useCompactDocumentControls();
  const document = useDocumentControls();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useModalFocus(compact && menuOpen, menuRef, closeMenu, undefined, triggerRef);
  useEffect(() => { if (!compact) setMenuOpen(false); }, [compact]);
  const choose = (action: () => void) => { closeMenu(); action(); };
  const zooms = [...new Set([...Array.from({ length: 16 }, (_, index) => (index + 1) / 4), p.zoom])].sort((a, b) => a - b);
  if (compact) return <>
    <div className="viewer-commandbar reader-commandbar compact-document-bar" aria-label="Reading controls">
      <CompactDocumentHome />
      <button className="icon-button" aria-label="Previous page" title="Previous page" disabled={!ready || p.pageNumber <= 1} onClick={() => onPage(p.pageNumber - 1)} type="button"><Icon name="chevron-left" /></button>
      <ReaderPageInput page={p.pageNumber} total={pageCount} disabled={!ready} onChange={onPage} />
      <button className="icon-button" aria-label="Next page" title="Next page" disabled={!ready || p.pageNumber >= pageCount} onClick={() => onPage(p.pageNumber + 1)} type="button"><Icon name="chevron-right" /></button>
      <button className="icon-button compact-download" aria-label="Download original PDF" title="Download original PDF" disabled={!ready} onClick={onDownload} type="button"><Icon name="download" size={20} /></button>
      <button className="icon-button" aria-label="More reader actions" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="reader-options-dialog" title="Reading options" ref={triggerRef} onClick={() => setMenuOpen(true)} type="button"><Icon name="more" size={20} /></button>
    </div>
    {menuOpen ? <div className="product-modal-backdrop compact-options-backdrop" onClick={closeMenu} role="presentation">
      <section className="product-modal compact-options" id="reader-options-dialog" aria-label="Reading options" aria-modal="true" role="dialog" ref={menuRef} onClick={event => event.stopPropagation()}>
        <header><div><h2>Reading options</h2><p className="compact-document-name" title={document?.title}>{document?.title ?? "PDF"}</p><small>{document?.summary}</small></div><button className="icon-button" aria-label="Close reading options" onClick={closeMenu} type="button"><Icon name="close" /></button></header>
        <div className="compact-options-row">
          <button className="viewer-mobile-panel-toggle" aria-expanded={p.sidebarOpen} aria-controls="viewer-sidebar" onClick={() => choose(() => onPreferences({ sidebarOpen: !p.sidebarOpen }))} type="button"><Icon name="pages" />{p.sidebarOpen ? "Close panel" : "Pages / search"}</button>
          <button aria-label="Find text" disabled={!ready} onClick={() => choose(onFind)} type="button"><Icon name="inspect" />Find text</button>
        </div>
        <section><h3>Zoom & fit</h3><div className="compact-options-row">
          <button className="icon-button" aria-label="Zoom out" disabled={!ready || p.zoom <= 0.01} onClick={() => onPreferences({ zoom: Math.max(0.01, p.zoom - 0.25) })} type="button"><Icon name="minus" /></button>
          <select aria-label="Zoom" disabled={!ready} value={p.zoom} onChange={event => onPreferences({ zoom: Number(event.target.value) })}>{zooms.map(zoom => <option key={zoom} value={zoom}>{Math.round(zoom * 100)}%</option>)}</select>
          <button className="icon-button" aria-label="Zoom in" disabled={!ready || p.zoom >= 4} onClick={() => onPreferences({ zoom: Math.min(4, p.zoom + 0.25) })} type="button"><Icon name="plus" /></button>
        </div><div className="compact-options-row"><button disabled={!ready} onClick={() => choose(() => onFit("width"))} type="button">Fit width</button><button disabled={!ready} onClick={() => choose(() => onFit("page"))} type="button">Fit page</button></div></section>
        <section><h3>Page layout</h3><div className="compact-options-row"><button aria-pressed={p.viewMode === "single"} onClick={() => choose(() => onPreferences({ viewMode: "single" }))} type="button">Single</button><button aria-pressed={p.viewMode === "continuous"} onClick={() => choose(() => onPreferences({ viewMode: "continuous" }))} type="button">Continuous</button></div></section>
        <CompactDocumentActions onChoose={closeMenu} />
        <button onClick={() => choose(onBackup)} type="button"><Icon name="save" />Back up project</button>
      </section>
    </div> : null}
  </>;
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
