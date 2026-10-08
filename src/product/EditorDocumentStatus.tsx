import type { LocalSavePhase } from "../persistence/localSaveTrust";
import { Icon } from "../components/Icon";

interface EditorDocumentStatusProps {
  name: string;
  page: number;
  totalPages: number;
  zoom: number;
  tool: string;
  selectedCount: number;
  pendingNativeEdits: number;
  localSaveLabel: string;
  localSavePhase: LocalSavePhase;
  originalPreview: boolean;
}

/** Displays real editor state only. No independent save/export state is maintained here. */
export function EditorDocumentStatus({
  name, page, totalPages, zoom, tool, selectedCount, pendingNativeEdits,
  localSaveLabel, localSavePhase, originalPreview
}: EditorDocumentStatusProps) {
  return <div aria-label="Document status bar" className="d10-document-status">
    <span className="d10-document-status__file" title={name}><Icon name="documents" size={14} /><strong>{name}</strong></span>
    <span className="d10-document-status__page">Page {page} of {totalPages}</span>
    <span className="d10-document-status__zoom">{Math.round(zoom * 100)}%</span>
    <span className="d10-document-status__tool">{originalPreview ? "Viewing original" : tool}</span>
    {selectedCount > 0 ? <span className="d10-document-status__selection">{selectedCount} selected</span> : null}
    {pendingNativeEdits > 0 ? <span className="d10-document-status__edits">{pendingNativeEdits} PDF edit{pendingNativeEdits === 1 ? "" : "s"} queued</span> : null}
    <span className="d10-document-status__save" data-save-phase={localSavePhase} title={localSaveLabel}>
      <span aria-hidden="true" className="d10-document-status__signal" />
      <span>{localSaveLabel}</span>
    </span>
  </div>;
}
