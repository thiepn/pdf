import type {
  NativeCapability,
  NativeImageFidelity,
  NativeImageObject,
  NativeTableObject,
  NativeVectorObject
} from "../types/nativeEditor";

export interface NativeImageFidelityEvidence {
  resourceName?: string;
  invocationCount?: number;
  softMask?: boolean;
  explicitMask?: boolean;
  clipped?: boolean;
  blendMode?: string;
  ambiguous?: boolean;
}

function capability(level: NativeCapability["level"], label: string, confidence: number, reason: string, preserves: string[], risks: string[]): NativeCapability {
  return { level, label, confidence, reason, preserves, risks };
}

export function classifyImageFidelity(evidence: NativeImageFidelityEvidence): Pick<NativeImageObject, "editability" | "capability" | "fidelity"> {
  const invocationCount = Math.max(1, Math.floor(evidence.invocationCount ?? 1));
  const blendMode = evidence.blendMode?.replace(/^\//, "") || "Normal";
  const softMask = Boolean(evidence.softMask);
  const explicitMask = Boolean(evidence.explicitMask);
  const clipped = Boolean(evidence.clipped);
  const ambiguous = Boolean(evidence.ambiguous);
  const shared = invocationCount > 1;

  let fidelityClass: NativeImageFidelity["class"] = shared ? "shared" : "plain";
  if (ambiguous) fidelityClass = "ambiguous";
  else if (softMask || explicitMask) fidelityClass = "masked";
  else if (clipped) fidelityClass = "clipped";
  else if (blendMode !== "Normal") fidelityClass = "blended";

  if (fidelityClass === "plain" || fidelityClass === "shared") {
    const reason = shared
      ? "This image resource is invoked more than once. PDF Studio edits only the selected page instance by copying its rendered source image; the shared PDF resource is not mutated."
      : "The image is a plain, unmasked page image instance with no detected inherited clipping or non-Normal blending.";
    return {
      editability: "replace-region",
      fidelity: {
        class: fidelityClass,
        resourceName: evidence.resourceName,
        invocationCount,
        softMask,
        explicitMask,
        clipped,
        blendMode,
        verified: true,
        allowedActions: ["transform", "replace", "delete"],
        reason
      },
      capability: capability(
        "safe-reconstruction",
        shared ? "Shared image instance" : "Image instance",
        shared ? 0.9 : 0.96,
        reason,
        ["Other image instances", "Unrelated text and vector content", "Page count"],
        ["The selected image instance is reconstructed; encoded source bytes may be recompressed."]
      )
    };
  }

  if (softMask && !explicitMask && !clipped && blendMode === "Normal" && !ambiguous) {
    const reason = "The source image carries an attached soft mask. Source transform/deletion is qualified because the original MuPDF Image (including its mask) is reused; replacement is blocked because a new bitmap cannot safely inherit the source mask.";
    return {
      editability: "replace-region",
      fidelity: {
        class: "masked",
        resourceName: evidence.resourceName,
        invocationCount,
        softMask,
        explicitMask,
        clipped,
        blendMode,
        verified: true,
        allowedActions: ["transform", "delete"],
        reason
      },
      capability: capability(
        "safe-reconstruction",
        "Masked source image",
        0.9,
        reason,
        ["Attached soft mask", "Other image instances", "Neighboring text/vector content", "Page count"],
        ["Replacement is blocked; source transforms may recompress encoded image bytes."]
      )
    };
  }

  const reasons = [
    ambiguous ? "the structured image could not be matched one-to-one with a page image invocation" : "",
    softMask ? "a soft mask is attached to the source image" : "",
    explicitMask ? "an explicit image mask is attached to the source image" : "",
    clipped ? "the image is painted inside an inherited clipping region" : "",
    blendMode !== "Normal" ? `the image uses ${blendMode} blending` : ""
  ].filter(Boolean);
  const reason = `This image remains inspectable but direct mutation is blocked because ${reasons.join(", ")}.`;
  return {
    editability: "fidelity-protected",
    fidelity: {
      class: fidelityClass,
      resourceName: evidence.resourceName,
      invocationCount,
      softMask,
      explicitMask,
      clipped,
      blendMode,
      verified: !ambiguous,
      allowedActions: [],
      reason
    },
    capability: capability(
      "unsupported",
      "Fidelity protected",
      ambiguous ? 0.55 : 1,
      reason,
      ["Original masks/clipping/blending", "Shared-resource semantics", "Neighboring page content"],
      ["Flattening or region replacement could change transparency, clipping, or compositing behavior."]
    )
  };
}

function relativeSpread(values: number[]): number {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positive.length < 2) return 0;
  const average = positive.reduce((sum, value) => sum + value, 0) / positive.length;
  return (Math.max(...positive) - Math.min(...positive)) / Math.max(1, average);
}

export function classifyTableGeometry(rowHeights: number[], columnWidths: number[], mergedCells: number): NonNullable<NativeTableObject["geometryKind"]> {
  const irregular = Math.max(relativeSpread(rowHeights), relativeSpread(columnWidths)) > 0.35;
  if (mergedCells > 0 && irregular) return "merged-irregular";
  if (mergedCells > 0) return "merged";
  if (irregular) return "irregular";
  if (Math.max(relativeSpread(rowHeights), relativeSpread(columnWidths)) > 0.08) return "nonuniform";
  return "regular";
}

const COMPLEX_VECTOR_SPACES = new Set(["Lab", "Indexed", "Separation", "Pattern", "Unknown"]);

export function vectorAppearanceOverrideRisks(vector: Pick<NativeVectorObject, "clipped" | "blendMode" | "fillColorSpace" | "strokeColorSpace" | "paint">): string[] {
  const risks: string[] = [];
  if (vector.clipped) risks.push("the path is inside an inherited clipping region");
  if (vector.blendMode !== "Normal") risks.push(`the source uses ${vector.blendMode} blending`);
  const spaces = vector.paint === "fill"
    ? [vector.fillColorSpace]
    : vector.paint === "stroke"
      ? [vector.strokeColorSpace]
      : [vector.fillColorSpace, vector.strokeColorSpace];
  const complex = spaces.filter((space): space is NonNullable<typeof space> => Boolean(space) && COMPLEX_VECTOR_SPACES.has(space!));
  if (complex.length) risks.push(`the source appearance uses ${[...new Set(complex)].join("/")} color state`);
  return risks;
}
