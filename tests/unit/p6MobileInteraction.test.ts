import { describe, expect, it } from "vitest";
import organizerSource from "../../src/views/OrganizerPage.tsx?raw";
import thumbnailSource from "../../src/organizer/OrganizerThumbnail.tsx?raw";
import viewportSource from "../../src/mobile/MobileViewportManager.tsx?raw";
// @ts-expect-error Vitest runs in Node; the browser app tsconfig intentionally excludes Node built-in typings.
import { readFileSync } from "node:fs";
import databaseSource from "../../src/storage/database.ts?raw";
import releaseSource from "../../src/core/release.ts?raw";

const mobileCss = readFileSync(new URL("../../src/product/mobile-interaction.css", import.meta.url), "utf8");

describe("P6 mobile interaction excellence", () => {
  it("does not require drag-and-drop for page reordering", () => {
    expect(thumbnailSource).toContain("organizer-page__touch-actions");
    expect(thumbnailSource).toContain("Move page");
    expect(organizerSource).toContain("moveItemsBy");
    expect(organizerSource).toContain("Move selected pages to position");
    expect(organizerSource).toContain("moveItemsToPosition");
  });

  it("tracks the complete VisualViewport rectangle and coalesces updates", () => {
    expect(viewportSource).toContain("viewport?.offsetLeft");
    expect(viewportSource).toContain("--visual-viewport-offset-left");
    expect(viewportSource).toContain("requestAnimationFrame(update)");
  });

  it("pins mobile modal surfaces to live viewport coordinates", () => {
    expect(mobileCss).toContain("left:var(--visual-viewport-offset-left");
    expect(mobileCss).toContain("top:var(--visual-viewport-offset-top");
    expect(mobileCss).toContain("height:var(--app-viewport-height");
    expect(mobileCss).toContain("min-height:44px");
  });

  it("keeps persistent release formats frozen", () => {
    expect(databaseSource).toContain("DB_VERSION = 13");
    expect(releaseSource).toContain("DATABASE_SCHEMA_VERSION = 13");
    expect(releaseSource).toContain("PROJECT_PACKAGE_VERSION = 9");
  });
});
