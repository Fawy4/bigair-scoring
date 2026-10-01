import { Check, Circle, Globe, Pause, Pencil, Radio, TriangleAlert, type LucideIcon } from "lucide-react";
import { Pill, type PillTone } from "@/components/live/pill";
import { orgCopy } from "@/lib/org-design/copy";

/** Every state the organiser screens show as a pill. Always an icon and a word, never colour alone (docs/06 §00.5). */
export type StatusState = "done" | "attention" | "not_started" | "live" | "held" | "draft" | "published";

const LOOK: Record<StatusState, { icon: LucideIcon; tone: PillTone; dashed?: boolean }> = {
  done: { icon: Check, tone: "live" },
  attention: { icon: TriangleAlert, tone: "outlier" },
  not_started: { icon: Circle, tone: "missing", dashed: true },
  live: { icon: Radio, tone: "live" },
  held: { icon: Pause, tone: "pending" },
  draft: { icon: Pencil, tone: "missing", dashed: true },
  published: { icon: Globe, tone: "ink" },
};

export function StatusPill({ state, className }: { state: StatusState; className?: string }) {
  const look = LOOK[state];
  return (
    <span data-testid="status-pill" data-state={state} className="inline-flex">
      <Pill icon={look.icon} tone={look.tone} dashed={look.dashed} className={className}>
        {orgCopy.states[state].label}
      </Pill>
    </span>
  );
}
