import { expect, test } from "@playwright/test";

test("release licences match installed versions and remain readable offline", async ({ page, context }) => {
  await page.goto("./#/home");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Do not warm these URLs: the install manifest must make them available.
  await context.setOffline(true);
  try {
    const result = await page.evaluate(async () => {
      const response = await fetch(new URL("license-inventory.json", document.baseURI));
      if (!response.ok) throw new Error(`Licence inventory: HTTP ${response.status}`);
      const inventory = await response.json() as {
        schemaVersion: number;
        application: { version: string };
        packages: { name: string; version: string }[];
        files: { path: string; sha256: string; bytes: number }[];
      };
      const files = await Promise.all(inventory.files.map(async file => {
        const response = await fetch(new URL(file.path, document.baseURI));
        const bytes = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
        return { path: file.path, status: response.status, expectedHash: file.sha256, hash, expectedBytes: file.bytes, bytes: bytes.byteLength };
      }));
      return { inventory, files };
    });
    expect(result.inventory.schemaVersion).toBe(1);
    expect(result.inventory.application.version).toBe("7.1.0");
    expect(result.inventory.packages).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "pdfjs-dist", version: "5.4.624" }),
      expect.objectContaining({ name: "mupdf", version: "1.28.0" }),
      expect.objectContaining({ name: "react", version: "19.2.8" })
    ]));
    expect(result.files.map(file => file.path).sort()).toEqual(["LICENSE.txt", "THIRD_PARTY_NOTICES.txt"]);
    for (const file of result.files) {
      expect(file.status).toBe(200);
      expect(file.hash).toBe(file.expectedHash);
      expect(file.bytes).toBe(file.expectedBytes);
      expect(file.bytes).toBeGreaterThan(1000);
    }
  } finally {
    await context.setOffline(false);
  }
});
