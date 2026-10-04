import { OrgCard } from "@/components/org/org-card";
import { ExportButtons } from "@/components/export/export-buttons";
import { copy } from "@/lib/ui-copy";

/** Go live: the results file, the printable results and the event backup. Organisers only (this page is the organiser's); a practice event shows nothing. */
export function ExportCard({ eventId, isSimulation }: { eventId: string; isSimulation: boolean }) {
  if (isSimulation) return null;
  const X = copy.exportFiles;
  return (
    <OrgCard title={X.card.title} testId="export-card">
      <div className="flex flex-col gap-2">
        <p className="text-body font-medium text-beach-muted">{X.card.body}</p>
        <ExportButtons eventId={eventId} role="organiser" withBackup />
        <p className="text-small font-medium text-beach-muted">
          {X.backup.buttonHint} {X.backup.noPins}
        </p>
      </div>
    </OrgCard>
  );
}
