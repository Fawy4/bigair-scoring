"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { FieldLabel } from "@/components/help-button";
import { toast } from "@/hooks/use-toast";
import { canPublish, defaultVersion, type MasterKind, type MasterRow } from "@/lib/platform/master-presets";
import { copy } from "@/lib/ui-copy";
import { publishPreset, saveNewPresetVersion } from "../../../actions";

const c = copy.admin.presets;
type Row = MasterRow & { createdLabel: string };

export function PresetEditor({ kind, presetKey, isOwner, versions, baseVersion, initialJson }: { kind: MasterKind; presetKey: string; isOwner: boolean; versions: Row[]; baseVersion: number; initialJson: string }) {
  const [text, setText] = useState(initialJson);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = defaultVersion(versions);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="versions-h">
        <h2 id="versions-h" className="text-2xl font-semibold">
          {c.versionsHeading}
        </h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[c.versionColumns.version, c.versionColumns.status, c.versionColumns.created, c.versionColumns.actions].map((h) => (
                <th key={h} className="border border-beach-line bg-beach-surface p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => {
              const can = canPublish(versions, v.id);
              return (
                <tr key={v.id}>
                  <td className="border border-beach-line p-2 font-semibold">v{v.version}</td>
                  <td className="border border-beach-line p-2">
                    {v.published_at ? `✔ ${c.published}` : `✎ ${c.draft}`}
                    {current?.id === v.id ? ` · ${c.isDefault}` : ""}
                  </td>
                  <td className="border border-beach-line p-2">{v.createdLabel}</td>
                  <td className="border border-beach-line p-2">
                    {!v.published_at && isOwner && can.ok ? (
                      <ConfirmButton
                        label={c.publish}
                        question={c.publishConfirm(v.version)}
                        confirmLabel={c.publishYes}
                        cancelLabel={c.cancel}
                        pending={pending}
                        onConfirm={() =>
                          start(async () => {
                            setError(null);
                            const res = await publishPreset(kind, v.id);
                            if (res.ok) {
                              toast({ title: c.publishedDone });
                              router.refresh();
                            } else setError(res.error);
                          })
                        }
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isOwner ? null : <p className="panel font-semibold">{c.staffNote}</p>}
      </section>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await saveNewPresetVersion({ kind, key: presetKey, jsonText: text });
            if (res.ok) {
              toast({ title: c.saved(res.version) });
              router.refresh();
            } else setError(res.error);
          });
        }}
      >
        <FieldLabel htmlFor="preset-json" text={c.jsonLabel} help={c.jsonHelp} />
        <p className="text-sm font-semibold">{c.basedOn(baseVersion)}</p>
        <textarea id="preset-json" rows={24} className="font-mono text-sm" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} disabled={pending} />
        {error ? (
          <p role="alert" className="panel field-error whitespace-pre-wrap">
            {copy.common.problem(error)}
          </p>
        ) : null}
        <div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? c.saving : c.save}
          </button>
        </div>
      </form>
    </div>
  );
}
