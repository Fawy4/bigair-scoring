"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { MenuItem, Popover } from "@/components/org/popover";
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
  const [action, setAction] = useState<Action | null>(null);

  const items: Array<{ key: Action; label: string }> = [
    { key: "rename", label: c.menuRename },
    { key: "archive", label: org.archived ? c.menuRestore : c.menuArchive },
    ...(isOwner ? [{ key: "delete" as const, label: c.menuDelete }] : []),
    { key: "invite", label: c.menuInvite },
  ];
  const title = { rename: c.renameHeading, archive: c.archiveHeading, delete: c.deleteHeading, invite: c.inviteHeading };

  return (
    <div>
      <Popover ariaLabel={c.rowMenu(org.name)} iconOnly icon={MoreHorizontal} variant="secondary" align="end" panelRole="menu" panelClassName="w-56">
        {(close) => (
          <>
            {items.map((i) => (
              <MenuItem
                key={i.key}
                onClick={() => {
                  setAction(i.key);
                  close();
                }}
              >
                {i.label}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>

      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="org-console max-h-[90vh] overflow-y-auto border border-beach-line bg-beach-bg text-beach-ink">
          <DialogHeader>
            <DialogTitle>{action ? `${title[action]}: ${org.name}` : ""}</DialogTitle>
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
