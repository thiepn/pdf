# P42 — Advanced Tools Progressive Disclosure

## Goal

Finish the task-discovery side of the consumer UX cleanup. PDF Studio should show common PDF jobs first and keep advanced, specialist, and recovery workflows available without presenting them as equal-weight default choices.

## Scope

- Global **All PDF tools** browser
- Current-document **Tools** browser
- Advanced/specialist disclosure styling
- Search behavior for advanced and recovery tasks
- Related multi-document workflows in the current-document browser

## Default contract

- Everyday tasks remain visible in their normal categories.
- Advanced and specialist tasks are grouped behind one explicit **Advanced & specialist tools** disclosure.
- Recovery tasks such as Repair and Document technical details remain search-driven rather than appearing in the normal catalog.
- Search is not artificially restricted: advanced and recovery tasks can appear immediately when the query matches them.
- Direct task routes and capability preflight continue to work regardless of whether the task is hidden from the default catalog.
- The current-document **Related workflows** section contains everyday multi-document workflows only; Batch automation no longer reappears there by default.

## Product boundary

P42 changes discovery and presentation only. It does not change task IDs, task routes, capability evaluation, file opening, PDF processing, persistence, worker routing, output generation, or task availability rules.

## Qualification

- Unit regression verifies the audience/disclosure contract.
- Browser regression verifies closed-by-default advanced sections, explicit reveal, advanced/recovery search, and the current-document boundary.
- Full PDF Studio CI, Consumer performance budget, and R10 operational readiness must pass on the final head before merge.
