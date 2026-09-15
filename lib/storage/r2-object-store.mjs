import { AwsClient } from "aws4fetch";
import { sha256Hex } from "./object-store.mjs";

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function r2Configured(env = process.env) {
  return Boolean(
    env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY,
  );
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ put: (key: string, body: Uint8Array, checksum: string) => Promise<void> }}
 */
export function r2ObjectStore(env = process.env) {
  if (!r2Configured(env)) {
    throw new Error("R2_NOT_CONFIGURED");
  }
  const endpoint = env.R2_S3_ENDPOINT.replace(/\/$/, "");
  const bucket = env.R2_BUCKET;
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: env.R2_REGION || "auto",
  });

  return {
    async put(key, body, checksum) {
      const actual = sha256Hex(body);
      if (actual !== checksum) {
        throw new Error("CHECKSUM_MISMATCH");
      }
      const url = `${endpoint}/${bucket}/${key
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`;
      const response = await client.fetch(url, {
        method: "PUT",
        body,
        headers: { "content-type": "application/octet-stream" },
        aws: { service: "s3", region: env.R2_REGION || "auto" },
      });
      if (!response.ok) {
        throw new Error("R2_PUT_FAILED");
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
