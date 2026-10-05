"use client";

import { useState, useTransition } from "react";
import { deletePreset, renamePreset, setBuiltInHidden } from "@/app/org/(console)/preset-actions";
import type { PresetKind } from "@/lib/presets/io";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { Button, disabledWhen } from "./button";

const C = copy.presetManage;

export interface ManagedPreset {
  key: string;
  name: string;
  own: boolean;
  isDefault?: boolean;
  hidden?: boolean;
}

/** What the screen does after a change, so its list follows without a reload. */
export interface PresetChanges {
  onRenamed: (key: string, name: string) => void;
  onRemoved: (key: string) => void;
  onHidden: (key: string, hidden: boolean) => void;
  /** Only where there is a division to take the settings from (the Load… menu): overwrite the preset, optional reason. */
  updateFromDivision?: (key: string, reason: string) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
}

type Mode = "rename" | "update" | "delete" | null;
type Note = { kind: "ok" | "error"; text: string } | null;

const inputClass = "h-[var(--org-ctl)] w-full min-w-0 rounded-[8px] border border-beach-border bg-transparent px-3 text-body font-semibold";

/** The small actions under one preset: Rename, Update from this division, Delete (own) or Hide / Show (built-in). Used in the Load… menu and on the Presets card. */
export function PresetRowActions({ organisationId, kind, preset, changes, onDone }: { organisationId: string; kind: PresetKind; preset: ManagedPreset; changes: PresetChanges; onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState(preset.name);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<Note>(null);
  const [pending, start] = useTransition();
  const testKey = `${kind}-${preset.key}`;

  function finish(text: string) {
    setNote({ kind: "ok", text });
    setMode(null);
    onDone?.();
  }

  const rename = () =>
    start(async () => {
      const res = await renamePreset({ organisationId, kind, key: preset.key, name });
      if (!res.ok) return setNote({ kind: "error", text: res.error });
      changes.onRenamed(preset.key, name.trim());
      finish(C.renamed(name.trim()));
    });
  const remove = () =>
    start(async () => {
      const res = await deletePreset({ organisationId, kind, key: preset.key });
      if (!res.ok) {
        setMode(null);
        return setNote({ kind: "error", text: res.error });
      }
      changes.onRemoved(preset.key);
      setNote({ kind: "ok", text: C.deleted(preset.name) });
    });
  const update = () =>
    start(async () => {
      const res = await changes.updateFromDivision!(preset.key, reason);
      if (!res.ok) return setNote({ kind: "error", text: res.error });
      setReason("");
      finish(res.message);
    });
  const hide = (hidden: boolean) =>
    start(async () => {
      const res = await setBuiltInHidden({ organisationId, kind, key: preset.key, hidden });
      if (!res.ok) return setNote({ kind: "error", text: res.error });
      changes.onHidden(preset.key, hidden);
      // a hidden entry leaves the menu (and this row with it), so the confirmation is a toast
      toast({ title: hidden ? C.hidden(preset.name) : C.shown(preset.name) });
      setNote({ kind: "ok", text: hidden ? C.hidden(preset.name) : C.shown(preset.name) });
    });

  return (
    <div className="org-new flex flex-col gap-2 rounded-[8px] bg-beach-surface p-2" data-testid={`preset-actions-${testKey}`}>
      {preset.own ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" onClick={() => setMode(mode === "rename" ? null : "rename")} aria-expanded={mode === "rename"}>
              {C.rename}
            </Button>
            {changes.updateFromDivision ? (
              <Button variant="quiet" onClick={() => setMode(mode === "update" ? null : "update")} aria-expanded={mode === "update"}>
                {C.updateFromDivision}
              </Button>
            ) : null}
            <Button variant="quiet" onClick={() => setMode(mode === "delete" ? null : "delete")} aria-expanded={mode === "delete"}>
              {C.delete}
            </Button>
          </div>
          {mode === "rename" ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                rename();
              }}
            >
              <label className="text-small font-semibold" htmlFor={`rn-${testKey}`}>
                {C.renameLabel}
              </label>
              <input id={`rn-${testKey}`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
              <div className="flex gap-2">
                <Button type="submit" variant="primary" {...disabledWhen(pending ? copy.common.saving : null)}>
                  {C.renameSave}
                </Button>
                <Button variant="quiet" onClick={() => setMode(null)}>
                  {C.cancel}
                </Button>
              </div>
            </form>
          ) : null}
          {mode === "update" ? (
            <div className="flex flex-col gap-2">
              <p className="text-small font-medium text-beach-muted">{C.updateHelp(preset.name)}</p>
              <label className="text-small font-semibold" htmlFor={`rs-${testKey}`}>
                {C.updateReason}
              </label>
              <input id={`rs-${testKey}`} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
              <div className="flex gap-2">
                <Button variant="primary" onClick={update} {...disabledWhen(pending ? copy.common.saving : null)}>
                  {C.updateConfirm}
                </Button>
                <Button variant="quiet" onClick={() => setMode(null)}>
                  {C.cancel}
                </Button>
              </div>
            </div>
          ) : null}
          {mode === "delete" ? (
            <div className="flex flex-col gap-2">
              <p className="text-small font-semibold">{C.deleteConfirm(preset.name)}</p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={remove} {...disabledWhen(pending ? copy.common.saving : null)}>
                  {C.deleteYes}
                </Button>
                <Button variant="quiet" onClick={() => setMode(null)}>
                  {C.cancel}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : preset.hidden ? (
        <div>
          <Button variant="quiet" onClick={() => hide(false)} {...disabledWhen(pending ? copy.common.saving : null)}>
            {C.show}
          </Button>
        </div>
      ) : preset.isDefault ? (
        <p className="text-small font-medium text-beach-muted">{C.errors.isDefault}</p>
      ) : (
        <div>
          <Button variant="quiet" onClick={() => hide(true)} {...disabledWhen(pending ? copy.common.saving : null)}>
            {C.hide}
          </Button>
        </div>
      )}
      {note ? (
        <p role={note.kind === "error" ? "alert" : "status"} data-testid="preset-note" className={note.kind === "error" ? "field-error" : "text-small font-semibold"}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
