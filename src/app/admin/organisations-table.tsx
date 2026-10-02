"use client";

import Link from "next/link";
import { Check, LogIn, Pause } from "lucide-react";
import { Pill } from "@/components/live/pill";
import { Button } from "@/components/org/button";
import { DataTable, EmptyState, type DataColumn } from "@/components/org/data-table";
import { useShellLayout } from "@/components/org/layout-context";
import { copy } from "@/lib/ui-copy";
import { startImpersonation } from "./actions";
import { RowMenu } from "./row-menu";

const c = copy.admin.org;

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  archived: boolean;
  plan: string;
  eventsText: string;
  lastText: string;
  publishedResults: number;
  testData: boolean;
}

/** The organisations list as the preview's dense table: search, a status filter, sticky header. */
export function OrganisationsTable({ rows, isOwner }: { rows: OrgRow[]; isOwner: boolean }) {
  const phone = useShellLayout() === "phone";
  const name: DataColumn<OrgRow> = {
    id: "name",
    header: `${c.columns.name} · ${c.columns.slug}`,
    render: (o) => (
      <span className="inline-flex items-center gap-2 font-semibold">
        {o.name}
        <span className="text-small font-medium text-beach-muted">/{o.slug}</span>
        {o.testData ? (
          <span className="rounded-full border border-beach-border px-2 text-small font-semibold" title={c.testDataHelp}>
            <span aria-hidden="true">⚠ </span>
            {c.testData}
          </span>
        ) : null}
      </span>
    ),
  };
  const status: DataColumn<OrgRow> = {
    id: "status",
    header: c.columns.status,
    render: (o) => (
      <Pill icon={o.archived ? Pause : Check} tone={o.archived ? "missing" : "live"} dashed={o.archived}>
        {o.archived ? c.status.archived : c.status.active}
      </Pill>
    ),
  };
  const actions: DataColumn<OrgRow> = {
    id: "actions",
    header: c.columns.actions,
    render: (o) => (
      <div className="flex items-center gap-1">
        <Button variant="secondary" href={`/admin/organisations/${o.id}`}>
          {c.manage}
        </Button>
        <form action={startImpersonation}>
          <input type="hidden" name="orgId" value={o.id} />
          <Button type="submit" variant="secondary" iconOnly icon={LogIn} aria-label={c.openAs} title={c.openAs} />
        </form>
        <RowMenu org={{ id: o.id, name: o.name, slug: o.slug, archived: o.archived, publishedResults: o.publishedResults }} isOwner={isOwner} />
      </div>
    ),
  };
  const columns: DataColumn<OrgRow>[] = phone
    ? [name, status, actions]
    : [name, status, { id: "plan", header: c.columns.plan, render: (o) => o.plan }, { id: "events", header: c.columns.events, render: (o) => o.eventsText }, { id: "last", header: c.columns.last, render: (o) => o.lastText }, actions];

  return (
    <DataTable
      testId="organisations-table"
      caption={c.tableCaption}
      rows={rows}
      getId={(o) => o.id}
      searchLabel={c.search}
      searchText={(o) => `${o.name} ${o.slug} ${o.plan}`}
      columns={columns}
      filters={[{ id: "status", label: c.statusFilter, options: [{ id: "active", label: c.status.active }, { id: "archived", label: c.status.archived }], test: (o, id) => (id === "archived") === o.archived }]}
      empty={<EmptyState title={c.none} body={c.emptyBody} actions={<Link href="/admin/organisations/new" className="btn btn-primary">{c.create}</Link>} />}
    />
  );
}
