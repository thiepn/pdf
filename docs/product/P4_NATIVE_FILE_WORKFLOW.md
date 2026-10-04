# P4 — Native File Workflow

## Objective

Make PDF Studio behave like a trustworthy desktop document tool when the browser exposes native file-system capabilities, without weakening the browser-local or immutable-source safety model.

P4 is a progressive enhancement. Browsers without the File System Access API keep the existing file-input and download workflows.

## Product contract

### Open

- Home keeps the existing drag/drop and file-input entry paths.
- Supported browsers also expose **Open PDF** through the native file picker.
- A PDF opened this way keeps its `FileSystemFileHandle` in local IndexedDB for the resulting project.
- File handles never enter URLs, project packages, analytics, diagnostics, or network requests.

### Save

- **Save** writes to a previously chosen output file.
- If no output target exists yet, Save becomes **Save as** and asks the user for a destination.
- Save never silently overwrites the file the project was originally opened from.
- If native save is unavailable, PDF Studio downloads a copy exactly as before.

### Save as

- **Save as** always opens the native save picker when supported.
- The selected output handle is remembered locally for later Save operations.
- A user can still choose **Download copy** at any time.

### Replace original

- Replacing the source file is separate from Save.
- It is only offered when the project was opened with a retained source handle.
- It requires an explicit confirmation and write permission.
- The existing validated export pipeline runs before any external file is written.
- Before reusing a linked output or replacing the source, PDF Studio checks stored size/modified metadata and refuses to overwrite when the file changed externally.

### External project backup

- A user may choose a folder for a project’s durable `.lpsproject` backup.
- The directory handle is stored locally and can be reused while permission remains available.
- Manual **Back up now** may request permission from a user gesture.
- Successful PDF saves opportunistically refresh the external backup only when the browser already grants folder write access; background work never triggers a surprise permission prompt.
- Local browser project storage remains authoritative for editable state. External backup is recovery protection, not a second live editing database.

## Safety boundaries

- Original PDF bytes inside the PDF Studio project remain immutable.
- Native file writes happen only after the existing export/reopen validation succeeds.
- Native source replacement is never the default action.
- No absolute local path is exposed or persisted; only opaque browser file/directory handles are stored.
- Deleting a local project also deletes its stored native file bindings.
- Downloads remain the universal fallback.

## Acceptance

P4 is complete when:

1. supported Chromium-class browsers can Open → edit → Save as → Save without a download round-trip;
2. source replacement requires a separate explicit action;
3. unsupported browsers retain existing file-input/download behavior;
4. native handles persist through IndexedDB without entering project packages;
5. external project backup can be configured and refreshed;
6. Saved Documents shows linked-file / external-backup state;
7. native writes use the same verified output bytes as normal editor export;
8. externally modified linked files are not silently overwritten;
9. project deletion removes retained file and directory handles;
10. unit/source tests cover feature detection, safe filenames, non-overwrite defaults, permission ordering, and P4 wiring.
