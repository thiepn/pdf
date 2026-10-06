import type { NativeScript } from "../types/nativeEditor";

export interface QualifiedComplexScript {
  script: Extract<NativeScript, "arabic">;
  label: string;
  direction: "rtl";
  reconstruction: "imported-font-fixed-box";
  shapingEngine: "harfbuzz";
  bidiEngine: "unicode-bidi";
  requiresImportedFont: true;
  layoutAwareReflow: false;
  bulkFindReplace: false;
}

export const QUALIFIED_COMPLEX_SCRIPT_MATRIX: readonly QualifiedComplexScript[] = [{
  script: "arabic",
  label: "Arabic script / RTL",
  direction: "rtl",
  reconstruction: "imported-font-fixed-box",
  shapingEngine: "harfbuzz",
  bidiEngine: "unicode-bidi",
  requiresImportedFont: true,
  layoutAwareReflow: false,
  bulkFindReplace: false
}] as const;

const ARABIC = /\p{Script=Arabic}/u;
const LATIN = /\p{Script=Latin}/u;
const SAFE_NON_SCRIPT = /[\p{N}\p{M}\p{P}\p{S}\p{Z}\t\n\r]/u;
const EXPLICIT_BIDI_CONTROL = /[\u202a-\u202e\u2066-\u2069]/u;
const OTHER_COMPLEX = /[\u0590-\u05ff\u0700-\u0dff\ufb1d-\ufb4f]/u;

export function isArabicScriptCharacter(character: string): boolean {
  return ARABIC.test(character);
}

export function hasArabicScript(text: string): boolean {
  return [...text].some(isArabicScriptCharacter);
}

export function firstExplicitBidiControl(text: string): string | undefined {
  return [...text].find((character) => EXPLICIT_BIDI_CONTROL.test(character));
}

export function firstUnsupportedArabicMixCharacter(text: string): string | undefined {
  for (const character of text) {
    if (character.codePointAt(0)! > 0xffff) return character;
    if (EXPLICIT_BIDI_CONTROL.test(character)) return character;
    if (ARABIC.test(character) || LATIN.test(character) || SAFE_NON_SCRIPT.test(character)) continue;
    return character;
  }
  return undefined;
}

/**
 * P14 intentionally qualifies one bounded script family instead of treating
 * every shaping-dependent script as equivalent. Arabic-script text may contain
 * Latin labels, ASCII/Arabic digits, marks, punctuation and symbols. Explicit
 * bidi controls and unrelated scripts stay fail-closed.
 */
export function detectQualifiedComplexScript(text: string): "arabic" | "complex" | null {
  if (!text.trim()) return null;
  const hasArabic = hasArabicScript(text);
  if (hasArabic) return firstUnsupportedArabicMixCharacter(text) ? "complex" : "arabic";
  return OTHER_COMPLEX.test(text) ? "complex" : null;
}

export function qualifiedComplexScript(script: NativeScript): QualifiedComplexScript | undefined {
  return QUALIFIED_COMPLEX_SCRIPT_MATRIX.find((entry) => entry.script === script);
}

export function complexScriptReplacementIssue(text: string): string | undefined {
  if (!hasArabicScript(text)) return "The replacement no longer contains Arabic-script text.";
  const bidiControl = firstExplicitBidiControl(text);
  if (bidiControl) return "Explicit bidirectional control characters are not accepted in the qualified Arabic editing path.";
  const unsupported = firstUnsupportedArabicMixCharacter(text);
  if (unsupported) return `Character “${unsupported}” belongs to a script outside the qualified Arabic/Latin mixed-text path.`;
  return undefined;
}
