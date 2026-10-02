import * as React from "react";
import { cn } from "@/lib/utils";

/** A label above its box (semibold), and the helper text under the label in muted ink. */
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn("text-body font-semibold text-foreground", className)} {...props} />
));
Label.displayName = "Label";

function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-small font-medium text-beach-muted", className)} {...props} />;
}

export { Label, FieldHint };
