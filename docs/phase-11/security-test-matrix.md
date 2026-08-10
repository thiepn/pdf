# Phase 11 Security Test Matrix

| Threat | Automated corpus | Browser gate | Manual/external gate |
|---|---|---|---|
| Visible redaction only | Permanent redaction fixture verifies marker absence | Secure-workflow export test required | Remove overlay in external editors |
| Incremental revision recovery | Incremental fixture generated | Full-clean-save regression required | Raw-object and revision inspection |
| Metadata leakage | Sensitive title removed in redacted fixture | Sanitization output check required | External metadata viewers |
| Password persistence | Encrypted browser test inspects local/session storage | Chromium/Firefox/WebKit | Browser profile and support-bundle inspection |
| Malformed PDF crash | Truncated fixture rejected by two readers | Viewer failure isolation required | Mobile and external-reader behavior |
| Active content | Existing security inspector and sanitizer | Corpus fixture expansion required | Adobe Reader/PDF24 warnings |
| Oversized input | 200-page fixture | 1,000-page and large-image test required | Mobile memory and thermal testing |
| Project archive corruption | Version 5 checksum rejection | Browser import regression | Modified ZIP and path traversal attempts |

A stable release requires the browser and manual columns to be completed, not only the automated corpus column.
