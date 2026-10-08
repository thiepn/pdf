# D9 — Live integration status and release boundary

The correctly linked GitHub account for `thiepn/pdf` is **thiepn** (write/admin); `greeksage` is read-only. Both links are legitimate. Operations must specify the thiepn connection.

## Incremental real-runtime integration

| Phase | Real code path | Draft review |
|---|---|---|
| D1 | File-first Home workspace | [#125](https://github.com/thiepn/pdf/pull/125) |
| D2 | Searchable, compact task catalog | [#126](https://github.com/thiepn/pdf/pull/126) |
| D3 | Scoped styling on actual `EditorPage`; real canvas/edit/export intact | [#130](https://github.com/thiepn/pdf/pull/130) |
| D4 | Actual layer visibility and lock through transactional editor history | [#131](https://github.com/thiepn/pdf/pull/131) |
| D5 | Workflow stages wired to real file inputs, quick processor and download | [#133](https://github.com/thiepn/pdf/pull/133) |
| D6 | Mobile Pages/Layers/Properties navigation tied to real editor state | [#134](https://github.com/thiepn/pdf/pull/134) |
| D7 | Live keyboard help and modal guard using existing focus utility | [#135](https://github.com/thiepn/pdf/pull/135) |
| D8 | Fail-closed 18-item production evidence inventory | [#136](https://github.com/thiepn/pdf/pull/136) |
| D9 | Actual code integration presence audit, never release permission | This stacked PR |

The old D3–D9 ZIP packages were prototypes, not production integrations. The real changes above replace that gap **incrementally**, preserving the current writer, native edits, output trust and recovery behavior.

## Qualification status

**NOT QUALIFIED for release.** The D9 audit verifies that expected real source mounts exist; it is not a functional or security certification. Some dedicated browsers and broader CI workflows may still be queued or in progress. The full D8 evidence template starts with all requirements pending.

Prior to production promotion, review all draft branches and change sets, inspect screenshots on light/dark mobile and tablet, confirm cross-browser input-edit-download with independent PDF reopening, verify export fidelity, real devices and assistive technologies, pass P17 native-fidelity and P18 reader/device policies, resolve any CI failures, then explicitly approve merge and deploy. Never promote prototype screenshots or structural markers as proof of those outcomes.

## Running the local checks

```sh
python -m unittest discover -s tests -p d9_live_mount_test.py -v
python scripts/design/d9_live_mount_audit.py --repo .
python -m unittest discover -s tests -p d8_live_gate_test.py -v
python scripts/design/d8_live_gate.py --evidence docs/design/D8_RELEASE_EVIDENCE.template.json
```

The final D8 command reports `NOT_QUALIFIED` and does not grant deployment approval. The release gate only becomes reviewable after a clean, pinned live checkout and independently reviewed evidence for all 18 controls.
