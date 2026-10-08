# D11 — Visual consistency and design-system consolidation

**Status:** implemented on a stacked draft branch, not merged or release qualified.

## Source audit

The D1–D10 real-app redesign already replaces the landing hero with file-first work, exposes a searchable task directory, uses a live PDF editor, adds a quick-tool workbench, and provides mobile controls. The remaining style debt is cross-surface duplication:

- `foundation.css` uses legacy 10–15 px control/card radii; D1, D2, D3, D5 and D7 each reset to slightly different 5–10 px values.
- Home and Tool Library had different title sizes, widths, card text scales, and icon treatments despite representing the same tasks.
- Category icon colors were literal light-theme foreground/background pairs. Dark mode inherited pale color blocks instead of using appropriately toned dark surfaces.
- The global header consumed 82 px vertically even though the new D1–D10 workspaces are intentionally dense.
- The original large `src/styles.css` contains canvas geometry and older CSS; deleting or mass-overriding it without screenshot and fidelity evidence is unsafe.

## New ownership contract

| File | Single responsibility |
|---|---|
| `foundation.css` | Existing semantic theme, base elements, and task glyph color consumers |
| `studio-tokens-d11.css` | Shared studio widths, typography, radii, focus, document shadow, light/dark category palettes |
| `studio-workspace-d1.css` | Home layout only |
| `studio-discovery-d2.css` | Tool Library layout only |
| `studio-editor-d3-live.css` through `studio-editor-d10-status.css` | Specialized editor/quick-tool layout and behavior-specific states |
| `studio-chrome-d11.css` | Common app header/footer, card presentation, focus and forced-colors semantics |
| `product.css` | Explicit, ordered imports only |

Tokens load immediately after `foundation.css`; the chrome file loads after D10 to normalize shared presentation. Existing functionality and PDF processing are unmodified. Future visual changes should modify shared design values, not append new surface-specific literal sizes to every D stylesheet.

## Acceptance

1. Home and Tool Library use identical base card radii, font sizes, border colors and restrained hover behavior.
2. Header height is compact on desktop and mobile without replacing existing accessible controls/navigation.
3. Category icon foreground/background pairs adapt to explicit dark themes and dark system preferences. High-contrast mode retains clear icon boundaries.
4. Editor, quick-tool file intake, sidebar layers and save-status designs resolve radii, typography and document shadows through common tokens.
5. Browser checks exercise actual Home, Tool Library, Quick Tool and opened-PDF Editor surfaces in desktop/mobile light/dark contexts, with screenshots.
6. Real PDF source/export and editing workflows remain unchanged. Existing D8 evidence gate, D9 audit, P17 fidelity, P18 devices and browsers remain authoritative.

## Review commands

```sh
npm run typecheck
npx vitest run tests/unit/studioDesignD11.test.ts
npx playwright test tests/e2e/d11-visual-consistency.spec.mjs --project=chromium --project=firefox --project=webkit
python scripts/design/d9_live_mount_audit.py --repo .
python scripts/design/d8_live_gate.py --evidence docs/design/D8_RELEASE_EVIDENCE.template.json
```

Automated checks do not replace pixel-level review or independent reopening of exported PDFs. **NOT RELEASE QUALIFIED** until the real complete D8/P17/P18 evidence is approved.
