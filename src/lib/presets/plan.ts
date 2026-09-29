import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/** Fingerprint of a preset's content; key order does not matter, array order does. */
export function canonicalHash(json: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(json))).digest("hex");
}

export type PresetPlan = { action: "insert"; version: number } | { action: "unchanged" } | { action: "error"; message: string };

/**
 * Decides what the seed does with one preset file. Rows already used by divisions are never edited:
 * a change becomes a new version row (docs/05 §12).
 */
export function planPreset(
  file: { key: string; version: number | undefined; hash: string },
  existing: Array<{ version: number; hash: string }>,
  versioned: boolean,
): PresetPlan {
  if (existing.length === 0) return { action: "insert", version: file.version ?? 1 };
  const latest = existing.reduce((a, b) => (b.version > a.version ? b : a));
  if (!versioned) {
    return file.hash === latest.hash ? { action: "unchanged" } : { action: "insert", version: latest.version + 1 };
  }
  const v = file.version ?? 1;
  if (v > latest.version) return { action: "insert", version: v };
  if (v < latest.version) return { action: "error", message: `${file.key}: the file says version ${v} but the database already has version ${latest.version}.` };
  return file.hash === latest.hash
    ? { action: "unchanged" }
    : { action: "error", message: `${file.key}: the content changed but the version is still ${v}. Bump "version" in the preset file so running events keep the old rules.` };
}
