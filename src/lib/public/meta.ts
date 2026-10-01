import type { Metadata } from "next";
import type { OgText } from "./og";
import type { PublicSite } from "./types";

/** Open Graph and Twitter tags so WhatsApp (and others) show the event name, its logo and the heat or result. Absolute addresses, a 1200 × 630 picture. */
export function publicMetadata(origin: string, site: PublicSite, path: string, og: OgText, pageTitle?: string): Metadata {
  const url = `${origin}/e/${site.event.slug}${path}`;
  const image = og.image.kind === "heat" ? `${origin}/e/${site.event.slug}/og?kind=heat&id=${og.image.id}` : `${origin}/e/${site.event.slug}/og`;
  return {
    metadataBase: new URL(origin),
    title: pageTitle ?? og.title,
    description: og.description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: site.organisation.name, title: og.title, description: og.description, images: [{ url: image, width: 1200, height: 630, alt: og.title }] },
    twitter: { card: "summary_large_image", title: og.title, description: og.description, images: [image] },
  };
}
