// One fast simulation of the whole event (rehearsal in a throwaway organisation): the app's own simulator plays all 22 heats with three virtual judges scoring and the
// head judge not scoring. The reserve judge is switched on before Heat 7 and off again before Heat 13, exactly as the owner would on the Officials step
// (ticking and un-ticking him in "Panels: who scores which division", the same save the screen uses).
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventDescription } from "../../src/lib/event-setup/schema";
import type { Session } from "./harness";

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const digest = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 12);

interface Row {
  [key: string]: unknown;
}

export async function simulateWholeEvent(session: Session, service: SupabaseClient, eventId: string, desc: EventDescription): Promise<void> {
  const root = `${process.cwd()}/src/app/org/(console)/events/[id]`;
  const sim = await import(`${root}/simulate/actions`);
  const officials = await import(`${root}/officials/actions`);
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    checks.push({ name, ok, detail });
    console.log(`  ${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  };
  console.log("\n── Simulation of all 22 heats (rehearsal copy of the event)");

  const made = await sim.cloneAsSimulation(eventId, "RB1 rehearsal");
  if (!made.ok) throw new Error(`Could not copy the event as a simulation: ${made.message}`);
  const simId: string = made.id;
  console.log(`  copy: ${made.divisions} division, ${made.locked} draw locked`);
  const set = await sim.setSpeed(simId, 20);
  if (!set.ok) throw new Error(set.message);
  const play = await sim.setPlayState(simId, "playing");
  if (!play.ok) throw new Error(play.message);

  const division = (await service.from("divisions").select("id, panel_id").eq("event_id", simId).single()).data!;
  const seats = ((await service.from("judge_seats").select("id, name, role, scores").eq("event_id", simId)).data ?? []) as Row[];
  const head = seats.find((s) => s.role === "head")!;
  const judges = seats.filter((s) => s.role === "judge");
  const reserve = judges.find((s) => /\(reserve\)$/.test(String(s.name)))!;
  const scorers = judges.filter((s) => s.id !== reserve.id);
  check("The copy has the head judge (not scoring), 3 scoring judges and the reserve off the panel", head.scores === false && scorers.length === 3 && Boolean(reserve) && (await panel()).length === 3 && !(await panel()).includes(reserve.id as string));

  async function panel(): Promise<string[]> {
    return ((await service.from("panel_members").select("judge_seat_id").eq("panel_id", division.panel_id)).data ?? []).map((m) => m.judge_seat_id as string);
  }
  const heatRows = async () => ((await service.from("heats").select("id, number, status, armed_at, started_at").eq("event_id", simId).order("number")).data ?? []) as Row[];
  const resultOf = async (n: number) => {
    const h = (await heatRows()).find((r) => r.number === n)!;
    const rows = (await service.from("heat_results").select("*").eq("heat_id", h.id as string)).data ?? [];
    return rows.map((r) => JSON.stringify(r)).sort();
  };
  const sheetsOf = async (n: number) => {
    const h = (await heatRows()).find((r) => r.number === n)!;
    const rows = (await service.from("judge_sheets").select("judge_seat_id, submitted_at").eq("heat_id", h.id as string).not("submitted_at", "is", null)).data ?? [];
    return rows.map((r) => r.judge_seat_id as string);
  };
  const status = async (n: number) => String((await heatRows()).find((r) => r.number === n)!.status);

  /** Plays one heat: the simulator raises the yellow, then the heat is started, ended, scored by the virtual judges and published by the virtual head judge. */
  async function arm(n: number): Promise<void> {
    let last = "";
    for (let i = 0; i < 60; i++) {
      const h = (await heatRows()).find((r) => r.number === n)!;
      if (h.armed_at || h.status !== "scheduled") return;
      const t = await sim.tick(simId);
      if (!t.ok) throw new Error(`tick: ${t.message}`);
      last = t.line;
      await sleep(400);
    }
    throw new Error(`Heat ${n} never started its sequence. The simulator said: ${last}`);
  }
  const publishText = async (n: number): Promise<string> => {
    await arm(n);
    const r = await sim.endHeatAndPublish(simId);
    return r.ok ? r.text : r.message;
  };
  const savePanel = async (ids: string[]) => {
    const r = await officials.savePanel(division.id, ids);
    if (!r.ok) throw new Error(r.error);
  };

  // ── Heats 1–6: three judges
  for (let n = 1; n <= 6; n++) {
    await publishText(n);
    if ((await status(n)) !== "published") throw new Error(`Heat ${n} was not published: ${await publishText(n)}`);
  }
  const before = await Promise.all([1, 2, 3, 4, 5, 6].map(resultOf));
  const sheets6 = await Promise.all([1, 2, 3, 4, 5, 6].map(sheetsOf));
  check("Heats 1–6 published with three judges scoring (head judge not scoring)", before.every((b) => b.length > 0) && sheets6.every((s) => s.length === 3 && !s.includes(head.id as string) && !s.includes(reserve.id as string)), `${sheets6.map((s) => s.length).join("/")} judges per heat`);

  // ── switch the reserve judge on before Heat 7
  await savePanel([...scorers.map((s) => s.id as string), reserve.id as string]);
  check("Reserve switched on: the panel now has four judges", (await panel()).length === 4);
  const afterOn = await Promise.all([1, 2, 3, 4, 5, 6].map(resultOf));
  check("Heats 1–6 keep their published results after the switch", digest(afterOn) === digest(before), `${before.length} results unchanged`);
  const stillPublished = (await Promise.all([1, 2, 3, 4, 5, 6].map(status))).every((s) => s === "published");
  check("…and they are still published (nothing reopened, nobody asked for a fourth sheet)", stillPublished);

  // Heat 7 needs four judges: his phone is silent (a person holds the seat and has not scored), so Publish must wait for him
  const setReal = await sim.setSeatMode(simId, reserve.id, "real");
  if (!setReal.ok) throw new Error(setReal.message);
  const blocked = await publishText(7);
  const s7 = await status(7);
  check("Heat 7 does not publish while the reserve judge's sheet is missing (four judges needed)", s7 !== "published", `${s7}: ${blocked.slice(0, 160)}`);
  await sim.setSeatMode(simId, reserve.id, "virtual");
  for (let i = 0; i < 8 && (await status(7)) !== "published"; i++) {
    await sim.tick(simId);
    await sim.endHeatAndPublish(simId);
    await sleep(300);
  }
  const sheets7 = await sheetsOf(7);
  check("Heat 7 publishes once all four judges have scored", (await status(7)) === "published" && sheets7.length === 4 && sheets7.includes(reserve.id as string), `${sheets7.length} judges' sheets`);
  for (let n = 8; n <= 12; n++) {
    await publishText(n);
    for (let i = 0; i < 6 && (await status(n)) !== "published"; i++) {
      await sim.endHeatAndPublish(simId);
      await sleep(300);
    }
  }
  const sheets7to12 = await Promise.all([7, 8, 9, 10, 11, 12].map(sheetsOf));
  check("Heats 7–12 all needed and had four judges", sheets7to12.every((s) => s.length === 4) && (await Promise.all([7, 8, 9, 10, 11, 12].map(status))).every((s) => s === "published"), `${sheets7to12.map((s) => s.length).join("/")} judges per heat`);
  const results7to12 = await Promise.all([7, 8, 9, 10, 11, 12].map(resultOf));

  // ── switch him off again before Heat 13: Publish needs three again
  await sim.setSeatMode(simId, reserve.id, "real"); // his phone is silent again, so any wait for him would show
  await arm(13);
  const waiting13 = await sim.endHeatAndPublish(simId);
  const waitingText = waiting13.ok ? waiting13.text : waiting13.message;
  check("With the reserve still on, Heat 13 waits for his sheet", (await status(13)) !== "published", waitingText.slice(0, 160));
  await savePanel(scorers.map((s) => s.id as string));
  check("Reserve switched off: the panel is back to three judges", (await panel()).length === 3);
  for (let i = 0; i < 8 && (await status(13)) !== "published"; i++) {
    await sim.endHeatAndPublish(simId);
    await sleep(300);
  }
  const sheets13 = await sheetsOf(13);
  check("Heat 13 publishes with three judges again", (await status(13)) === "published" && sheets13.length === 3 && !sheets13.includes(reserve.id as string), `${sheets13.length} judges' sheets`);
  const after7to12 = await Promise.all([7, 8, 9, 10, 11, 12].map(resultOf));
  check("Heats 1–12 keep their published results after the switch-off", digest(after7to12) === digest(results7to12) && digest(await Promise.all([1, 2, 3, 4, 5, 6].map(resultOf))) === digest(before));

  // ── what if the switch is pressed while a heat is already on the water? (Heat 14 is armed; then the reserve is ticked on and his phone stays silent)
  await arm(14);
  await sim.setSeatMode(simId, reserve.id, "real");
  await savePanel([...scorers.map((s) => s.id as string), reserve.id as string]);
  const midHeat = await sim.endHeatAndPublish(simId);
  const midText = midHeat.ok ? midHeat.text : midHeat.message;
  const affected = (await status(14)) !== "published";
  console.log(`  ℹ Switch pressed while Heat 14 was already on the water: ${affected ? "that heat DID start needing the fourth judge" : "that heat was not affected"} — ${midText.slice(0, 140)}`);
  await savePanel(scorers.map((s) => s.id as string)); // put it back, so the rest of the day runs on three judges
  for (let i = 0; i < 8 && (await status(14)) !== "published"; i++) {
    await sim.endHeatAndPublish(simId);
    await sleep(300);
  }

  // ── the rest of the day
  await sim.setSeatMode(simId, reserve.id, "virtual");
  for (let n = 15; n <= 22; n++) {
    await publishText(n);
    for (let i = 0; i < 6 && (await status(n)) !== "published"; i++) {
      await sim.endHeatAndPublish(simId);
      await sleep(300);
    }
  }
  const final = await heatRows();
  check("All 22 heats published", final.length === 22 && final.every((h) => h.status === "published"), `${final.filter((h) => h.status === "published").length} of 22`);
  const sheetsAfter = await Promise.all(Array.from({ length: 9 }, (_, i) => sheetsOf(14 + i)));
  check("Heats 14–22 ended with three judges' sheets only", sheetsAfter.every((s) => s.length === 3 && !s.includes(reserve.id as string) && !s.includes(head.id as string)));
  const sim2 = (await service.from("divisions").select("draw").eq("event_id", simId).single()).data!;
  const placed = ((sim2.draw as { results?: Record<string, unknown> } | null)?.results ?? {}) as Record<string, unknown>;
  check("Every heat's result moved the riders on (22 results in the ladder)", Object.keys(placed).length === 22, `${Object.keys(placed).length} results`);
  void desc;

  const del = await sim.deleteSimulation(simId, (await service.from("events").select("slug").eq("id", simId).single()).data!.slug);
  console.log(`  rehearsal copy removed: ${del.ok ? "yes" : del.message}`);
  if (!checks.every((c) => c.ok)) process.exitCode = 1;
}
