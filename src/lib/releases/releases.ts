/**
 * The releases file (docs/RELEASES.md): one entry per product version with what changed, what to test and known issues. Pure: the
 * caller reads the file. The admin Releases page, the Health page and the admin home all read it through `parseReleases`.
 */

export interface ReleaseCheck {
  /** Made from the check's words (`checkKey`): a tick belongs to these words, so a reworded check needs a new tick. */
  key: string;
  /** The check as written, inline Markdown. */
  text: string;
}

export interface Release {
  version: string;
  /** As written in the heading, for example "3 Oct 2026". */
  date: string;
  /** The heading's fixed anchor, "release-0-10-0". */
  anchor: string;
  /** The pull request number, or null when the line is missing. */
  pr: number | null;
  /** The "What changed" section as Markdown. */
  changed: string;
  checks: ReleaseCheck[];
  /** "What to test" is the single line "Nothing to test on the live address." (a pull request that changes no screen). */
  nothingToTest: boolean;
  /** The "Known issues" section as Markdown ("" when the section is missing). */
  knownIssues: string;
  /** Problems with this entry, in words (a test fails when there is one). */
  problems: string[];
}

const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** What a pull request that changes no screen (tests only, docs only) writes under "What to test" instead of checks. */
export const NOTHING_TO_TEST = "Nothing to test on the live address.";
const HEADING = /^## (\S+) — (.+?)\s*\{#([A-Za-z0-9_-]+)\}\s*$/;

/** "0.10.0" → "release-0-10-0". */
export const releaseAnchor = (version: string) => `release-${version.replace(/\./g, "-")}`;

/** The address of a version's entry on the admin Releases page. */
export const releaseHref = (version: string) => `/admin/releases#${releaseAnchor(version)}`;

/** Newest first: compares "0.10.0" and "0.9.1" number by number. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
  return 0;
}

/** A short stable key from a check's words (FNV-1a over the words, lower case, spaces collapsed), 1 to 7 characters of a–z and 0–9. */
export function checkKey(text: string): string {
  const s = text.trim().replace(/\s+/g, " ").toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Reads every entry of the releases file, in the order of the file. Lines before the first "## " heading are the file's introduction. */
export function parseReleases(source: string): Release[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Release[] = [];
  let cur: Release | null = null;
  let section: "changed" | "test" | "known" | null = null;
  const changed: string[] = [];
  const known: string[] = [];
  const finish = () => {
    if (!cur) return;
    cur.changed = changed.join("\n").trim();
    cur.knownIssues = known.join("\n").trim();
    if (!cur.changed) cur.problems.push("“What changed” is empty");
    if (!cur.knownIssues) cur.problems.push("“Known issues” is missing (write “None known.”)");
    out.push(cur);
    changed.length = 0;
    known.length = 0;
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      finish();
      section = null;
      const m = HEADING.exec(line);
      cur = { version: m?.[1] ?? line.slice(3).trim(), date: m?.[2] ?? "", anchor: m?.[3] ?? "", pr: null, changed: "", checks: [], nothingToTest: false, knownIssues: "", problems: [] };
      if (!m) cur.problems.push("the heading must read “## ‹version› — ‹date› {#release-‹version with dashes›}”");
      else {
        if (!VERSION.test(cur.version)) cur.problems.push(`“${cur.version}” is not a version like 0.10.0`);
        if (cur.anchor !== releaseAnchor(cur.version)) cur.problems.push(`the anchor must be {#${releaseAnchor(cur.version)}}`);
        if (!/^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(cur.date)) cur.problems.push(`the date “${cur.date}” must read like 3 Oct 2026`);
      }
      continue;
    }
    if (!cur) continue;
    const pr = /^PR:\s*#(\d+)\s*$/.exec(line.trim());
    if (pr && section === null) {
      cur.pr = Number(pr[1]);
      continue;
    }
    if (line.startsWith("### ")) {
      const name = line.slice(4).trim().toLowerCase();
      section = name === "what changed" ? "changed" : name === "what to test" ? "test" : name === "known issues" ? "known" : null;
      if (!section) cur.problems.push(`unknown section “${line.slice(4).trim()}”`);
      continue;
    }
    if (section === "changed") changed.push(line);
    else if (section === "known") known.push(line);
    else if (section === "test") {
      const m = /^- \[[ xX]\] (.+)$/.exec(line.trim());
      if (m) cur.checks.push({ key: checkKey(m[1]), text: m[1].trim() });
      else if (line.trim() === NOTHING_TO_TEST) cur.nothingToTest = true;
      else if (line.trim()) cur.problems.push(`a check must be one line starting “- [ ] ”: “${line.trim()}”`);
    }
  }
  finish();
  for (const r of out) {
    if (r.pr === null) r.problems.push("the line “PR: #‹number›” is missing");
    if (r.nothingToTest && r.checks.length) r.problems.push(`“${NOTHING_TO_TEST}” and checks cannot both be there`);
    const keys = new Set<string>();
    for (const c of r.checks) {
      if (keys.has(c.key)) r.problems.push(`the check “${c.text}” is written twice`);
      keys.add(c.key);
    }
  }
  return out;
}

/** The entries newest first. */
export const newestFirst = (releases: Release[]) => [...releases].sort((a, b) => compareVersions(a.version, b.version));

export interface ReleaseTick {
  version: string;
  key: string;
  /** When, ISO. */
  at: string;
  /** Who: their e-mail address, or null when that login was removed. */
  by: string | null;
}

export interface ReleaseSignoff {
  version: string;
  at: string;
  by: string | null;
  total: number;
}

export interface ReleaseProgress {
  version: string;
  /** False when the releases file has no entry for this version. */
  hasEntry: boolean;
  done: number;
  total: number;
  /** The entry says there is nothing to test on the live address. */
  nothingToTest: boolean;
  /** Who marked the version tested, and when; null while it is not. */
  tested: { at: string; by: string | null } | null;
}

/** How far a version's testing is: ticks only count for checks the file still has (a reworded check is a new one). */
export function releaseProgress(version: string, releases: Release[], ticks: ReleaseTick[], signoffs: ReleaseSignoff[]): ReleaseProgress {
  const entry = releases.find((r) => r.version === version);
  const keys = new Set(entry?.checks.map((c) => c.key) ?? []);
  const done = new Set(ticks.filter((t) => t.version === version && keys.has(t.key)).map((t) => t.key)).size;
  const s = signoffs.find((x) => x.version === version);
  return { version, hasEntry: Boolean(entry), done, total: keys.size, nothingToTest: Boolean(entry?.nothingToTest), tested: s ? { at: s.at, by: s.by } : null };
}

/** The database's answer (admin_release_status) as typed lists; anything unexpected is left out. */
export function readReleaseStatus(data: unknown): { ticks: ReleaseTick[]; signoffs: ReleaseSignoff[] } {
  const o = (data && typeof data === "object" ? data : {}) as { ticks?: unknown; signoffs?: unknown };
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const ticks = (Array.isArray(o.ticks) ? o.ticks : [])
    .map((t: Record<string, unknown>) => ({ version: str(t?.version), key: str(t?.key), at: str(t?.at), by: str(t?.by) }))
    .filter((t): t is ReleaseTick => Boolean(t.version && t.key && t.at));
  const signoffs = (Array.isArray(o.signoffs) ? o.signoffs : [])
    .map((s: Record<string, unknown>) => ({ version: str(s?.version), at: str(s?.at), by: str(s?.by), total: typeof s?.total === "number" ? s.total : 0 }))
    .filter((s): s is ReleaseSignoff => Boolean(s.version && s.at));
  return { ticks, signoffs };
}
