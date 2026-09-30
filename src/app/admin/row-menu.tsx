"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteBlockedReason } from "@/lib/platform/organisation";
import { copy } from "@/lib/ui-copy";
import { ArchivePanel, DeletePanel, InvitePanel, RenamePanel } from "./organisations/[id]/panels";

const c = copy.admin.org;
type Action = "rename" | "archive" | "delete" | "invite";

export interface RowOrg {
  id: string;
  name: string;
  slug: string;
  archived: boolean;
  publishedResults: number;
}

/**
 * The "⋯" menu of one organisation row: Rename, Archive / Restore, Delete (owners only) and Invite organiser, each one tap from the list.
 * The list opens inline (a floating menu would be clipped by the scrolling table). Each action opens the same panel as on the Manage page.
 */
export function RowMenu({ org, isOwner }: { org: RowOrg; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const menuId = `menu-${org.id}`;

  const items: Array<{ key: Action; label: string }> = [
    { key: "rename", label: c.menuRename },
    { key: "archive", label: org.archived ? c.menuRestore : c.menuArchive },
    ...(isOwner ? [{ key: "delete" as const, label: c.menuDelete }] : []),
    { key: "invite", label: c.menuInvite },
  ];
  const title = { rename: c.renameHeading, archive: c.archiveHeading, delete: c.deleteHeading, invite: c.inviteHeading };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={c.rowMenu(org.name)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <ul id={menuId} role="menu" aria-label={c.rowMenu(org.name)} className="flex flex-col gap-1 rounded-md border-2 border-[#111] bg-white p-1">
          {items.map((i) => (
            <li key={i.key} role="none">
              <button
                type="button"
                role="menuitem"
                className="btn w-full justify-start"
                onClick={() => {
                  setAction(i.key);
                  setOpen(false);
                }}
              >
                {i.label}
              </button>
            </li>
          ))}
          <li role="none">
            <button type="button" role="menuitem" className="btn w-full justify-start" onClick={() => setOpen(false)}>
              {c.menuClose}
            </button>
          </li>
        </ul>
      ) : null}

      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="org-console max-h-[90vh] overflow-y-auto border-2 border-[#111] bg-white text-[#111]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold">{action ? `${title[action]}: ${org.name}` : ""}</DialogTitle>
            <DialogDescription className="sr-only">{org.name}</DialogDescription>
          </DialogHeader>
          {action === "rename" ? <RenamePanel orgId={org.id} name={org.name} /> : null}
          {action === "archive" ? <ArchivePanel orgId={org.id} name={org.name} archived={org.archived} /> : null}
          {action === "delete" ? <DeletePanel orgId={org.id} name={org.name} slug={org.slug} blocked={deleteBlockedReason(org.publishedResults)} isOwner={isOwner} /> : null}
          {action === "invite" ? <InvitePanel orgId={org.id} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
