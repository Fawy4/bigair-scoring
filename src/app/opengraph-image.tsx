import { ImageResponse } from "next/og";
import { getPlatformSettings } from "@/lib/platform/public-settings";

export const dynamic = "force-dynamic";
export const alt = "Live scores for kitesurfing Big Air";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link preview of the home page: the same dark card as the event pages' preview, with the product name and its one line. */
export default async function Image() {
  const settings = await getPlatformSettings();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0e0f", color: "#ffffff", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>{settings.productName}</div>
        <div style={{ display: "flex", fontSize: 40, color: "#c9d1d3" }}>{settings.tagline}</div>
      </div>
    ),
    size,
  );
}
