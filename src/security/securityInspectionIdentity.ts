const identityPromiseByBytes = new WeakMap<Uint8Array, Promise<string>>();
const fallbackIdentityByBytes = new WeakMap<Uint8Array, string>();
let credentialHmacKeyPromise: Promise<CryptoKey> | null = null;

export interface SecurityInspectionCredentialIdentity {
  key: string;
  cacheable: boolean;
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fallbackObjectIdentity(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
      fallback = `object:${fallbackObjectIdentity()}`;
      fallbackIdentityByBytes.set(bytes, fallback);
    }
    identity = Promise.resolve(fallback);
  } else {
    const snapshot = Uint8Array.from(bytes);
    identity = globalThis.crypto.subtle.digest("SHA-256", snapshot).then(bytesToHex);
  }

  identityPromiseByBytes.set(bytes, identity);
  return identity;
}

/**
 * Returns a session-private cache identity for a PDF password without retaining
 * the plaintext password as a strongly referenced Map key.
 *
 * The HMAC key is random, non-extractable, and lives only for this page session.
 * If Web Crypto cannot provide HMAC, protected inspection reuse is disabled
 * rather than substituting a weaker password-derived cache key.
 */
export async function securityInspectionCredentialIdentity(
  password?: string
): Promise<SecurityInspectionCredentialIdentity> {
  if (!password) return { key: "unprotected", cacheable: true };

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { key: "protected-uncached", cacheable: false };

  try {
    credentialHmacKeyPromise ??= subtle.generateKey(
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    ) as Promise<CryptoKey>;

    const hmacKey = await credentialHmacKeyPromise;
    const encoded = new TextEncoder().encode(password);
    try {
      const signature = await subtle.sign("HMAC", hmacKey, encoded);
      return { key: `protected:${bytesToHex(signature)}`, cacheable: true };
    } finally {
      encoded.fill(0);
    }
  } catch {
    credentialHmacKeyPromise = null;
    return { key: "protected-uncached", cacheable: false };
  }
}
