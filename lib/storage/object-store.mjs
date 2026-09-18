import { createHash } from "node:crypto";

/**
 * @param {Uint8Array | Buffer} bytes
 */
export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * In-memory object store for Stage 3 tests. Not R2.
 * @returns {{
 *   objects: Map<string, Uint8Array>,
 *   put: (key: string, body: Uint8Array, checksum: string) => Promise<void>,
 *   putIfAbsent: (key: string, body: Uint8Array, checksum: string) => Promise<void>,
 *   head: (key: string) => Promise<boolean>,
 *   get: (key: string) => Promise<Uint8Array>,
 *   presignGet: (key: string, expiresSeconds?: number) => Promise<{ url: string, expiresAt: string }>,
 * }}
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
    async putIfAbsent(key, body, checksum) {
      if (objects.has(key)) {
        throw new Error("OBJECT_EXISTS");
      }
      await this.put(key, body, checksum);
    },
    async head(key) {
      return objects.has(key);
    },
    async get(key) {
      const body = objects.get(key);
      if (!body) throw new Error("OBJECT_NOT_FOUND");
      return body;
    },
    async presignGet(key, expiresSeconds = 300) {
      if (!objects.has(key)) throw new Error("OBJECT_NOT_FOUND");
      const seconds = Number(expiresSeconds) > 0 && Number(expiresSeconds) <= 300 ? Number(expiresSeconds) : 300;
      const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
      return { url: `memory://${key}?expires=${encodeURIComponent(expiresAt)}`, expiresAt };
    },
  };
}

/**
 * Document path never receives remove.
 * @param {{
 *   putIfAbsent: (key: string, body: Uint8Array, checksum: string) => Promise<void>,
 *   head: (key: string) => Promise<boolean>,
 *   get: (key: string) => Promise<Uint8Array>,
 *   presignGet: (key: string, expiresSeconds?: number) => Promise<{ url: string, expiresAt: string }>,
 * }} store
 */
export function agreementDocumentStore(store) {
  return {
    putIfAbsent: (key, body, checksum) => store.putIfAbsent(key, body, checksum),
    head: (key) => store.head(key),
    get: (key) => store.get(key),
    presignGet: (key, expiresSeconds) => store.presignGet(key, expiresSeconds),
  };
}
