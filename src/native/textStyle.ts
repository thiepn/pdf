import type {
  NativeEditableFontFamily,
  NativeScript,
  NativeTextEditRun,
  NativeTextObject,
  NativeTextRun
} from "../types/nativeEditor";

export function editableFamilyForSource(family: NativeTextObject["family"], script: NativeScript): NativeEditableFontFamily {
  if (script === "cjk-ko") return "ko";
  if (script === "cjk-ja") return "ja";
  if (script === "cjk-zh-hans") return "zh-Hans";
  if (script === "cjk-zh-hant") return "zh-Hant";
  if (family === "serif") return "Times-Roman";
  if (family === "monospace") return "Courier";
  return "Helvetica";
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLength: number): number {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let count = 0;
  while (count < limit && left[left.length - count - 1] === right[right.length - count - 1]) count += 1;
  return count;
}

function styleOf(run: NativeTextRun, object: NativeTextObject, fallbackColor: string): Omit<NativeTextEditRun, "text"> {
  return {
    fontFamily: editableFamilyForSource(run.family, object.script),
    fontSize: Math.max(1, run.size || object.size),
    color: run.color ?? object.color ?? fallbackColor,
    fontWeight: run.weight,
    fontStyle: run.style,
    fontName: run.fontName || object.fontName || undefined
  };
}

function sameStyle(left: NativeTextEditRun, right: NativeTextEditRun): boolean {
  return left.fontFamily === right.fontFamily
    && left.fontSize === right.fontSize
    && left.color === right.color
    && left.fontWeight === right.fontWeight
    && left.fontStyle === right.fontStyle
    && left.fontName === right.fontName;
}

function mergeRuns(runs: NativeTextEditRun[]): NativeTextEditRun[] {
  const merged: NativeTextEditRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = merged.at(-1);
    if (previous && sameStyle(previous, run)) previous.text += run.text;
    else merged.push({ ...run });
  }
  return merged;
}

function defaultRun(object: NativeTextObject, text: string, fallbackColor: string): NativeTextEditRun {
  return {
    text,
    fontFamily: editableFamilyForSource(object.family, object.script),
    fontSize: Math.max(1, object.size),
    color: object.color ?? fallbackColor,
    fontWeight: object.weight,
    fontStyle: object.style,
    fontName: object.fontName || undefined
  };
}

function sourceStyleAt(runs: NativeTextRun[], offset: number): NativeTextRun | undefined {
  return runs.find((run) => offset >= run.start && offset < run.end)
    ?? [...runs].reverse().find((run) => run.end <= offset)
    ?? runs.find((run) => run.start >= offset)
    ?? runs[0];
}

/**
 * Rebase source formatting over an edited string. Unchanged common prefix and
 * suffix retain their exact source spans. The changed middle inherits the style
 * immediately surrounding the edit. This deliberately avoids guessing arbitrary
 * rich-text semantics for newly typed content.
 */
export function buildPreservedEditRuns(object: NativeTextObject, replacement: string, fallbackColor = "#111111"): NativeTextEditRun[] {
  const source = object.text;
  const sourceRuns = [...(object.runs ?? [])]
    .filter((run) => run.end > run.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (!sourceRuns.length) return [defaultRun(object, replacement, fallbackColor)];
  if (source === replacement) {
    return mergeRuns(sourceRuns.map((run) => ({
      ...styleOf(run, object, fallbackColor),
      text: source.slice(run.start, run.end)
    })));
  }

  const prefix = commonPrefixLength(source, replacement);
  const suffix = commonSuffixLength(source, replacement, prefix);
  const sourceSuffixStart = source.length - suffix;
  const replacementSuffixStart = replacement.length - suffix;
  const output: NativeTextEditRun[] = [];

  for (const run of sourceRuns) {
    const start = Math.max(run.start, 0);
    const end = Math.min(run.end, prefix);
    if (end > start) output.push({ ...styleOf(run, object, fallbackColor), text: replacement.slice(start, end) });
  }

  const middle = replacement.slice(prefix, replacementSuffixStart);
  if (middle) {
    const run = sourceStyleAt(sourceRuns, Math.min(prefix, Math.max(0, source.length - 1)));
    output.push(run ? { ...styleOf(run, object, fallbackColor), text: middle } : defaultRun(object, middle, fallbackColor));
  }

  if (suffix) {
    for (const run of sourceRuns) {
      const sourceStart = Math.max(run.start, sourceSuffixStart);
      const sourceEnd = Math.min(run.end, source.length);
      if (sourceEnd <= sourceStart) continue;
      const replacementStart = replacementSuffixStart + (sourceStart - sourceSuffixStart);
      const replacementEnd = replacementSuffixStart + (sourceEnd - sourceSuffixStart);
      output.push({ ...styleOf(run, object, fallbackColor), text: replacement.slice(replacementStart, replacementEnd) });
    }
  }

  const merged = mergeRuns(output);
  return merged.length ? merged : [defaultRun(object, replacement, fallbackColor)];
}
