// Demo draw: runs the ladder engine (expandFormat) for every division of "Demo Cup" and stores the rounds, heats and
// slots. Proves the engine's output fits the tables. Idempotent: a division that already has rounds is skipped.
// (The demo organisation itself is created by supabase/seed.sql or by the "Create demo organisation" button in /admin.)
import { loadEnv, need } from "./env.mjs";
import { createServiceClient } from "../src/lib/supabase/service";
import { drawDemoEvent } from "../src/lib/demo/draw";

loadEnv();
need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

drawDemoEvent(createServiceClient())
  .then((results) => {
    for (const r of results) {
      console.log(
        r.drawn
          ? `  drawn    ${r.division}: ${r.rounds} rounds, ${r.heats} heats, ${r.slots} slots${r.warnings.length ? `, ${r.warnings.length} warning(s): ${r.warnings.join(", ")}` : ""}`
          : `  skipped  ${r.division} (already drawn)`,
      );
    }
  })
  .catch((e) => {
    console.error(`FAILED: ${e.message}`);
    process.exit(1);
  });
