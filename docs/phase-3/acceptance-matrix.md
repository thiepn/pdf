# Phase 3 Acceptance Matrix

| Area | Requirement | Current status |
|---|---|---|
| Routing | Editor opens from viewer and projects | Passed by source/runtime audit |
| Object model | All supported objects serialize with stable IDs | Passed |
| State | Editor state migrates and autosaves locally | Passed by source audit |
| Assets | Image bytes persist separately and survive backup | Passed by runtime package test |
| Text | Create and configure standard-font FreeText objects | Implemented; reader corpus pending |
| Images | Import, preview, resize, persist, and export | Implemented; appearance corpus pending |
| Shapes | Rectangle, ellipse, line, and arrow | Implemented; external-reader audit pending |
| Ink | Freehand strokes and highlighter property | Implemented; pressure rendering deferred |
| Markup | Highlight, underline, strikeout, squiggly | Implemented; text-selection-driven markup deferred |
| Comments | Note annotations with subject, author, resolved state | Implemented; threaded replies deferred |
| Links | URL, email, and page destinations | Implemented; browser regression pending |
| Stamps | Editable text stamp | Implemented |
| Transform | Move and four-corner resize | Passed by source/runtime audit |
| Rotation | Preview and export | Partial: preview only; export warning |
| Selection | Single, additive, grouped, and multi-selection | Implemented |
| Arrange | Align, distribute, group, lock, hide, z-order | Implemented |
| History | Undo/redo and rapid-edit merging | Passed by runtime/unit source audit |
| Clipboard | Internal/system text clipboard | Implemented; external image assets constrained |
| Export | MuPDF annotations, links, image appearances | Implemented |
| Validation | Reopen, page count, annotation/link delta | Implemented |
| Security | Password not persisted; encryption kept | Implemented; encrypted corpus pending |
| Backup | Package v2 includes state and binary assets | Passed by runtime test |
| Responsive | Tablet and phone CSS layouts | Implemented; device testing pending |
| Performance | Medium/large editor projects | Not yet passed |
| Browsers | Chromium, Firefox, WebKit | CI/browser execution pending |
| External readers | Adobe Reader, PDF24, browser viewers | Pending |

## Phase 3 exit decision

The engineering core is implemented, but the full phase remains **beta** until real dependency installation, browser automation, and external-reader corpus validation pass.
