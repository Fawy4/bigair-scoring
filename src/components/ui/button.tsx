import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** The same buttons as the organiser screens (components/org/button.tsx): the accent fill for the one primary action, a 1 px frame for the rest, text only for the quiet ones. 8 px corners, 40 px high (44 on touch, 48 with Large). */
const buttonVariants = cva(
  "inline-flex min-h-[var(--org-ctl)] items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border px-3 text-body font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-dashed disabled:border-beach-border disabled:bg-beach-surface disabled:text-beach-muted",
  {
    variants: {
      variant: {
        default: "border-beach-accent bg-primary text-primary-foreground hover:brightness-110",
        destructive: "border-beach-crash bg-background text-beach-crash hover:bg-secondary",
        outline: "border-input bg-background text-foreground hover:bg-secondary",
        secondary: "border-input bg-background text-foreground hover:bg-secondary",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-secondary",
        link: "border-transparent bg-transparent text-foreground underline underline-offset-4",
      },
      size: {
        default: "",
        sm: "px-2.5",
        lg: "px-5",
        icon: "min-w-[var(--org-ctl)] px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
