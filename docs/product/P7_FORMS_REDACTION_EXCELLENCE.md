# P7 — Forms & Redaction Excellence

## Objective

Make PDF Studio useful for two document tasks that currently require too much manual work:

1. turn supported blank areas into real interactive PDF form fields;
2. find likely sensitive content, review it, mark it, and remove it permanently with proof.

P7 builds on the existing Protect/Secure writer and validation pipeline. It does not add a parallel PDF engine.

## Forms

### Existing forms

Existing AcroForm fields remain supported exactly as before: text, checkbox/radio, combo/list, read-only inspection, value preview, and verified persistence. PDF JavaScript is never executed to make a form appear functional.

### New interactive fields

P7 safely authors text fields and checkboxes. New fields can be added manually or accepted from document suggestions.

The creation UI exposes label, unique PDF field name, page, X/Y position, width/height, text default value, multiline, and required state. The writer refuses duplicate or empty names instead of silently renaming fields.

Radio-group creation, choice-field creation, signature-field creation, calculated fields, JavaScript actions, and arbitrary inherited AcroForm structures remain outside the P7 authoring boundary. Existing instances can still be filled or inspected where already supported.

### Detection

Field detection is local and suggestion-only. It looks for bounded, explainable cues such as common short labels, short labels ending in a colon, blank underline/dotted write-in lines, and empty checkbox glyphs. High-confidence suggestions start selected, but the user must review and explicitly add them.

## Automatic redaction discovery

P7 can scan selectable PDF text locally for literal text, regular expressions, email addresses, phone-number-like text, IBANs, and payment-card candidates.

IBAN candidates must pass MOD-97 validation. Payment-card candidates must pass Luhn validation. Regex input is bounded and rejects backreferences and a nested-repetition pattern unsuitable for interactive scanning.

Automatic matching never removes content. It produces reviewable candidate regions. Accepted candidates become ordinary PDF Studio redaction marks in the existing editor state.

## Permanent removal

The existing Secure export remains authoritative:

1. reviewed marks are written as actual PDF redaction annotations;
2. MuPDF applies the redactions;
3. output is rewritten;
4. the result is reopened;
5. redaction annotations must be consumed;
6. text fragments detected beneath marked regions must be absent from output extraction;
7. any failed mandatory check blocks release.

A visible rectangle alone is never reported as a completed redaction.

## Persistence and privacy

Detection is browser-local. Search terms, candidate text, and form suggestions are not sent to a network service. Accepted redaction marks reuse the existing editor object schema. New form drafts remain ephemeral until output creation. Database schema remains 13 and project package format remains 9.

## Acceptance

P7 is complete when:

1. existing forms can still be filled and verified;
2. a new text field can be authored and reopened as an interactive field;
3. a new checkbox can be authored and reopened as an interactive field;
4. duplicate field names fail closed;
5. form detection is review-only and bounded;
6. literal/regex/sensitive-data discovery is review-only and bounded;
7. IBAN and payment-card false positives are reduced through validity checks;
8. accepted automatic candidates use the canonical redaction-object pipeline;
9. permanent export proves marked text removal and blocks on failure;
10. no persistent schema/package version changes are introduced;
11. typecheck, production build, release-freeze, performance and browser regression remain qualified.

Physical/human form interoperability testing remains deferred to the later qualification phase.
