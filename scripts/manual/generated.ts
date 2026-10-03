import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { refusals, type Refusal } from "../../src/lib/manual/refusals";
import { settingHelps, whereOfKey } from "../../src/lib/manual/settings-lookup";
import { DivisionLiveSchema } from "../../src/lib/schemas/division-live";
import { EventSettingsSchema } from "../../src/lib/schemas/event-settings";
import { FormatTemplateSchema } from "../../src/lib/schemas/format-template";
import { ScoringModelSchema } from "../../src/lib/schemas/scoring-model";
import { FORMAT_LABELS, SCORING_LABELS, copy, help, orgCopy } from "../../src/lib/ui-copy";
import { CODES_WITHOUT_SENTENCE, NOTES, SECTIONS } from "./error-notes";

const ROOT = process.cwd();
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
const code = (s: string) => `\`${s}\``;

// ---------------------------------------------------------------------------------------------------- values

type Z = { _zod: { def: Record<string, unknown> & { type: string } } };
const def = (s: unknown) => (s as Z)._zod.def;

/** The value a field takes when it is left out, or undefined when there is none (the preset decides). */
function zodDefault(schema: unknown, segs: string[]): unknown {
  let s: unknown = schema;
  let found: unknown = undefined;
  const unwrap = () => {
    for (;;) {
      const d = def(s);
      if (d.type === "default" || d.type === "prefault") {
        found = typeof d.defaultValue === "function" ? (d.defaultValue as () => unknown)() : d.defaultValue;
        s = d.innerType;
      } else if (d.type === "optional" || d.type === "nullable" || d.type === "readonly" || d.type === "catch") s = d.innerType;
      else if (d.type === "pipe") s = d.in;
      else return;
    }
  };
  for (const seg of segs) {
    found = undefined;
    unwrap();
    const [key, variant] = seg.split("=");
    let d = def(s);
    if (d.type === "union") {
      const opts = d.options as unknown[];
      const pick = opts.find((o) => {
        const od = def(o);
        if (od.type !== "object") return false;
        const shape = od.shape as Record<string, unknown>;
        return key in shape;
      });
      if (!pick) return undefined;
      s = pick;
      d = def(s);
    }
    if (d.type === "object") {
      const shape = d.shape as Record<string, unknown>;
      if (!(key in shape)) return undefined;
      s = shape[key];
    } else if (d.type === "array" && (key === "*" || /^\d+$/.test(key))) s = d.element;
    else if (d.type === "tuple" && /^\d+$/.test(key)) s = (d.items as unknown[])[Number(key)];
    else if (d.type === "record" && key === "*") s = d.valueType;
    else return undefined;
    if (variant) {
      unwrap();
      const ud = def(s);
      if (ud.type === "union") {
        const opt = (ud.options as unknown[]).find((o) => {
          const shape = def(o).shape as Record<string, unknown> | undefined;
          const t = shape?.type;
          return t ? (def(t).values as unknown[] | undefined)?.includes(variant) : false;
        });
        if (!opt) return undefined;
        s = opt;
      }
    }
  }
  unwrap();
  return found;
}

/** The value a preset file has at a path ("heat.counting=best_n.n"), or undefined. */
function presetValue(json: unknown, segs: string[]): unknown {
  let v: unknown = json;
  for (const seg of segs) {
    const [key, variant] = seg.split("=");
    if (key === "*" || v === null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[key];
    if (variant && (v === null || typeof v !== "object" || (v as { type?: string }).type !== variant)) return undefined;
  }
  return v;
}

function words(v: unknown, values?: Record<string, string>): string | null {
  if (v === undefined) return null;
  if (v === null) return "none";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return values?.[v] ? `${values[v]} (${code(v)})` : code(v);
  if (Array.isArray(v) && v.every((x) => typeof x !== "object" || x === null)) return v.length ? v.map((x) => words(x, values)).join(", ") : "none";
  return null;
}

function presets(dir: string): Array<{ id: string; json: unknown }> {
  const full = path.join(ROOT, "presets", dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const json = JSON.parse(readFileSync(path.join(full, f), "utf8"));
      return { id: String(json.id ?? f.replace(/\.json$/, "")), json };
    });
}

function presetColumn(list: Array<{ id: string; json: unknown }>, segs: string[], values?: Record<string, string>): string {
  const got = list.map((p) => ({ id: p.id, v: words(presetValue(p.json, segs), values) })).filter((x) => x.v !== null);
  if (!got.length) return "—";
  const distinct = new Set(got.map((g) => g.v));
  if (distinct.size === 1 && got.length === list.length) return `all: ${got[0].v}`;
  return got.map((g) => `${code(g.id)} ${g.v}`).join("; ");
}

// ---------------------------------------------------------------------------------------------------- settings

const A = copy.manual.anchor.setting;

/** The Event step: each "?" with the stored field it changes (the Event step saves events.settings, and a few columns of the event itself). */
const EVENT_FIELDS: Array<[string, string, string]> = [
  ["event.name", copy.event.name, "name"],
  ["event.slug", copy.event.slug, "slug"],
  ["event.location", copy.event.location, "location"],
  ["event.dates", `${copy.event.firstDay} / ${copy.event.lastDay}`, "start_date, end_date"],
  ["event.timeZone", copy.event.timeZone, "timezone"],
  ["event.logo", copy.event.eventLogo, "branding.logoUrl"],
  ["event.sponsors", copy.event.sponsors, "branding.sponsors"],
  ["event.visibility", copy.event.visibilityHeading, "(the three switches below)"],
  ["event.showLive", copy.event.showLive, "settings.publicLiveScores"],
  ["event.showResults", copy.event.showResults, "settings.publicResultsOnPublish"],
  ["event.holdFinal", copy.event.holdFinal, "settings.holdFinalResult"],
  ["event.readyCall", copy.event.readyCall, "settings.readyCallMin"],
  ["event.livePoll", copy.event.livePoll, "settings.livePollSec"],
  ["event.screenRotate", copy.event.screenRotate, "settings.screenRotateSec"],
  ["event.screenColour", copy.event.screenColour, "settings.screenColourMode"],
  ["event.impressionName", copy.event.impressionName, "settings.impressionName"],
  ["event.flagsOn", copy.event.flagsOn, "settings.flags.enabled"],
  ["event.flagStates", copy.event.flagsHeading, "settings.flags.states"],
  ["event.prestartSec", copy.event.prestartSec, "settings.flags.prestartSec"],
  ["event.lastMinuteSec", copy.event.lastMinuteSec, "settings.flags.lastMinuteSec"],
  ["event.leaderboards", copy.event.leaderboards, "settings.externalLeaderboards"],
  ["event.publicTabs", copy.event.publicPage, "settings.publicTabsOff"],
  ["event.maxRunning", copy.event.maxRunning, "settings.maxRunningHeats"],
  ["event.judgesLog", copy.event.judgesLog, "settings.judgesMayLogAttempts"],
  ["event.windBanner", copy.event.windBanner, "settings.windCallBanner"],
  ["event.registrationOpen", copy.event.registrationStatus, "settings.registrationOpen"],
  ["event.registrationCloses", copy.event.registrationCloses, "settings.registrationClosesOn"],
  ["event.registrationClosesTime", copy.event.registrationClosesTime, "settings.registrationClosesTime"],
  ["event.registrationMax", copy.event.registrationMax, "settings.registrationMaxPerDivision"],
  ["event.registrationClosedMessage", copy.event.registrationClosedMessage, "settings.registrationClosedMessage"],
  ["event.simulation", copy.event.simulation, "is_simulation"],
];
const IDENT_FIELDS: Array<[string, string]> = [
  ["ident.lycraQuestion", copy.ident.lycraQuestion],
  ["ident.preset", copy.ident.preset],
  ["ident.primary", copy.ident.primary],
  ["ident.fallback", copy.ident.fallback],
  ["ident.callout", copy.ident.callout],
  ["ident.lycras", copy.ident.lycras],
  ["ident.bibs", copy.ident.bibs],
  ["ident.secondary", copy.ident.secondary],
  ["ident.kiteFields", copy.ident.kiteFields],
  ["ident.palette", copy.ident.palette],
  ["ident.allowOverride", copy.ident.allowOverride],
  ["ident.savePreset", copy.ident.saveName],
];
const LIVE_FIELDS: Array<[string, string, string]> = [
  ["division.showPercent", copy.liveSettings.showPercent, "showPercentOfMax"],
  ["division.liveScores", copy.liveSettings.liveScores, "publicLiveScores"],
  ["division.resultsOnPublish", copy.liveSettings.resultsOnPublish, "publicResultsOnPublish"],
  ["division.holdFinal", copy.liveSettings.holdFinal, "holdFinalResult"],
  ["division.attemptDisplay", copy.liveSettings.attemptDisplay, "spectatorAttemptDisplay"],
  ["division.summary.counts", copy.liveSettings.summaryCounts, "impressionSummary.counts"],
  ["division.summary.variety", copy.liveSettings.summaryVariety, "impressionSummary.variety"],
  ["division.summary.directions", copy.liveSettings.summaryDirections, "impressionSummary.directions"],
  ["division.summary.landedList", copy.liveSettings.summaryList, "impressionSummary.landedList"],
];
const DIAL_FIELDS: Record<string, string> = {
  bestN: "heat.counting=best_n.n",
  attempts: "heat.maxAttemptsPerRider",
  judges: "panel.minJudges",
  aggregate: "panel.aggregate",
  impression: "heat.impression",
  impressionMax: "heat.impression.scale.max",
  trickWeight: "heat.trickWeight",
  impressionWeight: "heat.impression.weight",
  duplicateWindow: "heat.duplicateWindowSec",
  outlier: "panel.outlierWarnPct",
  trimMin: "panel.trimMinJudges",
  maxJudges: "panel.maxJudges",
  decimals: "panel.decimals",
  distinct: "heat.counting=best_n.distinctTrickNames",
  requireAll: "panel.requireAllJudges",
  ratio: "heat.landedRatioHint",
};

const helpText = (key: string) => help[key]?.text ?? "";
const helpExample = (key: string) => help[key]?.example ?? "";

function eventDefault(field: string): string {
  const d = EventSettingsSchema.parse({}) as Record<string, unknown>;
  const f = field.replace(/^settings\./, "");
  if (!field.startsWith("settings.")) {
    if (field === "is_simulation") return "off";
    if (field === "timezone") return "the organisation's default time zone";
    return "—";
  }
  if (f === "publicLiveScores") return `${code(String(d[f]))} (not live)`;
  return words(d[f]) ?? "empty";
}

function settingsBlocks(): Record<string, string> {
  const scoringPresets = presets("scoring");
  const formatPresets = presets("formats");
  // the "?" text ends with its "where it shows / what it changes" sentence, as on screen (Polish 2, item 9)
  const keyOfAnchor = new Map(settingHelps().map((h) => [h.anchor, h.key] as const));
  const withWhere = (anchor: string, text: string) => {
    const key = keyOfAnchor.get(anchor);
    const w = key ? whereOfKey(key) : undefined;
    return w && text ? `${text} ${w}` : text;
  };
  const row = (anchor: string, label: string, text: string, example: string, def: string, extra?: string) =>
    `| {#${anchor}} **${cell(label)}** | ${cell(withWhere(anchor, text))} | ${cell(example)} | ${cell(def)} |${extra !== undefined ? ` ${cell(extra)} |` : ""}`;
  const head4 = "| Setting | What it does (the “?” text) | Example | Default |\n|---|---|---|---|";
  const head5 = "| Setting | What it does (the “?” text) | Example | Default | Preset values |\n|---|---|---|---|---|";

  const event = [head4, ...EVENT_FIELDS.map(([k, label, field]) => row(A(k), label, helpText(k), helpExample(k), `${eventDefault(field)} · stored as ${code(field)}`))].join("\n");
  const ident = [head4, ...IDENT_FIELDS.map(([k, label]) => row(A(k), label, helpText(k), helpExample(k), k === "ident.preset" ? "Lycra colour per heat" : "from the preset"))].join("\n");
  const liveDefaults = DivisionLiveSchema.parse({}) as Record<string, unknown>;
  const live = [
    head4,
    ...LIVE_FIELDS.map(([k, label, field]) => {
      const v = field.split(".").reduce<unknown>((o, s) => (o as Record<string, unknown>)?.[s], liveDefaults);
      return row(A(k), label, helpText(k), helpExample(k), `${v === null ? "the event's setting" : (words(v) ?? "—")} · stored as ${code(`live_settings.${field}`)}`);
    }),
  ].join("\n");

  const dials = [
    head5,
    ...[...Object.entries(orgCopy.settings.dials), ...Object.entries(orgCopy.settings.advanced)].map(([k, d]) => {
      const p = DIAL_FIELDS[k] ?? "";
      const segs = p.split(".");
      return row(A(`dial.${k}`), d.label, d.explanation, d.example, `${p ? (words(zodDefault(ScoringModelSchema, segs)) ?? "set by the preset") : "—"}${p ? ` · ${code(p)}` : ""}`, p ? presetColumn(scoringPresets, segs) : "—");
    }),
  ].join("\n");

  const generated = (labels: typeof SCORING_LABELS, schema: unknown, list: Array<{ id: string; json: unknown }>, prefix: "scoring" | "format") =>
    [
      head5,
      ...Object.entries(labels)
        .filter(([, l]) => l.help)
        .map(([p, l]) => {
          const segs = p.split(".");
          const d = words(zodDefault(schema, segs), l.values);
          return row(A(`${prefix}.${p}`), `${l.label}${l.off ? ` (off: “${l.off}”)` : ""}`, l.help ?? "", l.example ?? "", `${d ?? "set by the preset"} · ${code(p)}`, presetColumn(list, segs, l.values));
        }),
    ].join("\n");

  const ladderTypes = [
    "| Ladder type | What it does | Example |\n|---|---|---|",
    ...Object.entries(copy.formatSimple.types).map(([k, t]) => `| {#${A(`ladder.${k}`)}} **${cell(t.title)}** | ${cell(withWhere(A(`ladder.${k}`), t.explain))} | ${cell(t.example)} |`),
    `| {#${A("ladder.custom")}} **${cell(copy.formatSimple.customLadder.title)}** | ${cell(withWhere(A("ladder.custom"), copy.formatSimple.customLadder.explain))} | ${cell(copy.formatSimple.customLadder.example)} |`,
  ].join("\n");
  const formatHelp = [
    head4,
    ...Object.keys(help)
      .filter((k) => k.startsWith("format.") || k.startsWith("scoring.") || k === "rules.showAll" || k === "riders.showAllColumns")
      .map((k) => row(A(k), k.replace(/^[a-z]+\./, ""), helpText(k), helpExample(k), "—")),
  ].join("\n");

  const s = copy.admin.settings;
  const platform = [
    head4,
    row(A("platform.productName"), s.productName, s.productNameHelp.text, s.productNameHelp.example ?? "", "the built-in name (NEXT_PUBLIC_PRODUCT_NAME)"),
    row(A("platform.logo"), s.logo, s.logoHelp.text, s.logoHelp.example ?? "", "none"),
    row(A("platform.tagline"), s.tagline, s.taglineHelp.text, s.taglineHelp.example ?? "", `“${copy.landing.tagline}”`),
    row(A("platform.timeZone"), s.timeZone, s.timeZoneHelp.text, s.timeZoneHelp.example ?? "", "NEXT_PUBLIC_DEFAULT_TZ, else Africa/Cairo"),
    row(A("platform.legal"), `${s.terms} / ${s.privacy}`, s.legalHelp.text, s.legalHelp.example ?? "", "empty"),
    row(A("admin.inviteSend"), copy.admin.org.inviteSend, copy.admin.org.inviteSendHelp.text, copy.admin.org.inviteSendHelp.example ?? "", "on"),
  ].join("\n");

  const sim = settingHelps().filter((h) => h.key.startsWith("simulator."));
  const simulator = [head4, ...sim.map((h) => row(h.anchor, h.label, h.text, h.example ?? "", "—"))].join("\n");
  const d = copy.divisions.identification;
  const divisionLabel = [head4, row(A("division.identificationMode"), d.modeLabel, d.modeExplain, d.modeExample, d.useEvent)].join("\n");

  return {
    "event-settings": event,
    "identification-settings": ident,
    "scoring-dials": dials,
    "scoring-all": generated(SCORING_LABELS, ScoringModelSchema, scoringPresets, "scoring"),
    "ladder-types": ladderTypes,
    "format-all": generated(FORMAT_LABELS, FormatTemplateSchema, formatPresets, "format"),
    "format-help": formatHelp,
    "live-settings": live,
    "division-label": divisionLabel,
    "platform-settings": platform,
    "simulator-settings": simulator,
  };
}

// ---------------------------------------------------------------------------------------------------- errors

function noteFor(r: Refusal) {
  const sec = SECTIONS[r.section];
  const n = NOTES[r.path] ?? {};
  return { title: sec?.title ?? "Other", where: n.w ?? sec?.where ?? "—", meaning: n.m ?? sec?.meaning ?? "—", fix: n.f ?? sec?.fix ?? "—" };
}

function migrationCodes(): string[] {
  const dir = path.join(ROOT, "supabase", "migrations");
  const codes = new Set<string>();
  for (const f of readdirSync(dir)) for (const m of readFileSync(path.join(dir, f), "utf8").matchAll(/raise exception '([A-Z][A-Z0-9_]+)/g)) codes.add(m[1]);
  return [...codes].sort();
}

function errorBlocks(): Record<string, string> {
  const all = refusals();
  const bySection = new Map<string, Refusal[]>();
  for (const r of all) {
    const t = noteFor(r).title;
    bySection.set(t, [...(bySection.get(t) ?? []), r]);
  }
  const parts: string[] = [];
  for (const [title, list] of [...bySection.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`### ${title}\n\n| Sentence on screen | Where | What it means | Fix |\n|---|---|---|---|`);
    for (const r of list) {
      const n = noteFor(r);
      parts.push(`| {#${r.anchor}} “${cell(r.text)}” | ${cell(n.where)} | ${cell(n.meaning)} | ${cell(n.fix)} |`);
    }
    parts.push("");
  }

  const byCode = new Map<string, Refusal[]>();
  for (const r of all) {
    const last = r.path.split(".").pop()!;
    if (/^[A-Z][A-Z0-9_]+$/.test(last)) byCode.set(last, [...(byCode.get(last) ?? []), r]);
  }
  const codes = ["| Code | Shown as | What it means |\n|---|---|---|"];
  for (const c of migrationCodes()) {
    const hits = byCode.get(c);
    if (hits?.length) {
      const first = hits[0];
      codes.push(`| {#code-${c.toLowerCase().replace(/_/g, "-")}} ${code(c)} | ${hits.map((h) => `[“${cell(h.text)}”](#${h.anchor})`).filter((v, i, a) => a.indexOf(v) === i).join(" · ")} | ${cell(noteFor(first).meaning)} |`);
    } else {
      const x = CODES_WITHOUT_SENTENCE[c];
      codes.push(`| {#code-${c.toLowerCase().replace(/_/g, "-")}} ${code(c)} | ${cell(x?.shown ?? "the screen's general “That did not work” sentence")} | ${cell(x?.meaning ?? "Not described yet: add it to scripts/manual/error-notes.ts.")} |`);
    }
  }

  // the alphabetical index for the troubleshooting page: the first words of the sentence, then the fix, and the link to the full row
  const sortKey = (t: string) => t.replace(/^[“"‹›\s✖⚠]+/, "").replace(/‹[^›]*›/g, "…").toLowerCase();
  const index = ["| Sentence on screen | Fix | Details |\n|---|---|---|"];
  const seen = new Set<string>();
  for (const r of [...all].sort((a, b) => sortKey(a.text).localeCompare(sortKey(b.text)))) {
    if (seen.has(r.text)) continue;
    seen.add(r.text);
    index.push(`| “${cell(r.text)}” | ${cell(noteFor(r).fix)} | [${cell(noteFor(r).title)}](errors.md#${r.anchor}) |`);
  }

  return { sentences: parts.join("\n"), codes: codes.join("\n"), index: index.join("\n") };
}

/** Every generated block, by manual file. */
export function buildGenerated(): Record<string, Record<string, string>> {
  const e = errorBlocks();
  return {
    "settings.md": settingsBlocks(),
    "errors.md": { sentences: e.sentences, codes: e.codes },
    "troubleshooting.md": { index: e.index },
  };
}

export { migrationCodes };
