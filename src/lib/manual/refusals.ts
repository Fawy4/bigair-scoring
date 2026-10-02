import { copy, orgCopy } from "@/lib/ui-copy";

/**
 * Every refusal and error sentence the product can show, collected from ui-copy.ts. A sentence counts when it sits under an `errors`, `codes` or
 * `validation` object, under `controlWhy` (why a button is grey), under `csv` (a rider file's problems), in `friendly` (form checks), or is one of the
 * named keys below. Each gets an anchor in the manual's errors page (docs/manual/errors.md); a test fails when one is missing there, and the
 * organiser screens add a "Learn more" link after a sentence they recognise.
 */

export interface Refusal {
  /** Where it lives in ui-copy.ts, for example "liveErrors.codes.DRAW_NOT_LOCKED". */
  path: string;
  /** The manual anchor (copy.manual.anchor.refusal). */
  anchor: string;
  /** The sentence as written in the manual: a value the product fills in is shown as ‹name›. */
  text: string;
  /** Matches the sentence on screen, whatever was filled in (one pattern per form: "A judge has …" and "‹n› judges have …"). */
  patterns: RegExp[];
  /** The part of the copy file it belongs to ("liveErrors", "draw", …). */
  section: string;
}

/** Sentences outside an errors / codes / validation object that are refusals or problems too. */
export const EXTRA_REFUSAL_PATHS: readonly string[] = [
  "notFound.eventTitle",
  "notFound.pageTitle",
  "join.otherError",
  "join.selfAdd.failed",
  "login.linkFailed",
  "login.notRegistered",
  "login.tooMany",
  "login.couldNotSend",
  "login.wrongPassword",
  "login.forgotNeedsEmail",
  "login.notAnOrganiser",
  "setPassword.tooShort",
  "setPassword.mismatch",
  "setPassword.couldNotSave",
  "seat.switchedOff",
  "seat.noSeat",
  "landing.loadError",
  "landing.codeInvalid",
  "eventLifecycle.deleteBlocked",
  "eventLifecycle.ownerOnly",
  "publicSite.eventNotFound",
  "orgHome.noOrg",
  "orgSettings.readOnly",
  "orgSettings.readOnlyReason",
  "orgSettings.understandFirst",
  "orgSettings.fixThese",
  "orgSettings.noMembership",
  "orgSettings.notAllowed",
  "orgSettings.slugTaken",
  "orgSettings.saveFailed",
  "orgSettings.saveDenied",
  "logo.wrongType",
  "logo.tooBig",
  "logo.empty",
  "logo.uploadFailed",
  "event.understandFirst",
  "event.sponsorFirst",
  "event.sponsorLast",
  "event.simulationLocked",
  "event.fixThese",
  "event.notFound",
  "event.noOrg",
  "event.saveDenied",
  "event.slugTaken",
  "event.notAllowedValue",
  "event.saveFailed",
  "ident.nameTooShort",
  "ident.saveFailed",
  "divisions.firstDivision",
  "divisions.lastDivision",
  "divisions.nameTooShort",
  "divisions.hasHeats",
  "divisions.identification.fixFirst",
  "divisions.identification.switchOff",
  "divisions.identification.ownKeptButOff",
  "rules.loadLocked",
  "rules.unlockNeedsReason",
  "rules.saveInvalid",
  "rules.presetNeedsName",
  "rules.pasteEmpty",
  "rules.startFromMissing",
  "formatSimple.pointsInvalid",
  "formatSimple.fixFirst",
  "formatSimple.minAboveTarget",
  "formatSimple.maxBelowTarget",
  "formatSimple.finalEven",
  "formatSimple.perRound.emptyInvalid",
  "formatSimple.perRound.empty",
  "customBuilder.noRiders",
  "customBuilder.sizes",
  "customBuilder.eliminatesNobody",
  "customBuilder.lastRound",
  "ladder.cannotRun",
  "draw.noFormat",
  "draw.noRiders",
  "draw.unlockReasonShort",
  "draw.regenerateRefusedStarted",
  "draw.regenerateRefusedLocked",
  "draw.startedNote",
  "draw.lockedHelp",
  "draw.droppedNote",
  "draw.sheet.pngFailed",
  "builder.failed",
  "builder.applyBlocked",
  "builder.applyNoRiders",
  "builder.drawLocked",
  "builder.drawStarted",
  "runOrder.noHeats",
  "runOrder.goneHeat",
  "presets.notJson",
  "presets.tooLarge",
  "presets.notObject",
  "presets.wrongKind",
  "admin.ownerOnly",
  "admin.org.loadError",
  "admin.org.logoFailed",
  "admin.org.inviteBadEmail",
  "admin.org.inviteEmailFailed",
  "admin.org.deleteBlocked",
  "admin.org.ownerOnlyDelete",
  "admin.org.moveNoOthers",
  "admin.org.moveOwnerOnly",
  "admin.org.moveRunning",
  "admin.crash.heading",
  "admin.partProblem",
  "admin.demo.drawFailed",
  "admin.settings.readOnlyReason",
  "admin.settings.fixThese",
  "admin.settings.saveFailed",
  "admin.presets.notJson",
  "admin.presets.invalid",
  "admin.presets.vocabularyMissing",
  "admin.health.loadError",
  "admin.health.databaseDown",
  "admin.health.realtimeOff",
  "admin.health.settingsUnreadable",
  "slugLink.copyFailed",
  "riders.noDivisions",
  "riders.needTwo",
  "riders.firstRow",
  "riders.lastRow",
  "riders.nameRequiredHint",
  "riders.seedRepeated",
  "riders.importFailed",
  "riders.importNothing",
  "riders.inDraw",
  "riders.drawLocked",
  "riders.clash.lycra",
  "riders.clash.bib",
  "riders.clash.kite",
  "riders.clash.rashguard",
  "riders.clash.name",
  "trickBase.lockedNote",
  "trickBase.cannotUntick",
  "trickBase.admin.clash",
  "trickBase.admin.ownerOnly",
  "feedback.dictateUnavailable",
  "feedback.screenshotTooBig",
  "feedback.screenshotNotImage",
  "feedback.failed",
  "feedback.exportCopyFailed",
  "feedback.exportNone",
  "feedback.exportOwnerOnly",
  "officials.inHeat",
  "officials.pinUnknown",
  "officials.pinCouldNotRead",
  "officials.printNone",
  "officials.printNoPin",
  "officials.panelsNoJudges",
  "officials.panelsNoDivisions",
  "officials.shortfall",
  "registration.closedDefault",
  "registration.fullLine",
  "registration.archived",
  "registration.noDivisions",
  "registration.notFound",
  "registration.photoTooBig",
  "registration.photoNotImage",
  "registration.photoFailed",
  "registration.rateLimited",
  "registration.failed",
  "live.queue.memoryOnly",
  "live.connection.failed",
  "live.builder.micDenied",
  "live.builder.micFailed",
  "live.impression.submitWaiting",
  "live.impression.submitted",
  "pub.common.notFound",
  "pub.rider.notFound",
  "simulator.needLock",
  "simulator.notSimulation.notDrawn",
  "simulator.play.lines.notReady",
  "simulator.play.lines.busy",
  "simulator.play.lines.stoppedAtBlocker",
  "simulator.play.lines.waitHead",
  "simulator.play.lines.waitJudges",
  "simulator.play.lines.hold",
  "simulator.log.failed",
  "simulator.log.noRunning",
  "simulator.log.noRiders",
  "simulator.log.noCap",
  "simulator.log.noFinal",
  "simulator.log.noPublished",
  "simulator.log.noPlan",
  "simulator.log.noSpotter",
  "simulator.log.noHeadSeat",
  "simulator.log.noJudge",
  "simulator.reset.running",
  "simulator.reset.noBaseline",
  "simulator.reset.rebuildSkipped",
  "simulator.generic",
  "windCall.bannerOffNote",
  "liveErrors.network",
  "liveErrors.unknown",
  "judge.locked",
  "judge.reviewLocked",
  "judge.notOnPanel",
  "judge.stillSending",
  "spotter.paused",
  "spotter.notRunning",
  "spotter.outOfAttempts",
  "spotter.refusedCap",
  "spotter.refusedOther",
  "spotter.undoFailed",
  "crash.heading",
  "crash.part",
  "heatControl.noPlan",
  "headV2.notNext",
  "headV2.breakNone.no-plan",
  "headV2.breakNone.nothing-next",
  "headV2.breakNone.no-time",
  "publish.noModel",
  "publish.downstream",
  "reset.blocked",
  "reset.needAddress",
  "reset.needReason",
  "reset.rebuildArranged",
  "reset.copyHasResults",
  "reset.copyRelock",
  "reset.copyUnknown",
  "resetParts.blocked",
  "resetParts.needReason",
  "resetParts.division.noHeats",
  "resetParts.heat.scheduledWhy",
  "resetParts.alreadyRerunAs",
  "resetParts.plan.nothing",
  "headLive.publishNoOverride",
  "headLive.pastCapNeedsReason",
  "headLive.pastCapNotAllowed",
  "headLive.practiceNoHeat",
  "headLive.agreementWait",
  "headLive.flagOutUndecided",
  "readiness.pinHint",
  "org:dashboard.alreadyHeld",
  "org:dashboard.notHeld",
  "org:dashboard.noPlanToday",
  "org:dashboard.shiftHeld",
  "org:dashboard.resetRefused",
  "org:dashboard.failed",
];

/** Words inside those objects that are labels, not problems. */
const NOT_REFUSALS = new Set(["friendly.value", "friendly.notUsed", "friendly.use", "friendly.offLabel", "friendly.nothingMore"]);

/** Objects whose every sentence is a refusal or a problem. */
const WHOLE = /(^|\.)(errors|codes|validation|controlWhy|csv)(\.|$)|^friendly\./;

type Leaf = string | ((...args: never[]) => string);

function* walk(node: unknown, path: string): Generator<[string, Leaf]> {
  if (typeof node === "string" || typeof node === "function") {
    yield [path, node as Leaf];
    return;
  }
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) yield* walk(v, path ? `${path}.${k}` : k);
  }
}

const OPEN = "‹";
const CLOSE = "›";

/** The names of a function's parameters ("(heat, n) => …" → ["heat", "n"]), so a filled-in value reads as ‹heat›. */
function paramNames(fn: (...args: never[]) => string): string[] {
  const src = fn.toString();
  const m = /^\s*(?:function\s*\w*)?\s*\(([^)]*)\)/.exec(src) ?? /^\s*([A-Za-z_$][\w$]*)\s*=>/.exec(src);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((p) => p.replace(/=.*$/, "").replace(/[{}[\]\s]/g, "").replace(/[:?].*$/, ""))
    .filter(Boolean);
}

/** A database code whose detail carries several values ("Pro Men|2|3"): the stand-ins that give its full sentence. */
const DETAIL_PARTS: Record<string, string> = {
  "liveErrors.codes.PANEL_TOO_SMALL": `${OPEN}division${CLOSE}|${OPEN}have${CLOSE}|${OPEN}need${CLOSE}`,
};

/** Calls a sentence function with stand-ins and returns its forms (the first is the one the manual shows), or [] when it cannot be called with plain words. */
function templates(path: string, fn: (...args: never[]) => string): string[] {
  const names = paramNames(fn);
  const args = DETAIL_PARTS[path] ? [DETAIL_PARTS[path]] : (names.length ? names : ["detail"]).map((n) => `${OPEN}${n}${CLOSE}`);
  const call = (a: unknown[]): string | null => {
    try {
      const out = (fn as unknown as (...x: unknown[]) => string)(...a);
      return typeof out === "string" && out.trim() ? out : null;
    } catch {
      return null;
    }
  };
  const first = call(args) ?? call(args.map((a) => [a]));
  if (!first) return [];
  // the same sentence without the value: "A seat in this heat …" next to "‹n› seats in this heat …"
  const bare = names.length <= 1 ? call([]) : null;
  return bare && bare !== first ? [first, bare] : [first];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A pattern for the sentence on screen: each ‹stand-in› becomes "anything". */
export function patternFor(raw: string): RegExp {
  const text = raw.replace(/\s+/g, " ").trim();
  const parts = text.split(new RegExp(`${OPEN}[^${CLOSE}]*${CLOSE}`));
  return new RegExp(`^${parts.map((p) => escapeRe(p.trim() === "" ? p : p)).join("(.+?)")}$`, "s");
}

function collect(): Refusal[] {
  const out: Refusal[] = [];
  const extra = new Set(EXTRA_REFUSAL_PATHS);
  const roots: Array<[string, unknown]> = [
    ["", copy],
    ["org:", orgCopy],
  ];
  for (const [prefix, root] of roots) {
    for (const [p, leaf] of walk(root, "")) {
      const path = `${prefix}${p}`;
      if (p.startsWith("manual.") || p.startsWith("design.") || p.startsWith("buttons.") || NOT_REFUSALS.has(path)) continue;
      if (!(extra.has(path) || (prefix === "" && WHOLE.test(p)))) continue;
      const forms = typeof leaf === "string" ? [leaf] : templates(path, leaf);
      if (!forms.length) continue;
      out.push({ path, anchor: copy.manual.anchor.refusal(path), text: forms[0], patterns: forms.map(patternFor), section: path.replace(/^org:/, "").split(".")[0] });
    }
  }
  return out;
}

let cached: Refusal[] | null = null;
export function refusals(): Refusal[] {
  return (cached ??= collect());
}

/** Fast lookup: exact sentences in a map; a sentence with a filled-in value is tried only when the words start and end like it. */
interface Index {
  exact: Map<string, Refusal>;
  templated: Array<{ r: Refusal; forms: Array<{ prefix: string; suffix: string; re: RegExp }> }>;
}
let index: Index | null = null;
function getIndex(): Index {
  if (index) return index;
  const exact = new Map<string, Refusal>();
  const templated: Index["templated"] = [];
  for (const r of refusals()) {
    const plain = r.text.replace(/\s+/g, " ").trim();
    if (!plain.includes(OPEN) && !exact.has(plain)) exact.set(plain, r);
    if (plain.includes(OPEN) || r.patterns.length > 1) {
      templated.push({
        r,
        forms: r.patterns.map((re, i) => {
          const t = i === 0 ? plain : "";
          return { prefix: t ? t.slice(0, t.indexOf(OPEN) < 0 ? t.length : t.indexOf(OPEN)) : "", suffix: t && t.includes(CLOSE) ? t.slice(t.lastIndexOf(CLOSE) + 1) : "", re };
        }),
      });
    }
  }
  return (index = { exact, templated });
}

/** The manual anchor for a sentence on screen, or null. Exact sentences win over ones with a filled-in value; a longer sentence wins over a shorter one. */
export function refusalFor(shown: string): Refusal | null {
  const text = shown.replace(/\s+/g, " ").trim();
  if (text.length < 4 || text.length > 600) return null;
  const { exact, templated } = getIndex();
  const hit = exact.get(text);
  if (hit) return hit;
  let best: Refusal | null = null;
  for (const { r, forms } of templated) {
    if (best && r.text.length <= best.text.length) continue;
    if (forms.some((f) => text.startsWith(f.prefix) && text.endsWith(f.suffix) && f.re.test(text))) best = r;
  }
  // a wrapper such as "Could not do that: ‹why›" or "Not logged for ‹label›: ‹why›": the sentence inside explains more
  if (best && /‹(why|text)›$/.test(best.text)) {
    for (const p of best.patterns) {
      const m = p.exec(text);
      const inner = m?.[m.length - 1];
      const hit = inner && inner !== text ? refusalFor(inner) : null;
      if (hit) return hit;
    }
  }
  return best;
}

export const STAND_IN = { open: OPEN, close: CLOSE };
