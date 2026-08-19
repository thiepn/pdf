export type FeatureTier = "core" | "on-demand" | "desktop-optional" | "enterprise-archive";

export interface FeatureTierDefinition {
  id: FeatureTier;
  label: string;
  purpose: string;
  defaultBrowserBundle: boolean;
  visibleByDefault: boolean;
  examples: readonly string[];
}

export const featureTiers: readonly FeatureTierDefinition[] = [
  {
    id: "core",
    label: "Consumer core",
    purpose: "The minimum fast path required to open PDF Studio, open a PDF, read it, edit common content, and manage pages.",
    defaultBrowserBundle: true,
    visibleByDefault: true,
    examples: ["home", "viewer", "editor", "page organizer", "basic toolbox", "project storage"]
  },
  {
    id: "on-demand",
    label: "On-demand PDF tools",
    purpose: "High-value PDF capabilities that should load only when the user invokes them.",
    defaultBrowserBundle: false,
    visibleByDefault: true,
    examples: ["OCR", "compare", "batch", "repair", "accessibility", "PDF/A", "advanced inspection", "scan", "conversion"]
  },
  {
    id: "desktop-optional",
    label: "Desktop companion",
    purpose: "Capabilities that genuinely need native operating-system integration and must never be required by the browser app.",
    defaultBrowserBundle: false,
    visibleByDefault: false,
    examples: ["native certificate stores", "scanner drivers", "watched folders", "PKCS#11", "CLI", "shell integration"]
  },
  {
    id: "enterprise-archive",
    label: "Enterprise security archive",
    purpose: "C.19-C.45 research and enterprise governance work retained for possible future use but excluded from normal consumer startup and navigation.",
    defaultBrowserBundle: false,
    visibleByDefault: false,
    examples: ["PQ trust migration", "fleet governance", "zero trust", "federation", "device attestation", "enterprise release qualification"]
  }
] as const;

export const consumerRuntimePolicy = Object.freeze({
  enterpriseSecurityInDefaultBundle: false,
  nativeIntegrationRequiredForBrowser: false,
  advancedPdfToolsLoadOnDemand: true,
  userDocumentsRemainLocal: true,
  mandatoryCloudServices: false
});

export function featureTier(id: FeatureTier): FeatureTierDefinition {
  const tier = featureTiers.find((candidate) => candidate.id === id);
  if (!tier) throw new Error(`Unknown PDF Studio feature tier: ${id}`);
  return tier;
}
