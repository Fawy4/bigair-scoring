"use client";

import { useEffect, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, MessageSquare, Settings, ShieldCheck, KeyRound, LogOut } from "lucide-react";
import { useBeachTextSize, useBeachTheme } from "@/components/live/theme-switch";
import { BEACH_THEMES } from "@/lib/live/theme-tokens";
import { copy, orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { AppShell, type ShellEvent } from "./app-shell";
import { ShellLayoutProvider, useViewportLayout } from "./layout-context";
import { runNextGuard } from "./next-guard";
import { MenuItem, MenuLabel, Popover } from "./popover";
import { Segmented } from "./setting-controls";
import type { RailStep } from "./step-rail";
import { StepFooter } from "./step-footer";
import "./org-tokens.css";

export interface FrameOrg {
  id: string;
  name: string;
}

export interface OrgFrameProps {
  productName: string;
  email: string;
  passwordIsSet: boolean;
  organisations: FrameOrg[];
  currentOrganisationId: string | null;
  /** Platform admins get the switch between the admin and the organiser view. */
  isPlatformAdmin: boolean;
  /** "Viewing as Arrow" banner. */
  banner?: ReactNode;
  /** Runs the server action that remembers the organisation. */
  switchOrganisation: (id: string) => Promise<void>;
  signOutAction: string;
  event?: ShellEvent;
  /** Steps in order; each has an href. */
  steps?: readonly RailStep[];
  children: ReactNode;
}

/** Which step the address belongs to: /org/events/<id>/<step>, or Go live for the event's own page. */
export function activeStepKey(path: string, steps: readonly RailStep[]): string {
  const last = path.replace(/\/+$/, "").split("/").pop() ?? "";
  return steps.find((s) => s.key !== "golive" && s.key === last)?.key ?? "golive";
}

/** Everything around an organiser screen: the top bar, the left rail of seven steps (or, with no event, a short list of places), Previous / Next at the foot, and the Daylight / Dark and Normal / Large choice. */
export function OrgFrame({ productName, email, passwordIsSet, organisations, currentOrganisationId, isPlatformAdmin, banner, switchOrganisation, signOutAction, event, steps, children }: OrgFrameProps) {
  const [theme, setTheme] = useBeachTheme();
  const [size, setSize] = useBeachTextSize();
  const layout = useViewportLayout();
  const path = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    const bg = theme === "dark" ? BEACH_THEMES.dark.bg : BEACH_THEMES.day.bg;
    const prev = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = bg;
    return () => {
      document.documentElement.style.backgroundColor = prev;
    };
  }, [theme]);

  const current = organisations.find((o) => o.id === currentOrganisationId) ?? organisations[0];
  const active = steps ? activeStepKey(path, steps) : "";
  const activeIndex = steps ? steps.findIndex((s) => s.key === active) : -1;
  const hasFooter = Boolean(steps) && activeIndex >= 0 && !/\/events\/new\/?$/.test(path);

  const go = (href: string) => async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    if (await runNextGuard()) router.push(href);
  };
  const prevStep = steps && activeIndex > 0 ? steps[activeIndex - 1] : null;
  const nextStep = steps && activeIndex >= 0 && activeIndex < steps.length - 1 ? steps[activeIndex + 1] : null;
  const footer = hasFooter ? (
    <StepFooter
      sticky={layout === "phone"}
      previous={prevStep ? { label: prevStep.label, href: prevStep.href ?? "" } : undefined}
      next={nextStep ? { label: nextStep.label, href: nextStep.href ?? "", onClick: go(nextStep.href ?? "") } : undefined}
    />
  ) : undefined;

  const switcher =
    organisations.length > 1 ? (
      <Popover label={current.name} ariaLabel={orgCopy.shell.organisation} variant="quiet" panelRole="menu" testId="org-switcher">
        {(close) => (
          <>
            <MenuLabel>{orgCopy.shell.organisation}</MenuLabel>
            {organisations.map((o) => (
              <MenuItem
                key={o.id}
                checked={o.id === current.id}
                onClick={() => {
                  close();
                  start(() => switchOrganisation(o.id));
                }}
              >
                {o.name}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>
    ) : organisations.length === 1 ? (
      <span className="text-body font-semibold text-beach-muted">{organisations[0].name}</span>
    ) : null;

  const places: Array<{ href: string; label: string; icon: typeof CalendarDays }> = [
    { href: "/org", label: orgCopy.shell.events, icon: CalendarDays },
    { href: "/org/settings", label: orgCopy.shell.orgSettings, icon: Settings },
    { href: "/org/feedback", label: orgCopy.shell.feedback, icon: MessageSquare },
  ];
  const placeActive = (href: string) => (href === "/org" ? path === "/org" || path.startsWith("/org/events") : path.startsWith(href));

  return (
    <div
      data-testid="org-root"
      data-theme={theme}
      data-text={size}
      aria-busy={pending}
      className={cn("org-ui min-h-screen", theme === "dark" ? "beach-dark" : "beach-day", size === "large" ? "beach-text-large" : "beach-text-normal")}
    >
      {banner}
      <ShellLayoutProvider value={layout}>
        <AppShell
          layout={layout}
          productName={productName}
          productHref="/org"
          organisations={organisations}
          currentOrganisationId={current?.id ?? ""}
          orgSwitcher={switcher}
          event={event}
          steps={steps}
          activeStep={active}
          onStep={(key) => {
            const s = steps?.find((x) => x.key === key);
            if (s?.href) router.push(s.href);
          }}
          sidebar={
            steps ? undefined : (
              <nav aria-label={copy.layout.navLabel} data-testid="org-places" className={cn("flex gap-1", layout === "laptop" ? "flex-col" : "flex-row flex-wrap")}>
                {layout === "laptop" ? <p className="px-3 pb-1 text-small font-semibold text-beach-muted">{orgCopy.shell.organisationNav}</p> : null}
                {places.map((p) => (
                  <Link key={p.href} href={p.href} aria-current={placeActive(p.href) ? "page" : undefined} className={cn("flex min-h-[var(--org-ctl)] items-center gap-2 rounded-[8px] px-3 text-body font-semibold hover:bg-beach-surface", placeActive(p.href) && "bg-beach-surface")}>
                    <p.icon aria-hidden className="size-4" />
                    {p.label}
                  </Link>
                ))}
              </nav>
            )
          }
          showNote={false}
          account={{
            email,
            preferences: (
              <>
                <Segmented label={orgCopy.page.theme} value={theme} onChange={setTheme} options={[["day", orgCopy.page.day], ["dark", orgCopy.page.dark]]} />
                <Segmented label={orgCopy.page.textSize} value={size} onChange={setSize} options={[["normal", orgCopy.page.normal], ["large", orgCopy.page.large]]} />
              </>
            ),
            items: (close) => (
              <>
                {places.map((p) => (
                  <MenuItem key={p.href} icon={p.icon} href={p.href} onClick={close}>
                    {p.label}
                  </MenuItem>
                ))}
                {isPlatformAdmin ? (
                  <MenuItem icon={ShieldCheck} href="/admin" onClick={close}>
                    {orgCopy.shell.adminLink(productName)}
                  </MenuItem>
                ) : null}
                {layout === "phone" && organisations.length > 1 ? (
                  <>
                    <MenuLabel>{orgCopy.shell.organisation}</MenuLabel>
                    {organisations.map((o) => (
                      <MenuItem
                        key={o.id}
                        checked={o.id === current?.id}
                        onClick={() => {
                          close();
                          start(() => switchOrganisation(o.id));
                        }}
                      >
                        {o.name}
                      </MenuItem>
                    ))}
                  </>
                ) : null}
                <MenuItem icon={KeyRound} href="/org/set-password" onClick={close}>
                  {passwordIsSet ? copy.layout.changePassword : copy.layout.setPassword}
                </MenuItem>
                <form action={signOutAction} method="post">
                  <button type="submit" role="menuitem" className="flex min-h-[var(--org-ctl)] w-full items-center gap-2 rounded-[8px] px-3 text-left text-body font-semibold text-beach-ink hover:bg-beach-surface">
                    <LogOut aria-hidden className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1">{copy.layout.signOut}</span>
                  </button>
                </form>
              </>
            ),
          }}
          footer={footer}
        >
          <div className="org-console org-legacy min-w-0 flex-1" data-testid="org-content">
            {children}
          </div>
        </AppShell>
      </ShellLayoutProvider>
    </div>
  );
}
