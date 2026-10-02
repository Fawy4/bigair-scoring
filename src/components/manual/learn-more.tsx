import { copy } from "@/lib/ui-copy";

/** "Learn more": opens the matching part of the manual (/help) in a new tab, so the screen the person is on stays as it is. */
export function LearnMore({ href, what }: { href: string; what?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" data-testid="learn-more" className="learn-more ml-1 whitespace-nowrap font-semibold underline underline-offset-2" aria-label={what ? copy.manual.learnMoreAbout(what) : undefined}>
      {copy.manual.learnMore}
    </a>
  );
}
