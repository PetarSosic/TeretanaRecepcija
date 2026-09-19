// BR-163 and AS-22: reading back the AES-256 ZIP the weekly backup writes.
//
// The backup is written with WinZip's AES scheme (the "AE-2" extension, header id
// 0x9901), which Node's zlib knows nothing about, so the container is parsed here and the
// entries decrypted by hand. The restore script and the unit tests share this reader: it
// is what proves a backup can actually be opened with the password and with no other.
import { createCipheriv, createHmac, pbkdf2Sync } from "node:crypto";
import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const AES_EXTRA_ID = 0x9901;
const AES_METHOD = 99;
/** Salt length by strength code: 1 = AES-128, 2 = AES-192, 3 = AES-256. */
const SALT_LENGTH = { 1: 8, 2: 12, 3: 16 };
const KEY_LENGTH = { 1: 16, 2: 24, 3: 32 };

/** The entries of a ZIP, read from its central directory. */
function readCentralDirectory(zip) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file: no end of central directory");

  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE)
      throw new Error("Damaged ZIP: central directory entry expected");
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");
    const extra = zip.subarray(
      offset + 46 + nameLength,
      offset + 46 + nameLength + extraLength,
    );
    entries.push({ name, method, compressedSize, localOffset, extra });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The 0x9901 extra field: encryption strength and the real compression method. */
function readAesExtra(extra) {
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    if (id === AES_EXTRA_ID) {
      return {
        strength: extra.readUInt8(offset + 8),
        method: extra.readUInt16LE(offset + 9),
      };
    }
    offset += 4 + size;
  }
  return null;
}

/**
 * WinZip AES is AES in counter mode with a little-endian counter that starts at 1, which
 * is not what Node's `aes-256-ctr` does, so the key stream is produced block by block
 * from the raw cipher.
 */
function decryptCtr(data, key) {
  const cipher = createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  cipher.setAutoPadding(false);
  const out = Buffer.alloc(data.length);
  const counter = Buffer.alloc(16);

  for (let block = 0; block * 16 < data.length; block += 1) {
    // A 64-bit little-endian block number is far more than a backup will ever need.
    counter.writeBigUInt64LE(BigInt(block + 1), 0);
    const keyStream = cipher.update(counter);
    const start = block * 16;
    const end = Math.min(start + 16, data.length);
    for (let i = start; i < end; i += 1)
      out[i] = data[i] ^ keyStream[i - start];
  }
  return out;
}

/**
 * Every file of an AES-256 ZIP, decrypted and decompressed.
 *
 * Throws on a wrong password: the two-byte verification value the format stores is
 * checked first, and the HMAC-SHA1 authentication code after the data is checked as well,
 * so a silently corrupt result is not possible.
 */
export function readEncryptedZip(zip, password) {
  const files = new Map();

  for (const entry of readCentralDirectory(zip)) {
    if (entry.method !== AES_METHOD)
      throw new Error(`${entry.name} is not AES encrypted`);
    const aes = readAesExtra(entry.extra);
    if (!aes) throw new Error(`${entry.name} has no AES header`);

    const saltLength = SALT_LENGTH[aes.strength];
    const keyLength = KEY_LENGTH[aes.strength];
    if (!saltLength) throw new Error(`${entry.name}: unknown AES strength`);

    // The local header repeats the name and extra fields with lengths of its own.
    const local = entry.localOffset;
    const nameLength = zip.readUInt16LE(local + 26);
    const extraLength = zip.readUInt16LE(local + 28);
    let cursor = local + 30 + nameLength + extraLength;

    const salt = zip.subarray(cursor, cursor + saltLength);
    cursor += saltLength;
    const verifier = zip.subarray(cursor, cursor + 2);
    cursor += 2;
    const payloadLength = entry.compressedSize - saltLength - 2 - 10;
    const payload = zip.subarray(cursor, cursor + payloadLength);
    const authCode = zip.subarray(
      cursor + payloadLength,
      cursor + payloadLength + 10,
    );

    const derived = pbkdf2Sync(password, salt, 1000, keyLength * 2 + 2, "sha1");
    const key = derived.subarray(0, keyLength);
    const authKey = derived.subarray(keyLength, keyLength * 2);
    const expectedVerifier = derived.subarray(keyLength * 2);
    if (!expectedVerifier.equals(verifier)) throw new Error("Wrong password");

    const mac = createHmac("sha1", authKey).update(payload).digest();
    if (!mac.subarray(0, 10).equals(authCode))
      throw new Error(`${entry.name}: authentication failed`);

    const plain = decryptCtr(payload, key);
    files.set(entry.name, aes.method === 8 ? inflateRawSync(plain) : plain);
  }
  return files;
}
