import * as React from "react";
import { cn } from "@/lib/utils";

/** A text box: 1 px frame in the control colour, 8 px corners, 40 px high (44 on touch). A number box is as wide as its digits need and right-aligned. */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex min-h-[var(--org-ctl)] w-full rounded-[8px] border border-input bg-background px-3 text-body font-medium text-foreground placeholder:text-beach-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-dashed disabled:bg-secondary",
        type === "number" && "w-[8ch] min-w-[var(--org-ctl)] max-w-full text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [field-sizing:content]",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
