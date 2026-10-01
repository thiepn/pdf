const identityPromiseByBytes = new WeakMap<Uint8Array, Promise<string>>();
const fallbackIdentityByBytes = new WeakMap<Uint8Array, string>();

/**
 * Returns a process-local identity for immutable PDF bytes.
 *
 * SHA-256 lets independently loaded Uint8Array instances for identical document
 * bytes share completed security-inspection results. The fallback deliberately
 * preserves object identity when Web Crypto is unavailable rather than using a
 * weaker content hash for security-sensitive cache reuse.
 */
export async function securityInspectionByteIdentity(bytes: Uint8Array): Promise<string> {
  let identity = identityPromiseByBytes.get(bytes);
  if (identity) return identity;

  if (!globalThis.crypto?.subtle) {
    let fallback = fallbackIdentityByBytes.get(bytes);
    if (!fallback) {
      fallback = `object:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
      fallbackIdentityByBytes.set(bytes, fallback);
    }
    identity = Promise.resolve(fallback);
  } else {
    const snapshot = Uint8Array.from(bytes);
    identity = globalThis.crypto.subtle.digest("SHA-256", snapshot).then((digest) =>
      Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
    );
  }

  identityPromiseByBytes.set(bytes, identity);
  return identity;
}
