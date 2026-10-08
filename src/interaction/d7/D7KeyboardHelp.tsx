import { useRef, type RefObject } from "react";
import { useModalFocus } from "../../accessibility/modalFocus";

interface Props {
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

const shortcuts = [
  { keys: "V", description: "Select objects" },
  { keys: "T", description: "Add text" },
  { keys: "H", description: "Pan the document" },
  { keys: "K", description: "Highlight" },
  { keys: "P", description: "Draw" },
  { keys: "Ctrl/Cmd + Z", description: "Undo last document change" },
  { keys: "Ctrl/Cmd + Shift + Z", description: "Redo" },
  { keys: "Ctrl/Cmd + S", description: "Save or download the PDF" },
  { keys: "Arrow keys", description: "Move selected objects" },
  { keys: "Shift + Arrow keys", description: "Move selected objects farther" },
  { keys: "Escape", description: "Close the dialog or clear selection" }
];

export function D7KeyboardHelp({ open, onClose, returnFocusRef }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, dialogRef, onClose, undefined, returnFocusRef);
  if (!open) return null;
  return <div className="product-modal-backdrop d7-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div aria-labelledby="d7-shortcut-title" aria-describedby="d7-shortcut-description" aria-modal="true" className="product-modal d7-shortcut-dialog" ref={dialogRef} role="dialog">
      <header>
        <div><h2 id="d7-shortcut-title">Keyboard shortcuts</h2><p id="d7-shortcut-description">Keys apply to the document, not while editing text or using a dialog.</p></div>
        <button aria-label="Close keyboard shortcuts" onClick={onClose} type="button">Close</button>
      </header>
      <dl>{shortcuts.map((item) => <div key={item.keys}><dt><kbd>{item.keys}</kbd></dt><dd>{item.description}</dd></div>)}</dl>
    </div>
  </div>;
}
