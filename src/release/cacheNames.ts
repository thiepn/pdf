import { APP_VERSION } from "../core/release";
import { cacheNamespaceForBase } from "./deployment";

const namespace = cacheNamespaceForBase(import.meta.env.BASE_URL);
export const APP_CACHE_PREFIX = `local-pdf-studio-${namespace}-`;
export const RELEASE_CACHE_PREFIX = `${APP_CACHE_PREFIX}release-`;
export const RELEASE_CACHE_NAME = `${RELEASE_CACHE_PREFIX}${APP_VERSION}`;
export const OCR_LANGUAGE_CACHE = `${APP_CACHE_PREFIX}ocr-languages-v1`;
export const SHARE_INBOX_CACHE = `${APP_CACHE_PREFIX}share-inbox-v1`;

export function isLocalPdfStudioCache(name: string): boolean {
  return name.startsWith(APP_CACHE_PREFIX);
}
