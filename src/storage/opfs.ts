import { toOwnedArrayBuffer } from "../core/arrayBuffer";

export async function opfsRoundTrip(bytes: Uint8Array): Promise<Uint8Array> {
  if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) {
    throw new Error("Origin Private File System is unavailable in this browser.");
  }

  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle("release-validation", { create: true });
  const handle = await directory.getFileHandle("round-trip.bin", { create: true });
  const writable = await handle.createWritable();
  await writable.write(toOwnedArrayBuffer(bytes));
  await writable.close();

  const file = await handle.getFile();
  const result = new Uint8Array(await file.arrayBuffer());
  await directory.removeEntry("round-trip.bin");
  return result;
}
