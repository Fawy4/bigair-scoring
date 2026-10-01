"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "./button";

interface PopoverProps {
  label?: string;
  ariaLabel?: string;
  icon?: LucideIcon;
  iconOnly?: boolean;
  variant?: ButtonVariant;
  align?: "start" | "end";
  /** "menu" when the panel is a list of actions (items use `MenuItem`), else a small dialog of content. */
  panelRole?: "menu" | "group";
  testId?: string;
  panelClassName?: string;
  /** The panel's content; a function gets `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
}

/** A button that opens a small panel under it. Closes on a tap outside, on Escape and when an item says so. */
export function Popover({ label, ariaLabel, icon, iconOnly, variant = "secondary", align = "start", panelRole = "group", testId, panelClassName, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div ref={box} data-testid={testId} className="relative inline-block">
      <Button variant={variant} icon={icon} iconOnly={iconOnly} aria-label={ariaLabel} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup={panelRole === "menu" ? "menu" : "dialog"} onClick={() => setOpen((o) => !o)}>
        {label}
        {iconOnly ? null : <ChevronDown aria-hidden className="size-4 shrink-0" />}
      </Button>
      {open ? (
        <div
          id={panelId}
          role={panelRole === "menu" ? "menu" : "group"}
          aria-label={ariaLabel ?? label}
          className={cn("absolute z-40 mt-1 w-72 max-w-[calc(100vw-32px)] rounded-card border border-beach-border bg-beach-bg p-2", align === "end" ? "right-0" : "left-0", panelClassName)}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

/** One action in a menu panel. */
export function MenuItem({ children, icon: Icon, onClick, checked, href }: { children: ReactNode; icon?: LucideIcon; onClick?: () => void; checked?: boolean; href?: string }) {
  const className = "flex min-h-[var(--org-ctl)] w-full items-center gap-2 rounded-[8px] px-3 text-left text-body font-semibold text-beach-ink hover:bg-beach-surface";
  const inside = (
    <>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1">{children}</span>
      {checked ? <span aria-hidden>✓</span> : null}
    </>
  );
  return href ? (
    <a href={href} role="menuitem" onClick={onClick} className={className}>
      {inside}
    </a>
  ) : (
    <button type="button" role="menuitem" onClick={onClick} className={className}>
      {inside}
    </button>
  );
}

/** A small heading inside a menu panel. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 pt-2 text-small font-semibold text-beach-muted">{children}</p>;
}
