/**
 * A division keeps a preset plus a small "overrides" object (docs/06 §12 decision 8).
 *   merge: preset + overrides → the rules actually used
 *   diff : preset + edited rules → the overrides to store (only what changed)
 * Objects merge key by key, arrays are replaced as a whole, and `null` REMOVES a key, except at the paths listed
 * as nullable (a null that means something, e.g. "no attempt cap").
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (isObj(v)) return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canonical(x)]));
  return v;
}

/** Scoring models: where null is a real value. */
export const SCORING_NULLABLE = ["heat.maxAttemptsPerRider", "heat.impression"];
/** Format templates: where null is a real value. */
export const FORMAT_NULLABLE = ["entrants.max"];

export function mergeOverrides<T>(base: T, overrides: unknown, nullable: readonly string[] = [], path = ""): T {
  if (!isObj(overrides) || Object.keys(overrides).length === 0) return base;
  const out: Obj = isObj(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(overrides)) {
    const here = path ? `${path}.${key}` : key;
    if (value === null) {
      if (nullable.includes(here)) out[key] = null;
      else delete out[key];
    } else if (isObj(value) && isObj(out[key])) {
      out[key] = mergeOverrides(out[key], value, nullable, here);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * What must be stored so that merge(base, result) equals `edited`. Unchanged values are left out.
 * An object whose `type` changed (a different counting rule) is stored whole, so no stale fields linger.
 */
export function diffOverrides(base: unknown, edited: unknown, nullable: readonly string[] = [], path = ""): Obj {
  const out: Obj = {};
  const b = isObj(base) ? base : {};
  const e = isObj(edited) ? edited : {};
  for (const key of Object.keys(e)) {
    const here = path ? `${path}.${key}` : key;
    const ev = e[key];
    const bv = b[key];
    if (ev === undefined) continue;
    if (same(ev, bv)) continue;
    if (isObj(ev) && isObj(bv) && (!("type" in ev) || ev.type === bv.type)) {
      const inner = diffOverrides(bv, ev, nullable, here);
      if (Object.keys(inner).length > 0) out[key] = inner;
    } else {
      out[key] = ev;
    }
  }
  for (const key of Object.keys(b)) {
    if (e[key] === undefined && b[key] !== undefined) out[key] = null; // removed
  }
  return out;
}

export function isEmptyOverrides(o: unknown): boolean {
  return !isObj(o) || Object.keys(o).length === 0;
}

/** Same content, whatever the key order. */
export function sameOverrides(a: unknown, b: unknown): boolean {
  return same(a ?? {}, b ?? {});
}
