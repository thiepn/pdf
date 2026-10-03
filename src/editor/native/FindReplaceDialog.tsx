import { useMemo, useRef, useState } from "react";
import { useModalFocus } from "../../accessibility/modalFocus";
import type { NativeEdit, NativeInspection } from "../../types/nativeEditor";
import { planNativeFindReplace } from "./nativeFindReplace";

interface Props {
  inspection: NativeInspection | null;
  queuedEdits: NativeEdit[];
  open: boolean;
  onClose: () => void;
  onApply: (edits: NativeEdit[], occurrenceCount: number) => void;
}

function previewText(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  return compact.length > 96 ? `${compact.slice(0, 93)}…` : compact || "Empty text block";
}

export function FindReplaceDialog({ inspection, queuedEdits, open, onClose, onApply }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const queryRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  useModalFocus(open, dialogRef, onClose, queryRef);

  const plan = useMemo(
    () => planNativeFindReplace(inspection, queuedEdits, query, replacement, { caseSensitive, wholeWord }),
    [caseSensitive, inspection, query, queuedEdits, replacement, wholeWord]
  );
  if (!open) return null;

  const visibleMatches = plan.matches.slice(0, 12);
  const hiddenMatches = Math.max(0, plan.matches.length - visibleMatches.length);

  function apply(): void {
    if (!plan.edits.length) return;
    onApply(plan.edits, plan.replaceableOccurrences);
    onClose();
  }

  return <div className="product-modal-backdrop find-replace-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div aria-describedby="find-replace-description" aria-labelledby="find-replace-title" aria-modal="true" className="product-modal find-replace-dialog" ref={dialogRef} role="dialog">
      <header className="find-replace-header">
        <div><p className="eyebrow">Existing PDF text</p><h2 id="find-replace-title">Find & replace</h2></div>
        <button aria-label="Close find and replace" className="icon-button" onClick={onClose} type="button">×</button>
      </header>
      <p className="find-replace-description" id="find-replace-description">Search detected text across the document. PDF Studio preflights every match and queues only replacements that fit the qualified existing-text reconstruction path.</p>

      <div className="find-replace-fields">
        <label><span>Find</span><input ref={queryRef} autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="Text to find" type="search" value={query} /></label>
        <label><span>Replace with</span><input autoComplete="off" onChange={(event) => setReplacement(event.target.value)} placeholder="Leave empty to remove matching text" type="text" value={replacement} /></label>
      </div>

      <div className="find-replace-options">
        <label><input checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} type="checkbox" />Match case</label>
        <label><input checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} type="checkbox" />Whole words only</label>
      </div>

      {!query ? <div className="find-replace-empty"><strong>Enter text to search this PDF.</strong><span>Matches are found inside detected text blocks. Phrases split between separate PDF objects are not joined automatically.</span></div> :
        <div className="find-replace-summary" role="status" aria-live="polite">
          <strong>{plan.totalOccurrences ? `${plan.totalOccurrences} match${plan.totalOccurrences === 1 ? "" : "es"} found` : "No matches found"}</strong>
          {plan.totalOccurrences ? <span>{plan.replaceableOccurrences} safe to replace{plan.blockedOccurrences ? ` · ${plan.blockedOccurrences} left unchanged` : ""}</span> : <span>Try different wording or matching options.</span>}
        </div>}

      {visibleMatches.length ? <div className="find-replace-results" aria-label="Find and replace matches">
        {visibleMatches.map((match) => <article className={match.status === "blocked" ? "find-replace-match is-blocked" : "find-replace-match"} key={match.objectId}>
          <div><strong>Page {match.pageNumber}</strong><span>{match.occurrences} match{match.occurrences === 1 ? "" : "es"}</span></div>
          <p>{previewText(match.sourceText)}</p>
          {match.status === "blocked" ? <small>{match.reason}</small> : <small>Ready for safe fixed-box reconstruction.</small>}
        </article>)}
        {hiddenMatches ? <p className="find-replace-more">+ {hiddenMatches} more matched text block{hiddenMatches === 1 ? "" : "s"}</p> : null}
      </div> : null}

      {plan.blockedOccurrences ? <div className="find-replace-warning"><strong>Some matches need manual review.</strong><span>Blocked matches are never modified. Open those text blocks individually if you want to use layout-aware reflow, choose a different font, or handle unsupported shaping.</span></div> : null}

      <footer className="find-replace-actions">
        <button className="button button--secondary" onClick={onClose} type="button">Cancel</button>
        <button className="button" disabled={!plan.edits.length} onClick={apply} type="button">{plan.replaceableOccurrences ? `Replace ${plan.replaceableOccurrences} safe match${plan.replaceableOccurrences === 1 ? "" : "es"}` : "Nothing safe to replace"}</button>
      </footer>
    </div>
  </div>;
}
