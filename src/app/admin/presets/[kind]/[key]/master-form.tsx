"use client";

import { useRouter } from "next/navigation";
import { RulesPanel } from "@/app/org/(console)/events/[id]/divisions/rules-panel";
import type { DivisionRow } from "@/app/org/(console)/events/[id]/divisions/divisions-manager";
import type { PresetRow } from "@/lib/presets/options";
import { copy } from "@/lib/ui-copy";
import { saveMasterPreset } from "../../../actions";

const M = copy.admin.presets.manage;

/**
 * The owner's form for one built-in preset: the SAME Simple / Advanced form organisers see on the Divisions step, not tied to a division. Saving adds a new version
 * (published at once for the owner); a division that loaded an earlier version keeps exactly that.
 */
export function MasterPresetForm({ kind, presets, baseId, presetKey, initialName }: { kind: "scoring_model" | "format_template"; presets: PresetRow[]; baseId: string | null; presetKey: string | null; initialName: string }) {
  const router = useRouter();
  const division: DivisionRow = {
    id: "master-preset",
    name: initialName || M.addHeading(kind === "scoring_model" ? copy.admin.presets.kinds.scoring_model : copy.admin.presets.kinds.format_template),
    sort_order: 1,
    scoring_model_id: kind === "scoring_model" ? baseId : null,
    scoring_overrides: {},
    format_template_id: kind === "format_template" ? baseId : null,
    format_params: {},
    description: null,
    identification: null,
    trickBase: {},
    liveSettings: {},
    started: false,
    hasHeats: false,
    locked: false,
    riders: [],
    drawLocked: false,
  };
  return (
    <RulesPanel
      kind={kind}
      eventId=""
      division={division}
      presets={presets}
      organisationId=""
      onPresetAdded={() => {}}
      onPresetsChange={() => {}}
      hiddenKeys={[]}
      onHiddenChange={() => {}}
      defaultKey={null}
      onDivisionChange={() => {}}
      standalone={{
        initialName,
        saveLabel: M.saveButton,
        save: async (name, json) => {
          const res = await saveMasterPreset({ kind, key: presetKey, name, json });
          if (!res.ok) return { ok: false, error: res.error };
          router.push("/admin/presets");
          router.refresh();
          return { ok: true, message: res.published ? M.saved(name, res.version) : M.savedDraft(name, res.version) };
        },
      }}
    />
  );
}
