import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PillTone = "live" | "pending" | "failed" | "crash" | "outlier" | "missing" | "accent" | "ink";

const TONE: Record<PillTone, string> = {
  live: "text-beach-live",
  pending: "text-beach-pending",
  failed: "text-beach-failed",
  crash: "text-beach-crash",
  outlier: "text-beach-outlier",
  missing: "text-beach-missing",
  accent: "text-beach-ink",
  ink: "text-beach-ink",
};

/** A small status pill: always an icon AND a word (docs/06 §00.5). The colour only repeats what the word says. */
export function Pill({ icon: Icon, tone = "ink", children, className, dashed = false }: { icon?: LucideIcon; tone?: PillTone; children: React.ReactNode; className?: string; dashed?: boolean }) {
  return (
    <span className={cn("inline-flex min-h-[26px] items-center gap-1 rounded-full border bg-beach-bg px-2.5 text-small font-semibold", dashed ? "border-dashed" : "", TONE[tone], "border-current", className)}>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      <span>{children}</span>
    </span>
  );
}
