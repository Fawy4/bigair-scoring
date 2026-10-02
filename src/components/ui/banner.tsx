import * as React from "react";
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "danger";
const TONE: Record<Tone, { icon: LucideIcon; frame: string; text: string }> = {
  info: { icon: Info, frame: "border-beach-line", text: "text-foreground" },
  warning: { icon: TriangleAlert, frame: "border-beach-outlier", text: "text-beach-outlier" },
  danger: { icon: OctagonAlert, frame: "border-beach-failed", text: "text-beach-failed" },
};

/** A message in the page: a thin frame, an icon and words, never a coloured fill. Warnings and errors are text colour and frame only. */
function Banner({ tone = "info", className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  const t = TONE[tone];
  return (
    <div role={tone === "info" ? "status" : "alert"} className={cn("flex items-start gap-2 rounded-[8px] border bg-secondary px-3 py-2 text-body font-medium", t.frame, className)} {...props}>
      <t.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.text)} />
      <div className="min-w-0 flex-1 text-foreground">{children}</div>
    </div>
  );
}

export { Banner };
