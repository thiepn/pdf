/**
 * Copies a typed-array view into an ArrayBuffer owned by this realm.
 *
 * TypeScript 5.9 correctly models Uint8Array buffers as ArrayBufferLike, which
 * can include SharedArrayBuffer. Browser APIs such as Web Crypto, Blob, OPFS,
 * IndexedDB records, and worker payloads require a non-shared ArrayBuffer.
 */
export function toOwnedArrayBuffer(bytes: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
