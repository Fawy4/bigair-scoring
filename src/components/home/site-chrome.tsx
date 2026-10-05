import Link from "next/link";
import { copy } from "@/lib/ui-copy";

/** The product wordmark as a link to the home page. No prefetch: the link is quiet, nobody should download a page for it. */
export function Wordmark({ name, className = "home-brand" }: { name: string; className?: string }) {
  return (
    <Link href="/" prefetch={false} data-testid="home-wordmark" className={className}>
      {name}
    </Link>
  );
}

/**
 * The quiet foot of a public page: a way Home and the manual. `home` takes the front door's own look (the Join page); `beach` fits the pages that use the beach tokens
 * (the event site, sign-in). Neither prefetches: the manual page alone is 294 kB.
 */
export function SiteFooter({ variant = "home" }: { variant?: "home" | "beach" }) {
  const links = (
    <>
      <Link href="/" prefetch={false} data-testid="footer-home">
        {copy.landing.homeLink}
      </Link>
      <Link href="/help" prefetch={false} data-testid="footer-help">
        {copy.manual.footerHelp}
      </Link>
    </>
  );
  return variant === "home" ? (
    <footer data-testid="site-footer" className="home-footer">
      {links}
    </footer>
  ) : (
    <footer data-testid="site-footer" className="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-t border-beach-line pt-3 text-small font-medium text-beach-muted [&_a]:underline">
      {links}
    </footer>
  );
}
