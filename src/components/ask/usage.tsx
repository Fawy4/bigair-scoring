import { budgetState } from "@/lib/ask/budget";
import { copy } from "@/lib/ui-copy";

const T = copy.ask.usage;
const n = (v: number) => v.toLocaleString("en-GB");

export interface AskUsage {
  used: number;
  limit: number;
  questions: number;
}

/** "Ask Sendbook this month": tokens used of the budget, questions answered, and whether Ask is paused. Shown on the organisation's pages. */
export function AskUsageLines({ usage }: { usage: AskUsage }) {
  const b = budgetState(usage.used, usage.limit);
  return (
    <div className="flex flex-col gap-1" data-testid="ask-usage">
      <p className="text-body font-semibold">{T.line(n(b.used), n(b.limit), b.percent)}</p>
      <p className="text-body font-medium">{T.questions(usage.questions)}</p>
      {b.limit === 0 ? <p className="text-body font-semibold">{T.off}</p> : b.paused ? <p className="text-body font-semibold">{T.paused}</p> : null}
    </div>
  );
}

/** ask_usage's answer, or null when it could not be read. */
export function parseUsage(data: unknown): AskUsage | null {
  const d = data as Partial<AskUsage> | null;
  return d && typeof d.used === "number" && typeof d.limit === "number" ? { used: d.used, limit: d.limit, questions: d.questions ?? 0 } : null;
}
