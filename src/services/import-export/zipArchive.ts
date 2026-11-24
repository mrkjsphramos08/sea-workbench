/**
 * SEA Workbench — Pure TypeScript PKZIP 2.0 Archive Writer & Verifier
 *
 * Produces standards-compliant uncompressed (STORE, method 0) ZIP archives
 * with IEEE 802.3 CRC-32 checksums and UTF-8 filenames. Works identically in
 * browser environments (Blob download) and Node.js (automated tests) with zero
 * third-party dependencies.
 */

export interface ZipInputEntry {
  path: string;
  content: string | Uint8Array;
}

export interface ParsedZipEntryInfo {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
}

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function writeUint16LE(view: DataView, offset: number, val: number): void {
  view.setUint16(offset, val & 0xffff, true);
}

function writeUint32LE(view: DataView, offset: number, val: number): void {
  view.setUint32(offset, val >>> 0, true);
}

function toDosTimeDate(date: Date): { time: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const time = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { time, dosDate };
}

export function buildZipArchive(entries: ZipInputEntry[]): Uint8Array {
  const now = new Date();
  const { time, dosDate } = toDosTimeDate(now);

  interface Prepared {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc32: number;
    localHeaderOffset: number;
  }

  const prepared: Prepared[] = [];
  let localSectionSize = 0;
  let centralDirectorySize = 0;

  for (const entry of entries) {
    const cleanPath = entry.path.replace(/^\/+/, '');
    const nameBytes = encodeUtf8(cleanPath);
    const dataBytes =
      typeof entry.content === 'string'
        ? encodeUtf8(entry.content)
        : entry.content;
    const crc32 = computeCrc32(dataBytes);

    prepared.push({
      nameBytes,
      dataBytes,
      crc32,
      localHeaderOffset: localSectionSize,
    });

    localSectionSize += 30 + nameBytes.length + dataBytes.length;
    centralDirectorySize += 46 + nameBytes.length;
  }

  const eocdSize = 22;
  const totalSize = localSectionSize + centralDirectorySize + eocdSize;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // 1. Write Local File Headers + File Data
  let offset = 0;
  for (const item of prepared) {
    writeUint32LE(view, offset, 0x04034b50); // Local file header signature
    writeUint16LE(view, offset + 4, 20); // Version needed to extract (2.0)
    writeUint16LE(view, offset + 6, 0x0800); // UTF-8 filename flag (bit 11)
    writeUint16LE(view, offset + 8, 0); // Compression method: 0 (STORE)
    writeUint16LE(view, offset + 10, time);
    writeUint16LE(view, offset + 12, dosDate);
    writeUint32LE(view, offset + 14, item.crc32);
    writeUint32LE(view, offset + 18, item.dataBytes.length);
    writeUint32LE(view, offset + 22, item.dataBytes.length);
    writeUint16LE(view, offset + 26, item.nameBytes.length);
    writeUint16LE(view, offset + 28, 0); // Extra field length
    out.set(item.nameBytes, offset + 30);
    out.set(item.dataBytes, offset + 30 + item.nameBytes.length);
    offset += 30 + item.nameBytes.length + item.dataBytes.length;
  }

  // 2. Write Central Directory Headers
  const centralDirOffset = offset;
  for (const item of prepared) {
    writeUint32LE(view, offset, 0x02014b50); // Central directory signature
    writeUint16LE(view, offset + 4, 20); // Version made by
    writeUint16LE(view, offset + 6, 20); // Version needed
    writeUint16LE(view, offset + 8, 0x0800); // UTF-8 filename flag
    writeUint16LE(view, offset + 10, 0); // STORE
    writeUint16LE(view, offset + 12, time);
    writeUint16LE(view, offset + 14, dosDate);
    writeUint32LE(view, offset + 16, item.crc32);
    writeUint32LE(view, offset + 20, item.dataBytes.length);
    writeUint32LE(view, offset + 24, item.dataBytes.length);
    writeUint16LE(view, offset + 28, item.nameBytes.length);
    writeUint16LE(view, offset + 30, 0); // Extra len
    writeUint16LE(view, offset + 32, 0); // Comment len
    writeUint16LE(view, offset + 34, 0); // Disk number start
    writeUint16LE(view, offset + 36, 0); // Internal attributes
    writeUint32LE(view, offset + 38, 0); // External attributes
    writeUint32LE(view, offset + 42, item.localHeaderOffset);
    out.set(item.nameBytes, offset + 46);
    offset += 46 + item.nameBytes.length;
  }

  // 3. End of Central Directory (EOCD)
  writeUint32LE(view, offset, 0x06054b50);
  writeUint16LE(view, offset + 4, 0); // Disk number
  writeUint16LE(view, offset + 6, 0); // Start disk
  writeUint16LE(view, offset + 8, prepared.length);
  writeUint16LE(view, offset + 10, prepared.length);
  writeUint32LE(view, offset + 12, centralDirectorySize);
  writeUint32LE(view, offset + 16, centralDirOffset);
  writeUint16LE(view, offset + 20, 0); // Comment length

  return out;
}

/**
 * Inspects and verifies entries inside a PKZIP archive buffer.
 */
export function listZipEntries(zipBytes: Uint8Array): ParsedZipEntryInfo[] {
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength
  );
  const decoder = new TextDecoder('utf-8');

  // Locate EOCD signature 0x06054b50 near end of buffer
  let eocdOffset = -1;
  for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP archive: End of Central Directory signature not found.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  const entries: ParsedZipEntryInfo[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    const sig = view.getUint32(cursor, true);
    if (sig !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory signature at entry ${i}.`);
    }
    const crc32 = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const path = decoder.decode(
      zipBytes.subarray(cursor + 46, cursor + 46 + nameLen)
    );

    entries.push({ path, compressedSize, uncompressedSize, crc32 });
    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}
