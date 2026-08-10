export interface PayloadRange {
  start: number;
  end: number;
  label: string;
}

export function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}

export function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

export function validatePayloadRange(
  offsetValue: unknown,
  lengthValue: unknown,
  pdfByteLength: number,
  payloadByteLength: number,
  label: string
): PayloadRange | undefined {
  if (offsetValue === undefined && lengthValue === undefined) return undefined;
  if (offsetValue === undefined || lengthValue === undefined) throw new Error(`${label} range is incomplete.`);
  const start = requireNonNegativeSafeInteger(offsetValue, `${label} offset`);
  const length = requirePositiveSafeInteger(lengthValue, `${label} byte length`);
  if (start < pdfByteLength) throw new Error(`${label} overlaps the source PDF payload.`);
  if (start > payloadByteLength || length > payloadByteLength - start) throw new Error(`${label} is truncated.`);
  return { start, end: start + length, label };
}

export function assertNonOverlappingPayloadRanges(ranges: PayloadRange[]): void {
  const ordered = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (current.start < previous.end) {
      throw new Error(`${current.label} overlaps ${previous.label}.`);
    }
  }
}


export function requireArray<T = unknown>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value as T[];
}

export function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

export function requirePayloadRange(
  offsetValue: unknown,
  lengthValue: unknown,
  pdfByteLength: number,
  payloadByteLength: number,
  label: string
): PayloadRange {
  const range = validatePayloadRange(offsetValue, lengthValue, pdfByteLength, payloadByteLength, label);
  if (!range) throw new Error(`${label} range is missing.`);
  return range;
}
