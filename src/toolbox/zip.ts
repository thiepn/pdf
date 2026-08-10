function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value: number): Uint8Array { return new Uint8Array([value & 255, value >>> 8 & 255]); }
function u32(value: number): Uint8Array { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]); }
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

/** Small dependency-free ZIP writer for already-compressed PDF/PNG exports. */
export function createStoredZip(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  if (files.length > 65535) throw new Error("ZIP export supports at most 65,535 files.");
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    if (name.length > 65535) throw new Error("ZIP filename is too long.");
    const crc = crc32(file.bytes);
    const size = file.bytes.length;
    if (size > 0xffffffff || offset > 0xffffffff) throw new Error("Classic ZIP export is limited to 4 GiB offsets and file sizes.");
    const utf8Flag = 0x0800;
    const local = concat([u32(0x04034b50), u16(20), u16(utf8Flag), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0), name, file.bytes]);
    locals.push(local);
    centrals.push(concat([u32(0x02014b50), u16(20), u16(20), u16(utf8Flag), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const central = concat(centrals);
  const local = concat(locals);
  if (central.length > 0xffffffff || local.length > 0xffffffff) throw new Error("Classic ZIP export is limited to 4 GiB archives.");
  return concat([local, central, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(local.length), u16(0)]);
}
