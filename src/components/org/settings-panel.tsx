"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import { orgCopy } from "@/lib/ui-copy";
import { MenuItem, MenuLabel, Popover } from "./popover";

interface SettingsPanelProps {
  title: string;
  /** The live example sentence. It stays in view (sticky) while the Advanced fold is scrolled, and is announced politely when it changes. */
  sentence: string;
  sentenceTestId?: string;
  /** Names of saved presets for the quiet "Load…" menu. */
  loadMenu: { builtIn: string[]; mine: string[] };
  simple: ReactNode;
  advanced: ReactNode;
  advancedCount: number;
  defaultAdvancedOpen?: boolean;
  /** When given, the fold's open or closed state is remembered on this device under this key (inside try/catch). */
  storageKey?: string;
  testId?: string;
}

/** Simple dials on top, the live sentence under the title, one "More settings" fold at the bottom, presets in a small "Load…" menu in the header. */
export function SettingsPanel({ title, sentence, sentenceTestId = "model-sentence", loadMenu, simple, advanced, advancedCount, defaultAdvancedOpen = false, storageKey, testId }: SettingsPanelProps) {
  const [open, setOpen] = useState(defaultAdvancedOpen);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "open" || saved === "closed") setOpen(saved === "open");
    } catch {
      /* storage not available: keep the default */
    }
  }, [storageKey]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      /* not remembered; still works until the page closes */
    }
  };
  return (
    <section data-testid={testId} aria-label={title} className="rounded-card border border-beach-line bg-beach-bg">
      <header className="flex items-center justify-between gap-2 border-b border-beach-line px-4 py-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <Popover label={orgCopy.settings.load} icon={FolderOpen} variant="quiet" align="end" panelRole="menu">
          {(close) => (
            <>
              <MenuLabel>{orgCopy.settings.builtIn}</MenuLabel>
              {loadMenu.builtIn.map((name) => (
                <MenuItem key={name} onClick={close}>
                  {name}
                </MenuItem>
              ))}
              <MenuLabel>{orgCopy.settings.mine}</MenuLabel>
              {loadMenu.mine.map((name) => (
                <MenuItem key={name} onClick={close}>
                  {name}
                </MenuItem>
              ))}
              <div className="mt-1 border-t border-beach-line pt-1">
                <MenuItem onClick={close}>{orgCopy.settings.saveAsPreset}</MenuItem>
              </div>
            </>
          )}
        </Popover>
      </header>
      <div className="sticky top-[var(--org-sticky-top,0px)] z-10 border-b border-beach-line bg-beach-surface px-4 py-2" aria-live="polite">
        <p className="text-small font-semibold text-beach-muted">{orgCopy.settings.sentenceLabel}</p>
        <p data-testid={sentenceTestId} className="text-body font-semibold">
          {sentence}
        </p>
      </div>
      <div className="px-4">{simple}</div>
      <div className="border-t border-beach-line">
        <button type="button" aria-expanded={open} onClick={toggle} data-testid="advanced-toggle" className="group flex min-h-[var(--org-ctl)] w-full items-center gap-2 px-4 text-left text-body font-semibold hover:bg-beach-surface">
          <ChevronDown aria-hidden className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-180" />
          {orgCopy.settings.more(advancedCount)}
        </button>
        {open ? (
          <div data-testid="advanced-area" className="px-4 pb-2">
            {advanced}
          </div>
        ) : null}
      </div>
    </section>
  );
}
