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
});
