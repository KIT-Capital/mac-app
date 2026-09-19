import { createDb } from "../../lib/db/client.ts";
import { sweepPendingPhotos } from "../../lib/db/photos.ts";
import { createObjectStore } from "../../lib/storage/r2-object-store.mjs";

try {
  const result = await sweepPendingPhotos(createDb(), createObjectStore());
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  const code = error instanceof Error ? error.message : "PHOTO_SWEEP_FAILED";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
}
