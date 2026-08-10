# Phase 20 — Productization & Final Hardening

Phase 20 stops expanding the PDF feature matrix and productizes the Phase 16–19 foundation.

## Product architecture

The application shell now prioritizes six destinations: Home, Documents, Tools, Activity, Settings, and Help. Engineering/recovery destinations remain reachable as utility links without competing with ordinary use.

Inside a document, the primary rail is task-oriented: Read, Edit, Pages, Convert & utilities, Optimize, Protect, OCR, Accessibility & standards, and Print & advanced. Inspect, Repair, and Preservation remain available in the All-tools technical strip.

## Adaptive rendering

The viewer derives an effective rendering policy from the selected setting, page count, source size, logical processors, optional browser memory signal, and viewport density. Page and thumbnail renders share a bounded scheduler. Large documents automatically cap scale/concurrency and evict distant canvases more aggressively.

## Recovery

A minimal local heartbeat stores only project ID, workspace mode, timestamps, and clean/unclean state. If the previous UI session ended abruptly, the workspace explains the recovery condition while Phase 16 reconciles any interrupted document transactions before write ownership proceeds.

## Desktop boundary

`desktopBridge.ts` defines a versioned optional host contract. Browser mode remains the canonical implementation. A future Tauri/native host can provide native save, print, certificate-store, scanner, or shell functionality without leaking those assumptions into the PDF core.
