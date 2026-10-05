import type { PresetKind } from "./io";
import type { PresetRow } from "./options";

/** A division as the "in use" check sees it: where it lives and which preset rows it points at. */
export interface DivisionUse {
  divisionName: string;
  eventName: string;
  eventArchived: boolean;
  scoringModelId: string | null;
  formatTemplateId: string | null;
}

/**
 * The divisions that stop a preset being deleted: every division of a NON-archived event that points at any version of it.
 * `presetIds` are the ids of all versions of one preset. Returns "Pro Men in Arrow Big Air" lines, each division once.
 */
export function inUseBy(kind: PresetKind, presetIds: readonly string[], divisions: readonly DivisionUse[]): string[] {
  const ids = new Set(presetIds);
  const seen = new Set<string>();
  for (const d of divisions) {
    if (d.eventArchived) continue;
    const id = kind === "scoring_model" ? d.scoringModelId : d.formatTemplateId;
    if (id && ids.has(id)) seen.add(`${d.divisionName} in ${d.eventName}`);
  }
  return [...seen];
}

export const nameAfterRename = (name: string): string => name.trim();

/**
 * "Update preset from this division": the preset's settings are replaced by writing the next version as a NEW row. Rows already written are never edited,
 * which is why a division that loaded an older version keeps exactly what it loaded.
 */
export function nextVersionOf(rows: readonly PresetRow[], key: string, json: Record<string, unknown>, id: string): { row: PresetRow; rows: PresetRow[] } {
  const mine = rows.filter((r) => r.key === key);
  const version = Math.max(0, ...mine.map((r) => r.version)) + 1;
  const base = mine[0];
  const row: PresetRow = { id, key, name: base?.name ?? String(json.name ?? key), version, organisation_id: base?.organisation_id ?? null, json: { ...json, id: key, version } };
  return { row, rows: [...rows, row] };
}

/** A built-in can be hidden by an organisation unless it is the DEFAULT. */
export const canHideBuiltIn = (key: string, defaultKey: string | null): boolean => key !== defaultKey;
/** The owner can retire any built-in except the DEFAULT. */
export const canRetire = (key: string, defaultKey: string | null): boolean => key !== defaultKey;
