import type { PDFDocumentProxy } from "pdfjs-dist";
import { asAffineMatrix, CoordinateService, type Rect } from "../core/coordinates";
import { multiplyTransforms } from "../engines/pdfjs";
import type { RedactionEditorObject } from "../types/editor";

export type RedactionSearchMode = "text" | "regex" | "sensitive";
export type SensitivePattern = "email" | "phone" | "iban" | "payment-card";

export interface RedactionCandidate {
  id: string;
  pageNumber: number;
  bounds: Rect;
  text: string;
  kind: SensitivePattern | "text" | "regex";
  confidence: "high" | "medium";
}

export interface RedactionDiscoveryOptions {
  mode: RedactionSearchMode;
  query?: string;
  caseSensitive?: boolean;
  sensitive?: SensitivePattern[];
  pages?: number[];
  maxMatches?: number;
}

const PATTERNS: Record<SensitivePattern, RegExp> = {
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  phone: /(?<!\w)(?:\+?\d[\d .()/-]{6,}\d)(?!\w)/gu,
  iban: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/giu,
  "payment-card": /\b(?:\d[ -]*?){13,19}\b/g
};

function safeRegex(pattern: string, caseSensitive: boolean): RegExp {
  if (!pattern.trim()) throw new Error("Enter a regular expression.");
  if (pattern.length > 160) throw new Error("Regular expressions are limited to 160 characters.");
  if (/\\[1-9]/.test(pattern)) throw new Error("Backreferences are not supported in automatic redaction patterns.");
  if (/\((?:[^()]|\\.)*\)[+*{]/.test(pattern)) throw new Error("Quantified groups are not supported in interactive redaction scanning.");
  if (/(?:\.\*|\.\+).*(?:\.\*|\.\+)/.test(pattern)) throw new Error("Multiple unbounded wildcards are not supported in interactive redaction scanning.");
  try { return new RegExp(pattern, caseSensitive ? "gu" : "giu"); }
  catch (reason) { throw new Error(`Invalid regular expression: ${reason instanceof Error ? reason.message : String(reason)}`); }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}

function normalizeIban(value: string): string { return value.replace(/\s+/g, "").toUpperCase(); }
function validIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function validPaymentCard(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function itemBounds(viewport: { transform: number[] }, item: { transform: number[]; width: number; height?: number }): Rect {
  const transform = multiplyTransforms(viewport.transform, item.transform);
  const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]), Math.abs(item.height ?? 0));
  return { x0: transform[4], y0: transform[5] - fontHeight, x1: transform[4] + Math.max(1, Math.abs(item.width)), y1: transform[5] };
}

function matchRect(bounds: Rect, textLength: number, start: number, length: number): Rect {
  const width = Math.max(1, bounds.x1 - bounds.x0);
  const from = textLength ? Math.max(0, Math.min(1, start / textLength)) : 0;
  const to = textLength ? Math.max(from, Math.min(1, (start + length) / textLength)) : 1;
  const pad = Math.min(2, width * .02);
  return { x0: bounds.x0 + width * from - pad, y0: bounds.y0 - 1.5, x1: bounds.x0 + width * to + pad, y1: bounds.y1 + 1.5 };
}

function patternsFor(options: RedactionDiscoveryOptions): Array<{ kind: RedactionCandidate["kind"]; expression: RegExp; confidence: RedactionCandidate["confidence"] }> {
  if (options.mode === "text") {
    const escaped = escapeRegex(options.query ?? "");
    if (!escaped) throw new Error("Enter text to find.");
    return [{ kind: "text", expression: new RegExp(escaped, options.caseSensitive ? "gu" : "giu"), confidence: "high" }];
  }
  if (options.mode === "regex") return [{ kind: "regex", expression: safeRegex(options.query ?? "", Boolean(options.caseSensitive)), confidence: "medium" }];
  const selected = new Set(options.sensitive?.length ? options.sensitive : (["email", "phone", "iban", "payment-card"] as SensitivePattern[]));
  const priority: SensitivePattern[] = ["email", "iban", "payment-card", "phone"];
  return priority.filter((kind) => selected.has(kind)).map((kind) => ({ kind, expression: new RegExp(PATTERNS[kind].source, PATTERNS[kind].flags), confidence: kind === "phone" ? "medium" : "high" }));
}

export async function discoverRedactionCandidates(document: PDFDocumentProxy, options: RedactionDiscoveryOptions, signal?: AbortSignal, onProgress?: (completedPages: number, totalPages: number) => void): Promise<RedactionCandidate[]> {
  const maxMatches = Math.max(1, Math.min(1000, options.maxMatches ?? 500));
  const pageNumbers = options.pages?.length ? options.pages : Array.from({ length: document.numPages }, (_, index) => index + 1);
  const patterns = patternsFor(options);
  const candidates: RedactionCandidate[] = [];
  const seen = new Set<string>();
  let sequence = 0;

  for (let pageOffset = 0; pageOffset < pageNumbers.length; pageOffset += 1) {
    const pageNumber = pageNumbers[pageOffset];
    signal?.throwIfAborted();
    if (pageNumber < 1 || pageNumber > document.numPages) continue;
    const page = await document.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const service = new CoordinateService(asAffineMatrix(viewport.transform));
      const text = await page.getTextContent({ includeMarkedContent: false });
      for (const raw of text.items) {
        signal?.throwIfAborted();
        if (!("str" in raw) || typeof raw.str !== "string" || !raw.str) continue;
        const source = raw.str.slice(0, 2048);
        const rawBounds = itemBounds(viewport, raw as typeof raw & { transform: number[]; width: number; height?: number });
        for (const pattern of patterns) {
          pattern.expression.lastIndex = 0;
          for (const match of source.matchAll(pattern.expression)) {
            const value = match[0];
            if (!value) continue;
            if (pattern.kind === "iban" && !validIban(value)) continue;
            if (pattern.kind === "payment-card" && !validPaymentCard(value)) continue;
            const start = match.index ?? 0;
            const duplicateKey = `${pageNumber}:${Math.round(rawBounds.x0 * 10)}:${Math.round(rawBounds.y0 * 10)}:${start}:${value.length}`;
            if (seen.has(duplicateKey)) continue;
            seen.add(duplicateKey);
            const viewportRect = matchRect(rawBounds, source.length, start, value.length);
            const pdfRect = service.viewportRectToPdf(viewportRect);
            const bounds = { x0: Math.min(pdfRect.x0, pdfRect.x1), y0: Math.min(pdfRect.y0, pdfRect.y1), x1: Math.max(pdfRect.x0, pdfRect.x1), y1: Math.max(pdfRect.y0, pdfRect.y1) };
            candidates.push({ id: `redaction-candidate:${pageNumber}:${sequence++}`, pageNumber, bounds, text: value, kind: pattern.kind, confidence: pattern.confidence });
            if (candidates.length >= maxMatches) return candidates;
          }
        }
      }
    } finally {
      page.cleanup();
    }
    onProgress?.(pageOffset + 1, pageNumbers.length);
  }
  return candidates;
}

export function redactionCandidateToEditorObject(candidate: RedactionCandidate, zIndex: number): RedactionEditorObject {
  const now = Date.now();
  return {
    id: crypto.randomUUID?.() ?? `auto-redaction-${now}-${Math.random().toString(16).slice(2)}`,
    type: "redaction",
    pageNumber: candidate.pageNumber,
    bounds: { ...candidate.bounds },
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    hidden: false,
    createdAt: now,
    modifiedAt: now,
    fillColor: "#000000",
    overlayText: "",
    applied: false
  };
}

export function maskSensitivePreview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 6) return trimmed;
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-3)}`;
}

export function validateIbanForTest(value: string): boolean { return validIban(value); }
export function validatePaymentCardForTest(value: string): boolean { return validPaymentCard(value); }
