import bidiFactory from "bidi-js";

const bidi = bidiFactory();

export interface BidiLogicalRun {
  start: number;
  end: number;
  level: number;
  direction: "ltr" | "rtl";
  text: string;
}

export interface BidiLinePlan {
  baseDirection: "ltr" | "rtl";
  logicalText: string;
  runs: BidiLogicalRun[];
  visualRuns: BidiLogicalRun[];
  mirroredTextByIndex: Map<number, string>;
}

function buildLogicalRuns(text: string, levels: Uint8Array): BidiLogicalRun[] {
  if (!text.length) return [];
  const runs: BidiLogicalRun[] = [];
  let start = 0;
  let level = levels[0] ?? 0;
  for (let index = 1; index <= text.length; index += 1) {
    const next = index < text.length ? levels[index] : undefined;
    if (index < text.length && next === level) continue;
    runs.push({
      start,
      end: index - 1,
      level,
      direction: level & 1 ? "rtl" : "ltr",
      text: text.slice(start, index)
    });
    start = index;
    level = next ?? level;
  }
  return runs;
}

/**
 * Resolve one already-wrapped logical line using the Unicode Bidirectional
 * Algorithm. HarfBuzz shapes each returned run independently; bidi-js decides
 * run order and Unicode mirroring.
 */
export function planBidiLine(text: string, baseDirection: "ltr" | "rtl" = "rtl"): BidiLinePlan {
  const embedding = bidi.getEmbeddingLevels(text, baseDirection);
  const runs = buildLogicalRuns(text, embedding.levels);
  const runByIndex = new Int32Array(text.length);
  runByIndex.fill(-1);
  runs.forEach((run, runIndex) => {
    for (let index = run.start; index <= run.end; index += 1) runByIndex[index] = runIndex;
  });

  const visualRunIndices: number[] = [];
  for (const index of bidi.getReorderedIndices(text, embedding)) {
    const runIndex = runByIndex[index] ?? -1;
    if (runIndex < 0 || visualRunIndices.at(-1) === runIndex) continue;
    visualRunIndices.push(runIndex);
  }

  return {
    baseDirection,
    logicalText: text,
    runs,
    visualRuns: visualRunIndices.map((index) => runs[index]).filter(Boolean),
    mirroredTextByIndex: bidi.getMirroredCharactersMap(text, embedding.levels)
  };
}

export function mirroredRunText(plan: BidiLinePlan, run: BidiLogicalRun): string {
  let output = "";
  for (let index = run.start; index <= run.end; index += 1) {
    output += plan.mirroredTextByIndex.get(index) ?? plan.logicalText[index] ?? "";
  }
  return output;
}
