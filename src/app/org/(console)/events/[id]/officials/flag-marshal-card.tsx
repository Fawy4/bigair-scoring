import Link from "next/link";
import { Qr } from "@/components/public/qr";
import { copy } from "@/lib/ui-copy";

/** "Flag marshal's screen": the address of the Flag view and a QR to print and tape up. The marshal needs no login; the page shows nothing but the flag, the heat and its riders. */
export async function FlagMarshalCard({ url, path }: { url: string; path: string }) {
  const V = copy.flags.view;
  return (
    <section data-testid="flag-marshal-card" aria-labelledby="flag-marshal-h" className="flex flex-wrap items-center gap-4 rounded-card border border-beach-line p-4 print:break-inside-avoid">
      <Qr url={url} size={140} dark />
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="flag-marshal-h" className="text-heading font-semibold">
          {V.link}
        </h2>
        <p className="max-w-[60ch] text-body font-medium text-beach-muted">{V.linkHelp}</p>
        <Link data-testid="flag-marshal-link" href={path} target="_blank" className="w-fit break-all font-semibold underline">
          {url}
        </Link>
      </div>
    </section>
  );
}
