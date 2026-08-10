import type { InstalledOcrLanguage } from "../types/ocr";
import { deleteInstalledLanguageRecord, listInstalledLanguages, writeInstalledLanguage } from "./ocrRepository";
import { OCR_LANGUAGE_CACHE } from "../release/cacheNames";
import { deploymentAssetUrl } from "../release/deployment";

const CACHE_NAME = OCR_LANGUAGE_CACHE;
const LEGACY_CACHE_NAME = "local-pdf-studio-ocr-languages-v1";
let migrationPromise: Promise<void> | null = null;
const LABELS: Record<string, string> = {
  eng: "English", deu: "German", fra: "French", kor: "Korean", chi_sim: "Chinese (Simplified)", ara: "Arabic", spa: "Spanish", ita: "Italian", tur: "Turkish"
};

export const COMMON_OCR_LANGUAGES = Object.entries(LABELS).map(([code, label]) => ({ code, label }));

function localUrl(code: string): string {
  return deploymentAssetUrl(`ocr-languages/${encodeURIComponent(code)}.traineddata.gz`);
}

export function ocrLanguageBaseUrl(): string {
  return deploymentAssetUrl("ocr-languages").replace(/\/$/, "");
}

async function ensureLanguageCacheMigration(): Promise<void> {
  if (CACHE_NAME === LEGACY_CACHE_NAME) return;
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const records = await listInstalledLanguages();
    if (!records.length) return;
    const [current, legacy] = await Promise.all([caches.open(CACHE_NAME), caches.open(LEGACY_CACHE_NAME)]);
    for (const record of records) {
      const url = localUrl(record.code);
      if (await current.match(url)) continue;
      const response = await legacy.match(url);
      if (response) await current.put(url, response.clone());
    }
  })();
  return migrationPromise;
}

export async function installLanguageFromNetwork(code: string): Promise<InstalledOcrLanguage> {
  await ensureLanguageCacheMigration();
  const label = LABELS[code] ?? code;
  const remote = `https://tessdata.projectnaptha.com/4.0.0_best/${encodeURIComponent(code)}.traineddata.gz`;
  const response = await fetch(remote, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error(`Language download failed (${response.status}).`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 1024) throw new Error("The downloaded language pack is unexpectedly small.");
  const cache = await caches.open(CACHE_NAME);
  await cache.put(localUrl(code), new Response(bytes, { headers: { "Content-Type": "application/gzip", "Content-Length": String(bytes.byteLength) } }));
  const record: InstalledOcrLanguage = { code, label, byteLength: bytes.byteLength, source: "download", installedAt: Date.now() };
  await writeInstalledLanguage(record);
  return record;
}

export async function importLanguagePack(code: string, file: File): Promise<InstalledOcrLanguage> {
  await ensureLanguageCacheMigration();
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength < 1024) throw new Error("The language pack is unexpectedly small.");
  const cache = await caches.open(CACHE_NAME);
  await cache.put(localUrl(code), new Response(bytes, { headers: { "Content-Type": "application/gzip", "Content-Length": String(bytes.byteLength) } }));
  const record: InstalledOcrLanguage = { code, label: LABELS[code] ?? code, byteLength: bytes.byteLength, source: "import", installedAt: Date.now() };
  await writeInstalledLanguage(record);
  return record;
}

export async function removeLanguagePack(code: string): Promise<void> {
  await ensureLanguageCacheMigration();
  const cache = await caches.open(CACHE_NAME);
  await cache.delete(localUrl(code));
  await deleteInstalledLanguageRecord(code);
}

export async function isLanguageInstalled(code: string): Promise<boolean> {
  await ensureLanguageCacheMigration();
  const records = await listInstalledLanguages();
  if (!records.some((record) => record.code === code)) return false;
  const cache = await caches.open(CACHE_NAME);
  return Boolean(await cache.match(localUrl(code)));
}
