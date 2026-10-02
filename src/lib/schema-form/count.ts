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
