import { orgCopy } from "@/lib/ui-copy";

/** The "In words" line as a quiet card: what the settings on the screen add up to, in one sentence. Sits beside the form on a laptop and above it on a phone. */
export function SummaryCard({ sentence, testId = "model-sentence" }: { sentence: string; testId?: string }) {
  return (
    <aside aria-live="polite" className="rounded-2xl bg-beach-surface px-4 py-3">
      <p className="text-small font-bold uppercase tracking-wide text-beach-muted">{orgCopy.settings.sentenceLabel}</p>
      <p data-testid={testId} className="text-body font-bold">
        {sentence}
      </p>
    </aside>
  );
}
