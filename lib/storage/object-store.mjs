import { createHash } from "node:crypto";

/**
 * @param {Uint8Array | Buffer} bytes
 */
export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * In-memory object store for Stage 3 tests. Not R2.
 * @returns {{ put: (key: string, body: Uint8Array, checksum: string) => Promise<void>, objects: Map<string, Uint8Array> }}
 */
export function memoryObjectStore() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, checksum) {
      const actual = sha256Hex(body);
      if (actual !== checksum) {
        throw new Error("CHECKSUM_MISMATCH");
      }
      objects.set(key, body);
    },
  };
}
