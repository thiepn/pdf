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

function appendSourceRange(
  output: NativeTextEditRun[],
  source: string,
  sourceRuns: NativeTextRun[],
  object: NativeTextObject,
  start: number,
  end: number,
  fallbackColor: string
): void {
  if (end <= start) return;
  let cursor = start;
  for (const run of sourceRuns) {
    if (run.end <= cursor || run.start >= end) continue;
    if (run.start > cursor) {
      const gapEnd = Math.min(run.start, end);
      const fallback = sourceStyleAt(sourceRuns, cursor);
      const text = source.slice(cursor, gapEnd);
      output.push(fallback ? { ...styleOf(fallback, object, fallbackColor), text } : defaultRun(object, text, fallbackColor));
      cursor = gapEnd;
    }
    const rangeStart = Math.max(cursor, run.start, start);
    const rangeEnd = Math.min(end, run.end);
    if (rangeEnd > rangeStart) {
      output.push({ ...styleOf(run, object, fallbackColor), text: source.slice(rangeStart, rangeEnd) });
      cursor = rangeEnd;
    }
    if (cursor >= end) break;
  }
  if (cursor < end) {
    const fallback = sourceStyleAt(sourceRuns, Math.max(0, Math.min(cursor, source.length - 1)));
    const text = source.slice(cursor, end);
    output.push(fallback ? { ...styleOf(fallback, object, fallbackColor), text } : defaultRun(object, text, fallbackColor));
  }
}

interface TextToken {
  text: string;
  start: number;
  end: number;
}

function tokenize(value: string): TextToken[] {
  const tokens: TextToken[] = [];
  for (const match of value.matchAll(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_]+/gu)) {
    const text = match[0];
    const start = match.index ?? 0;
    tokens.push({ text, start, end: start + text.length });
  }
  return tokens;
}

const MAX_TOKEN_LCS_CELLS = 60_000;

function tokenLcsMatches(source: TextToken[], replacement: TextToken[]): Array<[number, number]> | null {
  if (!source.length || !replacement.length) return [];
  const cells = source.length * replacement.length;
  if (cells > MAX_TOKEN_LCS_CELLS) return null;
  const width = replacement.length + 1;
  const matrix = new Uint16Array((source.length + 1) * width);
  const at = (row: number, column: number) => row * width + column;
  for (let left = source.length - 1; left >= 0; left -= 1) {
    for (let right = replacement.length - 1; right >= 0; right -= 1) {
      matrix[at(left, right)] = source[left].text === replacement[right].text
        ? matrix[at(left + 1, right + 1)] + 1
        : Math.max(matrix[at(left + 1, right)], matrix[at(left, right + 1)]);
    }
  }

  const matches: Array<[number, number]> = [];
  let left = 0;
  let right = 0;
  while (left < source.length && right < replacement.length) {
    if (source[left].text === replacement[right].text) {
      matches.push([left, right]);
      left += 1;
      right += 1;
    } else if (matrix[at(left + 1, right)] >= matrix[at(left, right + 1)]) left += 1;
    else right += 1;
  }
  return matches;
}

function appendReplacementGap(
  output: NativeTextEditRun[],
  text: string,
  sourceOffset: number,
  sourceEnd: number,
  sourceRuns: NativeTextRun[],
  object: NativeTextObject,
  fallbackColor: string
): void {
  if (!text) return;
  const probe = sourceOffset < sourceEnd
    ? sourceOffset
    : sourceOffset > 0
      ? sourceOffset - 1
      : sourceOffset;
  const sourceRun = sourceStyleAt(sourceRuns, Math.max(0, Math.min(probe, Math.max(0, object.text.length - 1))));
  output.push(sourceRun ? { ...styleOf(sourceRun, object, fallbackColor), text } : defaultRun(object, text, fallbackColor));
}

function buildAnchoredEditRuns(
  object: NativeTextObject,
  replacement: string,
  sourceRuns: NativeTextRun[],
  fallbackColor: string
): NativeTextEditRun[] | null {
  const source = object.text;
  const sourceTokens = tokenize(source);
  const replacementTokens = tokenize(replacement);
  const matches = tokenLcsMatches(sourceTokens, replacementTokens);
  if (matches === null) return null;

  const output: NativeTextEditRun[] = [];
  let previousSource = -1;
  let previousReplacement = -1;
  const anchors: Array<[number, number]> = [...matches, [sourceTokens.length, replacementTokens.length]];

  for (const [sourceIndex, replacementIndex] of anchors) {
    const sourceGapStart = previousSource < 0 ? 0 : sourceTokens[previousSource].end;
    const sourceGapEnd = sourceIndex < sourceTokens.length ? sourceTokens[sourceIndex].start : source.length;
    const replacementGapStart = previousReplacement < 0 ? 0 : replacementTokens[previousReplacement].end;
    const replacementGapEnd = replacementIndex < replacementTokens.length ? replacementTokens[replacementIndex].start : replacement.length;

    appendReplacementGap(
      output,
      replacement.slice(replacementGapStart, replacementGapEnd),
      sourceGapStart,
      sourceGapEnd,
      sourceRuns,
      object,
      fallbackColor
    );

    if (sourceIndex < sourceTokens.length) {
      appendSourceRange(
        output,
        source,
        sourceRuns,
        object,
        sourceTokens[sourceIndex].start,
        sourceTokens[sourceIndex].end,
        fallbackColor
      );
    }

    previousSource = sourceIndex;
    previousReplacement = replacementIndex;
  }

  const merged = mergeRuns(output);
  return merged.map((run) => ({ ...run }));
}

function buildPrefixSuffixRuns(
  object: NativeTextObject,
  replacement: string,
  sourceRuns: NativeTextRun[],
  fallbackColor: string
): NativeTextEditRun[] {
  const source = object.text;
  const prefix = commonPrefixLength(source, replacement);
  const suffix = commonSuffixLength(source, replacement, prefix);
  const sourceSuffixStart = source.length - suffix;
  const replacementSuffixStart = replacement.length - suffix;
  const output: NativeTextEditRun[] = [];

  appendSourceRange(output, source, sourceRuns, object, 0, prefix, fallbackColor);

  const middle = replacement.slice(prefix, replacementSuffixStart);
  if (middle) {
    const run = sourceStyleAt(sourceRuns, Math.min(prefix, Math.max(0, source.length - 1)));
    output.push(run ? { ...styleOf(run, object, fallbackColor), text: middle } : defaultRun(object, middle, fallbackColor));
  }

  if (suffix) appendSourceRange(output, source, sourceRuns, object, sourceSuffixStart, source.length, fallbackColor);
  return mergeRuns(output);
}

/**
 * Rebase source formatting over edited text.
 *
 * For mixed-style paragraphs, token-level LCS anchors preserve unchanged interior
 * text across multiple separate edits instead of flattening everything between the
 * first and last change. Newly inserted or replaced text inherits the nearest
 * source style. Extremely large token matrices fall back to the bounded
 * prefix/suffix strategy so editing cannot create quadratic UI work.
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
  if (sourceRuns.length === 1) return [{ ...styleOf(sourceRuns[0], object, fallbackColor), text: replacement }];

  const anchored = buildAnchoredEditRuns(object, replacement, sourceRuns, fallbackColor);
  const output = anchored ?? buildPrefixSuffixRuns(object, replacement, sourceRuns, fallbackColor);
  const merged = mergeRuns(output);
  return merged.length ? merged : [defaultRun(object, replacement, fallbackColor)];
}
