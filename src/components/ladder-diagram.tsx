import type { LadderColumn } from "@/lib/format-ui/preview";
import { copy } from "@/lib/ui-copy";

/**
 * The ladder as a picture: rounds are columns, heats are boxes ("4 riders"), and every column says where its places go.
 * Text and borders only (no colour meaning), so it reads in sunlight and prints in black and white.
 */
export function LadderDiagram({ columns }: { columns: LadderColumn[] }) {
  if (columns.length === 0) return null;
  const heats = columns.reduce((s, c) => s + c.heats.filter((h) => !h.bye).length, 0);
  return (
    <figure data-testid="ladder-diagram" aria-label={copy.ladder.label} className="flex flex-col gap-2">
      <figcaption className="text-base font-extrabold">
        {copy.ladder.label}: {copy.ladder.title(columns.length, heats)}
      </figcaption>
      <ol className="flex items-stretch gap-2 overflow-x-auto pb-2">
        {columns.map((c, i) => (
          <li key={c.id} className="flex items-stretch gap-2">
            <div className="flex min-w-40 flex-col gap-2 rounded-lg border-2 border-[#111] p-2" data-testid="ladder-round">
              <p className="text-base font-extrabold">
                {c.shortName} <span className="font-semibold">· {c.name}</span>
              </p>
              <p className="text-sm font-semibold">{c.summary}</p>
              <ul className="flex flex-col gap-1">
                {c.heats.map((h) => (
                  <li key={h.id} className="rounded border-2 border-[#111] px-2 py-1 text-base font-bold" data-testid="ladder-heat">
                    {h.bye ? copy.ladder.bye : `${h.number !== null ? `${copy.ladder.heatNumber(h.number)}: ` : ""}${copy.ladder.heatBox(h.size)}`}
                  </li>
                ))}
              </ul>
              <ul className="mt-auto flex flex-col gap-0.5 border-t-2 border-[#111] pt-2 text-sm font-bold">
                {c.routes.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            {i < columns.length - 1 ? (
              <span aria-hidden className="flex items-center text-2xl font-extrabold">
                {copy.ladder.arrow}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </figure>
  );
}
