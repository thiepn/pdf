# Task-first product redesign

## Product decision
Replace the tab-by-tab application with three purpose-built surfaces: discover a task, complete a focused operation, and edit a document directly. This is a new interaction structure, not new paint on workspace tabs. Preserve the PDF engines, local data, password handling, transaction safety and export validation.

## Entry points
- Home supports tool-first and file-first entry. A PDF, PDF batch or image batch receives compatible actions. File handoff is one-use memory only and expires after ten minutes.
- The tool directory is searchable by intent, uses grouped cards and keeps specialist diagnostics behind a disclosure. No category tabs are required.
- Workspace tools have focused upload landing pages. Opening an editor explicitly saves a local project; quick tools do not.

## Focused tools
Upload -> preview/select/arrange -> relevant options -> download. Results replace the editing form. “Edit options” restores the previous inputs without downloading or choosing them again. “Continue with this PDF” chains the actual result into the next tool. Multi-file ordering supports drag, keyboard and touch buttons. Page selectors remain backed by actual rendered PDF pages.

## Document editor
One document identity, one direct toolbar, one page canvas. Remove document tabs, mode tabs, vertical tool rail and mobile mode navigation. Direct controls are Select, Text, Highlight, Draw, Image, Signature and Comment. More tools is a focus-managed dialog. Properties open when an object is selected. History and preservation disclosures remain available without occupying the default canvas. Download does not require creating another saved project.

## Visual system
New header, homepage, task cards, glyphs, upload areas, file cards, page workspace, settings panel, result screen, editor command bar and document actions dialog. Neutral page surfaces and a restrained violet action color, light/dark tokens, visible keyboard focus, responsive layouts, reduced-motion and forced-color support. Remove the old R5/R6 desktop/mobile presentation layers from the application entrypoint.

## Validation
- Existing engine/unit coverage stays enabled.
- Unit tests cover file classification, errors, size guard, handoff target, expiry, ordering and one-use semantics.
- Browser tests cover tool discovery, file-first selection, real downloaded PDFs, reordering, editor export, tab removal, keyboard dialogs, mobile overflow and screenshots.
- Existing everyday workflow regressions retain their real-engine assertions; returning from results now explicitly uses “Edit options”.

## Boundaries
The new front door and editor shell do not turn unsupported Office conversions into real conversions. Numeric-margin cropping is not visual crop editing. Complex specialist tool internals still need individual interaction redesigns. Existing-text edits remain limited to the formats supported by the engine. Quick tools launched from a saved project use its source PDF, not unexported overlay edits; this is disclosed at entry and in Document actions. Local persistence can still be unavailable under browser storage restrictions; quick tools avoid that dependency.

## Release
Work on `redesign/task-first-experience`, layered on the everyday-workflows correction branch. Do not merge or deploy before browser evidence has been reviewed. Final verification details belong in the pull request, not this specification.
