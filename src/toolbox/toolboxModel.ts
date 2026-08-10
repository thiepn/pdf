export const PT_PER_MM = 72 / 25.4;
export function mmToPt(value: number): number { return Math.max(0, Number.isFinite(value) ? value : 0) * PT_PER_MM; }
export function normalizePagesPerSplit(value: number): number { return Number.isFinite(value) ? Math.max(1, Math.min(500, Math.round(value))) : 1; }
export function normalizeBlankPageCount(value: number): number { return Number.isFinite(value) ? Math.max(1, Math.min(20, Math.round(value))) : 1; }

export type DecorationLanguage = "auto" | "ko" | "ja" | "zh-Hans" | "zh-Hant";
export function resolveDecorationLanguage(text: string, preferred: DecorationLanguage = "auto"): Exclude<DecorationLanguage, "auto"> | undefined {
  if (preferred !== "auto") return preferred;
  if (/[\uac00-\ud7af\u1100-\u11ff]/u.test(text)) return "ko";
  if (/[\u3040-\u30ff]/u.test(text)) return "ja";
  if (/[\u3400-\u9fff]/u.test(text)) return "zh-Hans";
  if (/[\u0590-\u08ff\u0900-\u0dff\u0e00-\u0e7f]/u.test(text)) throw new Error("Complex-script decoration needs shaping that the static toolbox writer does not provide.");
  return undefined;
}
