import { FORMAT_LABELS, HELP_WHERE, SCORING_LABELS, copy, help, orgCopy, type Help } from "@/lib/ui-copy";

/**
 * Which part of the manual's settings page (docs/manual/settings.md) explains a "?". A "?" knows only its words, so the lookup goes by text: every
 * "?" text in ui-copy.ts is listed with its anchor (copy.manual.anchor.setting). A text that is not listed opens the settings page itself.
 */
export interface SettingHelp {
  key: string;
  anchor: string;
  label: string;
  text: string;
  example?: string;
  /** The one-line version shown under a setting's label, when it has one. */
  line?: string;
}

function collect(): SettingHelp[] {
  const a = copy.manual.anchor.setting;
  const out: SettingHelp[] = [];
  for (const [key, h] of Object.entries(help)) out.push({ key, anchor: a(key), label: key, text: h.text, example: h.example, ...(h.line ? { line: h.line } : {}) });
  for (const [path, l] of Object.entries(SCORING_LABELS)) if (l.help) out.push({ key: `scoring.${path}`, anchor: a(`scoring.${path}`), label: l.label, text: l.help, example: l.example });
  for (const [path, l] of Object.entries(FORMAT_LABELS)) if (l.help) out.push({ key: `format.${path}`, anchor: a(`format.${path}`), label: l.label, text: l.help, example: l.example });
  for (const [k, d] of Object.entries(orgCopy.settings.dials)) out.push({ key: `dial.${k}`, anchor: a(`dial.${k}`), label: d.label, text: d.explanation, example: d.example });
  for (const [k, d] of Object.entries(orgCopy.settings.advanced)) out.push({ key: `dial.${k}`, anchor: a(`dial.${k}`), label: d.label, text: d.explanation, example: d.example });
  const s = copy.admin.settings;
  const platform: Array<[string, string, Help]> = [
    ["platform.productName", s.productName, s.productNameHelp],
    ["platform.logo", s.logo, s.logoHelp],
    ["platform.tagline", s.tagline, s.taglineHelp],
    ["platform.timeZone", s.timeZone, s.timeZoneHelp],
    ["platform.legal", `${s.terms} / ${s.privacy}`, s.legalHelp],
  ];
  for (const [key, label, h] of platform) out.push({ key, anchor: a(key), label, text: h.text, example: h.example });
  const sim = copy.simulator;
  const simHelp: Array<[string, string, Help]> = [
    ["simulator.speed", sim.speed.heading, sim.speed.help],
    ["simulator.play", sim.play.heading, sim.play.help],
    ["simulator.roles", sim.roles.heading, sim.roles.help],
    ["simulator.attempts", sim.behaviour.attemptsPerRider, sim.behaviour.attemptsHelp],
    ["simulator.crashes", sim.behaviour.crashShare, sim.behaviour.crashHelp],
    ["simulator.repeats", sim.behaviour.repeatShare, sim.behaviour.repeatHelp],
    ["simulator.spread", sim.behaviour.spread, sim.behaviour.spreadHelp],
    ["simulator.judgeMode", sim.behaviour.judgeMode, sim.behaviour.judgeModeHelp],
    ["simulator.scenarios", sim.scenarios.heading, sim.scenarios.help],
    ["simulator.viewAs", sim.viewAs.heading, sim.viewAs.help],
    ["simulator.checklist", sim.checklist.heading, sim.checklist.help],
    ["simulator.skip", sim.skip.button, sim.skip.help],
    ["simulator.whole", sim.whole.button, sim.whole.help],
  ];
  for (const [key, label, h] of simHelp) out.push({ key, anchor: a(key), label, text: h.text, example: h.example });
  for (const [k, t] of Object.entries(copy.formatSimple.types)) out.push({ key: `ladder.${k}`, anchor: a(`ladder.${k}`), label: t.title, text: t.explain, example: t.example });
  const c = copy.formatSimple.customLadder;
  out.push({ key: "ladder.custom", anchor: a("ladder.custom"), label: c.title, text: c.explain, example: c.example });
  const d = copy.divisions.identification;
  out.push({ key: "division.identificationMode", anchor: a("division.identificationMode"), label: d.modeLabel, text: d.modeExplain, example: d.modeExample });
  out.push({ key: "admin.inviteSend", anchor: a("admin.inviteSend"), label: copy.admin.org.inviteSend, text: copy.admin.org.inviteSendHelp.text, example: copy.admin.org.inviteSendHelp.example });
  return out;
}

let cached: SettingHelp[] | null = null;
export const settingHelps = (): SettingHelp[] => (cached ??= collect());

const SETTINGS_PAGE = "page-settings";

/** The address of the manual's explanation of a "?" with these words (the settings page itself when the words are not listed). */
export function settingHref(text: string | undefined): string {
  const t = (text ?? "").trim();
  const all = settingHelps();
  // the exact words, or (a "?" that adds its example after the text) the longest text the words start with
  const hit = !t ? undefined : (all.find((h) => h.text === t) ?? all.filter((h) => t.startsWith(h.text)).sort((a, b) => b.text.length - a.text.length)[0]);
  return copy.manual.href(hit ? hit.anchor : SETTINGS_PAGE);
}

/** The sentence that ends a "?" (Polish 2, item 9): where the setting shows and what it changes; a key without its own uses the nearest one above it. */
export function whereOfKey(key: string): string | undefined {
  const parts = key.split(".");
  for (let n = parts.length; n > 0; n--) {
    const k = parts.slice(0, n).join(".");
    if (HELP_WHERE[k]) return HELP_WHERE[k];
  }
  return undefined;
}

/** The "where it shows" sentence for a "?" with these words (as settingHref finds its row); undefined when the words are not a listed setting. */
export function settingWhere(text: string | undefined): string | undefined {
  const t = (text ?? "").trim();
  if (!t) return undefined;
  const all = settingHelps();
  const hit = all.find((h) => h.text === t || h.line === t) ?? all.filter((h) => t.startsWith(h.text)).sort((a, b) => b.text.length - a.text.length)[0];
  return hit ? whereOfKey(hit.key) : undefined;
}
