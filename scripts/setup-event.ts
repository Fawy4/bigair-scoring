// Builds an event from its rulebook description through the app's OWN save functions (the ones the organiser's setup steps use), signed in as a member of the
// organisation. Nothing is written by hand and nothing personal is stored in the repository: names come from a file you give it.
//
//   npm run setup:event -- --people /path/to/names.json                      builds "Red Bull Winds of Sinai 2026" in the existing Red Bull organisation
//   npm run setup:event -- --people names.json                               run it again later with the other names: the same riders are renamed in place
//   npm run setup:event -- --throwaway [--simulate] [--keep]                  rehearsal in a throwaway "e2e-" organisation (invented names), deleted afterwards
//   --file presets/events/<event>.json     another event description (default: Red Bull Winds of Sinai 2026)
//
// names.json: { "riders": { "1": "First Last", … }, "officials": { "head": "…", "judge1": "…", "judge2": "…", "judge3": "…", "judge4": "…" } }
// PINs are never printed: the owner reads them on the Officials step.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseEventDescription } from "../src/lib/event-setup/schema";
import { setupEvent, type People } from "../src/lib/event-setup/setup";
import { loadEnv, need } from "./env.mjs";
import { makeGateway } from "./event-setup/gateway";
import { install, signInAs } from "./event-setup/harness";
import { fingerprint, verifyEvent } from "./event-setup/verify";

loadEnv();
need(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

const flag = (name: string) => process.argv.includes(`--${name}`);
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** Invented stand-ins for the rehearsal, so no real name ever enters the throwaway organisation. */
function inventedPeople(named: number): People {
  return {
    riders: Object.fromEntries(Array.from({ length: named }, (_, i) => [String(i + 1), `Test Rider${i + 1} Surname`])),
    officials: { head: "Test Head", judge1: "Test Judge1", judge2: "Test Judge2", judge3: "Test Judge3", judge4: "Test Judge4" },
  };
}

function readPeople(path: string): People {
  const j = JSON.parse(readFileSync(path, "utf8")) as Partial<People>;
  return { riders: j.riders ?? {}, officials: j.officials ?? {} };
}

function print(checks: Array<{ name: string; ok: boolean; detail?: string }>): boolean {
  for (const c of checks) console.log(`${c.ok ? "  ✔" : "  ✘"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  return checks.every((c) => c.ok);
}

async function main() {
  const desc = parseEventDescription(JSON.parse(readFileSync(arg("file") ?? "presets/events/red-bull-winds-of-sinai-2026.json", "utf8")));
  const throwaway = flag("throwaway");
  const people = throwaway && !arg("people") ? inventedPeople(6) : readPeople(arg("people") ?? (() => { throw new Error("Give the names file: --people /path/to/names.json"); })());
  install();

  let cleanup: (() => Promise<void>) | null = null;
  let orgId: string | undefined;
  let session;
  if (throwaway) {
    const { createOrganiser } = await import("../e2e/organiser");
    const org = await createOrganiser();
    cleanup = org.cleanup;
    await service.from("organisations").update({ name: `e2e-red-bull-${org.run}`, slug: `e2e-rb-${org.run}` }).eq("id", org.orgId);
    orgId = org.orgId;
    const member = (await service.from("memberships").select("user_id").eq("organisation_id", org.orgId).limit(1).single()).data!;
    session = await signInAs(org.orgId, member.user_id, org.email);
    console.log(`Throwaway organisation e2e-red-bull-${org.run} created.`);
  }

  try {
    const orgs = (await service.from("organisations").select("id, name, slug").is("archived_at", null)).data ?? [];
    if (!throwaway) {
      const { pickOrganisation } = await import("../src/lib/event-setup/settings");
      const org = pickOrganisation(orgs, desc.organisation.nameContains);
      orgId = org.id;
      const owner = (await service.from("memberships").select("user_id, role").eq("organisation_id", org.id).order("created_at").limit(1)).data?.[0];
      if (!owner) throw new Error(`${org.name} has no member to build as.`);
      const user = await service.auth.admin.getUserById(owner.user_id);
      if (!user.data.user?.email) throw new Error("The organisation's member has no e-mail address to sign in with.");
      session = await signInAs(org.id, owner.user_id, user.data.user.email);
      console.log(`Building in the existing organisation “${org.name}” (nothing about the organisation itself is changed).`);
    }
    // the other organisations are fingerprinted only now that we know which one is being built in (it is left out of the comparison)
    const before = await fingerprint(service, orgId ? [orgId] : []);
    const gateway = await makeGateway(session!, service);

    const run = async (label: string, who: People) => {
      console.log(`\n── ${label}`);
      const result = await setupEvent(gateway, desc, who, throwaway ? orgId : undefined);
      for (const l of result.lines) console.log(`  ${l.did.padEnd(8)} ${l.step}: ${l.detail}`);
      return result;
    };

    const first = await run("Build", people);
    const named = Object.keys(people.riders).length;
    console.log("\n── Read back from the database");
    const { checks, colourNotes } = await verifyEvent(service, desc, first.eventId, named);
    const ok1 = print(checks);
    console.log("\n── Lycra colours, seat by seat (the app has one list for every heat)");
    colourNotes.forEach((n) => console.log(`  ${n}`));

    const again = await run("Second run (must change nothing)", people);
    const nothing = again.lines.every((l) => l.did === "kept");
    console.log(nothing ? "  ✔ the second run changed nothing" : "  ✘ the second run changed something");

    if (throwaway) {
      const later = inventedPeople(18);
      await run("Names arriving later (renames in place)", { ...people, riders: later.riders });
      const entries = (await service.from("entries").select("id, seed").eq("division_id", first.divisionId).order("seed")).data ?? [];
      const sameSeeds = entries.length === 18 && entries.every((e, i) => e.seed === i + 1);
      console.log(sameSeeds ? "  ✔ still 18 riders with seeds 1–18, draw still locked" : "  ✘ riders moved");
    }

    if (flag("simulate")) {
      const { simulateWholeEvent } = await import("./event-setup/simulate");
      await simulateWholeEvent(session!, service, first.eventId, desc);
    }

    const after = await fingerprint(service, orgId ? [orgId] : []);
    console.log(`\nOther organisations (Arrow, EKL, Demo and the rest): ${before === after ? "✔ untouched" : "✘ CHANGED"} (${before} → ${after})`);
    process.exitCode = ok1 && nothing && before === after ? 0 : 1;
  } finally {
    if (cleanup && !flag("keep")) {
      await cleanup();
      console.log("\nThrowaway organisation and its logins deleted.");
    }
  }
}

main().catch((e) => {
  console.error(`\nStopped: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
