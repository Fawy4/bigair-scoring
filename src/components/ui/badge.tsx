import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** A pill: a thin frame and words (add an icon yourself for a status; see components/org/status-pill.tsx). Never a coloured fill. */
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-small font-semibold transition-colors", {
  variants: {
    variant: {
      default: "border-beach-accent bg-background text-foreground",
      secondary: "border-beach-line bg-secondary text-secondary-foreground",
      destructive: "border-beach-crash bg-background text-beach-crash",
      outline: "border-input text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
