import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import homeSource from "../../src/views/HomePage.tsx?raw";

interface FakeCache {
  keys: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
}

function installCache(cache: FakeCache) {
  const storage = { open: vi.fn(async () => cache) };
  vi.stubGlobal("caches", storage);
  return storage;
}

function consumedStorageKey(): string | null {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.endsWith("-consumed-v1")) return key;
  }
  return null;
}

describe("share inbox consumption reliability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("never drops duplicate-import tombstones just because more than 100 cached documents await deletion", async () => {
    const ids = Array.from({ length: 110 }, (_, index) =>
      new URL(`./__share_inbox__/retained-${index}`, document.baseURI).toString()
    );
    let activeIds = [...ids];
    const cache: FakeCache = {
      keys: vi.fn(async () => activeIds.map((id) => new Request(id))),
      delete: vi.fn(async () => false),
      match: vi.fn(async () => new Response("should not be read"))
    };
    installCache(cache);

    const { acknowledgeSharedInboxFiles, listSharedInboxFiles } = await import("../../src/pwa/shareInbox");
    await acknowledgeSharedInboxFiles(ids);

    const key = consumedStorageKey();
    expect(key).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(key!) ?? "[]")).toHaveLength(110);
    await expect(listSharedInboxFiles()).resolves.toEqual([]);
    expect(cache.match).not.toHaveBeenCalled();

    activeIds = [];
    await expect(listSharedInboxFiles()).resolves.toEqual([]);
    expect(consumedStorageKey()).toBeNull();
  });

  it("keeps a consumed entry hidden when physical Cache Storage deletion throws", async () => {
    const id = new URL("./__share_inbox__/retained-error", document.baseURI).toString();
    const cache: FakeCache = {
      keys: vi.fn(async () => [new Request(id)]),
      delete: vi.fn(async () => { throw new Error("Cache delete failed"); }),
      match: vi.fn(async () => new Response("should not be read"))
    };
    installCache(cache);

    const { acknowledgeSharedInboxFiles, listSharedInboxFiles } = await import("../../src/pwa/shareInbox");
    await expect(acknowledgeSharedInboxFiles([id])).resolves.toBeUndefined();
    await expect(listSharedInboxFiles()).resolves.toEqual([]);
    expect(cache.match).not.toHaveBeenCalled();
  });

  it("logically acknowledges unsupported shared entries instead of relying on physical deletion alone", () => {
    expect(homeSource).not.toContain("removeSharedInboxFiles");
    expect(homeSource).toContain("else await acknowledgeSharedInboxFiles([shared.id]);");
  });

  it("retires a consumed tombstone only after a later physical cleanup succeeds", async () => {
    const id = new URL("./__share_inbox__/retry-cleanup", document.baseURI).toString();
    let active = true;
    let attempts = 0;
    const cache: FakeCache = {
      keys: vi.fn(async () => active ? [new Request(id)] : []),
      delete: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) return false;
        active = false;
        return true;
      }),
      match: vi.fn(async () => new Response("must not be imported"))
    };
    installCache(cache);

    const { acknowledgeSharedInboxFiles, listSharedInboxFiles } = await import("../../src/pwa/shareInbox");
    await acknowledgeSharedInboxFiles([id]);
    expect(consumedStorageKey()).not.toBeNull();
    await expect(listSharedInboxFiles()).resolves.toEqual([]);
    expect(consumedStorageKey()).toBeNull();
    expect(cache.delete).toHaveBeenCalledTimes(2);
    expect(cache.match).not.toHaveBeenCalled();
  });

  it("never exposes an incomplete batch when a later put fails and rollback deletion returns false", async () => {
    // Node's native Response requires a streamed File body; jsdom's File
    // has no stream() and otherwise fails before Cache.put is exercised.
    // @ts-ignore -- Vitest runs in Node, but the production TS config excludes Node types.
    const { File: NativeFile } = await import("node:buffer");
    vi.stubGlobal("File", NativeFile);
    const entries = new Map<string, Response>();
    let written = 0;
    const cache = {
      keys: vi.fn(async () => [...entries.keys()].map((id) => new Request(id))),
      match: vi.fn(async (request: Request) => entries.get(request.url)),
      put: vi.fn(async (url: string, response: Response) => {
        entries.set(url, response);
        written++;
        // The second attempted write may leave a partial Cache Storage entry.
        if (written === 2) throw new Error("QuotaExceededError");
      }),
      delete: vi.fn(async () => false)
    };
    installCache(cache);

    const { storeSharedInboxFiles, listSharedInboxFiles } = await import("../../src/pwa/shareInbox");
    await expect(storeSharedInboxFiles([
      new File(["first"], "first.pdf", { type: "application/pdf" }),
      new File(["second"], "second.pdf", { type: "application/pdf" })
    ])).rejects.toThrow("QuotaExceededError");

    expect(entries.size).toBe(2);
    // Neither committed file belongs to an accepted batch; stale bytes should
    // be logically consumed even while physical Cache Storage removal fails.
    await expect(listSharedInboxFiles()).resolves.toEqual([]);
    expect(cache.match).not.toHaveBeenCalled();
    const key = consumedStorageKey();
    expect(key).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(key!) ?? "[]")).toHaveLength(2);
  });

  it("never re-exposes failed launch files when localStorage tombstones and Cache.delete both fail", async () => {
    // @ts-ignore -- Native Node File supplies a stream() for Response in Vitest.
    const { File: NativeFile } = await import("node:buffer");
    vi.stubGlobal("File", NativeFile);
    const entries = new Map<string, Response>();
    let writes = 0;
    const cache = {
      keys: vi.fn(async () => [...entries.keys()].map((key) => new Request(key))),
      match: vi.fn(async (request: Request) => entries.get(request.url)),
      put: vi.fn(async (url: string, response: Response) => {
        entries.set(url, response);
        if (++writes === 2) throw new Error("Synthetic quota after partial write");
      }),
      delete: vi.fn(async () => false)
    };
    installCache(cache);
    const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    });
    try {
      const { storeSharedInboxFiles, listSharedInboxFiles } = await import("../../src/pwa/shareInbox");
      await expect(storeSharedInboxFiles([
        new File(["first"], "first.pdf", { type: "application/pdf" }),
        new File(["second"], "second.pdf", { type: "application/pdf" })
      ])).rejects.toThrow("Synthetic quota after partial write");
      expect(entries.size).toBe(2);
      await expect(listSharedInboxFiles()).resolves.toEqual([]);
      expect(cache.match).not.toHaveBeenCalled();
    } finally { blocked.mockRestore(); }
  });
});
