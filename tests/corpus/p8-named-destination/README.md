# P8 named destination remapping — controlled QA corpus

These PDFs were generated solely for the current P8 qualification. They are not prior certification fixtures.

The starting document is the project's checked-in `tests/corpus/generated/plain-text.pdf`. pypdf cloned its three pages and replaced the first-page link with a `/GoTo` named destination, with a document-level Names tree. The target's PDF object identity is allowed to change; its logical page and view may not change without authorization.

- `source.pdf`: named destination `P8_QA_ANCHOR` resolves to page 2 (`/FitH`, coordinate 842).
- `retarget.pdf`: the **same** link annotation and name resolve to page 3. This is unauthorized retargeting.
- `alias.pdf`: the link uses name `P8_QA_ALIAS`, which still resolves to page 2 with the same view. This is a valid renaming.

The fixtures do not certify arbitrary remote GoTo actions or PDF JavaScript; the corresponding chained-action regression tests use controlled transient PDFs constructed with MuPDF.

SHA-256:
- `source.pdf`: `7d60e60a6386e7e552691893ca8d50ded342a39005c004372e16594f86a5dd17`
- `retarget.pdf`: `1e59cabeb96d1bb93ecf9c2f52a99f52bb24c36b300189cd7be996e5b1221b53`
- `alias.pdf`: `46f0ac7a0a40aff06eb45a259ee1b860c165a62b7ba323baa46755991d997336`
