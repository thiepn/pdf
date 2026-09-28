/** A page plan is an ordered list, not a set. IDs identify copies independently. */
export interface AssemblyPage {
  id: string;
  sourceId: string | null;
  sourcePageIndex: number;
  rotation: 0 | 90 | 180 | 270;
}
export interface AssemblySource { id: string; pageCount: number }
export const MAX_ASSEMBLY_PAGES = 2000;
export function createAssemblyPlan(inputs: readonly AssemblySource[]): AssemblyPage[] {
  if (inputs.some((input) => !Number.isSafeInteger(input.pageCount) || input.pageCount < 1)) throw new Error("Every source must have a positive whole page count.");
  const count = inputs.reduce((sum, input) => sum + input.pageCount, 0);
  if (!Number.isSafeInteger(count) || count > MAX_ASSEMBLY_PAGES) throw new Error(`Arrange up to ${MAX_ASSEMBLY_PAGES} pages at a time.`);
  return inputs.flatMap((input) => Array.from({ length: input.pageCount }, (_, sourcePageIndex) => ({ id: crypto.randomUUID(), sourceId: input.id, sourcePageIndex, rotation: 0 as const })));
}
export function moveAssemblyPage(plan: readonly AssemblyPage[], from: number, to: number): AssemblyPage[] {
  const next = [...plan];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [page] = next.splice(from, 1); next.splice(to, 0, page); return next;
}
export function validateAssemblyPlan(plan: readonly AssemblyPage[], inputs: readonly AssemblySource[]): void {
  if (!plan.length) throw new Error("Keep at least one page in your PDF.");
  if (plan.length > MAX_ASSEMBLY_PAGES) throw new Error(`Arrange up to ${MAX_ASSEMBLY_PAGES} pages at a time.`);
  const sources = new Map(inputs.map((input) => [input.id, input])); const ids = new Set<string>();
  for (const page of plan) {
    if (ids.has(page.id)) throw new Error("Each page copy must have a unique ID."); ids.add(page.id);
    if (![0, 90, 180, 270].includes(page.rotation)) throw new Error("Page rotation must be a quarter turn.");
    if (page.sourceId === null) continue;
    const input = sources.get(page.sourceId);
    if (!input || !Number.isInteger(page.sourcePageIndex) || page.sourcePageIndex < 0 || page.sourcePageIndex >= input.pageCount) throw new Error("A page refers to a source that is no longer available. Reset the page order.");
  }
}
/** Front scans and back scans are interleaved; reverseBacks handles face-down feeders. */
export function interleaveAssembly(inputs: readonly AssemblySource[], reverseBacks = false): AssemblyPage[] {
  if (inputs.length !== 2) throw new Error("Choose exactly two documents: fronts first, backs second.");
  createAssemblyPlan(inputs); // Validate the combined budget before allocating/interleaving.
  const front = createAssemblyPlan([inputs[0]]); const back = createAssemblyPlan([inputs[1]]);
  if (reverseBacks) back.reverse();
  return Array.from({ length: Math.max(front.length, back.length) }, (_, index) => [front[index], back[index]].filter((page): page is AssemblyPage => Boolean(page))).flat();
}
