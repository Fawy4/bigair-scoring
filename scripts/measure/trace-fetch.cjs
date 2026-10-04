// Measurement only (never loaded by the app): preload with NODE_OPTIONS="--require ./scripts/measure/trace-fetch.cjs" when starting `next start`.
// Writes one JSON line per outgoing request to the Supabase project (start, duration, what it asked for) to $SPEED_TRACE_FILE. No keys, no bodies, no tokens.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const file = process.env.SPEED_TRACE_FILE;
const host = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
if (file && host && typeof globalThis.fetch === "function") {
  const original = globalThis.fetch;
  globalThis.fetch = async function traced(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes(host)) return original.call(this, input, init);
    const u = new URL(url);
    const what = u.pathname.replace(/^\/(rest|auth)\/v1\//, "$1:").replace(/^rpc\//, "rpc:");
    const t0 = Date.now();
    try {
      return await original.call(this, input, init);
    } finally {
      fs.appendFileSync(file, JSON.stringify({ t: t0, ms: Date.now() - t0, what }) + "\n");
    }
  };
}
