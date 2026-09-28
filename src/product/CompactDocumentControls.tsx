import { createContext, useContext, useSyncExternalStore, type MouseEvent } from "react";
import { Icon } from "../components/Icon";
import { routeHref } from "../core/appRouter";

// Phones in either orientation get the same single-row document controls.
export const COMPACT_DOCUMENT_QUERY = "(max-width: 680px), (max-width: 1100px) and (max-height: 520px)";
function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(COMPACT_DOCUMENT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function snapshot(): boolean { return window.matchMedia(COMPACT_DOCUMENT_QUERY).matches; }
export function useCompactDocumentControls(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

interface DocumentControls {
  title: string;
  summary: string;
  busy: boolean;
  onHomeClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  openActions: () => void;
  openHistory: () => void;
}
export const DocumentControlsContext = createContext<DocumentControls | null>(null);
export function useDocumentControls(): DocumentControls | null { return useContext<DocumentControls | null>(DocumentControlsContext); }

export function CompactDocumentHome() {
  const document = useDocumentControls();
  return <a className="icon-button" href={routeHref({ name: "home" })} aria-label="Back to PDF tools" title="Back to PDF tools" aria-disabled={document?.busy} onClick={document?.onHomeClick}><Icon name="arrow-left" size={20} /></a>;
}

/** The shared workspace remains responsible for operation and ownership guards. */
export function CompactDocumentActions({ onChoose }: { onChoose: () => void }) {
  const document = useDocumentControls();
  if (!document) return null;
  return <div className="compact-document-actions">
    <button disabled={document.busy} onClick={() => { onChoose(); document.openActions(); }} type="button"><Icon name="tools" />Document actions</button>
    <button disabled={document.busy} onClick={() => { onChoose(); document.openHistory(); }} type="button"><Icon name="undo" />History and checkpoints</button>
  </div>;
}
