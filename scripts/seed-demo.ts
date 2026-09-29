// Demo draw: runs the ladder engine (expandFormat) for every division of "Demo Cup" and stores the rounds, heats and
// slots. Proves the engine's output fits the tables. Idempotent: a division that already has rounds is skipped.
import { loadEnv, need } from "./env.mjs";
import { createServiceClient } from "../src/lib/supabase/service";
import { expandFormat } from "../src/lib/engine/ladder";
import { parseFormatTemplate } from "../src/lib/schemas/format-template";
import type { Entrant } from "../src/lib/engine/ladder";

loadEnv();
need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const db = createServiceClient();

async function main() {
  const { data: event } = await db.from("events").select("id").eq("slug", "demo-cup").maybeSingle();
  if (!event) throw new Error("Demo Cup not found. Run the demo seed first (supabase/seed.sql).");
  const { data: divisions, error } = await db.from("divisions").select("id, name, format_template_id").eq("event_id", event.id).order("sort_order");
  if (error) throw new Error(error.message);

  for (const div of divisions ?? []) {
    const { count } = await db.from("rounds").select("id", { count: "exact", head: true }).eq("division_id", div.id);
    if (count) { console.log(`  skipped  ${div.name} (already drawn)`); continue; }

    const { data: tpl } = await db.from("format_templates").select("json").eq("id", div.format_template_id!).single();
    const template = parseFormatTemplate(tpl!.json);
    const { data: entries } = await db.from("entries").select("id, seed, identifiers, riders(first_name, last_name)").eq("division_id", div.id).order("seed");
    const entrants: Entrant[] = (entries ?? []).map((e) => ({ id: e.id, name: `${e.riders?.first_name} ${e.riders?.last_name}`, identifiers: {} }));
    const draw = expandFormat(template, entrants, { identification: "vests-per-heat" });

    let heats = 0, slots = 0;
    for (const [i, round] of draw.rounds.entries()) {
      const { data: r, error: rErr } = await db.from("rounds").insert({ division_id: div.id, event_id: event.id, sort_order: i + 1, name: round.name, short_name: round.shortName, spec: { ...round.spec, key: round.id } as never }).select("id").single();
      if (rErr) throw new Error(`${div.name} round ${round.id}: ${rErr.message}`);
      for (const h of round.heats.filter((x) => !x.bye && x.number !== null)) {
        const { data: heat, error: hErr } = await db.from("heats").insert({ round_id: r.id, division_id: div.id, event_id: event.id, number: h.number!, duration_sec: h.durationMin * 60, status: "scheduled", manual_override: h.manualOverride }).select("id").single();
        if (hErr) throw new Error(`${div.name} heat ${h.id}: ${hErr.message}`);
        heats++;
        const rows = h.slots.map((s, k) => ({
          heat_id: heat.id, event_id: event.id, position: k + 1, entry_id: s.entrantId ?? null, vest_colour: s.vestColour ?? null,
          source: (s.from ?? null) as never, modifier: s.modifier === "DNS" ? ("DNS" as const) : null,
        }));
        const { error: sErr } = await db.from("heat_slots").insert(rows);
        if (sErr) throw new Error(`${div.name} slots of ${h.id}: ${sErr.message}`);
        slots += rows.length;
      }
    }
    await db.from("divisions").update({ status: "ready" }).eq("id", div.id);
    console.log(`  drawn    ${div.name}: ${draw.rounds.length} rounds, ${heats} heats, ${slots} slots${draw.warnings.length ? `, ${draw.warnings.length} warning(s): ${draw.warnings.map((w) => w.type).join(", ")}` : ""}`);
  }
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
