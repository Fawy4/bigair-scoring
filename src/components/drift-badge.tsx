import { Check, Clock, TriangleAlert } from "lucide-react";
import { Pill } from "@/components/live/pill";
import type { Drift } from "@/lib/schedule/drift";
import { copy } from "@/lib/ui-copy";

const TONE = { green: "live", amber: "outlier", red: "failed" } as const;

/** "On schedule" / "6 min late" / "4 min early" with an icon and a word: green, amber up to 10 minutes late, red beyond. Never colour alone. */
export function DriftBadge({ drift, className }: { drift: Drift | null; className?: string }) {
  if (!drift) return null;
  const word = drift.state === "on_schedule" ? copy.drift.onSchedule : drift.state === "late" ? copy.drift.late(drift.minutes) : copy.drift.early(drift.minutes);
  const icon = drift.state === "on_schedule" ? Check : drift.tone === "red" ? TriangleAlert : Clock;
  return (
    <span data-testid="drift-badge" data-state={drift.state} data-tone={drift.tone} className="inline-flex">
      <Pill icon={icon} tone={TONE[drift.tone]} className={className}>
        {word}
      </Pill>
    </span>
  );
}

/** The public timetable's quieter line: "Running about 6 min late". Nothing when the day is on time. */
export function PublicDrift({ drift, className }: { drift: Drift | null; className?: string }) {
  if (!drift || drift.state === "on_schedule") return null;
  return (
    <p data-testid="public-drift" data-state={drift.state} className={className ?? "text-small font-medium text-beach-muted"}>
      {drift.state === "late" ? copy.drift.publicLate(drift.minutes) : copy.drift.publicEarly(drift.minutes)}
    </p>
  );
}
