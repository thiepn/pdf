export interface VisualPageFingerprint {
  bits: string;
  inkRatio: number;
  aspectRatio: number;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }

export function visualFingerprintFromRgba(data: Uint8ClampedArray | Uint8Array, width: number, height: number): VisualPageFingerprint {
  if (width < 1 || height < 1 || data.length < width * height * 4) throw new Error("Invalid RGBA image for visual fingerprint.");
  const sampleW = 9, sampleH = 8;
  const samples = new Float32Array(sampleW * sampleH);
  let ink = 0;
  for (let y = 0; y < sampleH; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) / sampleH) * height));
    for (let x = 0; x < sampleW; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) / sampleW) * width));
      const offset = (sourceY * width + sourceX) * 4;
      const luma = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
      samples[y * sampleW + x] = luma;
      if (luma < 236) ink += 1;
    }
  }
  let bits = "";
  for (let y = 0; y < sampleH; y += 1) for (let x = 0; x < 8; x += 1) bits += samples[y * sampleW + x] > samples[y * sampleW + x + 1] ? "1" : "0";
  return { bits, inkRatio: ink / samples.length, aspectRatio: width / height };
}

export function visualFingerprintSimilarity(a: VisualPageFingerprint, b: VisualPageFingerprint): number {
  const length = Math.min(a.bits.length, b.bits.length);
  if (!length) return 0;
  let differences = Math.abs(a.bits.length - b.bits.length);
  for (let index = 0; index < length; index += 1) if (a.bits[index] !== b.bits[index]) differences += 1;
  const hashSimilarity = 1 - differences / Math.max(a.bits.length, b.bits.length);
  const inkSimilarity = 1 - Math.min(1, Math.abs(a.inkRatio - b.inkRatio) / 0.35);
  const aspectSimilarity = Math.min(a.aspectRatio, b.aspectRatio) / Math.max(a.aspectRatio, b.aspectRatio);
  return clamp01(hashSimilarity * 0.78 + inkSimilarity * 0.14 + aspectSimilarity * 0.08);
}
