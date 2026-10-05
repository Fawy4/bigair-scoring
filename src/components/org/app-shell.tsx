"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, CircleUser, Copy, ExternalLink, KeyRound, LogOut, MessageSquare, QrCode, CircleHelp } from "lucide-react";
import { QR_COLOURS } from "@/lib/org-design/qr";
import { copy, orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { ShellLayoutProvider, type ShellLayout } from "./layout-context";
import { MenuItem, MenuLabel, Popover } from "./popover";
import { StatusPill, type StatusState } from "./status-pill";
import { StepPicker, StepRail, type RailStep } from "./step-rail";
import "./org-tokens.css";

export interface ShellEvent {
  name: string;
  /** The event's dashboard (Go live). When given, the name is a link to it. */
  href?: string;
  /** Dates in words: "10–12 Oct 2026". */
  dates: string;
  status: Extract<StatusState, "draft" | "published" | "live">;
  publicUrl: string;
}

export interface AppShellProps {
  layout: ShellLayout;
  productName: string;
  organisations: ReadonlyArray<{ id: string; name: string }>;
  currentOrganisationId: string;
  /** No event open (events list, settings, feedback): the top bar shows no event part and the rail is `sidebar`. */
  event?: ShellEvent;
  steps?: readonly RailStep[];
  activeStep?: string;
  /** Step picker on a phone (the rail's own links navigate by themselves). */
  onStep?: (key: string) => void;
  /** Left column used instead of the step rail when there is no event. */
  sidebar?: ReactNode;
  /** Where the product name leads. */
  productHref?: string;
  /** Replaces the organisation switcher of the top bar (the real one runs a server action). */
  orgSwitcher?: ReactNode;
  account: {
    email: string;
    /** Daylight / Dark and Normal / Large live here. */
    preferences: ReactNode;
    /** The real menu entries (password, sign out, admin switch). When absent the preview's inert entries are shown. */
    items?: (close: () => void) => ReactNode;
  };
  /** The "Note" button of the top bar; the real app has the floating note button instead. */
  showNote?: boolean;
  children: ReactNode;
  /** Previous / Next at the foot of the step. */
  footer?: ReactNode;
}

/** The QR code of a link: always black on white so a phone can read it in the dark theme too. */
function QrImage({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // the QR library is fetched when the link menu is opened, not with every organiser page
    import("qrcode")
      .then((m) => m.default.toDataURL(url, { margin: 1, width: 176, color: QR_COLOURS }))
      .then(
        (data) => live && setSrc(data),
        () => live && setSrc(null),
      );
    return () => {
      live = false;
    };
  }, [url]);
  // eslint-disable-next-line @next/next/no-img-element -- a data URL made in the browser
  return src ? <img src={src} alt={orgCopy.shell.qrAlt(url)} width={176} height={176} data-testid="qr-image" className="rounded-[8px]" /> : <div className="size-[176px] rounded-[8px] border border-dashed border-beach-border" />;
}

/** Copy a link; the button says "Copied" for 2 seconds. */
export function CopyLinkButton({ url, label = orgCopy.shell.copyLink }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      variant="secondary"
      icon={copied ? Check : Copy}
      onClick={() => {
        navigator.clipboard?.writeText(url).catch(() => {});
        setCopied(true);
      }}
    >
      {copied ? orgCopy.shell.copied : label}
    </Button>
  );
}

function PublicLinkMenu({ url, iconOnly }: { url: string; iconOnly: boolean }) {
  return (
    <Popover label={orgCopy.shell.publicLink} ariaLabel={orgCopy.shell.publicLink} icon={QrCode} iconOnly={iconOnly} variant="quiet" align="end" testId="public-link-menu" panelClassName="w-[min(20rem,calc(100vw-32px))]">
      <div className="flex flex-col items-start gap-2 p-1">
        <p className="break-all text-body font-semibold" data-testid="public-url">
          {url}
        </p>
        <QrImage url={url} />
        <div className="flex flex-wrap gap-2">
          <CopyLinkButton url={url} />
          <Button variant="quiet" icon={ExternalLink} href={url}>
            {orgCopy.shell.openLink}
          </Button>
        </div>
      </div>
    </Popover>
  );
}

function ProductName({ name, href }: { name: string; href?: string }) {
  return href ? (
    <a href={href} data-testid="product-name" className="text-body font-semibold">
      {name}
    </a>
  ) : (
    <span className="text-body font-semibold">{name}</span>
  );
}

function EventName({ event }: { event: ShellEvent }) {
  return event.href ? (
    <a href={event.href} data-testid="rail-dashboard" className="underline">
      {event.name}
    </a>
  ) : (
    <>{event.name}</>
  );
}

/** The top bar: product name, organisation switcher, event name and dates, state, public link with its QR code, a note button and the account menu. 48 px on a laptop. */
function TopBar({ layout, productName, organisations, currentOrganisationId, event, account, productHref, orgSwitcher, showNote = true }: Pick<AppShellProps, "layout" | "productName" | "organisations" | "currentOrganisationId" | "event" | "account" | "productHref" | "orgSwitcher" | "showNote">) {
  const phone = layout === "phone";
  const current = organisations.find((o) => o.id === currentOrganisationId) ?? organisations[0];
  const switcher =
    orgSwitcher !== undefined ? orgSwitcher : organisations.length > 1 ? (
      <Popover label={current.name} ariaLabel={orgCopy.shell.organisation} variant="quiet" panelRole="menu" testId="org-switcher">
        {(close) => (
          <>
            <MenuLabel>{orgCopy.shell.organisation}</MenuLabel>
            {organisations.map((o) => (
              <MenuItem key={o.id} checked={o.id === current.id} onClick={close}>
                {o.name}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>
    ) : null;
  const accountMenu = (
    <Popover label={orgCopy.shell.account} ariaLabel={orgCopy.shell.account} icon={CircleUser} iconOnly={phone} variant="quiet" align="end" testId="account-menu" panelRole="menu" panelClassName="w-[min(20rem,calc(100vw-32px))]">
      {(close) => (
        <>
          <p className="break-all px-3 pt-1 text-small font-semibold text-beach-muted">{account.email}</p>
          {phone && switcher && orgSwitcher === undefined ? (
            <>
              <MenuLabel>{orgCopy.shell.organisation}</MenuLabel>
              {organisations.map((o) => (
                <MenuItem key={o.id} checked={o.id === current.id} onClick={close}>
                  {o.name}
                </MenuItem>
              ))}
            </>
          ) : null}
          <MenuLabel>{orgCopy.shell.preferences}</MenuLabel>
          <div className="flex flex-col items-start gap-2 px-3 pb-2">{account.preferences}</div>
          <div className="border-t border-beach-line pt-1">
            {account.items ? (
              account.items(close)
            ) : (
              <>
                {phone ? (
                  <MenuItem icon={MessageSquare} onClick={close}>
                    {orgCopy.shell.note}
                  </MenuItem>
                ) : null}
                <MenuItem icon={KeyRound} onClick={close}>
                  {orgCopy.shell.password}
                </MenuItem>
                <MenuItem icon={LogOut} onClick={close}>
                  {orgCopy.shell.signOut}
                </MenuItem>
              </>
            )}
          </div>
        </>
      )}
    </Popover>
  );
  if (phone) {
    return (
      <header data-testid="top-bar" className="flex items-center gap-1 border-b border-beach-line px-3 py-2">
        {event ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">
              <EventName event={event} />
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-small font-medium text-beach-muted">
              <span>{event.dates}</span>
              <StatusPill state={event.status} />
            </p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <ProductName name={productName} href={productHref} />
          </div>
        )}
        {event ? <PublicLinkMenu url={event.publicUrl} iconOnly /> : null}
        <Button variant="quiet" iconOnly icon={CircleHelp} href="/help" aria-label={copy.manual.footerHelp} data-testid="help-link" />
        {accountMenu}
      </header>
    );
  }
  return (
    <header data-testid="top-bar" className="flex min-h-12 items-center gap-3 border-b border-beach-line px-4 py-1">
      <ProductName name={productName} href={productHref} />
      {switcher}
      {event ? (
        <>
          <span aria-hidden className="h-6 w-px bg-beach-line" />
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[14px] font-semibold">
              <EventName event={event} />
            </span>
            <span className="whitespace-nowrap text-small font-medium text-beach-muted">{event.dates}</span>
          </div>
          <StatusPill state={event.status} />
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        {event ? <PublicLinkMenu url={event.publicUrl} iconOnly={false} /> : null}
        {showNote ? (
          <Button variant="quiet" icon={MessageSquare}>
            {orgCopy.shell.note}
          </Button>
        ) : null}
        <Button variant="quiet" href="/help" data-testid="help-link">
          {copy.manual.footerHelp}
        </Button>
        {accountMenu}
      </div>
    </header>
  );
}

/** The organiser shell: top bar, left rail of steps (a step picker on a phone) and the content column. Props only: it fetches nothing. */
export function AppShell({ layout, steps, activeStep, onStep, sidebar, children, footer, ...bar }: AppShellProps) {
  const laptop = layout === "laptop";
  const rail = steps && activeStep !== undefined ? <StepRail steps={steps} activeKey={activeStep} onSelect={onStep} /> : sidebar;
  const picker = steps && activeStep !== undefined && onStep ? <StepPicker steps={steps} activeKey={activeStep} onSelect={onStep} /> : sidebar;
  return (
    <ShellLayoutProvider value={layout}>
      <div data-testid="app-shell" data-layout={layout} className="flex min-h-full flex-col bg-beach-bg text-beach-ink">
        <TopBar layout={layout} {...bar} />
        <div className={cn("flex flex-1", laptop ? "flex-row" : "flex-col")}>
          {rail ? (
            laptop ? (
              <aside className="w-[240px] shrink-0 border-r border-beach-line p-3">
                <div className="sticky top-[var(--org-sticky-top,0px)]">{rail}</div>
              </aside>
            ) : (
              <div className="border-b border-beach-line px-3 py-2">{picker}</div>
            )
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">
            <main data-testid="org-main" className={cn("mx-auto flex w-full min-w-0 max-w-[1400px] flex-1 flex-col", laptop ? "gap-4 p-6" : "gap-4 p-3")}>{children}</main>
            {footer}
          </div>
        </div>
      </div>
    </ShellLayoutProvider>
  );
}
