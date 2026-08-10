# Phase 14 — Native Content Editor

Phase 14 moves beyond annotation-only editing. The application identifies existing page objects and applies explicit, validated mutations to selected regions.

## Safety model

Every detected object has an editability classification. Unsupported or complex-script content is never silently rewritten. Latin text can use static redact-and-replace. CJK and complex scripts currently use a visible editable FreeText fallback until an embedded-font shaping bridge is validated.

## Main modules

- `src/native/nativeModel.ts`
- `src/native/nativeRepository.ts`
- `src/native/nativeClient.ts`
- `src/workers/native-editor.worker.ts`
- `src/views/NativeEditorPage.tsx`
