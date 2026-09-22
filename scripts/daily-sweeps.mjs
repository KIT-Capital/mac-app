import { createDb } from "../lib/db/client.ts";
import { sweepCollectorAccessRows } from "../lib/db/collector-sessions.ts";
import { sweepPendingPhotos } from "../lib/db/photos.ts";
import { createObjectStore } from "../lib/storage/r2-object-store.mjs";

const db = createDb();
const access = await sweepCollectorAccessRows(db);
const photos = await sweepPendingPhotos(db, createObjectStore());
console.log(JSON.stringify({ ok: true, access, photos }));
