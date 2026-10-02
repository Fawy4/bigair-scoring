import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { MANUAL_DIR } from "@/lib/manual/load";

// The manual's screenshots, served from docs/manual/img in the repository. Built as static files when the site is built.
export const dynamic = "force-static";
export const dynamicParams = false;

const IMG_DIR = path.join(MANUAL_DIR, "img");

export function generateStaticParams() {
  try {
    return readdirSync(IMG_DIR)
      .filter((f) => /^[a-z0-9-]+\.png$/.test(f))
      .map((name) => ({ name }));
  } catch {
    return [];
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-z0-9-]+\.png$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const file = readFileSync(path.join(IMG_DIR, name));
    return new Response(new Uint8Array(file), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
