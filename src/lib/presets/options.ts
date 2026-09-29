/** A stored scoring model or format template (system rows have organisation_id = null). */
export interface PresetRow {
  id: string;
  key: string;
  name: string;
  version: number;
  organisation_id: string | null;
  json: unknown;
}

export interface PresetOption {
  id: string;
  label: string;
}
export interface PresetGroups {
  system: PresetOption[];
  organisation: PresetOption[];
}

/** Latest version of each preset (system and own), plus the row a division already uses even when it is an older version. */
export function presetGroups(rows: readonly PresetRow[], selectedId: string | null): PresetGroups {
  const latest = new Map<string, PresetRow>();
  for (const r of rows) {
    const k = `${r.organisation_id ?? "system"}/${r.key}`;
    const cur = latest.get(k);
    if (!cur || r.version > cur.version) latest.set(k, r);
  }
  const chosen = new Set([...latest.values()].map((r) => r.id));
  const selected = selectedId ? rows.find((r) => r.id === selectedId) : undefined;
  const list = [...latest.values(), ...(selected && !chosen.has(selected.id) ? [selected] : [])];
  const label = (r: PresetRow) => (r.organisation_id && (r.version > 1 || !chosen.has(r.id)) ? `${r.name} (v${r.version})` : r.name);
  const byName = (a: PresetRow, b: PresetRow) => a.name.localeCompare(b.name) || b.version - a.version;
  return {
    system: list.filter((r) => !r.organisation_id).sort(byName).map((r) => ({ id: r.id, label: r.name })),
    organisation: list.filter((r) => r.organisation_id).sort(byName).map((r) => ({ id: r.id, label: label(r) })),
  };
}

/** Keys already taken by system presets or the organisation's own, so a new preset never collides. */
export function takenKeys(rows: readonly PresetRow[]): string[] {
  return [...new Set(rows.map((r) => r.key))];
}
