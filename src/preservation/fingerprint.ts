import type {
  PreservationCategory,
  PreservationCategoryDigests,
  PreservationContractReport,
  PreservationDisposition,
  PreservationGraph,
  PreservationObjectFingerprint,
  PreservationObjectMap
} from "../types/preservation";

export const PRESERVATION_CATEGORIES: PreservationCategory[] = [
  "pages", "text", "images", "vectors", "fonts", "annotations", "forms", "links", "bookmarks", "attachments", "layers", "metadata", "signatures", "tags", "encryption"
];

export function hashText(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= code + index;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

export function hashBytes(value: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const byte = value[index];
    a ^= byte;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= byte + index;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

export function createObjectMap(): PreservationObjectMap {
  return Object.fromEntries(PRESERVATION_CATEGORIES.map((category) => [category, []])) as unknown as PreservationObjectMap;
}

export function addFingerprint(
  objects: PreservationObjectMap,
  category: PreservationCategory,
  id: string,
  semanticValue: string,
  pageNumber?: number,
  summary?: string
): void {
  objects[category].push({ id, category, digest: hashText(semanticValue), pageNumber, summary });
}

export function aggregateCategoryFingerprints(objects: PreservationObjectMap): PreservationCategoryDigests {
  return Object.fromEntries(PRESERVATION_CATEGORIES.map((category) => {
    const semanticObjects = objects[category]
      .map((item) => item.digest)
      .sort()
      .join("|");
    return [category, hashText(semanticObjects)];
  })) as PreservationCategoryDigests;
}

export function comparePreservationGraphs(
  operation: string,
  contract: Record<PreservationCategory, PreservationDisposition>,
  source: PreservationGraph,
  output: PreservationGraph,
  durationMs: number
): PreservationContractReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  const identitySafe = operation !== "impose";

  for (const category of PRESERVATION_CATEGORIES) {
    const rule = contract[category];
    if (rule === "preserve") {
      if (source.counts[category] !== output.counts[category]) {
        failures.push(`${category} changed from ${source.counts[category]} to ${output.counts[category]}.`);
        continue;
      }
      if (identitySafe && source.fingerprints[category] !== output.fingerprints[category]) {
        const delta = describeFingerprintDelta(source.objects[category], output.objects[category]);
        failures.push(`${category} objects changed despite an unchanged count${delta ? ` (${delta})` : ""}.`);
      }
    }
    if (rule === "remove" && output.counts[category] !== 0) failures.push(`${category} was not fully removed.`);
    if (rule === "unsupported" && source.counts[category] > 0) warnings.push(`${category} cannot be remapped by this operation.`);
  }

  return { operation, contract, source, output, passed: failures.length === 0, failures, warnings, durationMs };
}

function describeFingerprintDelta(source: PreservationObjectFingerprint[], output: PreservationObjectFingerprint[]): string {
  const sourceById = new Map(source.map((item) => [item.id, item.digest]));
  const outputById = new Map(output.map((item) => [item.id, item.digest]));
  const changed: string[] = [];
  for (const [id, digest] of sourceById) {
    const next = outputById.get(id);
    if (next === undefined) changed.push(`${id} missing`);
    else if (next !== digest) changed.push(`${id} modified`);
    if (changed.length >= 3) break;
  }
  if (changed.length < 3) {
    for (const id of outputById.keys()) {
      if (!sourceById.has(id)) changed.push(`${id} added`);
      if (changed.length >= 3) break;
    }
  }
  return changed.join(", ");
}
