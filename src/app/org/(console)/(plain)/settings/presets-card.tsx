"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/org/button";
import { PresetRowActions } from "@/components/org/preset-row-actions";
import type { PresetKind } from "@/lib/presets/io";
import { presetGroups, type PresetRow } from "@/lib/presets/options";
import { copy } from "@/lib/ui-copy";

const C = copy.presetManage;

interface Props {
  organisationId: string;
  scoring: PresetRow[];
  formats: PresetRow[];
  hidden: { scoring_model: string[]; format_template: string[] };
  defaults: { scoring_model: string | null; format_template: string | null };
}

/** The "Presets" card of the organisation settings: the organisation's own scoring and format presets (rename, delete) and the built-in ones (hide, show). */
export function PresetsCard({ organisationId, scoring: s0, formats: f0, hidden: h0, defaults }: Props) {
  const [rows, setRows] = useState<Record<PresetKind, PresetRow[]>>({ scoring_model: s0, format_template: f0 });
  const [hidden, setHidden] = useState(h0);
  return (
    <section aria-labelledby="presets-card" data-testid="presets-card" className="rounded-card border border-beach-line bg-beach-bg">
      <header className="border-b border-beach-line px-4 py-3">
        <h2 id="presets-card" className="text-[14px] font-semibold">
          {C.card.heading}
        </h2>
        <p className="mt-1 max-w-[70ch] text-small font-medium text-beach-muted">{C.card.intro}</p>
      </header>
      <div className="flex flex-col gap-6 px-4 py-4">
        {(["scoring_model", "format_template"] as const).map((kind) => (
          <Kind
            key={kind}
            kind={kind}
            title={kind === "scoring_model" ? C.card.scoring : C.card.format}
            organisationId={organisationId}
            rows={rows[kind]}
            hiddenKeys={hidden[kind]}
            defaultKey={defaults[kind]}
            changeRows={(f) => setRows((r) => ({ ...r, [kind]: f(r[kind]) }))}
            changeHidden={(keys) => setHidden((h) => ({ ...h, [kind]: keys }))}
          />
        ))}
        <p className="text-small font-medium text-beach-muted">{C.card.updateNote}</p>
      </div>
    </section>
  );
}

function Kind({ kind, title, organisationId, rows, hiddenKeys, defaultKey, changeRows, changeHidden }: { kind: PresetKind; title: string; organisationId: string; rows: PresetRow[]; hiddenKeys: string[]; defaultKey: string | null; changeRows: (f: (r: PresetRow[]) => PresetRow[]) => void; changeHidden: (keys: string[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const g = presetGroups(rows, null, { hiddenKeys, showHidden: true, defaultKey });
  const nameOf = (key: string, own: boolean) => rows.find((r) => r.key === key && (own ? r.organisation_id === organisationId : !r.organisation_id))?.name ?? key;
  const entry = (o: { id: string; label: string; key?: string; own?: boolean; isDefault?: boolean; hidden?: boolean }) => {
    const rowKey = `${o.own ? "mine" : "built-in"}-${o.key}`;
    return (
      <li key={rowKey} className={o.hidden ? "opacity-70" : undefined}>
        <div className="flex items-center gap-1">
          <p className="min-w-0 flex-1 py-2 text-body font-semibold">
            {o.label}
            {o.isDefault ? <span className="ml-2 rounded-[6px] border border-beach-line px-1 text-small">{C.defaultTag}</span> : null}
            {o.hidden ? <span className="ml-2 rounded-[6px] border border-beach-line px-1 text-small">{C.hiddenTag}</span> : null}
          </p>
          <Button variant="quiet" iconOnly icon={MoreHorizontal} aria-label={C.manageAria(o.label)} aria-expanded={open === rowKey} onClick={() => setOpen(open === rowKey ? null : rowKey)} />
        </div>
        {open === rowKey && o.key ? (
          <PresetRowActions
            organisationId={organisationId}
            kind={kind}
            preset={{ key: o.key, name: nameOf(o.key, Boolean(o.own)), own: Boolean(o.own), isDefault: o.isDefault, hidden: o.hidden }}
            changes={{
              onRenamed: (k, name) => changeRows((rs) => rs.map((r) => (r.key === k && r.organisation_id === organisationId ? { ...r, name } : r))),
              onRemoved: (k) => changeRows((rs) => rs.filter((r) => !(r.key === k && r.organisation_id === organisationId))),
              onHidden: (k, h) => changeHidden(h ? [...new Set([...hiddenKeys, k])] : hiddenKeys.filter((x) => x !== k)),
            }}
          />
        ) : null}
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-2" data-testid={`presets-${kind}`}>
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-beach-muted">{title}</h3>
      <p className="text-small font-semibold">{C.card.mine}</p>
      {g.organisation.length === 0 ? <p className="text-small font-medium text-beach-muted">{C.card.noneMine}</p> : <ul className="flex flex-col">{g.organisation.map(entry)}</ul>}
      <p className="text-small font-semibold">{C.card.builtIn}</p>
      <ul className="flex flex-col">{g.system.map(entry)}</ul>
    </div>
  );
}
