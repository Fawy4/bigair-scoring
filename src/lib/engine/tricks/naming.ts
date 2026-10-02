/** The naming template (docs/08 §1I-1): `{direction}` and `{blocks}`, nothing else. No I/O. */
export const DEFAULT_NAMING_TEMPLATE = "{direction} {blocks}";
const PARTS = new Set(["{direction}", "{blocks}"]);

/** The template a vocabulary really uses: an older vocabulary held a sentence describing the rule, which names exactly as the default. */
export function effectiveNamingTemplate(template: string | null | undefined): string {
  return typeof template === "string" && template.includes("{blocks}") ? template : DEFAULT_NAMING_TEMPLATE;
}

export type NamingTemplateProblem = { code: "missing_blocks" } | { code: "unknown_part"; part: string };

/** Null when the template can be used; otherwise what is wrong (the sentence is in ui-copy). */
export function checkNamingTemplate(template: string): NamingTemplateProblem | null {
  const unknown = (template.match(/\{[^}]*\}/g) ?? []).find((p) => !PARTS.has(p));
  if (unknown) return { code: "unknown_part", part: unknown };
  if (!template.includes("{blocks}")) return { code: "missing_blocks" };
  return null;
}

/** The name: the template filled in, free text last, spaces collapsed, ends trimmed. */
export function renderTrickName(template: string, direction: string, blockWords: string[], freeText: string): string {
  const filled = effectiveNamingTemplate(template).split("{direction}").join(direction).split("{blocks}").join(blockWords.join(" "));
  return [filled, freeText].join(" ").replace(/\s+/g, " ").trim();
}
