import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  deleteInstalledLanguageRecord: vi.fn(),
  listInstalledLanguages: vi.fn(),
  writeInstalledLanguage: vi.fn()
}));

vi.mock("../../src/ocr/ocrRepository", () => repository);

const LEGACY_CACHE_NAME = "local-pdf-studio-ocr-languages-v1";
const language = {
  code: "eng",
  label: "English",
  byteLength: 2048,
  source: "download" as const,
  installedAt: 1
};

interface FakeCache {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

function cacheStorage(current: FakeCache, legacy: FakeCache, legacyExists = true) {
  return {
    has: vi.fn(async (name: string) => name === LEGACY_CACHE_NAME && legacyExists),
    open: vi.fn(async (name: string) => name === LEGACY_CACHE_NAME ? legacy : current),
    delete: vi.fn(async () => true)
  };
}

describe("OCR language cache migration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    repository.listInstalledLanguages.mockResolvedValue([language]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies recorded packs into the namespaced cache and deletes the legacy cache", async () => {
    let stored: Response | undefined;
    const current: FakeCache = {
      match: vi.fn(async () => stored),
      put: vi.fn(async (_url: string, response: Response) => { stored = response; })
    };
    const legacyResponse = new Response(new Uint8Array(2048));
    const legacy: FakeCache = {
      match: vi.fn(async () => legacyResponse),
      put: vi.fn()
    };
    const storage = cacheStorage(current, legacy);
    vi.stubGlobal("caches", storage);

    const { isLanguageInstalled } = await import("../../src/ocr/languagePackManager");
    await expect(isLanguageInstalled("eng")).resolves.toBe(true);

    expect(current.put).toHaveBeenCalledOnce();
    expect(storage.delete).toHaveBeenCalledWith(LEGACY_CACHE_NAME);
  });

  it("removes an orphaned legacy cache even when no language metadata remains", async () => {
    repository.listInstalledLanguages.mockResolvedValue([]);
    const current: FakeCache = { match: vi.fn(), put: vi.fn() };
    const legacy: FakeCache = { match: vi.fn(), put: vi.fn() };
    const storage = cacheStorage(current, legacy);
    vi.stubGlobal("caches", storage);

    const { isLanguageInstalled } = await import("../../src/ocr/languagePackManager");
    await expect(isLanguageInstalled("eng")).resolves.toBe(false);

    expect(storage.delete).toHaveBeenCalledWith(LEGACY_CACHE_NAME);
    expect(storage.open).not.toHaveBeenCalled();
  });

  it("retries migration after a transient cache write failure instead of poisoning the session", async () => {
    let stored: Response | undefined;
    let failWrite = true;
    const current: FakeCache = {
      match: vi.fn(async () => stored),
      put: vi.fn(async (_url: string, response: Response) => {
        if (failWrite) throw new Error("QuotaExceededError");
        stored = response;
      })
    };
    const legacy: FakeCache = {
      match: vi.fn(async () => new Response(new Uint8Array(2048))),
      put: vi.fn()
    };
    const storage = cacheStorage(current, legacy);
    vi.stubGlobal("caches", storage);

    const { isLanguageInstalled } = await import("../../src/ocr/languagePackManager");
    await expect(isLanguageInstalled("eng")).rejects.toThrow("QuotaExceededError");
    expect(storage.delete).not.toHaveBeenCalled();

    failWrite = false;
    await expect(isLanguageInstalled("eng")).resolves.toBe(true);

    expect(storage.has).toHaveBeenCalledTimes(2);
    expect(storage.delete).toHaveBeenCalledWith(LEGACY_CACHE_NAME);
  });
});
