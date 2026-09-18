import { AwsClient } from "aws4fetch";
import { cappedPresignExpires } from "./agreement-object-key.mjs";
import { sha256Hex } from "./object-store.mjs";

export function mapConditionalPut(status) {
  if (status === 412 || status === 409) return "OBJECT_EXISTS";
  if (status >= 200 && status < 300) return "ok";
  return "R2_PUT_FAILED";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function r2Endpoint(env = process.env) {
  if (env.R2_S3_ENDPOINT) return env.R2_S3_ENDPOINT.replace(/\/$/, "");
  if (env.R2_ACCOUNT_ID) return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return "";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function r2Configured(env = process.env) {
  return Boolean(r2Endpoint(env) && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function missingR2Names(env = process.env) {
  const missing = [];
  if (!r2Endpoint(env)) missing.push("R2_S3_ENDPOINT");
  if (!env.R2_BUCKET) missing.push("R2_BUCKET");
  if (!env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  return missing;
}

/**
 * @param {string} endpoint
 * @param {string} bucket
 * @param {string} key
 */
export function r2ObjectUrl(endpoint, bucket, key) {
  return `${endpoint.replace(/\/$/, "")}/${bucket}/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   put: (key: string, body: Uint8Array, checksum: string) => Promise<void>,
 *   putIfAbsent: (key: string, body: Uint8Array, checksum: string) => Promise<void>,
 *   head: (key: string) => Promise<boolean>,
 *   get: (key: string) => Promise<Uint8Array>,
 *   presignGet: (key: string, expiresSeconds?: number) => Promise<{ url: string, expiresAt: string }>,
 *   remove: (key: string) => Promise<void>,
 * }}
 */
export function r2ObjectStore(env = process.env) {
  if (!r2Configured(env)) {
    throw new Error("R2_NOT_CONFIGURED");
  }
  const endpoint = r2Endpoint(env);
  const bucket = env.R2_BUCKET;
  const region = env.R2_REGION || "auto";
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region,
  });

  return {
    async put(key, body, checksum) {
      const actual = sha256Hex(body);
      if (actual !== checksum) {
        throw new Error("CHECKSUM_MISMATCH");
      }
      const response = await client.fetch(r2ObjectUrl(endpoint, bucket, key), {
        method: "PUT",
        body,
        headers: { "content-type": "application/octet-stream" },
        aws: { service: "s3", region },
      });
      if (!response.ok) {
        throw new Error("R2_PUT_FAILED");
      }
    },
    async putIfAbsent(key, body, checksum) {
      const actual = sha256Hex(body);
      if (actual !== checksum) {
        throw new Error("CHECKSUM_MISMATCH");
      }
      const response = await client.fetch(r2ObjectUrl(endpoint, bucket, key), {
        method: "PUT",
        body,
        headers: {
          "content-type": "application/octet-stream",
          "if-none-match": "*",
        },
        aws: { service: "s3", region },
      });
      const mapped = mapConditionalPut(response.status);
      if (mapped !== "ok") {
        throw new Error(mapped);
      }
    },
    async get(key) {
      const response = await client.fetch(r2ObjectUrl(endpoint, bucket, key), {
        method: "GET",
        aws: { service: "s3", region },
      });
      if (!response.ok) {
        throw new Error("R2_GET_FAILED");
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async presignGet(key, expiresSeconds = 300) {
      const seconds = cappedPresignExpires(expiresSeconds);
      const url = new URL(r2ObjectUrl(endpoint, bucket, key));
      url.searchParams.set("X-Amz-Expires", String(seconds));
      const signed = await client.sign(url.toString(), {
        method: "GET",
        aws: { signQuery: true, service: "s3", region },
      });
      return {
        url: signed.url,
        expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      };
    },
    async head(key) {
      const response = await client.fetch(r2ObjectUrl(endpoint, bucket, key), {
        method: "HEAD",
        aws: { service: "s3", region },
      });
      return response.ok;
    },
    async remove(key) {
      const response = await client.fetch(r2ObjectUrl(endpoint, bucket, key), {
        method: "DELETE",
        aws: { service: "s3", region },
      });
      if (!response.ok) {
        throw new Error("R2_DELETE_FAILED");
      }
    },
  };
}

/**
 * Production requires R2. Development tests may pass an in-memory store explicitly.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function createObjectStore(env = process.env) {
  if (r2Configured(env)) {
    return r2ObjectStore(env);
  }
  if (env.APP_ENV === "production") {
    throw new Error("R2_REQUIRED");
  }
  throw new Error("R2_NOT_CONFIGURED");
}
