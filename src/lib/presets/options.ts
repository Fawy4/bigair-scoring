/** A stored scoring model or format template (system rows have organisation_id = null). */
export interface PresetRow {
  id: string;
  key: string;
  name: string;
  version: number;
  organisation_id: string | null;
  json: unknown;
  /** Built-ins only: set by the owner when a preset is retired (out of every new menu; divisions keep their copy). */
  retired_at?: string | null;
}

export interface PresetOption {
  id: string;
  label: string;
  key?: string;
  /** One of this organisation's own presets (it can be renamed, updated and deleted). */
  own?: boolean;
  /** The owner's DEFAULT built-in: always offered, never hidden. */
  isDefault?: boolean;
  /** Shown only because "Show hidden" is on. */
  hidden?: boolean;
}
export interface PresetGroups {
  system: PresetOption[];
  organisation: PresetOption[];
  /** How many built-ins this organisation has hidden (the menu's "Show hidden" line). */
  hiddenCount: number;
}
export interface GroupOptions {
  hiddenKeys?: readonly string[];
  showHidden?: boolean;
  defaultKey?: string | null;
}

/** Latest version of each preset (system and own), plus the row a division already uses even when it is an older version. */
export function presetGroups(rows: readonly PresetRow[], selectedId: string | null, options: GroupOptions = {}): PresetGroups {
  const latest = new Map<string, PresetRow>();
  for (const r of rows) {
    const k = `${r.organisation_id ?? "system"}/${r.key}`;
    const cur = latest.get(k);
    if (!cur || r.version > cur.version) latest.set(k, r);
  }
  const chosen = new Set([...latest.values()].map((r) => r.id));
  const selected = selectedId ? rows.find((r) => r.id === selectedId) : undefined;
  const hidden = (r: PresetRow) => (r.json as { hidden?: boolean } | null)?.hidden === true;
  // hidden presets (fixed templates the menus no longer offer) stay usable by a division that already has one selected
  const hiddenKeys = new Set(options.hiddenKeys ?? []);
  const isHiddenByOrg = (r: PresetRow) => !r.organisation_id && hiddenKeys.has(r.key) && r.key !== options.defaultKey;
  const retired = (r: PresetRow) => Boolean(r.retired_at);
  const list = [...latest.values(), ...(selected && !chosen.has(selected.id) ? [selected] : [])].filter((r) => (!hidden(r) && !retired(r)) || r.id === selectedId);
  const hiddenCount = list.filter((r) => isHiddenByOrg(r) && r.id !== selectedId).length;
  const visible = list.filter((r) => !isHiddenByOrg(r) || options.showHidden || r.id === selectedId);
  const label = (r: PresetRow) => (r.organisation_id && (r.version > 1 || !chosen.has(r.id)) ? `${r.name} (v${r.version})` : r.name);
  const byName = (a: PresetRow, b: PresetRow) => a.name.localeCompare(b.name) || b.version - a.version;
  return {
    system: visible.filter((r) => !r.organisation_id).sort(byName).map((r) => ({ id: r.id, label: r.name, key: r.key, isDefault: r.key === options.defaultKey, hidden: isHiddenByOrg(r) })),
    organisation: visible.filter((r) => r.organisation_id).sort(byName).map((r) => ({ id: r.id, label: label(r), key: r.key, own: true })),
    hiddenCount,
  };
}

/** Keys already taken by system presets or the organisation's own, so a new preset never collides. */
export function takenKeys(rows: readonly PresetRow[]): string[] {
  return [...new Set(rows.map((r) => r.key))];
}
