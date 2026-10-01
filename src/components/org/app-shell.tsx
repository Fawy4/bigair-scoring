"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { Check, CircleUser, Copy, ExternalLink, KeyRound, LogOut, MessageSquare, QrCode } from "lucide-react";
import { QR_COLOURS } from "@/lib/org-design/qr";
import { orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { ShellLayoutProvider, type ShellLayout } from "./layout-context";
import { MenuItem, MenuLabel, Popover } from "./popover";
import { StatusPill, type StatusState } from "./status-pill";
import { StepPicker, StepRail, type RailStep } from "./step-rail";
import "./org-tokens.css";

export interface ShellEvent {
  name: string;
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
  event: ShellEvent;
  steps: readonly RailStep[];
  activeStep: string;
  onStep: (key: string) => void;
  account: { email: string; /** Daylight / Dark and Normal / Large live here. */ preferences: ReactNode };
  children: ReactNode;
  /** Previous / Next at the foot of the step. */
  footer?: ReactNode;
}

/** The QR code of a link: always black on white so a phone can read it in the dark theme too. */
function QrImage({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 176, color: QR_COLOURS }).then(
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

/** The top bar: product name, organisation switcher, event name and dates, state, public link with its QR code, a note button and the account menu. 48 px on a laptop. */
function TopBar({ layout, productName, organisations, currentOrganisationId, event, account }: Pick<AppShellProps, "layout" | "productName" | "organisations" | "currentOrganisationId" | "event" | "account">) {
  const phone = layout === "phone";
  const current = organisations.find((o) => o.id === currentOrganisationId) ?? organisations[0];
  const switcher =
    organisations.length > 1 ? (
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
          {phone && switcher ? (
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
          </div>
        </>
      )}
    </Popover>
  );
  if (phone) {
    return (
      <header data-testid="top-bar" className="flex items-center gap-1 border-b border-beach-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{event.name}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-small font-medium text-beach-muted">
            <span>{event.dates}</span>
            <StatusPill state={event.status} />
          </p>
        </div>
        <PublicLinkMenu url={event.publicUrl} iconOnly />
        {accountMenu}
      </header>
    );
  }
  return (
    <header data-testid="top-bar" className="flex min-h-12 items-center gap-3 border-b border-beach-line px-4 py-1">
      <span className="text-body font-semibold">{productName}</span>
      {switcher}
      <span aria-hidden className="h-6 w-px bg-beach-line" />
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[14px] font-semibold">{event.name}</span>
        <span className="whitespace-nowrap text-small font-medium text-beach-muted">{event.dates}</span>
      </div>
      <StatusPill state={event.status} />
      <div className="ml-auto flex items-center gap-1">
        <PublicLinkMenu url={event.publicUrl} iconOnly={false} />
        <Button variant="quiet" icon={MessageSquare}>
          {orgCopy.shell.note}
        </Button>
        {accountMenu}
      </div>
    </header>
  );
}

/** The organiser shell: top bar, left rail of steps (a step picker on a phone) and the content column. Props only: it fetches nothing. */
export function AppShell({ layout, steps, activeStep, onStep, children, footer, ...bar }: AppShellProps) {
  const laptop = layout === "laptop";
  return (
    <ShellLayoutProvider value={layout}>
      <div data-testid="app-shell" data-layout={layout} className="flex min-h-full flex-col bg-beach-bg text-beach-ink">
        <TopBar layout={layout} {...bar} />
        <div className={cn("flex flex-1", laptop ? "flex-row" : "flex-col")}>
          {laptop ? (
            <aside className="w-[240px] shrink-0 border-r border-beach-line p-3">
              <div className="sticky top-[var(--org-sticky-top,0px)]">
                <StepRail steps={steps} activeKey={activeStep} onSelect={onStep} />
              </div>
            </aside>
          ) : (
            <div className="border-b border-beach-line px-3 py-2">
              <StepPicker steps={steps} activeKey={activeStep} onSelect={onStep} />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <main className={cn("flex min-w-0 flex-1 flex-col", laptop ? "gap-4 p-6" : "gap-4 p-3")}>{children}</main>
            {footer}
          </div>
        </div>
      </div>
    </ShellLayoutProvider>
  );
}
