import { cjkLanguageForScript, detectScript } from "../../native/nativeModel";
import { findNativeReflowQueueConflict } from "../../native/nativeEditQueue";
import { evaluateStyledTextFit, evaluateTextFit, fitsWithinSourceBaseline } from "../../native/textFit";
import { buildPreservedEditRuns, editableFamilyForSource } from "../../native/textStyle";
import { firstUnencodableWinAnsiCharacter } from "../../native/textEncoding";
import { nativeTextSourceRects } from "../../native/textSourceGeometry";
import type { NativeEdit, NativeInspection, NativeTextEdit, NativeTextObject } from "../../types/nativeEditor";

export interface NativeFindReplaceOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface NativeFindReplaceMatch {
  objectId: string;
  pageNumber: number;
  sourceText: string;
  nextText: string;
  occurrences: number;
  status: "ready" | "blocked";
  reason?: string;
}

export interface NativeFindReplacePlan {
  totalOccurrences: number;
  replaceableOccurrences: number;
  blockedOccurrences: number;
  edits: NativeTextEdit[];
  matches: NativeFindReplaceMatch[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function isWordCharacter(value: string): boolean {
  return /[\p{L}\p{N}_]/u.test(value);
}

function hasWholeWordBoundaries(source: string, start: number, length: number): boolean {
  const before = source.slice(0, start);
  const after = source.slice(start + length);
  const beforeChar = [...before].at(-1) ?? "";
  const afterChar = [...after][0] ?? "";
  return (!beforeChar || !isWordCharacter(beforeChar)) && (!afterChar || !isWordCharacter(afterChar));
}

export function replaceNativeTextOccurrences(
  source: string,
  query: string,
  replacement: string,
  options: NativeFindReplaceOptions
): { text: string; count: number } {
  if (!query) return { text: source, count: 0 };
  const flags = options.caseSensitive ? "gu" : "giu";
  const regex = new RegExp(escapeRegExp(query), flags);
  let result = "";
  let cursor = 0;
  let count = 0;
  for (const match of source.matchAll(regex)) {
    const index = match.index ?? -1;
    const matched = match[0] ?? "";
    if (index < 0 || !matched) continue;
    if (options.wholeWord && !hasWholeWordBoundaries(source, index, matched.length)) continue;
    result += source.slice(cursor, index);
    result += replacement;
    cursor = index + matched.length;
    count += 1;
  }
  if (!count) return { text: source, count: 0 };
  return { text: result + source.slice(cursor), count };
}

function colorValue(value?: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value as string : "#111111";
}

function primaryQueuedTextEdit(edits: NativeEdit[], objectId: string): NativeTextEdit | undefined {
  return edits.find((edit): edit is NativeTextEdit => edit.kind === "text" && edit.objectId === objectId && !edit.reflowFollower);
}

function makeReplacementEdit(object: NativeTextObject, text: string, queued?: NativeTextEdit): NativeTextEdit {
  if (queued) {
    const preserveSourceStyle = queued.preserveSourceStyle ?? Boolean(object.runs?.length);
    return {
      ...queued,
      text,
      sourceRects: queued.sourceRects ?? nativeTextSourceRects(object),
      backgroundColor: text ? queued.backgroundColor : "transparent",
      styleRuns: preserveSourceStyle ? buildPreservedEditRuns(object, text, queued.color || colorValue(object.color)) : queued.styleRuns,
      preserveSourceStyle
    };
  }
  const language = cjkLanguageForScript(object.script);
  const preserveSourceStyle = (object.runs?.length ?? 0) > 1;
  const color = colorValue(object.color);
  return {
    id: `p1-find-replace:${object.id}`,
    kind: "text",
    objectId: object.id,
    pageNumber: object.pageNumber,
    originalText: object.text,
    text,
    sourceBounds: object.bounds,
    sourceRects: nativeTextSourceRects(object),
    bounds: object.bounds,
    fontFamily: editableFamilyForSource(object.family, object.script),
    fontSize: Math.max(1, object.size),
    color,
    backgroundColor: "transparent",
    align: object.align ?? "left",
    mode: "replace",
    wrap: true,
    fontSource: language ? "built-in-cjk" : "built-in",
    fontLanguage: language,
    writingMode: object.writingMode,
    fontWeight: object.weight,
    fontStyle: object.style,
    lineHeight: object.lineHeight,
    layoutMode: "fixed-box",
    styleRuns: preserveSourceStyle ? buildPreservedEditRuns(object, text, color) : undefined,
    preserveSourceStyle
  };
}

function blockReason(
  inspection: NativeInspection,
  object: NativeTextObject,
  queuedEdits: NativeEdit[],
  queued: NativeTextEdit | undefined,
  nextText: string
): string | undefined {
  if (!inspection.canEdit) return "This PDF does not grant editing permission.";
  if (object.editability === "unsupported") return "This detected text block is not safely editable.";
  if (object.editability === "overlay-only") return "This text needs appearance-only shaping, so bulk replacement is not applied automatically.";
  if (findNativeReflowQueueConflict(queuedEdits, object.id, [])) return "This text block is already being moved by another layout-aware edit.";
  if (queued?.layoutMode === "expand-flow") return "This text block already has a layout-aware reflow. Review that paragraph manually before replacing text inside it.";

  const nextScript = detectScript(nextText);
  if (nextScript !== object.script) return "The replacement changes the detected writing script. Review this match manually so the correct font and shaping path can be chosen.";
  if (nextScript === "latin") { const character = firstUnencodableWinAnsiCharacter(nextText); if (character) return `The replacement contains “${character}”, which the qualified Latin PDF writer cannot encode.`; }

  const candidate = makeReplacementEdit(object, nextText, queued);
  const styleRuns = candidate.preserveSourceStyle ? buildPreservedEditRuns(object, nextText, candidate.color) : candidate.styleRuns;
  const fit = styleRuns?.length
    ? evaluateStyledTextFit(styleRuns, candidate.bounds, candidate.wrap, candidate.lineHeight)
    : evaluateTextFit(nextText, candidate.bounds, candidate.fontSize, candidate.wrap, candidate.lineHeight);
  const sourceText = queued?.text ?? object.text;
  const sourceRuns = candidate.preserveSourceStyle ? buildPreservedEditRuns(object, sourceText, candidate.color) : queued?.styleRuns;
  const sourceFit = sourceRuns?.length
    ? evaluateStyledTextFit(sourceRuns, candidate.bounds, candidate.wrap, candidate.lineHeight)
    : evaluateTextFit(sourceText, candidate.bounds, candidate.fontSize, candidate.wrap, candidate.lineHeight);
  if (!fitsWithinSourceBaseline(fit, sourceFit)) return "The replacement would overflow this detected text box beyond the source text baseline. Edit this match manually to review layout-aware reflow or font sizing.";
  return undefined;
}

export function planNativeFindReplace(
  inspection: NativeInspection | null,
  queuedEdits: NativeEdit[],
  query: string,
  replacement: string,
  options: NativeFindReplaceOptions
): NativeFindReplacePlan {
  const plan: NativeFindReplacePlan = {
    totalOccurrences: 0,
    replaceableOccurrences: 0,
    blockedOccurrences: 0,
    edits: [],
    matches: []
  };
  if (!inspection || !query) return plan;

  for (const page of inspection.pages) {
    for (const object of page.objects) {
      if (object.type !== "text") continue;
      const queued = primaryQueuedTextEdit(queuedEdits, object.id);
      const sourceText = queued?.text ?? object.text;
      const replaced = replaceNativeTextOccurrences(sourceText, query, replacement, options);
      if (!replaced.count) continue;

      plan.totalOccurrences += replaced.count;
      const reason = blockReason(inspection, object, queuedEdits, queued, replaced.text);
      if (reason) {
        plan.blockedOccurrences += replaced.count;
        plan.matches.push({
          objectId: object.id,
          pageNumber: object.pageNumber,
          sourceText,
          nextText: replaced.text,
          occurrences: replaced.count,
          status: "blocked",
          reason
        });
        continue;
      }

      plan.replaceableOccurrences += replaced.count;
      plan.edits.push(makeReplacementEdit(object, replaced.text, queued));
      plan.matches.push({
        objectId: object.id,
        pageNumber: object.pageNumber,
        sourceText,
        nextText: replaced.text,
        occurrences: replaced.count,
        status: "ready"
      });
    }
  }
  return plan;
}
