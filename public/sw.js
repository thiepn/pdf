const RELEASE_VERSION = "__LPS_RELEASE_VERSION__";
const RELEASE_CHANNEL = "__LPS_RELEASE_CHANNEL__";
const RELEASE_BUILD_EPOCH = Number("__LPS_RELEASE_BUILD_EPOCH__") || 0;
const SCOPE_PATH = new URL("./", self.location.href).pathname;
const SCOPE_TOKEN = SCOPE_PATH.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "root";
const APP_CACHE_PREFIX = `local-pdf-studio-${SCOPE_TOKEN}-`;
const RELEASE_CACHE_PREFIX = `${APP_CACHE_PREFIX}release-`;
const CACHE_VERSION = `${RELEASE_CACHE_PREFIX}${RELEASE_VERSION}-${RELEASE_CHANNEL}-${RELEASE_BUILD_EPOCH}`;
const OCR_LANGUAGE_CACHE = `${APP_CACHE_PREFIX}ocr-languages-v1`;
const SHARE_INBOX_CACHE = `${APP_CACHE_PREFIX}share-inbox-v1`;
const OFFLINE_MANIFEST = "./offline-assets.json";
const CORE = ["./", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./color/srgb-artifex.icc"];
const SHARE_TARGET_PATH = new URL("./share-target", self.registration.scope).pathname;

function absoluteAsset(relative) {
  return new URL(relative, self.registration.scope).toString();
}

async function readOfflineAssetList(cache) {
  const manifestUrl = absoluteAsset(OFFLINE_MANIFEST);
  const response = (await cache.match(manifestUrl)) ?? (await fetch(manifestUrl, { cache: "no-store" }).catch(() => null));
  if (!response?.ok) return [];
  const manifest = await response.clone().json().catch(() => null);
  return Array.isArray(manifest?.assets) ? manifest.assets.filter((value) => typeof value === "string") : [];
}

function isStampedProductionRelease() {
  return !RELEASE_VERSION.startsWith("__LPS_RELEASE_");
}

async function assertNoSameVersionStableDowngrade() {
  if (RELEASE_CHANNEL !== "release-candidate") return;
  const current = releaseDescriptorFromCache(CACHE_VERSION);
  if (!current) return;
  const keys = await caches.keys();
  const stablePeer = keys
    .map((key) => ({ key, descriptor: releaseDescriptorFromCache(key) }))
    .find(({ descriptor }) => descriptor && compareVersion(descriptor.version, current.version) === 0 && descriptor.channel === "stable");
  if (stablePeer) throw new Error(`Refusing to replace same-version Stable cache ${stablePeer.key} with a release-candidate build.`);
}

async function refreshCurrentReleaseCache() {
  await assertNoSameVersionStableDowngrade();
  const cache = await caches.open(CACHE_VERSION);
  const manifestUrl = absoluteAsset(OFFLINE_MANIFEST);
  const response = await fetch(manifestUrl, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) throw new Error("The offline asset manifest is unavailable; the existing offline shell was preserved.");
  const manifest = await response.clone().json().catch(() => null);
  const assets = Array.isArray(manifest?.assets) ? manifest.assets.filter((value) => typeof value === "string") : [];
  if (isStampedProductionRelease() && !assets.length) throw new Error("The offline asset manifest is empty; the existing offline shell was preserved.");

  const expectedUrls = [...new Set([...CORE, OFFLINE_MANIFEST, ...assets].map(absoluteAsset))];
  // Fetch the complete replacement set before pruning anything. Cache.addAll is
  // all-or-nothing for the requested batch, so a network failure leaves the
  // previous working shell intact rather than converting maintenance into an
  // offline data-loss event.
  await cache.addAll([...new Set([...CORE, ...assets].map(absoluteAsset))]);
  await cache.put(manifestUrl, response);
  const expected = new Set(expectedUrls);
  const keys = await cache.keys();
  await Promise.all(keys.filter((request) => !expected.has(request.url)).map((request) => cache.delete(request)));
  await cleanupPreviousReleaseCaches();
  return offlineStatus();
}

async function precacheRelease() {
  await assertNoSameVersionStableDowngrade();
  const cache = await caches.open(CACHE_VERSION);
  try {
    await cache.addAll(CORE.map(absoluteAsset));
    const manifestUrl = absoluteAsset(OFFLINE_MANIFEST);
    const response = await fetch(manifestUrl, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      if (isStampedProductionRelease()) throw new Error("Production offline asset manifest is unavailable.");
      return; // Development mode has no generated asset manifest.
    }
    await cache.put(manifestUrl, response.clone());
    const manifest = await response.json();
    const assets = Array.isArray(manifest?.assets) ? manifest.assets.filter((value) => typeof value === "string") : [];
    if (isStampedProductionRelease() && !assets.length) throw new Error("Production offline asset manifest is empty.");
    if (assets.length) await cache.addAll([...new Set(assets.map(absoluteAsset))]);
  } catch (reason) {
    await caches.delete(CACHE_VERSION);
    throw reason;
  }
}

function releaseDescriptorFromCache(key) {
  if (!key.startsWith(RELEASE_CACHE_PREFIX)) return null;
  const suffix = key.slice(RELEASE_CACHE_PREFIX.length);
  const versionMatch = /^(\d+)\.(\d+)\.(\d+)(?:-phase(\d+))?/.exec(suffix);
  if (!versionMatch) return null;
  const version = [Number(versionMatch[1]), Number(versionMatch[2]), Number(versionMatch[3]), Number(versionMatch[4] || 0)];
  const remainder = suffix.slice(versionMatch[0].length);
  const identityMatch = /^-(release-candidate|stable)-(\d+)$/.exec(remainder);
  return {
    version,
    channel: identityMatch?.[1] ?? "legacy",
    buildEpoch: identityMatch ? Number(identityMatch[2]) : 0
  };
}

function compareVersion(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta) return delta;
  }
  return 0;
}

function channelRank(channel) {
  if (channel === "stable") return 2;
  if (channel === "release-candidate") return 1;
  return 0;
}

function isSupersededReleaseCache(key) {
  if (key === CACHE_VERSION) return false;
  const candidate = releaseDescriptorFromCache(key);
  const current = releaseDescriptorFromCache(CACHE_VERSION);
  if (!candidate || !current) return false;
  const versionOrder = compareVersion(candidate.version, current.version);
  if (versionOrder < 0) return true;
  if (versionOrder > 0) return false;
  const candidateChannelRank = channelRank(candidate.channel);
  const currentChannelRank = channelRank(current.channel);
  if (candidateChannelRank < currentChannelRank) return true;
  if (candidateChannelRank > currentChannelRank) return false;
  if (candidate.buildEpoch < current.buildEpoch) return true;
  if (candidate.buildEpoch > current.buildEpoch) return false;
  return false;
}

async function cleanupPreviousReleaseCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(isSupersededReleaseCache).map((key) => caches.delete(key)));
}

async function offlineStatus() {
  const cache = await caches.open(CACHE_VERSION);
  const generated = await readOfflineAssetList(cache);
  const expectedUrls = [...new Set([...CORE, OFFLINE_MANIFEST, ...generated].map(absoluteAsset))];
  const missing = [];
  for (const url of expectedUrls) if (!(await cache.match(url))) missing.push(url);
  return {
    version: RELEASE_VERSION,
    channel: RELEASE_CHANNEL,
    buildEpoch: RELEASE_BUILD_EPOCH,
    cache: CACHE_VERSION,
    scopePath: SCOPE_PATH,
    ready: generated.length > 0 && missing.length === 0,
    expectedAssets: expectedUrls.length,
    cachedAssets: expectedUrls.length - missing.length,
    missingAssets: missing.map((url) => new URL(url).pathname)
  };
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheRelease());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_RELEASE_VERSION") event.ports?.[0]?.postMessage({ version: RELEASE_VERSION, channel: RELEASE_CHANNEL, buildEpoch: RELEASE_BUILD_EPOCH, cache: CACHE_VERSION, scopePath: SCOPE_PATH });
  if (event.data?.type === "GET_OFFLINE_STATUS") event.waitUntil(offlineStatus().then((status) => event.ports?.[0]?.postMessage(status)));
  if (event.data?.type === "REFRESH_RELEASE_CACHE") event.waitUntil(refreshCurrentReleaseCache().then((status) => event.ports?.[0]?.postMessage({ ok: true, status })).catch((reason) => event.ports?.[0]?.postMessage({ ok: false, error: reason instanceof Error ? reason.message : String(reason) })));
  if (event.data?.type === "CLIENT_HEALTHY") event.waitUntil(cleanupPreviousReleaseCaches().then(() => event.ports?.[0]?.postMessage({ ok: true })));
});

self.addEventListener("activate", (event) => {
  // Previous release caches remain intact until the newly loaded client reports a healthy boot.
  event.waitUntil(self.clients.claim());
});

async function navigationResponse() {
  const cache = await caches.open(CACHE_VERSION);
  const shellUrl = absoluteAsset("./");
  const cached = await cache.match(shellUrl);
  if (cached) return cached;
  const response = await fetch(shellUrl);
  if (response.ok) await cache.put(shellUrl, response.clone());
  return response;
}

async function assetResponse(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

function supportedSharedFile(file) {
  const name = String(file?.name ?? "").toLowerCase();
  const type = String(file?.type ?? "").toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf") || name.endsWith(".lpsproject");
}

async function receiveShareTarget(request) {
  const form = await request.formData();
  const candidates = form.getAll("files").filter((entry) => typeof entry !== "string" && supportedSharedFile(entry)).slice(0, 10);
  if (!candidates.length) return Response.redirect(absoluteAsset("./#/home"), 303);
  const cache = await caches.open(SHARE_INBOX_CACHE);
  const stamp = `${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const inserted = [];
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const file = candidates[index];
      const key = new URL(`./__share_inbox__/${stamp}-${index}`, self.registration.scope).toString();
      await cache.put(key, new Response(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Local-Pdf-Studio-Filename": encodeURIComponent(file.name || `shared-${index + 1}.pdf`)
        }
      }));
      inserted.push(key);
    }
  } catch (reason) {
    await Promise.allSettled(inserted.map((key) => cache.delete(key)));
    throw reason;
  }
  return Response.redirect(absoluteAsset("./#/home"), 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;

  if (event.request.method === "POST" && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(receiveShareTarget(event.request));
    return;
  }
  if (event.request.method !== "GET" || event.request.headers.has("range")) return;

  event.respondWith((async () => {
    if (url.pathname.includes("/ocr-languages/") && url.pathname.endsWith(".traineddata.gz")) {
      const languageCache = await caches.open(OCR_LANGUAGE_CACHE);
      return (await languageCache.match(event.request)) ?? new Response("OCR language pack is not installed.", { status: 404 });
    }
    if (event.request.mode === "navigate") return navigationResponse();
    return assetResponse(event.request);
  })());
});
