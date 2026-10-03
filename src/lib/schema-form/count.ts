import type { FieldNode } from "./nodes";

/**
 * How many settings the "More settings (n)" fold holds: every field the generated form would draw, a group of fields counted by its fields,
 * an on/off group as one more, a list or map as one. `hidden` drops top-level keys and `hiddenPaths` drops pattern paths, exactly as the form does.
 */
export function countFields(node: FieldNode, hidden: readonly string[] = [], hiddenPaths: readonly string[] = [], root = true): number {
  const shown = (fields: FieldNode[]) => fields.filter((f) => !(root && hidden.includes(f.key)) && !hiddenPaths.includes(f.pattern.join(".")));
  switch (node.kind) {
    case "object":
      return shown(node.fields).reduce((sum, f) => sum + countFields(f, hidden, hiddenPaths, false), 0);
    case "choice":
      return 1 + Math.max(0, ...node.variants.map((v) => countFields(v.node, hidden, hiddenPaths, false)));
    case "nullable":
      return 1 + (node.inner.kind === "object" ? countFields(node.inner, hidden, hiddenPaths, false) : 0);
    case "orConst":
      return 1;
    default:
      return 1;
  }
}

/**
 * How many settings the form draws for this value (Polish 2, item 8): a choice counts its selector plus the fields of the variant chosen now, an on/off its
 * switch plus its fields when on. `flatPaths` are a choice or an on/off whose switch is drawn elsewhere (a main dial): only what the current choice adds counts.
 */
export function countVisible(node: FieldNode, value: unknown, opts: { hidden?: readonly string[]; hiddenPaths?: readonly string[]; flatPaths?: readonly string[] } = {}, root = true): number {
  const hiddenPaths = opts.hiddenPaths ?? [];
  const flat = (n: FieldNode) => (opts.flatPaths ?? []).includes(n.pattern.join("."));
  const child = (v: unknown, key: string) => (v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined);
  switch (node.kind) {
    case "object":
      return node.fields
        .filter((f) => !(root && (opts.hidden ?? []).includes(f.key)) && !hiddenPaths.includes(f.pattern.join(".")))
        .reduce((sum, f) => sum + countVisible(f, child(value, f.key), opts, false), 0);
    case "choice": {
      const current = child(value, node.discriminator);
      const variant = node.variants.find((v) => v.value === current) ?? node.variants[0];
      return (flat(node) ? 0 : 1) + countVisible(variant.node, value, opts, false);
    }
    case "nullable": {
      const on = value !== null && value !== undefined;
      const inner = on && node.inner.kind === "object" ? countVisible(node.inner, value, opts, false) : 0;
      return (flat(node) ? 0 : 1) + inner;
    }
    default:
      return 1;
  }
}
