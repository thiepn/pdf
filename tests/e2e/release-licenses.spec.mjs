import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";

/** A separate origin can be stopped without interrupting parallel browser tests.
 * Serve the exact verified dist, with no HTTP-cache fallback or synthetic SW. */
async function startReleaseOrigin(base) {
  const dist = resolve("dist");
  const requests = [];
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };
  const server = createServer(async (request, response) => {
    requests.push(request.url);
    response.setHeader("Cache-Control", "no-store");
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      if (request.method !== "GET" || !pathname.startsWith(base)) {
        response.writeHead(404); response.end("Not found"); return;
      }
      const file = resolve(dist, pathname.slice(base.length) || "index.html");
      if (!file.startsWith(dist + sep)) { response.writeHead(403); response.end(); return; }
      const bytes = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
      response.end(bytes);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    listening: () => server.listening,
    stop: () => new Promise((done, fail) => {
      if (!server.listening) { done(); return; }
      server.close(error => error ? fail(error) : done());
      server.closeAllConnections();
    })
  };
}

test("release licences remain available from the service worker when the origin is stopped", async ({ page, baseURL }, testInfo) => {
  const base = new URL(baseURL).pathname;
  const server = await startReleaseOrigin(base);
  const served = [];
  const licencePaths = ["license-inventory.json", "LICENSE.txt", "THIRD_PARTY_NOTICES.txt"];
  let disconnected = false;
  page.on("response", response => {
    if (disconnected && licencePaths.some(file => response.url() === `${server.origin}${base}${file}`)) {
      served.push({ url: response.url(), status: response.status(), fromServiceWorker: response.fromServiceWorker() });
    }
  });
  try {
    await page.goto(`${server.origin}${base}#/home`);
    await expect(page.getByRole("button", { name: "Choose files", exact: true })).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // WebKit's setOffline emulation can reject even literal SW responses:
    // https://github.com/microsoft/playwright/issues/42775
    // Stop a real isolated origin for EVERY engine instead: no skips, retries,
    // route fulfilment, cache warming, or browser-specific weaker assertions.
    await server.stop();
    expect(server.listening()).toBe(false);
    const requestCount = server.requests.length;
    disconnected = true;
    const uncachedNetworkAvailable = await page.evaluate(async origin => {
      try { await fetch(`${origin}/__uncached-network-probe__`, { cache: "no-store" }); return true; }
      catch { return false; }
    }, server.origin);
    expect(uncachedNetworkAvailable).toBe(false);

    const result = await page.evaluate(async () => {
      const response = await fetch(new URL("license-inventory.json", document.baseURI));
      if (!response.ok) throw new Error(`Licence inventory: HTTP ${response.status}`);
      const inventory = await response.json();
      const files = await Promise.all(inventory.files.map(async file => {
        const response = await fetch(new URL(file.path, document.baseURI));
        const bytes = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
        return { path: file.path, status: response.status, expectedHash: file.sha256, hash, expectedBytes: file.bytes, bytes: bytes.byteLength };
      }));
      return { inventory, files };
    });
    expect(result.inventory.schemaVersion).toBe(1);
    expect(result.inventory.application.version).toBe("7.1.4");
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
    await expect.poll(() => served.length).toBe(3);
    expect(new Set(served.map(item => item.url)).size).toBe(3);
    expect(served.every(item => item.status === 200 && item.fromServiceWorker)).toBe(true);
    expect(server.requests.length).toBe(requestCount);
    await testInfo.attach("offline-licence-proof", {
      body: JSON.stringify({ outage: "origin-server-stopped", originListening: server.listening(), uncachedNetworkAvailable, originRequestsDuringOutage: server.requests.length - requestCount, served, files: result.files }, null, 2),
      contentType: "application/json"
    });
  } finally {
    await server.stop();
  }
});
