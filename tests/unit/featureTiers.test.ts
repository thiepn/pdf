import { describe, expect, it } from "vitest";
import { consumerRuntimePolicy, featureTier, featureTiers } from "../../src/app/featureTiers";

describe("consumer runtime tiers", () => {
  it("keeps enterprise security out of the default browser bundle", () => {
    expect(consumerRuntimePolicy.enterpriseSecurityInDefaultBundle).toBe(false);
    expect(consumerRuntimePolicy.nativeIntegrationRequiredForBrowser).toBe(false);
    expect(featureTier("enterprise-archive").defaultBrowserBundle).toBe(false);
    expect(featureTier("enterprise-archive").visibleByDefault).toBe(false);
  });

  it("keeps advanced PDF tools available but on demand", () => {
    const onDemand = featureTier("on-demand");
    expect(onDemand.defaultBrowserBundle).toBe(false);
    expect(onDemand.visibleByDefault).toBe(true);
    expect(onDemand.examples).toContain("OCR");
    expect(onDemand.examples).toContain("compare");
  });

  it("has exactly one eager consumer tier", () => {
    expect(featureTiers.filter((tier) => tier.defaultBrowserBundle).map((tier) => tier.id)).toEqual(["core"]);
  });
});
