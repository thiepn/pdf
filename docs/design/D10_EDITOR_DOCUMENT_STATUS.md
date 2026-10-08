# D10 — Real editor document status and visual cohesion

Status: implementation branch; **NOT RELEASE QUALIFIED**.

## Scope
- Continue the D1–D9 stacked redesign by displaying the actual document name, page, zoom, selected tool, number of selected items, pending native PDF edits and local autosave status in a restrained editor footer.
- Replace the misleading static commandbar heading (“Edit your PDF”) with the real project name.
- Use a flex column for the integrated editor, so conditional notices, command rows, canvas, new status strip and D6 mobile dock have explicit space rather than implicit CSS-grid row placement. The canvas remains the flexible scroll container.
- On narrow screens, preserve page context and local save status without competing with the D6 bottom dock. Hide this strip when the software keyboard is open.
- Preserve all edit/export APIs, document pixels, local-storage semantics, warnings, focus/dialog behavior and PDF fidelity checks. The status bar is **read-only** and mirrors state already owned by EditorPage.

## Live acceptance criteria
1. Open a real PDF; verify the editor displays the imported filename and actual page count.
2. Changing pages, zoom, or active tool changes the contextual labels; no mock data or independently cached status is permitted.
3. Desktop 1440x900 and mobile 390x844/320x700 must have no horizontal overflow or hidden canvas/dock.
4. A failed local autosave must remain visible; a saved-local label must never be interpreted as proof that a downloadable PDF was exported.
5. Screen readers retain existing local-save announcements without duplicative live regions.
6. D9 and D8 refusal gates remain unchanged; native fidelity, physical-device and cross-browser evidence remains pending.

## Validation
- Added Playwright scenario: `tests/e2e/d10-editor-status.spec.mjs`.
- Run `npm run typecheck && npx playwright test tests/e2e/d10-editor-status.spec.mjs` in a dependency-complete checkout.
- Run the D9 audit and full D8 evidence gate independently; a successful UI check never overrides D8's release decision.

Release remains **NOT QUALIFIED** until D8's independent real-device, browser, visual screenshot and PDF export evidence are accepted. Do not merge or deploy the stacked redesign solely because this UI addition compiles.
