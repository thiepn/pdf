import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");
const origin = "https://example.test";
const asset = `${origin}/pdf/assets/engine.wasm`;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function worker(options = {}) {
  const listeners = new Map(), fetched = [], written = [];
  const cache = {
    match: options.match ?? (async () => undefined),
    put: async (request, response) => {
      written.push({ request, response });
      if (options.put) return options.put(request, response);
    }
  };
  const scope = { location: { href: `${origin}/pdf/sw.js`, origin }, registration: { scope: `${origin}/pdf/` },
    addEventListener: (name, listener) => listeners.set(name, listener) };
  runInNewContext(source, { self: scope, URL, Response, crypto: globalThis.crypto,
    caches: { open: options.open ?? (async () => cache) },
    fetch: async request => { fetched.push(request); return options.fetch ? options.fetch(request) : new Response("engine bytes", { headers: { "Content-Type": "application/wasm" } }); }
  });
  function dispatch(request = { url: asset, method: "GET", mode: "cors", headers: new Headers() }) {
    const waits = [];
    let response, handling = true;
    listeners.get("fetch")({ request,
      respondWith: promise => { response = promise; },
      waitUntil: promise => { assert.ok(handling, "waitUntil must be registered during the fetch callback"); waits.push(promise); }
    });
    handling = false;
    return { response, waits };
  }
  return { dispatch, fetched, written };
}

describe("runtime cache writes never gate document tools", () => {
  it("delivers a cold engine response while cache.put remains pending", async () => {
    const pending = deferred();
    const runtime = worker({ put: () => pending.promise });
    const event = runtime.dispatch();
    let served = false;
    event.response.then(() => { served = true; });
    await tick();
    assert.equal(served, true, "a pending cache write must not hold the network response");
    assert.equal(await (await event.response).text(), "engine bytes");
    assert.equal(event.waits.length, 1, "cache persistence has its own event lifetime");
    let persisted = false;
    Promise.all(event.waits).then(() => { persisted = true; });
    await tick(); assert.equal(persisted, false);
    pending.resolve(); await Promise.all(event.waits);
    assert.equal(await runtime.written[0].response.text(), "engine bytes");
  });

  it("delivers successful network bytes when storage rejects the write", async () => {
    const runtime = worker({ put: async () => { throw new Error("QuotaExceededError"); } });
    const event = runtime.dispatch();
    assert.equal(await (await event.response).text(), "engine bytes");
    await Promise.all(event.waits);
    assert.equal(runtime.fetched.length, 1);
  });

  it("falls back to network when cache access or lookup fails", async () => {
    for (const options of [
      { open: async () => { throw new Error("Storage is unavailable"); } },
      { match: async () => { throw new Error("Cache lookup failed"); } }
    ]) {
      const runtime = worker(options);
      const event = runtime.dispatch();
      assert.equal(await (await event.response).text(), "engine bytes");
      await Promise.all(event.waits);
      assert.equal(runtime.fetched.length, 1);
    }
  });

  it("serves a cached immutable asset offline without a network request", async () => {
    const runtime = worker({ match: async (request, options) => {
      assert.equal(options.ignoreVary, true);
      return new Response("cached engine");
    }, fetch: async () => { throw new Error("offline"); } });
    const event = runtime.dispatch();
    assert.equal(await (await event.response).text(), "cached engine");
    await Promise.all(event.waits);
    assert.equal(runtime.fetched.length, 0);
    assert.equal(runtime.written.length, 0);
  });

  it("serves navigation fallback without waiting for cache persistence", async () => {
    const pending = deferred();
    const runtime = worker({ put: () => pending.promise });
    const event = runtime.dispatch({ url: `${origin}/pdf/`, method: "GET", mode: "navigate", headers: new Headers() });
    let served = false; event.response.then(() => { served = true; });
    await tick(); assert.equal(served, true);
    assert.equal(runtime.fetched[0], `${origin}/pdf/`);
    pending.resolve(); await Promise.all(event.waits);
  });

  it("does not cache server errors or hide genuine network failures", async () => {
    const runtime = worker({ fetch: async () => new Response("unavailable", { status: 503 }) });
    const event = runtime.dispatch();
    assert.equal((await event.response).status, 503);
    await Promise.all(event.waits);
    assert.equal(runtime.written.length, 0);
    const offline = worker({ fetch: async () => { throw new Error("offline"); } }).dispatch();
    assert.equal((await offline.response).type, "error");
    await Promise.all(offline.waits);
  });

  it("does not intercept other apps, external hosts, non-GETs or range requests", () => {
    const runtime = worker();
    for (const request of [
      { url: `${origin}/other/engine.wasm` }, { url: "https://external.test/pdf/file" },
      { method: "POST" }, { headers: new Headers({ range: "bytes=0-10" }) }
    ]) {
      const event = runtime.dispatch({ url: asset, method: "GET", mode: "cors", headers: new Headers(), ...request });
      assert.equal(event.response, undefined); assert.equal(event.waits.length, 0);
    }
  });
});
