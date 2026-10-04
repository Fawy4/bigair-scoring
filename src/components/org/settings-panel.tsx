"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, FolderOpen, MoreHorizontal } from "lucide-react";
import { orgCopy } from "@/lib/ui-copy";
import { Button } from "./button";
import { MenuItem, MenuLabel, Popover } from "./popover";

export type LoadItem = string | { id: string; label: string; key?: string; own?: boolean; isDefault?: boolean; hidden?: boolean };
const itemId = (i: LoadItem) => (typeof i === "string" ? i : i.id);
const itemLabel = (i: LoadItem) => (typeof i === "string" ? i : i.label);

interface SettingsPanelProps {
  title: string;
  /** The live example sentence. It stays in view (sticky) while the Advanced fold is scrolled, and is announced politely when it changes. */
  sentence: string;
  sentenceTestId?: string;
  /** The sentence is shown elsewhere on the page (a SummaryCard beside the form): not repeated inside the panel. */
  sentenceElsewhere?: boolean;
  /** The quiet "Load…" menu: names of saved presets (the preview) or `{ id, label }` with `onLoad` (the real screens), and "Save as preset…". */
  loadMenu?: {
    builtIn: LoadItem[];
    mine: LoadItem[];
    onLoad?: (id: string) => void;
    onSaveAsPreset?: () => void;
    disabledReason?: string;
    /** The small actions under an entry (rename, update, delete, hide…): when given, each real entry gets a "⋯" button that opens them. */
    renderManage?: (item: Exclude<LoadItem, string>) => ReactNode;
    /** How many built-ins the organisation has hidden: the menu's "Show hidden" line. */
    hiddenCount?: number;
    showHidden?: boolean;
    onToggleShowHidden?: () => void;
  };
  /** A note above the dials: a locked division says so here, once. */
  banner?: ReactNode;
  /** Under the Advanced fold: Save buttons, export and import. */
  footer?: ReactNode;
  simple: ReactNode;
  /** null = nothing behind the fold (no fold is drawn). */
  advanced: ReactNode | null;
  advancedCount: number;
  defaultAdvancedOpen?: boolean;
  /** When given, the fold's open or closed state is remembered on this device under this key (inside try/catch). */
  storageKey?: string;
  testId?: string;
}

/** Simple dials on top, the live sentence under the title, one "More settings" fold at the bottom, presets in a small "Load…" menu in the header. */
export function SettingsPanel({ title, sentence, sentenceTestId = "model-sentence", sentenceElsewhere, loadMenu, banner, footer, simple, advanced, advancedCount, defaultAdvancedOpen = false, storageKey, testId }: SettingsPanelProps) {
  const [open, setOpen] = useState(defaultAdvancedOpen);
  const [manageId, setManageId] = useState<string | null>(null);
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
        {!loadMenu ? null : loadMenu.disabledReason ? (
          <Button variant="quiet" icon={FolderOpen} disabled disabledReason={loadMenu.disabledReason}>
            {orgCopy.settings.load}
          </Button>
        ) : (
          <Popover label={orgCopy.settings.load} icon={FolderOpen} variant="quiet" align="end" panelRole="menu" testId="load-menu" panelClassName="max-h-[60dvh] w-80 overflow-y-auto">
            {(close) => {
              const entry = (item: LoadItem) => {
                const id = itemId(item);
                // a preset keeps its row (and what its actions just said) when an update gives it a new version id
                const rowKey = typeof item === "object" && item.key ? `${item.own ? "mine" : "built-in"}-${item.key}` : id;
                const manage = typeof item !== "string" ? loadMenu.renderManage?.(item) : null;
                return (
                  <div key={rowKey} className={typeof item === "object" && item.hidden ? "opacity-70" : undefined}>
                    <div className="flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <MenuItem
                          onClick={() => {
                            loadMenu.onLoad?.(id);
                            close();
                          }}
                        >
                          {itemLabel(item)}
                          {typeof item === "object" && item.isDefault ? <span className="ml-2 rounded-[6px] border border-beach-line px-1 text-small font-semibold">{orgCopy.settings.defaultTag}</span> : null}
                          {typeof item === "object" && item.hidden ? <span className="ml-2 rounded-[6px] border border-beach-line px-1 text-small font-semibold">{orgCopy.settings.hiddenTag}</span> : null}
                        </MenuItem>
                      </div>
                      {manage ? (
                        <Button variant="quiet" iconOnly icon={MoreHorizontal} aria-label={orgCopy.settings.manageAria(itemLabel(item))} aria-expanded={manageId === rowKey} onClick={() => setManageId(manageId === rowKey ? null : rowKey)} />
                      ) : null}
                    </div>
                    {manage && manageId === rowKey ? <div className="px-1 pb-1">{manage}</div> : null}
                  </div>
                );
              };
              return (
                <>
                  {loadMenu.mine.length > 0 ? <MenuLabel>{orgCopy.settings.mine}</MenuLabel> : null}
                  {loadMenu.mine.map(entry)}
                  <MenuLabel>{orgCopy.settings.builtIn}</MenuLabel>
                  {loadMenu.builtIn.map(entry)}
                  <div className="mt-1 border-t border-beach-line pt-1 empty:hidden">
                    {loadMenu.onSaveAsPreset ? (
                      <MenuItem
                        onClick={() => {
                          loadMenu.onSaveAsPreset?.();
                          close();
                        }}
                      >
                        {orgCopy.settings.saveAsPreset}
                      </MenuItem>
                    ) : null}
                    {loadMenu.onToggleShowHidden && ((loadMenu.hiddenCount ?? 0) > 0 || loadMenu.showHidden) ? (
                      <MenuItem onClick={loadMenu.onToggleShowHidden}>{loadMenu.showHidden ? orgCopy.settings.hideHiddenAgain : orgCopy.settings.showHidden(loadMenu.hiddenCount ?? 0)}</MenuItem>
                    ) : null}
                  </div>
                </>
              );
            }}
          </Popover>
        )}
      </header>
      {banner}
      {sentenceElsewhere ? null : <div className="sticky top-[var(--org-sticky-top,0px)] z-10 border-b border-beach-line bg-beach-surface px-4 py-2" aria-live="polite">
        <p className="text-small font-semibold text-beach-muted">{orgCopy.settings.sentenceLabel}</p>
        <p data-testid={sentenceTestId} className="text-body font-semibold">
          {sentence}
        </p>
      </div>}
      <div className="px-4">{simple}</div>
      {advanced ? <div className="border-t border-beach-line">
        <button type="button" aria-expanded={open} onClick={toggle} data-testid="advanced-toggle" className="group flex min-h-[var(--org-ctl)] w-full items-center gap-2 px-4 text-left text-body font-semibold hover:bg-beach-surface">
          <ChevronDown aria-hidden className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-180" />
          {orgCopy.settings.more(advancedCount)}
        </button>
        {open ? (
          <div data-testid="advanced-area" className="px-4 pb-2">
            {advanced}
          </div>
        ) : null}
      </div> : null}
      {footer ? <div className="border-t border-beach-line px-4 py-3">{footer}</div> : null}
    </section>
  );
}
