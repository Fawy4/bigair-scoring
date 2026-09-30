// Upserts presets/**/*.json as SYSTEM presets (organisation_id null): scoring models, format templates, trick vocabulary.
// Every file is validated with the same Zod schemas the app uses. A changed preset becomes a NEW version row;
// rows already used by divisions are never edited (docs/05 §12). Safe to run repeatedly. Never prints secrets.
import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadEnv, need } from "./env.mjs";
import { createServiceClient } from "../src/lib/supabase/service";
import { parseScoringModel } from "../src/lib/schemas/scoring-model";
import { parseFormatTemplate } from "../src/lib/schemas/format-template";
import { parseScheduleDay } from "../src/lib/schemas/schedule";
import { parseIdentificationScheme } from "../src/lib/schemas/identification";
import { canonicalHash, planPreset } from "../src/lib/presets/plan";

loadEnv();
need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const db = createServiceClient();
/** Presets in the repository are reviewed code, so what the seed writes is published at once (customers see it; existing divisions keep their version). */
const PUBLISHED_NOW = new Date().toISOString();

const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, "utf8"));
const files = (dir: string) => readdirSync(`presets/${dir}`).filter((f) => f.endsWith(".json")).sort().map((f) => `presets/${dir}/${f}`);

let inserted = 0, unchanged = 0, failed = 0;
const problems: string[] = [];

async function seedTable(table: "scoring_models" | "format_templates", paths: string[], parse: (j: unknown) => { id: string; name: string; version?: number }, versioned: boolean) {
  for (const path of paths) {
    try {
      const raw = readJson(path);
      const parsed = parse(raw); // throws a readable error if the preset is invalid
      const hash = canonicalHash(raw);
      const { data: rows, error } = await db.from(table).select("version, content_hash").is("organisation_id", null).eq("key", parsed.id);
      if (error) throw new Error(error.message);
      const plan = planPreset({ key: parsed.id, version: versioned ? parsed.version : undefined, hash }, (rows ?? []).map((r) => ({ version: r.version, hash: r.content_hash })), versioned);
      if (plan.action === "error") throw new Error(plan.message);
      if (plan.action === "unchanged") { unchanged++; console.log(`  same      ${table}/${parsed.id}`); continue; }
      const { error: insErr } = await db.from(table).insert({ organisation_id: null, key: parsed.id, name: parsed.name, version: plan.version, json: raw as never, content_hash: hash, published_at: PUBLISHED_NOW });
      if (insErr) throw new Error(insErr.message);
      inserted++;
      console.log(`  inserted  ${table}/${parsed.id} v${plan.version}`);
    } catch (e) {
      failed++;
      problems.push(`${path}: ${(e as Error).message}`);
      console.log(`  FAILED    ${path}`);
    }
  }
}

/** Generic presets (docs/06 §12 decision 3): identification schemes and schedule templates as system rows in `presets`. */
async function seedGeneric(kind: string, items: Array<{ key: string; name: string; raw: Record<string, unknown> }>, parse: (j: unknown) => unknown) {
  for (const { key, name, raw } of items) {
    try {
      parse(raw); // throws a readable error if the preset is invalid
      const hash = canonicalHash(raw);
      const { data: rows, error } = await db.from("presets").select("version, content_hash").is("organisation_id", null).eq("kind", kind).eq("key", key);
      if (error) throw new Error(error.message);
      const plan = planPreset({ key, version: undefined, hash }, (rows ?? []).map((r) => ({ version: r.version, hash: r.content_hash })), false);
      if (plan.action === "error") throw new Error(plan.message);
      if (plan.action === "unchanged") { unchanged++; console.log(`  same      presets/${kind}/${key}`); continue; }
      const { error: insErr } = await db.from("presets").insert({ organisation_id: null, kind, key, name, version: plan.version, json: raw as never, content_hash: hash, published_at: PUBLISHED_NOW });
      if (insErr) throw new Error(insErr.message);
      inserted++;
      console.log(`  inserted  presets/${kind}/${key} v${plan.version}`);
    } catch (e) {
      failed++;
      problems.push(`presets/${kind}/${key}: ${(e as Error).message}`);
      console.log(`  FAILED    presets/${kind}/${key}`);
    }
  }
}

/** The master trick vocabulary: a changed file becomes the next version, published at once (existing divisions keep what they ticked: a division stores only its unticked blocks). */
async function seedVocabulary() {
  for (const path of files("tricks")) {
    const raw = readJson(path);
    const key = basename(path, ".json");
    const missing = ["baseTricks", "modifiers", "categoryPrecedence", "namingTemplate"].filter((k) => !(k in raw));
    if (missing.length) { failed++; problems.push(`${path}: missing "${missing.join('", "')}"`); continue; }
    const badFamily = ((raw.modifiers as Array<{ key: string; family?: string }>) ?? []).filter((m) => m.family !== "addon" && m.family !== "grab_landing");
    if (badFamily.length) { failed++; problems.push(`${path}: every modifier needs a "family" of addon or grab_landing (${badFamily.map((m) => m.key).join(", ")})`); continue; }
    const hash = canonicalHash(raw);
    const { data: rows, error } = await db.from("trick_vocabularies").select("version, content_hash").is("organisation_id", null).is("event_id", null).eq("key", key);
    if (error) { failed++; problems.push(`${path}: ${error.message}`); continue; }
    const plan = planPreset({ key, version: undefined, hash }, (rows ?? []).map((r) => ({ version: r.version, hash: r.content_hash })), false);
    if (plan.action === "error") { failed++; problems.push(plan.message); continue; }
    if (plan.action === "unchanged") { unchanged++; console.log(`  same      trick_vocabularies/${key}`); continue; }
    const { error: insErr } = await db.from("trick_vocabularies").insert({ organisation_id: null, event_id: null, key, version: plan.version, json: raw as never, content_hash: hash, published_at: PUBLISHED_NOW });
    if (insErr) { failed++; problems.push(`${path}: ${insErr.message}`); } else { inserted++; console.log(`  inserted  trick_vocabularies/${key} v${plan.version}`); }
  }
}

async function main() {
  console.log("Scoring models");
  await seedTable("scoring_models", files("scoring"), parseScoringModel, true);
  console.log("Format templates");
  await seedTable("format_templates", files("formats"), parseFormatTemplate, false);
  console.log("Identification schemes");
  const ident = readJson("presets/identification/schemes.json") as { palette: unknown; schemes: Array<Record<string, unknown> & { id: string; name: string }> };
  await seedGeneric("identification", ident.schemes.map((sc) => ({ key: sc.id, name: sc.name, raw: { ...sc, palette: ident.palette } as Record<string, unknown> })), parseIdentificationScheme);
  console.log("Schedule templates");
  await seedGeneric("schedule", files("schedule").map((path) => ({ key: basename(path, ".json"), name: "Kitemania Day 2 timetable", raw: readJson(path) })), parseScheduleDay);
  console.log("Trick vocabulary");
  await seedVocabulary();
  console.log(`\nDone: ${inserted} written, ${unchanged} unchanged, ${failed} failed.`);
  for (const p of problems) console.error(`  ✖ ${p}`);
  process.exit(failed ? 1 : 0);
}

main();
