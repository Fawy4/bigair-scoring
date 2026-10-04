"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

const EDGE = 8; // the gap kept between the panel and the screen's edge

interface Placement {
  up: boolean;
  end: boolean;
  maxHeight: number;
}

/**
 * A button that opens a small panel under it. Closes on a tap outside, on Escape and when an item says so.
 * The panel always opens inside the screen: upwards when there is more room above than below, as tall as the room allows (it scrolls inside itself beyond that), and
 * flipped to the other side when it would run off the left or right edge. It is measured again when the page scrolls, the window changes or its content grows.
 */
export function Popover({ label, ariaLabel, icon, iconOnly, variant = "secondary", align = "start", panelRole = "group", testId, panelClassName, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const measure = useCallback(() => {
    const b = box.current;
    const p = panel.current;
    if (!b || !p) return;
    const r = b.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const below = vh - r.bottom - EDGE - 4;
    const above = r.top - EDGE - 4;
    const natural = p.scrollHeight + 2;
    const up = natural > below && above > below;
    const width = p.offsetWidth;
    let end = align === "end";
    if (!end && r.left + width > vw - EDGE && r.right - width >= EDGE) end = true;
    if (end && r.right - width < EDGE && r.left + width <= vw - EDGE) end = false;
    const next = { up, end, maxHeight: Math.max(96, Math.min(natural, up ? above : below)) };
    setPlace((cur) => (cur && cur.up === next.up && cur.end === next.end && cur.maxHeight === next.maxHeight ? cur : next));
  }, [align]);
  useLayoutEffect(() => {
    if (open) measure();
    else setPlace(null);
  }, [open, measure]);
  useEffect(() => {
    if (!open) return;
    const again = () => measure();
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    const watcher = typeof ResizeObserver !== "undefined" && panel.current ? new ResizeObserver(again) : null;
    if (watcher && panel.current) watcher.observe(panel.current);
    return () => {
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
      watcher?.disconnect();
    };
  }, [open, measure]);
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
          ref={panel}
          id={panelId}
          role={panelRole === "menu" ? "menu" : "group"}
          aria-label={ariaLabel ?? label}
          data-placement={place ? (place.up ? "up" : "down") : undefined}
          style={place ? { maxHeight: place.maxHeight } : undefined}
          className={cn("absolute z-40 w-72 max-w-[calc(100vw-32px)] overflow-y-auto rounded-card border border-beach-border bg-beach-bg p-2", place?.up ? "bottom-full mb-1" : "top-full mt-1", (place ? place.end : align === "end") ? "right-0" : "left-0", panelClassName)}
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
