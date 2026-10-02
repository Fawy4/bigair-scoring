import type { NextConfig } from "next";

// Logos and sponsor pictures come from the project's public storage: Next shrinks them (modern formats, the size the phone needs) instead of sending the original.
const storageHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // the admin pages read the releases file at request time, so it ships with them; Ask Sendbook reads the manual and its instructions while it answers
  // (Help itself is built ahead of time), so the Markdown ships with its server function
  outputFileTracingIncludes: { "/admin": ["./docs/RELEASES.md"], "/admin/**/*": ["./docs/RELEASES.md"], "/api/ask": ["./docs/manual/**/*.md"] },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: storageHost ? [{ protocol: "https", hostname: storageHost, pathname: "/storage/v1/object/public/**" }] : [],
  },
};

export default nextConfig;
