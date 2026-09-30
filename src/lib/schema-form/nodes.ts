import { z } from "zod";
import { copy } from "@/lib/ui-copy";

/**
 * Turns a Zod schema into a tree of form-field descriptions (docs/06 §1: "a form generated from the Zod schema").
 * Zod 4 → JSON Schema → nodes. Pure; the React renderer only draws nodes. Every node carries a *pattern* path in which
 * list items and map entries are written "*", e.g. "trick.criteria.*.weight". Labels come from a per-schema label map.
 */
export interface LabelEntry {
  label: string;
  help?: string;
  /** What "off" means for a nullable / "or constant" field (e.g. "No limit", "Automatic"). */
  off?: string;
  /** Labels for enum values. */
  values?: Record<string, string>;
  /** One example, shown with the help text. */
  example?: string;
}
export type LabelMap = Record<string, LabelEntry>;

interface Base {
  /** Pattern path, e.g. ["trick","criteria","*","weight"]. */
  pattern: string[];
  key: string;
  label: string;
  help?: string;
  example?: string;
  required: boolean;
}
export type FieldNode = Base &
  (
    | { kind: "object"; fields: FieldNode[] }
    | { kind: "string" }
    | { kind: "number"; integer: boolean; min?: number; exclusiveMin?: number; max?: number }
    | { kind: "boolean" }
    | { kind: "enum"; options: Array<{ value: string; label: string }> }
    | { kind: "fixed"; value: unknown }
    | { kind: "list"; item: FieldNode; minItems?: number }
    | { kind: "record"; value: FieldNode }
    | { kind: "choice"; discriminator: string; variants: Array<{ value: string; label: string; node: Extract<FieldNode, { kind: "object" }> }> }
    | { kind: "nullable"; inner: FieldNode; off: string; /** true: "off" removes the key (an optional field), false: it sets null */ absent: boolean }
    | { kind: "orConst"; inner: FieldNode; constValue: string; off: string }
    | { kind: "tuple"; items: FieldNode[] }
    | { kind: "json" }
  );

type Schema = Record<string, unknown> & {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema | false;
  prefixItems?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  enum?: unknown[];
  const?: unknown;
  additionalProperties?: Schema | boolean;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  minItems?: number;
  default?: unknown;
};

export const humanise = (key: string): string => {
  const s = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const HUGE = 1e15;
/** Optional in the schema but chosen by the screen itself (a format has either a generator or its own rounds). */
const ALWAYS_SHOWN = new Set(["generator", "rounds"]);

export function schemaToNodes(schema: z.ZodType, labels: LabelMap, hidden: readonly string[] = []): FieldNode {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Schema;
  const root = build(json, "", [], true, false, labels);
  if (root.kind !== "object") throw new Error("schemaToNodes: the schema must be an object");
  return { ...root, fields: root.fields.filter((f) => !hidden.includes(f.key)) };
}

function meta(labels: LabelMap, pattern: string[], key: string) {
  const entry = labels[pattern.join(".")];
  return { label: entry?.label ?? humanise(key), help: entry?.help, example: entry?.example, entry };
}

function build(s: Schema, key: string, parent: string[], required: boolean, optional: boolean, labels: LabelMap): FieldNode {
  const node = buildInner(s, key, parent, required, labels);
  // A truly optional section (no default, not required) gets an on/off switch instead of empty fields.
  if (optional && key !== "" && !ALWAYS_SHOWN.has(node.pattern.join(".")) && (node.kind === "object" || node.kind === "choice" || node.kind === "list" || node.kind === "record")) {
    const entry = labels[node.pattern.join(".")];
    return { pattern: node.pattern, key: node.key, label: node.label, help: node.help, example: node.example, required: false, kind: "nullable", absent: true, off: entry?.off ?? copy.friendly.notUsed, inner: node };
  }
  return node;
}

function buildInner(s: Schema, key: string, parent: string[], required: boolean, labels: LabelMap): FieldNode {
  const pattern = key === "" ? [] : [...parent, key];
  const { label, help, example, entry } = meta(labels, pattern, key || "root");
  const base = { pattern, key, label, help, example, required };
  const sub = (child: Schema, childKey: string, req: boolean, opt = false) => build(child, childKey, pattern, req, opt, labels);

  // discriminated union: oneOf [{ properties: { type: { const } } }, ...]
  if (Array.isArray(s.oneOf) && s.oneOf.length > 0 && s.oneOf.every((o) => o.properties && Object.values(o.properties).some((p) => p.const !== undefined))) {
    const disc = Object.keys(s.oneOf[0].properties!).find((k) => s.oneOf!.every((o) => o.properties?.[k]?.const !== undefined)) ?? "type";
    return {
      ...base,
      kind: "choice",
      discriminator: disc,
      variants: s.oneOf.map((o) => {
        const value = String(o.properties![disc].const);
        const node = buildInner(o, key, parent, true, labels) as Extract<FieldNode, { kind: "object" }>;
        return {
          value,
          label: labels[`${pattern.join(".")}=${value}`]?.label ?? humanise(value),
          node: { ...node, fields: node.fields.filter((f) => f.key !== disc) },
        };
      }),
    };
  }

  if (Array.isArray(s.anyOf)) {
    const nonNull = s.anyOf.filter((o) => o.type !== "null");
    const hasNull = nonNull.length !== s.anyOf.length;
    const constOpt = nonNull.find((o) => o.const !== undefined);
    if (hasNull && nonNull.length === 1) {
      return { ...base, kind: "nullable", absent: false, off: entry?.off ?? copy.friendly.notUsed, inner: buildInner(nonNull[0], key, parent, true, labels) };
    }
    if (constOpt && nonNull.length === 2) {
      const real = nonNull.find((o) => o !== constOpt)!;
      return { ...base, kind: "orConst", constValue: String(constOpt.const), off: entry?.off ?? humanise(String(constOpt.const)), inner: buildInner(real, key, parent, true, labels) };
    }
    return { ...base, kind: "json" };
  }

  if (s.const !== undefined) return { ...base, kind: "fixed", value: s.const };
  if (Array.isArray(s.enum)) {
    return { ...base, kind: "enum", options: s.enum.map((v) => ({ value: String(v), label: entry?.values?.[String(v)] ?? humanise(String(v)) })) };
  }

  switch (s.type) {
    case "boolean":
      return { ...base, kind: "boolean" };
    case "string":
      return { ...base, kind: "string" };
    case "number":
    case "integer":
      return {
        ...base,
        kind: "number",
        integer: s.type === "integer",
        min: s.minimum,
        exclusiveMin: s.exclusiveMinimum,
        max: s.maximum !== undefined && s.maximum < HUGE ? s.maximum : undefined,
      };
    case "array": {
      if (Array.isArray(s.prefixItems)) return { ...base, kind: "tuple", items: s.prefixItems.map((p, i) => sub(p, String(i), true)) };
      if (s.items && typeof s.items === "object") return { ...base, kind: "list", minItems: s.minItems, item: sub(s.items, "*", true) };
      return { ...base, kind: "json" };
    }
    case "object": {
      if (s.properties) {
        const req = new Set(s.required ?? []);
        return { ...base, kind: "object", fields: Object.entries(s.properties).map(([k, v]) => sub(v, k, req.has(k) && v.default === undefined, !req.has(k) && v.default === undefined)) };
      }
      if (s.additionalProperties && typeof s.additionalProperties === "object") return { ...base, kind: "record", value: sub(s.additionalProperties, "*", true) };
      return { ...base, kind: "json" };
    }
  }
  return { ...base, kind: "json" };
}

/** A sensible starting value for a node (used by "Add" buttons and when a switch turns a section on). */
export function defaultValueFor(node: FieldNode): unknown {
  switch (node.kind) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const f of node.fields) if (f.required || f.kind === "object" || f.kind === "fixed") out[f.key] = defaultValueFor(f);
      return out;
    }
    case "string":
      return "";
    case "number":
      return node.min ?? (node.exclusiveMin !== undefined ? node.exclusiveMin + 1 : 0);
    case "boolean":
      return false;
    case "enum":
      return node.options[0]?.value ?? "";
    case "fixed":
      return node.value;
    case "list":
      return Array.from({ length: node.minItems ?? 0 }, () => defaultValueFor(node.item));
    case "record":
      return {};
    case "choice":
      return { [node.discriminator]: node.variants[0].value, ...(defaultValueFor(node.variants[0].node) as object) };
    case "nullable":
      return defaultValueFor(node.inner);
    case "orConst":
      return defaultValueFor(node.inner);
    case "tuple":
      return node.items.map(defaultValueFor);
    case "json":
      return null;
  }
}

/** Every node in the tree, depth first (including choice variants and list item templates). */
export function allNodes(node: FieldNode): FieldNode[] {
  const out: FieldNode[] = [node];
  switch (node.kind) {
    case "object":
      for (const f of node.fields) out.push(...allNodes(f));
      break;
    case "list":
      out.push(...allNodes(node.item));
      break;
    case "record":
      out.push(...allNodes(node.value));
      break;
    case "choice":
      for (const v of node.variants) for (const f of v.node.fields) out.push(...allNodes(f));
      break;
    case "nullable":
    case "orConst":
      out.push(...allNodes(node.inner));
      break;
    case "tuple":
      for (const i of node.items) out.push(...allNodes(i));
      break;
  }
  return out;
}

const FRIENDLY: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/expected number, received (string|undefined|null|nan)/i, () => copy.friendly.enterNumber],
  [/expected string, received (undefined|null)/i, () => copy.friendly.needed],
  [/expected (object|array), received undefined/i, () => copy.friendly.sectionNeeded],
  [/expected int/i, () => copy.friendly.wholeNumber],
  [/too small: expected number to be >=?\s*(\S+)/i, (m) => copy.friendly.atLeast(m[1] ?? "")],
  [/too big: expected number to be <=?\s*(\S+)/i, (m) => copy.friendly.atMost(m[1] ?? "")],
  [/invalid option|invalid input: expected one of/i, () => copy.friendly.pickOne],
];

/** Zod's technical messages, in plain words. Our own refinement messages are already plain and pass through. */
export function friendlyMessage(message: string): string {
  for (const [re, text] of FRIENDLY) {
    const m = message.match(re);
    if (m) return text(m);
  }
  return message;
}
