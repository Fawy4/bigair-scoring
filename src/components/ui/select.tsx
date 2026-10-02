import * as React from "react";
import { cn } from "@/lib/utils";

/** A native select (it opens the phone's own picker) in the same frame as the text box. */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "min-h-[var(--org-ctl)] max-w-full rounded-[8px] border border-input bg-background px-3 text-body font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-dashed disabled:bg-secondary",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

export { Select };
