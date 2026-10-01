import { ImageResponse } from "next/og";
import { loadCore } from "@/lib/public/page-data";
import { eventOg, heatOg } from "@/lib/public/og";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 630 };

/** The logo as a picture the card can draw: only from this project's own public storage, PNG or JPEG, small, within three seconds. Anything else is left out. */
async function logoData(url: string | null | undefined): Promise<string | null> {
  if (!url || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname) return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(png|jpeg)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The preview picture of a link to the event (1200 × 630): the logo, the event name, and the heat that is on or the latest result with its top riders. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const core = await loadCore(slug);
  if (!core) return new Response("Not found", { status: 404 });
  const { site, tt, tabs } = core;
  const wanted = req.nextUrl.searchParams.get("kind") === "heat" ? tabs.find((t) => t.id === req.nextUrl.searchParams.get("id")) : undefined;
  const og = wanted ? heatOg(site, wanted) : eventOg(site, tt, tabs);
  const heat = wanted ?? (og.image.kind === "heat" ? tabs.find((t) => t.id === (og.image as { id: string }).id) : undefined);
  const rows = heat?.state === "complete" ? heat.riders.slice(0, 3) : [];
  const logo = await logoData(site.branding.logoUrl ?? site.organisation.logo_url);
  const nameOf = (r: (typeof rows)[number]) => r.label?.secondary.find((x) => x.key === "name")?.text ?? r.label?.primary.text ?? "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0e0f", color: "#ffffff", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" height={120} style={{ height: 120, maxWidth: 320, objectFit: "contain", background: "#ffffff", borderRadius: 16, padding: 12 }} />
          ) : null}
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>{site.event.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 44, color: "#c9d1d3" }}>{heat ? heat.title : og.description}</div>
          {rows.map((r) => (
            <div key={r.entryId} style={{ display: "flex", justifyContent: "space-between", fontSize: 56, fontWeight: 700 }}>
              <div style={{ display: "flex" }}>{`${r.place}. ${nameOf(r)}`}</div>
              <div style={{ display: "flex" }}>{r.totalLabel ?? ""}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...SIZE, headers: { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=120" } },
  );
}
