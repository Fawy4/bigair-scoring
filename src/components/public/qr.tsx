import QRCode from "qrcode";
import { copy } from "@/lib/ui-copy";

/** A QR code for an address, drawn on the server as one small inline picture (no script, no extra request). */
export async function Qr({ url, size = 140, dark = false }: { url: string; size?: number; dark?: boolean }) {
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: dark ? { dark: "#000000", light: "#ffffff" } : { dark: "#111111", light: "#ffffff" } });
  return <div data-testid="qr" role="img" aria-label={copy.pub.share.qrAlt} style={{ width: size, height: size }} className="shrink-0 overflow-hidden rounded-lg bg-white [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
