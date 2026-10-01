import { cn } from "@/lib/utils";

/**
 * A phone-shaped box for a mock screen. On a computer it is a 390 × 844 frame; on a phone it fills the display (under the sticky bar of the page),
 * so the owner can see at once whether a screen fits without scrolling. `data-testid="screen-body"` is the area that would scroll.
 */
export function PhoneFrame({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section id={id} data-testid={`section-${id}`} className="flex scroll-mt-16 flex-col gap-1">
      <h2 className="text-heading font-semibold">{title}</h2>
      <p className="text-small font-medium text-beach-muted">{note}</p>
      <div
        data-testid="phone-frame"
        className={cn(
          "relative mx-auto flex w-full flex-col overflow-hidden border border-beach-line bg-beach-bg",
          // phone: full width, as tall as the display minus the sticky bar; computer: a 390 × 844 phone
          "h-[calc(100dvh-60px)] rounded-card md:h-[844px] md:w-[390px] md:rounded-[36px] md:border-[6px] md:border-beach-ink",
        )}
      >
        {children}
      </div>
    </section>
  );
}
