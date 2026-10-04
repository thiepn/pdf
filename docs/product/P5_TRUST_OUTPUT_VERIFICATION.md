# P5 — Trust & Output Verification

## Objective

Make successful PDF operations visibly trustworthy. A completed action must explain what was actually verified on the produced artifact, what intentionally changed, what structure was preserved or changed, and which consequences require review.

P5 is not a generic success-message redesign. It establishes one verification contract shared by everyday tools and document workspaces.

## Verification contract

A result may say **Verified** only after PDF Studio inspects the produced bytes. The UI must distinguish:

- facts measured from the output;
- checks that passed;
- intentional changes;
- warnings or structures that could not be proven;
- lossy/destructive consequences.

No result may infer preservation solely from the input or from the absence of an exception.

## Core evidence

For PDF outputs P5 records and displays, where applicable:

- output count and byte size;
- source → output page counts;
- successful reopen of every output PDF;
- searchable-text coverage on representative pages (all pages for small PDFs);
- sampled link/annotation/widget counts;
- document-level form-field counts;
- attachment counts when present;
- password-protection state when relevant;
- task-specific warnings;
- explicit signature invalidation guidance when PDF bytes changed.

Large documents use a bounded representative sample for expensive text/annotation inspection. The UI says when evidence is sampled and never presents sampled evidence as a full-document proof.

## Consequence model

P5 explicitly calls out operations that are intentionally lossy or destructive, including:

- raster/image-based compression;
- PDF → image, Word, or text conversion;
- flattening;
- sanitization;
- metadata removal;
- repair limitations.

Page-selection operations are described as intentional scope changes rather than generic failures.

## Safety rules

- Existing hard validation remains authoritative: invalid outputs are blocked rather than decorated with a warning.
- P5 does not change project/database/package schemas.
- No verification report contains document contents or is sent over a network.
- Verification evidence is ephemeral UI state in P5; download-history persistence remains unchanged.
- Human/physical-device testing stays deferred to the later qualification phase.

## Acceptance

P5 is complete when:

1. everyday Quick Tools show a shared post-operation verification panel;
2. PDF results prove reopen success and show page/size/searchability evidence;
3. link/form preservation or change is surfaced instead of silently assumed;
4. lossy operations show explicit consequence language;
5. editor, page organizer, and OCR outputs use the same trust vocabulary;
6. sampled checks are labeled honestly;
7. blocking validation failures still prevent publication;
8. no frozen persistent schema changes are introduced;
9. source/unit tests cover verification semantics and P5 wiring;
10. typecheck, production build, release-freeze, performance, and browser regression remain qualified.
