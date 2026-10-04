import type { NextConfig } from "next";

// Logos and sponsor pictures come from the project's public storage: Next shrinks them (modern formats, the size the phone needs) instead of sending the original.
const storageHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

/**
 * Fix 2, item 1(a): the public event pages and the big screen answer from the edge's shared cache for about 3 seconds, so 300 phones refreshing cost one render per
 * page per 3 s. Never for the simulation preview (its cookie), never for the Flag view (it must show a flag change within a second), the join page or registration.
 * The answer is exactly what a visitor may see: the database functions already leave out anything unpublished or held.
 */
export const PUBLIC_CACHE_CONTROL = "public, max-age=0, s-maxage=3, stale-while-revalidate=1";
const publicPages = ["/e/:slug", "/e/:slug/live", "/e/:slug/results", "/e/:slug/ladder", "/e/:slug/riders", "/e/:slug/riders/:entryId", "/e/:slug/placings", "/e/:slug/rules", "/e/:slug/leaderboards/:n", "/screen/:slug"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return publicPages.map((source) => ({
      source,
      missing: [{ type: "cookie" as const, key: "bigair_sim_preview" }],
      headers: [{ key: "Cache-Control", value: PUBLIC_CACHE_CONTROL }],
    }));
  },
  // the admin pages read the releases file at request time, so it ships with them
  outputFileTracingIncludes: { "/admin": ["./docs/RELEASES.md"], "/admin/**/*": ["./docs/RELEASES.md"] },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: storageHost ? [{ protocol: "https", hostname: storageHost, pathname: "/storage/v1/object/public/**" }] : [],
  },
};

export default nextConfig;
