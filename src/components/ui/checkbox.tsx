import * as React from "react";
import { cn } from "@/lib/utils";

/** A native tick box and radio button, 20 px, in the accent colour. Put them inside a label so the words are part of the tap target. */
const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(({ className, ...props }, ref) => (
  <input ref={ref} type="checkbox" className={cn("size-5 shrink-0 accent-[var(--beach-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)} {...props} />
));
Checkbox.displayName = "Checkbox";

const Radio = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(({ className, ...props }, ref) => (
  <input ref={ref} type="radio" className={cn("size-5 shrink-0 accent-[var(--beach-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)} {...props} />
));
Radio.displayName = "Radio";

export { Checkbox, Radio };
