import { createDb } from "../../lib/db/client.ts";
import { sweepCollectorAccessRows } from "../../lib/db/collector-sessions.ts";

const result = await sweepCollectorAccessRows(createDb());
console.log(JSON.stringify({ ok: true, ...result, errors: [] }));
